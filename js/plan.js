// IP Plan-O-Matic: The Plan tab: the subnet table, join bars, network cards, address map, keyboard shortcuts and the Add box.
// One of the app's plain scripts (js/*.js): index.html loads them in order and they share one scope, so each can use
// what the ones before it define. Plain scripts, not modules, so a downloaded copy still opens from disk.
'use strict';

// =====================================================================
// PLAN tab rendering
// =====================================================================
const copyIcon = '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="9" y="9" width="13" height="13" rx="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg>';
const checkIcon = '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M20 6 9 17l-5-5"/></svg>';
const copyBtn = (text) => {
  const btn = document.createElement('button');
  btn.className = 'copy';
  btn.type = 'button';
  btn.title = 'Copy ' + text;
  btn.setAttribute('aria-label', 'Copy ' + text);
  btn.innerHTML = copyIcon;
  btn.addEventListener('click', async () => {
    if (await copyText(text)) {
      btn.innerHTML = checkIcon; btn.classList.add('done');
      setTimeout(() => { btn.innerHTML = copyIcon; btn.classList.remove('done'); }, 1200);
    }
  });
  return btn;
};

const hueFor = (mask) => (mask * 47 + 200) % 360;
let rows = []; // flat list of leaves for the current render

const collectLeaves = (b = blk()) => {
  const out = [];
  const walk = (node, addr, mask, depth, opening) => {
    if (node.c) {
      const entry = { node, addr, mask, depth };
      walk(node.c[0], addr, mask + 1, depth + 1, opening.concat([entry]));
      walk(node.c[1], addr + size(mask + 1), mask + 1, depth + 1, []);
    } else {
      out.push({ node, addr, mask, depth, opening, key: cidrStr(addr, mask) });
    }
  };
  walk(b.root, b.network, b.mask, 0, []);
  return out;
};
// Leaves of every block, each tagged with its block's platform (for exports and cross-plan checks).
const allRows = () => state.blocks.flatMap((b, bi) => collectLeaves(b).map((r) => ({ ...r, cloud: b.cloud, bi })));
// The group a subnet sits in: names of the divided subnets above it, outermost first ("westus2 / spoke1").
// Naming a subnet and then dividing it leaves the name on the parent, which has no row of its own.
// In a plan with several networks, a named network leads the path ("southeastasia / reserved").
const groupOf = (r) => {
  const b = r.bi === undefined ? blk() : state.blocks[r.bi];
  const out = state.blocks.length > 1 && b.label ? [b.label] : [];
  for (let m = b.mask + 1; m < r.mask; m++) {
    const n = getMeta(cidrStr(Math.floor(r.addr / size(m)) * size(m), m)).n;
    if (n) out.push(n);
  }
  return out.join(' / ');
};

const renderSummary = () => {
  const base = cidrStr(state.network, state.mask);
  let usableTotal = 0;
  const by = { used: 0, reserved: 0, free: 0 };
  const vlans = {};
  let tooSmall = 0, clashes = 0;
  const azWarn = [], azNeed = [], azSeen = {};
  for (const r of rows) {
    const info = hostInfo(r.addr, r.mask);
    const m = getMeta(r.key);
    if (settings.cloud === 'azure' || m.d) {
      const svc = svcOf(m), fx = azNear(m.n);
      if (svc && !svc.soft && r.mask > svc.min) azWarn.push(`<span class="tag danger" title="${esc(r.key)}">${esc(m.n || svc.name)} must be /${svc.min} or larger (${esc(r.key)} is a /${r.mask})</span>`);
      // A required name with a prefix, suffix or the wrong case, or a template subnet (d) for such a service that was renamed.
      const need = (fx && fx.name !== m.n) ? fx : (svc && svc.fixed && m.n !== svc.name ? svc : null);
      const one = fx || (svc && svc.fixed ? svc : null);
      if (one) (azSeen[one.name] = azSeen[one.name] || []).push(r.key);
      if (need) azNeed.push({ r, m, need });
    }
    usableTotal += info.hosts;
    by[m.s || 'free'] += size(r.mask);
    if (m.v) (vlans[m.v] = vlans[m.v] || []).push(r.key);
    if (info.warn) tooSmall++;
    if (existing.some((e) => overlaps(e.addr, e.mask, r.addr, r.mask))) clashes++;
  }
  // Azure allows one of each of these per VNet. Two or more (uksouth-AzureBastionSubnet, westus2-AzureBastionSubnet)
  // means several VNets drawn as one: offer to split rather than rename, since renaming would clash.
  const dupes = Object.entries(azSeen).filter(([, keys]) => keys.length > 1);
  if (dupes.length && blk().root.c) {
    const names = dupes.map(([n, keys]) => `${n} ×${keys.length}`).join(', ');
    azWarn.push(`<span class="tag warn long" title="${esc(dupes.flatMap(([, k]) => k).join(', '))}">Azure allows one of each per VNet (${esc(names)}), so this looks like several VNets drawn as one. <button type="button" class="small" data-act="split">Make separate VNets…</button></span>`);
  }
  for (const { r, m, need } of azNeed) {
    if (azSeen[need.name].length > 1) continue;
    azWarn.push(`<span class="tag warn long" title="${esc(r.key)}">Azure needs the exact name ${esc(need.name)}${m.n ? `, not ${esc(m.n)}` : ''} (${esc(r.key)}) <button type="button" class="small" data-act="rename" data-key="${esc(r.key)}" data-name="${esc(need.name)}">Rename</button></span>`);
  }
  const total = size(state.mask);
  $('summary').innerHTML =
    `<span>Base network <b class="mono">${base}</b></span>` +
    `<span>Netmask <b class="mono">${ntoa(netmask(state.mask))}</b></span>` +
    `<span>Subnets <b>${fmt(rows.length)}</b></span>` +
    `<span>Total addresses <b>${fmt(total)}</b></span>` +
    `<span>Usable hosts <b>${fmt(usableTotal)}</b></span>` +
    `<span>Platform <b>${CLOUDS[settings.cloud].label}</b></span>` +
    (state.blocks.length > 1 ? `<span>All ${state.blocks.length} ${netWord()}s <b>${fmt(state.blocks.reduce((t, b) => t + size(b.mask), 0))}</b> addresses</span>` : '');
  const pct = (x) => (x / total) * 100;
  $('usageBar').innerHTML = `<span class="u-used" style="width:${pct(by.used)}%"></span><span class="u-res" style="width:${pct(by.reserved)}%"></span>`;
  const p1 = (x) => (pct(x) < 0.1 && x > 0 ? '<0.1' : pct(x).toFixed(pct(x) < 10 ? 1 : 0));
  $('usageLegend').innerHTML =
    `<span><i style="background:var(--ok)"></i>In use ${fmt(by.used)} addresses (${p1(by.used)}%)</span>` +
    `<span><i style="background:var(--hl-border)"></i>Reserved ${fmt(by.reserved)} (${p1(by.reserved)}%)</span>` +
    `<span><i style="background:var(--border)"></i>Free ${fmt(by.free)} (${p1(by.free)}%)</span>`;

  const w = [classTags(state.network, state.mask)];
  if (CLOUDS[settings.cloud].max && state.mask < CLOUDS[settings.cloud].max) w.push(`<span class="tag danger">${CLOUDS[settings.cloud].label} CIDR blocks must be between /${CLOUDS[settings.cloud].max} and /${CLOUDS[settings.cloud].min}</span>`);
  if (settings.cloud !== 'std' && state.mask > CLOUDS[settings.cloud].min) w.push(`<span class="tag danger">Base is smaller than the ${CLOUDS[settings.cloud].label} minimum of /${CLOUDS[settings.cloud].min}</span>`);
  if (tooSmall) w.push(`<span class="tag danger">${tooSmall} subnet${tooSmall > 1 ? 's are' : ' is'} below the ${CLOUDS[settings.cloud].label} minimum of /${CLOUDS[settings.cloud].min}</span>`);
  for (const [v, list] of Object.entries(vlans)) if (list.length > 1) w.push(`<span class="tag warn" title="${esc(list.join(', '))}">VLAN ${esc(v)} is on ${list.length} subnets</span>`);
  w.push(...azWarn);
  if (clashes) w.push(`<span class="tag danger">${clashes} subnet${clashes > 1 ? 's overlap' : ' overlaps'} existing networks (see Check &amp; summarize)</span>`);
  $('warnings').innerHTML = w.join('');
};

