// Tiny harness: drive the app inside an iframe (same origin) and report results into #out.
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
let F, W, D;
const errors = [];
const dialogs = []; let confirmAnswer = true; const promptAnswers = [];
async function load(url) {
  F = document.getElementById('f');
  await new Promise((res) => { F.onload = res; F.src = 'about:blank'; });
  await new Promise((res) => { F.onload = res; F.src = url; });
  W = F.contentWindow; D = W.document;
  W.confirm = (m) => { dialogs.push(m); return confirmAnswer; }; W.alert = (m) => dialogs.push(m); W.prompt = (m, d) => { dialogs.push(m); return promptAnswers.length ? promptAnswers.shift() : d; };
  W.addEventListener('error', (e) => errors.push(String(e.message)));
  // capture console errors
  const ce = W.console.error.bind(W.console);
  W.console.error = (...a) => { errors.push(a.map(String).join(' ')); ce(...a); };
  await sleep(150);
}
const $ = (id) => D.getElementById(id);
const q = (s) => D.querySelector(s);
const qa = (s) => [...D.querySelectorAll(s)];
function click(el) { if (typeof el === 'string') el = q(el); el.click(); }
function type(el, val) { if (typeof el === 'string') el = q(el); el.focus(); el.value = val; el.dispatchEvent(new W.Event('input', { bubbles: true })); el.dispatchEvent(new W.Event('change', { bubbles: true })); el.blur(); }
function select(el, val) { if (typeof el === 'string') el = q(el); el.value = val; el.dispatchEvent(new W.Event('change', { bubbles: true })); }
function setBase(cidr) { const [n, m] = cidr.split('/'); $('network').value = n; $('mask').value = m; $('netForm').requestSubmit(); }
function divideRow(i) { qa('#body tr')[i].querySelector('.col-divide button').click(); }
function rowCells(tr) {
  return [...tr.children].map((td) => {
    if (td.classList.contains('col-divide')) return td.querySelector('button').textContent.trim();
    const i = td.querySelector('input,select');
    return i ? '[' + i.value + ']' : td.textContent.trim();
  }).join(' | ');
}
function snap() {
  return {
    rows: qa('#body tr').map(rowCells),
    summary: $('summary').textContent,
    warnings: $('warnings').textContent,
    v6: qa('#v6Body tr').map(rowCells),
  };
}
const hash = () => decodeURIComponent(W.location.hash.slice(1));
const results = [];
let failures = 0;
function check(name, cond, extra) { if (!cond) failures++; results.push((cond ? 'PASS ' : 'FAIL ') + name + (extra !== undefined && !cond ? ' :: ' + JSON.stringify(extra) : '')); }
function done(obj) {
  const o = document.getElementById('out');
  o.textContent = JSON.stringify({ failures, results, errors, ...(obj || {}) }, null, 1);
}

// Decode the JSON blob of a plan link (plain base64url, or "~" + deflate-raw compressed).
async function decodeBlob(b) {
  const bytes = (s) => { s = s.replace(/-/g, '+').replace(/_/g, '/'); while (s.length % 4) s += '='; return Uint8Array.from(atob(s), (c) => c.charCodeAt(0)); };
  if (b[0] === '~') {
    const out = await new Response(new Blob([bytes(b.slice(1))]).stream().pipeThrough(new DecompressionStream('deflate-raw'))).arrayBuffer();
    return JSON.parse(new TextDecoder().decode(out));
  }
  return JSON.parse(new TextDecoder().decode(bytes(b)));
}
