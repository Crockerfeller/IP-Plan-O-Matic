// IP Plan-O-Matic: Compare plans: what changed between another version of a plan and this one.
// One of the app's plain scripts (js/*.js): index.html loads them in order and they share one scope, so each can use
// what the ones before it define. Plain scripts, not modules, so a downloaded copy still opens from disk.
'use strict';

// ---------- Compare plans ----------
// Another plan, read without changing the current one: load it, take its subnets, put the current plan back.
const planRows = () => ({
  blocks: state.blocks.map((b) => ({ cidr: blockCidr(b), addr: b.network, mask: b.mask, label: b.label || '', cloud: b.cloud })),
  rows: allRows().map((r) => ({ key: r.key, addr: r.addr, mask: r.mask, meta: { ...getMeta(r.key) } })),
});
const readOtherPlan = async (text) => {
  text = String(text || '').trim();
  if (!text) throw new Error('Pick a saved plan, or paste a plan link or JSON.');
  const keep = stateHash();
  let snap;
  try {
    if (text[0] === '{' || text[0] === '[') importText(text);   // a plan's JSON, or a cloud's network list
    else {
      let raw = text.includes('#') ? text.slice(text.indexOf('#') + 1) : text;
      try { raw = decodeURIComponent(raw); } catch (e) { /* use as is */ }
      const h = await fromUrlHash(raw);
      if (!loadFromHash(h)) throw new Error('That isn’t a plan link.');
    }
    snap = planRows();
  } finally { restore(keep); }
  return snap;
};
const CMP_FIELDS = [['n', 'name'], ['v', 'VLAN'], ['s', 'status'], ['z', 'zone'], ['o', 'notes'], ['d', 'cloud service']];
const stWord = (s) => (s === 'used' ? 'in use' : s === 'reserved' ? 'reserved' : 'free');
const cmpVal = (k, m) => (k === 's' ? stWord(m.s) : k === 'd' ? (SVC_BY_ID[m.d] ? SVC_BY_ID[m.d].label : '') : String(m[k] || ''));
const cmpDesc = (r) => [r.meta.n, r.meta.v ? `VLAN ${r.meta.v}` : '', stWord(r.meta.s)].filter(Boolean).join(' · ');
const netDesc = (x) => [x.label, CLOUDS[x.cloud].label].filter(Boolean).join(' · ');
// What changed from plan a (before) to plan b (after). Free, unnamed subnets only count when `all` is set,
// so carving up free space doesn't drown out the changes that matter.
const diffPlans = (a, b, all) => {
  const out = [];
  const keyed = (list) => new Map(list.map((x) => [x.cidr || x.key, x]));
  const aN = keyed(a.blocks), bN = keyed(b.blocks), A = keyed(a.rows), B = keyed(b.rows);
  for (const x of b.blocks) {
    const y = aN.get(x.cidr);
    if (!y) out.push({ kind: 'Network added', key: x.cidr, addr: x.addr, mask: x.mask, before: '', after: netDesc(x) });
    else if (y.label !== x.label || y.cloud !== x.cloud) out.push({ kind: 'Network changed', key: x.cidr, addr: x.addr, mask: x.mask, before: netDesc(y), after: netDesc(x) });
  }
  for (const y of a.blocks) if (!bN.has(y.cidr)) out.push({ kind: 'Network removed', key: y.cidr, addr: y.addr, mask: y.mask, before: netDesc(y), after: '' });
  const counts = (m) => all || !!(m.n || m.v || m.s || m.o || m.z || m.d);
  for (const r of b.rows) {
    const o = A.get(r.key);
    if (!o) continue;
    const d = CMP_FIELDS.filter(([k]) => cmpVal(k, o.meta) !== cmpVal(k, r.meta));
    if (d.length) out.push({ kind: 'Changed', key: r.key, addr: r.addr, mask: r.mask, before: d.map(([k, l]) => `${l}: ${cmpVal(k, o.meta) || '—'}`).join('; '), after: d.map(([k, l]) => `${l}: ${cmpVal(k, r.meta) || '—'}`).join('; ') });
  }
  // Subnets in only one plan. Subnets tile their network, so a subnet that's gone was either split into smaller
  // ones, joined into a bigger one, or left with its network.
  const onlyA = a.rows.filter((r) => !B.has(r.key)), onlyB = b.rows.filter((r) => !A.has(r.key)), paired = new Set();
  const label = (x) => x.key + (x.meta.n ? ` (${x.meta.n})` : '');
  for (const r of onlyA) {
    const kids = onlyB.filter((x) => x.mask > r.mask && inBlock(x.addr, r.addr, r.mask));
    if (!kids.length || kids.reduce((s, x) => s + size(x.mask), 0) !== size(r.mask)) continue;
    paired.add(r.key); kids.forEach((k) => paired.add(k.key));
    if (counts(r.meta) || kids.some((k) => counts(k.meta))) out.push({ kind: 'Split', key: r.key, addr: r.addr, mask: r.mask, before: cmpDesc(r), after: kids.map(label).join(', ') });
  }
  for (const r of onlyB) {
    if (paired.has(r.key)) continue;
    const parts = onlyA.filter((x) => !paired.has(x.key) && x.mask > r.mask && inBlock(x.addr, r.addr, r.mask));
    if (!parts.length || parts.reduce((s, x) => s + size(x.mask), 0) !== size(r.mask)) continue;
    paired.add(r.key); parts.forEach((p) => paired.add(p.key));
    if (counts(r.meta) || parts.some((p) => counts(p.meta))) out.push({ kind: 'Joined', key: r.key, addr: r.addr, mask: r.mask, before: parts.map(label).join(', '), after: cmpDesc(r) });
  }
  for (const r of onlyA) if (!paired.has(r.key) && counts(r.meta)) out.push({ kind: 'Removed', key: r.key, addr: r.addr, mask: r.mask, before: cmpDesc(r), after: '' });
  for (const r of onlyB) if (!paired.has(r.key) && counts(r.meta)) out.push({ kind: 'Added', key: r.key, addr: r.addr, mask: r.mask, before: '', after: cmpDesc(r) });
  return out.sort((x, y) => x.addr - y.addr || x.mask - y.mask || x.kind.localeCompare(y.kind));
};
/** The last comparison, for Copy. @type {{ changes: any[], name: string } | null} */
let cmpLast = null;
const fillCmpSaved = () => {
  const sel = $('cmpSaved'), plans = readPlans() || [];
  sel.innerHTML = '<option value="">Compare with a saved plan…</option>' + plans.map((p, i) => `<option value="${i}">${esc(p.name)}</option>`).join('');
  sel.disabled = !plans.length;
  if (!plans.length) sel.options[0].textContent = 'No saved plans yet';
};
const runCompare = async (text, name) => {
  const out = $('cmpOut');
  $('cmpCopy').hidden = true;
  let other;
  try { other = await readOtherPlan(text); } catch (e) { out.innerHTML = `<div class="msg show error">${esc(e.message || 'That plan couldn’t be read.')}</div>`; return; }
  const changes = diffPlans(other, planRows(), $('cmpAll').checked);
  cmpLast = { changes, name };
  const by = (k) => changes.filter((c) => c.kind === k).length;
  const parts = ['Added', 'Removed', 'Changed', 'Split', 'Joined'].map((k) => /** @type {[string, number]} */ ([k, by(k)])).filter(([, n]) => n).map(([k, n]) => `${fmt(n)} ${k.toLowerCase()}`);
  const nets = changes.filter((c) => c.kind.startsWith('Network')).length;
  if (nets) parts.unshift(`${nets} network change${nets === 1 ? '' : 's'}`);
  let html = `<div class="stat-line">From <b>${esc(name)}</b> to the current plan: ${changes.length ? parts.join(', ') : 'no differences'}${changes.length || $('cmpAll').checked ? '.' : ' in named, VLAN-tagged or in-use subnets. Tick “Include free, unnamed subnets” to see changes to free space too.'}</div>`;
  if (changes.length) {
    html += `<div class="table-wrap"><table class="cmp"><thead><tr><th>Change</th><th>Subnet</th><th>Before</th><th>After</th></tr></thead><tbody>${changes.map((c) =>
      `<tr class="k-${c.kind.split(' ').pop().toLowerCase()}"><td>${esc(c.kind)}</td><td class="mono">${esc(c.key)}</td><td>${esc(c.before)}</td><td>${esc(c.after)}</td></tr>`).join('')}</tbody></table></div>`;
    $('cmpCopy').hidden = false;
  }
  out.innerHTML = html;
};
const cmpMarkdown = () => {
  if (!cmpLast) return '';
  const cell = (v) => String(v || '').replace(/\|/g, '\\|');
  return [`Changes from ${cmpLast.name} to the current plan:`, '', '| Change | Subnet | Before | After |', '|---|---|---|---|',
    ...cmpLast.changes.map((c) => `| ${cell(c.kind)} | ${cell(c.key)} | ${cell(c.before)} | ${cell(c.after)} |`)].join('\n');
};
$('cmpRun').addEventListener('click', () => {
  const t = $('cmpIn').value.trim();
  runCompare(t, t[0] === '{' || t[0] === '[' ? 'the pasted JSON' : 'the pasted link');
});
$('cmpSaved').addEventListener('change', () => {
  const p = (readPlans() || [])[Number($('cmpSaved').value)];
  if ($('cmpSaved').value !== '' && p) runCompare(p.hash, `saved plan “${p.name}”`);
  $('cmpSaved').value = '';
});
$('cmpAll').addEventListener('change', () => { if (cmpLast) $('cmpRun').click(); });
$('cmpCopy').addEventListener('click', async () => toast((await copyText(cmpMarkdown())) ? 'Copied as Markdown' : 'Couldn’t copy'));
