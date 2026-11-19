// IP Plan-O-Matic: IPv4 and IPv6 math, cloud platform rules, the plan state and its trees, DOM helpers, and the plan in the URL.
// One of the app's plain scripts (js/*.js): index.html loads them in order and they share one scope, so each can use
// what the ones before it define. Plain scripts, not modules, so a downloaded copy still opens from disk.
'use strict';

// =====================================================================
// IPv4 math (unsigned 32-bit as JS numbers)
// =====================================================================
const aton = (s) => {
  const m = /^\s*(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})\s*$/.exec(s || '');
  if (!m) return null;
  const p = m.slice(1).map(Number);
  if (p.some((x) => x > 255)) return null;
  return p[0] * 16777216 + p[1] * 65536 + p[2] * 256 + p[3];
};
const ntoa = (n) => [Math.floor(n / 16777216) & 255, (n >>> 16) & 255, (n >>> 8) & 255, n & 255].join('.');
const size = (mask) => 2 ** (32 - mask);
const netAddr = (ip, mask) => (mask === 0 ? 0 : (ip & (~0 << (32 - mask))) >>> 0);
const netmask = (mask) => netAddr(0xffffffff, mask);
const wildcard = (mask) => 0xffffffff - netmask(mask);
const lastAddr = (addr, mask) => addr + size(mask) - 1;
// Numbers on screen follow the visitor's settings (1,024 or 1.024 or 1 024). The files the app writes use fmtDoc: US
// format, like the English text around them, so a file reads the same wherever it was made.
const fmt = (n) => n.toLocaleString();
const fmtDoc = (n) => n.toLocaleString('en-US');
const cidrStr = (a, m) => `${ntoa(a)}/${m}`;
const inBlock = (ip, a, m) => ip >= a && ip <= lastAddr(a, m);
const overlaps = (a1, m1, a2, m2) => a1 <= lastAddr(a2, m2) && a2 <= lastAddr(a1, m1);
const relation = (a1, m1, a2, m2) => {
  if (a1 === a2 && m1 === m2) return 'identical to';
  if (m1 < m2 && inBlock(a2, a1, m1)) return 'contains';
  if (m1 > m2 && inBlock(a1, a2, m2)) return 'is inside';
  return null;
};
const maskFromNetmask = (nm) => {
  if (nm === null) return null;
  for (let m = 0; m <= 32; m++) if (netmask(m) === nm) return m;
  return null;
};
const IP_RE = '\\d{1,3}(?:\\.\\d{1,3}){3}';
const parseCidr = (s) => {
  const t = String(s || '').trim();
  let m, ip, mask;
  if ((m = new RegExp(`^(${IP_RE})\\s*/\\s*(\\d{1,2})$`).exec(t))) { ip = aton(m[1]); mask = Number(m[2]); }
  else if ((m = new RegExp(`^(${IP_RE})\\s+(${IP_RE})$`).exec(t))) { ip = aton(m[1]); mask = maskFromNetmask(aton(m[2])); }
  else if ((m = new RegExp(`^(${IP_RE})$`).exec(t))) { ip = aton(m[1]); mask = 32; }
  else return null;
  if (ip === null || mask === null || !(mask >= 0 && mask <= 32)) return null;
  const addr = netAddr(ip, mask);
  return { addr, mask, ip, aligned: addr === ip, cidr: cidrStr(addr, mask) };
};
/** A line's network. @typedef {{ raw: string, error?: undefined, addr: number, mask: number, ip: number, aligned: boolean, cidr: string, label: string }} ParsedOk */
/** A line that didn't parse, or its network. @typedef {{ raw: string, error: true } | ParsedOk} ParsedLine */
/** @param {ParsedLine | null} p @returns {p is ParsedOk} */
const parsedOk = (p) => !!p && !p.error;
// Pull "CIDR [label]" out of one line.
/** @type {(line: string) => ParsedLine | null} */
const parseLine = (line) => {
  const t = line.replace(/#.*$/, '').trim();
  if (!t) return null;
  const m = new RegExp(`^(${IP_RE}(?:\\s*/\\s*\\d{1,2}|\\s+255\\.${'\\d{1,3}(?:\\.\\d{1,3}){2}'})?)(?:[\\s,;\\t]+(.*))?$`).exec(t);
  const c = m && parseCidr(m[1]);
  if (!c) return { error: true, raw: t };
  return { ...c, label: (m[2] || '').trim(), raw: t };
};
const rangeToCidrs = (start, end) => {
  const out = [];
  while (start <= end) {
    let tz = 0;
    if (start === 0) tz = 32; else while (tz < 32 && start % 2 ** (tz + 1) === 0) tz++;
    const fit = Math.floor(Math.log2(end - start + 1));
    const bits = Math.min(tz, fit);
    out.push({ addr: start, mask: 32 - bits });
    start += 2 ** bits;
  }
  return out;
};
const supernet = (list) => {
  const lo = Math.min(...list.map((e) => e.addr));
  const hi = Math.max(...list.map((e) => lastAddr(e.addr, e.mask)));
  for (let m = 32; m >= 0; m--) {
    const a = netAddr(lo, m);
    if (lastAddr(a, m) >= hi) return { addr: a, mask: m };
  }
  return { addr: 0, mask: 0 };
};
const binHtml = (addr, mask) => {
  let s = '';
  for (let i = 31; i >= 0; i--) {
    const bit = Math.floor(addr / 2 ** i) % 2;
    const pos = 31 - i;
    s += `<span class="${pos < mask ? 'nb' : 'hb'}">${bit}</span>`;
    if (i % 8 === 0 && i) s += '.';
  }
  return s;
};
const binText = (addr) => [24, 16, 8, 0].map((sh) => ((Math.floor(addr / 2 ** sh)) & 255).toString(2).padStart(8, '0')).join('.');

/** A network in one of the app's own tables, which must parse: a typo there fails at start-up, where the tests see it.
    @template T @param {(s: string) => T | null} parse @param {string} c @returns {T} */
const builtIn = (parse, c) => { const p = parse(c); if (!p) throw new Error(`Built-in network ${c} doesn't parse`); return p; };
const SPECIAL4 = [
  ['0.0.0.0/8', '“This network” (RFC 791)', 'warn'],
  ['10.0.0.0/8', 'Private (RFC 1918)', 'ok'],
  ['100.64.0.0/10', 'Carrier-grade NAT shared space (RFC 6598)', 'warn'],
  ['127.0.0.0/8', 'Loopback', 'warn'],
  ['169.254.0.0/16', 'Link-local / APIPA (RFC 3927)', 'warn'],
  ['172.16.0.0/12', 'Private (RFC 1918)', 'ok'],
  ['192.0.0.0/24', 'IETF protocol assignments (RFC 6890)', 'warn'],
  ['192.0.2.0/24', 'Documentation TEST-NET-1 (RFC 5737)', 'warn'],
  ['192.88.99.0/24', 'Deprecated 6to4 relay anycast (RFC 7526)', 'warn'],
  ['192.168.0.0/16', 'Private (RFC 1918)', 'ok'],
  ['198.18.0.0/15', 'Benchmark testing (RFC 2544)', 'warn'],
  ['198.51.100.0/24', 'Documentation TEST-NET-2 (RFC 5737)', 'warn'],
  ['203.0.113.0/24', 'Documentation TEST-NET-3 (RFC 5737)', 'warn'],
  ['224.0.0.0/4', 'Multicast (RFC 5771)', 'danger'],
  ['240.0.0.0/4', 'Reserved for future use', 'danger'],
  ['255.255.255.255/32', 'Limited broadcast', 'danger'],
].map(([c, label, kind]) => ({ ...builtIn(parseCidr, c), label, kind }));
const classify4 = (addr, mask) => {
  const hits = [];
  for (const r of SPECIAL4) {
    if (!overlaps(addr, mask, r.addr, r.mask)) continue;
    const rel = (addr >= r.addr && lastAddr(addr, mask) <= lastAddr(r.addr, r.mask)) ? 'inside' : (r.addr >= addr && lastAddr(r.addr, r.mask) <= lastAddr(addr, mask)) ? 'contains' : 'overlaps';
    hits.push({ ...r, rel });
  }
  return hits;
};
const classTags = (addr, mask) => {
  const hits = classify4(addr, mask);
  if (!hits.length) return '<span class="tag">Public address space</span>';
  return hits.map((h) => `<span class="tag ${h.kind}" title="${esc(h.cidr)}">${h.rel === 'inside' ? '' : (h.rel === 'contains' ? 'Contains ' : 'Partly ')}${esc(h.label)}${h.rel === 'inside' ? '' : ' ' + esc(h.cidr)}</span>`).join(' ');
};

// =====================================================================
// Platform rules
// =====================================================================
const CLOUDS = {
  std:   { label: 'Standard', min: 32 },
  aws:   { label: 'AWS VPC', min: 28, max: 16 },
  azure: { label: 'Azure VNet', min: 29 },
  gcp:   { label: 'Google Cloud VPC', min: 29 },
  oci:   { label: 'OCI VCN', min: 30, max: 16 },
};
const settings = { cloud: 'std', gw: 'first' };
const divLimit = () => CLOUDS[settings.cloud].min;

// Azure services that need (or should have) a subnet of their own. fixed: Azure requires this exact subnet name.
// min / rec: smallest and recommended prefix length. Sizes checked against Microsoft Learn, November 2026.
const LEARN = 'https://learn.microsoft.com/azure/';
const AZURE_SVCS = [
  { id: 'gw',      role: 'hub',   label: 'VPN / ExpressRoute gateway', name: 'GatewaySubnet', fixed: true, min: 29, rec: 27, on: true, doc: 'vpn-gateway/vpn-gateway-about-vpn-gateway-settings#gwsub', tip: '/27 or larger; /26 for 16 ExpressRoute circuits or VPN and ExpressRoute side by side' },
  { id: 'fw',      role: 'hub',   label: 'Azure Firewall', name: 'AzureFirewallSubnet', fixed: true, min: 26, rec: 26, on: true, doc: 'firewall/firewall-faq' },
  { id: 'fwmgmt',  role: 'hub',   label: 'Azure Firewall management (Basic SKU, forced tunneling)', name: 'AzureFirewallManagementSubnet', fixed: true, min: 26, rec: 26, on: false, doc: 'firewall/forced-tunneling' },
  { id: 'bastion', role: 'hub',   label: 'Azure Bastion', name: 'AzureBastionSubnet', fixed: true, min: 26, rec: 26, on: true, doc: 'bastion/configuration-settings#subnet' },
  { id: 'rs',      role: 'hub',   label: 'Azure Route Server', name: 'RouteServerSubnet', fixed: true, min: 26, rec: 26, on: false, doc: 'route-server/quickstart-create-route-server-portal' },
  { id: 'dnsin',   role: 'hub',   label: 'DNS Private Resolver inbound', name: 'snet-dns-in', deleg: 'Microsoft.Network/dnsResolvers', min: 28, rec: 28, on: true, doc: 'dns/dns-private-resolver-overview#subnet-restrictions' },
  { id: 'dnsout',  role: 'hub',   label: 'DNS Private Resolver outbound', name: 'snet-dns-out', deleg: 'Microsoft.Network/dnsResolvers', min: 28, rec: 28, on: true, doc: 'dns/dns-private-resolver-overview#subnet-restrictions' },
  { id: 'appgw',   role: 'spoke', label: 'Application Gateway v2', name: 'snet-appgw', min: 26, rec: 24, on: true, soft: true, doc: 'application-gateway/configuration-infrastructure#size-of-the-subnet', tip: 'Only Application Gateways in it. No hard minimum, but /24 is strongly recommended so it can autoscale' },
  { id: 'pe',      role: 'spoke', label: 'Private endpoints', name: 'snet-pe', min: 28, rec: 24, on: true, soft: true, doc: 'private-link/private-endpoint-overview', tip: 'Not required, but a subnet of their own keeps NSGs and routes simple' },
  { id: 'appsvc',  role: 'spoke', label: 'App Service / Functions VNet integration', name: 'snet-appsvc', deleg: 'Microsoft.Web/serverFarms', min: 28, rec: 26, on: true, doc: 'app-service/overview-vnet-integration#subnet-requirements' },
  { id: 'web',     role: 'spoke', label: 'Workload: web tier', name: 'snet-web', min: 29, rec: 24, on: true },
  { id: 'app',     role: 'spoke', label: 'Workload: app tier', name: 'snet-app', min: 29, rec: 24, on: true },
  { id: 'data',    role: 'spoke', label: 'Workload: data tier', name: 'snet-data', min: 29, rec: 24, on: true },
  { id: 'ase',     role: 'spoke', label: 'App Service Environment v3', name: 'snet-ase', deleg: 'Microsoft.Web/hostingEnvironments', min: 27, rec: 24, on: false, doc: 'app-service/environment/networking#subnet-requirements' },
  { id: 'apim',    role: 'spoke', label: 'API Management (VNet injection)', name: 'snet-apim', min: 29, rec: 27, on: false, doc: 'api-management/virtual-network-injection-resources' },
  { id: 'sqlmi',   role: 'spoke', label: 'SQL Managed Instance', name: 'snet-sqlmi', deleg: 'Microsoft.Sql/managedInstances', min: 27, rec: 26, on: false, doc: 'azure-sql/managed-instance/vnet-subnet-determine-size' },
  { id: 'pgsql',   role: 'spoke', label: 'PostgreSQL Flexible Server', name: 'snet-pgsql', deleg: 'Microsoft.DBforPostgreSQL/flexibleServers', min: 28, rec: 27, on: false, doc: 'postgresql/flexible-server/concepts-networking-private' },
  { id: 'mysql',   role: 'spoke', label: 'MySQL Flexible Server', name: 'snet-mysql', deleg: 'Microsoft.DBforMySQL/flexibleServers', min: 28, rec: 27, on: false, doc: 'mysql/flexible-server/concepts-networking-vnet' },
  { id: 'anf',     role: 'spoke', label: 'Azure NetApp Files', name: 'snet-anf', deleg: 'Microsoft.Netapp/volumes', min: 28, rec: 26, on: false, doc: 'azure-netapp-files/azure-netapp-files-delegate-subnet' },
  { id: 'aca',     role: 'spoke', label: 'Container Apps environment', name: 'snet-aca', deleg: 'Microsoft.App/environments', min: 27, rec: 23, on: false, doc: 'container-apps/custom-virtual-networks', tip: 'Workload profiles need /27 or larger; a consumption-only environment needs /23' },
  { id: 'aks',     role: 'spoke', label: 'AKS nodes (Azure CNI Overlay)', name: 'snet-aks', min: 28, rec: 22, on: false, soft: true, doc: 'aks/azure-cni-overlay', tip: 'Size for nodes plus surge during upgrades; pods use the overlay range' },
  { id: 'dbwhost', role: 'spoke', label: 'Databricks host (public)', name: 'snet-dbw-host', deleg: 'Microsoft.Databricks/workspaces', min: 26, rec: 24, on: false, doc: 'databricks/security/network/classic/vnet-inject' },
  { id: 'dbwcont', role: 'spoke', label: 'Databricks container (private)', name: 'snet-dbw-container', deleg: 'Microsoft.Databricks/workspaces', min: 26, rec: 24, on: false, doc: 'databricks/security/network/classic/vnet-inject' },
];
// AWS: no required names, but every subnet lives in one Availability Zone, so each one is made once per AZ.
// role "both": offered in the hub and in every spoke. minAz: the service needs subnets in at least that many AZs.
// soft: the minimum is advice rather than an AWS rule, so no "must be" warning. Checked against AWS docs, November 2026.
const AWS_SVCS = [
  { id: 'aws-tgw',      role: 'both',  label: 'Transit Gateway attachment', name: 'tgw-attach', min: 28, rec: 28, on: true, doc: 'vpc/latest/tgw/tgw-best-design-practices.html', tip: 'AWS recommends a small subnet of its own for each attachment, in each AZ' },
  { id: 'aws-nfw',      role: 'hub',   label: 'Network Firewall endpoints', name: 'firewall', min: 28, rec: 28, on: true, doc: 'network-firewall/latest/developerguide/firewall-creating.html', tip: 'Used only by the firewall endpoint, one subnet per AZ' },
  { id: 'aws-nat',      role: 'hub',   label: 'Public: NAT gateways (central egress)', name: 'public-nat', min: 28, rec: 28, on: true, doc: 'vpc/latest/userguide/vpc-nat-gateway.html' },
  { id: 'aws-gwlbe',    role: 'hub',   label: 'Gateway Load Balancer endpoints', name: 'gwlbe', min: 28, rec: 28, on: false, doc: 'elasticloadbalancing/latest/gateway/getting-started.html' },
  { id: 'aws-r53',      role: 'hub',   label: 'Route 53 Resolver endpoints', name: 'dns-resolver', min: 28, rec: 28, on: false, minAz: 2, doc: 'Route53/latest/DeveloperGuide/resolver.html', tip: 'Resolver endpoints need addresses in at least two AZs' },
  { id: 'aws-cvpn',     role: 'hub',   label: 'Client VPN target network', name: 'client-vpn', min: 27, rec: 27, on: false, doc: 'vpn/latest/clientvpn-admin/cvpn-working-target.html', tip: 'A /27 or larger with at least 8 free addresses' },
  { id: 'aws-pub',      role: 'spoke', label: 'Public: load balancers (ALB / NLB)', name: 'public', min: 27, rec: 24, on: true, minAz: 2, doc: 'elasticloadbalancing/latest/application/application-load-balancers.html', tip: 'An ALB needs a /27 or larger with 8 free addresses, in at least two AZs' },
  { id: 'aws-app',      role: 'spoke', label: 'Private: application', name: 'private-app', min: 28, rec: 23, on: true },
  { id: 'aws-data',     role: 'spoke', label: 'Private: databases (RDS, ElastiCache)', name: 'private-data', min: 28, rec: 24, on: true, minAz: 2, doc: 'AmazonRDS/latest/UserGuide/USER_VPC.WorkingWithRDSInstanceinaVPC.html', tip: 'A DB subnet group needs subnets in at least two AZs' },
  { id: 'aws-vpce',     role: 'spoke', label: 'Interface VPC endpoints (PrivateLink)', name: 'endpoints', min: 28, rec: 26, on: false, doc: 'vpc/latest/privatelink/create-interface-endpoint.html', tip: 'Each endpoint takes one address per AZ' },
  { id: 'aws-ekscp',    role: 'spoke', label: 'EKS cluster (control plane ENIs)', name: 'eks-cluster', min: 28, rec: 28, on: false, minAz: 2, doc: 'eks/latest/userguide/network-reqs.html', tip: 'At least 6 free addresses each (16 recommended), in two or more AZs' },
  { id: 'aws-eksnodes', role: 'spoke', label: 'EKS nodes and pods (VPC CNI)', name: 'eks-nodes', min: 24, rec: 20, on: false, soft: true, doc: 'eks/latest/userguide/network-reqs.html', tip: 'With the VPC CNI every pod takes a VPC address: size for pods, not just nodes' },
];
// Google Cloud: subnets are regional, so each one is made once per region listed. Checked against Google Cloud docs,
// November 2026. purpose: set on the subnet in the Terraform export. secondary: a GKE secondary range on the gke-nodes
// subnet, not a subnet of its own. once: one per VPC, not per region (private services access is a global range).
// max: the largest size offered (the menus otherwise start three steps above the recommendation).
const GCP_SVCS = [
  { id: 'gcp-nva',      role: 'hub',   label: 'Network virtual appliances (firewalls)', name: 'nva', min: 29, rec: 28, on: true, soft: true, tip: 'For third-party firewalls the spokes route through' },
  { id: 'gcp-shared',   role: 'hub',   label: 'Shared services (DNS, AD, jump hosts)', name: 'shared-services', min: 29, rec: 26, on: true },
  { id: 'gcp-proxy',    role: 'spoke', label: 'Proxy-only (regional Application / proxy Network LBs)', name: 'proxy-only', min: 26, rec: 23, on: true, purpose: 'REGIONAL_MANAGED_PROXY', doc: 'load-balancing/docs/proxy-only-subnets', tip: 'One per region in each VPC that uses Envoy-based load balancers: a /26 at least, and Google suggests starting with a /23' },
  { id: 'gcp-web',      role: 'spoke', label: 'Workload: web tier', name: 'web', min: 29, rec: 24, on: true },
  { id: 'gcp-app',      role: 'spoke', label: 'Workload: app tier', name: 'app', min: 29, rec: 24, on: true },
  { id: 'gcp-data',     role: 'spoke', label: 'Workload: data tier', name: 'data', min: 29, rec: 24, on: true },
  { id: 'gcp-psa',      role: 'spoke', label: 'Private services access (Cloud SQL, Memorystore…)', name: 'psa-range', min: 24, rec: 20, max: 16, once: true, on: false, doc: 'vpc/docs/configure-private-services-access', tip: 'A global range reserved for Google’s managed services, one per VPC: a /24 at least, and Google recommends a /16' },
  { id: 'gcp-run',      role: 'spoke', label: 'Cloud Run Direct VPC egress', name: 'run-egress', min: 26, rec: 24, on: false, doc: 'run/docs/configuring/vpc-direct-vpc', tip: 'A /26 or larger. Cloud Run takes addresses 16 at a time: allow twice your instances plus a buffer' },
  { id: 'gcp-vpcac',    role: 'spoke', label: 'Serverless VPC Access connector', name: 'vpc-connector', min: 28, rec: 28, max: 28, on: false, doc: 'vpc/docs/configure-serverless-vpc-access', tip: 'Exactly a /28 for each connector. Google recommends Direct VPC egress instead where it fits' },
  { id: 'gcp-psc',      role: 'spoke', label: 'Private Service Connect (publishing a service)', name: 'psc-nat', min: 29, rec: 28, on: false, soft: true, purpose: 'PRIVATE_SERVICE_CONNECT', doc: 'vpc/docs/configure-private-service-connect-producer', tip: 'NAT addresses for a service you publish, in its load balancer’s region. Google sets no size beyond a subnet’s /29 minimum' },
  { id: 'gcp-gke',      role: 'spoke', label: 'GKE nodes', name: 'gke-nodes', min: 29, rec: 22, on: false, soft: true, doc: 'kubernetes-engine/docs/concepts/alias-ips', tip: 'The subnet the nodes use: a /22 holds 1,020 nodes' },
  { id: 'gcp-gke-pods', role: 'spoke', label: 'GKE Pods (secondary range on gke-nodes)', name: 'gke-pods', min: 21, rec: 18, max: 14, on: false, soft: true, secondary: 'pods', doc: 'kubernetes-engine/docs/concepts/alias-ips', tip: 'Each node takes a /24 for up to 110 Pods, so a /18 serves 64 nodes. Google advises caution below a /21' },
  { id: 'gcp-gke-svc',  role: 'spoke', label: 'GKE Services (secondary range on gke-nodes)', name: 'gke-services', min: 28, rec: 20, on: false, soft: true, secondary: 'services', doc: 'kubernetes-engine/docs/concepts/alias-ips', tip: 'GKE’s default is a /20. Newer clusters can use GKE’s own 34.118.224.0/20 instead: then untick this' },
];
// Oracle Cloud: regional subnets. Oracle gives few minimum sizes, so most sizes follow its examples (soft).
// Checked against Oracle docs, November 2026.
const OCI_SVCS = [
  { id: 'oci-nfw',       role: 'hub',   label: 'Network Firewall', name: 'firewall', min: 29, rec: 28, on: true, soft: true, doc: 'network-firewall/overview.htm', tip: 'The spokes route through it via the DRG. Oracle sets no size; with NAT it needs 4 or 5 spare addresses' },
  { id: 'oci-shared',    role: 'hub',   label: 'Shared services (DNS, AD, jump hosts)', name: 'shared-services', min: 29, rec: 26, on: true },
  { id: 'oci-lb',        role: 'spoke', label: 'Public: load balancers', name: 'lb-public', min: 29, rec: 26, on: true, soft: true, doc: 'Balance/Tasks/managingloadbalancer.htm', tip: 'A public load balancer takes 2 addresses in a regional subnet' },
  { id: 'oci-app',       role: 'spoke', label: 'Private: application', name: 'private-app', min: 29, rec: 24, on: true },
  { id: 'oci-db',        role: 'spoke', label: 'Private: databases', name: 'private-db', min: 29, rec: 24, on: true },
  { id: 'oci-fss',       role: 'spoke', label: 'File Storage mount targets', name: 'fss', min: 29, rec: 28, on: false, doc: 'File/Tasks/managingmounttargets.htm', tip: 'Each mount target takes 3 addresses, so a /28 holds 4. Not a /30 or smaller' },
  { id: 'oci-oke-api',   role: 'spoke', label: 'OKE: Kubernetes API endpoint', name: 'oke-api', min: 30, rec: 29, on: false, soft: true, doc: 'ContEng/Concepts/contengnetworkconfig.htm', tip: 'Oracle’s examples use a /30 or a /29' },
  { id: 'oci-oke-nodes', role: 'spoke', label: 'OKE: worker nodes', name: 'oke-nodes', min: 29, rec: 24, on: false, soft: true, doc: 'ContEng/Concepts/contengnetworkconfig.htm' },
  { id: 'oci-oke-pods',  role: 'spoke', label: 'OKE: Pods (VCN-native pod networking)', name: 'oke-pods', min: 24, rec: 19, max: 16, on: false, soft: true, doc: 'ContEng/Concepts/contengpodnetworking_topic-OCI_CNI_plugin.htm', tip: 'Every Pod takes a VCN address, up to 256 per node. Oracle’s example uses a /19' },
  { id: 'oci-oke-lb',    role: 'spoke', label: 'OKE: service load balancers', name: 'oke-lb', min: 29, rec: 24, on: false, soft: true, doc: 'ContEng/Concepts/contengnetworkconfig.htm' },
];
// One template per cloud: the dialog, placement and checks are shared.
const TEMPLATES = {
  azure: { cloud: 'azure', net: 'VNet', svcs: AZURE_SVCS, docBase: LEARN, docName: 'Microsoft Learn', hubWhat: 'services', maxNet: 8, title: 'Azure hub-and-spoke with service subnets',
    sub: 'Pick the Azure services you need. Each one gets a subnet of its own, named and sized for it: the hub VNet holds the shared services (gateway, firewall, Bastion, DNS), and each spoke VNet holds workloads. Sizes start at Microsoft’s recommendation; the menus never go below the minimum. Applying replaces the IPv4 plan, and Undo brings it back.',
    singleTitle: 'Azure VNet with service subnets',
    singleSub: 'Pick the Azure services you need. Each one gets a subnet of its own in this VNet, with the name or delegation Azure requires and a size from Microsoft’s recommendation; the menus never go below the minimum. Need shared services in a hub instead? Convert to hub and spoke, and your choices carry over. Applying replaces the IPv4 plan, and Undo brings it back.' },
  aws: { cloud: 'aws', net: 'VPC', svcs: AWS_SVCS, docBase: 'https://docs.aws.amazon.com/', docName: 'AWS docs', hubWhat: 'network: inspection and egress', maxNet: 16, zones: true,
    zoneWord: 'Availability Zones', zoneOne: 'Availability Zone', zoneCol: 'Zone', zoneDefault: 'us-east-1a, us-east-1b, us-east-1c', title: 'AWS hub-and-spoke with service subnets',
    sub: 'Pick the AWS services you need. Each gets a subnet of its own in every Availability Zone: the hub VPC holds the shared network (Transit Gateway attachments, Network Firewall, central NAT), and each spoke VPC holds workloads, all joined by a Transit Gateway. VPCs can be /16 at most. Applying replaces the IPv4 plan, and Undo brings it back.',
    singleTitle: 'AWS VPC with service subnets',
    singleSub: 'Pick the AWS services you need. Each gets a subnet of its own in every Availability Zone of this VPC, sized from AWS guidance. A VPC can be /16 at most. Need a shared network hub instead? Convert to hub and spoke, and your choices carry over. Applying replaces the IPv4 plan, and Undo brings it back.' },
  gcp: { cloud: 'gcp', net: 'VPC', svcs: GCP_SVCS, docBase: 'https://cloud.google.com/', docName: 'Google Cloud docs', hubWhat: 'network: appliances and shared services', maxNet: 8, zones: true,
    zoneWord: 'Regions', zoneOne: 'region', zoneCol: 'Region', zoneDefault: 'us-central1',
    title: 'Google Cloud hub-and-spoke with service subnets',
    sub: 'Pick the Google Cloud services you need. Each gets a subnet of its own in every region you list: the hub VPC holds network appliances and shared services, and each spoke VPC holds workloads, joined by VPC Network Peering. Peering isn’t transitive, so spokes reach each other only through an appliance in the hub. Applying replaces the IPv4 plan, and Undo brings it back.',
    singleTitle: 'Google Cloud VPC with service subnets',
    singleSub: 'Pick the Google Cloud services you need. Each gets a subnet of its own in every region you list, sized from Google’s guidance; the GKE Pod and Service ranges become secondary ranges on the GKE node subnet in the Terraform export. Need a shared hub instead? Convert to hub and spoke, and your choices carry over. Applying replaces the IPv4 plan, and Undo brings it back.' },
  oci: { cloud: 'oci', net: 'VCN', svcs: OCI_SVCS, docBase: 'https://docs.oracle.com/en-us/iaas/Content/', docName: 'Oracle docs', hubWhat: 'network: firewall and shared services', maxNet: 16,
    title: 'Oracle Cloud hub-and-spoke with service subnets',
    sub: 'Pick the OCI services you need. Each gets a regional subnet of its own: the hub VCN holds the Network Firewall and shared services, and each spoke VCN holds workloads, all attached to a DRG (Dynamic Routing Gateway). A VCN can be /16 at most. Oracle gives few minimum sizes, so most sizes follow its examples. Applying replaces the IPv4 plan, and Undo brings it back.',
    singleTitle: 'Oracle Cloud VCN with service subnets',
    singleSub: 'Pick the OCI services you need. Each gets a regional subnet of its own in this VCN. A VCN can be /16 at most, and Oracle gives few minimum sizes, so most sizes follow its examples. Need a shared hub instead? Convert to hub and spoke, and your choices carry over. Applying replaces the IPv4 plan, and Undo brings it back.' },
};
const dict = (pairs) => Object.assign(Object.create(null), Object.fromEntries(pairs));  // no prototype: "constructor" isn't a key
const SVCS = [...AZURE_SVCS, ...AWS_SVCS, ...GCP_SVCS, ...OCI_SVCS];
const SVC_BY_ID = dict(SVCS.map((s) => [s.id, s]));
const AZ_FIXED = dict(AZURE_SVCS.filter((s) => s.fixed).map((s) => [s.name.toLowerCase(), s]));
// The cloud service a subnet is dedicated to: its d field, or a required Azure name such as AzureBastionSubnet.
const svcOf = (m) => (m.d && SVC_BY_ID[m.d]) || (m.n && AZ_FIXED[m.n.toLowerCase()] && AZ_FIXED[m.n.toLowerCase()].name === m.n ? AZ_FIXED[m.n.toLowerCase()] : null);
// A required Azure name in any case, alone or as a whole word in a longer name ("uksouth-AzureBastionSubnet",
// "GatewaySubnet-hub"). Not inside another word: AppGatewaySubnet is a normal subnet.
const AZ_NEAR = Object.keys(AZ_FIXED).map((k) => [new RegExp(`(^|[^a-z0-9])${k}([^a-z0-9]|$)`), AZ_FIXED[k]]);
const azNear = (n) => { if (!n) return null; const l = n.toLowerCase(); const hit = AZ_NEAR.find(([re]) => re.test(l)); return hit ? hit[1] : null; };

// Everything about one subnet under the current platform rules.
const hostInfo = (addr, mask, c = settings.cloud) => {
  const sz = size(mask), last = addr + sz - 1;
  /** @type {{ addr: number, mask: number, last: number, reserved: [number, string][], uF: number | null, uL: number | null, hosts: number, gw: number | null, note: string, warn: string }} */
  const r = { addr, mask, last, reserved: [], uF: null, uL: null, hosts: 0, gw: null, note: '', warn: '' };
  if (c === 'std') {
    if (mask === 32) Object.assign(r, { uF: addr, uL: addr, hosts: 1, note: 'Single host (loopback or host route)' });
    else if (mask === 31) Object.assign(r, { uF: addr, uL: last, hosts: 2, note: 'Point-to-point link (RFC 3021): both addresses usable, no broadcast' });
    else {
      Object.assign(r, { uF: addr + 1, uL: last - 1, hosts: sz - 2, gw: settings.gw === 'last' ? last - 1 : addr + 1 });
      r.reserved = [[addr, 'the network ID'], [last, 'the broadcast address']];
    }
    return r;
  }
  const lbl = CLOUDS[c].label;
  if (mask > CLOUDS[c].min) r.warn = `${lbl} subnets can’t be smaller than /${CLOUDS[c].min}`;
  if (sz < (c === 'oci' ? 4 : 8)) return r;
  if (c === 'oci') {
    Object.assign(r, { uF: addr + 2, uL: last - 1, hosts: sz - 3, gw: addr + 1 });
    r.reserved = [[addr, 'the network ID'], [addr + 1, 'the default gateway (reserved by OCI)'], [last, 'the broadcast address (reserved by OCI)']];
  } else if (c === 'gcp') {
    Object.assign(r, { uF: addr + 2, uL: last - 2, hosts: sz - 4, gw: addr + 1 });
    r.reserved = [[addr, 'the network ID'], [addr + 1, 'the default gateway (reserved by Google Cloud)'], [last - 1, 'reserved by Google Cloud'], [last, 'the broadcast address (reserved)']];
  } else {
    Object.assign(r, { uF: addr + 4, uL: last - 1, hosts: sz - 5, gw: addr + 1 });
    r.reserved = c === 'aws'
      ? [[addr, 'the network ID'], [addr + 1, 'the VPC router (reserved by AWS)'], [addr + 2, 'reserved by AWS (DNS)'], [addr + 3, 'reserved by AWS for future use'], [last, 'the broadcast address (reserved by AWS)']]
      : [[addr, 'the network ID'], [addr + 1, 'the default gateway (reserved by Azure)'], [addr + 2, 'reserved by Azure (DNS)'], [addr + 3, 'reserved by Azure (DNS)'], [last, 'the broadcast address (reserved by Azure)']];
  }
  return r;
};

// =====================================================================
// State
// =====================================================================
// A node is { c: null } (leaf) or { c: [left, right] } (split into halves).
// A plan holds one or more non-overlapping base networks ("blocks"), each with its own tree and platform.
// state.network / mask / root and settings.cloud always refer to the active block.
/** A tree node: a leaf, or split into halves (IPv6 also splits 16 ways on nibble boundaries).
    @typedef {{ c: TreeNode[] | null }} TreeNode */
/** One base network of the plan. v6: dual-stack (its subnets get IPv6 /64s in the cloud exports); v6p: the IPv6 range, where
    the network's owner picks it (Azure). @typedef {{ network: number, mask: number, root: TreeNode, cloud: string, label: string, v6?: boolean, v6p?: string }} Block */
/** The plan. network, mask and root are the active block's (getters below).
    @typedef {{ blocks: Block[], active: number, meta: Record<string, any>, hosts: Record<string, any>, peers: [string, string][] | null,
      po: typeof PEER_DEFAULTS, network: number, mask: number, root: TreeNode }} PlanState */
/** @type {(network: number, mask: number, cloud?: string, label?: string) => Block} */
const mkBlock = (network, mask, cloud = 'std', label = '') => ({ network, mask, root: { c: null }, cloud, label });
// Peering options: m layout (hub / mesh / custom / none), h hub base network, f Azure forwarded traffic,
// g Azure gateway transit, t AWS connection (tgw = Transit Gateway, pcx = VPC peering), r AWS routes in main route tables.
const PEER_DEFAULTS = { m: 'hub', h: '', f: 1, g: 0, t: 'tgw', r: 1 };
const state = /** @type {PlanState} */ ({ blocks: [mkBlock(/** @type {number} */ (aton('192.168.0.0')), 24)], active: 0, meta: {}, hosts: {}, peers: null, po: { ...PEER_DEFAULTS } });
// meta: { 'a.b.c.d/m': { n: name, v: vlan, o: note, s: 'used' | 'reserved' } }, shared by all blocks
const blk = () => state.blocks[state.active];
for (const f of ['network', 'mask', 'root']) Object.defineProperty(state, f, { get: () => blk()[f], set: (v) => { blk()[f] = v; } });
Object.defineProperty(settings, 'cloud', { get: () => blk().cloud, set: (v) => { blk().cloud = v; }, enumerable: true });
const blockCidr = (b) => cidrStr(b.network, b.mask);
const keyInBlock = (k, b) => { const c = parseCidr(k); return !!c && c.mask >= b.mask && inBlock(c.addr, b.network, b.mask); };
const blockMetaKeys = (b = blk()) => Object.keys(state.meta).filter((k) => keyInBlock(k, b));
const clearBlockMeta = (b = blk()) => { for (const k of blockMetaKeys(b)) delete state.meta[k]; };
const blockOf = (ip) => state.blocks.findIndex((b) => inBlock(ip, b.network, b.mask));
const blockClash = (addr, mask, skip = -1) => state.blocks.find((b, i) => i !== skip && overlaps(addr, mask, b.network, b.mask));
// Peering: state.peers is null (never set up) or a list of [cidr, cidr] pairs of base networks, hub first.
const PEER_CLOUDS = ['azure', 'aws', 'gcp', 'oci'];
/** @type {(c: string) => Block | undefined} */
const blockByCidr = (c) => state.blocks.find((b) => blockCidr(b) === c);
const cleanPo = (po) => {
  const p = po && typeof po === 'object' ? po : {};
  return { m: ['hub', 'mesh', 'custom', 'none'].includes(p.m) ? p.m : 'hub', h: typeof p.h === 'string' ? p.h : '', f: p.f === 0 ? 0 : 1, g: p.g === 1 ? 1 : 0, t: p.t === 'pcx' ? 'pcx' : 'tgw', r: p.r === 0 ? 0 : 1 };
};
/** @type {(p: any) => [string, string][] | null} */
const cleanPeers = (p) => (Array.isArray(p) ? p.filter((x) => Array.isArray(x) && x.length === 2 && typeof x[0] === 'string' && typeof x[1] === 'string' && x[0] !== x[1]).slice(0, 1000).map((x) => /** @type {[string, string]} */ ([x[0], x[1]])) : null);
// Pairs that can be exported: both base networks still exist and are on the same cloud (Azure or AWS).
/** @type {() => [Block, Block][]} */
const peerPairs = () => (state.peers || []).map(([a, b]) => [blockByCidr(a), blockByCidr(b)])
  .filter(/** @returns {p is [Block, Block]} */ (p) => !!(p[0] && p[1] && p[0] !== p[1] && p[0].cloud === p[1].cloud && PEER_CLOUDS.includes(p[0].cloud)));
// A base network got a new address or size: keep its peerings.
const renamePeers = (from, to) => {
  if (from === to) return;
  if (state.peers) state.peers = state.peers.map(([a, b]) => [a === from ? to : a, b === from ? to : b]);
  if (state.po.h === from) state.po.h = to;
};
const getMeta = (key) => state.meta[key] || {};
const setMeta = (key, field, val) => {
  const m = { ...getMeta(key) };
  if (val === '' || val == null) delete m[field]; else m[field] = val;
  if (Object.keys(m).length) state.meta[key] = m; else delete state.meta[key];
};
let existing = [];  // networks pasted into the overlap checker
/** @type {number | null} */
let foundIp = null; // address from the Find IP box

const COLS = [
  { key: 'subnet',   label: 'Subnet', locked: true },
  { key: 'divide',   label: 'Divide', locked: true },
  { key: 'group',    label: 'Group' },
  { key: 'name',     label: 'Name' },
  { key: 'vlan',     label: 'VLAN' },
  { key: 'zone',     label: 'Zone' },
  { key: 'netmask',  label: 'Netmask' },
  { key: 'wildcard', label: 'Wildcard' },
  { key: 'range',    label: 'Address range' },
  { key: 'usable',   label: 'Usable IPs' },
  { key: 'gateway',  label: 'Gateway' },
  { key: 'hosts',    label: 'Hosts', num: true },
  { key: 'status',   label: 'Status' },
  { key: 'note',     label: 'Notes' },
  { key: 'binary',   label: 'Binary' },
  { key: 'join',     label: 'Join' },
];
const visible = {
  subnet: true, group: false, name: true, vlan: true, zone: false, netmask: false, wildcard: false, range: false, usable: true,
  gateway: true, hosts: true, status: true, note: false, binary: false, divide: true, join: true,
};
try {
  const saved = JSON.parse(localStorage.getItem('subnetPlanner.cols') || 'null');
  if (saved) for (const k in visible) if (typeof saved[k] === 'boolean') visible[k] = saved[k];
} catch (e) { /* storage unavailable */ }
for (const col of COLS) if (col.locked) visible[col.key] = true;

// =====================================================================
// Tree helpers (shared by IPv4 binary trees and IPv6 2/16-way trees)
// =====================================================================
const height = (n) => (n.c ? 1 + Math.max(...n.c.map(height)) : 0);
const leafCount = (n) => (n.c ? n.c.reduce((s, ch) => s + leafCount(ch), 0) : 1);

// Pre-order bits (1 = split, 0 = leaf), packed 4 bits per hex char ("len.hex").
const treeToBits = (n) => (n.c ? '1' + treeToBits(n.c[0]) + treeToBits(n.c[1]) : '0');
const packBits = (bits) => {
  let out = '', cur = 0, b = 0;
  for (let i = 0; i < bits.length; i++) {
    if (bits[i] === '1') cur |= 1 << b;
    if (++b > 3) { out += cur.toString(16); cur = 0; b = 0; }
  }
  if (b > 0) out += cur.toString(16);
  return bits.length + '.' + out;
};
const unpackBits = (str) => {
  const m = /^(\d+)\.([0-9a-f]*)$/i.exec(str || '');
  if (!m) return null;
  const len = Number(m[1]);
  if (Math.ceil(len / 4) > m[2].length) return null;
  let out = '';
  for (let i = 0; i < len; i++) {
    const ch = parseInt(m[2][Math.floor(i / 4)], 16);
    out += ch & (1 << (i % 4)) ? '1' : '0';
  }
  return out;
};
const bitsToTree = (bits, maxDepth) => {
  let i = 0;
  const build = (depth) => {
    if (i >= bits.length) throw new Error('short');
    const bit = bits[i++];
    if (bit === '0') return { c: null };
    if (depth >= maxDepth) throw new Error('too deep');
    return { c: [build(depth + 1), build(depth + 1)] };
  };
  const t = build(0);
  if (i !== bits.length) throw new Error('trailing');
  return t;
};
// Split the tree down so that addr/mask becomes a leaf.
const carve = (root, baseA, baseM, addr, mask) => {
  let node = root, a = baseA, m = baseM;
  while (m < mask) {
    if (!node.c) node.c = [{ c: null }, { c: null }];
    const half = size(m + 1);
    if (addr >= a + half) { node = node.c[1]; a += half; } else node = node.c[0];
    m++;
  }
  node.c = null;
};
// Split a leaf into equal /n subnets; splitAll does it for every leaf bigger than /n.
const splitTo = (node, m, n) => {
  if (m >= n) return;
  node.c = [{ c: null }, { c: null }];
  splitTo(node.c[0], m + 1, n); splitTo(node.c[1], m + 1, n);
};
const splitAll = (node, m, n) => { if (node.c) node.c.forEach((ch) => splitAll(ch, m + 1, n)); else splitTo(node, m, n); };
const leavesAfterSplit = (node, m, n) => (node.c ? leavesAfterSplit(node.c[0], m + 1, n) + leavesAfterSplit(node.c[1], m + 1, n) : (m < n ? 2 ** (n - m) : 1));
const MAX_SPLIT = 4096;
const nodeKeys = () => {
  const s = new Set();
  const walk = (n, a, m) => {
    s.add(cidrStr(a, m));
    if (n.c) { walk(n.c[0], a, m + 1); walk(n.c[1], a + size(m + 1), m + 1); }
  };
  for (const b of state.blocks) walk(b.root, b.network, b.mask);
  return s;
};

// =====================================================================
// IPv6 math (BigInt)
// =====================================================================
const ALL6 = (1n << 128n) - 1n;
const size6 = (m) => 1n << BigInt(128 - m);
const net6 = (n, m) => n & (ALL6 ^ (size6(m) - 1n));
const parse6 = (s) => {
  s = String(s || '').trim().toLowerCase();
  if (!/^[0-9a-f:]+$/.test(s)) return null;
  const dbl = s.split('::');
  if (dbl.length > 2) return null;
  const groupsOf = (p) => (p === '' ? [] : p.split(':'));
  const head = groupsOf(dbl[0]), tail = dbl.length === 2 ? groupsOf(dbl[1]) : [];
  if (dbl.length === 1 && head.length !== 8) return null;
  if (dbl.length === 2 && head.length + tail.length > 7) return null;
  const groups = dbl.length === 2 ? [...head, ...Array(8 - head.length - tail.length).fill('0'), ...tail] : head;
  let n = 0n;
  for (const g of groups) {
    if (!/^[0-9a-f]{1,4}$/.test(g)) return null;
    n = (n << 16n) | BigInt(parseInt(g, 16));
  }
  return n;
};
const fmt6 = (n) => {
  const g = [];
  for (let i = 7; i >= 0; i--) g.push(Number((n >> BigInt(i * 16)) & 0xffffn));
  let bs = -1, bl = 0;
  for (let i = 0; i < 8;) {
    if (g[i] === 0) { let j = i; while (j < 8 && g[j] === 0) j++; if (j - i > bl) { bs = i; bl = j - i; } i = j; } else i++;
  }
  const hx = g.map((x) => x.toString(16));
  if (bl < 2) return hx.join(':');
  return hx.slice(0, bs).join(':') + '::' + hx.slice(bs + bl).join(':');
};
const parse6Cidr = (s) => {
  const m = /^\s*([0-9a-fA-F:]+)\s*(?:\/\s*(\d{1,3}))?\s*$/.exec(s || '');
  if (!m) return null;
  const n = parse6(m[1]);
  const len = m[2] === undefined ? 64 : Number(m[2]);
  if (n === null || len > 128) return null;
  return { n, mask: len, net: net6(n, len) };
};
const SPECIAL6 = [
  ['::1/128', 'Loopback', 'warn'], ['::/128', 'Unspecified', 'warn'],
  ['64:ff9b::/96', 'NAT64 well-known prefix (RFC 6052)', 'warn'], ['100::/64', 'Discard-only (RFC 6666)', 'warn'],
  ['2001::/32', 'Teredo', 'warn'], ['2001:db8::/32', 'Documentation (RFC 3849)', 'warn'], ['2002::/16', '6to4 (deprecated)', 'warn'],
  ['fc00::/7', 'Unique local, ULA (RFC 4193)', 'ok'], ['fe80::/10', 'Link-local', 'warn'], ['ff00::/8', 'Multicast', 'danger'],
  ['2000::/3', 'Global unicast', ''],
].map(([c, label, kind]) => { const p = builtIn(parse6Cidr, c); return { n: p.net, mask: p.mask, label, kind, cidr: c }; });
const classTags6 = (n, m) => {
  const end = n + size6(m) - 1n;
  const hits = SPECIAL6.filter((r) => n <= r.n + size6(r.mask) - 1n && r.n <= end);
  const inside = hits.filter((r) => n >= r.n && end <= r.n + size6(r.mask) - 1n);
  const pick = inside.length ? [inside.sort((a, b) => b.mask - a.mask)[0]] : hits;
  if (!pick.length) return '<span class="tag warn">Not in a commonly assigned range</span>';
  return pick.map((h) => `<span class="tag ${h.kind}">${esc(h.label)}</span>`).join(' ');
};
const pow2Str = (k) => (k <= 40 ? fmt(2 ** k) : `2<sup>${k}</sup>`);
const pow2Text = (k) => (k <= 40 ? String(2 ** k) : `2^${k}`);

const V6_DEFAULT = '2001:db8::/48';
const MAX6 = 4096;
/** The IPv6 plan. @type {{ net: bigint, mask: number, root: TreeNode, meta: Record<string, any> }} */
const v6 = { net: builtIn(parse6, '2001:db8::'), mask: 48, root: { c: null }, meta: {} };
const v6Key = (a, m) => `${fmt6(a)}/${m}`;

// ---------- Dual-stack cloud networks ----------
// A dual-stack base network gives each subnet an IPv6 /64 in the cloud exports. AWS and Oracle Cloud assign the network
// a /56 and the subnets pick /64s from it by number (0-255); Azure uses a range you choose (a private ULA /48 by
// default) with /64 subnets; Google Cloud assigns each subnet's /64 itself.
const DUAL_STACK_CLOUDS = ['aws', 'azure', 'gcp', 'oci'];
// A random private range (RFC 4193 unique local address): fd + 40 random bits, /48.
const ulaPrefix = () => {
  const r = crypto.getRandomValues(new Uint8Array(5));
  const h = [...r].map((x) => x.toString(16).padStart(2, '0')).join('');
  return v6Key(builtIn(parse6, `fd${h.slice(0, 2)}:${h.slice(2, 6)}:${h.slice(6, 10)}::`), 48);
};
// An IPv6 range for a network, written the standard way, or '' when it isn't one: it must leave room for 256 /64s.
/** @type {(s: any) => string} */
const cleanV6Range = (s) => {
  const p = parse6Cidr(String(s ?? '').trim());
  if (!p || !/\//.test(String(s)) || p.mask > 56 || p.mask < 8 || p.n !== p.net) return '';
  return v6Key(p.net, p.mask);
};
/** @type {(blocks: Block[], d6: any) => void} */
const applyDualStack = (blocks, d6) => {
  if (!d6 || typeof d6 !== 'object') return;
  for (const b of blocks) {
    const v = d6[blockCidr(b)];
    if (!v || !DUAL_STACK_CLOUDS.includes(b.cloud)) continue;
    b.v6 = true;
    const r = cleanV6Range(v);
    if (r) b.v6p = r;
    else if (b.cloud === 'azure') b.v6p = ulaPrefix();
  }
};
// Can this subnet be dual-stack? Azure's gateway, firewall, Bastion and Route Server subnets and its delegated
// subnets stay IPv4-only (Azure allows that inside a dual-stack VNet), as do Google Cloud's proxy-only and other
// special-purpose subnets.
/** @type {(meta: Record<string, any>, cloud: string) => boolean} */
const v6Capable = (meta, cloud) => {
  if (cloud === 'aws' || cloud === 'oci') return true;
  const svc = svcOf(meta);
  return !svc || (cloud === 'gcp' && !svc.purpose && !svc.secondary && svc.id !== 'gcp-psa');
};
// Each dual-stack subnet's /64 number, 0-255. It follows the subnet's place in the network (the network split into
// 256 equal slices), so it stays the same from one export to the next; two subnets in one slice take the next free
// numbers. Subnets past the 256th get none.
/** @type {(b: Block, items: { key: string, addr: number, mask: number }[]) => Map<string, number>} */
const dualStackIndex = (b, items) => {
  const out = new Map(), taken = new Set();
  const slice = size(Math.min(b.mask + 8, 32));
  const wants = [...items].sort((x, y) => x.addr - y.addr).map((x) => [x.key, Math.floor((x.addr - b.network) / slice)]);
  const late = [];
  for (const [k, i] of wants) { if (taken.has(i)) late.push(k); else { taken.add(i); out.set(k, i); } }
  let next = 0;
  for (const k of late) { while (taken.has(next)) next++; if (next > 255) break; taken.add(next); out.set(k, next); }
  return out;
};
// Azure: the subnet's /64 inside the network's range.
/** @type {(b: Block, i: number) => string} */
const azSubnet6 = (b, i) => { const p = builtIn(parse6Cidr, b.v6p || ''); return v6Key(p.net + (BigInt(i) << 64n), 64); };
// v6.meta: { 'prefix/len': { n: name, v: vlan, o: note, s: 'used' | 'reserved' } }
const v6Get = (k) => v6.meta[k] || {};
const v6Set = (k, f, val) => {
  const m = { ...v6Get(k) };
  if (val === '' || val == null) delete m[f]; else m[f] = val;
  if (Object.keys(m).length) v6.meta[k] = m; else delete v6.meta[k];
};
const v6TreeStr = (n) => (!n.c ? '0' : (n.c.length === 16 ? 'n' : '1') + n.c.map(v6TreeStr).join(''));
const v6TreeParse = (s, mask) => {
  let i = 0;
  const b = (m) => {
    const ch = s[i++];
    if (ch === '0') return { c: null };
    const k = ch === 'n' ? 16 : ch === '1' ? 2 : 0;
    if (!k) throw new Error('bad');
    const bits = k === 16 ? 4 : 1;
    if (m + bits > 128) throw new Error('deep');
    const c = [];
    for (let j = 0; j < k; j++) c.push(b(m + bits));
    return { c };
  };
  const t = b(mask);
  if (i !== s.length || leafCount(t) > MAX6) throw new Error('bad');
  return t;
};
const v6Walk = () => {
  const leaves = [];
  const walk = (node, a, m, depth, parent, idx) => {
    if (node.c) {
      const bits = node.c.length === 16 ? 4 : 1;
      const me = { node, a, m, count: node.c.length };
      node.c.forEach((ch, i) => walk(ch, a + BigInt(i) * size6(m + bits), m + bits, depth + 1, me, i));
    } else leaves.push({ node, a, m, depth, parent, idx });
  };
  walk(v6.root, v6.net, v6.mask, 0, null, 0);
  return leaves;
};

// =====================================================================
// DOM helpers
// =====================================================================
/** The element with this id. Typed `any` because each caller knows what kind of element it fetches. @type {(id: string) => any} */
const $ = (id) => document.getElementById(id);
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const netInput = $('network'), maskInput = $('mask');

const showMsg = (id, text, kind = 'info') => { const m = $(id); m.textContent = text; m.className = 'msg show ' + kind; };
const clearMsg = (id) => { const m = $(id); m.className = 'msg'; m.textContent = ''; };

let toastTimer;
// toast(text) or toast(text, { label, fn }) for a clickable action such as Undo (or a list of them).
/** @typedef {{ label: string, fn: () => void }} ToastAction */
/** @type {(text: string, action?: ToastAction | ToastAction[]) => void} */
const toast = (text, action) => {
  const t = $('toast');
  t.textContent = text;
  t.classList.toggle('act', !!action);
  for (const a of /** @type {ToastAction[]} */ (action ? [action].flat() : [])) {
    const b = document.createElement('button');
    b.type = 'button';
    b.textContent = a.label;
    b.addEventListener('click', () => { t.classList.remove('show', 'act'); a.fn(); });
    t.appendChild(b);
  }
  t.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => t.classList.remove('show', 'act'), action ? 5000 : 1800);
};
const copyText = async (text) => {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch (e) {
    const ta = document.createElement('textarea');
    ta.value = text;
    ta.style.position = 'fixed';
    ta.style.opacity = '0';
    document.body.appendChild(ta);
    ta.select();
    let ok = false;
    try { ok = document.execCommand('copy'); } catch (e2) { /* ignore */ }
    ta.remove();
    return ok;
  }
};
const download = (name, text, type) => {
  const a = document.createElement('a');
  a.href = URL.createObjectURL(text instanceof Blob ? text : new Blob([text], { type }));
  a.download = name;
  document.body.appendChild(a);
  a.click();
  setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 0);
};
const csvQ = (s) => `"${String(s ?? '').replace(/"/g, '""')}"`;
const parseCsv = (t) => {
  const rows = []; let row = [], f = '', q = false;
  for (let i = 0; i < t.length; i++) {
    const c = t[i];
    if (q) {
      if (c === '"') { if (t[i + 1] === '"') { f += '"'; i++; } else q = false; } else f += c;
    } else if (c === '"') q = true;
    else if (c === ',') { row.push(f); f = ''; }
    else if (c === '\n' || c === '\r') {
      if (c === '\r' && t[i + 1] === '\n') i++;
      row.push(f); rows.push(row); row = []; f = '';
    } else f += c;
  }
  if (f !== '' || row.length) { row.push(f); rows.push(row); }
  return rows.filter((r) => r.some((x) => x.trim() !== ''));
};
const validVlan = (v) => /^\d+$/.test(String(v).trim()) && +v >= 1 && +v <= 4094;
const normStatus = (s) => {
  const t = String(s || '').trim().toLowerCase();
  if (t === 'used' || t === 'in use' || t === 'inuse' || t === 'active') return 'used';
  if (t === 'reserved') return 'reserved';
  return '';
};
// Subnet details that arrive from a link, a saved plan or an import: keep only known fields, valid VLANs and
// statuses, and turn control characters (newlines, tabs) into spaces so they can't add lines to exported configs.
// eslint-disable-next-line no-control-regex -- matching control characters is the point
const oneLine = (v) => String(v).replace(/[\u0000-\u001f\u007f]+/g, ' ');
const cleanMeta = (v) => {
  const m = typeof v === 'string' ? { n: v } : (v && typeof v === 'object' ? v : {});
  const c = {};
  if (m.n) c.n = oneLine(m.n);
  if (m.v != null && m.v !== '' && validVlan(m.v)) c.v = String(+m.v);
  if (m.z) c.z = oneLine(m.z).trim();
  if (m.o) c.o = oneLine(m.o);
  const st = normStatus(m.s);
  if (st) c.s = st;
  if (m.d && SVC_BY_ID[m.d]) c.d = m.d;
  return Object.keys(c).length ? c : null;
};
const cleanMetaMap = (o) => {
  const out = {};
  if (o && typeof o === 'object') for (const [k, v] of Object.entries(o)) { const c = cleanMeta(v); if (c) out[k] = c; }
  return out;
};

