# Tests

Browser tests that load the real `index.html` in a hidden frame, drive it like a user and check the results.

| Suite | What it checks |
|---|---|
| `compat.html` | Share links, exports and VLSM output from the original release still load and match exactly (fixtures in `baseline-old.json`). |
| `features.html` | Every feature: base networks, undo, VLSM fill and zones, map, IPv6, saved plans, compact links, keyboard shortcuts, all export formats. |
| `accuracy.html` | Subnet math against Python's `ipaddress`: 400 random IPv4 networks, 60 IPv6 prefixes, 100 route summaries, cloud reserved addresses, 40 random VLSM plans. |
| `mobile.html` | No sideways scrolling at phone width (375px) on any tab. |

## Run them

```bash
tests/run.sh                 # all suites, headless Chrome
tests/run.sh accuracy        # one suite
```

Needs Python 3 and Google Chrome (`CHROME=/path/to/chrome` to point elsewhere). You can also serve the repo (`python3 -m http.server`) and open `http://localhost:8000/tests/features.html` in a browser to watch a suite run.

`python3 tests/make_accuracy_cases.py` regenerates the random cases and their expected answers.
