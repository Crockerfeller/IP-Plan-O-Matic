# Tests

Browser tests that load the real `index.html` in a hidden frame, drive it like a user and check the results. `run.sh` builds the site first (`tools/build_site.py`) and tests that, so the build number and update checks are tested as deployed. GitHub Actions runs them on every push and pull request.

| Suite | What it checks |
|---|---|
| `compat.html` | Share links, exports and VLSM output from the original release still load and match exactly (fixtures in `baseline-old.json`). |
| `features.html` | Every feature: base networks, undo, VLSM fill and zones, map, IPv6, saved plans, compact links, keyboard shortcuts, all export formats. |
| `accuracy.html` | Subnet math against Python's `ipaddress`: 400 random IPv4 networks, 60 IPv6 prefixes, 100 route summaries, cloud reserved addresses, 40 random VLSM plans. |
| `mobile.html` | No sideways scrolling at phone width (375px) on any tab. |
| `exports.html` + `check_exports.py` | Builds on-prem, Azure, AWS, Google Cloud and Oracle Cloud plans (with awkward names full of quotes, `$`, `${}` and `<>`), downloads every export format, and checks each file with the tool that would use it: `terraform fmt -check` / `init` / `validate`, `bicep build`, `cfn-lint`, PowerShell's parser, `php -l`, `bash -n` and `shellcheck`, plus parsers for YAML, JSON, CSV, Markdown, HTML, SVG, PNG and Excel. Router configs have no offline checker, so they get text checks only (no `undefined`, `NaN` or `[object Object]`). |

## Run them

```bash
tests/run.sh                 # all suites, headless Chrome
tests/run.sh accuracy        # one suite
```

Needs Python 3 and Google Chrome (`CHROME=/path/to/chrome` to point elsewhere). You can also serve the repo (`python3 -m http.server`) and open `http://localhost:8000/tests/features.html` in a browser to watch a suite run. Served that way the page is a dev build, so the version tests only check the "dev" label.

Check that the committed guides match their generator (CI runs this before the suites):

```bash
python3 tools/build_learn.py --check
```

Check the exports (separate from `run.sh`, because it needs the tools above):

```bash
python3 tests/check_exports.py                # checks whose tool isn't installed are skipped
python3 tests/check_exports.py --require-all  # a missing tool fails (what CI does)
python3 tests/check_exports.py --only tf-oci,bicep --keep /tmp/exports   # some formats; keep the files
```

Terraform downloads each cloud's provider the first time (a few hundred MB, cached in `~/.terraform.d/plugin-cache`).

`python3 tests/make_accuracy_cases.py` regenerates the random cases and their expected answers.