// What a network is called on the platforms in this plan: VNet, VPC, VCN, or network when they differ.
const NET_WORD = { std: 'network', aws: 'VPC', azure: 'VNet', gcp: 'VPC', oci: 'VCN' };
const netWord = () => { const c = new Set(state.blocks.map((b) => b.cloud)); return c.size === 1 ? NET_WORD[[...c][0]] : 'network'; };
// Peering arcs are drawn after layout, and again whenever the cards move (resize, wrapping).
const drawPeerArcs = () => {
  const row = $('netsRow');
  if (!row) return;
  const svg = row.querySelector('svg.nets-links');
  const pairs = peerPairs();
  row.classList.toggle('linked', pairs.length > 0);
  if (!svg || !pairs.length) { if (svg) svg.innerHTML = ''; return; }
  const box = row.getBoundingClientRect();
  const at = (b) => {
    const c = row.querySelector(`.net-card[data-cidr="${CSS.escape(blockCidr(b))}"]`);
    if (!c) return null;
    const r = c.getBoundingClientRect();
    return { x: r.left - box.left + r.width / 2, y: r.bottom - box.top, right: r.right - box.left, mid: r.top - box.top + r.height / 2 };
  };
  let paths = '', depth = 0, under = false;
  for (const [x, y] of pairs) {
    const a = at(x), b = at(y);
    if (!a || !b) continue;
    const d = 12 + (depth++ % 6) * 7, t = `<title>${esc(blockName(x))} ⇄ ${esc(blockName(y))}</title>`;
    if (Math.abs(a.x - b.x) < 8) {
      // Cards stacked in one column (phones): a bracket down the right-hand side.
      const out = Math.max(a.right, b.right) + d;
      paths += `<path d="M${a.right} ${a.mid} C${out} ${a.mid}, ${out} ${b.mid}, ${b.right} ${b.mid}">${t}</path><circle cx="${a.right}" cy="${a.mid}" r="3"/><circle cx="${b.right}" cy="${b.mid}" r="3"/>`;
    } else {
      // Side by side: an arc under the cards.
      const low = Math.max(a.y, b.y) + d;
      under = true;
      paths += `<path d="M${a.x} ${a.y} C${a.x} ${low}, ${b.x} ${low}, ${b.x} ${b.y}">${t}</path><circle cx="${a.x}" cy="${a.y}" r="3"/><circle cx="${b.x}" cy="${b.y}" r="3"/>`;
    }
  }
  row.style.setProperty('--arc', under ? `${14 + Math.min(pairs.length, 6) * 7}px` : '0px');
  svg.innerHTML = paths;
};
/** @type {ResizeObserver | null} */
let arcObserver = null;
const NUDGE_KEY = 'subnetPlanner.cloudNudgeOff';
let nudgeHidden = false;
const nudgeOff = () => { if (nudgeHidden) return true; try { return localStorage.getItem(NUDGE_KEY) === '1'; } catch (e) { return false; } };
const renderBlocks = () => {
  const el = $('blocks');
  const word = netWord(), pairs = peerPairs(), hubC = state.peers && state.po.m === 'hub' && pairs.length ? state.po.h : '';
  const many = state.blocks.length > 1;
  // Cards only for cloud networks or several networks. A single on-prem network is the plain calculator:
  // its address space, name and platform stay inline in the row below.
  const cards = many || blk().cloud !== 'std';
  const ed = $('netEdit');
  let foc = /** @type {HTMLElement | null} */ (ed.contains(document.activeElement) ? document.activeElement : null);
  $('networkL').textContent = cards ? 'Address space' : 'Network address space';
  $('blockLabelL').textContent = cards ? 'Name' : 'Network name';
  $('platformL').textContent = many ? `Platform of ${blk().label || blockCidr(blk())}` : 'Platform';
  $('platform').title = many ? `Changes which addresses are reserved in each subnet of the selected network (${blockCidr(blk())}). Pick a card to change another one.` : 'Changes which addresses are reserved in each subnet';
  const acts = $('netRowActs');
  acts.innerHTML = '';
  el.innerHTML = '';
  el.hidden = !cards;
  const ctx = $('netCtx');
  ctx.hidden = !cards;
  if (!cards) {
    $('netEditHome').after(ed);
    const add = document.createElement('button');
    add.type = 'button';
    add.id = 'netAddBtn';
    add.textContent = '+ Add network';
    add.title = 'Plan several networks side by side (sites, regions, cloud VNets or VPCs)';
    add.addEventListener('click', openNetAdd);
    acts.appendChild(add);
    if (blk().root.c && blk().mask <= 20) {
      const sb = document.createElement('button');
      sb.type = 'button';
      sb.className = 'nc-act';
      sb.textContent = 'Make separate networks…';
      sb.title = 'Turn this network’s subnets of one size into networks of their own (for regions or sites drawn as subnets)';
      sb.addEventListener('click', openSplitNets);
      acts.appendChild(sb);
    }
    if (foc) foc.focus();
    return;
  }
  const b0 = blk(), w0 = NET_WORD[b0.cloud] === 'network' ? 'network' : NET_WORD[b0.cloud];
  ctx.innerHTML = `Working in ${esc(w0)} ${b0.label ? `<b>${esc(b0.label)}</b> ` : ''}<span class="mono">${blockCidr(b0)}</span> · ${esc(CLOUDS[b0.cloud].label)}. The tools and table below apply to this ${esc(w0)}${many ? '; click another card to switch' : ''}.`;
  const head = document.createElement('div');
  head.className = 'nets-head';
  head.innerHTML = `<span class="lbl">${many ? `${state.blocks.length} ${esc(word)}s in this plan` : `${esc(word === 'network' ? 'Network' : word)}`}</span>`;
  const pb = document.createElement('button');
  pb.type = 'button';
  pb.className = 'peer-btn';
  pb.id = 'peerBtn';
  pb.textContent = `⇄ Peering${pairs.length ? ` (${pairs.length})` : ''}…`;
  pb.disabled = !many;
  pb.title = many ? `Choose which ${word}s connect, for the Azure and AWS Terraform exports` : `Add a second ${word} to set up peering`;
  pb.addEventListener('click', openPeer);
  head.appendChild(pb);
  if (!many) {
    const h = document.createElement('div');
    h.className = 'hint';
    h.textContent = `Planning several ${word}s (a hub and spokes, regions, sites)? Add each one, then peer them.`;
    head.appendChild(h);
  } else if (state.blocks.every((b) => b.cloud === 'std') && !nudgeOff()) {
    // Several on-prem networks may really be cloud ones. A quiet hint, never a prompt; ✕ hides it for good.
    const h = document.createElement('div');
    h.className = 'hint nudge';
    h.id = 'cloudNudge';
    h.innerHTML = '<span>Planning cloud networks? Set each card’s Platform, or start from the <button type="button" class="linkish">subnet wizard</button>.</span>';
    /** @type {HTMLElement} */ (h.querySelector('.linkish')).addEventListener('click', () => openAz('azure'));   // in the markup just above
    const x = document.createElement('button');
    x.type = 'button';
    x.className = 'chip-x';
    x.textContent = '✕';
    x.title = 'Don’t show this again';
    x.setAttribute('aria-label', 'Dismiss: don’t show this hint again');
    x.addEventListener('click', () => { try { localStorage.setItem(NUDGE_KEY, '1'); } catch (e) { /* ignore */ } nudgeHidden = true; h.remove(); });
    h.appendChild(x);
    head.appendChild(h);
  }
  el.appendChild(head);
  const row = document.createElement('div');
  row.className = 'nets-row';
  row.id = 'netsRow';
  row.innerHTML = '<svg class="nets-links" aria-hidden="true"></svg>';
  state.blocks.forEach((b, i) => {
    const leaves = collectLeaves(b);
    const by = { used: 0, reserved: 0 };
    for (const r of leaves) { const s2 = getMeta(r.key).s; if (s2) by[s2] += size(r.mask); }
    const tot = size(b.mask), peers = pairs.filter(([x, y]) => x === b || y === b).length;
    const card = document.createElement('div');
    const on = i === state.active;
    card.className = 'net-card' + (on ? ' editing' : '');
    card.dataset.cidr = blockCidr(b);
    const bar = `<div class="nc-bar" title="In use ${Math.round((by.used / tot) * 100)}%, reserved ${Math.round((by.reserved / tot) * 100)}%"><i style="width:${(by.used / tot) * 100}%;background:var(--ok)"></i><i style="width:${(by.reserved / tot) * 100}%;background:var(--hl-border)"></i></div>`;
    const subs = `${fmt(leaves.length)} subnet${leaves.length === 1 ? '' : 's'}${peers ? ` · ⇄ ${peers}` : ''}`;
    if (on) {
      // The selected card is a group of fields (the editor), not a button.
      card.setAttribute('role', 'group');
      card.setAttribute('aria-current', 'true');
      card.setAttribute('aria-label', `Selected ${NET_WORD[b.cloud]}: ${b.label ? b.label + ' ' : ''}${blockCidr(b)}`);
      card.innerHTML =
        `<div class="nc-top"><span class="nc-sub">Selected · ${subs}</span>${blockCidr(b) === hubC ? '<span class="nc-hub">★ Hub</span>' : ''}<span style="flex:1"></span></div>`;
      card.appendChild(ed);
      card.insertAdjacentHTML('beforeend', bar);
    } else {
      card.tabIndex = 0;
      card.setAttribute('role', 'button');
      card.setAttribute('aria-pressed', 'false');
      card.title = `Edit ${blockCidr(b)} and show it in the table`;
      card.innerHTML =
        `<div class="nc-top"><span class="nc-name${b.label ? '' : ' none'}">${esc(b.label || 'Unnamed')}</span>${blockCidr(b) === hubC ? '<span class="nc-hub">★ Hub</span>' : ''}</div>` +
        `<div class="nc-cidr">${blockCidr(b)}</div>` +
        `<div class="nc-sub">${esc(CLOUDS[b.cloud].label)} · ${subs}</div>` + bar;
    }
    const pick = () => { if (i !== state.active) selectBlock(i); };
    card.addEventListener('click', pick);
    card.addEventListener('keydown', (e) => { if (!on && (e.key === 'Enter' || e.key === ' ') && e.target === card) { e.preventDefault(); pick(); } });
    if (i === state.active && many) {
      const x = document.createElement('button');
      x.type = 'button';
      x.className = 'chip-x';
      x.textContent = '✕';
      x.title = `Remove ${blockCidr(b)} from this plan`;
      x.setAttribute('aria-label', x.title);
      x.addEventListener('click', (e) => { e.stopPropagation(); removeBlock(i); });
      /** @type {HTMLElement} */ (card.querySelector('.nc-top')).appendChild(x);
    }
    // Only on address-space-sized networks (regions or spokes drawn as subnets), not on small hubs.
    if (i === state.active && b.root.c && b.mask <= 20) {
      const sb = document.createElement('button');
      sb.type = 'button';
      sb.className = 'nc-act';
      sb.textContent = `Make separate ${word === 'network' ? 'networks' : word + 's'}…`;
      sb.title = `Turn this network’s subnets of one size into ${word}s of their own (for regions, spokes or sites drawn as subnets)`;
      sb.addEventListener('click', (e) => { e.stopPropagation(); openSplitNets(); });
      card.appendChild(sb);
    }
    row.appendChild(card);
  });
  const add = document.createElement('button');
  add.type = 'button';
  add.className = 'net-add';
  add.id = 'netAddBtn';
  add.textContent = `+ Add ${word}`;
  add.title = `Add another ${word} (address space) to this plan`;
  add.addEventListener('click', openNetAdd);
  row.appendChild(add);
  el.appendChild(row);
  drawPeerArcs();   // layout is ready now; the observer below redraws when the cards move
  if (typeof ResizeObserver === 'function') {
    if (arcObserver) arcObserver.disconnect();
    arcObserver = new ResizeObserver(() => drawPeerArcs());
    arcObserver.observe(row);
  }
  if (foc && !foc.isConnected) foc = null;
  if (foc && document.activeElement !== foc) foc.focus();
};
const selectBlock = (i) => {
  state.active = i;
  syncControls();
  update();
};
const removeBlock = (i) => {
  const b = state.blocks[i];
  if ((b.root.c || blockMetaKeys(b).length) && !confirm(`Remove ${blockCidr(b)} and all its subnets, names and VLANs from this plan?`)) return;
  checkpoint();
  clearBlockMeta(b);
  state.blocks.splice(i, 1);
  if (state.peers) state.peers = state.peers.filter((pr) => !pr.includes(blockCidr(b)));
  state.active = Math.min(state.active, state.blocks.length - 1);
  syncControls();
  update();
  toast(`Removed ${blockCidr(b)}`, UNDO);
};

