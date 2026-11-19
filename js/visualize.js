// IP Plan-O-Matic: The Visualize tab: a diagram of the plan's networks in each cloud's own style, with PNG, SVG, PowerPoint and Visio downloads.
// One of the app's plain scripts (js/*.js): index.html loads them in order and they share one scope, so each can use
// what the ones before it define. Plain scripts, not modules, so a downloaded copy still opens from disk.
'use strict';

// One layout, drawn three ways. vzLayout turns the plan into boxes, text, icons and lines measured in pixels (96 to the
// inch); vzSvg draws them on screen and for PNG and SVG, and vzPptx and vzVsdx write the same shapes as native,
// editable PowerPoint and Visio shapes. The colors follow each cloud's own architecture diagrams (AWS's purple VPCs and
// teal Availability Zones, Azure blue, Google's four colors, Oracle red); the icons are the app's own drawings.

// ---------- Look ----------
const VZ_SANS = 'Arial, Helvetica, sans-serif', VZ_MONO = "Consolas, Menlo, 'DejaVu Sans Mono', monospace";
const VZ_INK = '#16191F', VZ_MUTED = '#5F6B7A';
/** @typedef {{ net: string, sec: string, compute: string, data: string, storage: string, k8s: string, mgmt: string, users: string }} VzCats */
/** Per platform: the outer frame, the network box, zone columns, subnet tiles, icon colors by category, how networks join.
    @typedef {{ cloud: string, brand: string, bar?: string[], net: string, netStroke: string, netFill: string, netIcon: string, r: number,
      zone: string, zoneStroke: string, zoneText: string, zoneFill: string, zoneDash: boolean, tileFill: string, tileStroke: string,
      stripe?: boolean, pubPriv?: boolean, cat: VzCats, peer: string }} VzStyle */
/** @type {Record<string, VzStyle>} */
const VZ_STYLE = {
  aws: { cloud: 'AWS Cloud', brand: '#232F3E', net: 'VPC', netStroke: '#8C4FFF', netFill: '#FFFFFF', netIcon: '#8C4FFF', r: 0,
    zone: 'Availability Zone', zoneStroke: '#00A4A6', zoneText: '#00686A', zoneFill: '#FFFFFF', zoneDash: true,
    tileFill: '#E6F6F7', tileStroke: '#00A4A6', pubPriv: true, peer: 'VPC peering',
    cat: { net: '#8C4FFF', sec: '#DD344C', compute: '#ED7100', data: '#C925D1', storage: '#7AA116', k8s: '#ED7100', mgmt: '#E7157B', users: '#8C4FFF' } },
  azure: { cloud: 'Microsoft Azure', brand: '#0078D4', net: 'VNet', netStroke: '#0078D4', netFill: '#F5FAFE', netIcon: '#0078D4', r: 6,
    zone: 'Zone', zoneStroke: '#8DC3EC', zoneText: '#005A9E', zoneFill: '#FFFFFF', zoneDash: true,
    tileFill: '#FFFFFF', tileStroke: '#9CCBF0', peer: 'VNet peering',
    cat: { net: '#0078D4', sec: '#C50F1F', compute: '#5C2E91', data: '#0F6CBD', storage: '#107C10', k8s: '#326CE5', mgmt: '#605E5C', users: '#0078D4' } },
  gcp: { cloud: 'Google Cloud', brand: '#4285F4', bar: ['#4285F4', '#EA4335', '#FBBC04', '#34A853'], net: 'VPC network', netStroke: '#4285F4', netFill: '#F8F9FA', netIcon: '#4285F4', r: 8,
    zone: 'Region', zoneStroke: '#DADCE0', zoneText: '#1A73E8', zoneFill: '#FFFFFF', zoneDash: false,
    tileFill: '#FFFFFF', tileStroke: '#DADCE0', stripe: true, peer: 'VPC Network Peering',
    cat: { net: '#4285F4', sec: '#EA4335', compute: '#34A853', data: '#4285F4', storage: '#F9AB00', k8s: '#4285F4', mgmt: '#5F6368', users: '#4285F4' } },
  oci: { cloud: 'Oracle Cloud Infrastructure', brand: '#C74634', net: 'VCN', netStroke: '#C74634', netFill: '#FFFFFF', netIcon: '#C74634', r: 4,
    zone: 'Availability domain', zoneStroke: '#9E9892', zoneText: '#5C5550', zoneFill: '#FFFFFF', zoneDash: true,
    tileFill: '#FBF9F8', tileStroke: '#9E9892', pubPriv: true, peer: 'Peering',
    cat: { net: '#C74634', sec: '#AE562C', compute: '#2C5967', data: '#312D2A', storage: '#759C6C', k8s: '#2C5967', mgmt: '#5C5550', users: '#C74634' } },
  std: { cloud: 'On-premises', brand: '#475569', net: 'Site', netStroke: '#475569', netFill: '#F8FAFC', netIcon: '#475569', r: 6,
    zone: 'Zone', zoneStroke: '#CBD5E1', zoneText: '#475569', zoneFill: '#FFFFFF', zoneDash: true,
    tileFill: '#FFFFFF', tileStroke: '#CBD5E1', stripe: true, peer: 'Link',
    cat: { net: '#2B65D8', sec: '#DC2626', compute: '#0E7490', data: '#9333EA', storage: '#15803D', k8s: '#326CE5', mgmt: '#475569', users: '#7C3AED' } },
};
const VZ_ORDER = ['std', 'aws', 'azure', 'gcp', 'oci'];

