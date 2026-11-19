// IP Plan-O-Matic: Network wizards: cloud hub-and-spoke and single-network templates, on-prem sites, peering, adding and splitting networks.
// One of the app's plain scripts (js/*.js): index.html loads them in order and they share one scope, so each can use
// what the ones before it define. Plain scripts, not modules, so a downloaded copy still opens from disk.
'use strict';

// =====================================================================
// Cloud hub-and-spoke templates (Azure, AWS, Google Cloud, Oracle Cloud)
// =====================================================================
// tplState[cloud]: { hub: { size, svcs: { id: mask | null } }, spokes: [{ name, size, svcs }], single: { name, svcs } }.
// size is 'auto' or a mask. tplLayout: 'single' (one network holding every service, the default) or 'hub'.
let tpl = TEMPLATES.azure;
let tplLayout = 'single';
const tplState = {};
const inRole = (x, role) => role === 'single' || x.role === role || x.role === 'both';
// Switching layout carries the choices over: single → hub sends hub services to the hub and the rest to the first
// spoke; hub → single merges the hub and the first spoke.
const tplSetLayout = (layout) => {
  const st = tplState[tpl.cloud];
  if (layout === tplLayout) return;
  const pick = (svcs, role) => Object.fromEntries(tpl.svcs.filter((x) => inRole(x, role)).map((x) => [x.id, svcs[x.id] ?? null]));
  if (layout === 'hub') {
    st.hub.svcs = pick(st.single.svcs, 'hub');
    if (!st.spokes.length) st.spokes.push(tplNewSpoke(1));
    st.spokes[0].svcs = pick(st.single.svcs, 'spoke');
    if (st.single.name.trim() && st.single.name !== tpl.net) st.spokes[0].name = st.single.name;
  } else {
    const sp = st.spokes[0] ? st.spokes[0].svcs : {};
    st.single.svcs = Object.fromEntries(tpl.svcs.map((x) => [x.id, sp[x.id] ?? st.hub.svcs[x.id] ?? null]));
    if (st.spokes[0] && st.spokes[0].name.trim() && !/^Spoke( workload)?$/i.test(st.spokes[0].name.trim())) st.single.name = st.spokes[0].name;
  }
  tplLayout = layout;
};
const tplDefaults = (role) => Object.fromEntries(tpl.svcs.filter((x) => inRole(x, role)).map((x) => [x.id, x.on ? x.rec : null]));
const tplNewSpoke = (i) => ({ name: i === 1 ? 'Spoke workload' : `Spoke ${i}`, size: 'auto', svcs: tplDefaults('spoke') });
// Smallest network (largest mask) that holds these subnets. Aligned power-of-two blocks packed largest first
// always fit when their total fits, so the total decides.
const azNeed = (reqs) => {
  const total = reqs.reduce((t, r) => t + size(r.mask), 0);
  return total ? 32 - Math.ceil(Math.log2(total)) : null;
};
const tplZones = () => (tpl.zones ? [...new Set($('azZones').value.split(/[\s,;]+/).map((z) => z.trim()).filter(Boolean))] : ['']);
const azCompute = () => {
  const errors = [], notes = [];
  const st = tplState[tpl.cloud];
  const sp = parseCidr($('azSpace').value);
  if (!sp || !/\//.test($('azSpace').value)) return { errors: ['Enter the address space as a network with a prefix length, like 10.0.0.0/16.'], notes };
  const zones = tplZones();
  if (tpl.zones && (zones.length < 1 || zones.length > 6)) return { errors: [`List 1 to 6 ${tpl.zoneWord}, like ${tpl.zoneDefault}.`], notes };
  const single = tplLayout === 'single';
  const vnets = single
    ? [{ role: 'single', label: st.single.name.trim().slice(0, 40) || tpl.net, cfg: st.single }]
    : [{ role: 'hub', label: 'Hub', cfg: st.hub }, ...st.spokes.map((x) => ({ role: 'spoke', label: x.name.trim().slice(0, 40) || 'Spoke', cfg: x }))];
  if (single && sp.mask < tpl.maxNet) return { errors: [`A ${tpl.net} can be /${tpl.maxNet} at most. Use a /${tpl.maxNet} or smaller address space.`], notes };
  const short = new Set();
  for (const v of vnets) {
    // One subnet per service, or per service and AZ.
    v.reqs = [];
    tpl.svcs.forEach((x, idx) => {
      const mask = v.cfg.svcs[x.id];
      if (!inRole(x, v.role) || mask == null) return;
      if (x.minAz && zones.length < x.minAz) short.add(x.label);
      (x.once ? [''] : zones).forEach((z, zi) => v.reqs.push({ svc: x, idx, zi, zone: z, mask, name: z ? `${x.name}-${z}` : x.name }));
    });
    v.reqs.sort((x, y) => x.mask - y.mask || x.idx - y.idx || x.zi - y.zi);
    const need = azNeed(v.reqs);
    const auto = v.role === 'hub' ? Math.min(23, need ?? 23) : Math.max(tpl.maxNet, Math.min(22, need == null ? 22 : need - 1));
    v.mask = single ? sp.mask : v.cfg.size === 'auto' ? auto : Number(v.cfg.size);
    if (need != null && need < tpl.maxNet) errors.push(`${v.label}: the subnets ticked need a /${need}, but a ${tpl.net} can be /${tpl.maxNet} at most. Untick some or make them smaller.`);
    else if (need != null && v.mask > need) errors.push(single
      ? `The subnets ticked need at least a /${need}, more than ${sp.cidr} holds. Use a bigger address space, or untick some or make them smaller.`
      : `${v.label} needs at least a /${need} for the subnets ticked.`);
  }
  for (const l of short) notes.push(`${l} needs subnets in at least two Availability Zones.`);
  if (errors.length) return { errors, notes };
  // Networks go in order (hub first), each on its own boundary.
  let cur = sp.addr;
  for (const v of vnets) { v.addr = Math.ceil(cur / size(v.mask)) * size(v.mask); cur = v.addr + size(v.mask); }
  if (cur - 1 > lastAddr(sp.addr, sp.mask) || vnets.some((v) => v.mask < sp.mask)) {
    const span = cur - sp.addr;
    return { errors: [`The hub and spokes need ${fmt(span)} addresses, more than ${sp.cidr} holds. Use at least a /${32 - Math.ceil(Math.log2(span))} address space, or make the ${tpl.net}s smaller.`], notes };
  }
  for (const v of vnets) {
    v.root = { c: null };
    v.taken = new Set();
    bestFit(v.root, v.addr, v.mask, v.reqs, () => false, v.taken);
  }
  return { errors, notes, vnets, sp };
};
const azPreview = () => {
  const res = azCompute();
  $('azApply').disabled = !!res.errors.length;
  const sum = $('azSum');
  sum.classList.toggle('err', !!res.errors.length);
  if (res.errors.length || !res.vnets) sum.textContent = res.errors.length === 1 ? 'Can’t apply yet: see the problem above' : `Can’t apply yet: see the ${res.errors.length} problems above`;
  else {
    const n = res.vnets.reduce((t, v) => t + v.reqs.length, 0);
    sum.textContent = `${res.vnets.length} ${tpl.net}${res.vnets.length === 1 ? '' : 's'} · ${n} subnet${n === 1 ? '' : 's'}`;
  }
  const notes = res.notes.length ? `<div class="msg show info">${res.notes.map(esc).join('<br>')}</div>` : '';
  if (res.errors.length || !res.vnets) { $('azOut').innerHTML = `<div class="msg show error">${res.errors.map(esc).join('<br>')}</div>` + notes; return res; }
  let html = notes;
  for (const v of res.vnets) {
    html += `<h4>${esc(v.label)} <span class="mono">${cidrStr(v.addr, v.mask)}</span></h4>`;
    if (!v.reqs.length) { html += '<div class="stat-line">No subnets ticked.</div>'; continue; }
    html += `<div class="table-wrap"><table><thead><tr><th>Subnet</th><th>Name</th>${tpl.zones ? `<th>${tpl.zoneCol}</th>` : ''}<th>For</th><th class="num">Usable</th></tr></thead><tbody>`;
    for (const r of [...v.reqs].sort((x, y) => x.addr - y.addr)) {
      html += `<tr><td class="mono"><b>${cidrStr(r.addr, r.mask)}</b></td><td class="mono">${esc(r.name)}</td>${tpl.zones ? `<td class="mono">${esc(r.zone)}</td>` : ''}<td>${esc(r.svc.label)}${r.svc.deleg ? ` <span class="tag muted">${esc(r.svc.deleg)}</span>` : ''}</td><td class="num mono">${fmt(hostInfo(r.addr, r.mask, tpl.cloud).hosts)}</td></tr>`;
    }
    html += '</tbody></table></div>';
    const free = freeLeavesOf(v.root, v.addr, v.mask, 32, (k) => v.taken.has(k));
    if (free.length) html += `<div class="stat-line">Left free: ${free.map((f) => `<code>${cidrStr(f.addr, f.mask)}</code>`).join(' ')}</div>`;
  }
  $('azOut').innerHTML = `<div class="az-plan">${html}</div>`;
  return res;
};
const azSizeSel = (cur, from, to, withAuto) => {
  const sel = document.createElement('select');
  if (withAuto) sel.add(new Option('Auto', 'auto'));
  for (let m = from; m <= to; m++) sel.add(new Option('/' + m, String(m)));
  sel.value = String(cur);
  return sel;
};
const azRender = () => {
  const st = tplState[tpl.cloud];
  const wrap = $('azVnets');
  wrap.innerHTML = '';
  const card = (title, cfg, role, spokeIdx) => {
    const box = document.createElement('div');
    box.className = 'az-vnet';
    const head = document.createElement('div');
    head.className = 'az-vnet-head';
    const h = document.createElement('h3');
    h.textContent = title;
    head.appendChild(h);
    if (role === 'spoke' || role === 'single') {
      const f = document.createElement('div'); f.className = 'field';
      const id = role === 'single' ? 'azNameSingle' : `azName${spokeIdx}`;
      f.innerHTML = `<label for="${id}">${role === 'single' ? tpl.net + ' name' : 'Spoke name'}</label>`;
      const inp = document.createElement('input');
      inp.type = 'text'; inp.id = id; inp.maxLength = 40; inp.spellcheck = false; inp.value = cfg.name; inp.style.width = '170px';
      inp.addEventListener('input', () => { cfg.name = inp.value; azPreview(); });
      f.appendChild(inp); head.appendChild(f);
    }
    const f2 = document.createElement('div'); f2.className = 'field';
    if (role === 'single') f2.hidden = true;   // the single network is the whole address space
    const sid = role === 'hub' ? 'azHubSize' : `azSize${spokeIdx}`;
    f2.innerHTML = `<label for="${sid}">${tpl.net} size</label>`;
    const ss = azSizeSel(cfg.size, tpl.maxNet, 28, true);
    ss.id = sid;
    ss.title = role === 'hub' ? 'Auto: a /23, or bigger if the ticked subnets need it' : `Auto: twice what the ticked subnets need (room to grow), at least a /22${tpl.maxNet > 8 ? ` and at most a /${tpl.maxNet}` : ''}`;
    ss.addEventListener('change', () => { cfg.size = ss.value; azPreview(); });
    f2.appendChild(ss); head.appendChild(f2);
    if (role === 'spoke' && st.spokes.length > 1) {
      const rm = document.createElement('button');
      rm.type = 'button'; rm.className = 'small'; rm.textContent = 'Remove spoke';
      rm.addEventListener('click', () => { st.spokes.splice(spokeIdx, 1); azRender(); });
      head.appendChild(rm);
    }
    box.appendChild(head);
    const list = document.createElement('div');
    list.className = 'az-svcs';
    for (const x of tpl.svcs.filter((y) => inRole(y, role))) {
      const row = document.createElement('div');
      row.className = 'az-svc';
      const lab = document.createElement('label');
      const cb = document.createElement('input');
      cb.type = 'checkbox'; cb.checked = cfg.svcs[x.id] != null;
      cb.dataset.svc = x.id;
      const txt = document.createElement('span');
      txt.innerHTML = `${esc(x.label)}<br><span class="nm mono">${esc(x.name)}${tpl.zones && !x.once ? `-&lt;${tpl.zoneCol.toLowerCase()}&gt;` : ''}${x.deleg ? ' · ' + esc(x.deleg) : ''}</span>`;
      lab.append(cb, txt);
      lab.title = (x.tip ? x.tip + '. ' : '') + `${x.soft ? 'Smallest offered' : 'Minimum'} /${x.min}, recommended /${x.rec}${tpl.zones && !x.once ? `, in each ${tpl.zoneOne}` : ''}`;
      const sel = azSizeSel(cfg.svcs[x.id] ?? x.rec, x.max ?? Math.max(16, x.rec - 3), x.min, false);
      sel.disabled = !cb.checked;
      sel.setAttribute('aria-label', `${x.label} subnet size`);
      sel.dataset.svc = x.id;
      cb.addEventListener('change', () => { cfg.svcs[x.id] = cb.checked ? Number(sel.value) : null; sel.disabled = !cb.checked; azPreview(); });
      sel.addEventListener('change', () => { cfg.svcs[x.id] = Number(sel.value); azPreview(); });
      row.append(lab, sel);
      if (x.doc) {
        const a = document.createElement('a');
        a.href = tpl.docBase + x.doc; a.target = '_blank'; a.rel = 'noopener'; a.textContent = 'docs';
        a.title = `${tpl.docName}: ${x.label} subnet requirements`;
        row.appendChild(a);
      } else {
        const gap = document.createElement('span');   // keeps the size menus lined up
        gap.textContent = 'docs'; gap.style.visibility = 'hidden'; gap.style.fontSize = '12px'; gap.setAttribute('aria-hidden', 'true');
        row.appendChild(gap);
      }
      list.appendChild(row);
    }
    box.appendChild(list);
    wrap.appendChild(box);
  };
  const single = tplLayout === 'single';
  $('azLayout').value = tplLayout;
  $('azLayout').options[0].textContent = `Single ${tpl.net}`;
  $('azTtl').textContent = single ? tpl.singleTitle : tpl.title;
  $('azSub').textContent = single ? tpl.singleSub : tpl.sub;
  $('azSpaceL').textContent = single ? `${tpl.net} address space` : 'Address space for the hub and spokes';
  $('azAddSpoke').textContent = single ? 'Convert to hub and spoke' : 'Add spoke';
  $('azAddSpoke').title = single ? `Move the shared ${tpl.hubWhat.replace(/^network: /, '')} into a hub ${tpl.net} and the rest into a spoke, keeping what you ticked` : `Add another spoke ${tpl.net}`;
  if (single) card(`${tpl.net} (all services)`, st.single, 'single');
  else {
    card(`Hub ${tpl.net} (shared ${tpl.hubWhat})`, st.hub, 'hub');
    st.spokes.forEach((x, i) => card(`Spoke ${tpl.net} ${i + 1} (workloads)`, x, 'spoke', i));
  }
  azPreview();
};
const openAz = (cloud = 'azure') => {
  tpl = TEMPLATES[cloud];
  if (!tplState[cloud]) {
    tplState[cloud] = { hub: { size: 'auto', svcs: tplDefaults('hub') }, spokes: [tplNewSpoke(1)], single: { name: TEMPLATES[cloud].net, svcs: null }, space: '10.0.0.0/16', zones: TEMPLATES[cloud].zoneDefault || '' };
    tplState[cloud].single.svcs = Object.fromEntries(TEMPLATES[cloud].svcs.map((x) => [x.id, x.on ? x.rec : null]));
    // Use the current base network as the address space when it's big enough to be one.
    if (state.blocks.length === 1 && state.mask <= 16) tplState[cloud].space = blockCidr(blk());
  }
  $('azSpace').value = tplState[cloud].space;
  $('azZonesF').hidden = !tpl.zones;
  if (tpl.zones) { $('azZonesL').textContent = tpl.zoneWord; $('azZones').value = tplState[cloud].zones; $('azZones').title = `Each subnet is made once per ${tpl.zoneOne}`; }
  $('azCloud').value = cloud;
  $('azReplace').hidden = !planInUse();
  azRender();
  const d = $('azDlg');
  if (d.open) return;
  if (typeof d.showModal === 'function') d.showModal(); else d.setAttribute('open', '');
};
// Something a template or import would replace: more than one network, any division, or any name or status.
const planInUse = () => state.blocks.length > 1 || !!state.root.c || Object.keys(state.meta).length > 0;
// The wizard button follows the Platform: the on-prem wizard on Standard, the Azure or AWS one on those clouds,
// and hidden on Google Cloud and Oracle, which have no wizard.
function tplSync() {
  const c = settings.cloud, b = $('tplBtn');
  const who = { azure: 'Azure', aws: 'AWS', gcp: 'Google Cloud', oci: 'Oracle Cloud' }[c];
  b.hidden = c !== 'std' && !who;
  b.lastChild.textContent = c === 'std' ? 'On-prem network wizard…' : `${who} subnet wizard…`;
  b.title = c === 'std'
    ? 'Tick the networks a site needs (management, servers, staff, Wi-Fi, voice, guest…) and get each one sized, named and given a VLAN ID. Applying it replaces the current IPv4 plan.'
    : `Pick the ${who} services you need and get a ${NET_WORD[c]}, or a hub and spokes, with a correctly sized subnet for each. Applying it replaces the current IPv4 plan.`;
}
$('tplBtn').addEventListener('click', () => (settings.cloud === 'std' ? openSite() : openAz(TEMPLATES[settings.cloud] ? settings.cloud : 'azure')));

// ---------- On-prem network wizard ----------
// Typical networks for a site. on: ticked to start with. Device counts and VLAN IDs are starting points to edit.
const SITE_PRESETS = [
  ['Network management', 30, 10, true, 'Switches, access points, UPSs and other network gear'],
  ['Servers', 50, 20, true],
  ['Staff (wired)', 100, 30, true],
  ['Staff Wi-Fi', 150, 40, true],
  ['Voice (VoIP phones)', 50, 50, true],
  ['Guest Wi-Fi', 100, 60, true, 'Internet only: keep it away from everything else'],
  ['Printers', 20, 70, false],
  ['IoT / building systems', 50, 80, false, 'HVAC, door access, sensors, smart TVs'],
  ['Security cameras', 30, 90, false],
  ['DMZ', 10, 100, false, 'Servers reachable from the internet'],
  ['Storage (iSCSI / NFS)', 10, 110, false],
  ['Hypervisor / vMotion', 10, 120, false],
  ['Out-of-band management', 20, 130, false, 'iDRAC, iLO, IPMI and console servers'],
  ['Lab / test', 50, 140, false],
  ['WAN / ISP link', 2, '', false, 'Point-to-point link to the ISP or another site'],
];
/** The on-prem wizard's rows, kept while the page is open. @type {{ on: any, name: any, hosts: any, vlan: any, tip: any }[] | null} */
let siteRows = null;
// The rows, starting from the presets the first time the wizard opens.
const siteRowsNow = () => siteRows || (siteRows = SITE_PRESETS.map(([name, hosts, vlan, on, tip]) => ({ name, hosts, vlan, on, tip: tip || '' })));
/** @type {{ fit: any, space: { addr: number, mask: number }, headroom: number } | null} */
let siteFit = null;
const siteReqs = () => siteRowsNow().map((r, idx) => ({ ...r, idx })).filter((r) => r.on)
  .map((r) => ({ name: r.name.trim() || `Network ${r.idx + 1}`, hosts: Number(r.hosts), vlan: String(r.vlan).trim() ? String(+r.vlan) : '', idx: r.idx, exact: Number(r.hosts) <= 2 }));
const siteRender = () => {
  $('siteBody').innerHTML = siteRowsNow().map((r, i) => `<tr data-i="${i}"${r.on ? '' : ' class="off"'}>` +
    `<td><input type="checkbox" class="site-on" aria-label="Use ${esc(r.name)}"${r.on ? ' checked' : ''}></td>` +
    `<td><input type="text" class="site-name" value="${esc(r.name)}" aria-label="Network name"${r.tip ? ` title="${esc(r.tip)}"` : ''}></td>` +
    `<td class="num"><input type="number" class="site-hosts" min="1" value="${esc(r.hosts)}" aria-label="Devices on ${esc(r.name)}"></td>` +
    `<td class="num"><input type="number" class="site-vlan" min="1" max="4094" value="${esc(r.vlan)}" aria-label="VLAN for ${esc(r.name)}" placeholder="none"></td>` +
    '<td class="site-cidr"></td></tr>').join('');
  siteCalc();
};
// Plan the ticked networks into the address space and show each one's subnet, or what's wrong.
const siteCalc = () => {
  siteFit = null;
  const cells = [...$('siteBody').querySelectorAll('tr')].map((tr) => tr.querySelector('.site-cidr'));
  cells.forEach((c) => { c.textContent = ''; c.classList.remove('err'); });
  const sum = $('siteSum'), bad = (msg) => { sum.textContent = msg; sum.classList.add('err'); $('siteApply').disabled = true; };
  sum.classList.remove('err');
  const sp = parseCidr($('siteSpace').value.trim());
  if (!sp) return bad('Enter the address space as a network with its prefix length, like 10.10.0.0/16.');
  const space = { addr: netAddr(sp.addr, sp.mask), mask: sp.mask };
  const clash = blockClash(space.addr, space.mask, state.active);
  if (clash) return bad(`${cidrStr(space.addr, space.mask)} overlaps ${blockCidr(clash)}, another base network in this plan.`);
  const reqs = siteReqs();
  for (const r of reqs) {
    if (!Number.isInteger(r.hosts) || r.hosts < 1) { cells[r.idx].textContent = 'Needs a device count'; cells[r.idx].classList.add('err'); return bad(`${r.name}: enter how many devices it will have.`); }
    if (r.vlan && !validVlan(r.vlan)) { cells[r.idx].textContent = 'VLAN 1–4094'; cells[r.idx].classList.add('err'); return bad(`${r.name}: a VLAN ID is 1–4094.`); }
  }
  if (!reqs.length) return bad('Tick at least one network.');
  const headroom = Math.max(0, Number($('siteHead').value) || 0);
  const run = (mask) => vlsmFit(reqs.map((r) => ({ ...r })), { headroom, minM: 30, mode: 'replace', network: space.addr, mask });
  const fit = run(space.mask);
  for (const r of fit.tooBig) { cells[r.idx].textContent = 'Too big for the space'; cells[r.idx].classList.add('err'); }
  for (const r of fit.failed) { cells[r.idx].textContent = 'Doesn’t fit'; cells[r.idx].classList.add('err'); }
  for (const r of fit.placed) cells[r.idx].textContent = `${cidrStr(r.addr, r.mask)}  (${fmt(hostInfo(r.addr, r.mask).hosts)} usable)`;
  if (fit.tooBig.length || fit.failed.length) {
    // Say how big the space would need to be.
    /** @type {number | null} */
    let need = null;
    for (let m = space.mask - 1; m >= 8 && need === null; m--) { const f = vlsmFit(reqs.map((r) => ({ ...r })), { headroom, minM: 30, mode: 'replace', network: 0, mask: m }); if (!f.tooBig.length && !f.failed.length) need = m; }
    return bad(`These don’t fit in ${cidrStr(space.addr, space.mask)}${need !== null ? `: it needs a /${need} or larger` : ''}. Use a bigger space, fewer devices or less headroom.`);
  }
  let smallest = space.mask;
  for (let m = space.mask + 1; m <= 30; m++) { const f = run(m); if (f.tooBig.length || f.failed.length) break; smallest = m; }
  const dupV = [...new Set(reqs.map((r) => r.vlan).filter((v, i, a) => v && a.indexOf(v) !== i))];
  const parts = [`${fit.placed.length} subnets use ${fmt(fit.needTotal)} of ${fmt(size(space.mask))} addresses (${((fit.needTotal / size(space.mask)) * 100).toFixed(1)}%)`];
  if (smallest > space.mask) parts.push(`they’d fit in a /${smallest}`);
  if (dupV.length) parts.push(`VLAN ${dupV.join(', ')} is used twice`);
  const same = space.addr === state.network && space.mask === state.mask;
  if (!same) parts.push(`the base network becomes ${cidrStr(space.addr, space.mask)}`);
  sum.textContent = parts.join('; ') + '.';
  $('siteApply').disabled = false;
  siteFit = { fit, space, headroom };
};
const openSite = () => {
  siteRowsNow();
  // Start from the current base network when it's big enough to hold a site; otherwise suggest a /16.
  $('siteSpace').value = state.mask <= 20 ? blockCidr(blk()) : '10.10.0.0/16';
  $('siteReplace').hidden = !(state.root.c || blockMetaKeys().length);
  siteRender();
  $('siteDlg').showModal();
};
$('siteBody').addEventListener('input', (e) => {
  const tr = e.target.closest('tr'), r = siteRowsNow()[+tr.dataset.i];
  if (e.target.classList.contains('site-on')) { r.on = e.target.checked; tr.classList.toggle('off', !r.on); }
  else if (e.target.classList.contains('site-name')) r.name = e.target.value;
  else if (e.target.classList.contains('site-hosts')) r.hosts = e.target.value;
  else if (e.target.classList.contains('site-vlan')) r.vlan = e.target.value;
  siteCalc();
});
for (const id of ['siteSpace', 'siteHead']) $(id).addEventListener('input', siteCalc);
$('siteAdd').addEventListener('click', () => {
  const used = new Set(siteRowsNow().map((r) => +r.vlan).filter(Boolean));
  let v = 150; while (used.has(v)) v += 10;
  siteRowsNow().push({ name: '', hosts: 20, vlan: v, on: true, tip: '' });
  siteRender();
  $('siteBody').lastElementChild.querySelector('.site-name').focus();
});
$('siteClose').addEventListener('click', () => $('siteDlg').close());
$('siteDlg').addEventListener('click', (e) => { if (e.target === $('siteDlg')) $('siteDlg').close(); });
$('siteApply').addEventListener('click', () => {
  siteCalc();
  if (!siteFit) return;
  const { fit, space } = siteFit;
  checkpoint();
  clearBlockMeta();
  if (space.addr !== state.network || space.mask !== state.mask) {
    const oldC = blockCidr(blk());
    state.network = space.addr; state.mask = space.mask;
    renamePeers(oldC, blockCidr(blk()));
  }
  state.root = fit.root;
  for (const r of fit.placed) {
    const k = cidrStr(r.addr, r.mask);
    setMeta(k, 'n', r.name);
    setMeta(k, 'v', r.vlan);
    setMeta(k, 's', 'used');
    setMeta(k, 'o', `${r.hosts} device${r.hosts > 1 ? 's' : ''} planned`);
  }
  $('siteDlg').close();
  syncControls(); update();
  showTab('plan');
  toast(`Applied ${fit.placed.length} subnets`, UNDO);
});
$('azCloud').addEventListener('change', () => openAz($('azCloud').value));
$('azSpace').addEventListener('input', () => { tplState[tpl.cloud].space = $('azSpace').value; azPreview(); });
$('azZones').addEventListener('input', () => { tplState[tpl.cloud].zones = $('azZones').value; azPreview(); });
$('azLayout').addEventListener('change', () => { tplSetLayout($('azLayout').value); azRender(); });
$('azAddSpoke').addEventListener('click', () => {
  if (tplLayout === 'single') { tplSetLayout('hub'); azRender(); return; }
  const st = tplState[tpl.cloud];
  // Next number whose default name isn't taken (spokes can be removed from the middle).
  let i = st.spokes.length + 1;
  while (st.spokes.some((x) => x.name.trim().toLowerCase() === tplNewSpoke(i).name.toLowerCase())) i++;
  st.spokes.push(tplNewSpoke(i));
  azRender();
});
$('azClose').addEventListener('click', () => $('azDlg').close());
$('azDlg').addEventListener('click', (e) => { if (e.target === $('azDlg')) $('azDlg').close(); });
$('azApply').addEventListener('click', () => {
  const res = azPreview();
  if (res.errors.length || !res.vnets) return;   // vnets is there whenever there are no errors
  const single = tplLayout === 'single';
  if (planInUse() && !confirm(`Replace the current IPv4 plan with this ${single ? tpl.net : 'hub and spokes'}?`)) return;
  checkpoint();
  const dual = $('azV6').checked;
  state.blocks = res.vnets.map((v) => {
    const b = mkBlock(v.addr, v.mask, tpl.cloud, v.label);
    b.root = v.root;
    if (dual) { b.v6 = true; if (b.cloud === 'azure') b.v6p = ulaPrefix(); }
    return b;
  });
  state.active = 0;
  state.meta = {};
  state.hosts = {};
  hostsChanged();
  // Hub and spoke peering to match; the Peering button changes it.
  const hubC = single ? '' : cidrStr(res.vnets[0].addr, res.vnets[0].mask);
  state.peers = single ? null : res.vnets.slice(1).map((v) => /** @type {[string, string]} */ ([hubC, cidrStr(v.addr, v.mask)]));
  state.po = { ...PEER_DEFAULTS, h: hubC };
  let n = 0;
  for (const v of res.vnets) for (const r of v.reqs) {
    const k = cidrStr(r.addr, r.mask);
    setMeta(k, 'n', r.name);
    setMeta(k, 'd', r.svc.id);
    setMeta(k, 'z', r.zone);
    setMeta(k, 's', 'used');
    setMeta(k, 'o', (r.svc.doc ? `Dedicated to ${r.svc.label}` : r.svc.label) + (r.svc.deleg ? ` (delegated to ${r.svc.deleg})` : ''));
    n++;
  }
  $('azDlg').close();
  if (tpl.zones && !visible.zone) showColumn('zone');
  syncControls();
  update();
  const sp = res.vnets.length - 1;
  toast(single ? `Applied a ${tpl.net} with ${n} subnets.` : `Applied a hub and ${sp} spoke${sp === 1 ? '' : 's'} with ${n} subnets. Switch ${tpl.net}s with the buttons above.`, UNDO);
});

// =====================================================================
// Peering wizard
// =====================================================================
const blockName = (b) => `${b.label ? b.label + ' ' : ''}${blockCidr(b)}`;
// Every pair of base networks on the same cloud (Azure or AWS), in plan order.
const eligiblePairs = () => {
  const bs = state.blocks.filter((b) => PEER_CLOUDS.includes(b.cloud));
  const out = [];
  for (let i = 0; i < bs.length; i++) for (let j = i + 1; j < bs.length; j++) if (bs[i].cloud === bs[j].cloud) out.push([bs[i], bs[j]]);
  return out;
};
const peerBoxes = () => /** @type {HTMLInputElement[]} */ ([...document.querySelectorAll('#peerPairs input[type=checkbox]')]);
const hasSvc = (b, test) => blockMetaKeys(b).some((k) => test(getMeta(k)));
const peerPreset = () => {
  const mode = $('peerMode').value, hub = $('peerHub').value;
  if (mode === 'custom') return;
  for (const cb of peerBoxes()) cb.checked = mode === 'mesh' || (mode === 'hub' && (cb.dataset.a === hub || cb.dataset.b === hub));
};
const peerSync = () => {
  const mode = $('peerMode').value;
  $('peerHubF').hidden = mode !== 'hub';
  // Each box was drawn for two base networks of the plan, so both are found.
  const chosen = peerBoxes().filter((cb) => cb.checked).map((cb) => /** @type {[Block, Block]} */ ([blockByCidr(cb.dataset.a || ''), blockByCidr(cb.dataset.b || '')]));
  const az = chosen.filter(([x]) => x.cloud === 'azure'), aws = chosen.filter(([x]) => x.cloud === 'aws');
  const hub = blockByCidr($('peerHub').value);
  const notes = [];
  if (az.length && $('peerGw').checked) {
    const gwHubs = new Set(az.map(([x]) => x).filter((x) => x === hub));
    if (!gwHubs.size) notes.push('Gateway transit works between the hub and its spokes: pick the hub that holds the gateway.');
    else if (!hasSvc(hub, (m) => m.n === 'GatewaySubnet' || m.d === 'gw')) notes.push(`Gateway transit needs a GatewaySubnet with a deployed VPN or ExpressRoute gateway in ${blockName(hub)}.`);
  }
  if (az.length > 1 && mode === 'hub') notes.push('Azure peering isn’t transitive: spokes reach each other only through the hub’s firewall or NVA (with route tables), or a direct peering.');
  if (aws.length && $('peerType').value === 'tgw') {
    for (const b of new Set(aws.flat())) if (!hasSvc(b, (m) => m.d === 'aws-tgw')) notes.push(`${blockName(b)} has no Transit Gateway attachment subnets, so the export attaches its first subnet in each zone. A /28 of its own in each AZ is recommended.`);
  }
  if (aws.length > 1 && $('peerType').value === 'pcx' && mode === 'hub') notes.push('VPC peering isn’t transitive: spokes can’t reach each other through the hub. Use a Transit Gateway or a full mesh for that.');
  $('peerMsg').className = notes.length ? 'msg show info' : 'msg';
  $('peerMsg').innerHTML = notes.map(esc).join('<br>');
};
const peerRender = (saved) => {
  const pairs = eligiblePairs();
  const box = $('peerPairs');
  box.innerHTML = '';
  if (!pairs.length) box.innerHTML = '<div class="stat-line">Peering needs two or more base networks on the same cloud. Set Platform to Azure VNet or AWS VPC on each one.</div>';
  for (const [x, y] of pairs) {
    const lab = document.createElement('label');
    lab.className = 'peer-pair';
    const cb = document.createElement('input');
    cb.type = 'checkbox';
    cb.dataset.a = blockCidr(x); cb.dataset.b = blockCidr(y);
    cb.checked = saved.has(`${cb.dataset.a}|${cb.dataset.b}`) || saved.has(`${cb.dataset.b}|${cb.dataset.a}`);
    cb.addEventListener('change', () => { $('peerMode').value = 'custom'; peerSync(); });
    const t = document.createElement('span');
    t.innerHTML = `<b>${esc(blockName(x))}</b> ⇄ <b>${esc(blockName(y))}</b> <span class="tag muted">${esc(CLOUDS[x.cloud].label)}</span>`;
    lab.append(cb, t);
    box.appendChild(lab);
  }
  const clouds = new Set(pairs.map(([x]) => x.cloud));
  $('peerAz').hidden = !clouds.has('azure');
  $('peerAws').hidden = !clouds.has('aws');
  $('peerGcp').hidden = !clouds.has('gcp');
  $('peerOci').hidden = !clouds.has('oci');
  $('peerSave').disabled = !pairs.length;
};
const openPeer = () => {
  const po = state.po;
  const bs = state.blocks.filter((b) => PEER_CLOUDS.includes(b.cloud));
  const hubSel = $('peerHub');
  hubSel.innerHTML = '';
  for (const b of bs) hubSel.add(new Option(blockName(b), blockCidr(b)));
  const labeled = bs.find((b) => /^hub$/i.test(b.label || ''));
  const ph = blockByCidr(po.h);
  const hub = ph && PEER_CLOUDS.includes(ph.cloud) ? po.h : labeled ? blockCidr(labeled) : bs[0] ? blockCidr(bs[0]) : '';
  if (hub) hubSel.value = hub;
  $('peerMode').value = state.peers ? po.m : 'hub';
  $('peerFwd').checked = !!po.f;
  $('peerGw').checked = !!po.g;
  $('peerType').value = po.t;
  $('peerRoutes').checked = !!po.r;
  peerRender(new Set((state.peers || []).map(([a, b]) => `${a}|${b}`)));
  peerPreset();   // hub / mesh / none follow the layout, so networks added since are included
  peerSync();
  const d = $('peerDlg');
  if (typeof d.showModal === 'function') d.showModal(); else d.setAttribute('open', '');
};
$('peerMode').addEventListener('change', () => { peerPreset(); peerSync(); });
$('peerHub').addEventListener('change', () => { peerPreset(); peerSync(); });
for (const id of ['peerFwd', 'peerGw', 'peerType', 'peerRoutes']) $(id).addEventListener('change', peerSync);
$('peerClose').addEventListener('click', () => $('peerDlg').close());
$('peerDlg').addEventListener('click', (e) => { if (e.target === $('peerDlg')) $('peerDlg').close(); });
$('peerSave').addEventListener('click', () => {
  const hub = $('peerHub').value, mode = $('peerMode').value;
  // Hub first in each pair, so gateway transit and routes know which side is the hub.
  const pairs = peerBoxes().filter((cb) => cb.checked).map((cb) => /** @type {[string, string]} */ (cb.dataset.b === hub ? [cb.dataset.b, cb.dataset.a] : [cb.dataset.a, cb.dataset.b]));
  checkpoint();
  state.peers = pairs;
  state.po = cleanPo({ m: mode, h: hub, f: $('peerFwd').checked ? 1 : 0, g: $('peerGw').checked ? 1 : 0, t: $('peerType').value, r: $('peerRoutes').checked ? 1 : 0 });
  $('peerDlg').close();
  update();
  toast(pairs.length ? `Saved ${pairs.length} peering${pairs.length === 1 ? '' : 's'}. The Terraform export includes them.` : 'Peering turned off', UNDO);
});

// =====================================================================
// Add a network; make separate networks out of one
// =====================================================================
const showDlg = (d) => { if (typeof d.showModal === 'function') d.showModal(); else d.setAttribute('open', ''); };
// Next free address space the size of the selected network, after the last one in the plan.
const suggestNet = () => {
  const b = blk(), sz = size(b.mask);
  let a = Math.max(...state.blocks.map((x) => lastAddr(x.network, x.mask) + 1));
  for (let i = 0; i < 4096; i++) {
    a = Math.ceil(a / sz) * sz;
    if (a + sz - 1 > 0xffffffff) return '';
    const c = blockClash(a, b.mask);
    if (!c) return cidrStr(a, b.mask);
    a = lastAddr(c.network, c.mask) + 1;
  }
  return '';
};
const openNetAdd = () => {
  const word = netWord();
  $('netTtl').textContent = `Add a ${word}`;
  $('netCidr').value = suggestNet();
  $('netName').value = '';
  $('netPlat').value = blk().cloud;
  clearMsg('netMsg');
  showDlg($('netDlg'));
  $('netName').focus();
};
$('netClose').addEventListener('click', () => $('netDlg').close());
$('netWizLink').addEventListener('click', () => { const c = $('netPlat').value === 'aws' ? 'aws' : 'azure'; $('netDlg').close(); openAz(c); });
$('netDlg').addEventListener('click', (e) => { if (e.target === $('netDlg')) $('netDlg').close(); });
$('netForm2').addEventListener('submit', (e) => {
  e.preventDefault();
  const raw = $('netCidr').value.trim(), p = parseCidr(raw);
  if (!p || !raw.includes('/')) { showMsg('netMsg', 'Enter the address space with its prefix length, like 10.1.0.0/16.', 'error'); return; }
  const clash = blockClash(p.addr, p.mask);
  if (clash) { showMsg('netMsg', `${p.cidr} overlaps ${blockName(clash)}. Networks in a plan can’t overlap.`, 'error'); return; }
  checkpoint();
  const nb = mkBlock(p.addr, p.mask, $('netPlat').value, $('netName').value.trim().slice(0, 40));
  state.blocks.push(nb);
  state.active = state.blocks.length - 1;
  // Keep the peering layout: a new network joins the hub, or every network in a full mesh, on the same cloud.
  let peered = '';
  if (state.peers && PEER_CLOUDS.includes(nb.cloud)) {
    const same = state.blocks.filter((b) => b !== nb && b.cloud === nb.cloud);
    const hub = blockByCidr(state.po.h);
    if (state.po.m === 'hub' && hub && hub.cloud === nb.cloud) { state.peers.push([state.po.h, p.cidr]); peered = ` and peered it with ${blockName(hub)}`; }
    else if (state.po.m === 'mesh' && same.length) { for (const b of same) state.peers.push([blockCidr(b), p.cidr]); peered = ` and peered it with the other ${same.length}`; }
  }
  $('netDlg').close();
  syncControls();
  update();
  toast(`Added ${p.cidr}${p.aligned ? '' : ` (from ${raw})`}${peered}`, UNDO);
});

let splitCands = [];
const openSplitNets = () => {
  const b = blk(), word = netWord();
  // Default size: the biggest subnets that have a name (often the regions or spokes), else halves.
  let def = null;
  const walk = (n, a, m) => {
    if (m > b.mask && getMeta(cidrStr(a, m)).n && (def === null || m < def)) def = m;
    if (n.c) { walk(n.c[0], a, m + 1); walk(n.c[1], a + size(m + 1), m + 1); }
  };
  walk(b.root, b.network, b.mask);
  const deepest = Math.min(30, Math.max(...collectLeaves(b).map((r) => r.mask)));
  const sel = $('splitSize');
  sel.innerHTML = '';
  for (let m = b.mask + 1; m <= deepest; m++) sel.add(new Option(`/${m}`, String(m)));
  sel.value = String(def !== null && def <= deepest ? def : b.mask + 1);
  $('splitTtl').textContent = `Make separate ${word === 'network' ? 'networks' : word + 's'}`;
  $('splitSub').textContent = `For when ${blockName(b)} is an address space holding several ${word}s, such as regions or spokes drawn as subnets. Each ticked piece becomes a ${word} of its own, keeping its subnets, names and statuses, so it can be peered. Unticked pieces are dropped from the plan. Undo puts everything back.`;
  clearMsg('splitMsg');
  renderSplitList();
  showDlg($('splitDlg'));
};
const renderSplitList = () => {
  const b = blk(), n = Number($('splitSize').value), word = netWord();
  const metaIn = (a, m) => Object.keys(state.meta).filter((k) => { const c = parseCidr(k); return c && c.mask >= m && inBlock(c.addr, a, m); });
  splitCands = [];
  const walk = (node, a, m) => {
    if (m === n || !node.c) { splitCands.push({ node, a, m, name: getMeta(cidrStr(a, m)).n || '', st: getMeta(cidrStr(a, m)).s || '', keys: metaIn(a, m) }); return; }
    walk(node.c[0], a, m + 1); walk(node.c[1], a + size(m + 1), m + 1);
  };
  walk(b.root, b.network, b.mask);
  // Suggest a name for unnamed pieces: the word their subnet names share that no other piece uses
  // ("uksouth" from uksouth-dmz-public, uksouth-AzureBastionSubnet, ...).
  const words = (c) => c.keys.map((k) => getMeta(k).n).filter(Boolean).map((n) => new Set(n.toLowerCase().split(/[^a-z0-9]+/).filter((w) => w.length > 2 && !/^\d+$/.test(w))));
  const sets = splitCands.map(words);
  splitCands.forEach((c, i) => {
    if (c.name) return;
    const count = new Map();
    for (const ws of sets[i]) for (const w of ws) count.set(w, (count.get(w) || 0) + 1);
    const own = [...count].filter(([w]) => !sets.some((ss, j) => j !== i && ss.some((ws) => ws.has(w))));
    own.sort((x, y) => y[1] - x[1] || y[0].length - x[0].length);
    if (own.length) c.guess = own[0][0];
  });
  const list = $('splitList');
  list.innerHTML = '';
  splitCands.forEach((c, i) => {
    const row = document.createElement('label');
    row.className = 'split-item';
    const cb = document.createElement('input');
    cb.type = 'checkbox';
    cb.checked = !!c.node.c || !!c.name;   // divided or named: a network; plain reserved / free space: not
    const cidr = document.createElement('span');
    cidr.className = 'mono';
    cidr.textContent = cidrStr(c.a, c.m);
    const name = document.createElement('input');
    name.type = 'text'; name.maxLength = 40; name.spellcheck = false;
    name.value = c.name || c.guess || '';
    if (!c.name && c.guess) name.title = 'Suggested from its subnet names';
    name.placeholder = `${word === 'network' ? 'Network' : word} ${i + 1}`;
    name.setAttribute('aria-label', `Name for ${cidrStr(c.a, c.m)}`);
    const what = document.createElement('span');
    what.className = 'what';
    const k = leafCount(c.node);
    what.textContent = c.node.c ? `${k} subnets` : c.st === 'reserved' ? 'reserved, not divided' : c.st === 'used' ? 'in use, not divided' : 'free space';
    row.append(cb, cidr, name, what);
    c.cb = cb; c.nameIn = name;
    list.appendChild(row);
  });
  // Service subnets named per region inside one address space get Azure's exact names once each region is its own VNet.
  const fixes = b.cloud === 'azure' ? splitFixes() : [];
  $('splitFixF').hidden = !fixes.length;
  if (fixes.length) $('splitFixTxt').textContent = `Use Azure’s exact names for ${fixes.length} service subnet${fixes.length > 1 ? 's' : ''} (${fixes[0].from} → ${fixes[0].to}${fixes.length > 1 ? ', …' : ''})`;
};
// Renames that become safe after the split: within each piece, one near-miss per required name, and no exact one already.
const splitFixes = () => {
  const out = [];
  for (const c of splitCands) {
    const by = {};
    for (const k of c.keys) { const n = getMeta(k).n, fx = azNear(n); if (fx) (by[fx.name] = by[fx.name] || []).push({ k, n }); }
    for (const [to, list] of Object.entries(by)) if (list.length === 1 && list[0].n !== to) out.push({ c, key: list[0].k, from: list[0].n, to });
  }
  return out;
};
$('splitSize').addEventListener('change', renderSplitList);
$('splitClose').addEventListener('click', () => $('splitDlg').close());
$('splitDlg').addEventListener('click', (e) => { if (e.target === $('splitDlg')) $('splitDlg').close(); });
$('splitApply').addEventListener('click', () => {
  const b = blk(), bi = state.active, word = netWord();
  const chosen = splitCands.filter((c) => c.cb.checked);
  if (!chosen.length) { showMsg('splitMsg', 'Tick at least one piece to make into a network.', 'error'); return; }
  checkpoint();
  if (b.cloud === 'azure' && $('splitFix').checked) for (const f of splitFixes()) if (f.c.cb.checked) setMeta(f.key, 'n', f.to);
  const made = chosen.map((c) => {
    const x = mkBlock(c.a, c.m, b.cloud, (c.nameIn.value.trim() || c.nameIn.placeholder).slice(0, 40));
    x.root = c.node;
    // The piece's own name is now the network's name; on a divided piece it wasn't visible anywhere anyway.
    const key = cidrStr(c.a, c.m);
    if (c.node.c) delete state.meta[key];
    return x;
  });
  for (const c of splitCands) if (!c.cb.checked) for (const k of c.keys) delete state.meta[k];
  state.blocks.splice(bi, 1, ...made);
  if (state.peers) state.peers = state.peers.filter((pr) => !pr.includes(blockCidr(b)));
  if (state.po.h === blockCidr(b)) state.po.h = '';
  state.active = bi;
  $('splitDlg').close();
  syncControls();
  update();
  const canPeer = made.length > 1 && PEER_CLOUDS.includes(b.cloud);
  toast(`Made ${made.length} ${word === 'network' ? 'network' : word}${made.length === 1 ? '' : 's'} from ${blockCidr(b)}.${canPeer ? ' Peer them next.' : ''}`,
    canPeer ? [UNDO, { label: 'Set up peering…', fn: () => openPeer() }] : UNDO);
});
// Buttons inside the warnings strip.
$('warnings').addEventListener('click', (e) => {
  const bt = e.target.closest('button[data-act]');
  if (!bt) return;
  if (bt.dataset.act === 'split') openSplitNets();
  else if (bt.dataset.act === 'rename') {
    const { key, name } = bt.dataset, old = getMeta(key).n || '';
    checkpoint(); setMeta(key, 'n', name); update();
    toast(`Renamed ${old || key} to ${name}`, UNDO);
  }
});