const fillSplitAll = () => {
  const sel = $('splitAllSel'), prev = sel.value, lim = divLimit();
  sel.innerHTML = '';
  for (let n = state.mask + 1; n <= lim; n++) {
    const cnt = leavesAfterSplit(state.root, state.mask, n);
    if (cnt > MAX_SPLIT) break;
    sel.add(new Option(`/${n}  (${fmt(cnt)} subnets)`, String(n)));
  }
  if (!sel.options.length) sel.add(new Option('—', ''));
  // Keep the user's pick on the same block; otherwise suggest the smallest subnet size already in use.
  const deepest = Math.max(...collectLeaves().map((r) => r.mask));
  const want = sel.dataset.blk === blockCidr(blk()) && prev ? prev : String(deepest);
  if ([...sel.options].some((o) => o.value === want)) sel.value = want;
  sel.dataset.blk = blockCidr(blk());
  sel.disabled = $('splitAllBtn').disabled = !sel.options[0].value;
};
/** Draw the Plan tab; returns the row the Find IP box matched, if any. @type {() => HTMLTableRowElement | null} */
const render = () => {
  renderBlocks();
  fillSplitAll();
  const H = height(state.root);
  rows = collectLeaves();
  const limit = divLimit();

  // Group names live on the join bars, which don't print; so a plan with groups always prints a Group column.
  const anyGroup = rows.some((r) => groupOf(r));
  const groupCls = visible.group ? '' : ' print-only';
  const head = $('headRow');
  head.innerHTML = '';
  for (const col of COLS) {
    if (!visible[col.key] && !(col.key === 'group' && anyGroup)) continue;
    const th = document.createElement('th');
    th.textContent = col.label;
    th.className = 'col-' + col.key + (col.num ? ' num' : '') + (col.key === 'group' ? groupCls : '');
    if (col.key === 'join') { th.classList.add('join-h'); th.colSpan = H + 1; }
    head.appendChild(th);
  }

  const body = $('body');
  body.innerHTML = '';
  /** @type {HTMLTableRowElement | null} */
  let foundRow = null;
  rows.forEach((leaf, idx) => {
    const key = leaf.key;
    const meta = getMeta(key);
    const info = hostInfo(leaf.addr, leaf.mask);
    const tr = document.createElement('tr');
    if (meta.s) tr.classList.add('st-' + meta.s);
    if (foundIp !== null && inBlock(foundIp, leaf.addr, leaf.mask)) { tr.classList.add('found'); foundRow = tr; }
    tr.dataset.key = key;
    if (key === selKey) { tr.classList.add('sel'); tr.setAttribute('aria-selected', 'true'); }
    tr.addEventListener('click', (e) => { if (!/** @type {any} */ (e.target).closest('button, select, input, td.bar, a')) selectRow(key); });
    tr.addEventListener('focusin', () => selectRow(key, false));
    const clashes = existing.filter((e) => overlaps(e.addr, e.mask, leaf.addr, leaf.mask));
    if (clashes.length) tr.classList.add('clash');

    const cell = (cls, content) => {
      const td = document.createElement('td');
      td.className = 'data ' + cls;
      if (content == null) { /* empty */ }
      else if (typeof content === 'string') td.textContent = content; else td.appendChild(content);
      tr.appendChild(td);
      return td;
    };
    const textInput = (cls, field, placeholder, label) => {
      const inp = document.createElement('input');
      inp.type = 'text';
      inp.className = 'cell-input ' + cls;
      inp.value = meta[field] || '';
      inp.placeholder = placeholder;
      inp.setAttribute('aria-label', `${label} for ${key}`);
      inp.spellcheck = false;
      inp.addEventListener('focus', () => { delete inp.dataset.cp; });
      inp.addEventListener('keydown', (e) => { if (e.key === 'Escape' || (e.key === 'Enter' && field !== 'o')) { e.preventDefault(); inp.blur(); selectRow(key); } });
      return inp;
    };

    if (visible.subnet) {
      const wrap = document.createElement('div');
      wrap.className = 'subnet-cell';
      const a = document.createElement('span');
      a.className = 'addr mono';
      a.textContent = key;
      wrap.append(a, copyBtn(key));
      if (info.warn) {
        const b = document.createElement('span'); b.className = 'badge danger'; b.textContent = 'too small'; b.title = info.warn; wrap.append(b);
      } else if (info.note) {
        const b = document.createElement('span'); b.className = 'badge'; b.textContent = leaf.mask === 31 ? 'P2P' : 'host'; b.title = info.note; wrap.append(b);
      }
      if (clashes.length) {
        const b = document.createElement('span'); b.className = 'badge clash'; b.textContent = 'overlap';
        b.title = 'Overlaps existing: ' + clashes.map((e) => e.cidr + (e.label ? ` (${e.label})` : '')).join(', ');
        wrap.append(b);
      }
      cell('', wrap);
    }
    if (visible.divide) {
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'small';
      btn.textContent = 'Divide';
      if (leaf.mask >= limit) {
        btn.disabled = true;
        btn.title = settings.cloud === 'std' ? '/32 is a single address' : `${CLOUDS[settings.cloud].label} subnets can’t be smaller than /${limit}`;
      } else {
        btn.title = `Split into two /${leaf.mask + 1}s`;
        btn.addEventListener('click', () => { checkpoint(); leaf.node.c = [{ c: null }, { c: null }]; update(); });
      }
      const wrap = document.createElement('span');
      wrap.className = 'split-cell';
      wrap.append(btn);
      if (leaf.mask + 2 <= limit) {
        const sel = document.createElement('select');
        sel.className = 'split-sel';
        sel.title = 'Split into equal subnets of one size';
        sel.setAttribute('aria-label', `Split ${key} into equal subnets`);
        sel.add(new Option('/N', ''));
        for (let n = leaf.mask + 2; n <= Math.min(limit, leaf.mask + 12); n++) sel.add(new Option(`/${n} × ${fmt(2 ** (n - leaf.mask))}`, n));
        sel.addEventListener('change', () => {
          const n = +sel.value;
          if (!n) return;
          checkpoint();
          splitTo(leaf.node, leaf.mask, n);
          selKey = cidrStr(leaf.addr, n);
          update();
          toast(`Split ${key} into ${fmt(2 ** (n - leaf.mask))} × /${n}`, UNDO);
        });
        wrap.append(sel);
      }
      cell('col-divide', wrap);
    }
    if (visible.group || anyGroup) cell('col-group' + groupCls, groupOf(leaf));
    if (visible.name) {
      const inp = textInput('', 'n', 'Name', 'Name');
      inp.addEventListener('input', () => { firstEdit(inp); setMeta(key, 'n', inp.value.trim() ? inp.value : ''); writeHashSoon(); });
      inp.addEventListener('change', () => renderSummary());   // name checks (Azure's required names) in the warnings strip
      inp.addEventListener('change', renderMap);
      cell('', inp);
    }
    if (visible.vlan) {
      const inp = textInput('vlan', 'v', '—', 'VLAN ID');
      inp.inputMode = 'numeric';
      inp.addEventListener('input', () => {
        firstEdit(inp);
        const v = inp.value.trim();
        const ok = v === '' || validVlan(v);
        inp.setAttribute('aria-invalid', String(!ok));
        inp.title = ok ? '' : 'VLAN IDs run from 1 to 4094';
        if (ok) { setMeta(key, 'v', v ? String(+v) : ''); writeHashSoon(); }
      });
      inp.addEventListener('change', () => { renderSummary(); renderMap(); });
      cell('', inp);
    }
    if (visible.zone) {
      const inp = textInput('zone', 'z', '—', 'Availability zone');
      inp.title = 'Availability zone or site, e.g. us-east-1a';
      inp.addEventListener('input', () => { firstEdit(inp); setMeta(key, 'z', inp.value.trim() ? inp.value.trim() : ''); writeHashSoon(); });
      cell('', inp);
    }
    if (visible.netmask) cell('mono', ntoa(netmask(leaf.mask)));
    if (visible.wildcard) cell('mono', ntoa(wildcard(leaf.mask)));
    if (visible.range) cell('mono', `${ntoa(leaf.addr)} – ${ntoa(info.last)}`);
    if (visible.usable) cell('mono', info.uF === null ? '—' : (info.uF === info.uL ? ntoa(info.uF) : `${ntoa(info.uF)} – ${ntoa(info.uL)}`));
    if (visible.gateway) cell('mono', info.gw === null ? '—' : ntoa(info.gw));
    if (visible.hosts) {
      // Usable hosts, or "assigned / usable" with a fill bar once addresses are assigned. Opens the IP list.
      const n = hostsIn(leaf.addr, leaf.mask).length;
      const b = document.createElement('button');
      b.type = 'button'; b.className = 'hosts-btn' + (n ? ' has' : '');
      if (n) {
        const t = document.createElement('span'); t.textContent = `${fmt(n)} / ${fmt(info.hosts)}`;
        const bar = document.createElement('i'); bar.style.setProperty('--p', Math.min(100, (100 * n) / Math.max(1, info.hosts)) + '%');
        b.append(t, bar);
      } else b.textContent = fmt(info.hosts);
      b.title = n ? `${fmt(n)} of ${fmt(info.hosts)} usable addresses assigned. Click to see or assign IPs.` : `${fmt(info.hosts)} usable hosts. Click to assign IP addresses.`;
      b.setAttribute('aria-label', `${b.title} (${key})`);
      b.addEventListener('click', () => openHosts(key));
      cell('mono num col-hosts', b);
    }
    if (visible.status) {
      const sel = document.createElement('select');
      sel.className = 'status ' + (meta.s || 'free');
      sel.setAttribute('aria-label', `Status of ${key}`);
      for (const [v, l] of [['free', 'Free'], ['used', 'In use'], ['reserved', 'Reserved']]) {
        const o = document.createElement('option'); o.value = v; o.textContent = l; sel.appendChild(o);
      }
      sel.value = meta.s || 'free';
      sel.addEventListener('change', () => { checkpoint(); setMeta(key, 's', sel.value === 'free' ? '' : sel.value); update(); });
      cell('', sel);
    }
    if (visible.note) {
      const inp = textInput('note', 'o', 'Notes', 'Notes');
      inp.addEventListener('input', () => { firstEdit(inp); setMeta(key, 'o', inp.value.trim() ? inp.value : ''); writeHashSoon(); });
      cell('', inp);
    }
    if (visible.binary) cell('mono bin', null).innerHTML = binHtml(leaf.addr, leaf.mask);
    if (visible.join) {
      const own = document.createElement('td');
      own.className = 'bar leaf';
      own.style.setProperty('--h', String(hueFor(leaf.mask)));
      own.colSpan = H - leaf.depth + 1;
      own.textContent = '/' + leaf.mask;
      tr.appendChild(own);

      for (let i = leaf.opening.length - 1; i >= 0; i--) {
        const anc = leaf.opening[i];
        const span = leafCount(anc.node);
        const td = document.createElement('td');
        td.className = 'bar joinable';
        td.style.setProperty('--h', String(hueFor(anc.mask)));
        td.rowSpan = span;
        const gkey = cidrStr(anc.addr, anc.mask), gname = getMeta(gkey).n || '';
        td.title = `Join ${span} subnets into ${gname ? gname + ' (' + gkey + ')' : gkey}`;
        // A real button joins; the rename button sits beside it (not inside, where screen readers can't reach it).
        td.innerHTML = `<button type="button" class="bar-join" aria-label="${esc(td.title)}">${gname ? `<span class="gname">${esc(gname)}</span>` : ''}/${anc.mask}</button><span class="hint" aria-hidden="true">join</span>`;
        // Name or rename the group, except on the base network's own bar (its name is on the network card).
        if (anc.mask > state.mask) {
          const ed = document.createElement('button');
          ed.type = 'button';
          ed.className = 'gedit';
          ed.title = gname ? `Rename the group ${gname} (${gkey})` : `Name the group ${gkey}`;
          ed.setAttribute('aria-label', ed.title);
          ed.addEventListener('click', (e) => { e.stopPropagation(); editGroup(td, gkey, gname); });
          td.insertBefore(ed, td.querySelector('.hint'));
        }
        const first = idx, lastIdx = idx + span - 1;
        const hl = (on) => {
          for (let r = first; r <= lastIdx; r++) body.rows[r] && body.rows[r].classList.toggle('hl', on);
        };
        td.addEventListener('mouseenter', () => hl(true));
        td.addEventListener('mouseleave', () => hl(false));
        td.addEventListener('focusin', () => hl(true));
        td.addEventListener('focusout', () => hl(false));
        const doJoin = () => { checkpoint(); anc.node.c = null; update(); toast(`Joined ${span} subnets into ${cidrStr(anc.addr, anc.mask)}`, UNDO); };
        td.addEventListener('click', (e) => { if (!/** @type {any} */ (e.target).closest('.gedit, .gedit-in')) doJoin(); });
        tr.appendChild(td);
      }
    }
    body.appendChild(tr);
  });
  renderSummary();
  renderMap();
  return foundRow;
};

