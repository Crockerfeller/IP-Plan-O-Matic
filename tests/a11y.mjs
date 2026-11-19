// Accessibility checks with axe-core (WCAG 2.2 A and AA rules), in light and dark themes.
// Scans every tab of the app and its dialogs with a real plan loaded, plus a sample of the guides.
//
//   npm run test:a11y                 # WebKit (Safari's engine)
//   npm run test:a11y -- firefox      # or chromium / firefox
//
// Needs `npm install` and `npx playwright install webkit` once, and python3 for the build and server.
import { spawn, execFileSync } from 'node:child_process';
import { mkdtempSync, rmSync } from 'node:fs';
import { createServer } from 'node:net';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium, firefox, webkit } from 'playwright';
import AxeBuilder from '@axe-core/playwright';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const ENGINES = { chromium, firefox, webkit };
const engine = process.argv.slice(2).find((a) => a in ENGINES) || 'webkit';
const TAGS = ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa'];
const GUIDES = ['learn/', 'learn/cidr-cheat-sheet.html', 'learn/slash-24-subnet.html', 'learn/subnetting-practice.html'];

const freePort = () => new Promise((res) => { const s = createServer().listen(0, '127.0.0.1', () => { const { port } = s.address(); s.close(() => res(port)); }); });
const site = mkdtempSync(join(tmpdir(), 'ipom-a11y-'));
execFileSync('python3', [join(ROOT, 'tools/build_site.py'), site], { stdio: ['ignore', 'ignore', 'inherit'] });
const port = await freePort();
const server = spawn('python3', ['-m', 'http.server', String(port), '--bind', '127.0.0.1', '--directory', site], { stdio: 'ignore' });
const cleanup = () => { server.kill(); rmSync(site, { recursive: true, force: true }); };
await new Promise((r) => setTimeout(r, 800));
const BASE = `http://127.0.0.1:${port}/`;

// Anything the Content Security Policy blocks on these pages is a failure too.
const cspBlocks = new Set();
const problems = new Map();   // rule id -> { impact, help, url, where: Set, nodes: [] }
let scans = 0;
async function scan(page, where, include) {
  let b = new AxeBuilder({ page }).withTags(TAGS);
  if (include) b = b.include(include);
  const r = await b.analyze();
  scans++;
  for (const v of r.violations) {
    const p = problems.get(v.id) || { impact: v.impact, help: v.help, url: v.helpUrl, where: new Set(), nodes: new Map() };
    p.where.add(where);
    for (const n of v.nodes) if (!p.nodes.has(n.target.join(' '))) p.nodes.set(n.target.join(' '), (n.failureSummary || '').split('\n').slice(1, 2).join('').trim());
    problems.set(v.id, p);
  }
}
const settle = (page) => page.waitForTimeout(150);

let fatal = null;
try {
  const browser = await ENGINES[engine].launch();
  for (const theme of ['light', 'dark']) {
    const context = await browser.newContext({ colorScheme: theme, viewport: { width: 1400, height: 1000 } });
    const page = await context.newPage();
    page.on('console', (m) => { if (/Content.Security.Policy/i.test(m.text())) cspBlocks.add(`${theme}: ${m.text()}`); });
    // The app: a /22 split a few times, named, with a VLAN, so the table, map and bars all render.
    await page.goto(BASE + 'index.html#10.0.0.0/22');
    for (let i = 0; i < 3; i++) await page.locator('#body tr .col-divide button').first().click();
    await page.locator('#body tr input').first().fill('Servers');
    await page.locator('#body tr input').first().press('Tab');
    await settle(page);
    for (const tab of ['plan', 'vlsm', 'tools', 'export', 'v6', 'learn']) {
      await page.click(`#tb-${tab}`);
      if (tab === 'vlsm') { await page.fill('#vlsmIn', 'Users, 100\nPhones, 40'); await page.click('#vlsmRun'); }
      if (tab === 'export') await page.selectOption('#exFmt', 'cisco').catch(() => page.evaluate(() => { const s = document.getElementById('exFmt'); s.value = 'cisco'; s.dispatchEvent(new Event('change', { bubbles: true })); }));
      await settle(page);
      await scan(page, `${theme}: ${tab} tab`);
    }
    await page.click('#tb-plan');
    // Dialogs: open each, scan just the dialog, close it.
    const dialog = async (name, open) => {
      await open();
      await settle(page);
      const id = await page.evaluate(() => (document.querySelector('dialog[open]') || {}).id);
      if (!id) { console.log(`  note: couldn't open the ${name} dialog`); return; }
      await scan(page, `${theme}: ${name} dialog`, `#${id}`);
      await page.evaluate(() => document.querySelectorAll('dialog[open]').forEach((d) => d.close()));
    };
    await dialog('keyboard shortcuts', () => page.click('#keysBtn'));
    await dialog('saved plans', () => page.click('#plansBtn'));
    await dialog('IP addresses', () => page.locator('#body tr .hosts-btn').first().click());
    await dialog('on-prem wizard', () => page.click('#tplBtn'));
    await page.selectOption('#platform', 'azure');
    await dialog('Azure wizard', () => page.click('#tplBtn'));
    await context.close();

    // A sample of the guides.
    const gctx = await browser.newContext({ colorScheme: theme });
    const gp = await gctx.newPage();
    gp.on('console', (m) => { if (/Content.Security.Policy/i.test(m.text())) cspBlocks.add(`${theme} guide: ${m.text()}`); });
    for (const g of GUIDES) { await gp.goto(BASE + g); await settle(gp); await scan(gp, `${theme}: ${g}`); }
    await gctx.close();
  }
  await browser.close();
} catch (e) {
  fatal = e;
} finally {
  cleanup();
}
if (fatal) { console.log(`  COULD NOT RUN: ${String(fatal.message).split('\n')[0]}`); process.exit(2); }

console.log(`== accessibility (${engine}): ${scans} scans`);
const order = { critical: 0, serious: 1, moderate: 2, minor: 3 };
for (const [id, p] of [...problems].sort((a, b) => order[a[1].impact] - order[b[1].impact])) {
  console.log(`  FAIL ${p.impact} ${id}: ${p.help}  (${p.url})`);
  console.log(`    on: ${[...p.where].join('; ')}`);
  const max = process.env.A11Y_ALL ? Infinity : 8;
  for (const [t, why] of [...p.nodes].slice(0, max)) console.log(`    ${t}${why ? '  — ' + why : ''}`);
  if (p.nodes.size > max) console.log(`    …and ${p.nodes.size - max} more (A11Y_ALL=1 lists them all)`);
}
console.log(problems.size ? `  ${problems.size} rules failed` : '  no violations');
for (const c of cspBlocks) console.log('  FAIL CSP ' + c.slice(0, 400));
process.exit(problems.size || cspBlocks.size ? 1 : 0);
