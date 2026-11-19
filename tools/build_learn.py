#!/usr/bin/env python3
"""Build the static guide pages in learn/ for IP Plan-O-Matic.

Every number in the tables is computed here with Python's ipaddress module,
so the guides can't drift from the real subnet math. Run from the repo root:

    python3 tools/build_learn.py

It rewrites learn/*.html, learn/learn.css, sitemap.xml and the guide cards on the
app's Guides tab (between the guides:start / guides:end markers in index.html).

A page whose only change would be its date is left alone, so dateModified (and the
page's sitemap lastmod) moves only when the page really changes. The app's own
sitemap lastmod is %%BUILD_DATE%%, which tools/build_site.py stamps at deploy.

    python3 tools/build_learn.py --check

writes nothing and exits 1 if any generated file differs from what is committed
(CI runs this, so the guides can't drift from the generator).
"""
import base64
import hashlib
import base64
import datetime
import html
import ipaddress
import json
import pathlib
import re
import sys

ROOT = pathlib.Path(__file__).resolve().parent.parent
LEARN = ROOT / 'learn'
SITE = 'https://crockerfeller.github.io/IP-Plan-O-Matic/'
TODAY = datetime.date.today().isoformat()
CHECK = '--check' in sys.argv[1:]
STALE = []    # --check: files that differ from what the generator makes
DATES = {}    # page URL -> its dateModified (kept from the file when only the date would change)
DATE_RE = re.compile(r'"dateModified": "(\d{4}-\d{2}-\d{2})"')


def write(path, text):
    """Write a generated file, unless it is unchanged apart from its dateModified. Returns the date it carries."""
    old = path.read_text(encoding='utf-8') if path.exists() else None
    m = DATE_RE.search(old or '')
    if old is not None and m and DATE_RE.sub(f'"dateModified": "{m.group(1)}"', text) == old:
        return m.group(1)
    if old != text:
        if CHECK:
            STALE.append(path.relative_to(ROOT))
        else:
            path.write_text(text, encoding='utf-8')
    return TODAY

# Plan link captured from the app: the Auto-plan tab's "Cloud AZ example", applied (compact link form).
AWS_AZ_PLAN = '10.20.0.0/16/29.f4f49300/~ndDdCoIwGMbxWxnPsdq7pWE77ji6hW0OEiqjaUHivYdRUTb8Otx78PuPp4aBhLo5BDhC1uAUCYooooWg9n2CxO6SX1VpmTqfWeVCq1wZcoUAd0j8HNzzYDMEKCCxtTZzLCYiti9c6dAErwBfDRd0t6CnFJZiuGC6BTOlEKdtIf4UKn3IzZyBRPJvr3vt8dN47IR67fGj-Gze2snb3qhSaeXsnFW48OlcpL3--GV8vhj4_fhtvvSmeQA'

esc = html.escape


def b64(obj):
    return base64.urlsafe_b64encode(json.dumps(obj, separators=(',', ':')).encode()).decode().rstrip('=')


def app(hash_='', tab=''):
    return '../' + (f'?tab={tab}' if tab else '') + ('#' + hash_ if hash_ else '')


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
  --accent: #2b65d8; --accent-text: #ffffff; --accent-weak: #e9effd; --row-hover: #f3f6fa;
  --ok: #1a7b45; --ok-weak: #e3f4ea; --warn: #976200; --warn-weak: #fdf2d8;
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
.sizes { display: grid; grid-template-columns: repeat(auto-fill, minmax(150px, 1fr)); gap: 8px; margin: 16px 0; padding: 0; list-style: none; }
.sizes a { display: block; border: 1px solid var(--border); border-radius: 8px; padding: 8px 12px; text-decoration: none; }
.sizes a:hover { background: var(--accent-weak); }
.sizes b { display: block; font-family: 'JetBrains Mono', ui-monospace, monospace; }
.sizes span { font-size: 12px; color: var(--muted); }
.pager { margin-top: 20px; }
.quiz { border: 1px solid var(--border); border-radius: 12px; padding: 16px; margin: 16px 0 24px; background: var(--bg); }
.qbar { display: flex; flex-wrap: wrap; justify-content: space-between; align-items: center; gap: 8px 16px; font-size: 14px; }
.qbar select { font: inherit; padding: 4px 6px; border: 1px solid var(--border); border-radius: 6px; background: var(--panel); color: var(--text); }
.qstat { color: var(--muted); }
.qstat b { color: var(--text); }
.qtext { font-size: 20px; font-weight: 600; margin: 16px 0 12px; }
.qform { display: flex; flex-wrap: wrap; gap: 8px; align-items: center; }
.qform input { flex: 1 1 200px; min-width: 0; font: 16px 'JetBrains Mono', ui-monospace, monospace; padding: 9px 12px; border: 1px solid var(--border); border-radius: 8px; background: var(--panel); color: var(--text); }
.qform input:focus { outline: 2px solid var(--accent); outline-offset: 1px; }
.qform .cta { border: 0; cursor: pointer; font: inherit; }
.qlink { background: none; border: 0; padding: 0; font: inherit; font-size: 14px; color: var(--accent); text-decoration: underline; cursor: pointer; }
.qfb { margin: 14px 0 0; padding: 12px 14px; border-radius: 8px; }
.qfb.ok { background: var(--ok-weak); }
.qfb.bad { background: var(--warn-weak); }
.qkinds { margin-top: 14px; font-size: 14px; }
.qkinds summary { cursor: pointer; color: var(--muted); }
#qKinds { display: grid; grid-template-columns: repeat(auto-fill, minmax(200px, 1fr)); gap: 4px 12px; margin-top: 8px; }
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


