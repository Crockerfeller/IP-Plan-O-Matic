// IP Plan-O-Matic: IP assignments: single addresses inside a subnet, with name, MAC and notes.
// One of the app's plain scripts (js/*.js): index.html loads them in order and they share one scope, so each can use
// what the ones before it define. Plain scripts, not modules, so a downloaded copy still opens from disk.
'use strict';

// ---------- IP assignments dialog ----------
let hostsKey = null;
const hostsCtx = () => {
  const c = parseCidr(hostsKey), bi = blockOf(c.addr), cloud = bi >= 0 ? state.blocks[bi].cloud : settings.cloud;
  return { c, info: hostInfo(c.addr, c.mask, cloud), cloud };
};
const nextFree = () => {
  const { info } = hostsCtx();
  if (info.uF === null) return null;
  const taken = new Set(hostsIn(info.addr, info.mask));
  for (let ip = info.uF; ip <= info.uL; ip++) if (!taken.has(ip) && ip !== info.gw) return ip;
  return null;
};
// Why an address can't be assigned in this subnet, or '' if it can.
const hostProblem = (ip) => {
  const { c, info } = hostsCtx();
  if (ip === null) return 'That isn’t an IPv4 address.';
  if (!inBlock(ip, c.addr, c.mask)) return `${ntoa(ip)} isn’t in ${hostsKey}.`;
  const res = info.reserved.find(([a]) => a === ip);
  if (res) return `${ntoa(ip)} is ${res[1]}.`;
  if (info.uF === null || ip < info.uF || ip > info.uL) return `${ntoa(ip)} isn’t usable on this platform.`;
  const h = state.hosts[ntoa(ip)];
  if (h) return `${ntoa(ip)} is already assigned${h.n ? ` to ${h.n}` : ''}.`;
  return '';
};
const renderHosts = () => {
  const { c, info } = hostsCtx(), meta = getMeta(hostsKey);
  $('hostsTtl').textContent = `IP addresses in ${hostsKey}${meta.n ? ` (${meta.n})` : ''}`;
  const mine = hostsIn(c.addr, c.mask), used = mine.filter((ip) => info.uF !== null && ip >= info.uF && ip <= info.uL).length;
  const nf = nextFree(), pct = info.hosts ? Math.round((100 * used) / info.hosts) : 0;
  $('hostsSum').textContent = `${fmt(used)} of ${fmt(info.hosts)} usable address${info.hosts === 1 ? '' : 'es'} assigned (${pct}%)${nf === null ? '. None left.' : ` · next free ${ntoa(nf)}`}`;
  $('hostsBar').style.setProperty('--p', Math.min(100, (100 * used) / Math.max(1, info.hosts)) + '%');
  if (!$('hAddIp').value && nf !== null) $('hAddIp').value = ntoa(nf);
  // The platform's own addresses, read-only, among the assigned ones.
  const sys = info.reserved.map(([a, why]) => [a, why[0].toUpperCase() + why.slice(1)]);
  if (info.gw !== null && !info.reserved.some(([a]) => a === info.gw)) sys.push([info.gw, 'Gateway (the router’s address)']);
  const list = /** @type {{ a: number, sys?: string, h?: any }[]} */ ([...sys.map(([a, why]) => ({ a, sys: why })), ...mine.map((a) => ({ a, h: state.hosts[ntoa(a)] }))]).sort((x, y) => x.a - y.a || (x.sys ? -1 : 1));
  const body = $('hostsBody');
  body.innerHTML = '';
  for (const x of list) {
    const tr = document.createElement('tr');
    const ipTd = document.createElement('td');
    ipTd.className = 'mono';
    ipTd.textContent = ntoa(x.a);
    tr.appendChild(ipTd);
    if (x.sys) {
      tr.className = 'sys';
      const td = document.createElement('td');
      td.colSpan = 4;
      td.textContent = x.sys;
      tr.appendChild(td);
    } else {
      const ip = ntoa(x.a);
      for (const [f, cls, ph, label] of [['n', '', 'Name', 'Name'], ['m', 'mono', 'aa:bb:cc:dd:ee:ff', 'MAC address'], ['o', '', 'Notes', 'Notes']]) {
        const td = document.createElement('td');
        const inp = document.createElement('input');
        inp.type = 'text'; inp.className = 'cell-input ' + cls; inp.placeholder = ph; inp.spellcheck = false;
        inp.value = x.h[f] || '';
        inp.setAttribute('aria-label', `${label} for ${ip}`);
        inp.addEventListener('focus', () => { delete inp.dataset.cp; });
        inp.addEventListener('input', () => {
          if (f === 'm') { inp.toggleAttribute('aria-invalid', !!inp.value.trim() && !normMac(inp.value)); if (inp.value.trim() && !normMac(inp.value)) return; }
          firstEdit(inp);
          const h = { ...state.hosts[ip] };
          if (f === 'm') { if (normMac(inp.value)) h.m = normMac(inp.value); else delete h.m; } else if (inp.value.trim()) h[f] = oneLine(inp.value).slice(0, f === 'n' ? 80 : 200); else delete h[f];
          if (h.n || h.m || h.o) state.hosts[ip] = h; else { delete state.hosts[ip]; hostsChanged(); }
          writeHashSoon();
        });
        inp.addEventListener('change', () => { if (f === 'm' && normMac(inp.value)) inp.value = normMac(inp.value); render(); });
        td.appendChild(inp);
        tr.appendChild(td);
      }
      const td = document.createElement('td');
      const del = document.createElement('button');
      del.type = 'button'; del.className = 'small icon-x'; del.textContent = '✕';
      del.setAttribute('aria-label', `Remove ${ip}`);
      del.title = `Remove ${ip}`;
      del.addEventListener('click', () => { checkpoint(); delete state.hosts[ip]; hostsChanged(); update(); renderHosts(); });
      td.appendChild(del);
      tr.appendChild(td);
    }
    body.appendChild(tr);
  }
};
const openHosts = (key) => {
  hostsKey = key;
  for (const id of ['hAddIp', 'hAddName', 'hAddMac', 'hAddNote']) $(id).value = '';
  clearMsg('hostsMsg');
  renderHosts();
  showDlg($('hostsDlg'));
  $('hAddName').focus();
};
$('hostsAdd').addEventListener('submit', (e) => {
  e.preventDefault();
  const ip = aton($('hAddIp').value.trim()), why = hostProblem(ip);
  if (why) { showMsg('hostsMsg', why, 'error'); $('hAddIp').focus(); return; }
  const macIn = $('hAddMac').value.trim();
  if (macIn && !normMac(macIn)) { showMsg('hostsMsg', 'That MAC address isn’t valid. Use six pairs of hex digits, like aa:bb:cc:dd:ee:ff.', 'error'); $('hAddMac').focus(); return; }
  const h = cleanHost([$('hAddName').value, macIn, $('hAddNote').value]);
  if (!h) { showMsg('hostsMsg', 'Give it a name (or a MAC address).', 'error'); $('hAddName').focus(); return; }
  checkpoint();
  state.hosts[ntoa(ip)] = h;
  hostsChanged();
  clearMsg('hostsMsg');
  for (const id of ['hAddIp', 'hAddName', 'hAddMac', 'hAddNote']) $(id).value = '';
  update();
  renderHosts();
  $('hAddName').focus();
});
// Several at once: "10.0.0.20 printer-1 aa:bb:cc:dd:ee:01" per line (the MAC can be anywhere after the address).
$('hPasteRun').addEventListener('click', () => {
  const lines = $('hPaste').value.split(/\r?\n/).map((l) => l.trim()).filter((l) => l && !l.startsWith('#'));
  let added = 0;
  const bad = [];
  const adds = [];
  for (const line of lines) {
    const [first, ...rest] = line.split(/[\s,;\t]+/);
    const ip = aton(first || ''), why = hostProblem(ip) || (adds.some(([a]) => a === ip) ? 'listed twice' : '');
    const mac = rest.find((t) => normMac(t)), name = rest.filter((t) => t !== mac).join(' ');
    const h = cleanHost([name, mac, '']);
    if (why || !h) { bad.push(first || line); continue; }
    adds.push([ip, h]);
  }
  if (adds.length) {
    checkpoint();
    for (const [ip, h] of adds) { state.hosts[ntoa(ip)] = h; added++; }
    hostsChanged();
    update();
    renderHosts();
  }
  showMsg('hostsMsg', `Assigned ${added} address${added === 1 ? '' : 'es'}.${bad.length ? ` Skipped ${bad.length} (outside the subnet, reserved, already assigned or without a name): ${bad.slice(0, 6).join(', ')}${bad.length > 6 ? '…' : ''}.` : ''}`, bad.length ? 'error' : 'ok');
  if (!bad.length) $('hPaste').value = '';
});
$('hostsClose').addEventListener('click', () => $('hostsDlg').close());
$('hostsDlg').addEventListener('click', (e) => { if (e.target === $('hostsDlg')) $('hostsDlg').close(); });
$('hostsDlg').addEventListener('close', () => { hostsKey = null; render(); });