// Icons: 24×24 line drawings in currentColor, drawn white on a colored square.
const VZ_GLYPH = {
  subnet: '<path d="M8 6l-5 6 5 6M16 6l5 6-5 6"/><circle cx="8.5" cy="12" r="1" fill="currentColor"/><circle cx="12" cy="12" r="1" fill="currentColor"/><circle cx="15.5" cy="12" r="1" fill="currentColor"/>',
  cloud: '<path d="M7 18.5h10.5a4 4 0 0 0 .6-7.95A6 6 0 0 0 6.4 9.6 4.5 4.5 0 0 0 7 18.5z"/>',
  site: '<path d="M4 20V5.5L12 3v17M12 9h8v11M3 20h18M7 8h2M7 12h2M7 16h2M15 12h2M15 16h2"/>',
  gateway: '<path d="M4 9h14l-3.5-3.5M20 15H6l3.5 3.5"/>',
  transit: '<circle cx="12" cy="12" r="3"/><circle cx="12" cy="3.8" r="1.8"/><circle cx="12" cy="20.2" r="1.8"/><circle cx="3.8" cy="12" r="1.8"/><circle cx="20.2" cy="12" r="1.8"/><path d="M12 5.6V9M12 15v3.4M5.6 12H9M15 12h3.4"/>',
  router: '<circle cx="12" cy="12" r="8.5"/><path d="M7.5 10h8l-2.2-2.2M16.5 14h-8l2.2 2.2"/>',
  firewall: '<rect x="3" y="5" width="18" height="14" rx="1"/><path d="M3 9.7h18M3 14.3h18M9 5v4.7M15 5v4.7M6 9.7v4.6M12 9.7v4.6M18 9.7v4.6M9 14.3V19M15 14.3V19"/>',
  terminal: '<rect x="3" y="5" width="18" height="14" rx="2"/><path d="M7 10l3 2.2L7 14.4M12.5 15h4.5"/>',
  globe: '<circle cx="12" cy="12" r="8.5"/><path d="M3.5 12h17M12 3.5c2.4 2.3 3.6 5.1 3.6 8.5s-1.2 6.2-3.6 8.5c-2.4-2.3-3.6-5.1-3.6-8.5s1.2-6.2 3.6-8.5z"/>',
  nat: '<path d="M3.5 12H14M10.5 8l3.8 4-3.8 4M18.5 4.5v15"/>',
  lb: '<circle cx="5.5" cy="12" r="2.3"/><circle cx="18.5" cy="5.5" r="2"/><circle cx="18.5" cy="12" r="2"/><circle cx="18.5" cy="18.5" r="2"/><path d="M7.8 12h8.7M7.6 10.9l9-4.4M7.6 13.1l9 4.4"/>',
  link: '<path d="M10 14a4 4 0 0 0 5.7 0l3-3a4 4 0 0 0-5.7-5.7l-1 1M14 10a4 4 0 0 0-5.7 0l-3 3a4 4 0 0 0 5.7 5.7l1-1"/>',
  web: '<rect x="3" y="5" width="18" height="14" rx="2"/><path d="M3 9.5h18"/><circle cx="6" cy="7.25" r=".6" fill="currentColor"/><circle cx="8.2" cy="7.25" r=".6" fill="currentColor"/>',
  app: '<rect x="7" y="7" width="10" height="10" rx="1.5"/><path d="M10 3.5V7M14 3.5V7M10 17v3.5M14 17v3.5M3.5 10H7M3.5 14H7M17 10h3.5M17 14h3.5"/>',
  db: '<ellipse cx="12" cy="6" rx="7" ry="2.8"/><path d="M5 6v12c0 1.55 3.13 2.8 7 2.8s7-1.25 7-2.8V6M5 12c0 1.55 3.13 2.8 7 2.8s7-1.25 7-2.8"/>',
  storage: '<rect x="3" y="13" width="18" height="6.5" rx="1.5"/><path d="M5 13l2.2-7.5h9.6L19 13"/><circle cx="16.8" cy="16.25" r=".9" fill="currentColor"/>',
  k8s: '<path d="M12 2.8l8 4.6v9.2l-8 4.6-8-4.6V7.4z"/><circle cx="12" cy="12" r="2.8"/><path d="M12 6.3v2.9M12 14.8v2.9M7.1 9.2l2.5 1.4M14.4 13.4l2.5 1.4M7.1 14.8l2.5-1.4M14.4 10.6l2.5-1.4"/>',
  mgmt: '<path d="M4 7h9.5M18 7h2M4 17h3.5M12 17h8"/><circle cx="15.8" cy="7" r="2.3"/><circle cx="9.8" cy="17" r="2.3"/><path d="M4 12h4M12.5 12H20"/><circle cx="10.3" cy="12" r="2.3"/>',
  users: '<circle cx="9" cy="8" r="3.2"/><path d="M3 20c0-3.3 2.7-6 6-6s6 2.7 6 6"/><circle cx="17" cy="9" r="2.5"/><path d="M16.5 14.1c2.6.2 4.5 2.4 4.5 5"/>',
  wifi: '<path d="M2.5 9.2a13.5 13.5 0 0 1 19 0M5.6 12.6a9 9 0 0 1 12.8 0M8.7 16a4.6 4.6 0 0 1 6.6 0"/><circle cx="12" cy="19.3" r="1.1" fill="currentColor"/>',
  phone: '<path d="M6 3.5h3l1.8 4.6-2.3 1.4a11 11 0 0 0 6 6l1.4-2.3 4.6 1.8v3a2 2 0 0 1-2 2C10.6 20 4 13.4 4 5.5a2 2 0 0 1 2-2z"/>',
  camera: '<rect x="3" y="7" width="12.5" height="10" rx="2"/><path d="M15.5 10.5l5.5-3v9l-5.5-3"/>',
  iot: '<circle cx="12" cy="12" r="2"/><path d="M8.5 8.5a5 5 0 0 0 0 7M15.5 8.5a5 5 0 0 1 0 7M5.6 5.6a9 9 0 0 0 0 12.8M18.4 5.6a9 9 0 0 1 0 12.8"/>',
  server: '<rect x="4" y="4" width="16" height="7" rx="1.5"/><rect x="4" y="13" width="16" height="7" rx="1.5"/><circle cx="8" cy="7.5" r=".9" fill="currentColor"/><circle cx="8" cy="16.5" r=".9" fill="currentColor"/><path d="M12 7.5h5M12 16.5h5"/>',
  p2p: '<circle cx="5" cy="12" r="2.3"/><circle cx="19" cy="12" r="2.3"/><path d="M7.3 12h9.4"/>',
};
// What a subnet is for: its cloud service first (the d field from the wizards), then words in its name.
// [kind, icon, category, service ids, name pattern]
/** @type {[string, string, keyof VzCats, string[], RegExp][]} */
const VZ_KINDS = [
  ['transit', 'transit', 'net', ['aws-tgw'], /\b(tgw|transit)/],
  ['gateway', 'gateway', 'net', ['gw', 'aws-cvpn'], /(gateway|vpn|expressroute|interconnect|\bwan\b|isp)/],
  ['firewall', 'firewall', 'sec', ['fw', 'fwmgmt', 'aws-nfw', 'aws-gwlbe', 'oci-nfw', 'gcp-nva'], /(firewall|\bfw\b|\bnva\b|dmz|inspect)/],
  ['bastion', 'terminal', 'sec', ['bastion'], /(bastion|jump)/],
  ['dns', 'globe', 'net', ['dnsin', 'dnsout', 'aws-r53'], /(\bdns|resolver)/],
  ['router', 'router', 'net', ['rs'], /(route.?server|router)/],
  ['nat', 'nat', 'net', ['aws-nat'], /\bnat\b/],
  ['lb', 'lb', 'net', ['appgw', 'aws-pub', 'oci-lb', 'oci-oke-lb', 'gcp-proxy'], /(\blb\b|load.?bal|appgw|ingress|proxy|public)/],
  ['endpoint', 'link', 'net', ['pe', 'aws-vpce', 'gcp-psc', 'gcp-psa', 'gcp-vpcac'], /(endpoint|private.?link|\bpsc\b)/],
  ['k8s', 'k8s', 'k8s', ['aks', 'aca', 'aws-ekscp', 'aws-eksnodes', 'gcp-gke', 'gcp-gke-pods', 'gcp-gke-svc', 'oci-oke-api', 'oci-oke-nodes', 'oci-oke-pods', 'dbwhost', 'dbwcont'], /(\baks|\beks|\bgke|\boke|k8s|kube|\bpods?\b|container)/],
  ['data', 'db', 'data', ['data', 'sqlmi', 'pgsql', 'mysql', 'aws-data', 'oci-db', 'gcp-data'], /(data|\bdb|sql|redis|cache)/],
  ['storage', 'storage', 'storage', ['anf', 'oci-fss'], /(storage|\bnas\b|\bsan\b|\bfss\b|nfs|backup)/],
  ['web', 'web', 'compute', ['web', 'gcp-web'], /(web|front)/],
  ['mgmt', 'mgmt', 'mgmt', ['gcp-shared', 'oci-shared'], /(mgmt|manage|\boob\b|admin|shared|monitor|infra)/],
  ['wifi', 'wifi', 'users', [], /(wi-?fi|wireless|wlan|guest)/],
  ['voice', 'phone', 'users', [], /(voice|voip|phone|\bsip\b)/],
  ['camera', 'camera', 'users', [], /(camera|cctv|video)/],
  ['iot', 'iot', 'users', [], /(iot|sensor|hvac|\bot\b|scada|printer|badge)/],
  ['users', 'users', 'users', [], /(staff|user|corp|office|desktop|client|employee|student|\blab\b)/],
  ['app', 'app', 'compute', ['app', 'appsvc', 'ase', 'apim', 'aws-app', 'oci-app', 'oci-oke-api', 'gcp-app', 'gcp-run'], /(\bapp|\bapi|function|compute|workload|service)/],
  ['server', 'server', 'compute', [], /(server|\bhosts?\b|\bvms?\b|esx|hyper-?v|\bdc\b)/],
  ['p2p', 'p2p', 'net', [], /(p2p|point.?to|uplink|\blink\b)/],
];
const VZ_KIND_BY_SVC = dict(VZ_KINDS.flatMap((k) => k[3].map((id) => [id, k])));
/** @type {(r: { mask: number }, m: Record<string, any>) => { icon: string, cat: keyof VzCats }} */
const vzKind = (r, m) => {
  const svc = svcOf(m), n = String(m.n || '').toLowerCase();
  const k = (svc && VZ_KIND_BY_SVC[svc.id]) || (n && VZ_KINDS.find((x) => x[4].test(n))) || null;
  if (k) return { icon: k[1], cat: k[2] };
  return r.mask >= 30 ? { icon: 'p2p', cat: 'net' } : { icon: 'subnet', cat: 'net' };
};
// AWS and Oracle draw public and private subnets differently: green and teal.
const vzPublic = (m) => {
  const svc = svcOf(m);
  if (svc) return ['aws-pub', 'aws-nat', 'oci-lb'].includes(svc.id);
  return /(public|\bpub\b|internet|\bdmz\b)/i.test(m.n || '') && !/private/i.test(m.n || '');
};
// hsl() to #rrggbb, for VLAN colors that also go into PowerPoint and Visio.
const vzHsl = (h, s, l) => {
  s /= 100; l /= 100;
  const f = (n) => { const k = (n + h / 30) % 12, a = s * Math.min(l, 1 - l); return Math.round(255 * (l - a * Math.max(-1, Math.min(k - 3, 9 - k, 1)))).toString(16).padStart(2, '0'); };
  return `#${f(0)}${f(8)}${f(4)}`;
};
// Dark glyphs on light squares (Google yellow), white on the rest.
const vzOn = (hex) => { const v = parseInt(hex.slice(1), 16); return ((v >> 16) * 299 + ((v >> 8) & 255) * 587 + (v & 255) * 114) / 1000 > 170 ? VZ_INK : '#FFFFFF'; };

// ---------- Measuring text ----------
/** @type {CanvasRenderingContext2D | null | undefined} */
let vzCtx;
const vzWidth = (s, px, bold = false, mono = false) => {
  if (vzCtx === undefined) vzCtx = document.createElement('canvas').getContext('2d');
  if (!vzCtx) return String(s).length * px * (mono ? 0.6 : 0.56);
  vzCtx.font = `${bold ? 'bold ' : ''}${px}px ${mono ? VZ_MONO : VZ_SANS}`;
  return vzCtx.measureText(String(s)).width * 1.04;   // a little room: PowerPoint and Visio set text slightly wider
};
const vzFit = (s, w, px, bold = false, mono = false) => {
  s = String(s ?? '');
  if (vzWidth(s, px, bold, mono) <= w) return s;
  let lo = 0, hi = s.length;
  while (lo < hi) { const mid = (lo + hi + 1) >> 1; if (vzWidth(s.slice(0, mid) + '…', px, bold, mono) <= w) lo = mid; else hi = mid - 1; }
  return s.slice(0, Math.max(1, lo)) + '…';
};

// ---------- Layout ----------
/** The shapes of a diagram, in drawing order. Text is a single line in a box; icons are a glyph on a colored square.
    @typedef {{ t: 'rect', x: number, y: number, w: number, h: number, fill?: string, stroke?: string, sw?: number, dash?: boolean, r?: number, tip?: string, key?: string }
      | { t: 'text', x: number, y: number, w: number, h: number, s: string, px: number, color: string, bold?: boolean, mono?: boolean, align?: 'l' | 'c' | 'r' }
      | { t: 'icon', x: number, y: number, s: number, g: string, bg: string }
      | { t: 'line', pts: number[][], stroke: string, sw: number, dash?: boolean }} VzPrim
    @typedef {{ w: number, h: number, draw: (x: number, y: number) => void }} VzBox */
const VZ = { tileW: 236, tileH: 62, tileHs: 44, gap: 10, pad: 14, head: 42, maxTiles: 96 };