const update = () => { render(); writeHash(); };

// Name a group in place: the bar becomes a text box. Enter or leaving the box saves, Escape cancels.
const editGroup = (td, key, old) => {
  const inp = document.createElement('input');
  inp.type = 'text';
  inp.className = 'gedit-in';
  inp.spellcheck = false;
  inp.maxLength = 64;
  inp.value = old;
  inp.placeholder = 'Group name';
  inp.setAttribute('aria-label', `Group name for ${key}`);
  td.textContent = '';
  td.appendChild(inp);
  inp.focus(); inp.select();
  let done = false;
  const finish = (save) => {
    if (done) return;
    done = true;
    const v = oneLine(inp.value).trim();
    if (!save || v === old) { render(); return; }
    checkpoint();
    setMeta(key, 'n', v);
    update();
    toast(v ? `Named ${key} ${v}` : `Removed the group name from ${key}`, UNDO);
  };
  inp.addEventListener('keydown', (e) => {
    e.stopPropagation();   // not the table's shortcuts, and not Enter-to-join on the bar
    if (e.key === 'Enter') { e.preventDefault(); finish(true); } else if (e.key === 'Escape') { e.preventDefault(); finish(false); }
  });
  inp.addEventListener('blur', () => finish(true));
};

// ---------- Keyboard: select a row, then D divide, J join, S status, Enter rename ----------
/** @type {string | null} */
let selKey = null;
const selectRow = (key, scroll = true) => {
  selKey = key;
  for (const tr of $('body').rows) {
    const on = tr.dataset.key === key;
    tr.classList.toggle('sel', on);
    if (on) { tr.setAttribute('aria-selected', 'true'); if (scroll) tr.scrollIntoView({ block: 'nearest' }); }
    else tr.removeAttribute('aria-selected');
  }
};
const selRow = () => rows.find((r) => r.key === selKey);
const keyDivide = () => {
  const r = selRow();
  if (!r) return;
  if (r.mask >= divLimit()) { toast(settings.cloud === 'std' ? 'A /32 can’t be divided' : `${CLOUDS[settings.cloud].label} subnets can’t be smaller than /${divLimit()}`); return; }
  checkpoint();
  r.node.c = [{ c: null }, { c: null }];
  selKey = cidrStr(r.addr, r.mask + 1);
  update();
};
const keyJoin = () => {
  const r = selRow();
  if (!r || r.mask <= state.mask) { toast('Nothing to join: this is the whole base network'); return; }
  const pa = netAddr(r.addr, r.mask - 1);
  const parent = findNode(blk(), pa, r.mask - 1);
  if (!parent || !parent.c) return;
  checkpoint();
  const n = leafCount(parent);
  parent.c = null;
  selKey = cidrStr(pa, r.mask - 1);
  update();
  toast(`Joined ${n} subnets into ${selKey}`, UNDO);
};
const keyStatus = () => {
  const r = selRow();
  if (!r) return;
  const order = ['', 'used', 'reserved'];
  const next = order[(order.indexOf(getMeta(r.key).s || '') + 1) % 3];
  checkpoint();
  setMeta(r.key, 's', next);
  update();
  toast(`${r.key}: ${next === 'used' ? 'In use' : next === 'reserved' ? 'Reserved' : 'Free'}`);
};
const keyMove = (d) => {
  if (!rows.length) return;
  const i = rows.findIndex((r) => r.key === selKey);
  const j = i < 0 ? (d > 0 ? 0 : rows.length - 1) : Math.max(0, Math.min(rows.length - 1, i + d));
  selectRow(rows[j].key);
};
const openKeys = () => { const d = $('keysDlg'); if (typeof d.showModal === 'function') d.showModal(); else d.setAttribute('open', ''); };
document.addEventListener('keydown', (e) => {
  if (e.metaKey || e.ctrlKey || e.altKey || e.defaultPrevented) return;
  if ($('tab-plan').hidden || document.querySelector('dialog[open]')) return;
  const t = /** @type {any} */ (e.target);
  if (t && (t.tagName === 'TEXTAREA' || t.tagName === 'SELECT' || (t.tagName === 'INPUT' && !['checkbox', 'radio', 'button', 'file'].includes(t.type)))) return;
  const k = e.key;
  if (k === '?') { e.preventDefault(); openKeys(); return; }
  if (k === 'ArrowDown' || k === 'ArrowUp') { e.preventDefault(); keyMove(k === 'ArrowDown' ? 1 : -1); return; }
  if (!selRow()) return;
  if (k === 'd' || k === 'D') { e.preventDefault(); keyDivide(); }
  else if (k === 'j' || k === 'J') { e.preventDefault(); keyJoin(); }
  else if (k === 's' || k === 'S') { e.preventDefault(); keyStatus(); }
  else if (k === 'Enter' && !(t && t.closest && t.closest('button, td.bar, a'))) {
    const tr = [...$('body').rows].find((x) => x.dataset.key === selKey);
    const inp = tr && tr.querySelector('input.cell-input');
    if (inp) { e.preventDefault(); inp.focus(); inp.select(); }
  } else if (k === 'Escape') selectRow(null);
});
$('keysClose').addEventListener('click', () => $('keysDlg').close());
$('keysDlg').addEventListener('click', (e) => { if (e.target === $('keysDlg')) $('keysDlg').close(); });
$('keysBtn').addEventListener('click', openKeys);

