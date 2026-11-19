// IP Plan-O-Matic: Import: cloud CLI JSON, CSV and address lists into the plan.
// One of the app's plain scripts (js/*.js): index.html loads them in order and they share one scope, so each can use
// what the ones before it define. Plain scripts, not modules, so a downloaded copy still opens from disk.
'use strict';

// A cloud service from an import: its id ("bastion", "aws-tgw") or its label ("Azure Bastion").
const azIdFrom = (v) => {
  const t = String(v ?? '').trim();
  if (!t) return '';
  if (SVC_BY_ID[t]) return t;
  const hit = SVCS.find((x) => x.label.toLowerCase() === t.toLowerCase());
  return hit ? hit.id : '';
};
// ---------- Import from the clouds: the JSON their command-line tools print ----------
// One paste can hold several JSON documents (AWS VPCs, then subnets): split them at the top level.
const jsonDocs = (text) => {
  const docs = [];
  let depth = 0, start = -1, inStr = false, escp = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (inStr) { if (escp) escp = false; else if (ch === '\\') escp = true; else if (ch === '"') inStr = false; continue; }
    if (ch === '"') inStr = true;
    else if (ch === '{' || ch === '[') { if (depth++ === 0) start = i; }
    else if (ch === '}' || ch === ']') { if (--depth === 0) docs.push(JSON.parse(text.slice(start, i + 1))); if (depth < 0) throw new Error('bad'); }
    else if (depth === 0 && !/\s/.test(ch)) throw new Error('bad');
  }
  if (depth) throw new Error('bad');
  return docs;
};
const lastSeg = (s) => String(s || '').split('/').filter(Boolean).pop() || '';
// Returns { defs, entries, source, guessed } or null when the JSON isn't from a cloud CLI.
const cloudJson = (docs) => {
  const nets = new Map();   // network id → { cloud, label, cidrs: [] }
  const entries = [];
  let source = '';
  const net = (id, cloud, label) => { if (!nets.has(id)) nets.set(id, { cloud, label: '', cidrs: [] }); const n = nets.get(id); if (label && !n.label) n.label = label; return n; };
  const sub = (cidr, f) => { const c = parseCidr(String(cidr || '')); if (c && c.addr === netAddr(c.addr, c.mask)) entries.push({ ...c, s: 'used', ...f }); };
  const items = (d) => (Array.isArray(d) ? d : d && typeof d === 'object' ? [d] : []);
  for (const doc of docs) {
    // AWS: aws ec2 describe-vpcs / describe-subnets (whole output, or just the list)
    const vpcs = doc && doc.Vpcs ? doc.Vpcs : items(doc).filter((x) => x && x.VpcId && x.CidrBlock && !x.SubnetId);
    const awsSubs = doc && doc.Subnets ? doc.Subnets : items(doc).filter((x) => x && x.SubnetId && x.CidrBlock);
    const awsName = (x) => ((x.Tags || []).find((t) => t.Key === 'Name') || {}).Value || '';
    for (const v of vpcs) {
      source = 'AWS';
      const n = net(v.VpcId, 'aws', awsName(v) || v.VpcId);
      const extra = (v.CidrBlockAssociationSet || []).filter((a) => !a.CidrBlockState || a.CidrBlockState.State === 'associated').map((a) => a.CidrBlock);
      for (const c of [v.CidrBlock, ...extra]) if (c && !n.cidrs.includes(c)) n.cidrs.push(c);
    }
    for (const s of awsSubs) {
      source = 'AWS';
      net(s.VpcId, 'aws');
      sub(s.CidrBlock, { n: awsName(s), z: s.AvailabilityZone, o: [s.SubnetId, s.VpcId].filter(Boolean).join(' · '), net: s.VpcId });
    }
    // Azure: az network vnet list / show (subnets included), or az network vnet subnet list
    for (const v of items(doc).filter((x) => x && x.addressSpace && Array.isArray(x.addressSpace.addressPrefixes))) {
      source = 'Azure';
      const id = v.id || v.name, n = net(id, 'azure', v.name);
      for (const c of v.addressSpace.addressPrefixes) if (!n.cidrs.includes(c)) n.cidrs.push(c);
      for (const s of v.subnets || []) for (const c of s.addressPrefixes || [s.addressPrefix]) sub(c, { n: s.name, z: '', o: v.location ? `${v.name} · ${v.location}` : v.name, net: id });
    }
    for (const s of items(doc).filter((x) => x && !x.addressSpace && (x.addressPrefix || x.addressPrefixes) && /\/virtualNetworks\//i.test(x.id || ''))) {
      source = 'Azure';
      // The filter above matched /virtualNetworks/, so exec finds it.
      const vn = /** @type {RegExpExecArray} */ (/\/virtualNetworks\/([^/]+)/i.exec(s.id))[1], id = s.id.replace(/\/subnets\/.*$/i, '');
      net(id, 'azure', vn);
      for (const c of s.addressPrefixes || [s.addressPrefix]) sub(c, { n: s.name, o: vn, net: id });
    }
    // Google Cloud: gcloud compute networks subnets list --format=json (secondary ranges too, e.g. GKE pods)
    for (const s of items(doc).filter((x) => x && x.ipCidrRange && x.network)) {
      source = 'Google Cloud';
      const id = s.network;
      net(id, 'gcp', lastSeg(s.network));
      sub(s.ipCidrRange, { n: s.name, z: lastSeg(s.region), o: lastSeg(s.network), net: id });
      for (const r of s.secondaryIpRanges || []) sub(r.ipCidrRange, { n: `${s.name}-${r.rangeName}`, z: lastSeg(s.region), o: `Secondary range of ${s.name}`, net: id });
    }
    // Oracle Cloud: oci network vcn list / subnet list ({"data": [...]})
    for (const x of items(doc && doc.data ? doc.data : [])) {
      if (x['vcn-id'] && x['cidr-block']) {
        source = 'Oracle Cloud';
        net(x['vcn-id'], 'oci');
        sub(x['cidr-block'], { n: x['display-name'], z: x['availability-domain'] || '', o: x['display-name'] ? '' : x.id, net: x['vcn-id'] });
      } else if (x.id && /ocid1\.vcn\./.test(x.id)) {
        source = 'Oracle Cloud';
        const n = net(x.id, 'oci', x['display-name']);
        for (const c of x['cidr-blocks'] || [x['cidr-block']]) if (c && !n.cidrs.includes(c)) n.cidrs.push(c);
      }
    }
  }
  if (!source) return null;
  // A network whose address space wasn't in the paste (subnets only, or Google Cloud, whose VPCs have none) gets
  // the smallest block that covers its subnets.
  const defs = [];
  let guessed = 0;
  for (const [id, n] of nets) {
    let cidrs = n.cidrs.map((c) => parseCidr(c)).filter(Boolean);
    if (!cidrs.length) {
      const mine = entries.filter((e) => e.net === id);
      if (!mine.length) continue;
      cidrs = [supernet(mine)];
      guessed++;
    }
    cidrs.forEach((c, i) => defs.push({ c: { addr: c.addr, mask: c.mask }, tree: null, cloud: n.cloud, label: String((n.label || '') + (cidrs.length > 1 ? ` (${i + 1})` : '')).slice(0, 40) }));
  }
  defs.sort((a, b) => a.c.addr - b.c.addr || a.c.mask - b.c.mask);
  return { defs, entries, source, guessed };
};
// ---------- Import from NetBox and phpIPAM: their CSV exports and their REST API's JSON ----------
// The hierarchy becomes the plan: a prefix that isn't inside another one in the file is a base network (a container
// names it), a container inside one is a named group, and the rest are subnets. Both tools keep a prefix's name in
// its description.
const IPAM_STATUS = { active: 'used', reserved: 'reserved', deprecated: 'reserved', container: 'container' };
// "10", "Servers (10)", "VLAN 10" or a VLAN object from the API → "10". A name with no number stays a name.
const ipamVlan = (v) => {
  if (v && typeof v === 'object') return v.vid != null ? { vid: String(v.vid), name: '' } : { vid: '', name: String(v.name || '') };
  const t = String(v ?? '').trim();
  const m = /^(\d{1,4})$/.exec(t) || /\((\d{1,4})\)\s*$/.exec(t) || /^vlan\s*(\d{1,4})\b/i.exec(t);
  return { vid: m ? m[1] : '', name: m ? '' : t };
};
// Rows as { prefix, mask?, desc, comments, status, vlan } → { defs, entries, source, notes }, the shape cloudJson returns.
const ipamPlan = (rows, source) => {
  let v6 = 0, dup = 0;
  const seen = new Map();
  for (const r of rows) {
    const raw = String(r.prefix ?? '').trim();
    if (raw.includes(':')) { v6++; continue; }
    const hasMask = r.mask != null && String(r.mask).trim() !== '';
    if (!raw.includes('/') && !hasMask) continue;   // a bare address isn't a prefix
    const mk = String(r.mask ?? '').trim();   // 24, or 255.255.255.0
    const c = parseCidr(raw.includes('/') ? raw : mk.includes('.') ? `${raw} ${mk}` : `${raw}/${mk}`);
    if (!c || !c.aligned) continue;
    if (seen.has(c.cidr)) { dup++; continue; }   // the same prefix in another VRF: keep the first
    const st = String((r.status && typeof r.status === 'object' ? r.status.value : r.status) || '').trim().toLowerCase();
    const vl = ipamVlan(r.vlan);
    // phpIPAM falls back to the subnet itself when it has no description: that's not a name.
    const desc = String(r.desc ?? '').trim(), name = desc === c.cidr || desc === raw ? '' : desc;
    const notes = [String(r.comments ?? '').trim(), vl.name ? `VLAN ${vl.name}` : '', st === 'deprecated' ? `Deprecated in ${source}` : ''].filter(Boolean).join('. ');
    seen.set(c.cidr, { c, name, vid: vl.vid, notes, status: IPAM_STATUS[st] || '' });
  }
  const all = [...seen.values()];
  if (!all.length) throw new Error(`No IPv4 prefixes found in the ${source} ${v6 ? 'data (IPv6 prefixes are skipped)' : 'data'}.`);
  // A prefix is inside another when one of its supernets is in the file. Checking the 32 possible supernets keeps
  // this fast for big exports.
  const inside = (c) => { for (let m = c.mask - 1; m >= 0; m--) if (seen.has(cidrStr(netAddr(c.addr, m), m))) return true; return false; };
  const roots = all.filter((x) => !inside(x.c));
  const MAX_ROOTS = 256;
  if (roots.length > MAX_ROOTS) throw new Error(`That ${source} data has ${roots.length} top-level prefixes, each of which would be a base network here (at most ${MAX_ROOTS}). Export one site, VRF or container at a time.`);
  const defs = roots.map((x) => ({ c: { addr: x.c.addr, mask: x.c.mask }, tree: null, cloud: settings.cloud, label: x.name.slice(0, 40) }))
    .sort((a, b) => a.c.addr - b.c.addr);
  // A container only names its base network (or its group); every other prefix becomes a subnet with its details.
  const entries = all.filter((x) => !(x.status === 'container' && roots.includes(x)))
    .map((x) => ({ ...x.c, n: x.name, v: x.vid, o: x.notes, s: x.status === 'container' ? '' : x.status }));
  const notes = [v6 ? `Skipped ${v6} IPv6 prefix${v6 === 1 ? '' : 'es'}` : '', dup ? `skipped ${dup} duplicate${dup === 1 ? '' : 's'} (the same prefix in another VRF)` : ''].filter(Boolean);
  return { defs, entries, source, guessed: 0, ipam: true, notes };
};
// A NetBox or phpIPAM CSV, from its header: NetBox has a Prefix column and no Name; phpIPAM has Subnet and Mask.
const ipamCsv = (recs) => {
  if (!recs.length) return null;
  const hdr = recs[0].map((h) => String(h).trim().toLowerCase());
  const col = (...names) => hdr.findIndex((h) => names.includes(h));
  const pick = (r, i) => (i >= 0 ? r[i] : '');
  const pi = col('prefix'), si = col('subnet'), mi = col('mask', 'netmask', 'subnet mask', 'bitmask'), ni = col('name');
  const source = pi >= 0 && ni < 0 ? 'NetBox' : si >= 0 && mi >= 0 && ni < 0 ? 'phpIPAM' : '';
  if (!source) return null;
  const di = col('description'), oi = col('comments', 'comment', 'notes'), sti = col('status'), vi = col('vlan', 'vlan_vid', 'vid', 'vlan id', 'vlan number');
  const rows = recs.slice(1).filter((r) => r.some((v) => String(v).trim())).map((r) => ({
    prefix: pick(r, source === 'NetBox' ? pi : si), mask: source === 'phpIPAM' ? pick(r, mi) : '',
    desc: pick(r, di), comments: pick(r, oi), status: pick(r, sti), vlan: pick(r, vi),
  }));
  return ipamPlan(rows, source);
};
// The REST APIs: NetBox's /api/ipam/prefixes/ ({ results: [...] }) and phpIPAM's /api/<app>/subnets/ ({ data: [...] }).
// phpIPAM's API gives VLANs as its own internal ids, not VLAN numbers, so those aren't carried over.
const ipamJson = (docs) => {
  const items = docs.flatMap((d) => (Array.isArray(d) ? d : d && Array.isArray(d.results) ? d.results : d && Array.isArray(d.data) ? d.data : []));
  const nb = items.filter((x) => x && typeof x.prefix === 'string');
  if (nb.length) return ipamPlan(nb.map((x) => ({ prefix: x.prefix, desc: x.description, comments: x.comments, status: x.status, vlan: x.vlan })), 'NetBox');
  const pi = items.filter((x) => x && typeof x.subnet === 'string' && x.mask != null && String(x.isFolder ?? '0') !== '1');   // the API sends "0" / "1"
  if (pi.length) return ipamPlan(pi.map((x) => ({ prefix: x.subnet, mask: x.mask, desc: x.description })), 'phpIPAM');
  return null;
};
const importText = (text) => {
  text = String(text || '').replace(/^\uFEFF/, '').trim();   // a byte-order mark from Excel or Notepad
  if (!text) throw new Error('Nothing to import.');
  // What the text holds. Plans and CLI output are JSON from outside, so their parts stay loosely typed (any).
  /** @type {{ addr: number, mask: number } | null} */
  let base = null;
  /** @type {{ cloud: string, gw: string } | null} */
  let set = null;
  /** @type {any} */ let tree = null;
  /** @type {any} */ let v6data = null;
  /** @type {any} */ let defs = null;
  /** @type {any} */ let peering = null;
  /** @type {any} */ let cloud;   // set below: cloud CLI output, or NetBox / phpIPAM data
  let hosts = {};
  const entries = [];
  if (text[0] === '{' || text[0] === '[') {
    let docs;
    try { docs = jsonDocs(text); } catch (e) { throw new Error('That JSON couldn’t be read.', { cause: e }); }
    cloud = cloudJson(docs) || ipamJson(docs);
    if (!cloud && (docs.length !== 1 || Array.isArray(docs[0]))) throw new Error('That JSON isn’t a plan from here, a network list from AWS, Azure, Google Cloud or Oracle Cloud, or prefixes from NetBox or phpIPAM.');
  } else cloud = ipamCsv(parseCsv(text));
  if (cloud) {
    entries.push(...cloud.entries);
    defs = cloud.defs;
    if (!defs.length) throw new Error(`No networks found in the ${cloud.source} output.`);
  } else if (text[0] === '{') {
    const j = jsonDocs(text)[0];
    if (j.base) base = parseCidr(j.base);
    if (j.platform && CLOUDS[j.platform]) set = { cloud: j.platform, gw: j.gateway === 'last' ? 'last' : 'first' };
    for (const s of j.subnets || []) {
      const c = parseCidr(s.cidr || s.subnet || '');
      if (c) entries.push({ ...c, n: s.name, v: s.vlan, o: s.note || s.notes, s: s.status, z: s.zone || s.az, d: azIdFrom(s.cloudService || s.azureService) });
    }
    if (j.tree) tree = j.tree;
    if (j.ipv6) v6data = j.ipv6;
    if (Array.isArray(j.hosts)) hosts = cleanHosts(Object.fromEntries(j.hosts.filter((h) => h && h.ip).map((h) => [h.ip, h])));
    if (j.peering && typeof j.peering === 'object') peering = j.peering;
    if (Array.isArray(j.blocks) && j.blocks.length) {
      defs = j.blocks.map((b) => ({ c: parseCidr(b && b.base), tree: b && b.tree, cloud: b && CLOUDS[b.platform] ? b.platform : 'std', label: String((b && b.label) || '').slice(0, 40), d6: b && b.dualStack ? (b.ipv6Range || 1) : 0 })).filter((d) => d.c);
    }
  } else {
    const recs = parseCsv(text);
    const hdr = recs.shift().map((h) => h.trim().toLowerCase());
    const col = (...names) => hdr.findIndex((h) => names.includes(h));
    const ci = col('subnet', 'cidr', 'network', 'prefix');
    if (ci < 0) throw new Error('The CSV needs a “Subnet” column with values like 10.0.0.0/24.');
    const ni = col('name'), vi = col('vlan', 'vlan id', 'vlanid'), oi = col('notes', 'note', 'description'), si = col('status');
    const bi = col('base network', 'block');
    const zi = col('zone', 'az', 'availability zone', 'availability_zone');
    const di = col('cloud service', 'cloud_service', 'cloudservice', 'azure service', 'azure_service', 'azureservice');
    const seen = new Map();
    for (const r of recs) {
      const c = parseCidr(r[ci] || '');
      if (c) entries.push({ ...c, n: r[ni], v: r[vi], o: r[oi], s: r[si], z: zi >= 0 ? r[zi] : '', d: di >= 0 ? azIdFrom(r[di]) : '' });
      const bc = bi >= 0 && parseCidr(r[bi] || '');
      if (bc && !seen.has(bc.cidr)) seen.set(bc.cidr, { c: bc, cloud: settings.cloud, label: '' });
    }
    if (seen.size) defs = [...seen.values()];
  }
  if (!entries.length) throw new Error('No subnets found.');
  if (!defs) {
    if (!base) {
      const fits = entries.every((e) => e.mask >= state.mask && inBlock(e.addr, state.network, state.mask));
      base = fits ? { addr: state.network, mask: state.mask } : supernet(entries);
    }
    defs = [{ c: { addr: base.addr, mask: base.mask }, tree, cloud: set ? set.cloud : settings.cloud, label: '' }];
  }
  if (set) settings.gw = set.gw;
  // Build the new set of base networks (dropping any that overlap an earlier one), then fill each tree.
  const blocks = [];
  for (const d of defs) {
    if (blocks.some((b) => overlaps(d.c.addr, d.c.mask, b.network, b.mask))) continue;
    const b = mkBlock(d.c.addr, d.c.mask, d.cloud, d.label);
    b.root = d.tree ? treeFrom(String(d.tree), d.c.mask) : null;
    if (d.d6) applyDualStack([b], { [blockCidr(b)]: d.d6 });
    blocks.push(b);
  }
  let skipped = 0;
  const inside = entries.filter((e) => {
    const ok = blocks.some((b) => e.mask >= b.mask && inBlock(e.addr, b.network, b.mask));
    if (!ok) skipped++;
    return ok;
  });
  for (const b of blocks) {
    if (b.root && (b.root.c || !inside.some((e) => e.mask > b.mask && inBlock(e.addr, b.network, b.mask)))) continue;
    b.root = { c: null };
    for (const e of inside.filter((x) => inBlock(x.addr, b.network, b.mask)).sort((x, y) => x.mask - y.mask)) carve(b.root, b.network, b.mask, e.addr, e.mask);
  }
  state.blocks = blocks;
  state.active = 0;
  state.meta = {};
  state.hosts = hosts;
  hostsChanged();
  state.peers = peering ? cleanPeers(peering.pairs) : null;
  state.po = cleanPo(peering && peering.options);
  for (const e of inside) {
    const c = cleanMeta(e);
    if (c) state.meta[e.cidr] = { ...getMeta(e.cidr), ...c };
  }
  if (v6data) {
    const t = v6data.tree ? String(v6data.tree) : '0';
    v6Load({ p: v6data.prefix, t, m: v6data.meta || v6data.names });
  }
  syncControls();
  update();
  renderV6();
  return { count: inside.length, skipped, cloud };
};
// A CSV with an IP address column and no Subnet column is a list of addresses (a DHCP lease export, an IPAM
// dump): it adds them to the current plan instead of replacing it.
const importHosts = (text) => {
  const recs = parseCsv(String(text).replace(/^\uFEFF/, '').trim());
  const hdr = recs.shift().map((h) => h.trim().toLowerCase());
  const col = (...names) => hdr.findIndex((h) => names.includes(h));
  const ii = col('ip', 'ip address', 'ipaddress', 'address', 'ipv4', 'ipv4 address'), ni = col('name', 'hostname', 'host', 'device'), mi = col('mac', 'mac address', 'macaddress', 'hardware address'), oi = col('notes', 'note', 'description', 'comment');
  let added = 0, outside = 0, bad = 0;
  const adds = [];
  for (const r of recs) {
    const ip = aton(String(r[ii] || '').trim());
    if (ip === null) { bad++; continue; }
    if (blockOf(ip) < 0) { outside++; continue; }
    const h = cleanHost([ni >= 0 ? r[ni] : '', mi >= 0 ? r[mi] : '', oi >= 0 ? r[oi] : '']);
    if (h) adds.push([ntoa(ip), h]); else bad++;
  }
  if (!adds.length) throw new Error(outside ? `None of the ${outside} addresses are inside this plan (${state.blocks.map(blockCidr).join(', ')}).` : 'No addresses with a name or MAC found.');
  checkpoint();
  for (const [ip, h] of adds) { state.hosts[ip] = h; added++; }
  hostsChanged();
  update();
  return `Assigned ${added} IP address${added === 1 ? '' : 'es'} in the current plan${outside ? `. Skipped ${outside} outside it` : ''}${bad ? `${outside ? ',' : '. Skipped'} ${bad} without a valid address or a name` : ''}.`;
};
const isHostCsv = (text) => {
  const t = String(text || '').replace(/^\uFEFF/, '').trim();
  if (!t || t[0] === '{' || t[0] === '[') return false;
  const hdr = (parseCsv(t.split(/\r?\n/)[0])[0] || []).map((h) => h.trim().toLowerCase());
  return !hdr.some((h) => ['subnet', 'cidr', 'network', 'prefix'].includes(h)) && hdr.some((h) => ['ip', 'ip address', 'ipaddress', 'address', 'ipv4', 'ipv4 address'].includes(h));
};
const doImport = (text) => {
  clearMsg('imMsg');
  if (isHostCsv(text)) {
    try { showMsg('imMsg', importHosts(text), 'ok'); renderExport(); } catch (e) { showMsg('imMsg', e.message, 'error'); }
    return;
  }
  if ((state.blocks.length > 1 || state.root.c || Object.keys(state.meta).length) && !confirm('Importing replaces the current IPv4 plan. Continue?')) return;
  checkpoint();
  try {
    const { count, skipped, cloud } = importText(text);
    const where = state.blocks.map(blockName).join(', ');
    const guess = cloud && cloud.guessed ? ` ${cloud.guessed === 1 ? 'One network’s' : `${cloud.guessed} networks’`} address space wasn’t in the paste, so ${cloud.guessed === 1 ? 'it is' : 'they are'} the smallest block covering ${cloud.guessed === 1 ? 'its' : 'their'} subnets.${cloud.source === 'AWS' ? ' Paste the describe-vpcs output too for the real VPC ranges.' : ''}` : '';
    const from = cloud ? ` from ${cloud.source}${cloud.ipam ? '' : ', marked in use,'}` : '';
    const ipamNotes = cloud && cloud.ipam && cloud.notes.length ? ` ${cloud.notes.join(', ').replace(/^./, (ch) => ch.toUpperCase())}.` : '';
    showMsg('imMsg', `Imported ${count} subnet${count === 1 ? '' : 's'}${from} into ${where}${skipped ? `. Skipped ${skipped} that didn’t fit a base network (overlapping networks keep the first)` : ''}.${guess}${ipamNotes}`, 'ok');
    renderExport();
  } catch (e) {
    showMsg('imMsg', e.message, 'error');
  }
};
$('imRun').addEventListener('click', () => doImport($('imText').value));
$('imFile').addEventListener('change', () => {
  const f = $('imFile').files[0];
  if (!f) return;
  f.text().then((t) => { doImport(t); $('imFile').value = ''; });
});