// =====================================================================
// URL state:  #net/mask/tree[/base64url(JSON extras)]
// =====================================================================
const b64e = (str) => {
  const bytes = new TextEncoder().encode(str);
  let bin = '';
  bytes.forEach((b) => { bin += String.fromCharCode(b); });
  return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
};
const b64d = (s) => {
  s = s.replace(/-/g, '+').replace(/_/g, '/');
  while (s.length % 4) s += '=';
  return new TextDecoder().decode(Uint8Array.from(atob(s), (c) => c.charCodeAt(0)));
};
const v6Serialize = () => {
  const keys = new Set();
  const walk = (n, a, m) => {
    keys.add(v6Key(a, m));
    if (n.c) { const bits = n.c.length === 16 ? 4 : 1; n.c.forEach((ch, i) => walk(ch, a + BigInt(i) * size6(m + bits), m + bits)); }
  };
  walk(v6.root, v6.net, v6.mask);
  const meta = {};
  for (const k in v6.meta) {
    const m = v6.meta[k];
    if (!keys.has(k) || !m || !Object.keys(m).length) continue;
    meta[k] = Object.keys(m).length === 1 && m.n ? m.n : m;
  }
  const p = v6Key(v6.net, v6.mask);
  if (p === V6_DEFAULT && !v6.root.c && !Object.keys(meta).length) return null;
  const o = { p, t: v6TreeStr(v6.root) };
  if (Object.keys(meta).length) o.m = meta;
  return o;
};
const v6Load = (o) => {
  const p = parse6Cidr(o && o.p);
  if (!p) return;
  v6.net = p.net; v6.mask = p.mask;
  try { v6.root = o.t ? v6TreeParse(String(o.t), p.mask) : { c: null }; } catch (e) { v6.root = { c: null }; }
  // Older links store just a name string per prefix; cleanMeta accepts both.
  v6.meta = cleanMetaMap(o.m);
};
// ---------- IP assignments: single addresses with a name, MAC and notes ----------
// Kept by address, not by subnet, so they stay put when subnets are split or joined.
// MACs are stored as aa:bb:cc:dd:ee:ff; aa-bb-…, aabb.ccdd.eeff and aabbccddeeff are accepted.
const normMac = (s) => {
  const t = String(s ?? '').trim();
  if (!t || !/^[0-9a-f:.-]+$/i.test(t)) return '';
  const hex = t.replace(/[^0-9a-f]/gi, '').toLowerCase();
  return hex.length === 12 ? (hex.match(/../g) || []).join(':') : '';
};
const cleanHost = (v) => {
  const a = Array.isArray(v) ? v : v && typeof v === 'object' ? [v.n ?? v.name, v.m ?? v.mac, v.o ?? v.note] : [v];
  const c = {};
  if (a[0]) c.n = oneLine(a[0]).trim().slice(0, 80);
  const m = normMac(a[1]);
  if (m) c.m = m;
  if (a[2]) c.o = oneLine(a[2]).trim().slice(0, 200);
  return c.n || c.m || c.o ? c : null;
};
const cleanHosts = (o) => {
  const out = {};
  if (o && typeof o === 'object' && !Array.isArray(o)) for (const [k, v] of Object.entries(o)) { const ip = aton(k), c = cleanHost(v); if (ip !== null && c) out[ntoa(ip)] = c; }
  return out;
};
// Assigned addresses as sorted numbers, rebuilt when the assignments change.
/** @type {number[] | null} */
let hostIpsCache = null;
// The keys were checked when they were added (cleanHosts), so each one parses.
const hostIps = () => hostIpsCache || (hostIpsCache = Object.keys(state.hosts).map((k) => /** @type {number} */ (aton(k))).sort((a, b) => a - b));
const hostsChanged = () => { hostIpsCache = null; };
const hostsIn = (addr, mask) => {
  const ips = hostIps(), last = lastAddr(addr, mask);
  let lo = 0, hi = ips.length;
  while (lo < hi) { const mid = (lo + hi) >> 1; if (ips[mid] < addr) lo = mid + 1; else hi = mid; }
  const out = [];
  for (let i = lo; i < ips.length && ips[i] <= last; i++) out.push(ips[i]);
  return out;
};
const extras = () => {
  const keys = nodeKeys();
  const m = {};
  for (const k in state.meta) if (keys.has(k)) m[k] = state.meta[k];
  const o = {};
  const b0 = state.blocks[0];
  if (b0.cloud !== 'std') o.c = b0.cloud;
  if (b0.label) o.l = b0.label;
  if (settings.gw !== 'first') o.g = settings.gw;
  if (Object.keys(m).length) o.m = m;
  if (state.blocks.length > 1) {
    o.b = state.blocks.slice(1).map((b) => {
      const e = [blockCidr(b), packBits(treeToBits(b.root))];
      if (b.cloud !== 'std' || b.label) e.push(b.cloud);
      if (b.label) e.push(b.label);
      return e;
    });
    if (state.active) o.a = state.active;
  }
  if (state.peers) { o.p = state.peers.filter(([a, b]) => blockByCidr(a) && blockByCidr(b)); o.po = state.po; }
  // Dual-stack networks: { cidr: 1 } or { cidr: their IPv6 range }.
  const d6 = state.blocks.filter((b) => b.v6).map((b) => [blockCidr(b), b.v6p || 1]);
  if (d6.length) o.d6 = Object.fromEntries(d6);
  // Assigned addresses inside the plan, each as [name] or [name, mac] or [name, mac, notes].
  const hs = Object.entries(state.hosts).filter(([ip]) => blockOf(aton(ip)) >= 0);
  if (hs.length) o.h = Object.fromEntries(hs.map(([ip, h]) => [ip, h.o ? [h.n || '', h.m || '', h.o] : h.m ? [h.n || '', h.m] : [h.n || '']]));
  const v = v6Serialize();
  if (v) o.v6 = v;
  return Object.keys(o).length ? b64e(JSON.stringify(o)) : '';
};
const stateHash = () => {
  const x = extras(), b0 = state.blocks[0];
  return `${ntoa(b0.network)}/${b0.mask}/${packBits(treeToBits(b0.root))}${x ? '/' + x : ''}`;
};
// ---------- Compact links ----------
// Inside the app a plan is "net/mask/tree/blob" with blob = base64url(JSON). In the page address the blob is
// deflate-compressed when that is clearly shorter, written as "~" + base64url(deflate-raw(JSON)).
const canZip = typeof CompressionStream === 'function' && typeof DecompressionStream === 'function';
const bytesToB64u = (bytes) => {
  let bin = '';
  for (let i = 0; i < bytes.length; i += 0x8000) bin += String.fromCharCode.apply(null, bytes.subarray(i, i + 0x8000));
  return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
};
const b64uToBytes = (s) => {
  s = s.replace(/-/g, '+').replace(/_/g, '/');
  while (s.length % 4) s += '=';
  return Uint8Array.from(atob(s), (c) => c.charCodeAt(0));
};
const pipeBytes = async (bytes, stream) => new Uint8Array(await new Response(new Blob([bytes]).stream().pipeThrough(stream)).arrayBuffer());
const toUrlHash = async (h) => {
  const parts = h.split('/');
  if (parts.length < 4 || !canZip) return h;
  try {
    const z = '~' + bytesToB64u(await pipeBytes(new TextEncoder().encode(b64d(parts[3])), new CompressionStream('deflate-raw')));
    if (z.length < parts[3].length * 0.85) parts[3] = z;
  } catch (e) { /* keep the plain form */ }
  return parts.join('/');
};
const fromUrlHash = async (h) => {
  const parts = h.split('/');
  if (!parts[3] || parts[3][0] !== '~') return h;
  if (!canZip) throw new Error('This link is compressed, and this browser is too old to open it. Try a current version of Chrome, Safari, Edge or Firefox.');
  parts[3] = b64e(new TextDecoder().decode(await pipeBytes(b64uToBytes(parts[3].slice(1)), new DecompressionStream('deflate-raw'))));
  return parts.join('/');
};