// ---------- Address map: the active base network as a grid of up to 256 equal squares ----------
let mapOpen = true, mapMode = 'status';
try {
  mapOpen = localStorage.getItem('subnetPlanner.mapOpen') !== '0';
  mapMode = localStorage.getItem('subnetPlanner.mapColor') === 'vlan' ? 'vlan' : 'status';
} catch (e) { /* ignore */ }
const vlanHue = (v) => Math.round((Number(v) * 137.508) % 360);
const flashRow = (idx) => {
  const tr = $('body').rows[idx];
  if (!tr) return;
  tr.scrollIntoView({ block: 'center', behavior: 'smooth' });
  tr.classList.add('flash');
  setTimeout(() => tr.classList.remove('flash'), 1600);
  const inp = tr.querySelector('input');
  if (inp) inp.focus({ preventScroll: true });
};
const leafLook = (r) => {
  const m = getMeta(r.key);
  if (mapMode === 'vlan') return m.v ? { cls: 'vl', h: vlanHue(m.v) } : { cls: '' };
  return { cls: m.s || '' };
};
const leafTitle = (r) => {
  const m = getMeta(r.key);
  return [r.key, m.n, m.v ? `VLAN ${m.v}` : '', m.z || '', m.s === 'used' ? 'In use' : m.s === 'reserved' ? 'Reserved' : 'Free', `${fmt(size(r.mask))} addresses`].filter(Boolean).join(' · ');
};
const renderMap = () => {
  const map = $('map');
  $('mapToggle').setAttribute('aria-expanded', String(mapOpen));
  $('mapToggle').textContent = (mapOpen ? '▾' : '▸') + ' Address map';
  $('mapColor').value = mapMode;
  map.hidden = $('mapLegend').hidden = !mapOpen;
  $('mapColor').parentElement.hidden = !mapOpen;
  const u = Math.min(state.mask + 8, 32);       // mask of one square
  const cells = size(state.mask) / size(u);  // 1 .. 256
  const cols = Math.min(16, cells);
  $('mapScale').textContent = mapOpen ? `Each square is a /${u} (${fmt(size(u))} address${u === 32 ? '' : 'es'})` : '';
  if (!mapOpen) { map.innerHTML = ''; return; }
  map.style.setProperty('--cols', cols);
  map.innerHTML = '';
  const frag = document.createDocumentFragment();
  const mk = (r, idx, cls, extra) => {
    const d = document.createElement('div');
    d.className = 'mc ' + cls;
    d.tabIndex = 0;
    d.setAttribute('role', 'button');
    d.title = extra || leafTitle(r);
    d.setAttribute('aria-label', d.title);
    if (foundIp !== null && inBlock(foundIp, r.addr, r.mask)) d.classList.add('found');
    d.addEventListener('click', () => flashRow(idx));
    d.addEventListener('keydown', (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); flashRow(idx); } });
    return d;
  };
  const clashes = (r) => existing.some((e) => overlaps(e.addr, e.mask, r.addr, r.mask));
  let i = 0;
  while (i < rows.length) {
    const r = rows[i];
    const cell = Math.floor((r.addr - state.network) / size(u));
    const col = cell % cols, row = Math.floor(cell / cols);
    if (r.mask <= u) {
      // One subnet covering one or more whole squares: always a rectangle, because subnets are aligned.
      const k = size(r.mask) / size(u);
      const look = leafLook(r);
      const d = mk(r, i, look.cls);
      if (look.h != null) d.style.setProperty('--h', String(look.h));
      if (clashes(r)) d.classList.add('clash');
      d.style.gridColumn = `${col + 1} / span ${Math.min(k, cols)}`;
      d.style.gridRow = `${row + 1} / span ${Math.max(1, k / cols)}`;
      const m = getMeta(r.key);
      if (k >= 2) d.textContent = m.n || `/${r.mask}`;
      frag.appendChild(d);
      i++;
    } else {
      // Several subnets smaller than one square share it: draw them as proportional slivers.
      const start = i, cellEnd = state.network + (cell + 1) * size(u);
      while (i < rows.length && rows[i].addr < cellEnd) i++;
      const inside = rows.slice(start, i);
      const d = mk(r, start, 'mix', `${cidrStr(state.network + cell * size(u), u)}: ${inside.length} subnets\n` + inside.slice(0, 12).map(leafTitle).join('\n') + (inside.length > 12 ? `\n…and ${inside.length - 12} more` : ''));
      d.style.gridColumn = `${col + 1}`;
      d.style.gridRow = `${row + 1}`;
      if (inside.some(clashes)) d.classList.add('clash');
      for (const x of inside.slice(0, 32)) {
        const look = leafLook(x);
        const sl = document.createElement('i');
        sl.className = look.cls;
        if (look.h != null) sl.style.setProperty('--h', String(look.h));
        sl.style.setProperty('--w', String(size(x.mask)));
        d.appendChild(sl);
      }
      frag.appendChild(d);
    }
  }
  map.appendChild(frag);
  // Legend: status colors are already explained by the usage bar; VLAN mode lists the VLANs.
  const leg = $('mapLegend');
  if (mapMode === 'vlan') {
    const vl = [...new Set(rows.map((r) => getMeta(r.key).v).filter(Boolean))].sort((a, b) => a - b);
    leg.innerHTML = vl.length
      ? vl.slice(0, 24).map((v) => `<span><i style="background:hsl(${vlanHue(v)} var(--bar-s) 55%)"></i>VLAN ${esc(v)}</span>`).join('') + (vl.length > 24 ? `<span>+${vl.length - 24} more</span>` : '') + '<span><i style="background:var(--border)"></i>No VLAN</span>'
      : '<span>No VLANs set yet. Type one in the VLAN column.</span>';
  } else leg.innerHTML = '';
  leg.hidden = !leg.innerHTML;
};
$('mapToggle').addEventListener('click', () => {
  mapOpen = !mapOpen;
  try { localStorage.setItem('subnetPlanner.mapOpen', mapOpen ? '1' : '0'); } catch (e) { /* ignore */ }
  renderMap();
});
$('mapColor').addEventListener('change', () => {
  mapMode = $('mapColor').value;
  try { localStorage.setItem('subnetPlanner.mapColor', mapMode); } catch (e) { /* ignore */ }
  renderMap();
});

