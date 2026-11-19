// IP Plan-O-Matic: The VLSM tab: plan subnets by host count, best fit or in order, with zone layouts.
// One of the app's plain scripts (js/*.js): index.html loads them in order and they share one scope, so each can use
// what the ones before it define. Plain scripts, not modules, so a downloaded copy still opens from disk.
'use strict';

// =====================================================================
// VLSM tab
// =====================================================================
let vlsmPlan = null;
// Leaves of a tree no bigger than maxMask that aren't occupied.
const freeLeavesOf = (root, baseA, baseM, maxMask, occupied) => {
  const out = [];
  const walk = (n, a, m) => {
    if (n.c) { walk(n.c[0], a, m + 1); walk(n.c[1], a + size(m + 1), m + 1); return; }
    if (m <= maxMask && !occupied(cidrStr(a, m))) out.push({ addr: a, mask: m });
  };
  walk(root, baseA, baseM);
  return out;
};
// Best fit: reqs in order (largest first), each into the smallest free leaf that holds it, lowest address on ties.
// Sets r.addr (null when it doesn't fit), carves the tree and adds each placed subnet to taken.
const bestFit = (root, baseA, baseM, reqs, occupied, taken) => {
  const busy = (k) => taken.has(k) || occupied(k);
  for (const r of reqs) {
    let best = null;
    for (const f of freeLeavesOf(root, baseA, baseM, r.mask, busy)) if (!best || f.mask > best.mask || (f.mask === best.mask && f.addr < best.addr)) best = f;
    r.addr = best ? best.addr : null;
    if (best) { carve(root, baseA, baseM, best.addr, r.mask); taken.add(cidrStr(best.addr, r.mask)); }
  }
};
const cloneTree = (n) => (n.c ? { c: n.c.map(cloneTree) } : { c: null });
const updateVlsmBase = () => {
  // Default to filling free space when the base network already has planned subnets.
  if (!$('vlsmMode').dataset.touched) {
    $('vlsmMode').value = collectLeaves().some((r) => { const m = getMeta(r.key); return m.s || m.n || m.v; }) ? 'fill' : 'replace';
  }
  $('vlsmBase').textContent = cidrStr(state.network, state.mask);
  $('vlsmPlat').textContent = CLOUDS[settings.cloud].label;
  $('vlsmSmallF').hidden = settings.cloud !== 'std';
};
$('vlsmMode').addEventListener('change', () => { $('vlsmMode').dataset.touched = '1'; });
$('vlsmCloudEx').addEventListener('click', () => {
  $('vlsmIn').value = 'Public, 250\nPrivate app, 4000\nDatabase, 120';
  $('vlsmZones').value = 'us-east-1a, us-east-1b, us-east-1c';
  if (settings.cloud !== 'aws' || state.mask > 16) {
    if (!blockClash(aton('10.20.0.0'), 16, state.active)) {
      checkpoint();
      clearBlockMeta();
      const oldC = blockCidr(blk());
      state.network = aton('10.20.0.0'); state.mask = 16; state.root = { c: null };
      renamePeers(oldC, blockCidr(blk()));
      settings.cloud = 'aws';
      syncControls(); update(); updateVlsmBase();
      toast('Base network set to 10.20.0.0/16 on AWS for the example', UNDO);
    }
  }
});
$('vlsmExample').addEventListener('click', () => {
  $('vlsmIn').value = 'Servers, 200, 10\nStaff Wi-Fi, 120, 20\nGuest Wi-Fi, 60, 30\nVoIP, 50, 40\nPrinters, 20, 50\nManagement, 10, 99\nUplink to ISP, 2';
  if (state.mask > 22 && !blockClash(aton('10.10.0.0'), 22, state.active)) {
    checkpoint();
    clearBlockMeta();
    const oldC = blockCidr(blk());
    state.network = aton('10.10.0.0'); state.mask = 22; state.root = { c: null };
    renamePeers(oldC, blockCidr(blk()));
    syncControls(); update(); updateVlsmBase();
    toast('Base network set to 10.10.0.0/22 for the example');
  }
});
// Size each request for its host count (plus headroom) and place them largest first, each in the smallest free
// subnet that holds it. Shared by Auto-plan (VLSM) and the on-prem network wizard. reqs: [{ name, hosts, vlan, idx }].
// "fill" keeps the current tree and treats named, VLAN-tagged or in-use/reserved subnets as taken.
const vlsmFit = (reqs, { headroom, minM, mode, network, mask }) => {
  for (const r of reqs) {
    // not hosts * 1.1: 100 * 1.1 is 110.00000000000001. exact: no headroom (a point-to-point link is always 2).
    r.need = r.exact ? r.hosts : Math.ceil((r.hosts * (100 + headroom)) / 100);
    r.mask = null;
    for (let m = minM; m >= mask; m--) if (hostInfo(0, m).hosts >= r.need) { r.mask = m; break; }
  }
  const tooBig = reqs.filter((r) => r.mask === null);
  if (tooBig.length) return { tooBig, placed: [], failed: [], free: [], root: null, needTotal: 0, sorted: [] };
  const sorted = [...reqs].sort((a, b) => a.mask - b.mask || a.idx - b.idx);
  const root = mode === 'fill' ? cloneTree(state.root) : { c: null };
  const taken = new Set();
  const occupied = (k) => {
    if (taken.has(k)) return true;
    if (mode !== 'fill') return false;
    const m = getMeta(k);
    return !!(m.s || m.n || m.v);
  };
  bestFit(root, network, mask, sorted, occupied, taken);
  const placed = sorted.filter((r) => r.addr !== null), failed = sorted.filter((r) => r.addr === null);
  const free = freeLeavesOf(root, network, mask, 32, occupied);
  return { tooBig, placed, failed, free, root, sorted, needTotal: placed.reduce((t, r) => t + size(r.mask), 0) };
};
$('vlsmRun').addEventListener('click', () => {
  const out = $('vlsmOut');
  $('vlsmApply').hidden = true;
  clearMsg('vlsmMsg');
  vlsmPlan = null;
  const errors = [], reqs = [];
  $('vlsmIn').value.split('\n').forEach((raw, i) => {
    const l = raw.replace(/#.*$/, '').trim();
    if (!l) return;
    let name, hosts, vlan;
    const parts = l.split(/\s*[,;\t]\s*/);
    if (parts.length >= 2) [name, hosts, vlan] = parts;
    else { const m = /^(.*?)\s*(\d+)$/.exec(l); if (m) { name = m[1]; hosts = m[2]; } }
    const h = Number(hosts);
    if (!Number.isInteger(h) || h < 1) { errors.push(`Line ${i + 1}: “${l}” needs a host count, like “Sales, 50”.`); return; }
    if (vlan && !validVlan(vlan)) { errors.push(`Line ${i + 1}: VLAN “${vlan}” must be 1–4094.`); vlan = ''; }
    reqs.push({ name: (name || '').trim() || `Subnet ${reqs.length + 1}`, hosts: h, vlan: vlan ? String(+vlan) : '', idx: i });
  });
  if (!reqs.length) { out.innerHTML = `<div class="msg show error">${esc(errors[0] || 'Add at least one line, like “Sales, 50”.')}</div>`; return; }
  // Zones: plan every line once per availability zone ("Private us-east-1a", "Private us-east-1b", ...).
  const zones = [...new Set($('vlsmZones').value.split(/[\s,;]+/).map((z) => z.trim()).filter(Boolean))].slice(0, 16);
  if (zones.length) {
    const base = reqs.splice(0);
    for (const r of base) zones.forEach((z, zi) => reqs.push({ ...r, name: `${r.name} ${z}`, zone: z, idx: r.idx * 16 + zi }));
  }

  const headroom = Math.max(0, Number($('vlsmHead').value) || 0);
  const minM = settings.cloud === 'std' ? Number($('vlsmSmall').value) : CLOUDS[settings.cloud].min;
  const mode = $('vlsmMode').value;
  const fit = vlsmFit(reqs, { headroom, minM, mode, network: state.network, mask: state.mask });
  if (fit.tooBig.length) {
    out.innerHTML = `<div class="msg show error">${fit.tooBig.map((r) => `${esc(r.name)} needs ${fmt(r.need)} hosts, which is more than ${cidrStr(state.network, state.mask)} can hold.`).join('<br>')}</div>`;
    return;
  }
  const { root, placed, failed, free, needTotal } = fit;
  vlsmPlan = placed.length ? { placed, root, mode, active: state.active, base: cidrStr(state.network, state.mask), before: stateHash() } : null;

  let html = '';
  if (errors.length) html += `<div class="msg show error">${errors.map(esc).join('<br>')}</div>`;
  if (failed.length) {
    html += `<div class="msg show error">Doesn’t fit: ${failed.map((r) => `${esc(r.name)} (needs a /${r.mask})`).join(', ')}. ` +
      `${mode === 'fill' ? 'Free up space, switch to Replace the plan, use' : 'Try'} a bigger base network (smaller mask number) or less headroom.</div>`;
  }
  if (placed.length) {
    html += mode === 'fill'
      ? `<div class="stat-line">Places <b>${placed.length}</b> subnet${placed.length > 1 ? 's' : ''} using <b>${fmt(needTotal)}</b> addresses in free space. Existing subnets are kept.</div>`
      : `<div class="stat-line">Uses <b>${fmt(needTotal)}</b> of ${fmt(size(state.mask))} addresses (<b>${((needTotal / size(state.mask)) * 100).toFixed(1)}%</b>)${headroom ? `, with ${headroom}% growth headroom` : ''}.</div>`;
    html += `<div class="table-wrap"><table><thead><tr><th>Name</th><th>VLAN</th>${zones.length ? '<th>Zone</th>' : ''}<th class="num">Needs</th>`;
    html += '<th>Subnet</th><th class="num">Usable</th><th class="num">Spare</th><th>Usable range</th></tr></thead><tbody>';
    for (const r of placed) {
      const i = hostInfo(r.addr, r.mask);
      html += `<tr><td>${esc(r.name)}</td><td class="mono">${esc(r.vlan || '—')}</td>${zones.length ? `<td class="mono">${esc(r.zone)}</td>` : ''}<td class="num mono">${fmt(r.hosts)}</td><td class="mono"><b>${cidrStr(r.addr, r.mask)}</b></td><td class="num mono">${fmt(i.hosts)}</td><td class="num mono">${fmt(i.hosts - r.hosts)}</td><td class="mono">${i.uF === null ? '—' : `${ntoa(i.uF)} – ${ntoa(i.uL)}`}</td></tr>`;
    }
    html += '</tbody></table></div>';
    html += free.length
      ? `<div><span class="lbl">Left free</span><div class="codebox" style="margin-top:6px">${free.map((f) => `<code>${cidrStr(f.addr, f.mask)}</code>`).join('')}</div></div>`
      : '<div class="stat-line">No space left over.</div>';
  }
  out.innerHTML = html;
  $('vlsmApply').hidden = !vlsmPlan;
});
$('vlsmApply').addEventListener('click', () => {
  const plan = vlsmPlan;
  if (!plan) return;
  if (state.active !== plan.active || cidrStr(state.network, state.mask) !== plan.base || (plan.mode === 'fill' && stateHash() !== plan.before)) {
    showMsg('vlsmMsg', 'The plan changed since this was calculated. Click Plan it again.', 'error');
    $('vlsmApply').hidden = true;
    vlsmPlan = null;
    return;
  }
  if (plan.mode === 'replace' && (state.root.c || blockMetaKeys().length) && !confirm(`Replace the current plan for ${cidrStr(state.network, state.mask)} on the Plan IPv4 tab with this one?`)) return;
  checkpoint();
  state.root = plan.root;
  if (plan.mode === 'replace') clearBlockMeta();
  for (const r of plan.placed) {
    const k = cidrStr(r.addr, r.mask);
    setMeta(k, 'n', r.name);
    setMeta(k, 'v', r.vlan);
    setMeta(k, 'z', r.zone || '');
    setMeta(k, 's', 'used');
    setMeta(k, 'o', `Needs ${r.hosts} hosts`);
  }
  vlsmPlan = null;
  $('vlsmApply').hidden = true;
  if (plan.placed.some((r) => r.zone) && !visible.zone) showColumn('zone');
  update();
  showTab('plan');
  toast(`Applied ${plan.placed.length} subnets`, UNDO);
});