/** @type {(opt: { free: boolean, detail: boolean }) => { w: number, h: number, prims: VzPrim[], count: number }} */
const vzLayout = (opt) => {
  /** @type {VzPrim[]} */
  const P = [];
  const rect = (o) => P.push({ t: 'rect', ...o });
  const text = (x, y, w, h, s, px, color, o = {}) => P.push({ t: 'text', x, y, w, h, s: vzFit(s, w, px, o.bold, o.mono), px, color, ...o });
  const icon = (x, y, s, g, bg) => P.push({ t: 'icon', x, y, s, g, bg });
  const line = (pts, stroke, sw = 1.5, dash = false) => P.push({ t: 'line', pts, stroke, sw, dash });
  const pill = (cx, cy, s, color) => {
    const w = vzWidth(s, 10.5, true) + 14;
    rect({ x: cx - w / 2, y: cy - 9, w, h: 18, fill: '#FFFFFF', stroke: color, sw: 1, r: 9 });
    text(cx - w / 2, cy - 9, w, 18, s, 10.5, color, { bold: true, align: 'c' });
  };
  const shown = (m) => opt.free || !!(m.n || m.v || m.s || m.d);
  let count = 0;

  // Grid of boxes, row by row; every cell the size of the largest.
  /** @type {(items: VzBox[], cols: number, gap: number) => VzBox} */
  const grid = (items, cols, gap) => {
    const cw = Math.max(0, ...items.map((i) => i.w)), rows = Math.ceil(items.length / cols);
    const rh = [...Array(rows)].map((_, ri) => Math.max(0, ...items.slice(ri * cols, ri * cols + cols).map((i) => i.h)));
    const nc = Math.min(cols, items.length);
    return { w: nc * cw + Math.max(0, nc - 1) * gap, h: rh.reduce((s, h) => s + h, 0) + Math.max(0, rows - 1) * gap,
      draw: (x, y) => { let yy = y; rh.forEach((h, ri) => { items.slice(ri * cols, ri * cols + cols).forEach((it, ci) => it.draw(x + ci * (cw + gap), yy)); yy += h + gap; }); } };
  };
  // Side by side, tops aligned (or stretched to the tallest when they're frames that take a height).
  /** @type {(items: (VzBox & { stretch?: (h: number) => VzBox })[], gap: number) => VzBox} */
  const hstack = (items, gap) => {
    const h = Math.max(0, ...items.map((i) => i.h));
    const its = items.map((i) => (i.stretch ? i.stretch(h) : i));
    return { w: its.reduce((s, i) => s + i.w, 0) + Math.max(0, its.length - 1) * gap, h, draw: (x, y) => { let xx = x; for (const i of its) { i.draw(xx, y); xx += i.w + gap; } } };
  };
  const vstack = (items, gap) => ({ w: Math.max(0, ...items.map((i) => i.w)), h: items.reduce((s, i) => s + i.h, 0) + Math.max(0, items.length - 1) * gap,
    draw: (x, y) => { let yy = y; for (const i of items) { i.draw(x, yy); yy += i.h + gap; } } });
  const cols = (n) => Math.max(1, Math.min(4, Math.ceil(Math.sqrt(n * 1.6))));

  // One subnet.
  /** @type {(r: any, b: Block, st: VzStyle) => VzBox} */
  const tile = (r, b, st) => {
    const m = getMeta(r.key), info = hostInfo(r.addr, r.mask, b.cloud), k = vzKind(r, m);
    const free = !(m.n || m.v || m.s || m.d), w = VZ.tileW, h = opt.detail ? VZ.tileH : VZ.tileHs;
    const pub = st.pubPriv && vzPublic(m);
    let fill = st.tileFill, stroke = st.tileStroke;
    if (st.pubPriv && b.cloud === 'aws') { fill = pub ? '#F2F6E8' : '#E6F6F7'; stroke = pub ? '#7AA116' : '#00A4A6'; }
    if (st.pubPriv && b.cloud === 'oci') { fill = pub ? '#F4F8F1' : '#FBF9F8'; stroke = pub ? '#759C6C' : '#9E9892'; }
    const iconBg = free ? '#AEB6C1' : b.cloud === 'std' && m.v ? vzHsl(vlanHue(m.v), 62, 42) : st.cat[k.cat];
    const tip = [r.key, m.n, m.v ? `VLAN ${m.v}` : '', m.z || '', `${fmtDoc(info.hosts)} usable`, m.o || ''].filter(Boolean).join(' · ');
    return { w, h, draw: (x, y) => {
      count++;
      rect({ x, y, w, h, fill: free ? '#FFFFFF' : fill, stroke: free ? '#B6BEC9' : stroke, sw: 1, dash: free || (b.cloud === 'oci' && !pub), r: st.r ? 4 : 0, tip, key: r.key });
      if (st.stripe && !free) rect({ x, y, w: 4, h, fill: b.cloud === 'std' && m.v ? vzHsl(vlanHue(m.v), 62, 50) : st.cat[k.cat], r: 0 });
      const ix = x + 12, is = opt.detail ? 30 : 24;
      icon(ix, y + (h - is) / 2, is, k.icon, iconBg);
      const tx = ix + is + 10, tw = w - (tx - x) - 10;
      const name = m.n || (free ? 'Free' : r.key);
      if (opt.detail) {
        text(tx, y + 7, tw, 16, name, 12.5, free ? VZ_MUTED : VZ_INK, { bold: true });
        text(tx, y + 24, tw, 15, r.key, 11.5, VZ_INK, { mono: true });
        const tag = m.s === 'reserved' ? ['Reserved', '#8A5A00'] : st.pubPriv && !free ? (pub ? ['Public', b.cloud === 'aws' ? '#4B6A0C' : '#4C6B45'] : ['Private', b.cloud === 'aws' ? '#00686A' : '#5C5550']) : null;
        const tagW = tag ? vzWidth(tag[0], 10.5, true) + 4 : 0;
        const det = [`${fmt(info.hosts)} host${info.hosts === 1 ? '' : 's'}`, m.v ? `VLAN ${m.v}` : '', b.v6 && v6Capable(m, b.cloud) ? 'IPv6' : ''].filter(Boolean).join(' · ');
        text(tx, y + 40, tw - tagW, 14, det, 10.5, VZ_MUTED);
        if (tag) text(x + w - 10 - tagW, y + 40, tagW, 14, tag[0], 10.5, tag[1], { bold: true, align: 'r' });
      } else {
        text(tx, y + 5, tw, 16, name, 12, free ? VZ_MUTED : VZ_INK, { bold: true });
        text(tx, y + 22, tw, 15, r.key, 11, VZ_INK, { mono: true });
      }
    } };
  };
  // A dashed frame with a label on top: an Availability Zone, a region, or a group of subnets.
  /** @type {(label: string, inner: VzBox, st: VzStyle, color?: string) => VzBox & { stretch: (h: number) => VzBox }} */
  const frame = (label, inner, st, color = st.zoneText) => {
    const hd = 26, p = 10, w0 = Math.max(inner.w + 2 * p, vzWidth(label, 11.5, true) + 2 * p);
    const mk = (h) => ({ w: w0, h, draw: (x, y) => {
      rect({ x, y, w: w0, h, fill: st.zoneFill, stroke: st.zoneStroke, sw: 1.25, dash: st.zoneDash, r: st.r });
      text(x + p, y + 5, w0 - 2 * p, 16, label, 11.5, color, { bold: true });
      inner.draw(x + p, y + hd);
    } });
    return { ...mk(inner.h + hd + p), stretch: mk };
  };

  // One base network: a VPC, VNet, VCN or on-prem site.
  /** @type {(b: Block, st: VzStyle, hub: boolean) => VzBox} */
  const network = (b, st, hub) => {
    const leaves = collectLeaves(b).map((r) => ({ ...r, bi: state.blocks.indexOf(b) }));
    let vis = leaves.filter((r) => shown(getMeta(r.key)));
    const hidden = leaves.length - vis.length, hiddenA = leaves.filter((r) => !shown(getMeta(r.key))).reduce((s, r) => s + size(r.mask), 0);
    const cut = Math.max(0, vis.length - VZ.maxTiles);
    vis = vis.slice(0, VZ.maxTiles);
    /** @type {VzBox} */
    let body;
    const zones = [...new Set(vis.map((r) => getMeta(r.key).z || ''))];
    if (zones.some(Boolean)) {
      // A column per zone, in name order; subnets without a zone come first.
      zones.sort((a, z) => (a === '' ? -1 : z === '' ? 1 : a.localeCompare(z, undefined, { numeric: true })));
      body = hstack(zones.map((z) => {
        const ts = vis.filter((r) => (getMeta(r.key).z || '') === z).map((r) => tile(r, b, st));
        const inner = grid(ts, Math.ceil(ts.length / 10), 8);
        return z ? frame(`${st.zone} ${z}`, inner, st) : frame(b.cloud === 'gcp' ? 'Global' : 'No zone', inner, st, VZ_MUTED);
      }), 12);
    } else {
      // Groups from the plan (names of divided subnets above them, like "spoke1 / web"), else a plain grid.
      const gname = (r) => { const g = groupOf(r); return b.label && state.blocks.length > 1 && g.startsWith(b.label) ? g.slice(b.label.length).replace(/^ \/ /, '') : g; };
      const groups = [...new Set(vis.map(gname))];
      if (groups.length > 1 || (groups.length === 1 && groups[0])) {
        const fr = groups.map((g) => { const ts = vis.filter((r) => gname(r) === g).map((r) => tile(r, b, st)); return frame(g || 'Ungrouped', grid(ts, Math.min(2, ts.length), 8), st, g ? st.zoneText : VZ_MUTED); });
        const per = Math.min(4, fr.length);
        const rowsOf = [...Array(Math.ceil(fr.length / per))].map((_, i) => hstack(fr.slice(i * per, i * per + per), 12));
        body = vstack(rowsOf, 12);
      } else body = grid(vis.map((r) => tile(r, b, st)), cols(vis.length), VZ.gap);
    }
    const notes = [];
    if (!vis.length) notes.push(hidden ? 'Every subnet is free. Tick “Free subnets” to show them.' : 'No subnets yet');
    if (cut) notes.push(`…and ${fmtDoc(cut)} more subnet${cut === 1 ? '' : 's'}`);
    if (hidden && vis.length) notes.push(`${fmtDoc(hidden)} free subnet${hidden === 1 ? '' : 's'} not shown (${fmtDoc(hiddenA)} addresses)`);
    const title = b.label || st.net, sub = `${blockCidr(b)} · ${CLOUDS[b.cloud].label}${b.v6 ? ' · dual-stack IPv6' : ''}`;
    const hubW = hub ? vzWidth('HUB', 10, true) + 16 : 0;
    const headW = 44 + Math.max(vzWidth(title, 14, true), vzWidth(sub, 11.5, false, true)) + hubW + 18;
    const noteH = notes.length * 16;
    const w = Math.max(body.w + 2 * VZ.pad, headW, 240), h = VZ.head + body.h + (body.h ? VZ.pad : 0) + noteH + (noteH ? 8 : 0) + 4;
    return { w, h, draw: (x, y) => {
      rect({ x, y, w, h, fill: st.netFill, stroke: st.netStroke, sw: 2, r: st.r });
      icon(x, y, 32, b.cloud === 'std' ? 'site' : 'subnet', st.netIcon);
      text(x + 42, y + 3, w - 42 - hubW - 12, 18, title, 14, VZ_INK, { bold: true });
      text(x + 42, y + 20, w - 42 - hubW - 12, 15, sub, 11.5, VZ_MUTED, { mono: true });
      if (hub) {
        rect({ x: x + w - hubW - 10, y: y + 9, w: hubW, h: 18, fill: st.netStroke, r: 9 });
        text(x + w - hubW - 10, y + 9, hubW, 18, 'HUB', 10, vzOn(st.netStroke), { bold: true, align: 'c' });
      }
      body.draw(x + VZ.pad, y + VZ.head);
      notes.forEach((n, i) => text(x + VZ.pad, y + VZ.head + body.h + (body.h ? VZ.pad : 0) + i * 16, w - 2 * VZ.pad, 16, n, 11, VZ_MUTED));
    } };
  };

  // Which networks are joined: the Peering button's pairs, or (older plans) a network labeled Hub with every other one.
  /** @type {() => [Block, Block][]} */
  const joined = () => {
    if (state.peers) return /** @type {[Block, Block][]} */ (peerPairs().filter(([a, b]) => a && b && a.cloud === b.cloud));
    const hub = state.blocks.length > 1 && state.blocks.find((b) => /^hub$/i.test(b.label || '') && b.cloud !== 'std');
    return hub ? state.blocks.filter((b) => b !== hub && b.cloud === hub.cloud).map((b) => /** @type {[Block, Block]} */ ([hub, b])) : [];
  };

  // Everything on one platform, inside its frame: the hub on top, a Transit Gateway or DRG below it, then the spokes;
  // networks that aren't joined to anything in a grid underneath.
  /** @type {(cloud: string, blocks: Block[], pairs: [Block, Block][]) => VzBox} */
  const platform = (cloud, blocks, pairs) => {
    const st = VZ_STYLE[cloud];
    const members = blocks.filter((b) => pairs.some((p) => p.includes(b)));
    const deg = new Map(members.map((b) => [b, pairs.filter((p) => p.includes(b)).length]));
    const center = members.reduce((best, b) => (best && (deg.get(best) || 0) >= (deg.get(b) || 0) ? best : b), /** @type {Block | null} */ (null));
    const via = cloud === 'aws' && state.po.t === 'tgw' ? ['Transit Gateway', state.po.m === 'mesh' ? 'Full mesh' : 'Hub and spoke']
      : cloud === 'oci' ? ['DRG', 'Dynamic Routing Gateway'] : null;
    const loose = blocks.filter((b) => !members.includes(b));
    /** @type {VzBox[]} */
    const parts = [];
    if (center) {
      const top = network(center, st, members.length > 2 || deg.get(center) === pairs.length);
      const others = members.filter((b) => b !== center).map((b) => ({ b, box: network(b, st, false) }));
      const gap = 40, rowW = others.reduce((s, o) => s + o.box.w, 0) + Math.max(0, others.length - 1) * gap;
      const rowH = Math.max(...others.map((o) => o.box.h));
      const side = pairs.filter((p) => !p.includes(center) && !via);   // spoke-to-spoke peerings, drawn under the spokes
      const gwH = via ? 64 : 0, link = via ? 34 : 56, laneH = side.length ? 22 + side.length * 14 : 0;
      const w = Math.max(top.w, rowW), h = top.h + link + gwH + (via ? link : 0) + rowH + laneH;
      parts.push({ w, h, draw: (x, y) => {
        const cx = x + w / 2, rowY = y + top.h + link + gwH + (via ? link : 0);
        const xs = []; let xx = x + (w - rowW) / 2;
        for (const o of others) { xs.push(xx); xx += o.box.w + gap; }
        const busY = rowY - 22;
        // Lines first, so the boxes sit on top of them.
        const tops = others.map((o, i) => xs[i] + o.box.w / 2);
        if (via) {
          const gy = y + top.h + link;
          line([[cx, y + top.h], [cx, gy]], st.brand, 2);
          line([[cx, gy + gwH], [cx, busY]], st.brand, 2);
        } else line([[cx, y + top.h], [cx, busY]], st.brand, 2);
        if (others.length > 1) line([[Math.min(...tops), busY], [Math.max(...tops), busY]], st.brand, 2);
        tops.forEach((tx) => line([[tx, busY], [tx, rowY]], st.brand, 2));
        side.forEach(([a, b2], i) => {
          const ia = others.findIndex((o) => o.b === a), ib = others.findIndex((o) => o.b === b2);
          if (ia < 0 || ib < 0) return;
          const off = (i % 5 - 2) * 10, ly = rowY + rowH + 14 + i * 14;
          const ax = xs[ia] + others[ia].box.w / 2 + off, bx = xs[ib] + others[ib].box.w / 2 + off;
          line([[ax, rowY + others[ia].box.h], [ax, ly], [bx, ly], [bx, rowY + others[ib].box.h]], st.brand, 1.5, true);
        });
        top.draw(x + (w - top.w) / 2, y);
        if (via) {
          const gy = y + top.h + link, gw = Math.max(170, vzWidth(via[1], 11, false) + 66);
          rect({ x: cx - gw / 2, y: gy, w: gw, h: gwH, fill: '#FFFFFF', stroke: st.netStroke, sw: 2, r: 8 });
          icon(cx - gw / 2 + 12, gy + 14, 36, cloud === 'aws' ? 'transit' : 'router', st.netIcon);
          text(cx - gw / 2 + 58, gy + 14, gw - 66, 18, via[0], 13, VZ_INK, { bold: true });
          text(cx - gw / 2 + 58, gy + 32, gw - 66, 16, via[1], 11, VZ_MUTED);
        } else pill(cx, y + top.h + (busY - y - top.h) / 2, st.peer, st.brand);
        others.forEach((o, i) => o.box.draw(xs[i], rowY));
      } });
    }
    if (loose.length) parts.push(grid(loose.map((b) => network(b, st, false)), Math.min(3, loose.length), 24));
    const inner = vstack(parts, 36);
    const p = 20, hd = 44, w = Math.max(inner.w + 2 * p, vzWidth(st.cloud, 15, true) + 80), h = inner.h + hd + p;
    return { w, h, draw: (x, y) => {
      rect({ x, y, w, h, fill: '#FFFFFF', stroke: st.brand, sw: 1.5, dash: cloud === 'std', r: cloud === 'aws' ? 0 : 10 });
      if (st.bar) st.bar.forEach((c, i) => rect({ x: x + (i * w) / 4, y, w: w / 4, h: 5, fill: c, r: 0 }));
      icon(x + 12, y + 10, 26, cloud === 'std' ? 'site' : 'cloud', st.brand);
      text(x + 46, y + 12, w - 60, 22, st.cloud, 15, VZ_INK, { bold: true });
      inner.draw(x + p, y + hd);
    } };
  };

  const pairs = joined();
  const clouds = VZ_ORDER.filter((c) => state.blocks.some((b) => b.cloud === c));
  const frames = clouds.map((c) => platform(c, state.blocks.filter((b) => b.cloud === c), pairs.filter(([a]) => a.cloud === c)));
  // Platforms side by side while that stays a sensible width, else stacked.
  const side = frames.reduce((s, f) => s + f.w, 0) + (frames.length - 1) * 32 <= 2600;
  const body = side ? hstack(frames, 32) : vstack(frames, 32);
  const M = 28, W = Math.max(body.w + 2 * M, 640);
  const all = allRows(), named = all.filter((r) => { const m = getMeta(r.key); return m.n || m.v || m.s; }).length;
  const title = state.blocks.length === 1 ? blockName(state.blocks[0]) : `${state.blocks.length} networks`;
  const sub = `${fmtDoc(all.length)} subnet${all.length === 1 ? '' : 's'}${named !== all.length ? ` (${fmtDoc(named)} planned)` : ''} · ${pairs.length ? `${pairs.length} peering${pairs.length === 1 ? '' : 's'} · ` : ''}${new Date().toLocaleDateString('en-CA')}`;
  const H = M + 56 + body.h + 40;
  text(M, M - 4, W - 2 * M, 28, title, 22, VZ_INK, { bold: true });
  text(M, M + 24, W - 2 * M, 18, sub, 12.5, VZ_MUTED);
  body.draw(M, M + 56);
  text(M, H - 30, W - 2 * M, 16, 'Made with IP Plan-O-Matic · crockerfeller.github.io/IP-Plan-O-Matic', 11, VZ_MUTED);
  return { w: Math.ceil(W), h: Math.ceil(H), prims: P, count };
};