const syncControls = () => {
  netInput.value = ntoa(state.network);
  maskInput.value = state.mask;
  $('platform').value = settings.cloud;
  $('blockLabel').value = blk().label || '';
  $('gwPos').value = settings.gw;
  // Cloud platforms fix the gateway at .1, so the choice only applies to Standard.
  $('gwField').hidden = settings.cloud !== 'std';
  $('gwPos').title = 'Which address in each subnet is the router/gateway';
  $('v6Net').value = v6Key(v6.net, v6.mask);
  tplSync();
};

const showColumn = (key) => {
  visible[key] = true;
  const label = (COLS.find((c) => c.key === key) || {}).label;
  const chip = [...document.querySelectorAll('#chips .chip')].find((c) => c.textContent === label);
  if (chip) chip.setAttribute('aria-pressed', 'true');
  try { localStorage.setItem('subnetPlanner.cols', JSON.stringify(visible)); } catch (e) { /* ignore */ }
};
// ---------- Column chips ----------
const chips = $('chips');
for (const col of COLS) {
  const b = document.createElement('button');
  b.type = 'button';
  b.className = 'chip';
  b.textContent = col.label;
  b.setAttribute('aria-pressed', String(!!visible[col.key]));
  if (col.locked) {
    b.disabled = true;
    b.title = `${col.label} is always shown`;
    chips.appendChild(b);
    continue;
  }
  b.addEventListener('click', () => {
    visible[col.key] = !visible[col.key];
    b.setAttribute('aria-pressed', String(visible[col.key]));
    try { localStorage.setItem('subnetPlanner.cols', JSON.stringify(visible)); } catch (e) { /* ignore */ }
    render();
  });
  chips.appendChild(b);
}

// ---------- Plan form ----------
netInput.addEventListener('input', () => {
  const m = /^\s*([\d.]+)\s*\/\s*(\d{1,2})\s*$/.exec(netInput.value);
  if (m) { netInput.value = m[1]; maskInput.value = m[2]; }
  netInput.removeAttribute('aria-invalid');
  maskInput.removeAttribute('aria-invalid');
});
maskInput.addEventListener('input', () => maskInput.removeAttribute('aria-invalid'));

