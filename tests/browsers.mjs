// Run the browser test suites in Safari's engine (WebKit) and Firefox with Playwright.
// tests/run.sh covers Chrome; this runs the same pages, against the same built site, in the other two engines.
//
//   npm run test:browsers                         # all suites in webkit and firefox
//   npm run test:browsers -- webkit features      # pick browsers and/or suites
//
// Needs `npm install` and `npx playwright install webkit firefox` once, and python3 for the build and server.
import { spawn, execFileSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { createServer } from 'node:net';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { webkit, firefox } from 'playwright';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const BROWSERS = { webkit, firefox };
const SUITES = ['compat', 'features', 'accuracy', 'mobile'];
const args = process.argv.slice(2);
const browsers = args.filter((a) => a in BROWSERS);
const suites = args.filter((a) => SUITES.includes(a));
const bad = args.filter((a) => !(a in BROWSERS) && !SUITES.includes(a));
if (bad.length) { console.error(`Unknown: ${bad.join(', ')}. Browsers: ${Object.keys(BROWSERS).join(', ')}. Suites: ${SUITES.join(', ')}.`); process.exit(2); }

// CI runs this in mcr.microsoft.com/playwright:vX.Y.Z, whose browsers only work with that playwright version.
const pwVersion = JSON.parse(readFileSync(join(ROOT, 'node_modules/playwright/package.json'), 'utf8')).version;
const image = /mcr\.microsoft\.com\/playwright:v([\d.]+)/.exec(readFileSync(join(ROOT, '.github/workflows/deploy.yml'), 'utf8'));
if (image && image[1] !== pwVersion) {
  console.error(`playwright is ${pwVersion} but .github/workflows/deploy.yml uses the playwright:v${image[1]} image. Change the image tag to v${pwVersion}.`);
  process.exit(2);
}

const freePort = () => new Promise((res) => { const s = createServer().listen(0, '127.0.0.1', () => { const { port } = s.address(); s.close(() => res(port)); }); });

const site = mkdtempSync(join(tmpdir(), 'ipom-site-'));
execFileSync('python3', [join(ROOT, 'tools/build_site.py'), site, '--include-tests'], { stdio: ['ignore', 'ignore', 'inherit'] });
const port = await freePort();
const server = spawn('python3', ['-m', 'http.server', String(port), '--bind', '127.0.0.1', '--directory', site], { stdio: 'ignore' });
const cleanup = () => { server.kill(); rmSync(site, { recursive: true, force: true }); };
process.on('SIGINT', () => { cleanup(); process.exit(130); });
await new Promise((r) => setTimeout(r, 800));

let failed = false;
try {
  for (const name of browsers.length ? browsers : Object.keys(BROWSERS)) {
    let browser;
    try { browser = await BROWSERS[name].launch(); } catch (e) {
      console.log(`== ${name}\n  COULD NOT START: ${String(e.message).split('\n')[0]}\n  (run: npx playwright install ${name})`);
      failed = true;
      continue;
    }
    for (const suite of suites.length ? suites : SUITES) {
      // A fresh context per suite, like run.sh's fresh Chrome profile: no storage carried over.
      const context = await browser.newContext({ viewport: { width: 1500, height: 1000 } });
      const page = await context.newPage();
      // Anything the Content Security Policy blocks is a failure, except the tests' own probe (T.csp), whose URL says cspProbe.
      const csp = [];
      page.on('console', (m) => { if (/Content.Security.Policy/i.test(m.text()) && !/cspProbe/.test(m.text())) csp.push(m.text()); });
      console.log(`== ${name} ${suite}`);
      let d;
      try {
        await page.goto(`http://127.0.0.1:${port}/tests/${suite}.html`);
        await page.waitForFunction(() => document.getElementById('out').textContent !== 'running', null, { timeout: 600000, polling: 500 });
        d = JSON.parse(await page.locator('#out').textContent());
      } catch (e) {
        console.log(`  NO RESULT: ${String(e.message).split('\n')[0]}`);
        failed = true;
        await context.close();
        continue;
      }
      for (const r of d.results) if (!r.startsWith('PASS')) console.log('  ' + r.slice(0, 600));
      for (const e of d.errors) console.log('  ERROR ' + e.slice(0, 600));
      for (const e of csp) console.log('  CSP ' + e.slice(0, 600));
      const passed = d.results.filter((r) => r.startsWith('PASS')).length;
      console.log(`  ${passed} passed, ${d.failures} failed${d.errors.length ? `, ${d.errors.length} page errors` : ''}`);
      if (d.failures || d.errors.length || csp.length) failed = true;
      await context.close();
    }
    // Numbers on screen follow the visitor's locale; the files the app writes stay in US format.
    if (!suites.length) {
      const context = await browser.newContext({ locale: 'de-DE', viewport: { width: 1500, height: 1000 } });
      const page = await context.newPage();
      console.log(`== ${name} locale`);
      await page.goto(`http://127.0.0.1:${port}/index.html#10.0.0.0/22`);
      await page.waitForFunction(() => document.documentElement.dataset.ready === '1');
      const summary = await page.locator('#summary').textContent();
      await page.click('#tb-export');
      await page.evaluate(() => { const s = document.getElementById('exFmt'); s.value = 'md'; s.dispatchEvent(new Event('change', { bubbles: true })); });
      const md = await page.locator('#exOut').inputValue();
      const checks = [['on screen: 1.024 addresses for a German visitor', /1\.024/.test(summary || '')], ['in the Markdown file: 1,022 hosts', /1,022/.test(md) && !/1\.022/.test(md)]];
      for (const [what, ok] of checks) { console.log(`  ${ok ? 'PASS' : 'FAIL'} ${what}`); if (!ok) failed = true; }
      await context.close();
    }
    await browser.close();
  }
} finally {
  cleanup();
}
process.exit(failed ? 1 : 0);
