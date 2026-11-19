// IP Plan-O-Matic: Saved plans, tabs and theme, the build number and update checks, and start-up. Loaded last.
// One of the app's plain scripts (js/*.js): index.html loads them in order and they share one scope, so each can use
// what the ones before it define. Plain scripts, not modules, so a downloaded copy still opens from disk.
'use strict';

// =====================================================================
// Saved plans (browser storage)
// =====================================================================
const PLANS_KEY = 'subnetPlanner.plans';
const DEFAULT_HASH = '192.168.0.0/24/1.0';
/** @type {string | null} */
let currentPlanId = null;
try { currentPlanId = sessionStorage.getItem('subnetPlanner.planId'); } catch (e) { /* ignore */ }
const readPlans = () => {
  try {
    const v = JSON.parse(localStorage.getItem(PLANS_KEY) || '[]');
    return Array.isArray(v) ? v.filter((x) => x && typeof x.hash === 'string' && typeof x.name === 'string') : [];
  } catch (e) { return null; }
};
const writePlans = (list) => {
  try { localStorage.setItem(PLANS_KEY, JSON.stringify(list)); return true; }
  catch (e) { showMsg('plansMsg', 'Couldn’t save: this browser is blocking storage (private mode?) or it is full. Use Copy link or Export instead.', 'error'); return false; }
};
const newId = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
// Backups. Saved plans live only in this browser's storage, which the browser may clear (Safari does for a site not
// visited in 7 days, unless it's installed). So: ask the browser to keep it, and nudge an export when plans have
// changed since the last one.
const BACKUP_KEY = 'subnetPlanner.backedUp';
const lastBackup = () => { try { return Number(localStorage.getItem(BACKUP_KEY)) || 0; } catch (e) { return 0; } };
let kept = false;   // the browser agreed to keep this site's storage (navigator.storage.persist)
const askToKeep = async () => {
  try {
    if (!navigator.storage || !navigator.storage.persist) return;
    kept = (await navigator.storage.persisted()) || (await navigator.storage.persist());
  } catch (e) { /* not offered here */ }
};
try { if (navigator.storage && navigator.storage.persisted) navigator.storage.persisted().then((v) => { kept = v; }, () => {}); } catch (e) { /* ignore */ }
const renderBackup = (list) => {
  const box = $('plansBackup'), txt = $('plansBackupTxt');
  if (!list || !list.length) { box.hidden = true; return; }
  const at = lastBackup(), stale = list.filter((x) => (x.updated || 0) > at).length;
  const risk = kept ? '' : ' This browser can clear them, for example Safari after 7 days without a visit.';
  box.hidden = false;
  box.classList.toggle('done', !stale);
  txt.textContent = !stale ? `All saved plans backed up ${when(at)}.`
    : !at ? `Your saved plans aren’t backed up yet: they live only in this browser.${risk} Back them up to a file.`
      : `${fmt(stale)} saved plan${stale === 1 ? '' : 's'} changed since your last backup on ${when(at)}.${risk}`;
};
const setCurrentPlan = (id) => {
  currentPlanId = id;
  try { if (id) sessionStorage.setItem('subnetPlanner.planId', id); else sessionStorage.removeItem('subnetPlanner.planId'); } catch (e) { /* ignore */ }
};
// "10.0.0.0/16 +2" from a stored hash, without loading it.
const planSummary = (h) => {
  const [n, m, , blob] = String(h).split('/');
  let more = 0, v6p = '';
  try { const x = blob ? JSON.parse(b64d(blob)) : {}; more = Array.isArray(x.b) ? x.b.length : 0; v6p = x.v6 && x.v6.p && x.v6.p !== V6_DEFAULT ? x.v6.p : ''; } catch (e) { /* ignore */ }
  return `${n}/${m}${more ? ` +${more} more` : ''}${v6p ? ` · ${v6p}` : ''}`;
};
const when = (t) => {
  const d = new Date(t);
  return isNaN(d.getTime()) ? '' : d.toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' });
};
const openPlanHash = (h) => {
  checkpoint();
  loadFromHash(h);
  syncControls();
  update();
  renderV6();
  if (!$('tab-export').hidden) renderExport();
  if (!$('tab-vlsm').hidden) updateVlsmBase();
};
const renderPlans = () => {
  const list = readPlans();
  const body = $('plansBody');
  body.innerHTML = '';
  renderBackup(list);
  if (list === null) { showMsg('plansMsg', 'Saved plans aren’t available because this browser is blocking storage. Use Copy link or Export instead.', 'error'); return; }
  if (!list.length) { body.innerHTML = '<tr><td colspan="3" class="empty">No saved plans yet. Name this one above and click Save.</td></tr>'; return; }
  const cur = stateHash();
  for (const pl of [...list].sort((a, b) => (b.updated || 0) - (a.updated || 0))) {
    const tr = document.createElement('tr');
    if (pl.id === currentPlanId) tr.classList.add('current');
    const nameTd = document.createElement('td');
    const inp = document.createElement('input');
    inp.type = 'text'; inp.className = 'cell-input'; inp.value = pl.name; inp.maxLength = 80;
    inp.setAttribute('aria-label', 'Rename plan ' + pl.name);
    inp.title = 'Click to rename';
    inp.addEventListener('change', () => {
      const name = inp.value.trim();
      if (!name) { inp.value = pl.name; return; }
      const all = readPlans() || [];
      const it = all.find((x) => x.id === pl.id);
      if (it) { it.name = name; writePlans(all); }
    });
    nameTd.appendChild(inp);
    tr.appendChild(nameTd);
    const det = document.createElement('td');
    const sum = document.createElement('div');
    sum.className = 'mono';
    sum.textContent = planSummary(pl.hash);
    const t = document.createElement('div');
    t.className = 'when';
    t.textContent = when(pl.updated) + (pl.hash === cur ? ' · open now' : (pl.id === currentPlanId ? ' · unsaved changes' : ''));
    det.append(sum, t);
    tr.appendChild(det);
    const acts = document.createElement('td');
    const box = document.createElement('div');
    box.className = 'acts';
    const fresh = () => (readPlans() || []).find((x) => x.id === pl.id) || pl; // picks up renames made in this list
    const btn = (label, title, fn, cls = 'small') => {
      const b = document.createElement('button');
      b.type = 'button'; b.className = cls; b.textContent = label; b.title = title;
      b.addEventListener('click', fn);
      box.appendChild(b);
    };
    btn('Open', 'Open this plan (your current work can be undone back)', () => {
      const f = fresh();
      openPlanHash(f.hash);
      setCurrentPlan(pl.id);
      $('plansDlg').close();
      toast(`Opened “${f.name}”`, UNDO);
    }, 'small primary');
    btn('Save here', 'Overwrite this saved plan with what’s on screen now', () => {
      if (pl.hash !== cur && !confirm(`Overwrite “${fresh().name}” with the current plan?`)) return;
      const all = readPlans() || [];
      const it = all.find((x) => x.id === pl.id);
      if (!it) return;
      it.hash = stateHash(); it.updated = Date.now();
      if (writePlans(all)) { setCurrentPlan(pl.id); showMsg('plansMsg', `Saved “${it.name}”.`, 'ok'); renderPlans(); }
    });
    btn('Duplicate', 'Save a copy of this plan', () => {
      const all = readPlans() || [];
      const f = fresh();
      all.push({ id: newId(), name: `${f.name} (copy)`.slice(0, 80), hash: f.hash, updated: Date.now() });
      if (writePlans(all)) renderPlans();
    });
    btn('Delete', 'Delete this saved plan', () => {
      if (!confirm(`Delete “${fresh().name}”? This can’t be undone.`)) return;
      const all = (readPlans() || []).filter((x) => x.id !== pl.id);
      if (writePlans(all)) { if (pl.id === currentPlanId) setCurrentPlan(null); renderPlans(); }
    });
    acts.appendChild(box);
    tr.appendChild(acts);
    body.appendChild(tr);
  }
};
$('plansBtn').addEventListener('click', () => {
  clearMsg('plansMsg');
  const list = readPlans() || [];
  const cur = list.find((x) => x.id === currentPlanId);
  $('planName').value = cur ? cur.name : '';
  renderPlans();
  if (typeof $('plansDlg').showModal === 'function') $('plansDlg').showModal(); else $('plansDlg').setAttribute('open', '');
  $('planName').focus();
});
$('plansClose').addEventListener('click', () => $('plansDlg').close());
$('plansDlg').addEventListener('click', (e) => { if (e.target === $('plansDlg')) $('plansDlg').close(); });
$('planSaveForm').addEventListener('submit', (e) => {
  e.preventDefault();
  clearMsg('plansMsg');
  const name = $('planName').value.trim();
  if (!name) { showMsg('plansMsg', 'Give the plan a name first.', 'error'); $('planName').focus(); return; }
  const all = readPlans();
  if (all === null) { renderPlans(); return; }
  const same = all.find((x) => x.name.toLowerCase() === name.toLowerCase());
  if (same && !confirm(`A plan called “${same.name}” already exists. Overwrite it?`)) return;
  const h = stateHash();
  let id;
  if (same) { same.hash = h; same.updated = Date.now(); same.name = name; id = same.id; }
  else { id = newId(); all.push({ id, name, hash: h, updated: Date.now() }); }
  if (writePlans(all)) { setCurrentPlan(id); showMsg('plansMsg', `Saved “${name}”.`, 'ok'); askToKeep().then(renderPlans); renderPlans(); }
});
$('planNew').addEventListener('click', () => {
  openPlanHash(DEFAULT_HASH);
  setCurrentPlan(null);
  $('planName').value = '';
  $('plansDlg').close();
  toast('Started a new plan', UNDO);
});
const exportPlans = () => {
  const list = readPlans() || [];
  if (!list.length) { showMsg('plansMsg', 'There are no saved plans to export yet.', 'info'); return; }
  const stamp = new Date();
  download(`ip-plan-o-matic-plans-${stamp.toISOString().slice(0, 10)}.json`, JSON.stringify({ format: 'ip-plan-o-matic-plans', version: 1, exported: stamp.toISOString(), plans: list }, null, 2), 'application/json');
  try { localStorage.setItem(BACKUP_KEY, String(stamp.getTime())); } catch (e) { /* ignore */ }
  showMsg('plansMsg', `Backed up ${fmt(list.length)} plan${list.length === 1 ? '' : 's'}. Import… brings them back, here or on another device.`, 'ok');
  renderBackup(list);
};
$('plansExport').addEventListener('click', exportPlans);
$('plansBackupBtn').addEventListener('click', exportPlans);
$('plansImport').addEventListener('change', () => {
  const f = $('plansImport').files[0];
  if (!f) return;
  f.text().then((t) => {
    $('plansImport').value = '';
    let incoming;
    try { const j = JSON.parse(t); incoming = Array.isArray(j) ? j : j.plans; } catch (e) { incoming = null; }
    if (!Array.isArray(incoming)) { showMsg('plansMsg', 'That file isn’t a saved-plans export from IP Plan-O-Matic.', 'error'); return; }
    const all = readPlans() || [];
    let added = 0, skipped = 0;
    for (const x of incoming) {
      if (!x || typeof x.hash !== 'string' || typeof x.name !== 'string' || !/^[\d.]+\/\d+/.test(x.hash)) { skipped++; continue; }
      if (all.some((y) => y.hash === x.hash && y.name === x.name)) { skipped++; continue; }
      all.push({ id: all.some((y) => y.id === x.id) || !x.id ? newId() : String(x.id), name: x.name.slice(0, 80), hash: x.hash, updated: Number(x.updated) || Date.now() });
      added++;
    }
    if (writePlans(all)) { showMsg('plansMsg', `Imported ${fmt(added)} plan${added === 1 ? '' : 's'}${skipped ? `, skipped ${fmt(skipped)} (duplicates or unreadable)` : ''}.`, 'ok'); renderPlans(); }
  });
});