// Apply the typed base network. Runs on Update / Enter and when the address or mask field is left after an edit,
// so dividing straight after typing works on the new network. A toast with Undo confirms every change.
const applyBase = () => {
  clearMsg('msg');
  const n = aton(netInput.value);
  const m = Number(maskInput.value);
  if (n === null) {
    netInput.setAttribute('aria-invalid', 'true');
    showMsg('msg', 'That isn’t a valid IPv4 address. Use four numbers from 0 to 255, like 10.0.0.0.', 'error');
    return;
  }
  if (!Number.isInteger(m) || m < 0 || m > 32) {
    maskInput.setAttribute('aria-invalid', 'true');
    showMsg('msg', 'Mask bits must be a whole number from 0 to 32.', 'error');
    return;
  }
  const aligned = netAddr(n, m);
  if (aligned !== n) {
    netInput.value = ntoa(aligned);
    showMsg('msg', `${ntoa(n)} isn’t on a /${m} boundary, so it was adjusted to ${ntoa(aligned)}.`, 'info');
  }
  const label = $('blockLabel').value.trim();
  const same = m === state.mask && aligned === state.network;
  if (same && label === (blk().label || '')) return;   // nothing changed (e.g. Update after leaving the field applied it)
  const clash = blockClash(aligned, m, state.active);
  if (clash) {
    showMsg('msg', `${cidrStr(aligned, m)} overlaps ${blockCidr(clash)}, which is already a base network in this plan.`, 'error');
    return;
  }
  const hasWork = state.root.c || blockMetaKeys().length;
  const reset = !same && m !== state.mask && hasWork;
  if (reset && !confirm(`Changing the base network from /${state.mask} to /${m} will reset your splits, names and VLANs. Continue?`)) {
    netInput.value = ntoa(state.network);
    maskInput.value = state.mask;
    return;
  }
  checkpoint();
  const oldC = blockCidr(blk());
  blk().label = label;
  if (!same) {
    if (m !== state.mask) { state.root = { c: null }; clearBlockMeta(); state.mask = m; }
    else {
      // Same size, new address: carry names and VLANs across to the matching subnets.
      const shift = aligned - state.network, moved = {};
      for (const k of blockMetaKeys()) {
        const c = /** @type {{ addr: number, mask: number }} */ (parseCidr(k));   // blockMetaKeys only returns keys that parse
        moved[cidrStr(c.addr + shift, c.mask)] = state.meta[k];
        delete state.meta[k];
      }
      Object.assign(state.meta, moved);
    }
  }
  state.network = aligned;
  renamePeers(oldC, blockCidr(blk()));
  update();
  if (!same) toast(`Base network is now ${cidrStr(aligned, m)}${reset ? '; its subnets were reset' : hasWork ? '; names and VLANs moved with it' : ''}`, UNDO);
};
$('netForm').addEventListener('submit', (e) => { e.preventDefault(); applyBase(); });
netInput.addEventListener('change', applyBase);
maskInput.addEventListener('change', applyBase);

$('blockLabel').addEventListener('change', () => {
  checkpoint();
  blk().label = $('blockLabel').value.trim();
  update();
});
// One box adds either a subnet (inside a base network) or a new base network (outside all of them).
const findNode = (b, addr, mask) => {
  let node = b.root, a = b.network, m = b.mask;
  while (m < mask && node.c) {
    const half = size(m + 1);
    if (addr >= a + half) { node = node.c[1]; a += half; } else node = node.c[0];
    m++;
  }
  return m === mask ? node : null;
};
$('addForm').addEventListener('submit', (e) => {
  e.preventDefault();
  clearMsg('msg');
  const raw = $('addIn').value.trim();
  if (!raw) return;
  const p = parseLine(raw);
  if (!parsedOk(p) || !/^\d{1,3}(?:\.\d{1,3}){3}\s*(?:\/|255\.)/.test(raw)) {
    showMsg('msg', 'Enter a network with its prefix length, like 10.0.5.0/24, optionally followed by a name.', 'error');
    return;
  }
  const bi = state.blocks.findIndex((b) => p.mask >= b.mask && inBlock(p.addr, b.network, b.mask));
  if (bi >= 0) {
    const b = state.blocks[bi];
    if (p.mask > CLOUDS[b.cloud].min) {
      showMsg('msg', `${CLOUDS[b.cloud].label} subnets can’t be smaller than /${CLOUDS[b.cloud].min}.`, 'error');
      return;
    }
    const existingNode = findNode(b, p.addr, p.mask);
    if (existingNode && existingNode.c) {
      const n = leafCount(existingNode);
      if (!confirm(`${p.cidr} is already divided into ${n} subnets. Join them into one?`)) return;
    }
    checkpoint();
    state.active = bi;
    carve(b.root, b.network, b.mask, p.addr, p.mask);
    if (p.label) setMeta(p.cidr, 'n', p.label);
    syncControls();
    update();
    toast(`Added ${p.cidr}${p.label ? ` (${p.label})` : ''}${state.blocks.length > 1 ? ` in ${blockCidr(b)}` : ''}`);
  } else {
    const clash = blockClash(p.addr, p.mask);
    if (clash) {
      showMsg('msg', `${p.cidr} ${relation(p.addr, p.mask, clash.network, clash.mask) || 'overlaps'} ${blockCidr(clash)}, which is already a base network. Base networks can’t overlap.`, 'error');
      return;
    }
    checkpoint();
    state.blocks.push(mkBlock(p.addr, p.mask, settings.cloud, p.label.slice(0, 40)));
    state.active = state.blocks.length - 1;
    syncControls();
    update();
    toast(`Added base network ${p.cidr}. Switch between networks with the buttons above.`);
  }
  if (!p.aligned) showMsg('msg', `Host bits were set, so ${raw.split(/\s/)[0]} became ${p.cidr}.`, 'info');
  $('addIn').value = '';
});

$('platform').addEventListener('change', () => {
  checkpoint();
  settings.cloud = $('platform').value;
  syncControls();
  update();
  const lim = divLimit();
  if (settings.cloud !== 'std') toast(`${CLOUDS[settings.cloud].label}: gateway is always .1, ${hostInfo(0, 24).reserved.length} addresses reserved per subnet, smallest /${lim}`);
});
$('gwPos').addEventListener('change', () => {
  checkpoint();
  settings.gw = $('gwPos').value;
  if (!visible.gateway) {
    visible.gateway = true;
    const chip = [...document.querySelectorAll('#chips .chip')].find((c) => c.textContent === 'Gateway');
    if (chip) chip.setAttribute('aria-pressed', 'true');
    try { localStorage.setItem('subnetPlanner.cols', JSON.stringify(visible)); } catch (e) { /* ignore */ }
  }
  update();
  const eg = rows[0] && hostInfo(rows[0].addr, rows[0].mask).gw;
  toast(`Gateway is now the ${settings.gw} usable address${eg != null ? ` (e.g. ${ntoa(eg)} in ${rows[0].key})` : ''}`);
  if (foundIp !== null) runFind(false);
});

