#!/bin/bash
# Run the browser test suites headlessly with Google Chrome and print the results.
# The suites run against the built site (tools/build_site.py), so they test the stamped files that get deployed.
# Usage: tests/run.sh [suite ...]   (default: compat features accuracy mobile)
# Needs python3 and Google Chrome (set CHROME=/path/to/chrome to override).
set -u
cd "$(dirname "$0")/.." || exit 2
CHROME="${CHROME:-/Applications/Google Chrome.app/Contents/MacOS/Google Chrome}"
[ -x "$CHROME" ] || CHROME="$(command -v google-chrome || command -v chromium || true)"
[ -n "$CHROME" ] || { echo "Google Chrome not found; set CHROME=/path/to/chrome"; exit 2; }
PORT="${PORT:-8799}"
SITE="$(mktemp -d)"
python3 tools/build_site.py "$SITE" --include-tests || exit 2
python3 -m http.server "$PORT" --directory "$SITE" >/dev/null 2>&1 &
SERVER=$!
PROFILE=""
trap 'kill $SERVER 2>/dev/null; wait $SERVER 2>/dev/null; [ -n "$PROFILE" ] && rm -rf "$PROFILE"; rm -rf "$SITE"' EXIT
sleep 1
SUITES=("$@"); [ ${#SUITES[@]} -eq 0 ] && SUITES=(compat features accuracy mobile)
FAILED=0
for s in "${SUITES[@]}"; do
  # A page that never finishes (now and then the little test server drops a connection) gets one more try with a
  # fresh profile; a suite that fails or hangs every time still fails.
  for TRY in 1 2; do
    PROFILE="$(mktemp -d)"
    OUT="$("$CHROME" --headless=new --disable-gpu --no-first-run --user-data-dir="$PROFILE" --virtual-time-budget=120000 --dump-dom "http://localhost:$PORT/tests/$s.html" 2>/dev/null)"
    rm -rf "$PROFILE"
    RES="$(printf '%s' "$OUT" | python3 tests/report.py)"
    STATUS=$?
    case "$RES" in *"NO RESULT"*) [ "$TRY" = 1 ] && echo "== $s: the page didn't finish; trying once more" && continue ;; esac
    break
  done
  echo "== $s"; echo "$RES"
  [ "$STATUS" -ne 0 ] && FAILED=1
done
exit $FAILED