# The theme is set before the page draws, so it can't flash. The Content Security Policy allows exactly this script by
# its hash and nothing else inline; any other script must be a file on this site.
THEME_JS = "try { const t = localStorage.getItem('subnetPlanner.theme'); if (t === 'light' || t === 'dark') document.documentElement.dataset.theme = t; } catch (e) {}"
CSP = ("default-src 'self'; script-src 'self' 'sha256-" + base64.b64encode(hashlib.sha256(THEME_JS.encode()).digest()).decode() + "'; "
       "style-src 'self'; img-src 'self' data:; font-src 'self'; connect-src 'self'; object-src 'none'; base-uri 'none'; form-action 'none'")


def page(slug, title, description, body, h1=None, faq=None, listed=True):
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
<meta http-equiv="Content-Security-Policy" content="{CSP}">
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
<link href="../fonts/fonts.css" rel="stylesheet">
<link rel="stylesheet" href="learn.css">
<script>{THEME_JS}</script>
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
    DATES[url] = write(LEARN / ('index.html' if slug == 'index' else slug + '.html'), doc)
    if slug != 'index' and listed:
        PAGES.append((slug, h1 or title, description))


def table(head, rows, num_cols=(), mono_cols=(), hi=None):
    th = ''.join(f'<th{" class=n" if i in num_cols else ""}>{esc(h)}</th>' for i, h in enumerate(head or []))
    out = []
    for r in rows:
        cls = ' class="hi"' if hi and hi(r) else ''
        tds = ''.join(
            f'<td class="{"n" if i in num_cols else ""}{" m" if i in mono_cols else ""}">{v}</td>'.replace(' class=""', '')
            for i, v in enumerate(r))
        out.append(f'<tr{cls}>{tds}</tr>')
    thead = f'<thead><tr>{th}</tr></thead>' if head else ''   # head=None: a two-column facts table
    return f'<div class="table-wrap"><table>{thead}<tbody>{"".join(out)}</tbody></table></div>'


def try_box(text, href, label='Open in the planner →'):
    return f'<div class="try"><p>{text}</p><a class="cta" href="{href}">{label}</a></div>'


LEARN.mkdir(exist_ok=True)
write(LEARN / 'learn.css', CSS)

