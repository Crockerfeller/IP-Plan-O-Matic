#!/usr/bin/env python3
"""Build the static guide pages in learn/ for IP Plan-O-Matic.

Every number in the tables is computed here with Python's ipaddress module,
so the guides can't drift from the real subnet math. Run from the repo root:

    python3 tools/build_learn.py

It rewrites learn/*.html, learn/learn.css and sitemap.xml.
"""
import base64
import datetime
import html
import ipaddress
import json
import pathlib

ROOT = pathlib.Path(__file__).resolve().parent.parent
LEARN = ROOT / 'learn'
SITE = 'https://crockerfeller.github.io/IP-Plan-O-Matic/'
TODAY = datetime.date.today().isoformat()

# Plan link captured from the app: the Auto-plan tab's "Cloud AZ example", applied (compact link form).
AWS_AZ_PLAN = '10.20.0.0/16/29.f4f49300/~ndDdCoIwGMbxWxnPsdq7pWE77ji6hW0OEiqjaUHivYdRUTb8Otx78PuPp4aBhLo5BDhC1uAUCYooooWg9n2CxO6SX1VpmTqfWeVCq1wZcoUAd0j8HNzzYDMEKCCxtTZzLCYiti9c6dAErwBfDRd0t6CnFJZiuGC6BTOlEKdtIf4UKn3IzZyBRPJvr3vt8dN47IR67fGj-Gze2snb3qhSaeXsnFW48OlcpL3--GV8vhj4_fhtvvSmeQA'

esc = html.escape


def b64(obj):
    return base64.urlsafe_b64encode(json.dumps(obj, separators=(',', ':')).encode()).decode().rstrip('=')


def app(hash_=''):
    return '../' + ('#' + hash_ if hash_ else '')


def cloud_plan(base, cloud):
    return f'{base}/1.0/' + b64({'c': cloud})


def fmt(n):
    return f'{n:,}'


# Usable addresses for one subnet of the given prefix length, by platform.
RESERVED = {'std': None, 'aws': 5, 'azure': 5, 'gcp': 4, 'oci': 3}
MIN_PREFIX = {'aws': 28, 'azure': 29, 'gcp': 29, 'oci': 30}


def usable(prefix, platform='std'):
    size = 2 ** (32 - prefix)
    if platform == 'std':
        return 1 if prefix == 32 else 2 if prefix == 31 else size - 2
    if prefix > MIN_PREFIX[platform]:
        return None
    return size - RESERVED[platform]


CSS = r'''/* Guides for IP Plan-O-Matic. Colors match the app. */
:root {
  --bg: #f5f6f8; --panel: #ffffff; --text: #161a22; --muted: #5d6573; --border: #e2e5eb;
  --accent: #2f6fed; --accent-text: #ffffff; --accent-weak: #e9effd; --row-hover: #f3f6fa;
  --ok: #1d8a4e; --ok-weak: #e3f4ea; --warn: #9a6400; --warn-weak: #fdf2d8;
  --shadow: 0 1px 2px rgba(16, 24, 40, .05), 0 4px 16px rgba(16, 24, 40, .06);
  --ink: #0F1B2D; --mid: #4A5A70; --brand: #0B7A6E;
  color-scheme: light;
}
@media (prefers-color-scheme: dark) {
  :root:not([data-theme="light"]) {
    --bg: #0e1015; --panel: #161920; --text: #e6e8ee; --muted: #98a1b0; --border: #272b35;
    --accent: #6c9cff; --accent-text: #0e1015; --accent-weak: #1b2640; --row-hover: #1b1f28;
    --ok: #4fd18b; --ok-weak: #153124; --warn: #f0b84a; --warn-weak: #392d13;
    --shadow: 0 1px 2px rgba(0, 0, 0, .4), 0 4px 16px rgba(0, 0, 0, .3);
    --ink: #F4F7FB; --mid: #9FB0C6; --brand: #3DD9C4;
    color-scheme: dark;
  }
}
:root[data-theme="dark"] {
  --bg: #0e1015; --panel: #161920; --text: #e6e8ee; --muted: #98a1b0; --border: #272b35;
  --accent: #6c9cff; --accent-text: #0e1015; --accent-weak: #1b2640; --row-hover: #1b1f28;
  --ok: #4fd18b; --ok-weak: #153124; --warn: #f0b84a; --warn-weak: #392d13;
  --shadow: 0 1px 2px rgba(0, 0, 0, .4), 0 4px 16px rgba(0, 0, 0, .3);
  --ink: #F4F7FB; --mid: #9FB0C6; --brand: #3DD9C4;
  color-scheme: dark;
}
* { box-sizing: border-box; }
html, body { margin: 0; }
body { background: var(--bg); color: var(--text); font: 16px/1.65 -apple-system, BlinkMacSystemFont, "Segoe UI", Inter, Roboto, Helvetica, Arial, sans-serif; -webkit-font-smoothing: antialiased; }
a { color: var(--accent); }
.wrap { max-width: 880px; margin: 0 auto; padding: 20px 16px 48px; }
header.top { display: flex; align-items: center; justify-content: space-between; gap: 12px; padding: 4px 0 18px; }
.brand { display: flex; align-items: center; gap: 10px; text-decoration: none; color: var(--ink); }
.brand svg { width: 36px; height: 36px; }
.brand span { font: 600 20px/1 'Space Grotesk', system-ui, sans-serif; letter-spacing: -.02em; }
.cta { display: inline-flex; align-items: center; gap: 6px; padding: 8px 14px; border-radius: 8px; background: var(--accent); color: var(--accent-text); font-weight: 600; font-size: 14px; text-decoration: none; white-space: nowrap; }
.crumbs { font-size: 13px; color: var(--muted); margin-bottom: 8px; }
.crumbs a { color: var(--muted); }
article { background: var(--panel); border: 1px solid var(--border); border-radius: 12px; box-shadow: var(--shadow); padding: 24px 28px; }
h1 { font-size: 30px; line-height: 1.2; margin: 0 0 8px; letter-spacing: -.015em; }
.lede { color: var(--muted); font-size: 17px; margin: 0 0 18px; }
h2 { font-size: 21px; margin: 30px 0 8px; letter-spacing: -.01em; }
h3 { font-size: 17px; margin: 22px 0 6px; }
p, li { max-width: 72ch; }
code, .mono, td.m { font-family: 'JetBrains Mono', ui-monospace, "SF Mono", Menlo, Consolas, monospace; font-size: .9em; }
code { background: var(--row-hover); border: 1px solid var(--border); border-radius: 4px; padding: 0 4px; }
.table-wrap { overflow-x: auto; margin: 12px 0 18px; border: 1px solid var(--border); border-radius: 8px; }
table { border-collapse: collapse; width: 100%; font-size: 14px; }
th, td { text-align: left; padding: 7px 12px; border-bottom: 1px solid var(--border); white-space: nowrap; }
th { font-size: 12px; text-transform: uppercase; letter-spacing: .04em; color: var(--muted); background: var(--row-hover); }
td.n, th.n { text-align: right; font-variant-numeric: tabular-nums; }
tr:last-child td { border-bottom: 0; }
tr.hi td { background: var(--accent-weak); }
.note { background: var(--accent-weak); border-radius: 8px; padding: 12px 16px; margin: 16px 0; }
.note.warn { background: var(--warn-weak); }
.try { display: flex; flex-wrap: wrap; align-items: center; gap: 10px 16px; margin: 22px 0 4px; padding: 16px; border: 1px dashed var(--border); border-radius: 10px; }
.try p { margin: 0; flex: 1 1 260px; }
.grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(240px, 1fr)); gap: 12px; margin: 16px 0; padding: 0; list-style: none; }
.grid li { border: 1px solid var(--border); border-radius: 10px; padding: 14px 16px; }
.grid a { font-weight: 600; text-decoration: none; }
.grid p { margin: 4px 0 0; font-size: 14px; color: var(--muted); display: -webkit-box; -webkit-line-clamp: 3; -webkit-box-orient: vertical; overflow: hidden; }
footer { margin-top: 28px; font-size: 13px; color: var(--muted); text-align: center; }
footer a { color: var(--muted); }
footer p { max-width: none; }
@media (max-width: 640px) {
  article { padding: 18px 16px; }
  h1 { font-size: 25px; }
  .brand span { font-size: 17px; }
}
'''