let lastHash = '';   // what is in the address bar now (compact form)
let hashSeq = 0;
let hashWritten = Promise.resolve();
const writeHash = () => {
  const h = stateHash();
  // Autosave the working plan so a bare visit (or the installed app) picks up where you left off.
  try { localStorage.setItem('subnetPlanner.current', h); } catch (e) { /* storage unavailable */ }
  const seq = ++hashSeq;
  hashWritten = toUrlHash(h).then((u) => {
    if (seq !== hashSeq) return;   // a newer write is on its way
    lastHash = u;
    try { history.replaceState(null, '', '#' + u); }
    catch (e) { location.hash = u; }
  });
  return hashWritten;
};
let hashTimer;
const writeHashSoon = () => { clearTimeout(hashTimer); hashTimer = setTimeout(writeHash, 300); };

const treeFrom = (division, m) => {
  const bits = division && unpackBits(division);
  try { if (bits) return bitsToTree(bits, 32 - m); } catch (e) { /* fall through */ }
  return { c: null };
};
// Restore a plan from a hash string ("net/mask/tree/blob") or from ?network=&mask=&division= query params.
const loadFromHash = (hash, q) => {
  let net, mask, division, blob;
  if (hash) [net, mask, division, blob] = hash.split('/');
  else if (q) { net = q.get('network'); mask = q.get('mask'); division = q.get('division'); }
  const n = aton(net || '');
  const m = Number(mask);
  if (n === null || !Number.isInteger(m) || m < 0 || m > 32) return false;
  let x = {};
  if (blob) { try { x = JSON.parse(b64d(blob)) || {}; } catch (e) { x = {}; } }
  const lbl = (v) => (typeof v === 'string' ? v.slice(0, 40) : '');
  const b0 = mkBlock(netAddr(n, m), m, CLOUDS[x.c] ? x.c : 'std', lbl(x.l));
  b0.root = treeFrom(division, m);
  const blocks = [b0];
  if (Array.isArray(x.b)) {
    for (const e of x.b) {
      const c = Array.isArray(e) && parseCidr(e[0]);
      if (!c || blocks.some((b) => overlaps(c.addr, c.mask, b.network, b.mask))) continue;
      const b = mkBlock(c.addr, c.mask, CLOUDS[e[2]] ? e[2] : 'std', lbl(e[3]));
      b.root = treeFrom(e[1], c.mask);
      blocks.push(b);
    }
  }
  applyDualStack(blocks, x.d6);
  state.blocks = blocks;
  state.active = Number.isInteger(x.a) && x.a > 0 && x.a < blocks.length ? x.a : 0;
  settings.gw = x.g === 'last' ? 'last' : 'first';
  state.meta = cleanMetaMap(x.m);
  state.hosts = cleanHosts(x.h);
  hostsChanged();
  state.peers = cleanPeers(x.p);
  state.po = cleanPo(x.po);
  v6Load(x.v6 || { p: V6_DEFAULT });
  return true;
};
// The address-bar hash, decoded. A stray % (e.g. a mangled link) would make decodeURIComponent throw.
const hashText = () => { const h = location.hash.replace(/^#/, ''); try { return decodeURIComponent(h); } catch (e) { return h; } };
// Async because compact links have to be decompressed first.
const loadFromLocation = async () => {
  const raw = hashText();
  if (!raw) return loadFromHash('', new URLSearchParams(location.search));
  let h;
  try { h = await fromUrlHash(raw); }
  catch (e) { showMsg('msg', e.message || 'That link couldn’t be read.', 'error'); return false; }
  lastHash = raw;
  return loadFromHash(h);
};

// ---------- Undo / redo: snapshots of the whole plan, taken before each change ----------
const undoStack = [], redoStack = [];
const UNDO_MAX = 100;
const updUndo = () => {
  $('undoBtn').disabled = $('v6Undo').disabled = !undoStack.length;
  $('redoBtn').disabled = !redoStack.length;
};
const checkpoint = () => {
  const h = stateHash();
  if (undoStack[undoStack.length - 1] !== h) undoStack.push(h);
  if (undoStack.length > UNDO_MAX) undoStack.shift();
  redoStack.length = 0;
  updUndo();
};
// Text cells: one checkpoint per focus, so typing a whole name is a single undo step.
const firstEdit = (inp) => { if (!inp.dataset.cp) { checkpoint(); inp.dataset.cp = '1'; } };
const restore = (h) => {
  loadFromHash(h);
  syncControls();
  render();
  renderV6();
  writeHash();
  if (!$('tab-export').hidden) renderExport();
  if (!$('tab-vlsm').hidden) updateVlsmBase();
  updUndo();
};
const stepHistory = (from, to, verb) => {
  const cur = stateHash();
  while (from.length && from[from.length - 1] === cur) from.pop();
  if (!from.length) { toast(`Nothing to ${verb}`); updUndo(); return; }
  to.push(cur);
  restore(from.pop());
  toast(verb === 'undo' ? 'Undone' : 'Redone');
};
const undo = () => stepHistory(undoStack, redoStack, 'undo');
const redo = () => stepHistory(redoStack, undoStack, 'redo');
const UNDO = { label: 'Undo', fn: () => undo() };
