#!/usr/bin/env python3
"""Check every export format with the real tool that would consume it.

    python3 tests/check_exports.py                 # skips checks whose tool isn't installed
    python3 tests/check_exports.py --require-all   # a missing tool is a failure (what CI runs)
    python3 tests/check_exports.py --keep out/     # also keep the exported files in out/

Builds the site, opens tests/exports.html in headless Chrome (it makes on-prem, Azure, AWS, Google Cloud and
Oracle Cloud plans and clicks Download for every format), then checks each file:

    Terraform        terraform fmt -check, terraform init, terraform validate
    Bicep            bicep build (or az bicep build)
    CloudFormation   cfn-lint
    Azure CLI .ps1   PowerShell's own parser (pwsh)
    pfSense .php     php -l
    shell scripts    bash -n, shellcheck
    Ansible YAML     PyYAML
    CSV, JSON, Markdown, HTML, SVG, PNG, Excel   Python's parsers
    router configs   no offline checker exists, so only the text checks below

Every text file is also checked for leaked JavaScript values ("undefined", "NaN", "[object Object]").
Needs python3 and Google Chrome (CHROME=/path/to/chrome to override). Terraform caches providers in
~/.terraform.d/plugin-cache (TF_PLUGIN_CACHE_DIR to override).
"""
import argparse
import base64
import csv
import html
import html.parser
import io
import json
import os
import re
import shutil
import socket
import subprocess
import sys
import tempfile
import time
import xml.etree.ElementTree as ET
import zipfile
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
results = []          # (status, name, detail)


def report(status, name, detail=''):
    results.append((status, name, detail))
    line = f'  {status} {name}'
    if detail and status != 'PASS':
        line += '\n' + '\n'.join('      ' + l for l in detail.strip().splitlines()[:40])
    print(line, flush=True)


def run(cmd, cwd=None, env=None, timeout=600):
    p = subprocess.run(cmd, cwd=cwd, env=env, capture_output=True, text=True, timeout=timeout)
    return p.returncode, (p.stdout + p.stderr).strip()


def find_chrome():
    c = os.environ.get('CHROME') or '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'
    if os.access(c, os.X_OK):
        return c
    return shutil.which('google-chrome') or shutil.which('chromium') or sys.exit('Google Chrome not found; set CHROME=/path/to/chrome')


