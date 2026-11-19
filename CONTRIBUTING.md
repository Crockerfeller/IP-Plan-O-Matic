# Working on IP Plan-O-Matic

Everything you need to change the app, test it and ship it. The code is MIT licensed ([LICENSE](LICENSE)); if you
publish your own version, please give it a different name.

## How it's put together

There's no framework and no build step. The site is:

| Path | What it is |
|---|---|
| `index.html` | The page: every tab and dialog's markup. |
| `app.css` | All the styles, with light and dark color tokens at the top. |
| `js/*.js` | The app, one file per area, loaded in order by `index.html`. |
| `sw.js` | The service worker that makes it work offline. |
| `learn/` | The subnetting guides, **generated** by `tools/build_learn.py` (don't edit them by hand). |
| `fonts/` | The self-hosted fonts and their licenses. |

The files in `js/` are plain scripts, not ES modules, so a downloaded copy works opened straight from disk. They share
one scope: a top-level name in one file can be used by the files after it. In load order:

| File | Area |
|---|---|
| `core.js` | IPv4 and IPv6 math, cloud platform rules, the plan state and its trees, DOM helpers, the plan in the URL |
| `plan.js` | The Plan tab: subnet table, join bars, network cards, address map, keyboard shortcuts |
| `vlsm.js` | The VLSM tab |
| `networks.js` | Wizards: cloud templates, on-prem sites, peering, adding and splitting networks |
| `tools.js` | The Tools tab |
| `export-formats.js` | Every export format, one `gen…` function each |
| `export.js` | The Export tab: format menu, preview, Copy and Download |
| `visualize.js` | The Visualize tab: the network diagram, and its PNG, SVG, PowerPoint and Visio files |
| `import.js` | Import from cloud CLI JSON, CSV and address lists |
| `hosts.js` | IP assignments inside a subnet |
| `compare.js` | Compare plans |
| `ipv6.js` | The IPv6 tab |
| `main.js` | Saved plans and backups, tabs, theme, build number and updates, start-up. Always last. |

A new file goes in `index.html` (a `<script>` tag with `?v=%%BUILD_SHA%%`, in load order) and in `sw.js`'s `SHELL`
list with the same URL. `T.assets` in `tests/features.html` fails if the two disagree.

## Run it

```bash
python3 -m http.server      # then open http://localhost:8000/
```

Opening `index.html` from disk works too, without offline support. A copy run from the repo shows "dev" instead of a
build number.

## Check it

```bash
npm install                                  # once: ESLint, TypeScript, Playwright, axe-core (dev tools only)
npx playwright install webkit firefox        # once

npm run lint                                 # ESLint, plus a check for unused names across js/
npm run typecheck                            # TypeScript over js/, with strict null checks (nothing is compiled)
tests/run.sh                                 # every browser suite in headless Chrome
npm run test:browsers                        # the same suites in WebKit (Safari) and Firefox
npm run test:a11y                            # accessibility, WCAG 2.2 AA, light and dark
python3 tests/check_exports.py               # every export through its real tool (terraform, bicep, cfn-lint…)
python3 tools/build_learn.py --check         # the guides match their generator
```

[`tests/README.md`](tests/README.md) explains each suite. CI runs all of these on every push and pull request, and
deploys only when everything passes.

## Add an export format

1. **Generate it:** add a `genSomething(list)` function in `js/export-formats.js` that returns the file's text.
   `list` holds the subnets the Include setting picks, each with its name, VLAN, status and host range. Escape
   anything from the plan for the target syntax: names can contain quotes, `$`, backticks and `<>`.
2. **Offer it:** in `js/export.js`, add it to `FMT_MENU` (the menu), `EXT` (the file extension), `MIME` if it isn't
   plain text, and the `gen` table in `renderExport`.
3. **Test it:** add it to a scenario in `tests/exports.html`, and give it a checker in `CHECKS` in
   `tests/check_exports.py` (the tool that would read the file, or a parser). `tests/features.html` has format tests too.

## Ship it

- Work on a branch, and open a pull request: CI tests it without deploying.
- Add a line to [`CHANGELOG.md`](CHANGELOG.md) under today's date for anything people will notice. CI fails a change
  to the app or the guides without one; put `[no changelog]` in a commit message for refactors and invisible fixes.
- Changing the guides means editing `tools/build_learn.py` and running `python3 tools/build_learn.py`, then committing
  the regenerated pages.
- A push to `main` deploys to GitHub Pages once every check passes.

Found a problem or have an idea? [Open an issue](https://github.com/Crockerfeller/IP-Plan-O-Matic/issues/new/choose).
