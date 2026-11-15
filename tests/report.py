"""Read Chrome's --dump-dom output on stdin and print one suite's results. Exit 1 on any failure."""
import html
import json
import re
import sys

m = re.search(r'<pre id="out">(.*?)</pre>', sys.stdin.read(), re.S)
try:
    d = json.loads(html.unescape(m.group(1)))
except Exception:
    print('  NO RESULT (the page did not finish; try again or raise --virtual-time-budget)')
    sys.exit(1)
for r in d['results']:
    print('  ' + r[:400])
for e in d['errors']:
    print('  ERROR ' + e[:400])
passed = sum(r.startswith('PASS') for r in d['results'])
print('  %d passed, %d failed' % (passed, d['failures']))
sys.exit(1 if d['failures'] or d['errors'] else 0)