def export_files():
    """Build the site, serve it, let tests/exports.html download every format, return {path: bytes}."""
    with tempfile.TemporaryDirectory() as site, tempfile.TemporaryDirectory() as profile:
        subprocess.run([sys.executable, str(ROOT / 'tools/build_site.py'), site, '--include-tests'], check=True, stdout=subprocess.DEVNULL)
        with socket.socket() as s:
            s.bind(('127.0.0.1', 0))
            port = s.getsockname()[1]
        server = subprocess.Popen([sys.executable, '-m', 'http.server', str(port), '--bind', '127.0.0.1', '--directory', site],
                                  stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
        try:
            time.sleep(1)
            dom = subprocess.run([find_chrome(), '--headless=new', '--disable-gpu', '--no-first-run', f'--user-data-dir={profile}',
                                  '--virtual-time-budget=180000', '--dump-dom', f'http://127.0.0.1:{port}/tests/exports.html'],
                                 capture_output=True, text=True, timeout=600).stdout
        finally:
            server.terminate()
            server.wait()
    m = re.search(r'<pre id="out">(.*?)</pre>', dom, re.S)
    try:
        d = json.loads(html.unescape(m.group(1)))
    except Exception:
        sys.exit('  NO RESULT: tests/exports.html did not finish')
    for r in d['results']:
        if not r.startswith('PASS'):
            report('FAIL', r[5:])
    for e in d['errors']:
        report('FAIL', 'page error', e)
    print(f"  exports.html: {sum(r.startswith('PASS') for r in d['results'])} downloads made", flush=True)
    return {k: base64.b64decode(v) for k, v in d['files'].items()}


# ---------------------------------------------------------------- checks
class Missing(Exception):
    pass


def need(tool):
    path = shutil.which(tool)
    if not path:
        raise Missing(tool)
    return path


LEAKS = re.compile(r'\bundefined\b|\bNaN\b|\[object Object\]')


def text_sanity(path, data):
    try:
        t = data.decode('utf-8')
    except UnicodeDecodeError as e:
        return f'not UTF-8: {e}'
    bad = [f'line {i}: {l.strip()[:160]}' for i, l in enumerate(t.splitlines(), 1) if LEAKS.search(l)]
    return '\n'.join(bad)


def chk_terraform(path):
    tf = need('terraform')
    d = path.parent / 'tf'
    d.mkdir(exist_ok=True)
    shutil.copy(path, d / 'main.tf')
    env = dict(os.environ, TF_IN_AUTOMATION='1', CHECKPOINT_DISABLE='1')
    cache = Path(env.setdefault('TF_PLUGIN_CACHE_DIR', str(Path.home() / '.terraform.d/plugin-cache')))
    cache.mkdir(parents=True, exist_ok=True)
    rc, out = run([tf, 'fmt', '-check', '-diff', '-no-color'], cwd=d, env=env)
    if rc:
        return 'terraform fmt: the file is not in canonical format\n' + out
    rc, out = run([tf, 'init', '-backend=false', '-input=false', '-no-color'], cwd=d, env=env)
    if rc:
        return 'terraform init failed\n' + out
    rc, out = run([tf, 'validate', '-no-color'], cwd=d, env=env)
    return '' if rc == 0 else 'terraform validate failed\n' + out


def chk_bicep(path):
    if shutil.which('bicep'):
        rc, out = run(['bicep', 'build', '--stdout', str(path)])
    else:
        rc, out = run([need('az'), 'bicep', 'build', '--stdout', '--file', str(path)])
    if rc:
        return out
    warn = [l for l in out.splitlines() if re.search(r': (Warning|Error) ', l)]
    return '\n'.join(warn)


def chk_cfn(path):
    # cfn-lint exit code is a bit mask: 2 = errors, 4 = warnings, 8 = informational. Only errors fail; warnings such as
    # W3010 (hard-coded availability zones, which the plan names on purpose) are shown but allowed.
    rc, out = run([need('cfn-lint'), '--', str(path)])
    if rc & 4 and not rc & 3:
        print(f'      {path.parent.parent.name}: cfn-lint warnings (allowed): ' + ', '.join(sorted(set(re.findall(r'^(W\d+)', out, re.M)))))
    return '' if not rc & 3 else out


def chk_ps1(path):
    script = ("$e=$null; $t=$null; [void][System.Management.Automation.Language.Parser]::ParseFile($env:PS1_FILE,[ref]$t,[ref]$e); "
              "$e | ForEach-Object { \"line $($_.Extent.StartLineNumber): $($_.Message)\" }; if ($e) { exit 1 }")
    rc, out = run([need('pwsh'), '-NoProfile', '-NonInteractive', '-Command', script], env=dict(os.environ, PS1_FILE=str(path)))
    return '' if rc == 0 else out


def chk_php(path):
    rc, out = run([need('php'), '-l', str(path)])
    return '' if rc == 0 else out


def chk_shell(path):
    rc, out = run(['bash', '-n', str(path)])
    if rc:
        return 'bash -n\n' + out
    rc, out = run([need('shellcheck'), '-S', 'warning', '-f', 'gcc', str(path)])
    return '' if rc == 0 else 'shellcheck\n' + out


def chk_yaml(path):
    try:
        import yaml
    except ImportError:
        raise Missing('PyYAML (pip install pyyaml)')
    try:
        doc = yaml.safe_load(path.read_text(encoding='utf-8'))
    except yaml.YAMLError as e:
        return str(e)
    return '' if isinstance(doc, dict) and doc else 'YAML parsed but is empty or not a mapping'


def chk_json(path):
    try:
        json.loads(path.read_text(encoding='utf-8'))
    except ValueError as e:
        return str(e)
    return ''


def chk_csv(path):
    text = path.read_text(encoding='utf-8-sig')
    try:
        rows = list(csv.reader(io.StringIO(text, newline=''), strict=True))
    except csv.Error as e:
        return str(e)
    if not rows:
        return 'empty'
    bad = [f'row {i}: {len(r)} columns, header has {len(rows[0])}' for i, r in enumerate(rows[1:], 2) if len(r) != len(rows[0])]
    return '\n'.join(bad[:20])


def chk_markdown(path):
    lines = [l for l in path.read_text(encoding='utf-8').splitlines() if l.startswith('|')]
    if not lines:
        return 'no table'
    cells = lambda l: len(re.findall(r'(?<!\\)\|', l))
    bad = [f'{l[:120]}  ({cells(l)} pipes, header has {cells(lines[0])})' for l in lines if cells(l) != cells(lines[0])]
    return '\n'.join(bad[:20])


class TagCheck(html.parser.HTMLParser):
    VOID = {'br', 'meta', 'img', 'col', 'hr', 'input', 'link'}

    def __init__(self):
        super().__init__()
        self.stack, self.errors = [], []

    def handle_starttag(self, tag, attrs):
        if tag not in self.VOID:
            self.stack.append(tag)

    def handle_endtag(self, tag):
        if tag in self.VOID:
            return
        if not self.stack or self.stack[-1] != tag:
            self.errors.append(f'line {self.getpos()[0]}: </{tag}> but open is {self.stack[-1:] or "nothing"}')
        else:
            self.stack.pop()


def chk_html(path):
    p = TagCheck()
    p.feed(path.read_text(encoding='utf-8'))
    p.close()
    if p.stack:
        p.errors.append(f'never closed: {p.stack}')
    return '\n'.join(p.errors[:20])


def chk_xml(path):
    try:
        ET.parse(path)
    except ET.ParseError as e:
        return str(e)
    return ''


def chk_png(path):
    b = path.read_bytes()
    if b[:8] != b'\x89PNG\r\n\x1a\n' or b[12:16] != b'IHDR':
        return 'not a PNG'
    w, h = int.from_bytes(b[16:20], 'big'), int.from_bytes(b[20:24], 'big')
    return '' if w > 0 and h > 0 else f'empty image {w}x{h}'


def chk_xlsx(path):
    try:
        with zipfile.ZipFile(path) as z:
            if z.testzip():
                return 'corrupt zip member'
            for n in z.namelist():
                if n.endswith(('.xml', '.rels')):
                    ET.fromstring(z.read(n))
    except (zipfile.BadZipFile, ET.ParseError) as e:
        return str(e)
    try:
        import openpyxl
    except ImportError:
        return ''
    try:
        import warnings
        with warnings.catch_warnings():
            warnings.simplefilter('ignore')   # "no default style" is fine: Excel applies its own
            wb = openpyxl.load_workbook(path)
        if not any(ws.max_row > 1 for ws in wb.worksheets):
            return 'no data rows'
    except Exception as e:
        return f'openpyxl: {e}'
    return ''


# format id -> (tool label, checker). Formats not listed get the text checks only.
CHECKS = {
    'tf-aws': ('terraform', chk_terraform), 'tf-azure': ('terraform', chk_terraform),
    'tf-gcp': ('terraform', chk_terraform), 'tf-oci': ('terraform', chk_terraform),
    'bicep': ('bicep build', chk_bicep), 'cfn-aws': ('cfn-lint', chk_cfn), 'az-ps': ('pwsh parser', chk_ps1),
    'pfsense': ('php -l', chk_php), 'opnsense': ('bash -n + shellcheck', chk_shell), 'unifi': ('bash -n + shellcheck', chk_shell),
    'ansible': ('YAML', chk_yaml), 'json': ('JSON', chk_json),
    'csv': ('CSV', chk_csv), 'hosts': ('CSV', chk_csv), 'netbox': ('CSV', chk_csv), 'netbox-vlans': ('CSV', chk_csv), 'phpipam': ('CSV', chk_csv),
    'md': ('Markdown table', chk_markdown), 'html': ('HTML tags', chk_html), 'svg': ('XML', chk_xml),
    'png': ('PNG', chk_png), 'xlsx': ('zip + XML', chk_xlsx),
}
BINARY = {'png', 'xlsx'}


def main():
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument('--require-all', action='store_true', help='fail when a checker tool is not installed')
    ap.add_argument('--keep', metavar='DIR', help='write the exported files here and keep them')
    ap.add_argument('--only', metavar='FMT', help='comma-separated formats to check, e.g. tf-oci,bicep')
    a = ap.parse_args()

    print('== exports', flush=True)
    files = export_files()
    only = set(a.only.split(',')) if a.only else None
    out = Path(a.keep).resolve() if a.keep else Path(tempfile.mkdtemp(prefix='ipom-exports-'))
    if a.keep:
        shutil.rmtree(out, ignore_errors=True)
    try:
        for key in sorted(files):
            scenario, fmt, name = key.split('/', 2)
            if only and fmt not in only:
                continue
            path = out / scenario / fmt / name
            path.parent.mkdir(parents=True, exist_ok=True)
            path.write_bytes(files[key])
            label = f'{fmt} ({scenario})'
            if fmt not in BINARY:
                bad = text_sanity(path, files[key])
                if bad:
                    report('FAIL', f'{label}: leaked JavaScript values', bad)
                    continue
            tool, fn = CHECKS.get(fmt, ('text only', None))
            if not fn:
                report('PASS', f'{label}: text checks (no offline checker for this format)')
                continue
            try:
                err = fn(path)
            except Missing as e:
                report('FAIL' if a.require_all else 'SKIP', f'{label}: {tool}', f'{e} is not installed')
                continue
            report('FAIL' if err else 'PASS', f'{label}: {tool}', err)
    finally:
        if not a.keep:
            shutil.rmtree(out, ignore_errors=True)
    n = {s: sum(r[0] == s for r in results) for s in ('PASS', 'FAIL', 'SKIP')}
    print(f"  {n['PASS']} passed, {n['FAIL']} failed" + (f", {n['SKIP']} skipped (tool not installed)" if n['SKIP'] else ''))
    sys.exit(1 if n['FAIL'] else 0)


if __name__ == '__main__':
    main()