// =====================================================================
// Tabs and theme
// =====================================================================
const TABS = ['plan', 'vlsm', 'tools', 'export', 'v6', 'learn'];
const showTab = (t) => {
  if (!TABS.includes(t)) t = 'plan';
  for (const x of TABS) {
    $('tab-' + x).hidden = x !== t;
    $('tb-' + x).setAttribute('aria-selected', String(x === t));
    $('tb-' + x).tabIndex = x === t ? 0 : -1;
  }
  try { localStorage.setItem('subnetPlanner.tab', t); } catch (e) { /* ignore */ }
  if (t === 'export') renderExport();
  if (t === 'vlsm') updateVlsmBase();
  if (t === 'tools') { runInfo(); fillCmpSaved(); }
  if (t === 'v6') v6PlanDefaults();
};
for (const x of TABS) $('tb-' + x).addEventListener('click', () => showTab(x));
/** @type {HTMLElement} */ (document.querySelector('nav.tabs')).addEventListener('keydown', (e) => {
  if (e.key !== 'ArrowRight' && e.key !== 'ArrowLeft') return;
  const cur = TABS.findIndex((x) => $('tb-' + x).getAttribute('aria-selected') === 'true');
  const next = TABS[(cur + (e.key === 'ArrowRight' ? 1 : TABS.length - 1)) % TABS.length];
  showTab(next);
  $('tb-' + next).focus();
});

