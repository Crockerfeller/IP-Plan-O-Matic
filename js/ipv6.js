// IP Plan-O-Matic: The IPv6 tab: prefix planning by nibble, with VLAN, status and notes.
// One of the app's plain scripts (js/*.js): index.html loads them in order and they share one scope, so each can use
// what the ones before it define. Plain scripts, not modules, so a downloaded copy still opens from disk.
'use strict';

// =====================================================================
// IPv6 tab
// =====================================================================
const renderV6 = () => {
  const leaves = v6Walk();
  const total = leaves.length;
  const body = $('v6Body');
  body.innerHTML = '';
  leaves.forEach((lf, idx) => {
    const key = v6Key(lf.a, lf.m);
    const tr = document.createElement('tr');
    const td = (content, cls = '') => {
      const c = document.createElement('td');
      c.className = 'data ' + cls;
      if (typeof content === 'string') c.innerHTML = content; else c.appendChild(content);
      tr.appendChild(c);
      return c;
    };
    const pfx = document.createElement('div');
    pfx.className = 'v6-pfx';
    pfx.style.paddingLeft = (lf.depth * 14) + 'px';
    const s = document.createElement('span');
    s.className = 'mono';
    s.style.fontWeight = '600';
    s.textContent = key;
    pfx.append(s, copyBtn(key));
    if (lf.m % 4 !== 0) { const b = document.createElement('span'); b.className = 'badge'; b.textContent = 'off-nibble'; b.title = 'Not on a 4-bit boundary: harder to read and to delegate reverse DNS'; pfx.append(b); }
    if (lf.m === 64) { const b = document.createElement('span'); b.className = 'badge'; b.textContent = 'LAN'; b.title = 'A /64 is the standard size for one LAN or VLAN'; pfx.append(b); }
    td(pfx);

    const meta = v6Get(key);
    if (meta.s) tr.classList.add('st-' + meta.s);
    if (existing6.some((e) => overlaps6(e.a, e.m, lf.a, lf.m))) tr.classList.add('clash');
    const textIn = (field, cls, placeholder, label) => {
      const inp = document.createElement('input');
      inp.type = 'text'; inp.className = 'cell-input ' + cls; inp.placeholder = placeholder; inp.spellcheck = false;
      inp.value = meta[field] || '';
      inp.setAttribute('aria-label', `${label} for ${key}`);
      inp.addEventListener('focus', () => { delete inp.dataset.cp; });
      return inp;
    };
    const nameIn = textIn('n', '', 'Name', 'Name');
    nameIn.addEventListener('input', () => { firstEdit(nameIn); v6Set(key, 'n', nameIn.value.trim() ? nameIn.value : ''); writeHashSoon(); });
    td(nameIn);
    const vlanIn = textIn('v', 'vlan', '—', 'VLAN ID');
    vlanIn.inputMode = 'numeric';
    vlanIn.addEventListener('input', () => {
      firstEdit(vlanIn);
      const v = vlanIn.value.trim();
      const ok = v === '' || validVlan(v);
      vlanIn.setAttribute('aria-invalid', String(!ok));
      vlanIn.title = ok ? '' : 'VLAN IDs run from 1 to 4094';
      if (ok) { v6Set(key, 'v', v ? String(+v) : ''); writeHashSoon(); }
    });
    td(vlanIn);
    const sel = document.createElement('select');
    sel.className = 'status ' + (meta.s || 'free');
    sel.setAttribute('aria-label', `Status of ${key}`);
    for (const [v, l] of [['free', 'Free'], ['used', 'In use'], ['reserved', 'Reserved']]) {
      const o = document.createElement('option'); o.value = v; o.textContent = l; sel.appendChild(o);
    }
    sel.value = meta.s || 'free';
    sel.addEventListener('change', () => { checkpoint(); v6Set(key, 's', sel.value === 'free' ? '' : sel.value); renderV6(); writeHash(); });
    td(sel);
    const noteIn = textIn('o', 'note', 'Notes', 'Notes');
    noteIn.addEventListener('input', () => { firstEdit(noteIn); v6Set(key, 'o', noteIn.value.trim() ? noteIn.value : ''); writeHashSoon(); });
    td(noteIn);

    td(`${esc(fmt6(lf.a))} – ${esc(fmt6(lf.a + size6(lf.m) - 1n))}`, 'mono');
    td(lf.m <= 64 ? `${pow2Str(64 - lf.m)} × /64` : `${pow2Str(128 - lf.m)} addresses`, 'num mono');

    const btns = document.createElement('div');
    btns.className = 'v6-btns';
    const mk = (label, k, title) => {
      const b = document.createElement('button');
      b.type = 'button'; b.className = 'small'; b.textContent = label; b.title = title;
      const bits = k === 16 ? 4 : 1;
      if (lf.m + bits > 128) { b.disabled = true; b.title = 'Too small to split'; }
      else if (total + k - 1 > MAX6) { b.disabled = true; b.title = `Limit of ${MAX6} rows reached`; }
      else b.addEventListener('click', () => { checkpoint(); lf.node.c = Array.from({ length: k }, () => ({ c: null })); renderV6(); writeHash(); });
      return b;
    };
    btns.append(mk('÷2', 2, `Split into two /${lf.m + 1}s`), mk('÷16', 16, `Split into sixteen /${lf.m + 4}s (next nibble)`));
    td(btns);

    if (lf.parent && lf.idx === 0) {
      const span = leafCount(lf.parent.node);
      const b = document.createElement('button');
      b.type = 'button'; b.className = 'small';
      b.textContent = `Join → /${lf.parent.m}`;
      b.title = `Join ${span} prefixes back into ${v6Key(lf.parent.a, lf.parent.m)}`;
      const hl = (on) => { for (let r = idx; r < idx + span; r++) body.rows[r] && body.rows[r].classList.toggle('hl', on); };
      b.addEventListener('mouseenter', () => hl(true));
      b.addEventListener('mouseleave', () => hl(false));
      b.addEventListener('focus', () => hl(true));
      b.addEventListener('blur', () => hl(false));
      b.addEventListener('click', () => { checkpoint(); lf.parent.node.c = null; renderV6(); writeHash(); toast(`Joined ${span} prefixes into ${v6Key(lf.parent.a, lf.parent.m)}`, UNDO); });
      td(b);
    } else td('');
    body.appendChild(tr);
  });
  const k64 = 64 - v6.mask;
  $('v6Summary').innerHTML =
    `<span>Prefix <b class="mono">${esc(v6Key(v6.net, v6.mask))}</b></span>` +
    `<span>Rows <b>${fmt(total)}</b></span>` +
    `<span>${v6.mask <= 64 ? `/64 networks <b>${pow2Str(k64)}</b>` : `Addresses <b>${pow2Str(128 - v6.mask)}</b>`}</span>` +
    `<span>${classTags6(v6.net, v6.mask)}</span>`;
};

