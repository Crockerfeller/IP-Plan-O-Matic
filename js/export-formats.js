// IP Plan-O-Matic: Every export format: each gen* function turns the plan into one file (Terraform, Bicep, router configs, CSV, Excel, images...).
// One of the app's plain scripts (js/*.js): index.html loads them in order and they share one scope, so each can use
// what the ones before it define. Plain scripts, not modules, so a downloaded copy still opens from disk.
'use strict';

// =====================================================================
// Export / import
// =====================================================================
const exportList = () => {
  const inc = $('exInc').value;
  const all = allRows().map((r) => ({ ...r, meta: getMeta(r.key), info: hostInfo(r.addr, r.mask, r.cloud), group: groupOf(r) }));
  let list = inc === 'all' ? all
    : inc === 'used' ? all.filter((x) => x.meta.s === 'used')
    : all.filter((x) => x.meta.n || x.meta.v || x.meta.s === 'used');
  let note = '';
  if (!list.length && inc === 'planned') { list = all; note = 'No subnets are named, have a VLAN or are marked in use yet, so every subnet is included.'; }
  else if (!list.length) note = 'No subnets are marked “In use” yet.';
  return { list, note };
};
const makeNamer = (style) => {
  const used = new Set();
  return (x) => {
    const raw = x.meta.n || (x.meta.v ? `vlan${x.meta.v}` : `net-${ntoa(x.addr).replace(/\./g, '-')}-${x.mask}`);
    let s;
    if (style === 'tf') { s = raw.toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, ''); if (!/^[a-z_]/.test(s)) s = 'n_' + s; }
    else if (style === 'gcp') { s = raw.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 55); if (!/^[a-z]/.test(s)) s = 'n-' + s; }
    else if (style === 'dns') { s = raw.toLowerCase().replace(/[^a-z0-9]+/g, '').slice(0, 13); if (!/^[a-z]/.test(s)) s = 'n' + s.slice(0, 12); }
    else if (style === 'upper') s = raw.toUpperCase().replace(/[^A-Z0-9]+/g, '_').replace(/^_+|_+$/g, '');
    else s = raw.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
    s = s || 'net';
    const sep = style === 'tf' || style === 'upper' ? '_' : style === 'dns' ? '' : '-';
    let u = s, i = 2;
    while (used.has(u)) u = s + sep + i++;
    used.add(u);
    return u;
  };
};
const hq = (s) => String(s).replace(/\\/g, '\\\\').replace(/"/g, '\\"');
// Terraform (HCL) strings also treat ${ and %{ as template code: double them so a name stays literal text.
const tq = (s) => hq(s).replace(/\$\{/g, () => '$${').replace(/%\{/g, '%%{');
// Line up "=" the way terraform fmt does: consecutive one-line attributes at the same indent share a column, and
// their trailing comments share a column. A blank line, a comment line, a block or a value that opens a bracket
// ends the run.
const hclAlign = (text) => {
  const lines = text.split('\n');
  const parse = (l) => {
    const m = /^(\s*)([A-Za-z_][\w-]*|"[^"]*")\s*=\s*(.*)$/.exec(l);
    if (!m || /[{[(]$/.test(m[3])) return null;
    let q = false, cut = -1;   // a trailing # comment outside a string
    for (let i = 0; i < m[3].length; i++) {
      const c = m[3][i];
      if (q) { if (c === '\\') i++; else if (c === '"') q = false; } else if (c === '"') q = true; else if (c === '#') { cut = i; break; }
    }
    const val = cut < 0 ? m[3] : m[3].slice(0, cut).trimEnd(), com = cut < 0 ? '' : m[3].slice(cut);
    return { ind: m[1], key: m[2], val, com };
  };
  const flush = (run) => {
    const w = Math.max(...run.map(({ p }) => p.key.length));
    const head = run.map(({ p }) => `${p.ind}${p.key.padEnd(w)} = ${p.val}`);
    // Trailing comments line up across neighbouring lines that have one.
    for (let i = 0; i < run.length;) {
      if (!run[i].p.com) { i++; continue; }
      let j = i;
      while (j < run.length && run[j].p.com) j++;
      const cw = Math.max(...head.slice(i, j).map((h) => h.length));
      for (let k = i; k < j; k++) head[k] = `${head[k].padEnd(cw)} ${run[k].p.com}`;
      i = j;
    }
    run.forEach(({ i }, k) => { lines[i] = head[k]; });
  };
  let run = [];
  lines.forEach((l, i) => {
    const p = parse(l);
    if (p && run.length && p.ind === run[0].p.ind) run.push({ i, p });
    else { if (run.length) flush(run); run = p ? [{ i, p }] : []; }
  });
  if (run.length) flush(run);
  return lines.join('\n');
};
const poolRange = (info) => {
  if (info.uF === null || info.hosts < 3) return null;
  let lo = info.uF, hi = info.uL;
  if (info.gw === lo) lo++; else if (info.gw === hi) hi--;
  return lo <= hi ? [lo, hi] : null;
};
const routerIp = (info) => (info.gw ?? info.uF);


// IPv6 prefixes to add to router configs: /64 and longer that are named, tagged with a VLAN or in use.
// They join the IPv4 interface with the same VLAN; any left over get their own interface.
const v6ForExport = () => {
  const inc = $('exInc').value;
  const list = v6Walk().filter((lf) => lf.m >= 64).map((lf) => {
    const k = v6Key(lf.a, lf.m), meta = v6Get(k);
    return { k, a: lf.a, m: lf.m, meta, ip: `${fmt6(lf.m === 128 ? lf.a : lf.a + 1n)}/${lf.m}` };
  }).filter((x) => (inc === 'used' ? x.meta.s === 'used' : x.meta.n || x.meta.v || x.meta.s === 'used'));
  const used = new Set();
  return {
    any: list.length > 0,
    lines: (vlan, f) => (vlan ? list.filter((x) => x.meta.v === vlan && !used.has(x.k)).map((x) => { used.add(x.k); return f(x.ip, x); }) : []),
    rest: () => list.filter((x) => !used.has(x.k)),
  };
};
const genCisco = (list, dhcp) => {
  const pool = makeNamer('upper');
  const v6x = v6ForExport();
  const out = ['! Generated by IP Plan-O-Matic. Review before applying.', '! Replace <INTERFACE> and <DNS_SERVER> placeholders.', '!'];
  if (v6x.any) out.push('ipv6 unicast-routing', '!');
  let lo = 0;
  for (const x of list) {
    const { info, meta } = x;
    out.push(`! ===== ${x.key}${meta.n ? '  ' + meta.n : ''}`);
    if (info.uF === null) { out.push('! skipped: no usable addresses on this platform', '!'); continue; }
    const r = routerIp(info), nm = ntoa(netmask(x.mask));
    let ifname;
    if (x.mask === 32) ifname = `Loopback${lo++}`;
    else if (meta.v) { out.push(`vlan ${meta.v}`, ` name ${(meta.n || 'VLAN' + meta.v).replace(/\s+/g, '_').slice(0, 32)}`, '!'); ifname = `Vlan${meta.v}`; }
    else ifname = '<INTERFACE>';
    out.push(`interface ${ifname}`, ` description ${meta.n || x.key}`, ` ip address ${ntoa(r)} ${nm}`, ...v6x.lines(meta.v, (ip) => ` ipv6 address ${ip}`), ' no shutdown', '!');
    if (dhcp && poolRange(info)) {
      out.push(`ip dhcp excluded-address ${ntoa(r)}`, `ip dhcp pool ${pool(x)}`, ` network ${ntoa(x.addr)} ${nm}`, ` default-router ${ntoa(r)}`, ' dns-server <DNS_SERVER>', '!');
    }
  }
  for (const p6 of v6x.rest()) {
    out.push(`! ===== ${p6.k}${p6.meta.n ? '  ' + p6.meta.n : ''} (IPv6)`);
    if (p6.meta.v) out.push(`vlan ${p6.meta.v}`, ` name ${(p6.meta.n || 'VLAN' + p6.meta.v).replace(/\s+/g, '_').slice(0, 32)}`, '!');
    out.push(`interface ${p6.meta.v ? 'Vlan' + p6.meta.v : '<INTERFACE>'}`, ` description ${p6.meta.n || p6.k}`, ` ipv6 address ${p6.ip}`, ' no shutdown', '!');
  }
  return out.join('\n');
};
const genJunos = (list, dhcp) => {
  const nm = makeNamer('upper');
  const v6x = v6ForExport();
  const out = ['# Generated by IP Plan-O-Matic. Review before applying.', '# Replace <INTERFACE> placeholders. Paste in configuration mode.', ''];
  let lo = 0;
  for (const x of list) {
    const { info, meta } = x;
    out.push(`# ===== ${x.key}${meta.n ? '  ' + meta.n : ''}`);
    if (info.uF === null) { out.push('# skipped: no usable addresses on this platform', ''); continue; }
    const r = routerIp(info), name = nm(x), desc = hq(meta.n || x.key);
    let ifc;
    if (x.mask === 32) { ifc = `lo0 unit ${lo++}`; }
    else if (meta.v) {
      out.push(`set vlans ${name} vlan-id ${meta.v}`, `set vlans ${name} l3-interface irb.${meta.v}`);
      ifc = `irb unit ${meta.v}`;
    } else ifc = '<INTERFACE> unit 0';
    out.push(`set interfaces ${ifc} description "${desc}"`, `set interfaces ${ifc} family inet address ${ntoa(r)}/${x.mask}`,
      ...v6x.lines(meta.v, (ip, p6) => `set interfaces ${ifc} family inet6 address ${ip}` + (p6.m === 64 ? `\nset protocols router-advertisement interface ${ifc.replace(' unit ', '.')}` : '')));
    const pr = dhcp && poolRange(info);
    if (pr) {
      out.push(
        `set access address-assignment pool ${name} family inet network ${x.key}`,
        `set access address-assignment pool ${name} family inet range R1 low ${ntoa(pr[0])}`,
        `set access address-assignment pool ${name} family inet range R1 high ${ntoa(pr[1])}`,
        `set access address-assignment pool ${name} family inet dhcp-attributes router ${ntoa(r)}`,
        `set system services dhcp-local-server group LAN interface ${ifc.replace(' unit ', '.')}`,
      );
    }
    out.push('');
  }
  for (const p6 of v6x.rest()) {
    const name = (p6.meta.n || (p6.meta.v ? 'VLAN' + p6.meta.v : 'V6')).toUpperCase().replace(/[^A-Z0-9]+/g, '_').replace(/^_+|_+$/g, '') || 'V6';
    out.push(`# ===== ${p6.k}${p6.meta.n ? '  ' + p6.meta.n : ''} (IPv6)`);
    let ifc = '<INTERFACE> unit 0';
    if (p6.meta.v) { out.push(`set vlans ${name} vlan-id ${p6.meta.v}`, `set vlans ${name} l3-interface irb.${p6.meta.v}`); ifc = `irb unit ${p6.meta.v}`; }
    out.push(`set interfaces ${ifc} description "${hq(p6.meta.n || p6.k)}"`, `set interfaces ${ifc} family inet6 address ${p6.ip}`);
    if (p6.m === 64) out.push(`set protocols router-advertisement interface ${ifc.replace(' unit ', '.')}`);
    out.push('');
  }
  return out.join('\n');
};
const genMikrotik = (list, dhcp) => {
  const nm = makeNamer('lower');
  const v6x = v6ForExport();
  const out = ['# Generated by IP Plan-O-Matic. Review before applying.', '# Assumes a VLAN-aware bridge called "bridge". Replace <INTERFACE> placeholders.', ''];
  for (const x of list) {
    const { info, meta } = x;
    out.push(`# ===== ${x.key}${meta.n ? '  ' + meta.n : ''}`);
    if (info.uF === null) { out.push('# skipped: no usable addresses on this platform', ''); continue; }
    const r = routerIp(info), name = nm(x), cmt = hq(meta.n || x.key);
    let ifc;
    if (meta.v) { ifc = `vlan${meta.v}`; out.push(`/interface vlan add interface=bridge name=${ifc} vlan-id=${meta.v} comment="${cmt}"`); }
    else ifc = '<INTERFACE>';
    out.push(`/ip address add address=${ntoa(r)}/${x.mask} interface=${ifc} comment="${cmt}"`, ...v6x.lines(meta.v, (ip) => `/ipv6 address add address=${ip} interface=${ifc} advertise=yes comment="${cmt}"`));
    const pr = dhcp && poolRange(info);
    if (pr) {
      out.push(
        `/ip pool add name=pool-${name} ranges=${ntoa(pr[0])}-${ntoa(pr[1])}`,
        `/ip dhcp-server add name=dhcp-${name} interface=${ifc} address-pool=pool-${name}`,
        `/ip dhcp-server network add address=${x.key} gateway=${ntoa(r)} comment="${cmt}"`,
      );
    }
    out.push('');
  }
  for (const p6 of v6x.rest()) {
    const cmt = hq(p6.meta.n || p6.k);
    out.push(`# ===== ${p6.k}${p6.meta.n ? '  ' + p6.meta.n : ''} (IPv6)`);
    let ifc = '<INTERFACE>';
    if (p6.meta.v) { ifc = `vlan${p6.meta.v}`; out.push(`/interface vlan add interface=bridge name=${ifc} vlan-id=${p6.meta.v} comment="${cmt}"`); }
    out.push(`/ipv6 address add address=${p6.ip} interface=${ifc} advertise=yes comment="${cmt}"`, '');
  }
  return out.join('\n');
};
// Which base networks become cloud networks (VPC / VNet / VCN), their names, and the peerings between them.
// Shared by every cloud export. `c` is the format's comment marker.
/** One network in a cloud export; each exporter adds the fields it needs (tgw, byZone, cf, subs).
    @typedef {{ b: Block, base: string, id: string, slug: string, dns: string, name: string, items: any[], tgw: any[], byZone: any, cf: string, subs: any[], att: any }} CloudNet
      (tgw, byZone, cf, subs and att are filled in by the exporter that uses them, before it reads them.) */
const cloudNets = (list, want, out, c = '#') => {
  // With several base networks, each one becomes its own VPC / VNet / VCN. If some base networks are set to
  // this cloud, only those are exported; otherwise all of them are.
  const matching = state.blocks.filter((b) => b.cloud === want);
  const blocks = state.blocks.length > 1 && matching.length ? matching : state.blocks;
  if (blocks.some((b) => b.cloud !== want)) out.push(`${c} Tip: set Platform to ${CLOUDS[want].label} on the Plan tab so host counts and minimum sizes match.`);
  if (blocks.length < state.blocks.length) out.push(`${c} Only base networks set to ${CLOUDS[want].label} are included: ${blocks.map(blockCidr).join(', ')}.`);
  out.push('');
  const multi = blocks.length > 1;
  const idN = makeNamer('tf'), slugN = makeNamer('lower'), dnsN = makeNamer('dns');
  const nets = blocks.map((b) => {
    const bx = { meta: { n: b.label }, addr: b.network, mask: b.mask };
    return /** @type {CloudNet} */ ({ b, base: blockCidr(b), id: multi ? idN(bx) : 'main', slug: multi ? slugN(bx) : 'main', dns: multi ? dnsN(bx) : 'main', name: multi ? (b.label || blockCidr(b)) : (b.label || 'main'), items: list.filter((x) => inBlock(x.addr, b.network, b.mask)) });
  });
  // Peerings between the exported networks: from the Peering button, or (plans from before it) the network
  // labeled Hub with every other one. Hub first in each pair.
  const byBlock = new Map(nets.map((v) => [v.b, v]));
  /** @type {() => [CloudNet, CloudNet][]} */
  const netPairs = () => {
    // Both sides are in byBlock (checked first), so get() finds them.
    if (state.peers) return peerPairs().filter(([x, y]) => byBlock.has(x) && byBlock.has(y)).map(([x, y]) => /** @type {[CloudNet, CloudNet]} */ ([byBlock.get(x), byBlock.get(y)]));
    const hub = nets.length > 1 && nets.find((v) => /^hub$/i.test(v.b.label || ''));
    return hub ? nets.filter((v) => v !== hub).map((v) => /** @type {[CloudNet, CloudNet]} */ ([hub, v])) : [];
  };
  return { nets, netPairs };
};
// Azure: the subnet name (service subnets keep the exact name Azure requires) and, per peering direction, the
// gateway-transit settings. VNet peering is one resource per direction; the hub shares its gateway, the spoke uses it.
const azSubnetName = (x, an) => {
  const svc = svcOf(x.meta);
  return svc && (svc.fixed || x.meta.n === svc.name) ? svc.name : `snet-${an(x)}`;
};
const azPeerings = (pairs) => {
  const hubC = state.peers ? state.po.h : (pairs[0] ? pairs[0][0].base : '');
  const fwd = state.peers ? !!state.po.f : true, gwt = !!state.peers && !!state.po.g;
  const out = [];
  for (const [a, b] of pairs) {
    const viaHub = a.base === hubC;
    out.push({ from: a, to: b, fwd, allowGw: viaHub && gwt, useRemote: false, laterRemote: false });
    out.push({ from: b, to: a, fwd, allowGw: false, useRemote: viaHub && gwt, laterRemote: viaHub && !gwt });
  }
  return out;
};
// Azure route tables and NSGs, worked out once and printed by each Azure export in its own syntax.
// Routes: with an Azure Firewall subnet, every subnet in its VNet and in the VNets peered with it sends 0.0.0.0/0 to the
// firewall (its private IP is normally the 4th address of AzureFirewallSubnet), and the gateway subnet sends each spoke's
// range through it. NSGs: an empty one per subnet, to add rules to. Service subnets where Azure doesn't allow these,
// or where a bare route table / empty NSG breaks the service, are skipped with the reason.
const AZ_NO_UDR = { gw: 'Azure doesn’t allow a default route here', fw: 'the firewall itself', fwmgmt: 'Azure doesn’t allow it', bastion: 'Azure doesn’t allow route tables on Bastion', rs: 'Azure doesn’t allow it',
  appgw: 'Application Gateway v2 needs its own internet routes', apim: 'API Management needs routes for its control plane', aca: 'Container Apps needs extra routes (workload profiles only)',
  dbwhost: 'Databricks needs routes for its control plane', dbwcont: 'Databricks needs routes for its control plane', dnsin: 'DNS Private Resolver: route only if your firewall should see its traffic', dnsout: 'DNS Private Resolver: route only if your firewall should see its traffic' };
const AZ_NO_NSG = { gw: 'Azure doesn’t support NSGs on GatewaySubnet', fw: 'Azure doesn’t allow NSGs here', fwmgmt: 'Azure doesn’t allow NSGs here', rs: 'Azure doesn’t allow NSGs here',
  bastion: 'Bastion needs a specific set of NSG rules (see Azure Bastion NSG docs)', appgw: 'Application Gateway v2 needs inbound 65200-65535 from GatewayManager', apim: 'API Management needs inbound 3443 from ApiManagement' };
/** @typedef {{ net: CloudNet, name: string, id: string, routes: { name: string, prefix: string }[], noBgp: boolean, subs: any[] }} AzRouteTable */
/** @type {(nets: CloudNet[], pairs: [CloudNet, CloudNet][], subName: (x: any) => string) => { fwIp: string, tables: AzRouteTable[], nsgs: { net: CloudNet, x: any, name: string }[], notes: string[] }} */
const azSecurity = (nets, pairs, subName) => {
  /** @type {ReturnType<typeof azSecurity>} */
  const res = { fwIp: '', tables: [], nsgs: [], notes: [] };
  const wantRt = !$('exAzRtL').hidden && $('exAzRt').checked, wantNsg = !$('exAzNsgL').hidden && $('exAzNsg').checked;
  const svcId = (x) => { const v = svcOf(x.meta); return v ? v.id : ''; };
  if (wantRt) {
    const fwNet = nets.find((v) => v.items.some((x) => svcId(x) === 'fw'));
    if (fwNet) {
      const fwSub = fwNet.items.find((x) => svcId(x) === 'fw');   // there is one: that's how fwNet was found
      res.fwIp = ntoa(fwSub.addr + 4);
      const peered = pairs.filter(([a, b]) => a === fwNet || b === fwNet).map(([a, b]) => (a === fwNet ? b : a));
      if (peered.length && state.peers && !state.po.f) res.notes.push('Turn on “Allow forwarded traffic” in Peering: the spokes’ traffic reaches them through the firewall.');
      for (const v of [fwNet, ...peered]) {
        /** @type {AzRouteTable} */
        const t = { net: v, name: `rt-${v.slug}`, id: `rt_${v.id}`, routes: [{ name: 'default-via-firewall', prefix: '0.0.0.0/0' }], noBgp: true, subs: [] };
        for (const x of v.items) {
          const why = AZ_NO_UDR[svcId(x)];
          if (why) { if (svcId(x) !== 'fw' && svcId(x) !== 'gw') res.notes.push(`No route table on ${subName(x)} (${x.key}): ${why}.`); }
          else t.subs.push(x);
        }
        if (t.subs.length) res.tables.push(t);
      }
      const gw = fwNet.items.find((x) => svcId(x) === 'gw');
      if (gw && peered.length) res.tables.push({ net: fwNet, name: `rt-${fwNet.slug}-gateway`, id: `rt_${fwNet.id}_gateway`, noBgp: false, subs: [gw],
        routes: peered.map((v) => ({ name: `to-${v.slug}`, prefix: v.base })) });
    }
  }
  if (wantNsg) {
    for (const v of nets) for (const x of v.items) {
      const why = AZ_NO_NSG[svcId(x)];
      if (why) res.notes.push(`No NSG on ${subName(x)} (${x.key}): ${why}.`);
      else res.nsgs.push({ net: v, x, name: `nsg-${v.slug}-${subName(x).replace(/^snet-/, '')}`.toLowerCase().replace(/[^a-z0-9._-]+/g, '-').slice(0, 80) });
    }
  }
  return res;
};
// A dual-stack network's subnets that get IPv6, with their /64 numbers (see dualStackIndex). Empty when it's IPv4-only.
/** @type {(v: CloudNet, cloud: string) => Map<string, number>} */
const subnets6 = (v, cloud) => (v.b.v6 ? dualStackIndex(v.b, v.items.filter((x) => v6Capable(x.meta, cloud))) : new Map());
const memo = (f) => { const m = new Map(); return (x) => { if (!m.has(x)) m.set(x, f(x)); return m.get(x); }; };
const genTf = (list, kind) => {
  const want = { 'tf-aws': 'aws', 'tf-azure': 'azure', 'tf-gcp': 'gcp', 'tf-oci': 'oci' }[kind];
  const out = ['# Generated by IP Plan-O-Matic. Review before applying.'];
  const { nets, netPairs } = cloudNets(list, want, out);
  if (kind === 'tf-aws') {
    const nm = makeNamer('tf');
    for (const v of nets) {
      const i6 = subnets6(v, 'aws');
      out.push(`resource "aws_vpc" "${v.id}" {`, `  cidr_block           = "${v.base}"`, '  enable_dns_support   = true', '  enable_dns_hostnames = true',
        ...(v.b.v6 ? ['  assign_generated_ipv6_cidr_block = true   # Amazon gives the VPC a /56; each subnet takes a /64 of it'] : []), '  tags = {', `    Name = "${tq(v.name)}"`, '  }', '}', '');
      v.tgw = [];
      v.byZone = {};   // first subnet in each zone: the attachment falls back to these
      for (const x of v.items) {
        const rid = nm(x);
        if (x.meta.d === 'aws-tgw') v.tgw.push(rid);
        if (!((x.meta.z || '') in v.byZone)) v.byZone[x.meta.z || ''] = rid;
        if (x.group) out.push(`# Group: ${x.group}`);
        out.push(`resource "aws_subnet" "${rid}" {`, `  vpc_id     = aws_vpc.${v.id}.id`, `  cidr_block = "${x.key}"`,
          ...(i6.has(x.key) ? [`  ipv6_cidr_block = cidrsubnet(aws_vpc.${v.id}.ipv6_cidr_block, 8, ${i6.get(x.key)})`, '  assign_ipv6_address_on_creation = true'] : []), x.meta.z ? `  availability_zone = "${tq(x.meta.z)}"` : '  # availability_zone = "us-east-1a"', '  tags = {', `    Name = "${tq(x.meta.n || x.key)}"`);
        if (x.group) out.push(`    Group = "${tq(x.group)}"`);
        if (x.meta.o) out.push(`    Notes = "${tq(x.meta.o)}"`);
        out.push('  }', '}', '');
      }
    }
    if (nets.some((v) => v.b.v6)) out.push('# IPv6: for outbound traffic from private subnets, add an egress-only internet gateway and a ::/0 route to it.', '');
    const po = state.po, pairs = netPairs();
    const route = (a, b, target, dep) => out.push(`resource "aws_route" "${a.id}_to_${b.id}" {`, `  route_table_id         = aws_vpc.${a.id}.main_route_table_id`,
      `  destination_cidr_block = "${b.base}"`, `  ${target}`, ...(dep ? [`  depends_on             = [${dep}]`] : []), '}', '');
    if (!state.peers || (pairs.length && po.t === 'tgw')) {
      // One Transit Gateway. Plans from before the Peering button attach every VPC that has attachment subnets.
      const vs = state.peers ? [...new Set(pairs.flat())] : nets.filter((v) => v.tgw.length);
      if (vs.length) {
        out.push('resource "aws_ec2_transit_gateway" "main" {', `  description = "${state.peers && po.m === 'mesh' ? 'Full mesh' : 'Hub and spoke'}"`, '  tags = {', '    Name = "tgw-main"', '  }', '}', '');
        for (const v of vs) {
          const ids = v.tgw.length ? v.tgw : Object.values(v.byZone);
          if (!ids.length) { out.push(`# ${v.name}: no subnets exported, so it can't be attached to the Transit Gateway.`, ''); continue; }
          if (!v.tgw.length) out.push(`# ${v.name} has no Transit Gateway attachment subnets: attaching its first subnet in each zone. A /28 per AZ of its own is recommended.`);
          out.push(`resource "aws_ec2_transit_gateway_vpc_attachment" "${v.id}" {`, '  transit_gateway_id = aws_ec2_transit_gateway.main.id', `  vpc_id             = aws_vpc.${v.id}.id`,
            `  subnet_ids         = [${ids.map((r) => `aws_subnet.${r}.id`).join(', ')}]`, '  tags = {', `    Name = "tgw-attach-${v.slug}"`, '  }', '}', '');
        }
        if (state.peers && po.r) {
          for (const [a, b] of pairs) {
            if (!(a.tgw.length || Object.keys(a.byZone).length) || !(b.tgw.length || Object.keys(b.byZone).length)) continue;
            route(a, b, 'transit_gateway_id     = aws_ec2_transit_gateway.main.id', `aws_ec2_transit_gateway_vpc_attachment.${a.id}`);
            route(b, a, 'transit_gateway_id     = aws_ec2_transit_gateway.main.id', `aws_ec2_transit_gateway_vpc_attachment.${b.id}`);
          }
        } else out.push('# Next: route tables sending spoke traffic to the Transit Gateway, and the hub through Network Firewall and NAT.');
      }
    } else if (pairs.length) {
      // VPC peering connections (same account and region, accepted automatically), with routes both ways.
      for (const [a, b] of pairs) {
        out.push(`resource "aws_vpc_peering_connection" "${a.id}_${b.id}" {`, `  vpc_id      = aws_vpc.${a.id}.id`, `  peer_vpc_id = aws_vpc.${b.id}.id`, '  auto_accept = true', '  tags = {', `    Name = "pcx-${a.slug}-${b.slug}"`, '  }', '}', '');
        if (po.r) {
          route(a, b, `vpc_peering_connection_id = aws_vpc_peering_connection.${a.id}_${b.id}.id`);
          route(b, a, `vpc_peering_connection_id = aws_vpc_peering_connection.${a.id}_${b.id}.id`);
        }
      }
    }
  } else if (kind === 'tf-azure') {
    const nm = memo(makeNamer('tf')), an = makeNamer('lower'), sn = memo((x) => azSubnetName(x, an));
    out.push('variable "resource_group_name" {', '  type = string', '}', '', 'variable "location" {', '  type = string', '}', '');
    for (const v of nets) {
      const i6 = subnets6(v, 'azure');
      out.push(`resource "azurerm_virtual_network" "${v.id}" {`, `  name                = "vnet-${v.slug}"`, `  address_space       = ["${v.base}"${v.b.v6 ? `, "${v.b.v6p}"` : ''}]`, '  location            = var.location', '  resource_group_name = var.resource_group_name', '}', '');
      for (const x of v.items) {
        const svc = svcOf(x.meta);
        if (x.group) out.push(`# Group: ${x.group}`);
        out.push(`resource "azurerm_subnet" "${nm(x)}" {`, `  name                 = "${tq(sn(x))}"`, '  resource_group_name  = var.resource_group_name', `  virtual_network_name = azurerm_virtual_network.${v.id}.name`, `  address_prefixes     = ["${x.key}"${i6.has(x.key) ? `, "${azSubnet6(v.b, /** @type {number} */ (i6.get(x.key)))}"` : ''}]`);
        if (svc && svc.deleg) out.push('', '  delegation {', '    name = "delegation"', '    service_delegation {', `      name = "${svc.deleg}"`, '    }', '  }');
        out.push('}', '');
      }
    }
    for (const p of azPeerings(netPairs())) {
      const a = p.from, b = p.to;
      out.push(`resource "azurerm_virtual_network_peering" "${a.id}_to_${b.id}" {`, `  name                      = "peer-${a.slug}-to-${b.slug}"`, '  resource_group_name       = var.resource_group_name',
        `  virtual_network_name      = azurerm_virtual_network.${a.id}.name`, `  remote_virtual_network_id = azurerm_virtual_network.${b.id}.id`, `  allow_forwarded_traffic   = ${p.fwd}`);
      if (p.allowGw) out.push('  allow_gateway_transit     = true');
      if (p.useRemote) out.push('  use_remote_gateways       = true', `  depends_on                = [azurerm_virtual_network_peering.${b.id}_to_${a.id}]`);
      if (p.laterRemote) out.push('  # use_remote_gateways     = true   # with gateway transit, once the hub’s VPN / ExpressRoute gateway exists');
      out.push('}', '');
    }
    const sec = azSecurity(nets, netPairs(), sn);
    if (sec.tables.length || sec.nsgs.length || sec.notes.length) out.push(...sec.notes.map((n) => `# ${n}`), ...(sec.notes.length ? [''] : []));
    if (sec.tables.length) {
      out.push('# Route tables: traffic goes through Azure Firewall. Check this is the firewall’s private IP once it exists.', 'variable "firewall_private_ip" {', '  type    = string', `  default = "${sec.fwIp}"`, '}', '');
      for (const t of sec.tables) {
        out.push(`resource "azurerm_route_table" "${t.id}" {`, `  name                          = "${t.name}"`, '  location                      = var.location', '  resource_group_name           = var.resource_group_name',
          `  bgp_route_propagation_enabled = ${!t.noBgp}${t.noBgp ? '   # on-premises routes must not bypass the firewall (azurerm 4.x; on 3.x: disable_bgp_route_propagation = true)' : ''}`);
        for (const r of t.routes) out.push('', '  route {', `    name                   = "${r.name}"`, `    address_prefix         = "${r.prefix}"`, '    next_hop_type          = "VirtualAppliance"', '    next_hop_in_ip_address = var.firewall_private_ip', '  }');
        out.push('}', '');
        for (const x of t.subs) out.push(`resource "azurerm_subnet_route_table_association" "${nm(x)}" {`, `  subnet_id      = azurerm_subnet.${nm(x)}.id`, `  route_table_id = azurerm_route_table.${t.id}.id`, '}', '');
      }
    }
    for (const g of sec.nsgs) {
      const id = `nsg_${nm(g.x)}`;
      out.push(`resource "azurerm_network_security_group" "${id}" {`, `  name                = "${tq(g.name)}"`, '  location            = var.location', '  resource_group_name = var.resource_group_name', '  # Add security_rule blocks here. Azure’s defaults allow traffic within the VNet and deny inbound from the internet.', '}', '',
        `resource "azurerm_subnet_network_security_group_association" "${nm(g.x)}" {`, `  subnet_id                 = azurerm_subnet.${nm(g.x)}.id`, `  network_security_group_id = azurerm_network_security_group.${id}.id`, '}', '');
    }
  } else if (kind === 'tf-oci') {
    const nm = makeNamer('tf'), dn = makeNamer('dns');
    out.push('variable "compartment_id" {', '  type = string', '}', '');
    for (const v of nets) {
      const i6 = subnets6(v, 'oci');
      out.push(`resource "oci_core_vcn" "${v.id}" {`, '  compartment_id = var.compartment_id', `  cidr_blocks    = ["${v.base}"]`, `  display_name   = "vcn-${v.slug}"`, `  dns_label      = "${v.dns}"`,
        ...(v.b.v6 ? ['  is_ipv6enabled = true   # Oracle gives the VCN a /56; each subnet takes a /64 of it'] : []), '}', '');
      for (const x of v.items) {
        if (x.group) out.push(`# Group: ${x.group}`);
        out.push(`resource "oci_core_subnet" "${nm(x)}" {`, '  compartment_id = var.compartment_id', `  vcn_id         = oci_core_vcn.${v.id}.id`, `  cidr_block     = "${x.key}"`, `  display_name   = "${tq(x.meta.n || x.key)}"`, `  dns_label      = "${dn(x)}"`,
          ...(i6.has(x.key) ? [`  ipv6cidr_block = cidrsubnet(oci_core_vcn.${v.id}.ipv6cidr_blocks[0], 8, ${i6.get(x.key)})`] : []));
        if (x.meta.v) out.push(`  freeform_tags  = { "VLAN" = "${x.meta.v}" }`);
        out.push('}', '');
      }
    }
    // Peered VCNs: one DRG (Dynamic Routing Gateway) with each of them attached.
    const joined = [...new Set(netPairs().flat())];
    if (joined.length) {
      out.push('# Peering: every VCN attaches to one DRG (Dynamic Routing Gateway).', 'resource "oci_core_drg" "main" {', '  compartment_id = var.compartment_id', '  display_name   = "drg-main"', '}', '');
      for (const v of joined) out.push(`resource "oci_core_drg_attachment" "${v.id}" {`, '  drg_id       = oci_core_drg.main.id', `  display_name = "drg-attach-${v.slug}"`, '', '  network_details {', `    id   = oci_core_vcn.${v.id}.id`, '    type = "VCN"', '  }', '}', '');
      out.push('# Next: in each subnet’s route table, send the other VCNs’ ranges to the DRG; with a hub Network Firewall, route the', '# DRG’s spoke traffic to the hub VCN attachment and on to the firewall (OCI docs: hub-and-spoke routing with a DRG).');
    }
  } else {
    const nm = memo(makeNamer('tf')), gn = memo(makeNamer('gcp'));
    out.push('variable "region" {', '  type = string', '}', '');
    // One VPC per base network. A subnet's Zone column holds its region (the wizard repeats subnets per region).
    for (const v of nets) {
      const i6 = subnets6(v, 'gcp');
      out.push(`resource "google_compute_network" "${v.id}" {`, `  name                    = "vpc-${v.slug}"`, '  auto_create_subnetworks = false',
        ...(v.b.v6 ? ['  enable_ula_internal_ipv6 = true   # Google gives each dual-stack subnet a private /64'] : []), '}', '');
      const svcId = (x) => (svcOf(x.meta) || {}).id;
      const second = v.items.filter((x) => (svcOf(x.meta) || {}).secondary);
      const psa = v.items.filter((x) => svcId(x) === 'gcp-psa');
      const used = new Set();
      for (const x of v.items) {
        const svc = svcOf(x.meta);
        if (svc && (svc.secondary || svc.id === 'gcp-psa')) continue;
        if (x.group) out.push(`# Group: ${x.group}`);
        out.push(`resource "google_compute_subnetwork" "${nm(x)}" {`, `  name          = "${gn(x)}"`, `  ip_cidr_range = "${x.key}"`, `  region        = ${x.meta.z ? `"${tq(x.meta.z)}"` : 'var.region'}`, `  network       = google_compute_network.${v.id}.id`,
          ...(i6.has(x.key) ? ['  stack_type       = "IPV4_IPV6"', '  ipv6_access_type = "INTERNAL"'] : []));
        if (x.meta.o || x.meta.n) out.push(`  description   = "${tq(x.meta.o || x.meta.n)}"`);
        if (svc && svc.purpose) out.push(`  purpose       = "${svc.purpose}"`, ...(svc.purpose.endsWith('_MANAGED_PROXY') ? ['  role          = "ACTIVE"'] : []));
        if (svc && svc.id === 'gcp-gke') {
          // The GKE Pod and Service ranges in the same region become this subnet's secondary ranges.
          for (const y of second.filter((y) => !used.has(y) && (y.meta.z || '') === (x.meta.z || ''))) {
            used.add(y);
            out.push('', '  secondary_ip_range {', `    range_name    = "${svcOf(y.meta).secondary}"`, `    ip_cidr_range = "${y.key}"`, '  }');
          }
        }
        out.push('}', '');
      }
      for (const y of second.filter((y) => !used.has(y))) out.push(`# ${y.key} (${tq(y.meta.n || svcOf(y.meta).name)}): add it as a secondary range on your GKE node subnet${y.meta.z ? ` in ${y.meta.z}` : ''}.`, '');
      if (psa.length) {
        // Private services access: a global range for Google's managed services, and the connection that uses it.
        for (const x of psa) out.push(`resource "google_compute_global_address" "${nm(x)}" {`, `  name          = "${gn(x)}"`, '  purpose       = "VPC_PEERING"', '  address_type  = "INTERNAL"', `  address       = "${ntoa(x.addr)}"`, `  prefix_length = ${x.mask}`, `  network       = google_compute_network.${v.id}.id`, '}', '');
        out.push(`resource "google_service_networking_connection" "${v.id}_psa" {`, `  network                 = google_compute_network.${v.id}.id`, '  service                 = "servicenetworking.googleapis.com"', `  reserved_peering_ranges = [${psa.map((x) => `google_compute_global_address.${nm(x)}.name`).join(', ')}]`, '}', '');
      }
    }
    // VPC Network Peering: one resource per direction. In hub and spoke the hub exports its custom routes
    // (for a firewall appliance) and the spokes import them. Google runs one peering change at a time per VPC.
    const pairs = netPairs(), hubC = state.peers ? (state.po.m === 'hub' ? state.po.h : '') : (pairs[0] ? pairs[0][0].base : '');
    for (const [a, b] of pairs) {
      const viaHub = a.base === hubC;
      out.push(`resource "google_compute_network_peering" "${a.id}_to_${b.id}" {`, `  name                 = "peer-${a.slug}-to-${b.slug}"`, `  network              = google_compute_network.${a.id}.self_link`, `  peer_network         = google_compute_network.${b.id}.self_link`);
      if (viaHub) out.push('  export_custom_routes = true');
      out.push('}', '', `resource "google_compute_network_peering" "${b.id}_to_${a.id}" {`, `  name                 = "peer-${b.slug}-to-${a.slug}"`, `  network              = google_compute_network.${b.id}.self_link`, `  peer_network         = google_compute_network.${a.id}.self_link`);
      if (viaHub) out.push('  import_custom_routes = true');
      out.push(`  depends_on           = [google_compute_network_peering.${a.id}_to_${b.id}]`, '}', '');
    }
  }
  return hclAlign(out.join('\n'));
};
// ---------- More cloud formats: Azure CLI (PowerShell), Bicep, CloudFormation ----------
const psq = (s) => `'${String(s).replace(/'/g, "''")}'`;   // PowerShell single-quoted string
const genAzCli = (list) => {
  const out = [
    '# Generated by IP Plan-O-Matic. Review before running.',
    '# Azure CLI script for PowerShell 7: paste it into Azure Cloud Shell (PowerShell), or save it as a .ps1 file and',
    '# run it after "az login". Set the resource group and region below first.',
    '# Safe to run again: VNets, subnets and peerings that already exist are left as they are.',
  ];
  const { nets, netPairs } = cloudNets(list, 'azure', out);
  out.push(
    "$ResourceGroup = 'rg-network'",
    "$Location      = 'eastus'",
    '$DryRun        = $false   # $true prints the az commands without running them',
    '',
    "$ErrorActionPreference = 'Stop'",
    'function Invoke-Az {',
    '  # Runs one az command (with $DryRun, only prints it) and stops the script if it fails.',
    '  if ($DryRun) { Write-Host "az $args"; return }',
    '  az @args --only-show-errors --output none',
    '  if ($LASTEXITCODE -ne 0) { throw "Failed: az $args" }',
    '}',
    'function Test-AzExists {',
    '  # True when an "az ... show" command finds the resource.',
    '  if ($DryRun) { return $false }',
    "  $ErrorActionPreference = 'Continue'",
    '  az @args --only-show-errors --output none 2>$null',
    '  return $LASTEXITCODE -eq 0',
    '}',
    'function Add-Vnet([string]$Name, [string[]]$Prefix) {',
    '  if (Test-AzExists network vnet show -g $ResourceGroup -n $Name) { Write-Host "VNet $Name exists: skipped"; return }',
    '  Invoke-Az network vnet create -g $ResourceGroup -l $Location -n $Name --address-prefixes @Prefix',
    '}',
    'function Add-Subnet([string]$Vnet, [string]$Name, [string[]]$Prefix, [string]$Delegation) {',
    '  if (Test-AzExists network vnet subnet show -g $ResourceGroup --vnet-name $Vnet -n $Name) { Write-Host "Subnet $Name exists: skipped"; return }',
    "  $more = if ($Delegation) { @('--delegations', $Delegation) } else { @() }",
    '  Invoke-Az network vnet subnet create -g $ResourceGroup --vnet-name $Vnet -n $Name --address-prefixes @Prefix @more',
    '}',
    'function Add-Peering([string]$Vnet, [string]$Name, [string]$Remote, [string[]]$Options) {',
    '  if (Test-AzExists network vnet peering show -g $ResourceGroup --vnet-name $Vnet -n $Name) { Write-Host "Peering $Name exists: skipped"; return }',
    '  Invoke-Az network vnet peering create -g $ResourceGroup --vnet-name $Vnet -n $Name --remote-vnet $Remote --allow-vnet-access @Options',
    '}',
    '',
    'Invoke-Az group create -n $ResourceGroup -l $Location',
  );
  const an = makeNamer('lower'), sn = memo((x) => azSubnetName(x, an));
  // One prefix, or @('IPv4', 'IPv6') for a dual-stack VNet or subnet.
  const pfx = (a, b) => (b ? `@(${psq(a)}, ${psq(b)})` : psq(a));
  for (const v of nets) {
    const i6 = subnets6(v, 'azure');
    out.push('', `# ${v.name}`, `Add-Vnet ${psq('vnet-' + v.slug)} ${pfx(v.base, v.b.v6 ? v.b.v6p : '')}`);
    let grp = v.name;
    for (const x of v.items) {
      const svc = svcOf(x.meta);
      if (x.group && x.group !== grp) out.push(`# Group: ${x.group}`);
      grp = x.group || grp;
      out.push(`Add-Subnet ${psq('vnet-' + v.slug)} ${psq(sn(x))} ${pfx(x.key, i6.has(x.key) ? azSubnet6(v.b, /** @type {number} */ (i6.get(x.key))) : '')}${svc && svc.deleg ? ' ' + psq(svc.deleg) : ''}`);
    }
  }
  const peers = azPeerings(netPairs());
  if (peers.length) out.push('', '# Peering: one per direction');
  for (const p of peers) {
    const opts = [...(p.fwd ? ['--allow-forwarded-traffic'] : []), ...(p.allowGw ? ['--allow-gateway-transit'] : []), ...(p.useRemote ? ['--use-remote-gateways'] : [])];
    if (p.laterRemote) out.push('# Add --use-remote-gateways with gateway transit, once the hub’s VPN / ExpressRoute gateway exists.');
    out.push(`Add-Peering ${psq('vnet-' + p.from.slug)} ${psq(`peer-${p.from.slug}-to-${p.to.slug}`)} ${psq('vnet-' + p.to.slug)} @(${opts.map(psq).join(', ')})`);
  }
  const sec = azSecurity(nets, netPairs(), sn);
  if (sec.notes.length) out.push('', ...sec.notes.map((n) => `# ${n}`));
  if (sec.tables.length) {
    out.push('', '# Route tables: traffic goes through Azure Firewall. Check this is the firewall’s private IP once it exists.', `$FirewallIp = ${psq(sec.fwIp)}`,
      'function Add-RouteTable([string]$Name, [string]$Bgp) {',
      '  if (Test-AzExists network route-table show -g $ResourceGroup -n $Name) { Write-Host "Route table $Name exists: skipped"; return }',
      '  Invoke-Az network route-table create -g $ResourceGroup -l $Location -n $Name --disable-bgp-route-propagation $Bgp',
      '}',
      'function Add-Route([string]$Table, [string]$Name, [string]$Prefix) {',
      '  if (Test-AzExists network route-table route show -g $ResourceGroup --route-table-name $Table -n $Name) { Write-Host "Route $Name exists: skipped"; return }',
      '  Invoke-Az network route-table route create -g $ResourceGroup --route-table-name $Table -n $Name --address-prefix $Prefix --next-hop-type VirtualAppliance --next-hop-ip-address $FirewallIp',
      '}',
      'function Set-SubnetRouteTable([string]$Vnet, [string]$Subnet, [string]$Table) {',
      '  Invoke-Az network vnet subnet update -g $ResourceGroup --vnet-name $Vnet -n $Subnet --route-table $Table',
      '}');
    for (const t of sec.tables) {
      out.push('', `Add-RouteTable ${psq(t.name)} ${psq(String(t.noBgp))}${t.noBgp ? '   # true: on-premises routes must not bypass the firewall' : ''}`);
      for (const r of t.routes) out.push(`Add-Route ${psq(t.name)} ${psq(r.name)} ${psq(r.prefix)}`);
      for (const x of t.subs) out.push(`Set-SubnetRouteTable ${psq('vnet-' + t.net.slug)} ${psq(sn(x))} ${psq(t.name)}`);
    }
  }
  if (sec.nsgs.length) {
    out.push('', '# NSGs: one per subnet, empty. Azure’s defaults allow traffic within the VNet and deny inbound from the internet; add your rules with "az network nsg rule create".',
      'function Add-Nsg([string]$Vnet, [string]$Subnet, [string]$Name) {',
      '  if (Test-AzExists network nsg show -g $ResourceGroup -n $Name) { Write-Host "NSG $Name exists: skipped" }',
      '  else { Invoke-Az network nsg create -g $ResourceGroup -l $Location -n $Name }',
      '  Invoke-Az network vnet subnet update -g $ResourceGroup --vnet-name $Vnet -n $Subnet --network-security-group $Name',
      '}');
    for (const g of sec.nsgs) out.push(`Add-Nsg ${psq('vnet-' + g.net.slug)} ${psq(sn(g.x))} ${psq(g.name)}`);
  }
  out.push('', 'Write-Host "Done."');
  return out.join('\n');
};

const bq = (s) => `'${String(s).replace(/\\/g, '\\\\').replace(/'/g, "\\'")}'`;   // Bicep string
const genBicep = (list) => {
  const out = [
    '// Generated by IP Plan-O-Matic. Review before deploying.',
    '// Preview: az deployment group what-if --resource-group <rg> --template-file subnet-plan-bicep.bicep',
    '// Deploy:  az deployment group create --resource-group <rg> --template-file subnet-plan-bicep.bicep',
  ];
  const { nets, netPairs } = cloudNets(list, 'azure', out, '//');
  const API = '2024-05-01', an = makeNamer('lower'), sn = memo((x) => azSubnetName(x, an));
  // Name the subnets in plan order first, so the names match the other Azure exports.
  for (const v of nets) for (const x of v.items) sn(x);
  const sec = azSecurity(nets, netPairs(), sn);
  const rtOf = new Map(), nsgOf = new Map();
  out.push('param location string = resourceGroup().location');
  if (sec.tables.length) out.push('@description(\'Private IP of the Azure Firewall. Check it once the firewall exists.\')', `param firewallPrivateIp string = ${bq(sec.fwIp)}`);
  out.push('', ...sec.notes.map((n) => `// ${n}`), ...(sec.notes.length ? [''] : []));
  for (const t of sec.tables) {
    for (const x of t.subs) rtOf.set(x, t.id);
    out.push(`resource ${t.id} 'Microsoft.Network/routeTables@${API}' = {`, `  name: ${bq(t.name)}`, '  location: location', '  properties: {',
      `    disableBgpRoutePropagation: ${t.noBgp}${t.noBgp ? '   // on-premises routes must not bypass the firewall' : ''}`, '    routes: [');
    for (const r of t.routes) out.push('      {', `        name: ${bq(r.name)}`, '        properties: {', `          addressPrefix: ${bq(r.prefix)}`, "          nextHopType: 'VirtualAppliance'", '          nextHopIpAddress: firewallPrivateIp', '        }', '      }');
    out.push('    ]', '  }', '}', '');
  }
  const nsgIds = makeNamer('tf');
  for (const g of sec.nsgs) {
    const id = 'nsg_' + nsgIds({ meta: { n: g.name.replace(/^nsg-/, '') }, addr: g.x.addr, mask: g.x.mask });
    nsgOf.set(g.x, id);
    out.push(`resource ${id} 'Microsoft.Network/networkSecurityGroups@${API}' = {`, `  name: ${bq(g.name)}`, '  location: location', '  properties: {', '    // Add securityRules here. Azure’s defaults allow traffic within the VNet and deny inbound from the internet.', '    securityRules: []', '  }', '}', '');
  }
  // Subnets are declared inside their VNet, so deploying again doesn't remove them.
  for (const v of nets) {
    const i6 = subnets6(v, 'azure');
    out.push(`resource vnet_${v.id} 'Microsoft.Network/virtualNetworks@${API}' = {`, `  name: ${bq('vnet-' + v.slug)}`, '  location: location', '  properties: {', '    addressSpace: {', `      addressPrefixes: [`, `        ${bq(v.base)}`, ...(v.b.v6 ? [`        ${bq(/** @type {string} */ (v.b.v6p))}`] : []), '      ]', '    }', '    subnets: [');
    let grp = v.name;
    for (const x of v.items) {
      const svc = svcOf(x.meta);
      if (x.group && x.group !== grp) out.push(`      // Group: ${x.group}`);
      grp = x.group || grp;
      out.push('      {', `        name: ${bq(sn(x))}`, '        properties: {',
        ...(i6.has(x.key) ? ['          addressPrefixes: [', `            ${bq(x.key)}`, `            ${bq(azSubnet6(v.b, /** @type {number} */ (i6.get(x.key))))}`, '          ]'] : [`          addressPrefix: ${bq(x.key)}`]));
      if (rtOf.has(x)) out.push('          routeTable: {', `            id: ${rtOf.get(x)}.id`, '          }');
      if (nsgOf.has(x)) out.push('          networkSecurityGroup: {', `            id: ${nsgOf.get(x)}.id`, '          }');
      if (svc && svc.deleg) out.push('          delegations: [', '            {', "              name: 'delegation'", '              properties: {', `                serviceName: ${bq(svc.deleg)}`, '              }', '            }', '          ]');
      out.push('        }', '      }');
    }
    out.push('    ]', '  }', '}', '');
  }
  for (const p of azPeerings(netPairs())) {
    const a = p.from, b = p.to;
    out.push(`resource peer_${a.id}_to_${b.id} 'Microsoft.Network/virtualNetworks/virtualNetworkPeerings@${API}' = {`, `  parent: vnet_${a.id}`, `  name: ${bq(`peer-${a.slug}-to-${b.slug}`)}`, '  properties: {', '    remoteVirtualNetwork: {', `      id: vnet_${b.id}.id`, '    }',
      '    allowVirtualNetworkAccess: true', `    allowForwardedTraffic: ${p.fwd}`, `    allowGatewayTransit: ${p.allowGw}`, `    useRemoteGateways: ${p.useRemote}${p.laterRemote ? '   // true with gateway transit, once the hub’s VPN / ExpressRoute gateway exists' : ''}`, '  }');
    if (p.useRemote) out.push('  dependsOn: [', `    peer_${b.id}_to_${a.id}`, '  ]');
    out.push('}', '');
  }
  return out.join('\n').replace(/\n+$/, '\n');
};

const genCfn = (list) => {
  const j = (v) => JSON.stringify(v);   // JSON strings are valid YAML scalars
  const out = [
    '# Generated by IP Plan-O-Matic. Review before deploying.',
    '# Deploy: aws cloudformation deploy --template-file subnet-plan-cfn-aws.yaml --stack-name subnet-plan',
  ];
  const { nets, netPairs } = cloudNets(list, 'aws', out);
  const usedIds = new Set();
  const lid = (prefix, s) => {   // CloudFormation logical IDs: letters and digits only, unique
    const base = prefix + String(s).split(/[^a-zA-Z0-9]+/).filter(Boolean).map((w) => w[0].toUpperCase() + w.slice(1)).join('');
    let u = base, i = 2;
    while (usedIds.has(u)) u = base + i++;
    usedIds.add(u);
    return u;
  };
  const res = [];
  const tags = (pairs) => ['      Tags:', ...pairs.flatMap(([k, val]) => [`        - Key: ${k}`, `          Value: ${j(val)}`])];
  const nm = makeNamer('tf');
  for (const v of nets) {
    v.cf = lid('Vpc', v.id);
    res.push(`  ${v.cf}:`, '    Type: AWS::EC2::VPC', '    Properties:', `      CidrBlock: ${v.base}`, '      EnableDnsSupport: true', '      EnableDnsHostnames: true', ...tags([['Name', v.name]]));
    // Dual-stack: Amazon gives the VPC a /56, and each subnet takes a /64 of it by number.
    const i6 = subnets6(v, 'aws'), v6Id = `${v.cf}Ipv6`;
    if (v.b.v6) res.push(`  ${v6Id}:`, '    Type: AWS::EC2::VPCCidrBlock', '    Properties:', `      VpcId: !Ref ${v.cf}`, '      AmazonProvidedIpv6CidrBlock: true');
    v.subs = []; v.tgw = []; v.byZone = {};
    for (const x of v.items) {
      const id = lid('Subnet', nm(x));
      v.subs.push(id);
      if (x.meta.d === 'aws-tgw') v.tgw.push(id);
      if (!((x.meta.z || '') in v.byZone)) v.byZone[x.meta.z || ''] = id;
      if (x.group) res.push(`  # Group: ${x.group}`);
      res.push(`  ${id}:`, '    Type: AWS::EC2::Subnet', ...(i6.has(x.key) ? [`    DependsOn: ${v6Id}`] : []), '    Properties:', `      VpcId: !Ref ${v.cf}`, `      CidrBlock: ${x.key}`);
      if (i6.has(x.key)) res.push(`      Ipv6CidrBlock: !Select [${i6.get(x.key)}, !Cidr [!Select [0, !GetAtt ${v.cf}.Ipv6CidrBlocks], 256, 64]]`, '      AssignIpv6AddressOnCreation: true');
      res.push(x.meta.z ? `      AvailabilityZone: ${j(x.meta.z)}` : '      # AvailabilityZone: us-east-1a');
      res.push(...tags([['Name', x.meta.n || x.key], ...(x.group ? [['Group', x.group]] : []), ...(x.meta.o ? [['Notes', x.meta.o]] : [])]));
    }
  }
  if (nets.some((v) => v.b.v6)) res.push('  # IPv6: for outbound traffic from private subnets, add an AWS::EC2::EgressOnlyInternetGateway and a ::/0 route to it.');
  // Routes need a route table CloudFormation can name, so a VPC with peering routes gets its own route table,
  // shared by all its subnets.
  const po = state.po, pairs = netPairs();
  const rtb = (v) => {
    if (v.rt) return v.rt;
    v.rt = lid('RouteTable', v.id);
    res.push(`  ${v.rt}:`, '    Type: AWS::EC2::RouteTable', '    Properties:', `      VpcId: !Ref ${v.cf}`, ...tags([['Name', `rtb-${v.slug}`]]));
    for (const s of v.subs) res.push(`  ${lid('Assoc', s)}:`, '    Type: AWS::EC2::SubnetRouteTableAssociation', '    Properties:', `      SubnetId: !Ref ${s}`, `      RouteTableId: !Ref ${v.rt}`);
    return v.rt;
  };
  const route = (a, b, target, dep) => res.push(`  ${lid('Route', `${a.id} to ${b.id}`)}:`, '    Type: AWS::EC2::Route', ...(dep ? [`    DependsOn: ${dep}`] : []), '    Properties:', `      RouteTableId: !Ref ${rtb(a)}`, `      DestinationCidrBlock: ${b.base}`, `      ${target}`);
  if (!state.peers || (pairs.length && po.t === 'tgw')) {
    const vs = state.peers ? [...new Set(pairs.flat())] : nets.filter((v) => v.tgw.length);
    if (vs.length) {
      res.push('  TransitGateway:', '    Type: AWS::EC2::TransitGateway', '    Properties:', `      Description: ${j(state.peers && po.m === 'mesh' ? 'Full mesh' : 'Hub and spoke')}`, ...tags([['Name', 'tgw-main']]));
      for (const v of vs) {
        const ids = v.tgw.length ? v.tgw : Object.values(v.byZone);
        if (!ids.length) { res.push(`  # ${v.name}: no subnets exported, so it can't be attached to the Transit Gateway.`); continue; }
        if (!v.tgw.length) res.push(`  # ${v.name} has no Transit Gateway attachment subnets: attaching its first subnet in each zone. A /28 per AZ of its own is recommended.`);
        v.att = lid('TgwAttach', v.id);
        res.push(`  ${v.att}:`, '    Type: AWS::EC2::TransitGatewayAttachment', '    Properties:', '      TransitGatewayId: !Ref TransitGateway', `      VpcId: !Ref ${v.cf}`, '      SubnetIds:', ...ids.map((s) => `        - !Ref ${s}`), ...tags([['Name', `tgw-attach-${v.slug}`]]));
      }
      if (state.peers && po.r) {
        for (const [a, b] of pairs) {
          if (!a.att || !b.att) continue;
          route(a, b, 'TransitGatewayId: !Ref TransitGateway', a.att);
          route(b, a, 'TransitGatewayId: !Ref TransitGateway', b.att);
        }
      } else res.push('  # Next: route tables sending spoke traffic to the Transit Gateway, and the hub through Network Firewall and NAT.');
    }
  } else if (pairs.length) {
    // VPC peering in the same account and region is accepted automatically.
    for (const [a, b] of pairs) {
      const pcx = lid('Peering', `${a.id} ${b.id}`);
      res.push(`  ${pcx}:`, '    Type: AWS::EC2::VPCPeeringConnection', '    Properties:', `      VpcId: !Ref ${a.cf}`, `      PeerVpcId: !Ref ${b.cf}`, ...tags([['Name', `pcx-${a.slug}-${b.slug}`]]));
      if (po.r) { route(a, b, `VpcPeeringConnectionId: !Ref ${pcx}`); route(b, a, `VpcPeeringConnectionId: !Ref ${pcx}`); }
    }
  }
  out.push("AWSTemplateFormatVersion: '2010-09-09'", 'Description: Subnet plan from IP Plan-O-Matic', 'Resources:', ...res);
  if (nets.length) out.push('Outputs:', ...nets.flatMap((v) => [`  ${v.cf}Id:`, `    Value: !Ref ${v.cf}`]));
  return out.join('\n');
};

// ---------- IPAM imports: NetBox and phpIPAM ----------
// NetBox: IPAM → Prefixes → Import. Base networks become containers; VLANs are matched by VID, so import the VLANs
// (the "NetBox: VLANs" format) first.
const NB_STATUS = { used: 'active', reserved: 'reserved' };
const genNetbox = (list) => {
  const head = ['prefix', 'status', 'vlan', 'description', 'comments'];
  // A base network that isn't divided is its own subnet: one row, not a container plus a prefix.
  const keys = new Set(list.map((x) => x.key));
  const rowsOut = state.blocks.filter((b) => !keys.has(blockCidr(b))).map((b) => [blockCidr(b), 'container', '', b.label || '', 'Base network from IP Plan-O-Matic']);
  for (const x of list) rowsOut.push([x.key, NB_STATUS[x.meta.s] || 'reserved', x.meta.v || '', (x.meta.n || '').slice(0, 200), [x.group ? `Group: ${x.group}` : '', x.meta.o || ''].filter(Boolean).join('. ')]);
  return [head, ...rowsOut].map((r) => r.map(csvQ).join(',')).join('\n');
};
const genNetboxVlans = (list) => {
  const vlans = new Map();
  for (const x of list) if (x.meta.v && !vlans.has(x.meta.v)) vlans.set(x.meta.v, x.meta.n || `VLAN ${x.meta.v}`);
  const rowsOut = [...vlans].sort((a, b) => a[0] - b[0]).map(([vid, name]) => [vid, name.slice(0, 64), 'active']);
  return [['vid', 'name', 'status'], ...rowsOut].map((r) => r.map(csvQ).join(',')).join('\n');
};
// phpIPAM: Administration → Subnets → Import (or Import / export on a section). Map the columns when asked.
const genPhpipam = (list) => {
  const head = ['Section', 'Subnet', 'Mask', 'Description', 'VLAN', 'Master subnet'];
  const rowsOut = [], keys = new Set(list.map((x) => x.key));
  for (const b of state.blocks) if (!keys.has(blockCidr(b))) rowsOut.push(['IP Plan-O-Matic', ntoa(b.network), b.mask, b.label || blockCidr(b), '', '']);
  for (const x of list) {
    const base = blockCidr(state.blocks[x.bi]);
    rowsOut.push(['IP Plan-O-Matic', ntoa(x.addr), x.mask, x.meta.n || x.key, x.meta.v || '', base === x.key ? '' : base]);
  }
  return [head, ...rowsOut].map((r) => r.map(csvQ).join(',')).join('\n');
};

// base / platform / tree describe the first base network, so version-2 importers still work.

// ---------- More vendors ----------
const DHCP_FMTS = ['cisco', 'arista', 'junos', 'mikrotik', 'fortigate', 'panos', 'pfsense', 'opnsense', 'unifi', 'edgeos'];
const genArista = (list, dhcp) => {
  const v6x = v6ForExport();
  const out = ['! Generated by IP Plan-O-Matic for Arista EOS. Review before applying.', '! Replace <INTERFACE> and <DHCP_SERVER> placeholders.', '!'];
  if (v6x.any) out.push('ipv6 unicast-routing', '!');
  let lo = 0;
  for (const x of list) {
    const { info, meta } = x;
    out.push(`! ===== ${x.key}${meta.n ? '  ' + meta.n : ''}`);
    if (info.uF === null) { out.push('! skipped: no usable addresses on this platform', '!'); continue; }
    const r = routerIp(info);
    let ifname;
    if (x.mask === 32) ifname = `Loopback${lo++}`;
    else if (meta.v) { out.push(`vlan ${meta.v}`, `   name ${(meta.n || 'VLAN' + meta.v).replace(/\s+/g, '_').slice(0, 32)}`, '!'); ifname = `Vlan${meta.v}`; }
    else ifname = '<INTERFACE>';
    out.push(`interface ${ifname}`, `   description ${meta.n || x.key}`);
    if (ifname === '<INTERFACE>') out.push('   no switchport');
    out.push(`   ip address ${ntoa(r)}/${x.mask}`, ...v6x.lines(meta.v, (ip) => `   ipv6 address ${ip}`));
    if (dhcp && poolRange(info)) out.push('   ip helper-address <DHCP_SERVER>');
    out.push('   no shutdown', '!');
  }
  for (const p6 of v6x.rest()) {
    out.push(`! ===== ${p6.k}${p6.meta.n ? '  ' + p6.meta.n : ''} (IPv6)`);
    if (p6.meta.v) out.push(`vlan ${p6.meta.v}`, `   name ${(p6.meta.n || 'VLAN' + p6.meta.v).replace(/\s+/g, '_').slice(0, 32)}`, '!');
    out.push(`interface ${p6.meta.v ? 'Vlan' + p6.meta.v : '<INTERFACE>'}`, `   description ${p6.meta.n || p6.k}`);
    if (!p6.meta.v) out.push('   no switchport');
    out.push(`   ipv6 address ${p6.ip}`, '   no shutdown', '!');
  }
  return out.join('\n');
};
const genFortigate = (list, dhcp) => {
  const out = ['# Generated by IP Plan-O-Matic for FortiGate (FortiOS). Review before applying.', '# Replace <PARENT_INTERFACE> and <INTERFACE> placeholders; set the VDOM if you use more than root.', '', 'config system interface'];
  const dh = [];
  for (const x of list) {
    const { info, meta } = x;
    if (info.uF === null) continue;
    const r = routerIp(info);
    const name = meta.v ? `vlan${meta.v}` : '<INTERFACE>';
    out.push(`    edit "${name}"`, '        set vdom "root"', `        set ip ${ntoa(r)} ${ntoa(netmask(x.mask))}`, '        set allowaccess ping', `        set alias "${hq((meta.n || x.key).slice(0, 25))}"`, '        set role lan');
    if (meta.v) out.push('        set interface "<PARENT_INTERFACE>"', `        set vlanid ${meta.v}`);
    out.push('    next');
    const pr = dhcp && poolRange(info);
    if (pr) dh.push('    edit 0', '        set dns-service default', `        set default-gateway ${ntoa(r)}`, `        set netmask ${ntoa(netmask(x.mask))}`, `        set interface "${name}"`, '        config ip-range', '            edit 1', `                set start-ip ${ntoa(pr[0])}`, `                set end-ip ${ntoa(pr[1])}`, '            next', '        end', '    next');
  }
  out.push('end');
  if (dh.length) out.push('', 'config system dhcp server', ...dh, 'end');
  return out.join('\n');
};
const genPanos = (list, dhcp) => {
  const out = ['# Generated by IP Plan-O-Matic for Palo Alto PAN-OS (configure mode set commands). Review before committing.', '# Replace <PARENT_IF>, <INTERFACE>, <ZONE> and the virtual router name.', ''];
  for (const x of list) {
    const { info, meta } = x;
    out.push(`# ===== ${x.key}${meta.n ? '  ' + meta.n : ''}`);
    if (info.uF === null) { out.push('# skipped: no usable addresses on this platform', ''); continue; }
    const r = routerIp(info);
    let ifc;
    if (meta.v) {
      ifc = `<PARENT_IF>.${meta.v}`;
      const base = `set network interface ethernet <PARENT_IF> layer3 units ${ifc}`;
      out.push(`${base} tag ${meta.v}`, `${base} ip ${ntoa(r)}/${x.mask}`, `${base} comment "${hq(meta.n || x.key)}"`);
    } else {
      ifc = '<INTERFACE>';
      out.push(`set network interface ethernet ${ifc} layer3 ip ${ntoa(r)}/${x.mask}`, `set network interface ethernet ${ifc} comment "${hq(meta.n || x.key)}"`);
    }
    out.push(`set network virtual-router default interface ${ifc}`, `set zone <ZONE> network layer3 ${ifc}`);
    const pr = dhcp && poolRange(info);
    if (pr) {
      const d = `set network dhcp interface ${ifc} server`;
      out.push(`${d} ip-pool ${ntoa(pr[0])}-${ntoa(pr[1])}`, `${d} option gateway ${ntoa(r)}`, `${d} option subnet-mask ${ntoa(netmask(x.mask))}`, `${d} mode enabled`);
    }
    out.push('');
  }
  return out.join('\n');
};
// pfSense: a PHP script that pfSense runs itself, so it adds to the config (VLANs, interfaces, DHCP) instead of
// asking people to hand-merge config.xml, which pfSense can only restore a whole section at a time.
const phpq = (v) => `'${String(v).replace(/\\/g, '\\\\').replace(/'/g, "\\'")}'`;
const genPfsense = (list, dhcp) => {
  const out = ['<?php',
    '/*',
    ' * Generated by IP Plan-O-Matic for pfSense CE 2.7 or later / pfSense Plus 23.01 or later. Review before running.',
    ' * For each subnet with a VLAN ID it adds the VLAN on $parent, assigns it as a new OPT interface with the',
    ' * gateway address and, if listed, turns on a DHCP pool. It only adds: a VLAN or interface that already',
    ' * exists is skipped and left as it is. Back up first: Diagnostics > Backup & Restore.',
    ' *',
    ' * Run it one of two ways:',
    ' *  - Diagnostics > Command Prompt > Execute PHP Commands: paste everything below the <?php line, click Execute.',
    ' *  - Over SSH (console option 8): save it as /root/plan.php, then run  php /root/plan.php',
    ' * Set $dry_run = true first to see what it would do without changing anything.',
    ' *',
    ' * Afterwards add firewall rules for the new interfaces (Firewall > Rules): pfSense blocks traffic on a new',
    ' * interface until a rule allows it. DHCP pools use pfSense\'s DNS resolver as the DNS server.',
    ' */',
    "require_once('config.inc');",
    "require_once('util.inc');",
    "require_once('interfaces.inc');",
    "require_once('services.inc');",
    "require_once('filter.inc');",
    '',
    "$parent  = 'PARENT_IF';   // the trunk port the VLANs ride on, e.g. 'igb1' (Interfaces > Assignments lists them)",
    '$dry_run = false;         // true: print what would change and change nothing',
    '',
    '// VLAN, name, gateway address, prefix length, DHCP pool start, DHCP pool end (empty: no DHCP)',
    '$plan = ['];
  const vl = list.filter((x) => x.meta.v && x.info.uF !== null && x.mask <= 30);
  const skipped = list.length - vl.length;
  const nm = makeNamer('upper');
  for (const x of vl) {
    const pr = dhcp && poolRange(x.info);
    let n = nm(x).slice(0, 20);
    if (!/^[A-Z]/.test(n)) n = ('V' + n).slice(0, 20);
    out.push(`  [${Number(x.meta.v)}, ${phpq(n)}, '${ntoa(routerIp(x.info))}', ${x.mask}, '${pr ? ntoa(pr[0]) : ''}', '${pr ? ntoa(pr[1]) : ''}'],   // ${x.key}${x.meta.n ? ' ' + x.meta.n.replace(/\?>/g, '? >') : ''}`);
  }
  out.push('];');
  if (skipped) out.push(`// ${skipped} subnet${skipped > 1 ? 's' : ''} left out: a VLAN interface needs a VLAN ID, and a /30 or larger.`);
  if (!vl.length) out.push('// Nothing to add yet: give your subnets a VLAN ID first.');
  out.push('',
    "if (!function_exists('config_get_path')) { echo \"This script needs pfSense CE 2.7 / Plus 23.01 or later.\\n\"; return; }",
    "if ($parent === 'PARENT_IF' || !does_interface_exist($parent)) { echo \"Set \\$parent to your trunk port first (it is '$parent').\\n\"; return; }",
    '',
    "$vlans  = config_get_path('vlans/vlan', []);",
    "$ifaces = config_get_path('interfaces', []);",
    "$dhcpd  = config_get_path('dhcpd', []);",
    '$names  = [];',
    "foreach ($ifaces as $i) { $names[] = strtoupper($i['descr'] ?? ''); }",
    '$added  = [];',
    'foreach ($plan as $row) {',
    '  list($tag, $name, $ip, $bits, $from, $to) = $row;',
    '  $vlanif = "{$parent}.{$tag}";',
    '  foreach ($vlans as $v) {',
    "    if ($v['if'] === $parent && (int)$v['tag'] === $tag) { echo \"skip VLAN $tag: already on $parent\\n\"; continue 2; }",
    '  }',
    '  $n = 1;',
    '  while (isset($ifaces["opt$n"])) { $n++; }',
    '  $opt = "opt$n";',
    '  $descr = $name;',
    '  for ($k = 2; in_array(strtoupper($descr), $names, true); $k++) { $descr = "{$name}_{$k}"; }',
    '  $names[] = strtoupper($descr);',
    "  echo \"add VLAN $tag on $parent as $opt ($descr) $ip/$bits\" . ($from !== '' ? \", DHCP $from-$to\" : '') . \"\\n\";",
    "  $vlan = ['if' => $parent, 'tag' => (string)$tag, 'pcp' => '', 'descr' => $descr, 'vlanif' => $vlanif];",
    '  $vlans[] = $vlan;',
    "  $ifaces[$opt] = ['descr' => $descr, 'if' => $vlanif, 'enable' => '', 'ipaddr' => $ip, 'subnet' => (string)$bits, 'spoofmac' => ''];",
    "  if ($from !== '') { $dhcpd[$opt] = ['enable' => '', 'range' => ['from' => $from, 'to' => $to]]; }",
    '  $added[] = [$opt, $vlan];',
    '}',
    "if ($dry_run || !$added) { echo $dry_run ? \"Dry run: nothing changed.\\n\" : \"Nothing to add.\\n\"; return; }",
    '',
    "config_set_path('vlans/vlan', $vlans);",
    "config_set_path('interfaces', $ifaces);",
    "config_set_path('dhcpd', $dhcpd);",
    "write_config('IP Plan-O-Matic: added ' . count($added) . ' VLAN interface(s)');",
    'foreach ($added as $a) {',
    '  interface_vlan_configure($a[1]);',
    '  interface_configure($a[0], true);',
    '}',
    'services_dhcpd_configure();',
    'filter_configure();',
    "echo \"Done. Now add firewall rules for the new interfaces (Firewall > Rules).\\n\";");
  return out.join('\n');
};
const genAnsible = (list) => {
  const j = (v) => JSON.stringify(v);   // JSON strings are valid YAML scalars
  const out = ['---', '# Generated by IP Plan-O-Matic. Ansible variables, e.g. group_vars/all/subnets.yml', 'subnets:'];
  if (!list.length) out.push('  []');
  for (const x of list) {
    const { info, meta } = x;
    out.push(`  - name: ${j(meta.n || x.key)}`, `    cidr: ${j(x.key)}`, `    network: ${j(ntoa(x.addr))}`, `    prefix: ${x.mask}`, `    netmask: ${j(ntoa(netmask(x.mask)))}`);
    if (state.blocks.length > 1) out.push(`    base_network: ${j(blockCidr(state.blocks[x.bi]))}`);
    if (meta.v) out.push(`    vlan: ${Number(meta.v)}`);
    if (meta.z) out.push(`    zone: ${j(meta.z)}`);
    out.push(`    gateway: ${info.gw === null ? 'null' : j(ntoa(info.gw))}`, `    first_usable: ${info.uF === null ? 'null' : j(ntoa(info.uF))}`, `    last_usable: ${info.uL === null ? 'null' : j(ntoa(info.uL))}`, `    hosts: ${info.hosts}`, `    status: ${j(meta.s || 'free')}`);
    if (meta.o) out.push(`    notes: ${j(meta.o)}`);
  }
  return out.join('\n');
};

// ---------- Document tables (Markdown / HTML) ----------
const docTable = (list) => {
  const multi = state.blocks.length > 1, anyZone = list.some((x) => x.meta.z);
  const head = [...(multi ? ['Base network'] : []), 'Subnet', 'Name', 'VLAN', ...(anyZone ? ['Zone'] : []), 'Gateway', 'Usable range', 'Hosts', 'Status', 'Notes'];
  const rowsOut = list.map((x) => [
    ...(multi ? [blockCidr(state.blocks[x.bi])] : []), x.key, x.meta.n || '', x.meta.v || '', ...(anyZone ? [x.meta.z || ''] : []),
    x.info.gw === null ? '' : ntoa(x.info.gw), x.info.uF === null ? '' : (x.info.uF === x.info.uL ? ntoa(x.info.uF) : `${ntoa(x.info.uF)} – ${ntoa(x.info.uL)}`),
    fmtDoc(x.info.hosts), x.meta.s === 'used' ? 'In use' : x.meta.s === 'reserved' ? 'Reserved' : 'Free', x.meta.o || '',
  ]);
  return { head, rows: rowsOut, numeric: head.indexOf('Hosts') };
};
const genMarkdown = (list) => {
  const { head, rows: rr, numeric } = docTable(list);
  const cell = (v) => String(v).replace(/\|/g, '\\|').replace(/\r?\n/g, ' ');
  const out = [`| ${head.join(' | ')} |`, `|${head.map((h, i) => (i === numeric ? '---:' : '---')).join('|')}|`];
  for (const r of rr) out.push(`| ${r.map(cell).join(' | ')} |`);
  return out.join('\n');
};
const genHtml = (list) => {
  const { head, rows: rr, numeric } = docTable(list);
  const out = ['<table border="1" cellpadding="4" cellspacing="0" style="border-collapse:collapse;font-family:sans-serif;font-size:13px">', '  <thead>', `    <tr>${head.map((h) => `<th align="left">${esc(h)}</th>`).join('')}</tr>`, '  </thead>', '  <tbody>'];
  for (const r of rr) out.push(`    <tr>${r.map((v, i) => `<td${i === numeric ? ' align="right"' : ''}>${esc(v)}</td>`).join('')}</tr>`);
  out.push('  </tbody>', '</table>');
  return out.join('\n');
};

// ---------- Excel (.xlsx) without a library: a minimal SpreadsheetML package in a stored (uncompressed) zip ----------
// zipStore takes [name, text or bytes] pairs; the diagram's PowerPoint and Visio files use it too, with their own type.
const CRC_TABLE = (() => { const t = new Uint32Array(256); for (let n = 0; n < 256; n++) { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; t[n] = c >>> 0; } return t; })();
const crc32 = (b) => { let c = 0xffffffff; for (let i = 0; i < b.length; i++) c = CRC_TABLE[(c ^ b[i]) & 255] ^ (c >>> 8); return (c ^ 0xffffffff) >>> 0; };
/** @type {(files: [string, string | Uint8Array][], type?: string) => Blob} */
const zipStore = (files, type = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet') => {
  const enc = new TextEncoder(), parts = [], central = [];
  let off = 0;
  const u16 = (v) => [v & 255, (v >>> 8) & 255], u32 = (v) => [v & 255, (v >>> 8) & 255, (v >>> 16) & 255, (v >>> 24) & 255];
  for (const [name, text] of files) {
    const nb = enc.encode(name), data = typeof text === 'string' ? enc.encode(text) : text, crc = crc32(data);
    const common = [...u16(20), ...u16(0x0800), ...u16(0), ...u16(0), ...u16(0x21), ...u32(crc), ...u32(data.length), ...u32(data.length), ...u16(nb.length), ...u16(0)];
    const local = new Uint8Array([...u32(0x04034b50), ...common]);
    parts.push(local, nb, data);
    central.push(new Uint8Array([...u32(0x02014b50), ...u16(20), ...common, ...u16(0), ...u16(0), ...u16(0), ...u32(0), ...u32(off)]), nb);
    off += local.length + nb.length + data.length;
  }
  const cdSize = central.reduce((t, a) => t + a.length, 0);
  const end = new Uint8Array([...u32(0x06054b50), ...u16(0), ...u16(0), ...u16(files.length), ...u16(files.length), ...u32(cdSize), ...u32(off), ...u16(0)]);
  return new Blob([...parts, ...central, end], { type });
};
const colName = (i) => { let s2 = ''; i++; while (i) { const m = (i - 1) % 26; s2 = String.fromCharCode(65 + m) + s2; i = Math.floor((i - 1) / 26); } return s2; };
// eslint-disable-next-line no-control-regex -- XML 1.0 forbids these control characters, so they are dropped
const xe = (v) => String(v).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c])).replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/g, '');
const sheetXml = (head, data) => {
  const all = [head, ...data];
  const widths = head.map((_, c) => Math.min(60, Math.max(8, ...all.map((r) => String(r[c] ?? '').length + 2))));
  const rowsXml = all.map((r, ri) => `<row r="${ri + 1}">${r.map((v, ci) => {
    const ref = `${colName(ci)}${ri + 1}`;
    if (typeof v === 'number' && Number.isFinite(v)) return `<c r="${ref}"${ri ? '' : ' s="1"'}><v>${v}</v></c>`;
    if (v === '' || v == null) return '';
    return `<c r="${ref}" t="inlineStr"${ri ? '' : ' s="1"'}><is><t xml:space="preserve">${xe(v)}</t></is></c>`;
  }).join('')}</row>`).join('');
  return '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">' +
    '<sheetViews><sheetView workbookViewId="0"><pane ySplit="1" topLeftCell="A2" activePane="bottomLeft" state="frozen"/></sheetView></sheetViews>' +
    `<cols>${widths.map((w, i) => `<col min="${i + 1}" max="${i + 1}" width="${w}" customWidth="1"/>`).join('')}</cols>` +
    `<sheetData>${rowsXml}</sheetData><autoFilter ref="A1:${colName(head.length - 1)}${all.length}"/></worksheet>`;
};
const buildXlsx = () => {
  const sheets = [];
  const m = buildMatrix(false);
  sheets.push(['IPv4 plan', m.head, m.rows.map((r) => r.map((v, i) => (/^(VLAN|Hosts)$/.test(m.head[i]) && /^\d+$/.test(String(v)) ? Number(v) : v)))]);
  const v6rows = v6Walk().map((lf) => {
    const k = v6Key(lf.a, lf.m), mm = v6Get(k);
    return [k, mm.n || '', mm.v ? Number(mm.v) : '', mm.s || 'free', mm.o || '', fmt6(lf.a), fmt6(lf.a + size6(lf.m) - 1n), lf.m <= 64 ? `${pow2Text(64 - lf.m)} x /64` : `${pow2Text(128 - lf.m)} addresses`];
  });
  const hr = hostRows();
  if (hr.length) sheets.push(['IP addresses', ['IP address', 'Name', 'MAC address', 'Notes', 'Subnet', 'Subnet name', 'VLAN'], hr.map((h) => [h.ip, h.n, h.m, h.o, h.subnet, h.sn, h.v ? Number(h.v) : ''])]);
  if (v6.root.c || Object.keys(v6.meta).length) sheets.push(['IPv6 plan', ['Prefix', 'Name', 'VLAN', 'Status', 'Notes', 'First address', 'Last address', 'Size'], v6rows]);
  /** @type {[string, string][]} */
  const files = [
    ['[Content_Types].xml', '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/><Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/>' +
      sheets.map((_, i) => `<Override PartName="/xl/worksheets/sheet${i + 1}.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>`).join('') + '</Types>'],
    ['_rels/.rels', '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/></Relationships>'],
    ['xl/workbook.xml', '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets>' +
      sheets.map(([n], i) => `<sheet name="${xe(n)}" sheetId="${i + 1}" r:id="rId${i + 1}"/>`).join('') + '</sheets>' +
      `<definedNames>${sheets.map(([n, h, d], i) => `<definedName name="_xlnm._FilterDatabase" localSheetId="${i}" hidden="1">'${xe(n)}'!$A$1:$${colName(h.length - 1)}$${d.length + 1}</definedName>`).join('')}</definedNames></workbook>`],
    ['xl/_rels/workbook.xml.rels', '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">' +
      sheets.map((_, i) => `<Relationship Id="rId${i + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet${i + 1}.xml"/>`).join('') +
      `<Relationship Id="rId${sheets.length + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/></Relationships>`],
    ['xl/styles.xml', '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n<styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><fonts count="2"><font><sz val="11"/><name val="Calibri"/></font><font><b/><sz val="11"/><name val="Calibri"/></font></fonts><fills count="2"><fill><patternFill patternType="none"/></fill><fill><patternFill patternType="gray125"/></fill></fills><borders count="1"><border><left/><right/><top/><bottom/><diagonal/></border></borders><cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs><cellXfs count="2"><xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/><xf numFmtId="0" fontId="1" fillId="0" borderId="0" xfId="0" applyFont="1"/></cellXfs></styleSheet>'],
    ...sheets.map(([, h, d], i) => /** @type {[string, string]} */ ([`xl/worksheets/sheet${i + 1}.xml`, sheetXml(h, d)])),
  ];
  return zipStore(files);
};
const genJson = () => JSON.stringify({
  format: 'subnet-planner',
  version: 3,
  base: blockCidr(state.blocks[0]),
  platform: state.blocks[0].cloud,
  gateway: settings.gw,
  tree: packBits(treeToBits(state.blocks[0].root)),
  blocks: state.blocks.map((b) => ({ base: blockCidr(b), label: b.label || '', platform: b.cloud, tree: packBits(treeToBits(b.root)), ...(b.v6 ? { dualStack: true, ...(b.v6p ? { ipv6Range: b.v6p } : {}) } : {}) })),
  ...(state.peers ? { peering: { pairs: state.peers.filter(([a, b]) => blockByCidr(a) && blockByCidr(b)), options: state.po } } : {}),
  subnets: allRows().map((r) => {
    const m = getMeta(r.key), i = hostInfo(r.addr, r.mask, r.cloud);
    return {
      cidr: r.key, ...(state.blocks.length > 1 ? { network: blockCidr(state.blocks[r.bi]) } : {}),
      name: m.n || '', vlan: m.v ? Number(m.v) : null, ...(m.z ? { zone: m.z } : {}), status: m.s || 'free', note: m.o || '', ...(m.d ? { cloudService: m.d } : {}),
      netmask: ntoa(netmask(r.mask)), gateway: i.gw === null ? null : ntoa(i.gw),
      firstUsable: i.uF === null ? null : ntoa(i.uF), lastUsable: i.uL === null ? null : ntoa(i.uL), hosts: i.hosts,
    };
  }),
  ...(hostRows().length ? { hosts: hostRows().map((h) => ({ ip: h.ip, name: h.n, mac: h.m || null, note: h.o, subnet: h.subnet })) } : {}),
  ipv6: {
    prefix: v6Key(v6.net, v6.mask), tree: v6TreeStr(v6.root),
    names: Object.fromEntries(Object.entries(v6.meta).filter(([, m]) => m.n).map(([k, m]) => [k, m.n])),
    meta: v6.meta,
  },
}, null, 2);
// Every assigned address in the plan, in address order, with its subnet.
const hostRows = () => {
  const leaves = allRows();
  return hostIps().filter((ip) => blockOf(ip) >= 0).map((ip) => {
    const h = state.hosts[ntoa(ip)], leaf = leaves.find((r) => inBlock(ip, r.addr, r.mask)), m = leaf ? getMeta(leaf.key) : {};
    return { ip: ntoa(ip), n: h.n || '', m: h.m || '', o: h.o || '', subnet: leaf ? leaf.key : '', sn: m.n || '', v: m.v || '' };
  });
};
const genHostsCsv = () => [['IP address', 'Name', 'MAC address', 'Notes', 'Subnet', 'Subnet name', 'VLAN'], ...hostRows().map((h) => [h.ip, h.n, h.m, h.o, h.subnet, h.sn, h.v])]
  .map((r) => r.map(csvQ).join(',')).join('\n');

// ---------- The plan as an image: SVG drawn from the data, and a PNG made from the SVG ----------
// Light colors whatever the page theme, because the image goes into documents. System fonts only: an SVG drawn
// onto a canvas can't load web fonts.
const IMG = {
  sans: "-apple-system, 'Segoe UI', Helvetica, Arial, sans-serif", mono: "Menlo, Consolas, 'DejaVu Sans Mono', monospace",
  text: '#161a22', muted: '#5d6573', border: '#e2e5eb', head: '#f3f6fa',
  free: ['#f3f6fa', '#e2e5eb', '#d5dae2'], used: ['#e3f4ea', '#1d8a4e', '#1d8a4e'], reserved: ['#fff3cf', '#e8b931', '#e8b931'],
};
const IMG_MAX_ROWS = 600;   // table rows across the whole image; a CSV has the rest
const genPlanSvg = (list) => {
  const W = 960, P = 24, w = W - 2 * P, out = [];
  let y = P;
  // Text that fits a width: an estimate from the font size, since an SVG string can't be measured here.
  const fit = (s, px, fs, mono) => { s = String(s ?? ''); const n = Math.max(1, Math.floor(px / (fs * (mono ? 0.62 : 0.56)))); return s.length > n ? s.slice(0, Math.max(1, n - 1)) + '…' : s; };
  const text = (x, yy, s, o = {}) => out.push(`<text x="${x}" y="${yy}" font-size="${o.fs || 12}"${o.mono ? ` font-family="${IMG.mono}"` : ''}${o.bold ? ' font-weight="600"' : ''} fill="${o.fill || IMG.text}"${o.anchor ? ` text-anchor="${o.anchor}"` : ''}>${esc(s)}</text>`);
  const look = (r) => {
    const m = getMeta(r.key);
    if (mapMode === 'vlan') return m.v ? [`hsl(${vlanHue(m.v)} 72% 88%)`, `hsl(${vlanHue(m.v)} 72% 50%)`, `hsl(${vlanHue(m.v)} 72% 55%)`] : IMG.free;
    return IMG[m.s] || IMG.free;
  };
  const all = allRows(), usedA = all.filter((r) => getMeta(r.key).s === 'used').reduce((s, r) => s + size(r.mask), 0);
  const totalA = state.blocks.reduce((s, b) => s + size(b.mask), 0);
  text(P, y + 22, state.blocks.length === 1 ? blockName(state.blocks[0]) : `${state.blocks.length} networks`, { fs: 22, bold: true });
  text(W - P, y + 22, new Date().toISOString().slice(0, 10), { fs: 12, fill: IMG.muted, anchor: 'end' });
  y += 34;
  const one = state.blocks.length === 1;
  text(P, y + 14, `${fmtDoc(all.length)} subnet${all.length === 1 ? '' : 's'} · ${Math.round((100 * usedA) / totalA)}% of ${fmtDoc(totalA)} addresses in use${one ? ' · ' + CLOUDS[state.blocks[0].cloud].label : ''}`, { fs: 13, fill: IMG.muted });
  // Legend
  let lx = P;
  const legend = mapMode === 'vlan'
    ? [...new Set(all.map((r) => getMeta(r.key).v).filter(Boolean))].sort((a, b) => a - b).slice(0, 12).map((v) => [`VLAN ${v}`, [`hsl(${vlanHue(v)} 72% 88%)`, `hsl(${vlanHue(v)} 72% 50%)`]]).concat([['No VLAN', IMG.free]])
    : [['Free', IMG.free], ['In use', IMG.used], ['Reserved', IMG.reserved]];
  y += 26;
  for (const [label, c] of legend) {
    out.push(`<rect x="${lx}" y="${y + 3}" width="12" height="12" rx="2" fill="${c[0]}" stroke="${c[1]}"/>`);
    text(lx + 17, y + 13, label, { fs: 12, fill: IMG.muted });
    lx += 30 + label.length * 7;
  }
  y += 28;
  let rowsLeft = IMG_MAX_ROWS, cut = 0;
  state.blocks.forEach((b, bi) => {
    const leaves = collectLeaves(b);
    if (!one) {   // with one network, the title above already names it
      out.push(`<line x1="${P}" y1="${y}" x2="${W - P}" y2="${y}" stroke="${IMG.border}"/>`);
      y += 24;
      text(P, y, blockName(b), { fs: 16, bold: true });
      text(W - P, y, `${CLOUDS[b.cloud].label} · ${fmtDoc(leaves.length)} subnet${leaves.length === 1 ? '' : 's'}`, { fs: 12, fill: IMG.muted, anchor: 'end' });
      y += 12;
    }
    // Address map: the same grid as on the Plan tab.
    const u = Math.min(b.mask + 8, 32), cells = size(b.mask) / size(u), cols = Math.min(16, cells), gap = 3;
    const cw = (w - (cols - 1) * gap) / cols, nRows = Math.ceil(cells / cols), ch = nRows > 8 ? 16 : 26;   // a full 16-row map stays compact
    text(P, y + 14, `Each square is a /${u}`, { fs: 11, fill: IMG.muted });
    y += 22;
    let i = 0;
    while (i < leaves.length) {
      const r = leaves[i], cell = Math.floor((r.addr - b.network) / size(u)), col = cell % cols, row = Math.floor(cell / cols);
      const x = P + col * (cw + gap), yy = y + row * (ch + gap);
      if (r.mask <= u) {
        const k = size(r.mask) / size(u), sc = Math.min(k, cols), sr = Math.max(1, k / cols);
        const rw = sc * (cw + gap) - gap, rh = sr * (ch + gap) - gap, c = look(r);
        out.push(`<rect x="${x.toFixed(1)}" y="${yy}" width="${rw.toFixed(1)}" height="${rh}" rx="4" fill="${c[0]}" stroke="${c[1]}"/>`);
        if (k >= 2) text((x + 6).toFixed(1), yy + (ch > 20 ? 17 : 12), fit(getMeta(r.key).n || `/${r.mask}`, rw - 10, 11), { fs: ch > 20 ? 11 : 10 });
        i++;
      } else {
        const start = i, cellEnd = b.network + (cell + 1) * size(u);
        while (i < leaves.length && leaves[i].addr < cellEnd) i++;
        out.push(`<rect x="${x.toFixed(1)}" y="${yy}" width="${cw.toFixed(1)}" height="${ch}" rx="4" fill="#ffffff" stroke="${IMG.border}"/>`);
        let sx = x + 1.5;
        for (const s of leaves.slice(start, i)) {
          const sw = Math.max(1, ((cw - 3) * size(s.mask)) / size(u) - 1);
          out.push(`<rect x="${sx.toFixed(1)}" y="${yy + 1.5}" width="${sw.toFixed(1)}" height="${ch - 3}" rx="1.5" fill="${look(s)[2]}"/>`);
          sx += sw + 1;
        }
      }
    }
    y += nRows * (ch + gap) + 14;
    // Table: the subnets the Include setting picks for this network.
    const items = list.filter((x) => x.bi === bi);
    if (!items.length) return;
    /** @type {[x: number, head: string, width: number, mono?: boolean, anchor?: string][]} */
    const C = [[0, 'Subnet', 150, true], [150, 'Name', 250], [400, 'VLAN', 60], [460, 'Usable range', 270, true], [730, 'Hosts', 90, false, 'end'], [820, 'Status', 92]];
    out.push(`<rect x="${P}" y="${y}" width="${w}" height="24" fill="${IMG.head}"/>`);
    for (const [cx, h, cwid, , anchor] of C) text(anchor ? P + cx + cwid - 8 : P + cx + 8, y + 16, h.toUpperCase(), { fs: 10.5, bold: true, fill: IMG.muted, anchor });
    y += 24;
    for (const x of items) {
      if (rowsLeft <= 0) { cut++; continue; }
      rowsLeft--;
      const range = x.info.uF === null ? '' : x.info.uF === x.info.uL ? ntoa(x.info.uF) : `${ntoa(x.info.uF)} – ${ntoa(x.info.uL)}`;
      const vals = [x.key, x.meta.n || '', x.meta.v || '', range, fmtDoc(x.info.hosts), x.meta.s === 'used' ? 'In use' : x.meta.s === 'reserved' ? 'Reserved' : 'Free'];
      C.forEach(([cx, , cwid, mono, anchor], ci) => text(anchor ? P + cx + cwid - 8 : P + cx + 8, y + 15, fit(vals[ci], cwid - 14, 12, mono), { fs: 12, mono, anchor }));
      out.push(`<line x1="${P}" y1="${y + 22}" x2="${W - P}" y2="${y + 22}" stroke="${IMG.border}"/>`);
      y += 22;
    }
    y += 10;
  });
  if (cut) { y += 6; text(P, y + 12, `…and ${fmtDoc(cut)} more subnet${cut === 1 ? '' : 's'}. Export CSV or Excel for the full list.`, { fs: 12, fill: IMG.muted }); y += 20; }
  y += 14;
  text(P, y + 12, 'Made with IP Plan-O-Matic · crockerfeller.github.io/IP-Plan-O-Matic', { fs: 11, fill: IMG.muted });
  y += 12 + P;
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${Math.ceil(y)}" viewBox="0 0 ${W} ${Math.ceil(y)}" font-family="${IMG.sans}">\n<rect width="100%" height="100%" fill="#ffffff"/>\n${out.join('\n')}\n</svg>\n`;
};
// PNG at twice the size for sharp text, smaller if that would make a canvas taller than browsers allow.
const svgToPng = (svg) => new Promise((res, rej) => {
  const dims = /width="(\d+)" height="(\d+)"/.exec(svg);
  if (!dims) { rej(new Error('svg size')); return; }
  const w = Number(dims[1]), h = Number(dims[2]), scale = Math.min(2, 16000 / h);
  const img = new Image(), url = URL.createObjectURL(new Blob([svg], { type: 'image/svg+xml' }));
  img.onload = () => {
    const c = document.createElement('canvas');
    c.width = Math.round(w * scale); c.height = Math.round(h * scale);
    const g = c.getContext('2d');
    // No 2-D context (a canvas too big for this device's memory): fail the export instead of leaving it hanging.
    if (!g) { URL.revokeObjectURL(url); rej(new Error('png')); return; }
    g.scale(scale, scale); g.drawImage(img, 0, 0);
    URL.revokeObjectURL(url);
    c.toBlob((b) => (b ? res(b) : rej(new Error('png'))), 'image/png');
  };
  img.onerror = () => { URL.revokeObjectURL(url); rej(new Error('svg')); };
  img.src = url;
});

// ---------- Ubiquiti ----------
// UniFi Network: one network per VLAN, created through the Network application's API (the same call its Settings > Networks page makes).
const shq = (s) => String(s).replace(/'/g, `'\\''`);   // inside a single-quoted shell string
const genUnifi = (list, dhcp) => {
  const out = ['#!/usr/bin/env bash',
    '# Generated by IP Plan-O-Matic for Ubiquiti UniFi Network. Review before running.',
    '# Creates each subnet with a VLAN as a network (Settings > Networks) on a UniFi OS console:',
    '# Dream Machine, Cloud Gateway, Dream Router, Cloud Key Gen2 or UniFi OS Server, running Network 9 or later.',
    '# Make an API key in UniFi Network under Settings > Control Plane > Integrations, then run:',
    '#   UNIFI_HOST=192.168.1.1 UNIFI_API_KEY=your-key bash subnet-plan-unifi.sh',
    '# DRY_RUN=1 prints each request instead of sending it. UNIFI_SITE picks a site other than "default".',
    '# Networks whose name or VLAN already exists are refused by UniFi; the script carries on with the rest.',
    'set -u',
    'HOST="${UNIFI_HOST:?Set UNIFI_HOST to the console address}"',
    'KEY="${UNIFI_API_KEY:-}"',
    'API="https://$HOST/proxy/network/api/s/${UNIFI_SITE:-default}/rest/networkconf"',
    'add() {',
    '  echo "== $1"',
    '  if [ "${DRY_RUN:-0}" = 1 ]; then echo "POST $API"; echo "$2"; return; fi',
    '  [ -n "$KEY" ] || { echo "Set UNIFI_API_KEY (or DRY_RUN=1)"; exit 1; }',
    '  # -k: consoles use a self-signed certificate',
    `  curl -sSk -X POST "$API" -H "X-API-KEY: $KEY" -H 'Content-Type: application/json' -H 'Accept: application/json' --data "$2"; echo`,
    '}', ''];
  const vl = list.filter((x) => x.meta.v && x.info.uF !== null && x.mask <= 30);
  const skipped = list.length - vl.length;
  if (!vl.length) { out.push('# Nothing to export: give your subnets a VLAN ID first (UniFi’s untagged network is the Default one).'); return out.join('\n'); }
  if (skipped) out.push(`# ${skipped} subnet${skipped > 1 ? 's' : ''} left out: UniFi networks need a VLAN ID, and a /30 or larger.`, '');
  const names = new Set();
  for (const x of vl) {
    const { info, meta } = x;
    let name = (meta.n || `VLAN ${meta.v}`).replace(/\s+/g, ' ').trim().slice(0, 64), u = name, i = 2;
    while (names.has(u.toLowerCase())) u = `${name.slice(0, 60)} ${i++}`;
    names.add(u.toLowerCase());
    const conf = { name: u, purpose: 'corporate', networkgroup: 'LAN', enabled: true, ip_subnet: `${ntoa(routerIp(info))}/${x.mask}`, vlan_enabled: true, vlan: Number(meta.v) };
    const pr = dhcp && poolRange(info);
    if (pr) Object.assign(conf, { dhcpd_enabled: true, dhcpd_start: ntoa(pr[0]), dhcpd_stop: ntoa(pr[1]), dhcpd_leasetime: 86400 });
    else conf.dhcpd_enabled = false;
    out.push(`add '${shq(`${u} (${x.key}, VLAN ${meta.v})`)}' '${shq(JSON.stringify(conf))}'`);
  }
  return out.join('\n');
};
// EdgeRouter (EdgeOS / Vyatta): set commands for configure mode.
const genEdgeos = (list, dhcp) => {
  const nm = makeNamer('upper');
  const v6x = v6ForExport();
  const sq = (s) => String(s).replace(/'/g, '').slice(0, 64);
  const out = ['# Generated by IP Plan-O-Matic for Ubiquiti EdgeRouter (EdgeOS). Review before committing.',
    '# Paste into the CLI, then check with "compare" before "commit" and "save".',
    '# Replace <PARENT_IF> with the trunk port (eth1...). On a switch0 port group use "interfaces switch switch0 vif" instead.',
    '# Replace <INTERFACE> for subnets without a VLAN, and <DNS_SERVER> in the DHCP pools.', '', 'configure', ''];
  const ifOf = (vlan) => (vlan ? `ethernet <PARENT_IF> vif ${vlan}` : 'ethernet <INTERFACE>');
  for (const x of list) {
    const { info, meta } = x;
    out.push(`# ===== ${x.key}${meta.n ? '  ' + meta.n : ''}`);
    if (info.uF === null) { out.push('# skipped: no usable addresses on this platform', ''); continue; }
    const r = routerIp(info), ifc = `set interfaces ${ifOf(meta.v)}`;
    out.push(`${ifc} address ${ntoa(r)}/${x.mask}`, `${ifc} description '${sq(meta.n || x.key)}'`, ...v6x.lines(meta.v, (ip) => `${ifc} address ${ip}`));
    const pr = dhcp && poolRange(info);
    if (pr) {
      const d = `set service dhcp-server shared-network-name ${nm(x)}`;
      out.push(`${d} authoritative enable`, `${d} subnet ${x.key} default-router ${ntoa(r)}`, `${d} subnet ${x.key} dns-server <DNS_SERVER>`,
        `${d} subnet ${x.key} lease 86400`, `${d} subnet ${x.key} start ${ntoa(pr[0])} stop ${ntoa(pr[1])}`);
    }
    out.push('');
  }
  for (const p6 of v6x.rest()) {
    const ifc = `set interfaces ${ifOf(p6.meta.v)}`;
    out.push(`# ===== ${p6.k}${p6.meta.n ? '  ' + p6.meta.n : ''} (IPv6)`, `${ifc} address ${p6.ip}`, `${ifc} description '${sq(p6.meta.n || p6.k)}'`, '');
  }
  out.push('compare', '# commit', '# save', '# exit');
  return out.join('\n');
};

// OPNsense: its API can create VLANs and Kea DHCP subnets, but released versions can't assign interfaces through it,
// so the script runs in two parts with the assignment done in the web UI between them.
const genOpnsense = (list, dhcp) => {
  const vl = list.filter((x) => x.meta.v && x.info.uF !== null && x.mask <= 30);
  const skipped = list.length - vl.length;
  const nm = makeNamer('upper');
  const rows = vl.map((x) => {
    const pr = dhcp && poolRange(x.info);
    return { tag: Number(x.meta.v), dev: `vlan0${Number(x.meta.v)}`, name: (x.meta.n || `VLAN ${x.meta.v}`).replace(/\s+/g, ' ').trim().slice(0, 60), opt: nm(x).slice(0, 20),
      gw: ntoa(routerIp(x.info)), key: x.key, mask: x.mask, pool: pr ? `${ntoa(pr[0])}-${ntoa(pr[1])}` : '' };
  });
  const sj = (v) => `'${shq(JSON.stringify(v))}'`;   // a JSON string, safe inside a single-quoted shell word
  const out = ['#!/usr/bin/env bash',
    '# Generated by IP Plan-O-Matic for OPNsense 24.7 or later. Review before running.',
    '# Uses the OPNsense API. Make a key in System > Access > Users > (your user) > API keys; it downloads a',
    '# file with the key and secret. The API can create VLANs and Kea DHCP subnets, but released versions of',
    '# OPNsense can\'t assign interfaces through it, so this runs in two parts:',
    '#   1.  OPN_HOST=192.168.1.1 OPN_KEY=... OPN_SECRET=... PARENT=igb1 bash subnet-plan-opnsense.sh vlans',
    '#       creates the VLANs on PARENT (your trunk port) and prints what to assign in the web UI.',
    '#   2.  Assign them as the script says (Interfaces > Assignments), then:',
    '#       OPN_HOST=... OPN_KEY=... OPN_SECRET=... bash subnet-plan-opnsense.sh dhcp',
    '#       adds a Kea DHCPv4 subnet for each, with its pool, gateway and DNS server.',
    '# DRY_RUN=1 prints each request instead of sending it. "steps" prints the assignment list again.',
    '# OPNsense refuses a VLAN or subnet that already exists; the script shows its answer and carries on.',
    'set -u',
    'HOST="${OPN_HOST:-}"; PARENT="${PARENT:-}"',
    'api() {   # api METHOD PATH [JSON]',
    '  if [ "${DRY_RUN:-0}" = 1 ]; then echo "$1 https://${HOST:-OPN_HOST}/api/$2 ${3:-}"; return; fi',
    '  local r body="${3:-}"',
    '  [ -n "$body" ] || body=\'{}\'',
    `  r=$(curl -sSk -u "$OPN_KEY:$OPN_SECRET" -X "$1" "https://$HOST/api/$2" -H 'Content-Type: application/json' --data "$body") || { echo "   could not reach https://$HOST"; return 1; }`,
    '  case "$r" in *\'"saved"\'*|*\'"ok"\'*) echo "   ok";; *) echo "   OPNsense said: $r";; esac',
    '}',
    'need() {',
    '  [ "${DRY_RUN:-0}" = 1 ] && return',
    '  [ -n "$HOST" ] && [ -n "${OPN_KEY:-}" ] && [ -n "${OPN_SECRET:-}" ] || { echo "Set OPN_HOST, OPN_KEY and OPN_SECRET (or DRY_RUN=1)."; exit 1; }',
    '}',
    ''];
  if (skipped) out.push(`# ${skipped} subnet${skipped > 1 ? 's' : ''} left out: a VLAN interface needs a VLAN ID, and a /30 or larger.`, '');
  // VLANs
  out.push('vlans() {', '  need', '  [ -n "$PARENT" ] || [ "${DRY_RUN:-0}" = 1 ] || { echo "Set PARENT to your trunk port, e.g. PARENT=igb1"; exit 1; }');
  for (const r of rows) {
    out.push(`  echo "VLAN ${r.tag} on \${PARENT:-PARENT} as ${r.dev}"`,
      `  api POST interfaces/vlan_settings/add_item "{\\"vlan\\":{\\"if\\":\\"\${PARENT:-PARENT}\\",\\"tag\\":\\"${r.tag}\\",\\"pcp\\":\\"0\\",\\"proto\\":\\"\\",\\"vlanif\\":\\"${r.dev}\\",\\"descr\\":"${sj(r.name)}"}}"`);
  }
  out.push('  echo "Applying the VLANs"', '  api POST interfaces/vlan_settings/reconfigure', '  steps', '}', '');
  // Assignment checklist
  out.push('steps() {', '  cat <<\'STEPS\'', '',
    'Now in the OPNsense web UI:',
    ' 1. Interfaces > Assignments: add each device below. Then open each new interface, tick Enable,',
    '    set the description, IPv4 Configuration Type "Static IPv4" and the address, and Save. Apply.',
    ' 2. Firewall > Rules: add rules for the new interfaces (OPNsense blocks traffic on them until you do).',
    dhcp && rows.some((r) => r.pool) ? ' 3. Run this script again with "dhcp" to add the DHCP pools.' : '',
    '',
    '   Device      VLAN   Description            Address');
  for (const r of rows) out.push(`   ${r.dev.padEnd(11)} ${String(r.tag).padEnd(6)} ${r.opt.padEnd(22)} ${r.gw}/${r.mask}`);
  out.push('STEPS', '}', '');
  // Kea DHCP
  out.push('dhcp() {', '  need');
  const pools = rows.filter((r) => r.pool);
  if (!pools.length) out.push(`  echo "${dhcp ? 'No subnet here is big enough for a DHCP pool.' : 'This export was made with DHCP pools turned off.'}"`);
  for (const r of pools) {
    // option_data_autocollect off, or OPNsense replaces the gateway and DNS server with its own guess.
    const body = { subnet4: { subnet: r.key, pools: r.pool, option_data_autocollect: '0', option_data: { routers: r.gw, domain_name_servers: r.gw }, description: r.name } };
    out.push(`  echo "DHCP ${r.key}: ${r.pool}"`, `  api POST kea/dhcpv4/add_subnet ${sj(body)}`);
  }
  if (pools.length) out.push('  echo "Applying Kea"', '  api POST kea/service/reconfigure',
    '  echo "Last step: Services > Kea DHCP > Kea DHCPv4 > Settings: tick Enabled, select the new interfaces, Apply."',
    '  echo "(If OPNsense still uses ISC DHCP or Dnsmasq for DHCP, turn that off on these interfaces first.)"');
  out.push('}', '',
    'case "${1:-}" in',
    '  vlans) vlans;;',
    '  dhcp) dhcp;;',
    '  steps) steps;;',
    '  *) echo "Usage: bash $0 vlans | dhcp | steps   (see the notes at the top)"; exit 1;;',
    'esac');
  if (!rows.length) return out.slice(0, 13).concat('', '# Nothing to export: give your subnets a VLAN ID first.').join('\n');
  return out.join('\n');
};