# ---------------------------------------------------------------- CIDR cheat sheet
rows = []
for p in range(0, 33):
    n = ipaddress.IPv4Network(f'0.0.0.0/{p}')
    size = n.num_addresses
    rows.append([f'<a href="slash-{p}-subnet.html">/{p}</a>' if p >= 8 else f'/{p}', str(n.netmask), str(n.hostmask), fmt(size), fmt(usable(p)),
                 fmt(size // 256) if p <= 24 else f'1/{256 // size}'])
cheat = table(['Prefix', 'Netmask', 'Wildcard', 'Addresses', 'Usable hosts', '/24 networks'], rows,
              num_cols=(3, 4), mono_cols=(0, 1, 2), hi=lambda r: any(f'>/{x}<' in r[0] for x in (8, 16, 24)))
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

# ---------------------------------------------------------------- Azure
# The service subnet catalog is read from the app (AZURE_SVCS in app.js), so the guide and the
# Azure / AWS subnet wizard always agree on names, delegations and sizes.
def azure_services():
    src = (ROOT / 'app.js').read_text()
    block = src[src.index('const AZURE_SVCS = ['):]
    block = block[:block.index('\n  ];')]
    out = []
    for line in re.findall(r'^\s*\{ id: .*\},?\s*$', block, re.M):
        d = {}
        for k, v in re.findall(r"(\w+): ('(?:[^'\\]|\\.)*'|true|false|\d+)", line):
            d[k] = v[1:-1] if v.startswith("'") else (v == 'true' if v in ('true', 'false') else int(v))
        out.append(d)
    assert len(out) > 10 and all('min' in d and 'rec' in d for d in out), 'AZURE_SVCS not parsed'
    return out


AZ_SVCS = azure_services()
AZ_LEARN = 'https://learn.microsoft.com/azure/'


def az_rows(svcs):
    r = []
    for d in svcs:
        if not d.get('doc'):
            continue   # plain workload tiers: no Azure requirement to show
        label = f'<a href="{AZ_LEARN}{esc(d["doc"])}">{esc(d["label"])}</a>'
        name = f'<code>{esc(d["name"])}</code>' if d.get('fixed') else 'Any'
        deleg = f'<code>{esc(d["deleg"])}</code>' if d.get('deleg') else '—'
        mn = f'/{d["min"]}' + (' (advice)' if d.get('soft') else '')
        r.append([label, name, deleg, mn, f'/{d["rec"]}', fmt(usable(d['rec'], 'azure'))])
    return r


def az_table(svcs):
    return table(['Service', 'Subnet name', 'Delegation', 'Minimum', 'Recommended', 'Usable at rec.'],
                 az_rows(svcs), num_cols=(5,))


# The template's default layout: each VNet's default-on services at the recommended size, largest first.
def az_layout(vnet, role):
    net = ipaddress.IPv4Network(vnet)
    svcs = sorted((d for d in AZ_SVCS if d['role'] == role and d['on']), key=lambda d: d['rec'])
    nxt, rows = int(net.network_address), []
    for d in svcs:
        sz = 2 ** (32 - d['rec'])
        nxt = (nxt + sz - 1) // sz * sz
        sub = ipaddress.IPv4Network((nxt, d['rec']))
        assert sub.subnet_of(net)
        rows.append([f'<code>{esc(d["name"])}</code>', esc(d['label']), str(sub), fmt(usable(d['rec'], 'azure'))])
        nxt += sz
    return rows, (nxt - int(net.network_address)) * 100 // net.num_addresses


hub_rows, hub_pct = az_layout('10.0.0.0/23', 'hub')
spoke_rows, spoke_pct = az_layout('10.0.16.0/20', 'spoke')
# Captured from the app: Azure / AWS subnet wizard… with its defaults, applied (the same layout as az_layout).
AZ_HUB_PLAN = '10.0.0.0/23/13.7610/~pZRNb9swDIb_isDTBqjxRwMn1W1Dl-2yoGiA9lD0IFtMKsSRDEm2txX574M_BMdJm6wYciEd8XlfioReIQMG_E9pECjkwOBHmQKFHbBXiMJJ-wvipEkVMPjSnFxIgzXP81WZKnRAQQCDdQ0ULDAoLQqgoIHBLQqZcYeCOE3aUuJrYU89P5keC3zl1kmtRvy0-_ZPIn39gUYUz4N45kW-c4c1_z3iby75f7hbkoB8-1UYtPZelw7JpuMc6iRhEM-9jlXoroSyV1L1KkJZeamH2-WK3BlZcYfkHq3OKzREqlSXSpBPAnPc-KM_ZWa01Ws3WaKrtdkGQllfYz8fGpslbxnTpRucdcmHrenS_Y-3KGk2bDqyxouinUdjzMdnx14UeZNJrUg_XFLFg8TsVKLAnt8G5-C-YVSi0FI5O3Dnp9wa0x7cRUfkR222ueaCkRpT4iSagXbz5kUM13COxotiTIvDU5rgjvtxd-G7vOb_I2A0egm8PVtlg8MuuTApskJTyQxJQBalypqhWfKwREekcrgx3RjfW6ZHTAOLpkKz4GbX7NGeQgrs6elwnUKgEN1M1tPkugn9A7cq9BZJ3XcJz88UiqG0vbFroGNQe0g3be-AwUv7PL4AOypZA4sobICFFBwwcO3OGmDRfv8X'


def az_fit(n):
    return next(p for p in range(29, 1, -1) if usable(p, 'azure') >= n)


# AKS: with Azure CNI on the node subnet each node takes 1 address plus one per pod it can run;
# with Azure CNI Overlay only the node takes a VNet address.
AKS_NODES, AKS_SURGE, AKS_PODS = 50, 1, 30
aks_ovl = AKS_NODES + AKS_SURGE
aks_cni = (AKS_NODES + AKS_SURGE) * (AKS_PODS + 1)
aks_ovl_p, aks_cni_p = az_fit(aks_ovl), az_fit(aks_cni)
aks_rows = [
    ['Azure CNI Overlay', f'{AKS_NODES} + {AKS_SURGE} = {fmt(aks_ovl)}', f'/{aks_ovl_p}', fmt(usable(aks_ovl_p, 'azure'))],
    ['Azure CNI (node subnet)', f'({AKS_NODES} + {AKS_SURGE}) × ({AKS_PODS} + 1) = {fmt(aks_cni)}', f'/{aks_cni_p}', fmt(usable(aks_cni_p, 'azure'))],
]

page('azure-vnet-subnet-sizing', 'Azure VNet subnet sizing: reserved IPs, service subnets and hub-and-spoke layout',
     'How to size Azure VNet subnets: the 5 reserved addresses, the /29 minimum, usable addresses per size, names and sizes for GatewaySubnet, Bastion, Firewall and delegated subnets, AKS sizing and a hub-and-spoke example.',
     f'''    <p class="lede">Azure reserves 5 addresses in every subnet, many services need a subnet of their own with a fixed name or minimum size, and a subnet is hard to resize once it’s in use. Here is how to size them before you build.</p>
    <div class="note"><b>Quick answers:</b> a /24 has 251 usable addresses in Azure. The smallest subnet is a /29, with 3 usable. <code>GatewaySubnet</code> should be a /27, <code>AzureBastionSubnet</code> and <code>AzureFirewallSubnet</code> a /26, and Application Gateway v2 a /24. <a href="../?wizard=azure">Open the subnet wizard</a> to create them.</div>
    <h2>The 5 reserved addresses</h2>
    <p>In a subnet such as <code>10.1.0.0/24</code>, Azure keeps:</p>
    <ul>
      <li><code>10.1.0.0</code>: the network address</li>
      <li><code>10.1.0.1</code>: the default gateway</li>
      <li><code>10.1.0.2</code> and <code>10.1.0.3</code>: map Azure DNS into the VNet</li>
      <li><code>10.1.0.255</code>: the broadcast address (Azure has no broadcast, but reserves it)</li>
    </ul>
    <p>The first address you can give a VM is <code>.4</code>. The same 5 are reserved at every size, so small subnets lose the most: a /29 keeps only 3 of its 8.</p>
    <h2>Size limits</h2>
    <p>An IPv4 subnet can be anything from a <b>/29</b> up to a /2. IPv6 subnets in a dual-stack VNet must be exactly a <b>/64</b>. A VNet can have several address spaces, and you can add more later, even while it’s peered.</p>
    {sizes_table('azure', [16, 18, 19, 20, 21, 22, 23, 24, 25, 26, 27, 28, 29])}
    <h3>Ranges you can’t use</h3>
    <p>Any <a href="private-ip-address-ranges.html">private range</a> works for a VNet, but Azure refuses <code>224.0.0.0/4</code> (multicast), <code>255.255.255.255/32</code> (broadcast), <code>127.0.0.0/8</code> (loopback), <code>169.254.0.0/16</code> (link-local) and <code>168.63.129.16/32</code> (the Azure platform’s virtual IP).</p>
    <h2>Subnets Azure services need</h2>
    <p>Some services need a subnet with an exact name. Others need a subnet <b>delegated</b> to them, which other resources can’t share. Plan these before you fill the VNet with workloads. Each service links to its Microsoft Learn page.</p>
    {try_box('<b>Create these subnets in the planner.</b> The subnet wizard lists every service below: tick the ones you need, and each gets its own subnet with the required name or delegation, at the recommended size and never below the minimum. You get one VNet with all of them, or switch to hub and spoke to put shared services in a hub, then export it to Terraform.', '../?wizard=azure', 'Open the subnet wizard →')}
    <h3>Required names, usually in the hub</h3>
    {az_table(d for d in AZ_SVCS if d.get('fixed'))}
    <p>Azure won’t deploy these services into a subnet with any other name. A network security group on <code>GatewaySubnet</code> isn’t supported.</p>
    <h3>Dedicated and delegated subnets</h3>
    {az_table(d for d in AZ_SVCS if not d.get('fixed'))}
    <p>“Advice” means Azure doesn’t enforce that minimum, but a smaller subnet limits scaling. Private endpoints don’t need a subnet of their own; a dedicated one just keeps network security groups and routes simple.</p>
    <h2>A hub-and-spoke example</h2>
    <p>Most Azure landing zones put shared network services in a hub VNet and workloads in spoke VNets peered to it. This is the planner’s default template in <code>10.0.0.0/16</code>, at the recommended sizes, largest first. The hub is <code>10.0.0.0/23</code>:</p>
    {table(['Subnet name', 'For', 'Subnet', 'Usable'], hub_rows, num_cols=(3,), mono_cols=(2,))}
    <p>That fills {hub_pct}% of the hub. The spoke is <code>10.0.16.0/20</code>:</p>
    {table(['Subnet name', 'For', 'Subnet', 'Usable'], spoke_rows, num_cols=(3,), mono_cols=(2,))}
    <p>That fills {spoke_pct}% of the spoke, leaving room for AKS, a database or more tiers. Further spokes take the next /20s (<code>10.0.32.0/20</code>, <code>10.0.48.0/20</code> …), so one /16 holds the hub and 15 spokes.</p>
    {try_box('Open this hub and spoke in the planner. Subnets keep their names and delegations, and the Terraform export writes the VNets, subnets and peerings for azurerm. To pick other services or add spokes, <a href="../?wizard=azure">open the subnet wizard</a> and set Layout to Hub and spokes (the <b>Azure / AWS subnet wizard…</b> button on the Plan IPv4 tab).', app(AZ_HUB_PLAN))}
    <h2>Sizing an AKS subnet</h2>
    <p>How many VNet addresses AKS uses depends on its network plugin. Count the most nodes the cluster can scale to, plus the extra nodes an upgrade adds (surge, 1 by default):</p>
    <ul>
      <li><b>Azure CNI Overlay</b> (the default for new clusters): only nodes take VNet addresses. Pods get theirs from a separate range, <code>10.244.0.0/16</code> by default.</li>
      <li><b>Azure CNI on the node subnet</b> (the traditional plugin): each node also reserves one address for every pod it can run, so it takes max pods + 1. Max pods defaults to 30.</li>
    </ul>
    <p>For {AKS_NODES} nodes:</p>
    {table(['Plugin', 'Addresses needed', 'Smallest subnet', 'Usable'], aks_rows, num_cols=(3,), mono_cols=(2,))}
    <p>Either way, the pod range and the Kubernetes service range (<code>10.0.0.0/16</code> by default) must not overlap the VNet or anything connected to it. If your VNets use <code>10.0.0.0/16</code>, pick another service range when you create the cluster.</p>
    <h2>Tips</h2>
    <ul>
      <li><b>Leave room to grow.</b> Changing a subnet’s range generally means emptying it first, so keep free space in each VNet rather than handing it all out.</li>
      <li><b>Connected networks can’t overlap.</b> Peering, VPN and ExpressRoute all need unique ranges, so carve every VNet from one master plan. The planner’s Check &amp; summarize tab tests a plan against your existing networks.</li>
      <li><b>Give each region or environment its own block</b>, such as a /16. Routes stay easy to summarize, and each hub and its spokes have a clean boundary.</li>
      <li><b>Count IP addresses, not VMs.</b> Load balancers, private endpoints, scale sets and App Service instances use addresses too. See <a href="how-many-hosts-in-a-subnet.html">how many hosts are in a subnet</a>.</li>
    </ul>
''', h1='Azure VNet subnet sizing', faq=[
        ('How many IP addresses does Azure reserve per subnet?', 'Five: the network address, the default gateway (.1), two addresses that map Azure DNS (.2 and .3) and the broadcast address. A /24 has 251 usable addresses.'),
        ('What is the smallest subnet in Azure?', 'A /29, with 8 addresses and 3 usable after Azure reserves 5. The largest is a /2, and IPv6 subnets must be exactly /64.'),
        ('What size should GatewaySubnet be?', 'A /27 or larger. Use a /26 for 16 ExpressRoute circuits or for VPN and ExpressRoute gateways side by side. The smallest allowed is a /29.'),
        ('What size should AzureBastionSubnet and AzureFirewallSubnet be?', 'Both need a /26 or larger, with exactly those names. Azure Firewall with forced tunneling or the Basic SKU also needs a /26 AzureFirewallManagementSubnet.'),
        ('How big should an AKS subnet be?', f'With Azure CNI Overlay, one address per node plus upgrade surge: {AKS_NODES} nodes fit in a /{aks_ovl_p}. With traditional Azure CNI each node also reserves an address per pod: {AKS_NODES} nodes with 30 max pods need {fmt(aks_cni)} addresses, a /{aks_cni_p}.'),
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
    {try_box('Split a /48 into nibble-aligned prefixes, give each a name and VLAN, or auto-plan “Sites, /56, 12” in one go.', app(v6_hash, 'v6'), 'Open the IPv6 planner →')}
''', h1='IPv6 subnetting: /48, /56, /64 and nibbles', faq=[
        ('What size IPv6 subnet should a LAN use?', 'A /64. Stateless address autoconfiguration (SLAAC) requires exactly 64 bits for the interface ID.'),
        ('How many /64 subnets are in a /48?', '65,536. A /48 also holds 256 /56s or 16 /52s.'),
        ('What is a nibble boundary in IPv6?', 'A prefix length that is a multiple of 4 (/48, /52, /56, /60, /64). Each hex digit is 4 bits, so these prefixes change whole hex digits and keep addresses and reverse DNS readable.'),
     ])

# ---------------------------------------------------------------- Subnetting practice
# The quiz itself is learn/practice.js (hand-written); this page is its markup and the method behind it.
page('subnetting-practice', 'Subnetting practice: free IPv4 subnetting questions with answers',
     'Practice IPv4 subnetting with random questions: network and broadcast addresses, first and last host, masks, wildcards, host counts and subnet sizes. Every answer is checked and the working is shown.',
     f'''    <p class="lede">Random subnetting questions with the answer and the working, for the CCNA, Network+ or just keeping sharp. Nothing to sign up for; your score stays in this browser.</p>
    <div class="quiz" id="quiz">
      <div class="qbar">
        <label>Level <select id="qLevel">
          <option value="easy">Easy: /24 to /30</option>
          <option value="medium" selected>Medium: /16 to /30</option>
          <option value="hard">Hard: /8 to /30</option>
        </select></label>
        <span class="qstat"><b id="qScore">0 / 0</b> <span id="qStreak"></span> <button type="button" id="qReset" class="qlink">Reset</button></span>
      </div>
      <p class="qtext" id="qText" aria-live="polite">Loading a question…</p>
      <form id="qForm" class="qform" autocomplete="off">
        <input id="qIn" aria-label="Your answer" spellcheck="false" autocapitalize="off">
        <button type="submit" id="qCheck" class="cta">Check</button>
        <button type="button" id="qSkip" class="qlink">Show answer</button>
      </form>
      <p class="qfb" id="qFb" aria-live="polite" hidden></p>
      <details class="qkinds"><summary>Question types</summary><div id="qKinds"></div></details>
      <noscript><p>The practice questions need JavaScript.</p></noscript>
    </div>
    <script src="practice.js" defer></script>
    <h2>The block-size method</h2>
    <p>You can answer almost every subnetting question without binary:</p>
    <ol>
      <li><b>Find the interesting octet.</b> A /17 to /24 changes the third octet, /25 to /32 the last, /9 to /16 the second.</li>
      <li><b>Find the block size.</b> It’s 256 minus the mask’s value in that octet. A /21 has mask 255.255.<b>248</b>.0, so the block size is 256 − 248 = <b>8</b>.</li>
      <li><b>Find the block your address is in.</b> For 10.4.<b>17</b>.200/21, 17 is in the block 16–23. So the network is <b>10.4.16.0</b> and the broadcast is <b>10.4.23.255</b>.</li>
      <li><b>First and last hosts</b> are one after the network and one before the broadcast: 10.4.16.1 to 10.4.23.254.</li>
    </ol>
    <p>Host counts are 2<sup>(32 − prefix)</sup> − 2; see <a href="how-many-hosts-in-a-subnet.html">how many hosts are in a subnet</a> and the <a href="subnet-sizes.html">page for each size</a>.</p>
    {try_box('Check any answer in the planner: type the network on the Check &amp; summarize tab to see its range, mask and hosts.', app())}
''', h1='Subnetting practice', faq=[
        ('How do you find the network address of a subnet quickly?', 'Find the block size in the interesting octet (256 minus the mask value there), then round the address down to a multiple of the block size. For 10.4.17.200/21 the block size is 8 in the third octet, so the network is 10.4.16.0.'),
        ('How do you find the broadcast address?', 'It is the last address of the block: the network address plus the block size, minus one, with the following octets at 255. For 10.4.17.200/21 that is 10.4.23.255.'),
     ])

# ---------------------------------------------------------------- One page per prefix size
# Every number on these pages is computed with Python's ipaddress module.
PREFIX_PAGES = []  # (slug, label, description) for the "Subnet sizes" index and the sitemap

USES4 = {
    8: 'A whole former class A network. 10.0.0.0/8 is the largest private block, usually carved into a /16 per region, site or cloud.',
    9: 'Half of a /8. Google Cloud’s auto mode networks use 10.128.0.0/9.',
    10: 'A quarter of a /8. 100.64.0.0/10 is the shared space ISPs use for carrier-grade NAT.',
    11: 'An eighth of a /8: a large regional or business-unit allocation.',
    12: 'Sixteen /16s. 172.16.0.0/12 is one of the three private RFC 1918 blocks.',
    13: 'Eight /16s, often a large region’s share of a 10.0.0.0/8 plan.',
    14: 'Four /16s: a mid-size region or a group of cloud networks.',
    15: 'Two /16s. 198.18.0.0/15 is reserved for network benchmarking.',
    16: 'The classic site or cloud network size: 65,536 addresses. The largest AWS VPC CIDR block and the usual size for a whole VNet or VPC.',
    17: 'Half of a /16: a large VPC, VNet or campus.',
    18: 'A quarter of a /16, enough for a VPC with room for big subnets, or a building’s worth of VLANs.',
    19: 'Thirty-two /24s: a medium VPC or a campus with many VLANs.',
    20: 'Sixteen /24s: a common size for a spoke VNet or VPC, or a mid-size branch.',
    21: 'Eight /24s: a small VPC, or a large subnet for Kubernetes pods.',
    22: 'Four /24s: 1,022 hosts. Used for big flat networks, Wi-Fi with many clients, and Kubernetes node subnets.',
    23: 'Two /24s: 510 hosts. A large office LAN or a guest Wi-Fi network.',
    24: 'The everyday LAN: 254 hosts, and easy to read because the subnet is the first three octets. The default for most VLANs and home networks.',
    25: 'Half of a /24: 126 hosts, for a department, floor or server network.',
    26: 'A quarter of a /24: 62 hosts, for a small office, a VLAN of printers or phones, or Azure Bastion and Azure Firewall subnets (which must be /26).',
    27: '30 hosts: small VLANs, management networks, and Azure GatewaySubnet (/27 recommended).',
    28: '14 hosts: the smallest AWS subnet, and a common size for Transit Gateway attachments and small DMZs.',
    29: '6 hosts: the smallest Azure and Google Cloud subnet, a small public IP block from an ISP, or a tiny DMZ.',
    30: '2 hosts: the classic router-to-router link. The smallest OCI subnet.',
    31: '2 addresses, both usable: point-to-point links under RFC 3021, with no network or broadcast address.',
    32: 'A single address: loopbacks, host routes and firewall rules for one host.',
}


def prefix_slug(p):
    return f'slash-{p}-subnet'


def octet_note(p):
    """Where a subnet of this size starts: the octet that varies, and its step."""
    if p == 32:
        return 'Every address is its own /32.'
    octet = min(4, p // 8 + 1)          # the octet the prefix boundary falls in
    step = 2 ** (8 * octet - p)
    names = {1: 'first', 2: 'second', 3: 'third', 4: 'last'}
    if step == 256:
        return f'A /{p} ends on an octet boundary, so its subnets differ in the {names[octet - 1]} octet and the octets after it are 0.'
    starts = ', '.join(str(i) for i in range(0, 256, step)[:6]) + (', …' if 256 // step > 6 else '')
    return f'The block size is {step} in the {names[octet]} octet: a /{p} always starts at {starts}.'


def v4_page(p):
    net = ipaddress.IPv4Network(f'0.0.0.0/{p}')
    mask, wild, size = str(net.netmask), str(net.hostmask), net.num_addresses
    bits = '.'.join(f'{int(o):08b}' for o in mask.split('.'))
    hosts = usable(p)
    facts = table(None, [
        ['Subnet mask', f'<span class="mono">{mask}</span>'],
        ['Wildcard mask', f'<span class="mono">{wild}</span>'],
        ['Binary mask', f'<span class="mono">{bits}</span>'],
        ['Total addresses', fmt(size)],
        ['Usable hosts', fmt(hosts) + (' (RFC 3021: both usable)' if p == 31 else ' (a single host)' if p == 32 else ' (minus network and broadcast)')],
        [f'/{p}s in a /24', str(256 // size)] if p >= 24 else [f'/24s in a /{p}', fmt(size // 256)],
    ])
    # Example subnets: inside a /24 for small prefixes, inside a /16 or /8 for larger ones.
    parent = ipaddress.IPv4Network('192.168.1.0/24' if p >= 24 else '10.0.0.0/16' if p >= 16 else '10.0.0.0/8')
    subs = list(parent.subnets(new_prefix=p)) if p > parent.prefixlen else [parent]
    shown = subs[:16]
    def rng(n):
        if n.prefixlen == 32:
            return str(n.network_address), '—'
        if n.prefixlen == 31:
            return f'{n[0]} – {n[1]}', '—'
        return f'{n[1]} – {n[-2]}', str(n.broadcast_address)
    sub_rows = [[str(n), *rng(n)] for n in shown]
    sub_tbl = table(['Subnet', 'Usable range', 'Broadcast'], sub_rows, mono_cols=(0, 1, 2))
    more = f' The first {len(shown)} of {fmt(len(subs))} are shown.' if len(subs) > len(shown) else ''
    sub_intro = (f'Every /{p} inside <code>{parent}</code>.{more}' if len(subs) > 1 else f'<code>{parent}</code> itself.')
    clouds = []
    for pl, name in (('aws', 'AWS VPC'), ('azure', 'Azure VNet'), ('gcp', 'Google Cloud VPC'), ('oci', 'Oracle Cloud VCN')):
        u = usable(p, pl)
        too_big = (pl in ('aws', 'oci') and p < 16)
        clouds.append([name, '—' if u is None or too_big else fmt(u), 'too small for a subnet' if u is None else 'larger than a VPC CIDR block can be' if too_big else ''])
    cloud_tbl = table(['Cloud', 'Usable addresses', ''], clouds, num_cols=(1,))
    split = []
    if p < 32:
        split.append(f'A /{p} splits into ' + ', '.join(f'{2 ** k} /{p + k}s' for k in range(1, min(4, 33 - p))) + '.')
    if p > 0:
        split.append(f'Two /{p}s that sit side by side, starting on a multiple of {fmt(size * 2)} addresses, join into one /{p - 1}.')
    links = []
    if p > 8:
        links.append(f'<a href="{prefix_slug(p - 1)}.html">← /{p - 1}</a>')
    links.append('<a href="subnet-sizes.html">All sizes</a>')
    if p < 32:
        links.append(f'<a href="{prefix_slug(p + 1)}.html">/{p + 1} →</a>')
    title = f'/{p} subnet: {mask}, {fmt(size)} addresses, {fmt(hosts)} usable hosts'
    desc = (f'A /{p} subnet has subnet mask {mask}, {fmt(size)} addresses and {fmt(hosts)} usable hosts. '
            f'Wildcard, binary mask, example ranges, cloud usable addresses and how /{p} splits and joins.')
    try_hash = f'{parent.network_address}/{max(p, 8)}' if p >= 24 else f'10.0.0.0/{p}'
    page(prefix_slug(p), title, desc, f'''    <p class="lede">A /{p} is {fmt(size)} IPv4 address{'es' if size > 1 else ''}, with subnet mask <code>{mask}</code> and {fmt(hosts)} usable host{'s' if hosts != 1 else ''}.</p>
    {facts}
    <h2>What a /{p} is used for</h2>
    <p>{esc(USES4[p])}</p>
    <h2>Where /{p} subnets start</h2>
    <p>{octet_note(p)}</p>
    <p>{sub_intro}</p>
    {sub_tbl}
    <h2>Usable addresses in the cloud</h2>
    <p>Clouds reserve more addresses than the network and broadcast: 5 in AWS and Azure, 4 in Google Cloud, 3 in Oracle Cloud.</p>
    {cloud_tbl}
    <h2>Splitting and joining</h2>
    <p>{' '.join(split)}</p>
    <p class="pager">{' · '.join(links)}</p>
    {try_box(f'Open a /{p} in the planner and divide it, name the subnets and export the result.', app(try_hash))}
''', h1=f'/{p} subnet (subnet mask {mask})', faq=[
        (f'How many hosts are in a /{p}?', f'A /{p} has {fmt(size)} addresses and {fmt(hosts)} usable hosts.' + ('' if p >= 31 else ' The network and broadcast addresses are not usable.')),
        (f'What is the subnet mask for /{p}?', f'{mask}. The wildcard mask is {wild}.'),
        *([(f'How many /{p} subnets are in a /24?', f'{256 // size}.')] if 24 < p <= 32 else []),
    ], listed=False)
    PREFIX_PAGES.append((prefix_slug(p), f'/{p}', f'{mask} · {fmt(hosts)} hosts'))


for p in range(8, 33):
    v4_page(p)

V6 = {
    48: ('One site or campus. The usual allocation an organization gets for each location, and the size of a ULA prefix.', 'fd12:3456:789a::/48'),
    56: ('A small site, branch office or home connection. Many ISPs give home customers a /56.', '2001:db8:abcd:1200::/56'),
    64: ('One LAN or VLAN. SLAAC needs exactly 64 bits for the interface ID, so every subnet with hosts is a /64.', '2001:db8:abcd:12::/64'),
}
for p, (use, example) in V6.items():
    n = ipaddress.IPv6Network(example)
    sixty4 = 2 ** (64 - p)
    child = 64 if p < 64 else None
    rows = [['/64 networks inside', fmt(sixty4)], ['Total addresses', f'2<sup>{128 - p}</sup> ({fmt(2 ** (128 - p))})'], ['Example', f'<span class="mono">{n}</span>'],
            ['Reverse DNS zone', f'<span class="mono">{".".join(reversed(n.network_address.exploded.replace(":", "")[:p // 4]))}.ip6.arpa</span>']]
    if p == 48:
        rows.insert(1, ['/56s inside', '256'])
    ex_rows = [[str(s)] for s in list(n.subnets(new_prefix=p + 8 if p < 64 else 64))[:8]] if p < 64 else []
    slug = f'ipv6-slash-{p}'
    title = f'IPv6 /{p}: {fmt(sixty4)} /64 subnet{"s" if sixty4 > 1 else ""}, what it’s for and how to split it'
    desc = f'An IPv6 /{p} holds {fmt(sixty4)} /64 network{"s" if sixty4 > 1 else ""}. What a /{p} is used for, how to split it on nibble boundaries, its reverse DNS zone and an example.'
    body = f'''    <p class="lede">{esc(use)}</p>
    {table(None, rows)}
'''
    if ex_rows:
        body += f'''    <h2>Splitting a /{p}</h2>
    <p>Split on nibble boundaries (multiples of 4 bits) so each level changes whole hex digits. The first /{p + 8}s of <code>{n}</code>:</p>
    {table([f'/{p + 8}'], ex_rows, mono_cols=(0,))}
'''
    body += f'''    <p>See the <a href="ipv6-subnetting.html">IPv6 subnetting guide</a> for nibbles, /127 links and ULA.</p>
    <p class="pager"><a href="subnet-sizes.html">All sizes</a></p>
    {try_box(f'Split a /{p} into named, VLAN-tagged prefixes in the IPv6 planner.', app('192.168.0.0/24/1.0/' + b64({'v6': {'p': str(n), 't': '0'}}), 'v6'), 'Open the IPv6 planner →')}
'''
    page(slug, title, desc, body, h1=f'IPv6 /{p} prefix', faq=[
        (f'How many /64 subnets are in an IPv6 /{p}?', f'{fmt(sixty4)}.'),
    ], listed=False)
    PREFIX_PAGES.append((slug, f'IPv6 /{p}', f'{fmt(sixty4)} × /64'))

grid = ''.join(f'<li><a href="{s}.html"><b>{esc(lbl)}</b><span>{esc(d)}</span></a></li>' for s, lbl, d in PREFIX_PAGES)
page('subnet-sizes', 'Subnet sizes: every IPv4 prefix from /8 to /32, and IPv6 /48, /56 and /64',
     'One page per subnet size: the subnet mask, address count, usable hosts, example ranges and cloud limits for every IPv4 prefix from /8 to /32, plus IPv6 /48, /56 and /64.',
     f'''    <p class="lede">Pick a size for its subnet mask, host count, example ranges and how it splits.</p>
    <ul class="sizes">{grid}</ul>
    <p>All sizes in one table: the <a href="cidr-cheat-sheet.html">CIDR cheat sheet</a>.</p>
''', h1='Subnet sizes')

# ---------------------------------------------------------------- Hub
items = ''.join(f'<li><a href="{s}.html">{esc(t)}</a><p>{esc(d)}</p></li>' for s, t, d in PAGES)
page('index', 'Subnetting guides: CIDR, VLSM, IPv6 and cloud subnet sizing',
     'Short, accurate guides to IPv4 and IPv6 subnetting: a CIDR cheat sheet, host counts, VLSM, private ranges, IPv6 prefixes and subnet sizing for AWS, Azure, Google Cloud and Oracle Cloud.',
     f'''    <p class="lede">Short, practical guides to the subnetting questions that come up when you plan a network. Every number is computed, not typed by hand.</p>
    <ul class="grid">{items}</ul>
    {try_box('Ready to plan? The free planner splits, joins, auto-sizes and exports your network.', app())}
''', h1='Subnetting guides')

# ---------------------------------------------------------------- Guides tab in the app
app_html = ROOT / 'index.html'
src = app_html.read_text(encoding='utf-8')
start, end = '<!-- guides:start -->', '<!-- guides:end -->'
if start in src and end in src:
    cards = ''.join(f'        <li><a href="learn/{s}.html"><b>{esc(t)}</b><span>{esc(d)}</span></a></li>\n' for s, t, d in PAGES)
    src = src[:src.index(start) + len(start)] + '\n' + cards + src[src.index(end):]
    write(app_html, src)

# ---------------------------------------------------------------- Sitemap
urls = [SITE, SITE + 'learn/'] + [SITE + f'learn/{s}.html' for s, _, _ in PAGES] + [SITE + f'learn/{s}.html' for s, _, _ in PREFIX_PAGES]
write(ROOT / 'sitemap.xml', '<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n' +
      ''.join(f'  <url>\n    <loc>{u}</loc>\n    <lastmod>{DATES.get(u, "%%BUILD_DATE%%")}</lastmod>\n  </url>\n' for u in urls) + '</urlset>\n')
if CHECK:
    if STALE:
        print('These generated files are out of date. Run python3 tools/build_learn.py and commit the result:')
        print('\n'.join(f'  {f}' for f in STALE))
        sys.exit(1)
    print(f'Guides are up to date ({len(PAGES) + len(PREFIX_PAGES) + 1} pages)')
else:
    print(f'Built {len(PAGES) + len(PREFIX_PAGES) + 1} pages in {LEARN}')