$('v6Form').addEventListener('submit', (e) => {
  e.preventDefault();
  clearMsg('v6Msg');
  const p = parse6Cidr($('v6Net').value);
  if (!p || !/\//.test($('v6Net').value)) {
    $('v6Net').setAttribute('aria-invalid', 'true');
    showMsg('v6Msg', 'Enter an IPv6 prefix with a length, like 2001:db8:1234::/48.', 'error');
    return;
  }
  $('v6Net').removeAttribute('aria-invalid');
  if (p.net !== p.n) showMsg('v6Msg', `Host bits were set, so the prefix was adjusted to ${v6Key(p.net, p.mask)}.`, 'info');
  if (p.mask !== v6.mask && v6.root.c && !confirm('Changing the prefix length resets your IPv6 splits. Continue?')) return;
  checkpoint();
  if (p.mask !== v6.mask) { v6.root = { c: null }; v6.meta = {}; }
  else if (p.net !== v6.net) v6.meta = {};
  v6.net = p.net; v6.mask = p.mask;
  $('v6Net').value = v6Key(v6.net, v6.mask);
  renderV6(); writeHash();
});
$('v6Net').addEventListener('input', () => $('v6Net').removeAttribute('aria-invalid'));
$('v6Ula').addEventListener('click', () => {
  if (v6.root.c && !confirm('Replace the current IPv6 plan with a new random ULA /48?')) return;
  checkpoint();
  const b = crypto.getRandomValues(new Uint8Array(5));
  let g = 0n;
  for (const x of b) g = (g << 8n) | BigInt(x);
  v6.net = (0xfdn << 120n) | (g << 80n);
  v6.mask = 48; v6.root = { c: null }; v6.meta = {};
  $('v6Net').value = v6Key(v6.net, v6.mask);
  showMsg('v6Msg', `Generated ${v6Key(v6.net, v6.mask)}: a random unique local prefix (RFC 4193). Private like 10.0.0.0/8, and very unlikely to clash with anyone else’s.`, 'ok');
  renderV6(); writeHash();
});
$('v6Reset').addEventListener('click', () => { if (!v6.root.c) return; checkpoint(); v6.root = { c: null }; renderV6(); writeHash(); toast('IPv6 plan reset', UNDO); });
$('v6Csv').addEventListener('click', async () => {
  const lines = [['Prefix', 'Name', 'VLAN', 'Status', 'Notes', 'First address', 'Last address', 'Size'].map(csvQ).join(',')];
  for (const lf of v6Walk()) {
    const k = v6Key(lf.a, lf.m), m = v6Get(k);
    lines.push([k, m.n || '', m.v || '', m.s || 'free', m.o || '', fmt6(lf.a), fmt6(lf.a + size6(lf.m) - 1n), lf.m <= 64 ? `${pow2Text(64 - lf.m)} x /64` : `${pow2Text(128 - lf.m)} addresses`].map(csvQ).join(','));
  }
  toast((await copyText(lines.join('\n'))) ? `Copied ${lines.length - 1} rows as CSV` : 'Couldn’t copy CSV');
});