// ---------- SVG (screen, PNG, SVG download) ----------
const vzIconSvg = (g, bg, s) => {
  const fg = vzOn(bg), k = (s * 0.62) / 24, o = (s - 24 * k) / 2;
  return `<rect width="${s}" height="${s}" rx="${(s * 0.16).toFixed(2)}" fill="${bg}"/><g transform="translate(${o.toFixed(2)} ${o.toFixed(2)}) scale(${k.toFixed(4)})" color="${fg}" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">${VZ_GLYPH[g] || VZ_GLYPH.subnet}</g>`;
};
// A text box's baseline: the middle of the box plus a third of the font size.
const vzBase = (p) => p.y + p.h / 2 + p.px * 0.35;
/** @type {(d: { w: number, h: number, prims: VzPrim[] }, live?: boolean) => string} */
const vzSvg = (d, live = false) => {
  const n = (v) => +v.toFixed(2);
  const out = d.prims.map((p) => {
    if (p.t === 'rect') {
      const a = `x="${n(p.x)}" y="${n(p.y)}" width="${n(p.w)}" height="${n(p.h)}"${p.r ? ` rx="${p.r}"` : ''} fill="${p.fill || 'none'}"${p.stroke ? ` stroke="${p.stroke}" stroke-width="${p.sw || 1}"` : ''}${p.dash ? ' stroke-dasharray="5 4"' : ''}`;
      return p.tip ? `<rect ${a}${live && p.key ? ` data-key="${esc(p.key)}" class="vz-tile"` : ''}><title>${esc(p.tip)}</title></rect>` : `<rect ${a}/>`;
    }
    if (p.t === 'text') {
      const x = p.align === 'c' ? p.x + p.w / 2 : p.align === 'r' ? p.x + p.w : p.x;
      return `<text x="${n(x)}" y="${n(vzBase(p))}" font-size="${p.px}"${p.bold ? ' font-weight="bold"' : ''}${p.mono ? ` font-family="${VZ_MONO}"` : ''} fill="${p.color}"${p.align === 'c' ? ' text-anchor="middle"' : p.align === 'r' ? ' text-anchor="end"' : ''}${live ? ' pointer-events="none"' : ''}>${esc(p.s)}</text>`;
    }
    if (p.t === 'icon') return `<g transform="translate(${n(p.x)} ${n(p.y)})"${live ? ' pointer-events="none"' : ''}>${vzIconSvg(p.g, p.bg, p.s)}</g>`;
    return `<polyline points="${p.pts.map(([x, y]) => `${n(x)},${n(y)}`).join(' ')}" fill="none" stroke="${p.stroke}" stroke-width="${p.sw}"${p.dash ? ' stroke-dasharray="6 4"' : ''} stroke-linejoin="round"/>`;
  });
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${d.w}" height="${d.h}" viewBox="0 0 ${d.w} ${d.h}" font-family="${VZ_SANS}">\n<rect width="100%" height="100%" fill="#ffffff"/>\n${out.join('\n')}\n</svg>\n`;
};

