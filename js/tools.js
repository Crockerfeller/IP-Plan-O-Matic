// IP Plan-O-Matic: The Tools tab: overlap check, route summary, address lookup and the IPv4 and IPv6 calculators.
// One of the app's plain scripts (js/*.js): index.html loads them in order and they share one scope, so each can use
// what the ones before it define. Plain scripts, not modules, so a downloaded copy still opens from disk.
'use strict';

// =====================================================================
// Tools tab
// =====================================================================
$('ovRun').addEventListener('click', () => {
  const out = $('ovOut');
  const raw = $('ovIn').value.split('\n');
  const lines = raw.filter((l) => !isV6Text(l)).map(parseLine).filter(Boolean);
  const lines6 = raw.filter((l) => isV6Text(l)).map(parseLine6).filter(Boolean);
  const bad = [...lines, ...lines6].filter((l) => l.error);
  const list = lines.filter((l) => !l.error);
  const list6 = lines6.filter((l) => !l.error);
  existing = list;
  existing6 = list6;
  update();
  renderV6();
  const html6 = ovHtml6(list6);
  if (!list.length) {
    out.innerHTML = list6.length
      ? (bad.length ? `<div class="msg show error">Couldn’t read: ${bad.map((b) => esc(b.raw)).join(', ')}</div>` : '') + html6
      : '<div class="msg show error">No networks found. Use one per line, like “10.0.0.0/16 HQ” or “2001:db8::/48 Branch”.</div>';
    return;
  }

  let html = '';
  if (bad.length) html += `<div class="msg show error">Couldn’t read: ${bad.map((b) => esc(b.raw)).join(', ')}</div>`;
  let clashCount = 0;
  html += '<div class="table-wrap"><table><thead><tr><th>Existing network</th><th>Label</th><th>Against your plan</th></tr></thead><tbody>';
  const planRows = allRows();
  const planName = state.blocks.map(blockCidr).join(', ');
  for (const e of list) {
    const hits = planRows.filter((r) => overlaps(e.addr, e.mask, r.addr, r.mask));
    let res;
    if (!hits.length) res = '<span class="tag ok">No overlap</span>';
    else {
      clashCount++;
      const shown = hits.slice(0, 6).map((r) => {
        const rel = relation(e.addr, e.mask, r.addr, r.mask);
        const n = getMeta(r.key).n;
        return `${rel ? esc(rel) + ' ' : ''}<b class="mono">${r.key}</b>${n ? ` (${esc(n)})` : ''}`;
      });
      res = `<span class="tag danger">Overlaps ${fmt(hits.length)}</span> ${shown.join(', ')}${hits.length > 6 ? `, +${fmt(hits.length - 6)} more` : ''}`;
    }
    const fix = e.aligned ? '' : ` <span class="tag muted" title="Host bits were set in ${esc(e.raw)}">from ${esc(ntoa(e.ip))}</span>`;
    html += `<tr><td class="mono"><b>${e.cidr}</b>${fix}</td><td>${esc(e.label || '—')}</td><td style="white-space:normal">${res}</td></tr>`;
  }
  html += '</tbody></table></div>';
  const pairs = [];
  for (let i = 0; i < list.length; i++) for (let j = i + 1; j < list.length; j++) {
    const a = list[i], b = list[j];
    if (overlaps(a.addr, a.mask, b.addr, b.mask)) {
      pairs.push(`<b class="mono">${a.cidr}</b>${a.label ? ` (${esc(a.label)})` : ''} ${esc(relation(a.addr, a.mask, b.addr, b.mask) || 'overlaps')} <b class="mono">${b.cidr}</b>${b.label ? ` (${esc(b.label)})` : ''}`);
    }
  }
  html += pairs.length
    ? `<div><span class="lbl">Overlaps among the existing networks</span><ul>${pairs.map((p) => `<li>${p}</li>`).join('')}</ul></div>`
    : '<div class="stat-line">No overlaps among the existing networks.</div>';
  html = `<div class="msg show ${clashCount ? 'error' : 'ok'}">${clashCount ? `${fmt(clashCount)} of ${fmt(list.length)} existing networks clash with ${esc(planName)}.` : `None of the ${fmt(list.length)} networks clash with ${esc(planName)}.`}</div>` + html;
  out.innerHTML = html + html6;
});
// IPv6 part of the overlap checker: against the IPv6 plan and among the pasted prefixes.
const ovHtml6 = (list6) => {
  if (!list6.length) return '';
  const leaves = v6Walk();
  const planName = v6Key(v6.net, v6.mask);
  let clash = 0;
  let html = '<div class="table-wrap"><table><thead><tr><th>Existing IPv6 prefix</th><th>Label</th><th>Against your IPv6 plan</th></tr></thead><tbody>';
  for (const e of list6) {
    const hits = leaves.filter((lf) => overlaps6(e.a, e.m, lf.a, lf.m));
    let res;
    if (!hits.length) res = '<span class="tag ok">No overlap</span>';
    else {
      clash++;
      const shown = hits.slice(0, 6).map((lf) => {
        const k = v6Key(lf.a, lf.m), rel = relation6(e.a, e.m, lf.a, lf.m), n = v6Get(k).n;
        return `${rel ? esc(rel) + ' ' : ''}<b class="mono">${esc(k)}</b>${n ? ` (${esc(n)})` : ''}`;
      });
      res = `<span class="tag danger">Overlaps ${fmt(hits.length)}</span> ${shown.join(', ')}${hits.length > 6 ? `, +${fmt(hits.length - 6)} more` : ''}`;
    }
    const fix = e.aligned ? '' : ' <span class="tag muted" title="Host bits were set">adjusted</span>';
    html += `<tr><td class="mono"><b>${esc(e.cidr)}</b>${fix}</td><td>${esc(e.label || '—')}</td><td style="white-space:normal">${res}</td></tr>`;
  }
  html += '</tbody></table></div>';
  const pairs = [];
  for (let i = 0; i < list6.length; i++) for (let j = i + 1; j < list6.length; j++) {
    const a = list6[i], b = list6[j];
    if (overlaps6(a.a, a.m, b.a, b.m)) pairs.push(`<b class="mono">${esc(a.cidr)}</b>${a.label ? ` (${esc(a.label)})` : ''} ${esc(relation6(a.a, a.m, b.a, b.m) || 'overlaps')} <b class="mono">${esc(b.cidr)}</b>${b.label ? ` (${esc(b.label)})` : ''}`);
  }
  html += pairs.length
    ? `<div><span class="lbl">Overlaps among the existing IPv6 prefixes</span><ul>${pairs.map((x) => `<li>${x}</li>`).join('')}</ul></div>`
    : '<div class="stat-line">No overlaps among the existing IPv6 prefixes.</div>';
  return `<div class="msg show ${clash ? 'error' : 'ok'}" style="margin-top:12px">${clash ? `${fmt(clash)} of ${fmt(list6.length)} IPv6 prefixes clash with your IPv6 plan (${esc(planName)}).` : `None of the ${fmt(list6.length)} IPv6 prefixes clash with your IPv6 plan (${esc(planName)}).`}</div>` + html;
};
$('ovClear').addEventListener('click', () => { existing = []; existing6 = []; $('ovIn').value = ''; $('ovOut').innerHTML = ''; update(); renderV6(); });