// ---------- IPv6 auto-plan by count ----------
/** The last auto-plan, until it's applied. @type {{ root: TreeNode, placed: any[], mode: string, before: string } | null} */
let v6Plan = null;
const v6Clone = (n) => (n.c ? { c: n.c.map(v6Clone) } : { c: null });
// Split a free leaf down to addr/len (16-way on nibble boundaries when 4+ bits remain, else halves).
// Siblings created along the way are pushed to spill as new free leaves.
/** @type {(node: any, a: bigint, m: number, addr: bigint, len: number, spill: any[]) => any} */
const carve6From = (node, a, m, addr, len, spill) => {
  while (m < len) {
    const bits = m % 4 === 0 && len - m >= 4 ? 4 : 1;
    node.c = Array.from({ length: 1 << bits }, () => ({ c: null }));
    const idx = Number((addr - a) >> BigInt(128 - m - bits));
    node.c.forEach((ch, i) => { if (i !== idx) spill.push({ node: ch, a: a + BigInt(i) * size6(m + bits), m: m + bits }); });
    a += BigInt(idx) * size6(m + bits);
    node = node.c[idx];
    m += bits;
  }
};
const v6PlanDefaults = () => {
  if (!$('v6PlanMode').dataset.touched) $('v6PlanMode').value = Object.keys(v6.meta).length ? 'fill' : 'replace';
};
$('v6PlanMode').addEventListener('change', () => { $('v6PlanMode').dataset.touched = '1'; });
$('v6PlanExample').addEventListener('click', () => {
  $('v6PlanIn').value = 'Sites, /56, 12\nData centers, /52, 2\nInfrastructure, /64, 4';
  if (v6.mask > 48) toast('The example needs a /48 or larger prefix');
});
$('v6PlanRun').addEventListener('click', () => {
  const out = $('v6PlanOut');
  $('v6PlanApply').hidden = true;
  v6Plan = null;
  const errors = [], reqs = [];
  $('v6PlanIn').value.split('\n').forEach((raw, i) => {
    const l = raw.replace(/#.*$/, '').trim();
    if (!l) return;
    const parts = l.split(/\s*[,;\t]\s*/);
    const named = parts.length > 1 && !/^\/?\d{1,3}$/.test(parts[0]);
    const name = named ? parts[0] : '';
    const rest = named ? parts.slice(1) : parts;
    const lm = /^\/?(\d{1,3})$/.exec(rest[0] || '');
    const len = lm ? Number(lm[1]) : NaN;
    const count = rest[1] ? Number(rest[1]) : 1;
    if (!lm || len > 128) { errors.push(`Line ${i + 1}: “${l}” needs a prefix length, like “Sites, /56, 12”.`); return; }
    if (len < v6.mask) { errors.push(`Line ${i + 1}: a /${len} is bigger than ${v6Key(v6.net, v6.mask)}.`); return; }
    if (!Number.isInteger(count) || count < 1 || count > MAX6) { errors.push(`Line ${i + 1}: the count must be a whole number from 1 to ${MAX6}.`); return; }
    for (let k = 1; k <= count && reqs.length <= MAX6; k++) reqs.push({ name: (name || `/${len}`) + (count > 1 ? ` ${k}` : ''), len, idx: reqs.length });
  });
  if (!reqs.length) { out.innerHTML = `<div class="msg show error">${esc(errors[0] || 'Add at least one line, like “Sites, /56, 12”.')}</div>`; return; }
  if (reqs.length > MAX6) { out.innerHTML = `<div class="msg show error">That asks for more than ${MAX6} prefixes.</div>`; return; }
  const mode = $('v6PlanMode').value;
  const root = mode === 'fill' ? v6Clone(v6.root) : { c: null };
  let free = [];
  const walk = (n, a, m) => {
    if (n.c) { const bits = n.c.length === 16 ? 4 : 1; n.c.forEach((ch, i) => walk(ch, a + BigInt(i) * size6(m + bits), m + bits)); }
    else if (mode !== 'fill' || !Object.keys(v6Get(v6Key(a, m))).length) free.push({ node: n, a, m });
  };
  walk(root, v6.net, v6.mask);
  const sorted = [...reqs].sort((x, y) => x.len - y.len || x.idx - y.idx);
  for (const r of sorted) {
    let bi = -1;
    free.forEach((f, i) => {
      if (f.m > r.len) return;
      const b = free[bi];
      if (bi < 0 || f.m > b.m || (f.m === b.m && f.a < b.a)) bi = i;
    });
    if (bi < 0) { r.a = null; continue; }
    const f = free[bi];
    free.splice(bi, 1);
    r.a = f.a;
    carve6From(f.node, f.a, f.m, f.a, r.len, free);
  }
  const placed = sorted.filter((r) => r.a !== null), failed = sorted.filter((r) => r.a === null);
  const rowsAfter = leafCount(root);
  if (rowsAfter > MAX6) {
    out.innerHTML = `<div class="msg show error">This plan would need ${fmt(rowsAfter)} rows, over the limit of ${MAX6}. Use fewer or larger prefixes.</div>`;
    return;
  }
  let html = '';
  if (errors.length) html += `<div class="msg show error">${errors.map(esc).join('<br>')}</div>`;
  if (failed.length) {
    const g = {};
    for (const r of failed) g[r.len] = (g[r.len] || 0) + 1;
    html += `<div class="msg show error">Doesn’t fit: ${Object.entries(g).map(([len, n]) => `${n} × /${len}`).join(', ')}. Use a larger prefix${mode === 'fill' ? ', free up space or switch to Replace the plan' : ''}.</div>`;
  }
  if (placed.length) {
    html += `<div class="stat-line">Places <b>${placed.length}</b> prefix${placed.length > 1 ? 'es' : ''} in ${esc(v6Key(v6.net, v6.mask))}${mode === 'fill' ? ', keeping existing ones' : ''}. The plan will have ${fmt(rowsAfter)} rows.</div>`;
    html += '<div class="table-wrap"><table><thead><tr><th>Name</th><th>Prefix</th><th class="num">Size</th></tr></thead><tbody>';
    for (const r of placed.slice(0, 500)) {
      html += `<tr><td>${esc(r.name)}</td><td class="mono"><b>${esc(v6Key(r.a, r.len))}</b></td><td class="num mono">${r.len <= 64 ? `${pow2Str(64 - r.len)} × /64` : `${pow2Str(128 - r.len)} addresses`}</td></tr>`;
    }
    html += '</tbody></table></div>';
    if (placed.length > 500) html += `<div class="stat-line">…and ${fmt(placed.length - 500)} more.</div>`;
    v6Plan = { root, placed, mode, before: stateHash() };
  }
  out.innerHTML = html;
  $('v6PlanApply').hidden = !v6Plan;
});
$('v6PlanApply').addEventListener('click', () => {
  const plan = v6Plan;
  if (!plan) return;
  if (stateHash() !== plan.before) {
    $('v6PlanOut').insertAdjacentHTML('afterbegin', '<div class="msg show error">The IPv6 plan changed since this was calculated. Click Plan it again.</div>');
    $('v6PlanApply').hidden = true;
    v6Plan = null;
    return;
  }
  if (plan.mode === 'replace' && (v6.root.c || Object.keys(v6.meta).length) && !confirm(`Replace the current IPv6 plan for ${v6Key(v6.net, v6.mask)}?`)) return;
  checkpoint();
  v6.root = plan.root;
  if (plan.mode === 'replace') v6.meta = {};
  for (const r of plan.placed) {
    const k = v6Key(r.a, r.len);
    v6Set(k, 'n', r.name);
    v6Set(k, 's', 'used');
  }
  v6Plan = null;
  $('v6PlanApply').hidden = true;
  $('v6PlanOut').innerHTML = '';
  renderV6();
  writeHash();
  toast(`Applied ${plan.placed.length} IPv6 prefixes`, UNDO);
});