LOGO = '''<svg viewBox="3 3 42 42" aria-hidden="true"><rect x="3" y="3" width="19" height="42" rx="2.5" fill="var(--ink)"/><rect x="26" y="3" width="19" height="19" rx="2.5" fill="var(--brand)"/><rect x="26" y="26" width="9" height="19" rx="2.5" fill="var(--mid)"/><rect x="37" y="26" width="8" height="8.5" rx="2" fill="var(--brand)"/><rect x="37" y="36.5" width="8" height="8.5" rx="2" fill="var(--ink)"/></svg>'''

PAGES = []  # (slug, title, description) for the hub and sitemap


def page(slug, title, description, body, h1=None, faq=None):
    url = SITE + 'learn/' + ('' if slug == 'index' else slug + '.html')
    crumbs = [('IP Plan-O-Matic', SITE), ('Guides', SITE + 'learn/')]
    if slug != 'index':
        crumbs.append((h1 or title, url))
    ld = [{
        '@context': 'https://schema.org', '@type': 'Article' if slug != 'index' else 'CollectionPage',
        'headline': h1 or title, 'description': description, 'url': url, 'dateModified': TODAY,
        'author': {'@type': 'Organization', 'name': 'Huddacaster'},
        'publisher': {'@type': 'Organization', 'name': 'Huddacaster'},
        'isPartOf': {'@type': 'WebSite', 'name': 'IP Plan-O-Matic', 'url': SITE},
    }, {
        '@context': 'https://schema.org', '@type': 'BreadcrumbList',
        'itemListElement': [{'@type': 'ListItem', 'position': i + 1, 'name': n, 'item': u} for i, (n, u) in enumerate(crumbs)],
    }]
    if faq:
        ld.append({'@context': 'https://schema.org', '@type': 'FAQPage', 'mainEntity': [
            {'@type': 'Question', 'name': q, 'acceptedAnswer': {'@type': 'Answer', 'text': a}} for q, a in faq]})
    crumb_html = ' › '.join(f'<a href="{esc(u)}">{esc(n)}</a>' for n, u in crumbs[:-1]) + f' › {esc(crumbs[-1][0])}'
    doc = f'''<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>{esc(title)} | IP Plan-O-Matic</title>
<meta name="description" content="{esc(description)}">
<link rel="canonical" href="{url}">
<meta property="og:type" content="article">
<meta property="og:site_name" content="IP Plan-O-Matic">
<meta property="og:title" content="{esc(h1 or title)}">
<meta property="og:description" content="{esc(description)}">
<meta property="og:url" content="{url}">
<meta property="og:image" content="{SITE}og-image.png">
<meta name="twitter:card" content="summary_large_image">
<meta name="theme-color" content="#f5f6f8" media="(prefers-color-scheme: light)">
<meta name="theme-color" content="#0e1015" media="(prefers-color-scheme: dark)">
<link rel="icon" href="../favicon.svg" type="image/svg+xml">
<link rel="icon" href="../favicon-32.png" type="image/png" sizes="32x32">
<link rel="apple-touch-icon" href="../apple-touch-icon.png">
<link rel="preconnect" href="https://fonts.googleapis.com">
<link href="https://fonts.googleapis.com/css2?family=Space+Grotesk:wght@600&family=JetBrains+Mono:wght@400&display=swap" rel="stylesheet">
<link rel="stylesheet" href="learn.css">
<script>try {{ const t = localStorage.getItem('subnetPlanner.theme'); if (t === 'light' || t === 'dark') document.documentElement.dataset.theme = t; }} catch (e) {{}}</script>
<script type="application/ld+json">{json.dumps(ld, ensure_ascii=False)}</script>
</head>
<body>
<div class="wrap">
  <header class="top">
    <a class="brand" href="../">{LOGO}<span>IP Plan-O-Matic</span></a>
    <a class="cta" href="../">Open the planner →</a>
  </header>
  <nav class="crumbs" aria-label="Breadcrumb">{crumb_html}</nav>
  <article>
    <h1>{esc(h1 or title)}</h1>
{body}
  </article>
  <footer>
    <p><a href="./">All guides</a> · <a href="../">Subnet planner</a> · <a href="https://github.com/Crockerfeller/IP-Plan-O-Matic">Source on GitHub</a></p>
    <p>IP Plan-O-Matic is free, with no ads, no tracking and no sign-up. By Huddacaster, a subsidiary of Crockerfeller Industries © 2026.</p>
  </footer>
</div>
</body>
</html>
'''
    (LEARN / ('index.html' if slug == 'index' else slug + '.html')).write_text(doc)
    if slug != 'index':
        PAGES.append((slug, h1 or title, description))