// ---------- IPv6 helpers for the tools tab ----------
const isV6Text = (t) => /^\s*[0-9a-fA-F]{0,4}:[0-9a-fA-F:]*(\/\d{1,3})?/.test(t) && String(t).includes(':');
const end6 = (a, m) => a + size6(m) - 1n;
const overlaps6 = (a1, m1, a2, m2) => a1 <= end6(a2, m2) && a2 <= end6(a1, m1);
const relation6 = (a1, m1, a2, m2) => {
  if (a1 === a2 && m1 === m2) return 'identical to';
  if (m1 < m2 && a2 >= a1 && a2 <= end6(a1, m1)) return 'contains';
  if (m1 > m2 && a1 >= a2 && a1 <= end6(a2, m2)) return 'is inside';
  return null;
};
const bitLen = (x) => (x === 0n ? 0 : x.toString(2).length);
/** @type {(s0: bigint, e: bigint) => { a: bigint, m: number }[]} */
const range6ToCidrs = (s0, e) => {
  const out = [];
  let st = s0;
  while (st <= e) {
    let tz = 0;
    if (st === 0n) tz = 128; else while (tz < 128 && ((st >> BigInt(tz)) & 1n) === 0n) tz++;
    const bits = Math.min(tz, bitLen(e - st + 1n) - 1);
    out.push({ a: st, m: 128 - bits });
    st += 1n << BigInt(bits);
  }
  return out;
};
const expand6 = (n) => Array.from({ length: 8 }, (_, i) => ((n >> BigInt((7 - i) * 16)) & 0xffffn).toString(16).padStart(4, '0')).join(':');
const reverseZone6 = (a, m) => {
  const nib = expand6(a).replace(/:/g, '').split('');
  const k = Math.floor(m / 4);
  const zone = (k ? nib.slice(0, k).reverse().join('.') + '.' : '') + 'ip6.arpa';
  if (m % 4 === 0) return zone;
  return `Spans ${2 ** (4 - (m % 4))} zones at /${(k + 1) * 4}, starting ${nib.slice(0, k + 1).reverse().join('.')}.ip6.arpa`;
};
// "2001:db8::/48 Label" -> { a, m, cidr, label, aligned, raw }
const parseLine6 = (line) => {
  const t = line.replace(/#.*$/, '').trim();
  if (!t) return null;
  const mm = /^([0-9a-fA-F:]+(?:\s*\/\s*\d{1,3})?)(?:[\s,;\t]+(.*))?$/.exec(t);
  const c = mm && parse6Cidr(mm[1].includes('/') ? mm[1] : mm[1] + '/128');
  if (!c) return { error: true, raw: t };
  return { a: c.net, m: c.mask, cidr: v6Key(c.net, c.mask), label: (mm[2] || '').trim(), aligned: c.net === c.n, raw: t };
};
let existing6 = [];
const runSummarize = () => {
  const out = $('sumOut');
  const all = $('sumIn').value.replace(/#.*$/gm, '').split(/[\n,;]+/).map((s) => s.trim()).filter(Boolean)
    .flatMap((t) => (parseCidr(t) ? [t] : t.split(/\s+/)));
  const tokens = all.filter((t) => !t.includes(':'));
  const list = [], bad = [], list6 = [];
  for (const t of all.filter((x) => x.includes(':'))) { const c = parse6Cidr(t.includes('/') ? t : t + '/128'); if (c) list6.push(c); else bad.push(t); }
  for (const t of tokens) { const c = parseCidr(t); if (c) list.push(c); else bad.push(t); }
  if (!list.length && !list6.length) { out.innerHTML = '<div class="msg show error">No networks found.</div>'; return; }
  if (!list.length) { out.innerHTML = (bad.length ? `<div class="msg show error">Skipped: ${bad.map(esc).join(', ')}</div>` : '') + summarize6Html(list6); wireSumCopy(); return; }
  const iv = list.map((c) => [c.addr, lastAddr(c.addr, c.mask)]).sort((a, b) => a[0] - b[0] || a[1] - b[1]);
  const merged = [];
  for (const [s, e] of iv) {
    const top = merged[merged.length - 1];
    if (top && s <= top[1] + 1) top[1] = Math.max(top[1], e); else merged.push([s, e]);
  }
  const exact = merged.flatMap(([s, e]) => rangeToCidrs(s, e));
  const covered = merged.reduce((t, [s, e]) => t + (e - s + 1), 0);
  const sup = supernet(list);
  const extra = size(sup.mask) - covered;
  let html = '';
  if (bad.length) html += `<div class="msg show error">Skipped: ${bad.map(esc).join(', ')}</div>`;
  html += `<div class="stat-line"><b>${fmt(list.length)}</b> networks → <b>${fmt(exact.length)}</b> route${exact.length > 1 ? 's' : ''} covering exactly the same ${fmt(covered)} addresses.</div>`;
  html += `<div><span class="lbl">Exact summary</span><div class="codebox" style="margin-top:6px">${exact.map((c) => `<code>${cidrStr(c.addr, c.mask)}</code>`).join('')}</div>
      <div style="margin-top:8px"><button type="button" class="small" id="sumCopy" data-routes="${esc(exact.map((c) => cidrStr(c.addr, c.mask)).join('\n'))}">Copy routes</button></div></div>`;
  html += `<div><span class="lbl">Single supernet</span><div class="codebox" style="margin-top:6px"><code>${cidrStr(sup.addr, sup.mask)}</code></div>
      <div class="stat-line" style="margin-top:6px">${extra === 0 ? 'Covers exactly your networks, nothing extra.' : `Also covers <b>${fmt(extra)}</b> address${extra > 1 ? 'es' : ''} not in your list. Only advertise it if you own that space.`}</div></div>`;
  out.innerHTML = html + (list6.length ? summarize6Html(list6) : '');
  wireSumCopy();
};
// Copy buttons carry their routes in data-routes.
const wireSumCopy = () => {
  for (const b of /** @type {NodeListOf<HTMLElement>} */ (document.querySelectorAll('#sumOut [data-routes]'))) {
    b.addEventListener('click', async () => toast((await copyText(b.dataset.routes)) ? 'Routes copied' : 'Couldn’t copy'));
  }
};
const summarize6Html = (list6) => {
  const iv = list6.map((c) => [c.net, end6(c.net, c.mask)]).sort((a, b) => (a[0] < b[0] ? -1 : a[0] > b[0] ? 1 : 0));
  /** @type {[bigint, bigint][]} */
  const merged = [];
  for (const [st, e] of iv) {
    const top = merged[merged.length - 1];
    if (top && st <= top[1] + 1n) { if (e > top[1]) top[1] = e; } else merged.push([st, e]);
  }
  const exact = merged.flatMap(([st, e]) => range6ToCidrs(st, e));
  const lo = iv[0][0], hi = merged.reduce((h, x) => (x[1] > h ? x[1] : h), 0n);
  let sm = 128;
  while (sm > 0 && end6(net6(lo, sm), sm) < hi) sm--;
  const sup = { a: net6(lo, sm), m: sm };
  const covered = merged.reduce((t, [st, e]) => t + (e - st + 1n), 0n);
  const extra = size6(sup.m) - covered;
  const routes = exact.map((c) => v6Key(c.a, c.m));
  return `<div class="stat-line" style="margin-top:8px"><b>${fmt(list6.length)}</b> IPv6 prefix${list6.length > 1 ? 'es' : ''} → <b>${fmt(exact.length)}</b> route${exact.length > 1 ? 's' : ''} covering exactly the same space.</div>` +
    `<div><span class="lbl">Exact IPv6 summary</span><div class="codebox" style="margin-top:6px">${routes.map((r) => `<code>${esc(r)}</code>`).join('')}</div>` +
    `<div style="margin-top:8px"><button type="button" class="small" data-routes="${esc(routes.join('\n'))}">Copy IPv6 routes</button></div></div>` +
    `<div><span class="lbl">Single IPv6 supernet</span><div class="codebox" style="margin-top:6px"><code>${esc(v6Key(sup.a, sup.m))}</code></div>` +
    `<div class="stat-line" style="margin-top:6px">${extra === 0n ? 'Covers exactly your prefixes, nothing extra.' : 'Also covers space that isn’t in your list. Only advertise it if you hold that space.'}</div></div>`;
};
$('sumRun').addEventListener('click', runSummarize);
$('sumFromPlan').addEventListener('click', () => {
  const used = allRows().filter((r) => getMeta(r.key).s === 'used').map((r) => r.key);
  if (!used.length) { $('sumOut').innerHTML = '<div class="msg show info">No subnets are marked “In use” on the Plan tab yet.</div>'; return; }
  $('sumIn').value = used.join('\n');
  runSummarize();
});

const reverseZone = (addr, mask) => {
  const o = ntoa(addr).split('.');
  if (mask < 8) return `Spans ${fmt(2 ** (8 - mask))} /8 reverse zones`;
  const k = Math.floor(mask / 8);
  const zone = o.slice(0, k).reverse().join('.') + '.in-addr.arpa';
  if (mask % 8 === 0) return zone;
  if (mask > 24) return `Part of ${zone}. Needs classless delegation (RFC 2317), e.g. ${o[3]}-${lastAddr(addr, mask) & 255}.${zone}`;
  const n = 2 ** (8 - (mask % 8));
  const first = [o[k], ...o.slice(0, k).reverse()].join('.') + '.in-addr.arpa';
  return `Spans ${n} zones at /${(k + 1) * 8}, starting ${first}`;
};
const runInfo6 = (v) => {
  const out = $('infoOut');
  const host = !v.includes('/');
  const c = parse6Cidr(host ? v + '/128' : v);
  if (!c) { out.innerHTML = '<div class="msg show error">Enter an IPv6 address like 2001:db8::1, or a prefix like 2001:db8:10::/48.</div>'; return; }
  const net = c.net, m = c.mask, last = end6(net, m);
  const lan = net6(c.n, 64);
  const inPlan = v6Walk().find((lf) => c.n >= lf.a && c.n <= end6(lf.a, lf.m));
  const kv = [
    ['Address', `<span class="mono">${esc(fmt6(c.n))}</span>`],
    ['Expanded', `<span class="mono">${expand6(c.n)}</span>`],
    ['Prefix', `<span class="mono"><b>${esc(v6Key(net, m))}</b></span>${host ? ` (a single address; its /64 is <span class="mono">${esc(v6Key(lan, 64))}</span>)` : ''}`],
    ['Range', `<span class="mono">${esc(fmt6(net))} – ${esc(fmt6(last))}</span>`],
    ['Size', m <= 64 ? `${pow2Str(64 - m)} × /64 networks (${pow2Str(128 - m)} addresses)` : `${pow2Str(128 - m)} address${m === 128 ? '' : 'es'}`],
    ['Type', classTags6(net, m)],
    ['Reverse DNS', `<span class="mono">${esc(reverseZone6(net, m))}</span>`],
    ['Nibble boundary', m % 4 === 0 ? 'Yes' : `No: /${m} isn’t a multiple of 4, which makes the prefix harder to read and to delegate in reverse DNS`],
    ['In your IPv6 plan', inPlan ? `<span class="mono">${esc(v6Key(inPlan.a, inPlan.m))}</span>${v6Get(v6Key(inPlan.a, inPlan.m)).n ? ` (${esc(v6Get(v6Key(inPlan.a, inPlan.m)).n)})` : ''}` : `No (IPv6 plan is ${esc(v6Key(v6.net, v6.mask))})`],
  ];
  out.innerHTML = `<dl class="kv">${kv.map(([k, v2]) => `<dt>${k}</dt><dd>${v2}</dd>`).join('')}</dl>`;
};
const runInfo = () => {
  const out = $('infoOut');
  const v = $('infoIn').value.trim();
  if (!v) { out.innerHTML = ''; return; }
  if (isV6Text(v)) { runInfo6(v); return; }
  const c = parseCidr(v);
  if (!c) { out.innerHTML = '<div class="msg show error">Enter an IP like 10.1.2.3, or a network like 10.1.2.0/24 or 10.1.2.0 255.255.255.0.</div>'; return; }
  const inPlan = allRows().find((r) => inBlock(c.ip, r.addr, r.mask));
  const cl = inPlan ? inPlan.cloud : settings.cloud;
  const i = hostInfo(c.addr, c.mask, cl);
  const first = Math.floor(c.ip / 16777216);
  const klass = first < 128 ? 'A' : first < 192 ? 'B' : first < 224 ? 'C' : first < 240 ? 'D (multicast)' : 'E (reserved)';
  const kv = [
    ['Address', `<span class="mono">${ntoa(c.ip)}</span>`],
    ['Network', `<span class="mono"><b>${c.cidr}</b></span>`],
    ['Netmask', `<span class="mono">${ntoa(netmask(c.mask))}</span>`],
    ['Wildcard', `<span class="mono">${ntoa(wildcard(c.mask))}</span>`],
    ['Range', `<span class="mono">${ntoa(c.addr)} – ${ntoa(i.last)}</span> (${fmt(size(c.mask))} addresses)`],
    ['Usable', i.uF === null ? '—' : `<span class="mono">${ntoa(i.uF)} – ${ntoa(i.uL)}</span> (${fmt(i.hosts)} hosts, ${CLOUDS[cl].label} rules)`],
    ['Binary', `<span class="mono bin">${binHtml(c.ip, c.mask)}</span>`],
    ['Hex', `<span class="mono">0x${c.ip.toString(16).toUpperCase().padStart(8, '0')}</span>`],
    ['Type', classTags(c.addr, c.mask)],
    ['Old class', `Class ${klass} (classful addressing is historical)`],
    ['Reverse DNS', `<span class="mono">${esc(reverseZone(c.addr, c.mask))}</span>`],
    ['In your plan', inPlan ? `<span class="mono">${inPlan.key}</span>${getMeta(inPlan.key).n ? ` (${esc(getMeta(inPlan.key).n)})` : ''}` : `No (plan is ${esc(state.blocks.map(blockCidr).join(', '))})`],
  ];
  out.innerHTML = `<dl class="kv">${kv.map(([k, v2]) => `<dt>${k}</dt><dd>${v2}</dd>`).join('')}</dl>`;
};
$('infoIn').addEventListener('input', runInfo);