// Each icon used, as PNG (and SVG for PowerPoint, which shows it sharp and falls back to the PNG): [key, png, svg].
/** @type {(d: { prims: VzPrim[] }) => Promise<Map<string, { png: Uint8Array, svg: string }>>} */
const vzIconFiles = async (d) => {
  const out = new Map();
  for (const p of d.prims) {
    if (p.t !== 'icon') continue;
    const k = `${p.g}|${p.bg}`;
    if (out.has(k)) continue;
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="96" height="96" viewBox="0 0 96 96">${vzIconSvg(p.g, p.bg, 96)}</svg>`;
    out.set(k, { png: new Uint8Array(await (await svgToPng(svg)).arrayBuffer()), svg });
  }
  return out;
};

// ---------- PowerPoint (.pptx): one slide the size of the diagram, every box and label a shape of its own ----------
const VZ_NS = 'xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships" xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main"';
const VZ_XML = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n';
const VZ_REL = 'http://schemas.openxmlformats.org/officeDocument/2006/relationships';
const vzRels = (list) => `${VZ_XML}<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">${list.map(([id, type, target]) => `<Relationship Id="${id}" Type="${type.startsWith('http') ? type : `${VZ_REL}/${type}`}" Target="${target}"/>`).join('')}</Relationships>`;
const vzCore = (title) => `${VZ_XML}<cp:coreProperties xmlns:cp="http://schemas.openxmlformats.org/package/2006/metadata/core-properties" xmlns:dc="http://purl.org/dc/elements/1.1/" xmlns:dcterms="http://purl.org/dc/terms/" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance"><dc:title>${xe(title)}</dc:title><dc:creator>IP Plan-O-Matic</dc:creator><dcterms:created xsi:type="dcterms:W3CDTF">${new Date().toISOString().slice(0, 19)}Z</dcterms:created></cp:coreProperties>`;
const VZ_GRP = '<p:nvGrpSpPr><p:cNvPr id="1" name=""/><p:cNvGrpSpPr/><p:nvPr/></p:nvGrpSpPr><p:grpSpPr><a:xfrm><a:off x="0" y="0"/><a:ext cx="0" cy="0"/><a:chOff x="0" y="0"/><a:chExt cx="0" cy="0"/></a:xfrm></p:grpSpPr>';
const VZ_THEME = `${VZ_XML}<a:theme xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" name="IP Plan-O-Matic"><a:themeElements>` +
  '<a:clrScheme name="IP Plan-O-Matic"><a:dk1><a:srgbClr val="16191F"/></a:dk1><a:lt1><a:srgbClr val="FFFFFF"/></a:lt1><a:dk2><a:srgbClr val="232F3E"/></a:dk2><a:lt2><a:srgbClr val="F2F3F3"/></a:lt2>' +
  '<a:accent1><a:srgbClr val="8C4FFF"/></a:accent1><a:accent2><a:srgbClr val="0078D4"/></a:accent2><a:accent3><a:srgbClr val="4285F4"/></a:accent3><a:accent4><a:srgbClr val="C74634"/></a:accent4><a:accent5><a:srgbClr val="00A4A6"/></a:accent5><a:accent6><a:srgbClr val="7AA116"/></a:accent6>' +
  '<a:hlink><a:srgbClr val="0563C1"/></a:hlink><a:folHlink><a:srgbClr val="954F72"/></a:folHlink></a:clrScheme>' +
  '<a:fontScheme name="IP Plan-O-Matic"><a:majorFont><a:latin typeface="Arial"/><a:ea typeface=""/><a:cs typeface=""/></a:majorFont><a:minorFont><a:latin typeface="Arial"/><a:ea typeface=""/><a:cs typeface=""/></a:minorFont></a:fontScheme>' +
  '<a:fmtScheme name="IP Plan-O-Matic"><a:fillStyleLst>' + '<a:solidFill><a:schemeClr val="phClr"/></a:solidFill>'.repeat(3) + '</a:fillStyleLst><a:lnStyleLst>' + '<a:ln w="9525"><a:solidFill><a:schemeClr val="phClr"/></a:solidFill></a:ln>'.repeat(3) +
  '</a:lnStyleLst><a:effectStyleLst>' + '<a:effectStyle><a:effectLst/></a:effectStyle>'.repeat(3) + '</a:effectStyleLst><a:bgFillStyleLst>' + '<a:solidFill><a:schemeClr val="phClr"/></a:solidFill>'.repeat(3) + '</a:bgFillStyleLst></a:fmtScheme>' +
  '</a:themeElements><a:objectDefaults/><a:extraClrSchemeLst/></a:theme>';
/** @type {(d: { w: number, h: number, prims: VzPrim[] }, title: string) => Promise<Blob>} */
const vzPptx = async (d, title) => {
  const EMU = 9525, MAX = 51206400;   // 96 px to the inch; PowerPoint slides are 56 inches at most
  const k = Math.min(1, MAX / (d.w * EMU), MAX / (d.h * EMU));
  const E = (v) => Math.max(0, Math.round(v * EMU * k));
  const hex = (c) => c.slice(1).toUpperCase();
  const icons = await vzIconFiles(d), media = [], rel = new Map();
  let n = 1;
  for (const [key, f] of icons) { const i = media.length + 1; media.push([`ppt/media/image${i}.png`, f.png], [`ppt/media/image${i}.svg`, f.svg]); rel.set(key, [`rId${2 * i}`, `rId${2 * i + 1}`, i]); }
  const xfrm = (x, y, w, h) => `<a:xfrm><a:off x="${E(x)}" y="${E(y)}"/><a:ext cx="${Math.max(1, E(w))}" cy="${Math.max(1, E(h))}"/></a:xfrm>`;
  const ln = (c, w, dash) => (c ? `<a:ln w="${Math.round(w * EMU * k)}"><a:solidFill><a:srgbClr val="${hex(c)}"/></a:solidFill>${dash ? '<a:prstDash val="dash"/>' : ''}<a:round/></a:ln>` : '<a:ln><a:noFill/></a:ln>');
  const shapes = d.prims.map((p) => {
    const id = ++n;
    if (p.t === 'rect') {
      const adj = p.r ? Math.min(50000, Math.round((p.r / Math.max(1, Math.min(p.w, p.h))) * 100000)) : 0;
      return `<p:sp><p:nvSpPr><p:cNvPr id="${id}" name="${p.key ? xe(p.key) : `Box ${id}`}"/><p:cNvSpPr/><p:nvPr/></p:nvSpPr><p:spPr>${xfrm(p.x, p.y, p.w, p.h)}` +
        `<a:prstGeom prst="${adj ? 'roundRect' : 'rect'}"><a:avLst>${adj ? `<a:gd name="adj" fmla="val ${adj}"/>` : ''}</a:avLst></a:prstGeom>` +
        `${p.fill ? `<a:solidFill><a:srgbClr val="${hex(p.fill)}"/></a:solidFill>` : '<a:noFill/>'}${ln(p.stroke, p.sw || 1, p.dash)}</p:spPr></p:sp>`;
    }
    if (p.t === 'text') {
      const algn = p.align === 'c' ? 'ctr' : p.align === 'r' ? 'r' : 'l';
      return `<p:sp><p:nvSpPr><p:cNvPr id="${id}" name="Text ${id}"/><p:cNvSpPr txBox="1"/><p:nvPr/></p:nvSpPr><p:spPr>${xfrm(p.x, p.y, p.w, p.h)}<a:prstGeom prst="rect"><a:avLst/></a:prstGeom><a:noFill/></p:spPr>` +
        `<p:txBody><a:bodyPr wrap="none" lIns="0" tIns="0" rIns="0" bIns="0" anchor="ctr"><a:noAutofit/></a:bodyPr><a:lstStyle/><a:p><a:pPr algn="${algn}"/><a:r><a:rPr lang="en-US" sz="${Math.max(100, Math.round(p.px * 75 * k))}"${p.bold ? ' b="1"' : ''} dirty="0">` +
        `<a:solidFill><a:srgbClr val="${hex(p.color)}"/></a:solidFill><a:latin typeface="${p.mono ? 'Consolas' : 'Arial'}"/></a:rPr><a:t>${xe(p.s)}</a:t></a:r></a:p></p:txBody></p:sp>`;
    }
    if (p.t === 'icon') {
      const [png, svg] = /** @type {any[]} */ (rel.get(`${p.g}|${p.bg}`));
      return `<p:pic><p:nvPicPr><p:cNvPr id="${id}" name="Icon ${xe(p.g)}"/><p:cNvPicPr><a:picLocks noChangeAspect="1"/></p:cNvPicPr><p:nvPr/></p:nvPicPr>` +
        `<p:blipFill><a:blip r:embed="${png}"><a:extLst><a:ext uri="{96DAC541-7B7A-43D3-8B79-37D633B846F1}"><asvg:svgBlip xmlns:asvg="http://schemas.microsoft.com/office/drawing/2016/SVG/main" r:embed="${svg}"/></a:ext></a:extLst></a:blip><a:stretch><a:fillRect/></a:stretch></p:blipFill>` +
        `<p:spPr>${xfrm(p.x, p.y, p.s, p.s)}<a:prstGeom prst="rect"><a:avLst/></a:prstGeom></p:spPr></p:pic>`;
    }
    const xs = p.pts.map((q) => q[0]), ys = p.pts.map((q) => q[1]), x0 = Math.min(...xs), y0 = Math.min(...ys);
    const w = Math.max(1, E(Math.max(...xs) - x0)), h = Math.max(1, E(Math.max(...ys) - y0));
    const pt = (/** @type {number[]} */ [x, y]) => `<a:pt x="${E(x - x0)}" y="${E(y - y0)}"/>`;
    return `<p:sp><p:nvSpPr><p:cNvPr id="${id}" name="Connection ${id}"/><p:cNvSpPr/><p:nvPr/></p:nvSpPr><p:spPr><a:xfrm><a:off x="${E(x0)}" y="${E(y0)}"/><a:ext cx="${w}" cy="${h}"/></a:xfrm>` +
      `<a:custGeom><a:avLst/><a:gdLst/><a:ahLst/><a:cxnLst/><a:rect l="0" t="0" r="r" b="b"/><a:pathLst><a:path w="${w}" h="${h}" fill="none"><a:moveTo>${pt(p.pts[0])}</a:moveTo>${p.pts.slice(1).map((q) => `<a:lnTo>${pt(q)}</a:lnTo>`).join('')}</a:path></a:pathLst></a:custGeom>` +
      `<a:noFill/>${ln(p.stroke, p.sw, p.dash)}</p:spPr></p:sp>`;
  });
  const cx = Math.max(914400, E(d.w)), cy = Math.max(914400, E(d.h));
  /** @type {[string, string | Uint8Array][]} */
  const files = [
    ['[Content_Types].xml', `${VZ_XML}<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Default Extension="png" ContentType="image/png"/><Default Extension="svg" ContentType="image/svg+xml"/>` +
      '<Override PartName="/ppt/presentation.xml" ContentType="application/vnd.openxmlformats-officedocument.presentationml.presentation.main+xml"/><Override PartName="/ppt/slideMasters/slideMaster1.xml" ContentType="application/vnd.openxmlformats-officedocument.presentationml.slideMaster+xml"/>' +
      '<Override PartName="/ppt/slideLayouts/slideLayout1.xml" ContentType="application/vnd.openxmlformats-officedocument.presentationml.slideLayout+xml"/><Override PartName="/ppt/slides/slide1.xml" ContentType="application/vnd.openxmlformats-officedocument.presentationml.slide+xml"/>' +
      '<Override PartName="/ppt/theme/theme1.xml" ContentType="application/vnd.openxmlformats-officedocument.theme+xml"/><Override PartName="/docProps/core.xml" ContentType="application/vnd.openxmlformats-package.core-properties+xml"/></Types>'],
    ['_rels/.rels', vzRels([['rId1', 'officeDocument', 'ppt/presentation.xml'], ['rId2', 'http://schemas.openxmlformats.org/package/2006/relationships/metadata/core-properties', 'docProps/core.xml']])],
    ['docProps/core.xml', vzCore(title)],
    ['ppt/presentation.xml', `${VZ_XML}<p:presentation ${VZ_NS} saveSubsetFonts="1"><p:sldMasterIdLst><p:sldMasterId id="2147483648" r:id="rId1"/></p:sldMasterIdLst><p:sldIdLst><p:sldId id="256" r:id="rId2"/></p:sldIdLst><p:sldSz cx="${cx}" cy="${cy}"/><p:notesSz cx="6858000" cy="9144000"/></p:presentation>`],
    ['ppt/_rels/presentation.xml.rels', vzRels([['rId1', 'slideMaster', 'slideMasters/slideMaster1.xml'], ['rId2', 'slide', 'slides/slide1.xml'], ['rId3', 'theme', 'theme/theme1.xml']])],
    ['ppt/theme/theme1.xml', VZ_THEME],
    ['ppt/slideMasters/slideMaster1.xml', `${VZ_XML}<p:sldMaster ${VZ_NS}><p:cSld><p:bg><p:bgRef idx="1001"><a:schemeClr val="bg1"/></p:bgRef></p:bg><p:spTree>${VZ_GRP}</p:spTree></p:cSld>` +
      '<p:clrMap bg1="lt1" tx1="dk1" bg2="lt2" tx2="dk2" accent1="accent1" accent2="accent2" accent3="accent3" accent4="accent4" accent5="accent5" accent6="accent6" hlink="hlink" folHlink="folHlink"/><p:sldLayoutIdLst><p:sldLayoutId id="2147483649" r:id="rId1"/></p:sldLayoutIdLst><p:txStyles><p:titleStyle/><p:bodyStyle/><p:otherStyle/></p:txStyles></p:sldMaster>'],
    ['ppt/slideMasters/_rels/slideMaster1.xml.rels', vzRels([['rId1', 'slideLayout', '../slideLayouts/slideLayout1.xml'], ['rId2', 'theme', '../theme/theme1.xml']])],
    ['ppt/slideLayouts/slideLayout1.xml', `${VZ_XML}<p:sldLayout ${VZ_NS} type="blank" preserve="1"><p:cSld name="Blank"><p:spTree>${VZ_GRP}</p:spTree></p:cSld><p:clrMapOvr><a:masterClrMapping/></p:clrMapOvr></p:sldLayout>`],
    ['ppt/slideLayouts/_rels/slideLayout1.xml.rels', vzRels([['rId1', 'slideMaster', '../slideMasters/slideMaster1.xml']])],
    ['ppt/slides/slide1.xml', `${VZ_XML}<p:sld ${VZ_NS}><p:cSld name="${xe(title)}"><p:bg><p:bgPr><a:solidFill><a:srgbClr val="FFFFFF"/></a:solidFill><a:effectLst/></p:bgPr></p:bg><p:spTree>${VZ_GRP}${shapes.join('')}</p:spTree></p:cSld><p:clrMapOvr><a:masterClrMapping/></p:clrMapOvr></p:sld>`],
    ['ppt/slides/_rels/slide1.xml.rels', vzRels([['rId1', 'slideLayout', '../slideLayouts/slideLayout1.xml'], ...[...rel.values()].flatMap(([a, b, i]) => [[a, 'image', `../media/image${i}.png`], [b, 'image', `../media/image${i}.svg`]])])],
    ...media,
  ];
  return zipStore(files, 'application/vnd.openxmlformats-officedocument.presentationml.presentation');
};

// ---------- Visio (.vsdx): one page the size of the diagram; boxes, labels and lines are Visio shapes ----------
const VZ_VNS = 'xmlns="http://schemas.microsoft.com/office/visio/2012/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships" xml:space="preserve"';
const VZ_VREL = 'http://schemas.microsoft.com/visio/2010/relationships';
// The document's one style ("No Style"), which every shape uses: what a cell is when a shape doesn't set it.
const VZ_VSTYLE = [['EnableLineProps', 1], ['EnableFillProps', 1], ['EnableTextProps', 1], ['HideForApply', 0], ['LineWeight', 0.01041666666666667], ['LineColor', '#000000'], ['LinePattern', 1], ['Rounding', 0],
  ['EndArrowSize', 2], ['BeginArrow', 0], ['EndArrow', 0], ['LineCap', 0], ['BeginArrowSize', 2], ['LineColorTrans', 0], ['CompoundType', 0], ['FillForegnd', '#FFFFFF'], ['FillBkgnd', '#FFFFFF'], ['FillPattern', 1],
  ['ShdwForegnd', '#000000'], ['ShdwPattern', 0], ['FillForegndTrans', 0], ['FillBkgndTrans', 0], ['ShdwForegndTrans', 0], ['ShapeShdwType', 0], ['ShapeShdwOffsetX', 0], ['ShapeShdwOffsetY', 0], ['ShapeShdwObliqueAngle', 0], ['ShapeShdwScaleFactor', 1],
  ['LeftMargin', 0], ['RightMargin', 0], ['TopMargin', 0], ['BottomMargin', 0], ['VerticalAlign', 1], ['TextBkgnd', 0], ['DefaultTabStop', 0.5], ['TextDirection', 0], ['TextBkgndTrans', 0]];
/** @type {(d: { w: number, h: number, prims: VzPrim[] }, title: string) => Promise<Blob>} */
const vzVsdx = async (d, title) => {
  const IN = 96, H = d.h / IN;
  const f = (v) => String(+v.toFixed(5));
  const c = (nm, v, u) => `<Cell N="${nm}" V="${v}"${u ? ` U="${u}"` : ''}/>`;
  const icons = await vzIconFiles(d), media = [], rel = new Map();
  for (const [key, fl] of icons) { const i = media.length + 1; media.push([`visio/media/image${i}.png`, fl.png]); rel.set(key, [`rId${i}`, i]); }
  const xf = (x, y, w, h) => c('PinX', f((x + w / 2) / IN)) + c('PinY', f(H - (y + h / 2) / IN)) + c('Width', f(w / IN)) + c('Height', f(h / IN)) + c('LocPinX', f(w / 2 / IN)) + c('LocPinY', f(h / 2 / IN)) + c('Angle', 0) + c('FlipX', 0) + c('FlipY', 0) + c('ResizeMode', 0);
  const box = (noFill, noLine) => `<Section N="Geometry" IX="0">${c('NoFill', noFill ? 1 : 0)}${c('NoLine', noLine ? 1 : 0)}${c('NoShow', 0)}${c('NoSnap', 0)}${c('NoQuickDrag', 0)}` +
    '<Row T="RelMoveTo" IX="1"><Cell N="X" V="0"/><Cell N="Y" V="0"/></Row><Row T="RelLineTo" IX="2"><Cell N="X" V="1"/><Cell N="Y" V="0"/></Row><Row T="RelLineTo" IX="3"><Cell N="X" V="1"/><Cell N="Y" V="1"/></Row>' +
    '<Row T="RelLineTo" IX="4"><Cell N="X" V="0"/><Cell N="Y" V="1"/></Row><Row T="RelLineTo" IX="5"><Cell N="X" V="0"/><Cell N="Y" V="0"/></Row></Section>';
  const lineCells = (color, sw, dash) => (color ? c('LineColor', color) + c('LineWeight', f(sw / IN), 'PT') + c('LinePattern', dash ? 2 : 1) : c('LinePattern', 0));
  let id = 0;
  const shapes = d.prims.map((p) => {
    id++;
    const head = (type = 'Shape', nm = '') => `<Shape ID="${id}" NameU="${nm || `Sheet.${id}`}" Name="${nm || `Sheet.${id}`}" Type="${type}" LineStyle="0" FillStyle="0" TextStyle="0">`;
    if (p.t === 'rect') {
      return `${head('Shape', p.key ? xe(p.key) : '')}${xf(p.x, p.y, p.w, p.h)}${p.fill ? c('FillForegnd', p.fill) + c('FillPattern', 1) : c('FillPattern', 0)}${lineCells(p.stroke, p.sw || 1, p.dash)}${c('Rounding', p.r ? f(p.r / IN) : 0, 'IN')}${box(!p.fill, !p.stroke)}</Shape>`;
    }
    if (p.t === 'text') {
      return `${head()}${xf(p.x, p.y, p.w, p.h)}${c('FillPattern', 0)}${c('LinePattern', 0)}${c('VerticalAlign', 1)}${c('LeftMargin', 0, 'PT')}${c('RightMargin', 0, 'PT')}${c('TopMargin', 0, 'PT')}${c('BottomMargin', 0, 'PT')}` +
        `<Section N="Character"><Row IX="0">${c('Color', p.color)}${c('Size', f((p.px * 0.75) / 72), 'PT')}${c('Style', p.bold ? 1 : 0)}</Row></Section>` +
        `<Section N="Paragraph"><Row IX="0">${c('HorzAlign', p.align === 'c' ? 1 : p.align === 'r' ? 2 : 0)}</Row></Section><Text>${xe(p.s)}</Text></Shape>`;
    }
    if (p.t === 'icon') {
      const [rid] = /** @type {any[]} */ (rel.get(`${p.g}|${p.bg}`));
      return `${head('Foreign', `Icon.${id}`)}${xf(p.x, p.y, p.s, p.s)}${c('ImgOffsetX', 0)}${c('ImgOffsetY', 0)}${c('ImgWidth', f(p.s / IN))}${c('ImgHeight', f(p.s / IN))}${c('LinePattern', 0)}${c('FillPattern', 0)}` +
        `<ForeignData ForeignType="Bitmap" CompressionType="PNG"><Rel r:id="${rid}"/></ForeignData></Shape>`;
    }
    const xs = p.pts.map((q) => q[0]), ys = p.pts.map((q) => q[1]), x0 = Math.min(...xs), y0 = Math.min(...ys);
    const w = Math.max(1, Math.max(...xs) - x0), h = Math.max(1, Math.max(...ys) - y0);
    const rows = p.pts.map(([x, y], i) => `<Row T="${i ? 'LineTo' : 'MoveTo'}" IX="${i + 1}"><Cell N="X" V="${f((x - x0) / IN)}"/><Cell N="Y" V="${f((y0 + h - y) / IN)}"/></Row>`).join('');
    return `${head()}${xf(x0, y0, w, h)}${c('FillPattern', 0)}${lineCells(p.stroke, p.sw, p.dash)}<Section N="Geometry" IX="0">${c('NoFill', 1)}${c('NoLine', 0)}${c('NoShow', 0)}${c('NoSnap', 0)}${c('NoQuickDrag', 0)}${rows}</Section></Shape>`;
  });
  const pw = f(d.w / IN), ph = f(H);
  /** @type {[string, string | Uint8Array][]} */
  const files = [
    ['[Content_Types].xml', `${VZ_XML}<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Default Extension="png" ContentType="image/png"/>` +
      '<Override PartName="/visio/document.xml" ContentType="application/vnd.ms-visio.drawing.main+xml"/><Override PartName="/visio/pages/pages.xml" ContentType="application/vnd.ms-visio.pages+xml"/><Override PartName="/visio/pages/page1.xml" ContentType="application/vnd.ms-visio.page+xml"/>' +
      '<Override PartName="/docProps/core.xml" ContentType="application/vnd.openxmlformats-package.core-properties+xml"/></Types>'],
    ['_rels/.rels', vzRels([['rId1', `${VZ_VREL}/document`, 'visio/document.xml'], ['rId2', 'http://schemas.openxmlformats.org/package/2006/relationships/metadata/core-properties', 'docProps/core.xml']])],
    ['docProps/core.xml', vzCore(title)],
    ['visio/document.xml', `${VZ_XML}<VisioDocument ${VZ_VNS}><DocumentSettings TopPage="0" DefaultTextStyle="0" DefaultLineStyle="0" DefaultFillStyle="0" DefaultGuideStyle="0"><GlueSettings>9</GlueSettings><SnapSettings>65847</SnapSettings><SnapExtensions>34</SnapExtensions><SnapAngles/><DynamicGridEnabled>1</DynamicGridEnabled><ProtectStyles>0</ProtectStyles><ProtectShapes>0</ProtectShapes><ProtectMasters>0</ProtectMasters><ProtectBkgnds>0</ProtectBkgnds></DocumentSettings>` +
      '<Colors><ColorEntry IX="0" RGB="#000000"/><ColorEntry IX="1" RGB="#FFFFFF"/></Colors><FaceNames><FaceName NameU="Arial" UnicodeRanges="-536859905 -1073711037 9 0" CharSets="1073742335 -65536" Panose="2 11 6 4 2 2 2 2 2 4" Flags="325"/></FaceNames>' +
      `<StyleSheets><StyleSheet ID="0" NameU="No Style" IsCustomNameU="1" Name="No Style" IsCustomName="1">${VZ_VSTYLE.map(([nm, v]) => c(nm, v)).join('')}` +
      `<Section N="Character"><Row IX="0">${c('Font', 'Arial')}${c('Color', '#000000')}${c('Style', 0)}${c('Case', 0)}${c('Pos', 0)}${c('FontScale', 1)}${c('Size', 0.1666666666666667)}${c('DblUnderline', 0)}${c('Overline', 0)}${c('Strikethru', 0)}${c('DoubleStrikethrough', 0)}${c('Letterspace', 0)}${c('ColorTrans', 0)}${c('AsianFont', 0)}${c('ComplexScriptFont', 0)}${c('ComplexScriptSize', -1)}${c('LangID', 'en-US')}</Row></Section>` +
      `<Section N="Paragraph"><Row IX="0">${c('IndFirst', 0)}${c('IndLeft', 0)}${c('IndRight', 0)}${c('SpLine', -1.2)}${c('SpBefore', 0)}${c('SpAfter', 0)}${c('HorzAlign', 1)}${c('Bullet', 0)}${c('BulletStr', '')}${c('BulletFont', 0)}${c('BulletFontSize', -1)}${c('TextPosAfterBullet', 0)}${c('Flags', 0)}</Row></Section>` +
      '</StyleSheet></StyleSheets><DocumentSheet NameU="TheDoc" IsCustomNameU="1" Name="TheDoc" IsCustomName="1" LineStyle="0" FillStyle="0" TextStyle="0"><Cell N="OutputFormat" V="0"/><Cell N="LockPreview" V="0"/><Cell N="AddMarkup" V="0"/><Cell N="ViewMarkup" V="0"/><Cell N="DocLockReplace" V="0"/><Cell N="NoCoauth" V="0"/><Cell N="DocLockDuplicatePage" V="0"/><Cell N="PreviewQuality" V="0"/><Cell N="PreviewScope" V="0"/><Cell N="DocLangID" V="en-US"/></DocumentSheet></VisioDocument>'],
    ['visio/_rels/document.xml.rels', vzRels([['rId1', `${VZ_VREL}/pages`, 'pages/pages.xml']])],
    ['visio/pages/pages.xml', `${VZ_XML}<Pages ${VZ_VNS}><Page ID="0" NameU="Page-1" Name="${xe(vzFit(title, 400, 12))}" ViewScale="-1" ViewCenterX="${f(d.w / IN / 2)}" ViewCenterY="${f(H / 2)}"><PageSheet LineStyle="0" FillStyle="0" TextStyle="0">` +
      `${c('PageWidth', pw, 'IN')}${c('PageHeight', ph, 'IN')}${c('ShdwOffsetX', 0.125)}${c('ShdwOffsetY', -0.125)}${c('PageScale', 1, 'IN_F')}${c('DrawingScale', 1, 'IN_F')}${c('DrawingSizeType', 0)}${c('DrawingScaleType', 0)}${c('InhibitSnap', 0)}${c('PageLockReplace', 0, 'BOOL')}${c('PageLockDuplicate', 0, 'BOOL')}${c('UIVisibility', 0)}${c('ShdwType', 0)}${c('ShdwObliqueAngle', 0)}${c('ShdwScaleFactor', 1)}${c('DrawingResizeType', 1)}${c('PageShapeSplit', 1)}` +
      '</PageSheet><Rel r:id="rId1"/></Page></Pages>'],
    ['visio/pages/_rels/pages.xml.rels', vzRels([['rId1', `${VZ_VREL}/page`, 'page1.xml']])],
    ['visio/pages/page1.xml', `${VZ_XML}<PageContents ${VZ_VNS}><Shapes>${shapes.join('')}</Shapes></PageContents>`],
    ...(rel.size ? [/** @type {[string, string]} */ (['visio/pages/_rels/page1.xml.rels', vzRels([...rel.values()].map(([rid, i]) => [rid, 'image', `../media/image${i}.png`]))])] : []),
    ...media,
  ];
  return zipStore(files, 'application/vnd.ms-visio.drawing');
};

// ---------- The tab: the diagram on a canvas you can pan and zoom ----------
const vzView = { k: 1, x: 0, y: 0, fitted: true };
/** @type {{ w: number, h: number, prims: VzPrim[], count: number } | null} */
let vzLast = null;
const vzOpts = () => ({ free: /** @type {HTMLInputElement} */ ($('vzFree')).checked, detail: /** @type {HTMLInputElement} */ ($('vzDetail')).checked });
const vzApply = () => {
  const s = /** @type {HTMLElement | null} */ ($('vzStage').firstElementChild);
  if (s) s.style.transform = `translate(${vzView.x}px, ${vzView.y}px) scale(${vzView.k})`;
  $('vzZoomLbl').textContent = pctFmt(vzView.k * 100, 0);
};
const vzFitView = () => {
  if (!vzLast) return;
  const box = $('vzStage'), pad = 16;
  const k = Math.min(1.5, (box.clientWidth - 2 * pad) / vzLast.w, (box.clientHeight - 2 * pad) / vzLast.h);
  vzView.k = Math.max(0.05, k);
  vzView.x = (box.clientWidth - vzLast.w * vzView.k) / 2;
  vzView.y = Math.max(pad, (box.clientHeight - vzLast.h * vzView.k) / 2);
  vzView.fitted = true;
  vzApply();
};
// Zoom about a point of the canvas (its middle when none is given).
const vzZoom = (f, px, py) => {
  const box = $('vzStage');
  if (px === undefined) { px = box.clientWidth / 2; py = box.clientHeight / 2; }
  const k = Math.min(4, Math.max(0.05, vzView.k * f));
  vzView.x = px - ((px - vzView.x) * k) / vzView.k;
  vzView.y = /** @type {number} */ (py) - ((/** @type {number} */ (py) - vzView.y) * k) / vzView.k;
  vzView.k = k; vzView.fitted = false;
  vzApply();
};
const renderViz = () => {
  vzLast = vzLayout(vzOpts());
  $('vzStage').innerHTML = `<div class="vz-paper">${vzSvg(vzLast, true)}</div>`;
  const nets = state.blocks.length;
  $('vzInfo').textContent = `${fmt(nets)} network${nets === 1 ? '' : 's'}, ${fmt(vzLast.count)} subnet${vzLast.count === 1 ? '' : 's'} drawn. Double-click a subnet to open it on the Plan tab.`;
  if (vzView.fitted) vzFitView(); else vzApply();
};
const vzName = (ext) => `network-diagram.${ext}`;
const vzTitle = () => (state.blocks.length === 1 ? blockName(state.blocks[0]) : `${state.blocks.length} networks`) + ' · network diagram';
const vzBusy = (on) => { for (const id of ['vzPng', 'vzSvg', 'vzPptx', 'vzVsdx', 'vzCopy']) /** @type {HTMLButtonElement} */ ($(id)).disabled = on; };
/** @type {(make: () => Promise<Blob> | Blob, ext: string, what: string) => Promise<void>} */
const vzSave = async (make, ext, what) => {
  vzBusy(true);
  try { download(vzName(ext), await make()); } catch (e) { toast(`Couldn’t make the ${what} file.`); } finally { vzBusy(false); }
};
const vzData = () => vzLayout(vzOpts());
$('vzPng').addEventListener('click', () => vzSave(() => svgToPng(vzSvg(vzData())), 'png', 'PNG'));
$('vzSvg').addEventListener('click', () => vzSave(() => new Blob([vzSvg(vzData())], { type: 'image/svg+xml' }), 'svg', 'SVG'));
$('vzPptx').addEventListener('click', () => vzSave(() => vzPptx(vzData(), vzTitle()), 'pptx', 'PowerPoint'));
$('vzVsdx').addEventListener('click', () => vzSave(() => vzVsdx(vzData(), vzTitle()), 'vsdx', 'Visio'));
$('vzCopy').addEventListener('click', async () => {
  try {
    await navigator.clipboard.write([new ClipboardItem({ 'image/png': svgToPng(vzSvg(vzData())) })]);
    toast('Diagram copied as an image');
  } catch (e) { toast('Your browser can’t copy images here. Use PNG to download it instead.'); }
});
for (const id of ['vzFree', 'vzDetail']) $(id).addEventListener('change', () => { vzView.fitted = true; renderViz(); });
$('vzFit').addEventListener('click', vzFitView);
$('vzIn').addEventListener('click', () => vzZoom(1.25));
$('vzOut').addEventListener('click', () => vzZoom(0.8));
$('vz100').addEventListener('click', () => { vzZoom(1 / vzView.k); });
{
  const stage = $('vzStage');
  /** @type {{ id: number, x: number, y: number, vx: number, vy: number, moved: boolean } | null} */
  let drag = null;
  stage.addEventListener('pointerdown', (e) => {
    if (e.button !== 0) return;
    drag = { id: e.pointerId, x: e.clientX, y: e.clientY, vx: vzView.x, vy: vzView.y, moved: false };
    stage.setPointerCapture(e.pointerId);
  });
  stage.addEventListener('pointermove', (e) => {
    if (!drag || e.pointerId !== drag.id) return;
    const dx = e.clientX - drag.x, dy = e.clientY - drag.y;
    if (!drag.moved && Math.hypot(dx, dy) < 4) return;
    drag.moved = true; stage.classList.add('dragging');
    vzView.x = drag.vx + dx; vzView.y = drag.vy + dy; vzView.fitted = false;
    vzApply();
  });
  const end = () => { drag = null; stage.classList.remove('dragging'); };
  stage.addEventListener('pointerup', end);
  stage.addEventListener('pointercancel', end);
  // Ctrl / ⌘ + wheel and trackpad pinches zoom; a plain wheel scrolls the page as usual.
  stage.addEventListener('wheel', (e) => {
    if (!e.ctrlKey && !e.metaKey) return;
    e.preventDefault();
    const r = stage.getBoundingClientRect();
    vzZoom(Math.exp(-e.deltaY / 300), e.clientX - r.left, e.clientY - r.top);
  }, { passive: false });
  stage.addEventListener('keydown', (e) => {
    const step = 60, keys = { ArrowLeft: [step, 0], ArrowRight: [-step, 0], ArrowUp: [0, step], ArrowDown: [0, -step] };
    if (e.key === '+' || e.key === '=') vzZoom(1.25);
    else if (e.key === '-') vzZoom(0.8);
    else if (e.key === '0') vzFitView();
    else if (keys[e.key]) { vzView.x += keys[e.key][0]; vzView.y += keys[e.key][1]; vzView.fitted = false; vzApply(); }
    else return;
    e.preventDefault();
  });
  stage.addEventListener('dblclick', (e) => {
    const t = /** @type {Element} */ (e.target).closest('.vz-tile');
    const key = t && t.getAttribute('data-key');
    if (!key) return;
    const c = parseCidr(key);
    const bi = c ? blockOf(c.addr) : -1;
    if (bi < 0) return;
    showTab('plan');
    if (bi !== state.active) selectBlock(bi);
    const idx = rows.findIndex((r) => r.key === key);
    if (idx >= 0) flashRow(idx);
  });
  new ResizeObserver(() => { if (vzView.fitted && !$('tab-viz').hidden) vzFitView(); }).observe(stage);
}