def table(head, rows, num_cols=(), mono_cols=(), hi=None):
    th = ''.join(f'<th{" class=n" if i in num_cols else ""}>{esc(h)}</th>' for i, h in enumerate(head))
    out = []
    for r in rows:
        cls = ' class="hi"' if hi and hi(r) else ''
        tds = ''.join(
            f'<td class="{"n" if i in num_cols else ""}{" m" if i in mono_cols else ""}">{v}</td>'.replace(' class=""', '')
            for i, v in enumerate(r))
        out.append(f'<tr{cls}>{tds}</tr>')
    return f'<div class="table-wrap"><table><thead><tr>{th}</tr></thead><tbody>{"".join(out)}</tbody></table></div>'


def try_box(text, href, label='Open in the planner →'):
    return f'<div class="try"><p>{text}</p><a class="cta" href="{href}">{label}</a></div>'


LEARN.mkdir(exist_ok=True)
(LEARN / 'learn.css').write_text(CSS)

# ---------------------------------------------------------------- CIDR cheat sheet
rows = []
for p in range(0, 33):
    n = ipaddress.IPv4Network(f'0.0.0.0/{p}')
    size = n.num_addresses
    rows.append([f'/{p}', str(n.netmask), str(n.hostmask), fmt(size), fmt(usable(p)),
                 fmt(size // 256) if p <= 24 else f'1/{256 // size}'])
cheat = table(['Prefix', 'Netmask', 'Wildcard', 'Addresses', 'Usable hosts', '/24 networks'], rows,
              num_cols=(3, 4), mono_cols=(0, 1, 2), hi=lambda r: r[0] in ('/8', '/16', '/24'))
cloud_rows = []
for p in range(16, 31):
    def c(pl):
        u = usable(p, pl)
        return '—' if u is None or (pl in ('aws', 'oci') and p < 16) else fmt(u)
    cloud_rows.append([f'/{p}', fmt(2 ** (32 - p)), fmt(usable(p)), c('aws'), c('azure'), c('gcp'), c('oci')])
cloud_tbl = table(['Prefix', 'Addresses', 'Standard', 'AWS', 'Azure', 'Google Cloud', 'Oracle Cloud'], cloud_rows,
                  num_cols=(1, 2, 3, 4, 5, 6), mono_cols=(0,))
page('cidr-cheat-sheet', 'CIDR cheat sheet: every IPv4 prefix from /0 to /32',
     'Every IPv4 prefix length from /0 to /32 with its netmask, wildcard mask, total addresses and usable hosts, plus usable addresses in AWS, Azure, Google Cloud and Oracle Cloud subnets.',
     f'''    <p class="lede">Netmask, wildcard mask, address count and usable hosts for every IPv4 prefix length, plus how many addresses each cloud lets you use.</p>
    <h2>IPv4 CIDR table</h2>
    <p>“Usable hosts” follows the usual rule: every subnet loses its network address and broadcast address, except /31 point-to-point links (both addresses usable, RFC 3021) and /32 single hosts.</p>
    {cheat}
    <h2>Usable addresses in cloud subnets</h2>
    <p>Clouds reserve more than two addresses per subnet: AWS and Azure reserve 5, Google Cloud 4 and Oracle Cloud 3. A dash means the cloud doesn’t allow subnets that small (or, for AWS and OCI, that large).</p>
    {cloud_tbl}
    <h2>Reading a prefix quickly</h2>
    <ul>
      <li>Each step down in prefix length doubles the size: a /23 is two /24s, a /22 is four.</li>
      <li>The wildcard mask is the netmask inverted. ACLs on Cisco and some firewalls use it.</li>
      <li>Within the last octet, block sizes are 128, 64, 32, 16, 8, 4, so a /26 always starts on .0, .64, .128 or .192.</li>
    </ul>
    {try_box('Split a network into these sizes with a click and see each subnet’s range, gateway and host count.', app())}
''', h1='CIDR cheat sheet (IPv4 /0 to /32)')

# ---------------------------------------------------------------- How many hosts
ex = [(24, '10.1.20.0/24'), (26, '10.1.20.64/26'), (27, '10.1.20.96/27'), (29, '10.1.20.8/29'), (30, '10.1.20.4/30'), (31, '10.1.20.2/31'), (32, '10.1.20.1/32')]
ex_rows = []
for p, cidr in ex:
    n = ipaddress.IPv4Network(cidr)
    hosts = list(n.hosts()) if p < 31 else list(n)
    first, last = (hosts[0], hosts[-1]) if hosts else (n.network_address, n.network_address)
    ex_rows.append([cidr, fmt(n.num_addresses), fmt(usable(p)), f'{first} – {last}' if first != last else str(first)])
page('how-many-hosts-in-a-subnet', 'How many hosts are in a subnet? /24, /26, /27, /30 and more',
     'How to work out the number of usable hosts in any IPv4 subnet, with the formula, worked examples from /24 to /32, the /31 and /32 exceptions and the cloud differences.',
     f'''    <p class="lede">A subnet with prefix length /n has 2<sup>32−n</sup> addresses. Subtract 2 for the network and broadcast addresses and you have the usable hosts.</p>
    <h2>The formula</h2>
    <p><b>Usable hosts = 2<sup>(32 − prefix)</sup> − 2</b>. A /24 has 2<sup>8</sup> = 256 addresses, so 254 usable hosts. A /26 has 64 addresses and 62 hosts. A /30 has 4 addresses and 2 hosts, which is why it was the classic size for a link between two routers.</p>
    <h2>Worked examples</h2>
    {table(['Subnet', 'Addresses', 'Usable hosts', 'Usable range'], ex_rows, num_cols=(1, 2), mono_cols=(0, 3))}
    <h2>The exceptions: /31 and /32</h2>
    <p>A <b>/31</b> has only two addresses and no room for a broadcast, so RFC 3021 lets both be used on a point-to-point link. It saves half the addresses of a /30. A <b>/32</b> is a single address, used for loopbacks and host routes.</p>
    <h2>Clouds use more addresses</h2>
    <p>Cloud networks reserve extra addresses in every subnet for their router and DNS. A /24 has 251 usable addresses in AWS and Azure, 252 in Google Cloud and 253 in Oracle Cloud. See the <a href="cidr-cheat-sheet.html">CIDR cheat sheet</a> for every size, or the guides for <a href="aws-vpc-subnet-sizing.html">AWS</a>, <a href="azure-vnet-subnet-sizing.html">Azure</a>, <a href="google-cloud-vpc-subnet-sizing.html">Google Cloud</a> and <a href="oracle-cloud-vcn-subnet-sizing.html">Oracle Cloud</a>.</p>
    <h2>Picking a size from a host count</h2>
    <p>Find the smallest prefix whose usable hosts cover what you need, plus room to grow. 50 hosts fit in a /26 (62), 100 in a /25 (126), 300 in a /23 (510). The <a href="vlsm-subnetting.html">VLSM guide</a> shows how to do this for a whole list of networks at once.</p>
    {try_box('Type the base network into the planner, click Divide until you reach the size you need, and the host count shows on every row.', app())}
''', h1='How many hosts are in a subnet?', faq=[
        ('How many usable hosts are in a /24?', 'A /24 has 256 addresses and 254 usable hosts. In AWS and Azure it has 251 usable addresses, in Google Cloud 252 and in Oracle Cloud 253.'),
        ('How many usable hosts are in a /30?', 'A /30 has 4 addresses and 2 usable hosts, which is why it is used for point-to-point links. A /31 (RFC 3021) gives the same 2 usable addresses with no waste.'),
        ('What is the formula for usable hosts?', 'Usable hosts = 2^(32 − prefix length) − 2. The two subtracted addresses are the network address and the broadcast address.'),
     ])

# ---------------------------------------------------------------- VLSM
reqs = [('Servers', 200, 10), ('Staff Wi-Fi', 120, 20), ('Guest Wi-Fi', 60, 30), ('VoIP', 50, 40), ('Printers', 20, 50), ('Management', 10, 99), ('Uplink to ISP', 2, None)]
base = ipaddress.IPv4Network('10.10.0.0/22')
def fit(h):
    for p in range(30, 0, -1):
        if usable(p) >= h:
            return p
alloc, ptr = [], int(base.network_address)
for name, h, v in sorted(reqs, key=lambda r: fit(r[1])):
    p = fit(h)
    n = ipaddress.IPv4Network(f'{ipaddress.IPv4Address(ptr)}/{p}')
    alloc.append([esc(name), str(v or '—'), fmt(h), str(n), fmt(usable(p)), fmt(usable(p) - h)])
    ptr += n.num_addresses
used = ptr - int(base.network_address)
free = list(ipaddress.summarize_address_range(ipaddress.IPv4Address(ptr), base.broadcast_address))
vlsm_hash = '10.10.0.0/22/23.b2fa10/' + b64({'m': {str(ipaddress.IPv4Network(a[3])): {'n': html.unescape(a[0]), **({'v': a[1]} if a[1] != '—' else {}), 's': 'used'} for a in alloc}})
page('vlsm-subnetting', 'VLSM subnetting explained, with a worked example',
     'Variable Length Subnet Masking (VLSM) explained step by step: size each subnet from its host count, place them largest first, and see a worked example that packs seven networks into a /22.',
     f'''    <p class="lede">Variable Length Subnet Masking (VLSM) gives every network the size it actually needs, instead of cutting the whole block into equal pieces.</p>
    <h2>Why not equal-sized subnets?</h2>
    <p>Splitting a /22 into four /24s gives each network 254 hosts. That wastes most of a /24 on a 10-host management network and doesn’t leave room for a 300-host network at all. VLSM sizes each subnet separately.</p>
    <h2>The method</h2>
    <ol>
      <li>List each network with its host count, and add growth headroom if you expect it to grow.</li>
      <li>For each one, pick the smallest prefix whose usable hosts cover the need (see <a href="how-many-hosts-in-a-subnet.html">how many hosts</a>).</li>
      <li>Sort largest first and place each one at the next free address that is aligned to its size. Largest first keeps everything aligned without gaps.</li>
      <li>Whatever is left over stays free for later.</li>
    </ol>
    <h2>Worked example: seven networks in 10.10.0.0/22</h2>
    {table(['Name', 'VLAN', 'Needs', 'Subnet', 'Usable', 'Spare'], alloc, num_cols=(2, 4, 5), mono_cols=(3,))}
    <p>The plan uses {fmt(used)} of {fmt(base.num_addresses)} addresses ({used / base.num_addresses:.0%}). Left free: {', '.join(f'<code>{n}</code>' for n in free)}, ready for new networks later.</p>
    <div class="note">Placing largest first is what keeps VLSM simple. Each subnet must start on a multiple of its own size (a /26 on .0, .64, .128 or .192), and big blocks first means the next free address is always correctly aligned for the next, smaller block.</div>
    <h2>Adding networks to an existing plan</h2>
    <p>When some subnets are already in use, put new ones in the smallest free gap that fits instead of starting over. IP Plan-O-Matic’s Auto-plan tab does this with <b>Fill free space</b>, keeping the subnets you already named or marked in use.</p>
    {try_box('Open this exact plan in the planner, then try the Auto-plan tab with your own list.', app(vlsm_hash))}
''', h1='VLSM subnetting, explained with an example', faq=[
        ('What is VLSM?', 'Variable Length Subnet Masking means giving each subnet its own prefix length sized to its host count, instead of splitting a network into equal parts.'),
        ('Why allocate VLSM subnets largest first?', 'Every subnet must start on a multiple of its size. Placing the largest subnets first means the next free address is always aligned for the next, smaller subnet, so no space is wasted on alignment gaps.'),
     ])

# ---------------------------------------------------------------- Private ranges
v4special = [
    ('10.0.0.0/8', 'Private (RFC 1918)', 'The largest private block. Common for enterprises and clouds.'),
    ('172.16.0.0/12', 'Private (RFC 1918)', '172.16.0.0 to 172.31.255.255. Docker’s default bridge uses 172.17.0.0/16 and the AWS default VPC 172.31.0.0/16.'),
    ('192.168.0.0/16', 'Private (RFC 1918)', 'Home and small office routers. 192.168.0.0/24 and 192.168.1.0/24 clash with almost every home network on a VPN.'),
    ('100.64.0.0/10', 'Shared address space, CGNAT (RFC 6598)', 'Used by ISPs for carrier-grade NAT and by some overlay networks. Not for your LANs.'),
    ('127.0.0.0/8', 'Loopback', 'The host itself. 127.0.0.1 is the usual address.'),
    ('169.254.0.0/16', 'Link-local (RFC 3927)', 'Self-assigned when DHCP fails. Cloud metadata services also live at 169.254.169.254.'),
    ('192.0.2.0/24, 198.51.100.0/24, 203.0.113.0/24', 'Documentation (RFC 5737)', 'For examples in docs and training. Never routed.'),
    ('198.18.0.0/15', 'Benchmarking (RFC 2544)', 'For network device testing.'),
    ('224.0.0.0/4', 'Multicast', 'Group traffic. Not assignable to hosts.'),
    ('240.0.0.0/4', 'Reserved', 'Formerly “class E”. Not usable on most systems.'),
    ('0.0.0.0/8', '“This network”', '0.0.0.0 means “any” or “unknown”.'),
]
for c, _, _ in v4special:
    for part in c.split(', '):
        ipaddress.IPv4Network(part)  # validate
v6special = [
    ('fc00::/7', 'Unique local, ULA (RFC 4193)', 'The IPv6 equivalent of private space. Use fd00::/8 with a random 40-bit ID.'),
    ('fe80::/10', 'Link-local', 'Every IPv6 interface has one. Used for neighbor discovery and routing protocols.'),
    ('::1/128', 'Loopback', 'The host itself.'),
    ('2001:db8::/32', 'Documentation (RFC 3849)', 'For examples. Never routed.'),
    ('64:ff9b::/96', 'NAT64 well-known prefix (RFC 6052)', 'IPv4 addresses embedded in IPv6 for NAT64.'),
    ('ff00::/8', 'Multicast', 'IPv6 has no broadcast; multicast replaces it.'),
    ('2000::/3', 'Global unicast', 'Public IPv6 addresses.'),
]
for c, _, _ in v6special:
    ipaddress.IPv6Network(c)
page('private-ip-address-ranges', 'Private IP address ranges (RFC 1918) and other special-purpose blocks',
     'The private IPv4 ranges from RFC 1918 (10.0.0.0/8, 172.16.0.0/12, 192.168.0.0/16), CGNAT, link-local, loopback, documentation and multicast blocks, and the IPv6 equivalents, with tips on which to avoid.',
     f'''    <p class="lede">Which IPv4 and IPv6 ranges are private, which are reserved, and which ones cause trouble when networks meet.</p>
    <h2>IPv4</h2>
    {table(['Range', 'What it is', 'Notes'], [[f'<span class="mono">{esc(c)}</span>', esc(a), esc(b)] for c, a, b in v4special])}
    <h2>IPv6</h2>
    {table(['Range', 'What it is', 'Notes'], [[f'<span class="mono">{esc(c)}</span>', esc(a), esc(b)] for c, a, b in v6special])}
    <h2>Choosing ranges that won’t clash later</h2>
    <ul>
      <li><b>Avoid 192.168.0.0/24 and 192.168.1.0/24</b> for anything users reach over a VPN: their home router almost certainly uses the same range.</li>
      <li><b>Avoid 172.17.0.0/16</b> if Docker runs anywhere nearby, and <b>172.31.0.0/16</b> if you will peer with AWS default VPCs.</li>
      <li><b>Give every site and VPC its own block</b> from one master plan (for example, a /16 per region out of 10.0.0.0/8). Overlaps are painful to fix once VPNs, peering or mergers connect the networks.</li>
      <li>For IPv6, generate a random ULA /48 instead of picking fd00::/48, so two organizations are very unlikely to collide.</li>
    </ul>
    {try_box('Paste the networks you already have into the overlap checker to see what clashes with a new plan.', app(), 'Open the overlap checker →')}
''', h1='Private IP address ranges and special-purpose blocks', faq=[
        ('What are the private IPv4 address ranges?', 'RFC 1918 reserves 10.0.0.0/8, 172.16.0.0/12 (172.16.0.0 to 172.31.255.255) and 192.168.0.0/16 for private networks.'),
        ('Is 100.64.0.0/10 private?', 'It is shared address space for carrier-grade NAT (RFC 6598). It is not public, but it is meant for ISPs, not for ordinary LANs.'),
     ])

# ---------------------------------------------------------------- Cloud guides
def sizes_table(platform, prefixes):
    r = []
    for p in prefixes:
        u = usable(p, platform)
        r.append([f'/{p}', fmt(2 ** (32 - p)), fmt(u) if u is not None else '—'])
    return table(['Subnet size', 'Addresses', 'Usable'], r, num_cols=(1, 2), mono_cols=(0,))

az_rows = [
    ['Private app', 'us-east-1a / 1b / 1c', '4,000', '/20', '10.20.0.0/20, 10.20.16.0/20, 10.20.32.0/20', '4,091'],
    ['Public', 'us-east-1a / 1b / 1c', '250', '/24', '10.20.48.0/24, 10.20.49.0/24, 10.20.50.0/24', '251'],
    ['Database', 'us-east-1a / 1b / 1c', '120', '/25', '10.20.51.0/25, 10.20.51.128/25, 10.20.52.0/25', '123'],
]
page('aws-vpc-subnet-sizing', 'AWS VPC subnet sizing: reserved IPs, CIDR limits and AZ layouts',
     'How to size AWS VPC subnets: the 5 addresses AWS reserves in every subnet, the /16 to /28 limits, usable addresses per size, and a three-AZ public/private/database layout.',
     f'''    <p class="lede">AWS reserves 5 addresses in every subnet and limits sizes to /16 through /28. Here is what that means for your plan.</p>
    <h2>The 5 reserved addresses</h2>
    <p>In a subnet such as <code>10.0.0.0/24</code>, AWS keeps:</p>
    <ul>
      <li><code>10.0.0.0</code>: the network address</li>
      <li><code>10.0.0.1</code>: the VPC router</li>
      <li><code>10.0.0.2</code>: the Amazon-provided DNS server</li>
      <li><code>10.0.0.3</code>: reserved for future use</li>
      <li><code>10.0.0.255</code>: the last address (AWS doesn’t support broadcast, but reserves it)</li>
    </ul>
    <h2>Size limits</h2>
    <p>A VPC’s IPv4 CIDR block and each subnet must be between <b>/16</b> (65,536 addresses) and <b>/28</b> (16 addresses). You can add secondary CIDR blocks to a VPC later, but you can’t resize a subnet, so size generously up front.</p>
    {sizes_table('aws', [16, 18, 19, 20, 21, 22, 23, 24, 25, 26, 27, 28])}
    <h2>A three-AZ layout</h2>
    <p>Each subnet lives in one Availability Zone, so most designs repeat every tier in each AZ. Here is a <code>10.20.0.0/16</code> VPC with public, private app and database tiers across three AZs, sized largest first:</p>
    {table(['Tier', 'Zones', 'Hosts per AZ', 'Size', 'Subnets', 'Usable each'], az_rows, num_cols=(2, 5), mono_cols=(3, 4))}
    <p>That uses about 22% of the /16, leaving plenty of room for more tiers or AZs.</p>
    <h2>Tips</h2>
    <ul>
      <li><b>Private subnets need the most room.</b> With the default Amazon VPC CNI, each EKS pod takes a VPC address, and load balancers, endpoints and Lambda functions in a VPC use addresses too.</li>
      <li><b>Plan for peering and Transit Gateway from day one.</b> Connected VPCs and on-premises networks can’t overlap.</li>
      <li><b>Leave the default VPC (172.31.0.0/16) alone</b> and don’t reuse its range for VPCs you’ll connect.</li>
    </ul>
    {try_box('Open this three-AZ VPC in the planner. Every subnet carries its availability zone, and the Terraform export writes it as availability_zone.', app(AWS_AZ_PLAN))}
''', h1='AWS VPC subnet sizing', faq=[
        ('Why does AWS reserve 5 IP addresses per subnet?', 'AWS reserves the network address, the VPC router (+1), the DNS server (+2), one address for future use (+3) and the last address in every subnet.'),
        ('What is the smallest AWS subnet?', 'A /28, which has 16 addresses and 11 usable after AWS reserves 5. The largest is a /16.'),
     ])

page('azure-vnet-subnet-sizing', 'Azure VNet subnet sizing: reserved IPs, minimum size and special subnets',
     'How to size Azure virtual network subnets: the 5 addresses Azure reserves, the /29 minimum, usable addresses per size, and the sizes for GatewaySubnet, Azure Bastion and Azure Firewall.',
     f'''    <p class="lede">Azure reserves 5 addresses in every subnet, and some Azure services need dedicated subnets of a minimum size.</p>
    <h2>The 5 reserved addresses</h2>
    <p>In <code>10.1.0.0/24</code>, Azure keeps <code>10.1.0.0</code> (network), <code>10.1.0.1</code> (default gateway), <code>10.1.0.2</code> and <code>10.1.0.3</code> (Azure DNS) and <code>10.1.0.255</code> (broadcast).</p>
    <h2>Sizes</h2>
    <p>The smallest IPv4 subnet is a <b>/29</b>, which leaves just 3 usable addresses.</p>
    {sizes_table('azure', [16, 20, 22, 23, 24, 25, 26, 27, 28, 29])}
    <h2>Subnets Azure services need</h2>
    {table(['Subnet name', 'Used by', 'Size'], [
        ['<code>GatewaySubnet</code>', 'VPN and ExpressRoute gateways', '/27 or larger recommended'],
        ['<code>AzureBastionSubnet</code>', 'Azure Bastion', '/26 or larger'],
        ['<code>AzureFirewallSubnet</code>', 'Azure Firewall', '/26'],
    ])}
    <p>These subnets must use exactly these names. Plan them into the VNet before filling it with workload subnets.</p>
    <h2>Tips</h2>
    <ul>
      <li><b>AKS with traditional Azure CNI gives every pod a VNet address</b>, so those subnets get large quickly. Overlay networking avoids that.</li>
      <li><b>Peered VNets and on-premises networks can’t overlap.</b> Carve every VNet from one master plan.</li>
      <li>Subnets can be resized only while empty, so leave growth room.</li>
    </ul>
    {try_box('The planner applies Azure’s 5 reserved addresses and /29 minimum to every subnet, and exports Terraform for azurerm.', app(cloud_plan('10.1.0.0/16', 'azure')))}
''', h1='Azure VNet subnet sizing', faq=[
        ('How many IP addresses does Azure reserve per subnet?', 'Five: the network address, the default gateway (.1), two addresses for Azure DNS (.2 and .3) and the broadcast address.'),
        ('What is the smallest subnet in Azure?', 'A /29, with 8 addresses and 3 usable after Azure reserves 5.'),
     ])

page('google-cloud-vpc-subnet-sizing', 'Google Cloud VPC subnet sizing: reserved IPs, regional subnets and expansion',
     'How to size Google Cloud VPC subnets: the 4 addresses Google reserves, the /29 minimum, auto mode versus custom mode, expanding a subnet, and secondary ranges for GKE.',
     f'''    <p class="lede">Google Cloud VPC networks are global and their subnets are regional. Each subnet loses 4 addresses to Google.</p>
    <h2>The 4 reserved addresses</h2>
    <p>In <code>10.2.0.0/24</code>, Google keeps <code>10.2.0.0</code> (network), <code>10.2.0.1</code> (default gateway), <code>10.2.0.254</code> (second-to-last, reserved for future use) and <code>10.2.0.255</code> (broadcast).</p>
    {sizes_table('gcp', [16, 20, 22, 23, 24, 25, 26, 27, 28, 29])}
    <h2>Auto mode or custom mode</h2>
    <p>An <b>auto mode</b> network creates one subnet per region from <code>10.128.0.0/9</code>. That’s convenient but hard to connect to other networks without overlaps. <b>Custom mode</b> lets you choose every range, and is what you want for anything beyond a test project.</p>
    <h2>Growing a subnet</h2>
    <p>You can expand a subnet’s primary range to a shorter prefix later without downtime, as long as the larger range doesn’t overlap anything. You can’t shrink it. So start small enough to leave neighbors room, and plan where each subnet would grow.</p>
    <h2>Secondary ranges for GKE</h2>
    <p>GKE VPC-native clusters take pod and service addresses from secondary ranges on the subnet. Pod ranges get big (by default each node reserves a /24 for pods), so reserve space for them in your plan.</p>
    {try_box('The planner applies Google Cloud’s reserved addresses and /29 minimum, and exports Terraform for google_compute_subnetwork.', app(cloud_plan('10.2.0.0/16', 'gcp')))}
''', h1='Google Cloud VPC subnet sizing', faq=[
        ('How many IP addresses does Google Cloud reserve in a subnet?', 'Four: the network address, the default gateway (second address), the second-to-last address and the broadcast address.'),
        ('Can you resize a Google Cloud subnet?', 'You can expand a subnet’s primary range to a larger one without downtime, as long as it doesn’t overlap other ranges. You can’t shrink it.'),
     ])

page('oracle-cloud-vcn-subnet-sizing', 'Oracle Cloud (OCI) VCN subnet sizing: reserved IPs and CIDR limits',
     'How to size Oracle Cloud Infrastructure VCN subnets: the 3 addresses OCI reserves, the /16 to /30 VCN limits, usable addresses per size, and regional versus AD-specific subnets.',
     f'''    <p class="lede">Oracle Cloud reserves only 3 addresses per subnet, the fewest of the big clouds.</p>
    <h2>The 3 reserved addresses</h2>
    <p>In <code>10.3.0.0/24</code>, OCI keeps the first two addresses, <code>10.3.0.0</code> (network) and <code>10.3.0.1</code> (default gateway), and the last, <code>10.3.0.255</code> (broadcast).</p>
    <h2>Sizes</h2>
    <p>VCN CIDR blocks can be from <b>/16</b> to <b>/30</b>, and a VCN can have more than one block. The smallest subnet, a /30, leaves a single usable address.</p>
    {sizes_table('oci', [16, 20, 22, 23, 24, 25, 26, 27, 28, 29, 30])}
    <h2>Regional or AD-specific subnets</h2>
    <p>Oracle recommends <b>regional subnets</b>, which span every availability domain in the region, so instances in any AD can use them. AD-specific subnets are the older model.</p>
    {try_box('The planner applies OCI’s 3 reserved addresses and /30 minimum, and exports Terraform for oci_core_vcn and oci_core_subnet.', app(cloud_plan('10.3.0.0/16', 'oci')))}
''', h1='Oracle Cloud (OCI) VCN subnet sizing', faq=[
        ('How many IP addresses does OCI reserve per subnet?', 'Three: the first two addresses (network and default gateway) and the last address (broadcast).'),
     ])

# ---------------------------------------------------------------- IPv6
v6tbl = table(['Prefix', 'Typical use', '/64 networks inside'], [
    ['/32', 'An ISP or large organization allocation', fmt(2 ** 32)],
    ['/48', 'One site or campus', fmt(2 ** 16)],
    ['/56', 'A small site, branch or home connection', fmt(2 ** 8)],
    ['/60', 'A small home or lab allocation', fmt(2 ** 4)],
    ['/64', 'One LAN or VLAN (SLAAC needs exactly /64)', '1'],
    ['/127', 'A point-to-point link between routers (RFC 6164)', '—'],
    ['/128', 'A single address, such as a loopback', '—'],
], num_cols=(2,), mono_cols=(0,))
v6_hash = '192.168.0.0/24/1.0/' + b64({'v6': {'p': '2001:db8::/48', 't': 'n' + '0' * 16}})
page('ipv6-subnetting', 'IPv6 subnetting: /48, /56 and /64, nibble boundaries and ULA',
     'A practical guide to IPv6 subnetting: what /48, /56 and /64 are for, why you split on nibble (4-bit) boundaries, point-to-point /127s, ip6.arpa reverse DNS, and unique local addresses.',
     f'''    <p class="lede">In IPv6 you stop counting hosts. Every LAN gets a /64, and planning is about how many /64s each site gets.</p>
    <h2>Standard sizes</h2>
    {v6tbl}
    <h2>Split on nibbles</h2>
    <p>Each hex digit in an IPv6 address is 4 bits, a “nibble”. Splitting on 4-bit boundaries (/48 → /52 → /56 → /60 → /64) keeps every prefix readable: the subnets of <code>2001:db8:abcd::/48</code> at /52 are <code>2001:db8:abcd:0000::/52</code> through <code>2001:db8:abcd:f000::/52</code>, one hex digit each. It also keeps reverse DNS clean, because each <code>ip6.arpa</code> label is one nibble.</p>
    <p>A /48 holds 16 /52s, 256 /56s and 65,536 /64s. A common plan gives each building or region a /52 or /56 and each VLAN a /64.</p>
    <h2>Point-to-point links</h2>
    <p>Use a <b>/127</b> for router-to-router links (RFC 6164), often taken from a /64 reserved per link so the numbering stays simple.</p>
    <h2>Unique local addresses (ULA)</h2>
    <p>For private IPv6, RFC 4193 reserves <code>fc00::/7</code>; in practice you use <code>fd00::/8</code> plus a random 40-bit Global ID, giving you your own /48. Randomness matters: two companies that both pick <code>fd00::/48</code> will clash if they ever connect.</p>
    <h2>Reverse DNS</h2>
    <p>Reverse zones live under <code>ip6.arpa</code>, one label per nibble in reverse. <code>2001:db8:abcd::/48</code> becomes <code>d.c.b.a.8.b.d.0.1.0.0.2.ip6.arpa</code>. Prefixes that aren’t on a nibble boundary span several zones.</p>
    {try_box('Split a /48 into nibble-aligned prefixes, give each a name and VLAN, or auto-plan “Sites, /56, 12” in one go.', app(v6_hash), 'Open the IPv6 planner →')}
''', h1='IPv6 subnetting: /48, /56, /64 and nibbles', faq=[
        ('What size IPv6 subnet should a LAN use?', 'A /64. Stateless address autoconfiguration (SLAAC) requires exactly 64 bits for the interface ID.'),
        ('How many /64 subnets are in a /48?', '65,536. A /48 also holds 256 /56s or 16 /52s.'),
        ('What is a nibble boundary in IPv6?', 'A prefix length that is a multiple of 4 (/48, /52, /56, /60, /64). Each hex digit is 4 bits, so these prefixes change whole hex digits and keep addresses and reverse DNS readable.'),
     ])

# ---------------------------------------------------------------- Hub
items = ''.join(f'<li><a href="{s}.html">{esc(t)}</a><p>{esc(d)}</p></li>' for s, t, d in PAGES)
page('index', 'Subnetting guides: CIDR, VLSM, IPv6 and cloud subnet sizing',
     'Short, accurate guides to IPv4 and IPv6 subnetting: a CIDR cheat sheet, host counts, VLSM, private ranges, IPv6 prefixes and subnet sizing for AWS, Azure, Google Cloud and Oracle Cloud.',
     f'''    <p class="lede">Short, practical guides to the subnetting questions that come up when you plan a network. Every number is computed, not typed by hand.</p>
    <ul class="grid">{items}</ul>
    {try_box('Ready to plan? The free planner splits, joins, auto-sizes and exports your network.', app())}
''', h1='Subnetting guides')

# ---------------------------------------------------------------- Sitemap
urls = [SITE, SITE + 'learn/'] + [SITE + f'learn/{s}.html' for s, _, _ in PAGES]
(ROOT / 'sitemap.xml').write_text('<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n' +
                                  ''.join(f'  <url>\n    <loc>{u}</loc>\n    <lastmod>{TODAY}</lastmod>\n  </url>\n' for u in urls) + '</urlset>\n')
print(f'Built {len(PAGES) + 1} pages in {LEARN}')
