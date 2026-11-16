#!/usr/bin/env python3
"""Build the deployable site into a folder, stamped with the current commit.

    python3 tools/build_site.py _site                  # what GitHub Actions deploys
    python3 tools/build_site.py _site --include-tests  # what tests/run.sh serves

Copies the site files from the working tree, replaces the build placeholders in index.html and sw.js with the
commit hash and date, writes version.json (what the page polls to spot a newer build) and packs
IP-Plan-O-Matic.zip (what "Check for updates" offers to downloaded copies).
"""
import argparse
import json
import shutil
import subprocess
import sys
import zipfile
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
ZIP_NAME = 'IP-Plan-O-Matic.zip'
# Repo files that are not part of the site.
SKIP_DIRS = ('.github/', '.githooks/', 'tools/', 'tests/')
SKIP_FILES = {'README.md', '.gitignore', '.gitattributes'}
# Site files left out of the download: crawler and search-console files mean nothing in a local copy.
NOT_IN_ZIP = {'robots.txt', 'sitemap.xml', 'google5649ac4e891e9f10.html', 'version.json', ZIP_NAME}
STAMPED = ('index.html', 'sw.js')


def git(*args):
    return subprocess.run(['git', *args], cwd=ROOT, check=True, capture_output=True, text=True).stdout.strip()


def main():
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument('out', help='output folder (emptied first)')
    ap.add_argument('--include-tests', action='store_true', help='also copy tests/ so the suites run against the build')
    a = ap.parse_args()

    sha = git('rev-parse', 'HEAD')
    date = git('log', '-1', '--format=%cs')   # commit date, YYYY-MM-DD
    files = git('ls-files', '--cached', '--others', '--exclude-standard').splitlines()
    files = [f for f in files if (ROOT / f).is_file() and f not in SKIP_FILES
             and (not f.startswith(SKIP_DIRS) or (a.include_tests and f.startswith('tests/')))]

    out = Path(a.out).resolve()
    if out == ROOT or ROOT.is_relative_to(out):
        sys.exit(f'refusing to empty {out}')
    shutil.rmtree(out, ignore_errors=True)
    for f in files:
        dst = out / f
        dst.parent.mkdir(parents=True, exist_ok=True)
        shutil.copy2(ROOT / f, dst)

    for f in STAMPED:
        p = out / f
        text = p.read_text(encoding='utf-8')
        if '%%BUILD_SHA%%' not in text:
            sys.exit(f'{f}: no %%BUILD_SHA%% placeholder to stamp')
        p.write_text(text.replace('%%BUILD_SHA%%', sha).replace('%%BUILD_DATE%%', date), encoding='utf-8')

    (out / 'version.json').write_text(json.dumps({'sha': sha, 'date': date}) + '\n', encoding='utf-8')

    with zipfile.ZipFile(out / ZIP_NAME, 'w', zipfile.ZIP_DEFLATED) as z:
        for f in sorted(files):
            if f not in NOT_IN_ZIP and not f.startswith('tests/'):
                z.write(out / f, f'IP-Plan-O-Matic/{f}')

    print(f'Built {len(files)} files in {out} · build {sha[:7]} · {date}')


if __name__ == '__main__':
    main()