const runFind = (scroll) => {
  const v = $('findIp').value.trim();
  const out = $('findOut');
  $('findIp').removeAttribute('aria-invalid');
  out.classList.remove('miss');
  if (!v) { foundIp = null; out.textContent = ''; render(); return; }
  const ip = aton(v);
  if (ip === null) { foundIp = null; out.textContent = ''; render(); if (/^\d+\.\d+\.\d+\.\d+/.test(v)) $('findIp').setAttribute('aria-invalid', 'true'); return; }
  foundIp = ip;
  const bi = blockOf(ip);
  if (bi >= 0 && bi !== state.active) { state.active = bi; syncControls(); writeHashSoon(); }
  const row = render();
  const leaf = rows.find((r) => inBlock(ip, r.addr, r.mask));
  if (!leaf) { out.classList.add('miss'); out.innerHTML = `<b class="mono">${ntoa(ip)}</b> is outside this plan (${esc(state.blocks.map(blockCidr).join(', '))}).`; return; }
  const info = hostInfo(leaf.addr, leaf.mask);
  const res = info.reserved.find(([a]) => a === ip);
  let role;
  if (res) role = res[1];
  else if (ip === info.gw) role = 'the gateway';
  else if (info.uF !== null && info.uL !== null && ip >= info.uF && ip <= info.uL) role = `usable host #${fmt(ip - info.uF + 1)} of ${fmt(info.hosts)}`;
  else role = 'not usable on this platform';
  const name = getMeta(leaf.key).n;
  const hst = state.hosts[ntoa(ip)];
  const who = hst ? ` Assigned to <b>${esc(hst.n || hst.m || 'a host')}</b>${hst.n && hst.m ? ` <span class="mono">${esc(hst.m)}</span>` : ''}.` : '';
  out.innerHTML = `<b class="mono">${ntoa(ip)}</b> is in <b class="mono">${leaf.key}</b>${name ? ` (${esc(name)})` : ''}: ${esc(role)}.${who}`;
  if (scroll && row) row.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
};
$('findIp').addEventListener('input', () => runFind(true));
$('findIp').addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); runFind(true); } });

$('splitAllBtn').addEventListener('click', () => {
  const n = +$('splitAllSel').value;
  if (!n) return;
  const before = leafCount(state.root), after = leavesAfterSplit(state.root, state.mask, n);
  if (after === before) { toast(`Every subnet is already /${n} or smaller`); return; }
  checkpoint();
  splitAll(state.root, state.mask, n);
  update();
  toast(`Split ${blockCidr(blk())} into /${n}s: ${fmt(before)} → ${fmt(after)} subnets`, UNDO);
});
$('resetBtn').addEventListener('click', () => {
  if (!state.root.c) return;
  if (blockMetaKeys().length && !confirm('Join everything back into the base network? Names and VLANs on the joined subnets will be dropped from the link.')) return;
  checkpoint();
  state.root = { c: null };
  update();
  toast('Joined back into one network', UNDO);
});
$('undoBtn').addEventListener('click', undo);
$('redoBtn').addEventListener('click', redo);
$('v6Undo').addEventListener('click', undo);
document.addEventListener('keydown', (e) => {
  if (!(e.metaKey || e.ctrlKey) || e.altKey) return;
  const k = e.key.toLowerCase();
  if (k !== 'z' && k !== 'y') return;
  const t = /** @type {any} */ (e.target);
  // Leave text fields to the browser's own undo.
  if (t && (t.tagName === 'TEXTAREA' || (t.tagName === 'INPUT' && !['checkbox', 'radio', 'button', 'file'].includes(t.type)))) return;
  e.preventDefault();
  if (k === 'y' || e.shiftKey) redo(); else undo();
});
$('linkBtn').addEventListener('click', async () => {
  await writeHash();
  toast((await copyText(location.href)) ? 'Link copied' : 'Couldn’t copy. Use the address bar.');
});
$('printBtn').addEventListener('click', () => window.print());
// Export menu: Copy CSV, Print, and a way to the Export tab's other formats.
const exMenu = (open) => {
  $('exMenu').hidden = !open;
  $('exMenuBtn').setAttribute('aria-expanded', String(open));
  // Open toward the side with room: right-aligned under a button at the right, left-aligned on a phone.
  if (open) $('exMenu').classList.toggle('left', $('exMenuBtn').getBoundingClientRect().right < $('exMenu').offsetWidth + 16);
};
$('exMenuBtn').addEventListener('click', (e) => { e.stopPropagation(); exMenu($('exMenu').hidden); if (!$('exMenu').hidden) $('csvBtn').focus(); });
$('exMenu').addEventListener('click', () => exMenu(false));
$('exMenu').addEventListener('keydown', (e) => {
  e.stopPropagation();   // arrows and Escape here aren't the table's shortcuts
  const items = [...$('exMenu').querySelectorAll('button')], i = items.indexOf(document.activeElement);
  if (e.key === 'Escape') { e.preventDefault(); exMenu(false); $('exMenuBtn').focus(); }
  else if (e.key === 'ArrowDown' || e.key === 'ArrowUp') { e.preventDefault(); items[(i + (e.key === 'ArrowDown' ? 1 : items.length - 1)) % items.length].focus(); }
});
document.addEventListener('click', (e) => { if (!/** @type {any} */ (e.target).closest('.menu')) exMenu(false); });
$('exMoreBtn').addEventListener('click', () => $('tb-export').click());

// CSV columns, keyed to the table columns they come from.
const CSV_COLS = [
  { key: 'subnet',   head: ['Subnet'],                        val: (r) => [r.key] },
  { key: 'group',    head: ['Group'],                         val: (r) => [groupOf(r)] },
  { key: 'name',     head: ['Name'],                          val: (r, i, m) => [m.n || ''] },
  { key: 'vlan',     head: ['VLAN'],                          val: (r, i, m) => [m.v || ''] },
  { key: 'zone',     head: ['Zone'],                          val: (r, i, m) => [m.z || ''] },
  { key: 'netmask',  head: ['Netmask'],                       val: (r) => [ntoa(netmask(r.mask))] },
  { key: 'wildcard', head: ['Wildcard'],                      val: (r) => [ntoa(wildcard(r.mask))] },
  { key: 'range',    head: ['First address', 'Last address'], val: (r, i) => [ntoa(r.addr), ntoa(i.last)] },
  { key: 'usable',   head: ['First usable', 'Last usable'],   val: (r, i) => (i.uF === null ? ['', ''] : [ntoa(i.uF), ntoa(i.uL)]) },
  { key: 'gateway',  head: ['Gateway'],                       val: (r, i) => [i.gw === null ? '' : ntoa(i.gw)] },
  { key: 'hosts',    head: ['Hosts'],                         val: (r, i) => [i.hosts] },
  { key: 'status',   head: ['Status'],                        val: (r, i, m) => [m.s || 'free'] },
  { key: 'azsvc',    head: ['Cloud service'],                 val: (r, i, m) => [m.d ? SVC_BY_ID[m.d].label : ''] },
  { key: 'note',     head: ['Notes'],                         val: (r, i, m) => [m.o || ''] },
  { key: 'binary',   head: ['Binary'],                        val: (r) => [binText(r.addr)] },
];
// onlyVisible: the Copy CSV button (active base network, shown columns). Otherwise every base network, every column.
const buildMatrix = (onlyVisible) => {
  const src = onlyVisible ? rows : allRows();
  const anyZone = allRows().some((r) => getMeta(r.key).z), anyAz = allRows().some((r) => getMeta(r.key).d);
  // Group appears only when some divided subnet has a name, so plans without one export exactly as before.
  const anyGroup = src.some((r) => groupOf(r));
  const cols = CSV_COLS.filter((c) => (c.key === 'azsvc' ? anyAz : c.key === 'group' ? anyGroup : onlyVisible ? visible[c.key] : c.key !== 'zone' || anyZone));
  const multi = !onlyVisible && state.blocks.length > 1;
  const named = multi && state.blocks.some((b) => b.label);
  const head = (multi ? ['Base network'] : []).concat(named ? ['Network name'] : [], cols.flatMap((c) => c.head));
  const data = src.map((r) => {
    const i = hostInfo(r.addr, r.mask, r.cloud), m = getMeta(r.key), b = state.blocks[r.bi];
    return (multi ? [blockCidr(b)] : []).concat(named ? [b.label || ''] : [], cols.flatMap((c) => c.val(r, i, m)));
  });
  return { head, rows: data, ncols: head.length };
};
const buildCsv = (onlyVisible) => {
  const m = buildMatrix(onlyVisible);
  return { text: [m.head, ...m.rows].map((r) => r.map(csvQ).join(',')).join('\n'), ncols: m.ncols };
};
$('csvBtn').addEventListener('click', async () => {
  const { text, ncols } = buildCsv(true);
  toast((await copyText(text)) ? `Copied ${rows.length} rows (${ncols} columns) as CSV` : 'Couldn’t copy CSV');
});
