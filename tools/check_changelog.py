#!/usr/bin/env python3
"""Remind: a change people can see should come with a line in CHANGELOG.md.

    python3 tools/check_changelog.py BASE HEAD     # what CI runs for the pushed or pull-request commits
    python3 tools/check_changelog.py               # this branch against main

Fails when the commits in BASE..HEAD change the app (index.html, js/, app.css) or the guides (learn/) but not
CHANGELOG.md. A refactor or a fix nobody would notice can skip it: put [no changelog] in any of the commit messages.
"""
import subprocess
import sys

VISIBLE = ('index.html', 'js/', 'app.css', 'learn/')
SKIP = '[no changelog]'


def git(*args):
    return subprocess.run(['git', *args], check=True, capture_output=True, text=True).stdout


def main():
    base, head = (sys.argv[1:3] if len(sys.argv) >= 3 else ('main', 'HEAD'))
    if set(base) <= {'0'}:   # a new branch: GitHub sends 000… as the commit before it
        print('changelog: no earlier commit to compare with; skipped')
        return 0
    try:
        changed = git('diff', '--name-only', f'{base}...{head}').split()
        messages = git('log', '--format=%B', f'{base}..{head}')
    except subprocess.CalledProcessError as e:
        print(f'changelog: could not compare {base}..{head} ({e.stderr.strip()}); skipped')
        return 0
    visible = [f for f in changed if f.startswith(VISIBLE)]
    if not visible:
        print('changelog: nothing people can see changed')
        return 0
    if 'CHANGELOG.md' in changed:
        print('changelog: updated')
        return 0
    if SKIP in messages:
        print(f'changelog: skipped by {SKIP} in a commit message')
        return 0
    print(f'changelog: {", ".join(visible[:6])}{" …" if len(visible) > 6 else ""} changed, but CHANGELOG.md didn\'t.\n'
          f'  Add a line under today\'s date in CHANGELOG.md, or put {SKIP} in a commit message if people won\'t notice.')
    return 1


if __name__ == '__main__':
    sys.exit(main())