const root = document.documentElement;
try {
  const t = localStorage.getItem('subnetPlanner.theme');
  if (t === 'light' || t === 'dark') root.dataset.theme = t;
} catch (e) { /* ignore */ }
$('themeBtn').addEventListener('click', () => {
  const current = root.dataset.theme ||
    (matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light');
  const next = current === 'dark' ? 'light' : 'dark';
  root.dataset.theme = next;
  try { localStorage.setItem('subnetPlanner.theme', next); } catch (e) { /* ignore */ }
});

// ---------- Build number, new-build notice and Check for updates ----------
// The deploy (tools/build_site.py, run by GitHub Actions) writes the commit hash and date into BUILD and publishes
// version.json next to the page. A copy that wasn't built that way, such as a git clone, keeps the placeholders:
// it is a dev build, with no build number and no update checks (git pull updates it).
const BUILD = { sha: '%%BUILD_SHA%%', date: '%%BUILD_DATE%%' };
const STAMPED = /^[0-9a-f]{40}$/.test(BUILD.sha);
const REPO = 'Crockerfeller/IP-Plan-O-Matic';
const SITE = 'https://crockerfeller.github.io/IP-Plan-O-Matic/';
const ZIP_URL = SITE + 'IP-Plan-O-Matic.zip';
const OFFICIAL = location.hostname === 'crockerfeller.github.io';
const short = (sha) => sha.slice(0, 7);
const RELOAD_TITLE = $('reloadBtn').title;
/** A newer build on the server, once one is seen. @type {{ sha: string, date: string } | null} */
let newBuild = null;

// The build number above Reload and in the footer; Reload turns green when a newer build is on the server.
const showBuild = () => {
  const el = $('buildNo'), rb = $('reloadBtn'), ver = $('ver');
  el.innerHTML = STAMPED ? `<span class="bn-word">Build </span>${short(BUILD.sha)}` : 'dev';
  el.title = !STAMPED ? 'Development copy: not built by the deploy, so it has no build number'
    : `Build ${short(BUILD.sha)} from ${BUILD.date} is loaded` + (newBuild ? `. Build ${short(newBuild.sha)} from ${newBuild.date} is available.` : '');
  el.hidden = false;
  const a = document.createElement('a');
  a.href = STAMPED ? `https://github.com/${REPO}/commit/${BUILD.sha}` : `https://github.com/${REPO}/commits/main`;
  a.textContent = STAMPED ? `Build ${short(BUILD.sha)} · ${BUILD.date}` : 'Dev build';
  a.title = STAMPED ? 'The commit this page was built from' : 'This copy wasn’t built by the deploy, so it has no build number';
  ver.replaceChildren(a);
  // The problem form gets the build number filled in.
  if (STAMPED) $('bugLink').href = `https://github.com/${REPO}/issues/new?template=bug.yml&build=${encodeURIComponent('Build ' + short(BUILD.sha) + ' · ' + BUILD.date)}`;
  ver.hidden = false;
  el.classList.toggle('ready', !!newBuild);
  rb.classList.toggle('ready', !!newBuild);
  rb.querySelector('.btn-txt').textContent = newBuild ? 'Update app' : 'Reload app';
  rb.title = newBuild ? `Build ${short(newBuild.sha)} (${newBuild.date}) is ready. Update the app to use it. Your plan is kept.` : RELOAD_TITLE;
};

// version.json is a few dozen bytes. cache: 'no-store' skips the browser cache (and sw.js passes such requests
// straight to the network); the throwaway ?t= skips GitHub's CDN, which may otherwise keep it for 10 minutes.
const getVersion = async (base) => {
  const url = new URL('version.json', base);
  url.searchParams.set('t', String(Date.now()));
  const res = await fetch(url, { cache: 'no-store' });
  if (!res.ok) throw new Error(String(res.status));
  const v = await res.json();
  if (!v || !/^[0-9a-f]{40}$/.test(v.sha)) throw new Error('bad version.json');
  return v;
};

// Newer build on the server this page came from: check every 30 minutes while the tab is visible, when it comes
// back into view (at most once a minute) and when the browser comes back online.
const CHECK_EVERY = 30 * 60e3, RECHECK_ON_RETURN = 60e3;
let lastCheck = 0, checking = false;
const checkBuild = async () => {
  if (newBuild || checking) return;
  checking = true; lastCheck = Date.now();
  try {
    const v = await getVersion(location.href);
    if (v.sha !== BUILD.sha) { newBuild = v; showBuild(); }
  } catch (e) { /* offline, or no version.json where this copy is served: try again later */ } finally { checking = false; }
};
if (STAMPED && (location.protocol === 'https:' || location.protocol === 'http:')) {
  setInterval(() => { if (!document.hidden) checkBuild(); }, CHECK_EVERY);
  document.addEventListener('visibilitychange', () => { if (!document.hidden && Date.now() - lastCheck > RECHECK_ON_RETURN) checkBuild(); });
  addEventListener('online', checkBuild);
}
showBuild();

// Check for updates: for downloaded copies. Compares this build with the hosted site's version.json (GitHub Pages
// allows cross-origin reads) and offers the zip the deploy builds. The hosted site is always current, so it has no link.
const checkUpdates = async () => {
  if (!STAMPED) { toast('This is a development copy. If you cloned it with git, run “git pull” to update it.'); return; }
  const b = $('updBtn');
  b.textContent = ' · Checking…';
  try {
    const v = await getVersion(SITE);
    if (v.sha === BUILD.sha) { toast(`You have the latest version (build ${short(v.sha)}, ${v.date}).`); return; }
    if (confirm(`A newer version of IP Plan-O-Matic is available: build ${short(v.sha)} from ${v.date}. You have build ${short(BUILD.sha)} from ${BUILD.date}.\n\nDownload the new version as a .zip?`)) {
      const a = document.createElement('a');
      a.href = ZIP_URL;
      document.body.appendChild(a); a.click(); a.remove();
    }
  } catch (e) {
    toast('Couldn’t reach the IP Plan-O-Matic site to check for updates. Try again when you’re online.');
  } finally {
    b.textContent = ' · Check for updates';
  }
};
$('updBtn').hidden = OFFICIAL;
$('updBtn').addEventListener('click', (e) => { e.preventDefault(); checkUpdates(); });

// Reload: save the plan now (not 300 ms from now), pick up a newer service worker, then reload. The app page
// is fetched network-first, so online this loads the latest version; offline it reloads the cached app.
// The plan comes back from the address bar.
$('reloadBtn').addEventListener('click', async () => {
  const btn = $('reloadBtn');
  btn.disabled = true; btn.classList.add('busy');
  if (document.activeElement && document.activeElement !== document.body) /** @type {HTMLElement} */ (document.activeElement).blur();   // commit a half-typed edit
  clearTimeout(hashTimer); writeHash();
  try { await hashWritten; } catch (e) { /* ignore */ }
  // Cap the whole service-worker step: getRegistration() itself waits while a first install is still caching.
  const swStep = (async () => {
    const reg = 'serviceWorker' in navigator ? await navigator.serviceWorker.getRegistration() : null;
    if (reg) await reg.update();
  })().catch(() => { /* offline or no service worker */ });
  await Promise.race([swStep, new Promise((r) => setTimeout(r, 3000))]);
  location.reload();
});

// Tip button: X Money has no public "send to @handle" link, so copy the handle and open the profile.
for (const el of document.querySelectorAll('.js-xmoney')) el.addEventListener('click', () => {
  copyText('@wangooroo').then((ok) => toast(ok ? 'Copied @wangooroo. In X: Money → Send → paste' : 'Send to @wangooroo in X Money'));
});

// =====================================================================
// Boot
// =====================================================================
window.addEventListener('hashchange', async () => {
  const h = hashText();
  if (h && h !== lastHash) {
    const before = stateHash();
    if (await loadFromLocation()) { if (undoStack[undoStack.length - 1] !== before) undoStack.push(before); redoStack.length = 0; updUndo(); syncControls(); render(); renderV6(); }
  }
});
(async () => {
  let restored = false;
  if (!(await loadFromLocation())) {
    try {
      const h = localStorage.getItem('subnetPlanner.current');
      if (h && h !== DEFAULT_HASH && loadFromHash(h)) restored = true;
    } catch (e) { /* ignore */ }
  }
  syncControls();
  update();
  renderV6();
  if (restored) {
    toast('Restored your last plan', { label: 'Start new', fn: () => { openPlanHash(DEFAULT_HASH); setCurrentPlan(null); } });
  }
  let startTab = 'plan';
  try { startTab = localStorage.getItem('subnetPlanner.tab') || 'plan'; } catch (e) { /* ignore */ }
  showTab(startTab);
  // ?wizard=azure or ?wizard=aws (the guides link here): open the service-subnet wizard for that cloud.
  // The parameter is dropped from the address bar so a reload or a shared plan link doesn't reopen it.
  // ?tab=v6 (or another tab name; the IPv6 guides link here): open on that tab. Dropped from the address bar too.
  const qs = new URLSearchParams(location.search);
  const wiz = qs.get('wizard'), tabQ = qs.get('tab');
  if (wiz || tabQ) { try { history.replaceState(null, '', location.pathname + location.hash); } catch (e) { /* ignore */ } }
  if (tabQ && TABS.includes(tabQ)) showTab(tabQ);
  if (wiz === 'azure' || wiz === 'aws') {
    showTab('plan');
    openAz(wiz);
  }
  document.documentElement.dataset.ready = '1';
})();
/* Offline support: register the service worker (https or localhost only) */
if ('serviceWorker' in navigator && (location.protocol === 'https:' || ['localhost', '127.0.0.1'].includes(location.hostname))) {
  addEventListener('load', () => { navigator.serviceWorker.register('sw.js').catch(() => { /* offline support is optional */ }); });
}
