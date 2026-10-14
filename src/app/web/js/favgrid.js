// Koru — favgrid.js
/* ---------- Favoritos: grade de cards redimensionáveis, com páginas na horizontal ---------- */
let favGridDim = '4x12';            // linhas x colunas (Configuração → Favoritos)
const fg = { items: [], place: [], pages: 1, page: 0, sel: 0 };
let fgInfoOpen = false;
// grade fixa: tamanho escolhido nas configurações. Grade livre: automática pela proporção da tela —
// 7 linhas e quantas colunas couberem com células quadradas (16:9 ≈ 7 × 16, 4:3 ≈ 7 × 11, 21:9 ≈ 7 × 22)
let fgFreeDimCache = null;
function fgFreeDim() {
  const v = $('fgView') && $('fgView').getBoundingClientRect();
  const w = v && v.width > 50 ? v.width : innerWidth * .95, h = v && v.height > 50 ? v.height : innerHeight * .72, gap = 20, pad = 36, R = 7;
  const cell = (h - pad - gap * (R - 1)) / R, C = Math.max(8, Math.min(30, Math.floor((w - pad + gap) / (cell + gap))));
  if (!fgFreeDimCache || fgFreeDimCache.C !== C) fgFreeDimCache = { R, C };
  return fgFreeDimCache;
}
const fgDim = () => { if (fgFree) return fgFreeDim(); const [r, c] = (favGridDim || '4x12').split('x').map(Number); return { R: r || 4, C: c || 12 }; };
const fgSize = g => { const v = covers['fsz|' + coverKey(g)]; if (!v) return { w: 1, h: 1 }; const [w, h] = v.split(',').map(Number); const { R, C } = fgDim(); return { w: Math.max(1, Math.min(C, w || 1)), h: Math.max(1, Math.min(R, h || 1)) }; };

// posição escolhida pelo usuário (arrastando): 'fpos|chave' = "página,coluna,linha"
const fgPos = g => { const v = covers['fpos|' + coverKey(g)]; if (!v) return null; const [p, x, y] = v.split(',').map(Number); return { p, x, y }; };

// ---------- modo livre ("não alinhar à grade"): cards com tamanho/posição livres, em unidades de célula (1 = célula + espaço) ----------
let fgFree = true; try { fgFree = localStorage.getItem('fgfree') !== '0'; } catch (e) {}
const FR_MIN = .6, FR_MAX = Infinity, FR_STEP = .25;   // sem teto: o limite é o tamanho da página
const fgFr = g => { const v = covers['ffree|' + coverKey(g)]; if (!v) return null; let [p, x, y, w, h] = v.split(',').map(Number); const { R, C } = fgDim(); w = Math.min(w, C); h = Math.min(h, R); x = Math.max(0, Math.min(x, C - w)); y = Math.max(0, Math.min(y, R - h)); return { p, x, y, w, h }; };   // tela com outra proporção: o card continua dentro da página
function fgSetFr(g, q) {
  const key = 'ffree|' + coverKey(g), r2 = n => Math.round(n * 10000) / 10000, val = q ? `${q.p},${r2(q.x)},${r2(q.y)},${r2(q.w)},${r2(q.h)}` : '';
  if (val) covers[key] = val; else delete covers[key];
  api('/api/cover', { method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify({ key, url: val }) }).catch(() => {});
}
// tamanho inicial pelo formato da imagem (capa em pé, tela deitada...)
function fgFrSize(g) {
  const a = cachedArt(g), u = covers[coverKey(g)] || (a && a.box);
  let r = a && a.ratio; if (!r && u) { const d = imgDims[u] || imgDims[cp(u)]; if (d) r = d.w / d.h; }
  r = Math.max(.4, Math.min(2.4, r || .72));
  const h = r > 1.2 ? 1.2 : 1.5, w = Math.max(FR_MIN, Math.min(4, h * r));
  return { w, h };
}
const frHit = (a, b) => a.x < b.x + b.w - .001 && a.x + a.w > b.x + .001 && a.y < b.y + b.h - .001 && a.y + a.h > b.y + .001;
// primeiro lugar livre (de cima para baixo, da esquerda para a direita), encostando nos cards já colocados
function frFit(placed, w, h, startPage) {
  const { R, C } = fgDim();
  for (let p = startPage || 0; p < 60; p++) {
    const on = placed.filter(q => q && q.p === p);
    const xs = [0, ...on.map(q => q.x + q.w)].filter(x => x + w <= C + .001), ys = [0, ...on.map(q => q.y + q.h)].filter(y => y + h <= R + .001);
    xs.sort((a, b) => a - b); ys.sort((a, b) => a - b);
    for (const y of ys) for (const x of xs) { const c = { p, x, y, w, h }; if (!on.some(q => frHit(c, q))) return c; }
  }
  return { p: 60, x: 0, y: 0, w, h };
}
function fgLayoutFree() {
  const { R, C } = fgDim();
  fg.place = fg.items.map(() => null);
  const placed = [];
  fg.items.forEach((g, i) => { const q = fgFr(g); if (q && q.p >= 0 && q.p < 60) { q.w = Math.min(q.w, C); q.h = Math.min(q.h, R); q.x = Math.max(0, Math.min(C - q.w, q.x)); q.y = Math.max(0, Math.min(R - q.h, q.y)); if (!placed.some(o => o.p === q.p && frHit(q, o))) { fg.place[i] = q; placed.push(q); } } });
  fg.items.forEach((g, i) => {
    if (fg.place[i]) return;
    const q = fgFr(g), s = q ? { w: Math.min(q.w, C), h: Math.min(q.h, R) } : fgFrSize(g);
    const c = frFit(placed, s.w, s.h); fg.place[i] = c; placed.push(c);
  });
  const used = [...new Set(fg.place.map(q => q.p))].sort((a, b) => a - b), map = {};
  used.forEach((p, k) => map[p] = k); fg.place.forEach(q => { q.p = map[q.p]; });
  fg.pages = Math.max(1, used.length);
}
function fgPinFree() { fg.items.forEach((g, i) => { const q = fgFr(g), pl = fg.place[i]; if (pl && (!q || q.p !== pl.p || Math.abs(q.x - pl.x) > .005 || Math.abs(q.y - pl.y) > .005 || Math.abs(q.w - pl.w) > .005 || Math.abs(q.h - pl.h) > .005)) fgSetFr(g, pl); }); }
const frStyle = pl => `grid-column:1 / -1;grid-row:1 / -1;position:absolute;left:calc(${pl.x} * (var(--cell) + 20px));top:calc(${pl.y} * (var(--cell) + 20px));width:calc(${pl.w} * (var(--cell) + 20px) - 20px);height:calc(${pl.h} * (var(--cell) + 20px) - 20px)`;
// lote: os cards mantêm a arrumação relativa (linhas/colunas) e ficam encostados no card que está sendo puxado
// lote: os cards ficam em fila como texto (esquerda → direita, de cima para baixo), encostados no card que está sendo puxado;
// quem não couber na linha desce para o começo da linha de baixo
function frBatchLayout(list, w, h, aq) {
  const { R, C } = fgDim(), anc = aq || fg.place[list[0]], out = {}, e = 1e-6;
  const ww = Math.min(w, C), hh = Math.min(h, R);
  const items = list.map(k => ({ k, q: fg.place[k] })).filter(o => o.q && o.q.p === fg.place[list[0]].p);
  // ordem de leitura original: linhas (por altura) e, dentro delas, da esquerda para a direita
  items.sort((a, b) => (Math.abs(a.q.y - b.q.y) < .5 ? 0 : a.q.y - b.q.y) || a.q.x - b.q.x);
  const ka = Math.max(0, items.findIndex(o => o.k === list[0]));
  const before = Math.min(ka, Math.floor(anc.x / ww + e));           // quantos cabem à esquerda do card puxado, na mesma linha
  const x0 = Math.max(0, anc.x - before * ww), cap = Math.max(1, Math.floor((C - x0) / ww + e));
  const ac = Math.min(before, cap - 1);                               // coluna do card puxado na fila
  items.forEach((o, k) => {
    const d = k - ka, pos = ac + d, line = Math.floor(pos / cap), col = ((pos % cap) + cap) % cap;
    const x = Math.max(0, Math.min(C - ww, x0 + col * ww)), y = Math.max(0, Math.min(R - hh, anc.y + line * hh));
    out[o.k] = k === ka ? { p: anc.p, x: anc.x, y: anc.y, w: ww, h: hh } : { p: anc.p, x, y, w: ww, h: hh };
  });
  list.forEach(k => { if (!out[k]) { const o = fg.place[k]; out[k] = { p: o.p, x: o.x, y: o.y, w: Math.min(w, C - o.x), h: Math.min(h, R - o.y) }; } });   // de outra página: fica onde está
  return out;
}
// prévia ao redimensionar (1 card ou lote): mostra na hora onde cada card empurrado vai parar (nada é salvo até soltar)
function frFitAfter(placed, w, h, p0, ox, oy) {
  const { R, C } = fgDim(), e = .001;
  for (let p = p0; p < p0 + 60; p++) {
    const on = placed.filter(q => q && q.p === p);
    const xs = [...new Set([0, ...on.map(q => q.x + q.w), ...(p === p0 ? [ox] : [])])].filter(x => x >= 0 && x + w <= C + e);
    const ys = [...new Set([0, ...on.map(q => q.y + q.h), ...(p === p0 ? [oy] : [])])].filter(y => y >= 0 && y + h <= R + e);
    const cs = []; for (const y of ys) for (const x of xs) if (p > p0 || y > oy + e || (Math.abs(y - oy) <= e && x >= ox - e)) cs.push({ p, x, y, w, h });
    cs.sort((a, b) => (a.y - b.y) || (a.x - b.x));
    const c = cs.find(c => !on.some(q => frHit(c, q))); if (c) return c;
  }
  return frFit(placed, w, h, p0);
}
function frResizePlan(list, w, h, aq) {   // mesma conta para a prévia e para o resultado final
  const { R, C } = fgDim(), set = new Set(list), placed = [], res = {};
  const bl = frBatchLayout(list, w, h, aq); if (aq) bl[list[0]] = { p: aq.p, x: aq.x, y: aq.y, w: aq.w, h: aq.h };
  list.forEach(k => { const q = bl[k]; if (placed.some(r => r.p === q.p && frHit(r, q))) { res[k] = null; } else { placed.push(q); res[k] = q; } });
  fg.place.forEach((r, k) => { if (!set.has(k)) { if (placed.some(q => q.p === r.p && frHit(q, r))) res[k] = null; else placed.push(r); } });
  // empurrados: em ordem de leitura, cada um vai para o próximo espaço livre DEPOIS de onde estava (mesma linha à direita, ou linhas de baixo, começando pela esquerda)
  Object.keys(res).filter(k => res[k] === null).map(Number).sort((a, b) => { const p = fg.place[a], q = fg.place[b]; return (p.p - q.p) || (Math.abs(p.y - q.y) < .5 ? 0 : p.y - q.y) || p.x - q.x; })
    .forEach(k => { const r = fg.place[k], s2 = set.has(k) ? { w: Math.min(w, C), h: Math.min(h, R) } : r; res[k] = frFitAfter(placed, s2.w, s2.h, r.p, r.x, r.y); placed.push(res[k]); });
  return res;
}
function frPreviewResize(list, w, h, aq) {
  const res = frResizePlan(list, w, h, aq);
  const tr = $('fgTrack');
  fg.place.forEach((r, k) => {
    const el = tr.querySelector(`.fgcard[data-i="${k}"]`); if (!el || k === list[0]) return;
    const q = res[k] || r;
    while (tr.children.length <= q.p) fgAddPage();
    if (el.parentNode !== tr.children[q.p]) tr.children[q.p].appendChild(el);
    el.classList.add('pv'); el.style.cssText = frStyle(q);
  });
}
// lote: todos os cards ficam com o mesmo tamanho (cada um no seu lugar); quem ficar por baixo vai para o próximo espaço livre
function frResizeMany(list, w, h, aq) {
  const res = frResizePlan(list, w, h, aq);
  Object.keys(res).forEach(k => fgSetFr(fg.items[+k], res[k]));   // grava exatamente o que a prévia mostrou
  const keep = list.length > 1 ? [...fgMulti].map(k => fg.items[k]) : [];   // lote continua selecionado depois de soltar
  sfx('ok'); renderFavGrid();
  keep.forEach(g => { const k = fg.items.indexOf(g); if (k >= 0) fgMulti.add(k); }); if (keep.length) fgMultiDom();
}
// mover vários cards de uma vez: todos andam o mesmo tanto que o card arrastado (presos às bordas); quem ficar por baixo vai para um espaço livre
function fgMoveMany(i, t) {
  const { R, C } = fgDim(), pl = fg.place[i], dp = t.p - pl.p, dx = t.x - pl.x, dy = t.y - pl.y, sel = [...fgMulti];
  const moved = sel.map(k => { const o = fg.place[k]; return { k, q: { p: Math.max(0, o.p + dp), x: Math.max(0, Math.min(C - o.w, o.x + dx)), y: Math.max(0, Math.min(R - o.h, o.y + dy)), w: o.w, h: o.h } }; });
  if (fgFree) {
    moved.forEach(m => fgSetFr(fg.items[m.k], m.q));
    fg.items.forEach((o, k) => { const r = fg.place[k]; if (!fgMulti.has(k) && r && moved.some(m => m.q.p === r.p && frHit(m.q, r))) fgSetFr(o, { p: -1, x: 0, y: 0, w: r.w, h: r.h }); });
  } else {
    const ints = moved.map(m => ({ k: m.k, q: { p: m.q.p, x: Math.round(m.q.x), y: Math.round(m.q.y), w: m.q.w, h: m.q.h } }));
    ints.forEach(m => fgSetPos(fg.items[m.k], { p: m.q.p, x: m.q.x, y: m.q.y }));
    fg.items.forEach((o, k) => { const r = fg.place[k]; if (!fgMulti.has(k) && r && ints.some(m => m.q.p === r.p && r.x < m.q.x + m.q.w && r.x + r.w > m.q.x && r.y < m.q.y + m.q.h && r.y + r.h > m.q.y)) fgSetPos(o, null); });
  }
  const keep = sel.map(k => fg.items[k]);
  sfx('ok'); renderFavGrid();
  keep.forEach(g => { const k = fg.items.indexOf(g); if (k >= 0) fgMulti.add(k); }); fgMultiDom();   // continua selecionado
}
// soltar/redimensionar o card i em q: quem ficar por baixo vai para o próximo lugar livre (mantendo o tamanho)
function frCommit(i, q) {
  fgSetFr(fg.items[i], q);
  fg.items.forEach((o, k) => { const r = fg.place[k]; if (k !== i && r && r.p === q.p && frHit(q, r)) fgSetFr(o, { p: -1, x: 0, y: 0, w: r.w, h: r.h }); });
  sfx('ok'); renderFavGrid();
}
// encosta nas bordas próximas (página e outros cards) para alinhar sem esforço
function frSnap(i, q) {
  const { R, C } = fgDim(), d = .22, on = fg.place.filter((r, k) => k !== i && r && r.p === q.p);
  const xs = [0, C - q.w, ...on.flatMap(r => [r.x + r.w, r.x - q.w, r.x])], ys = [0, R - q.h, ...on.flatMap(r => [r.y + r.h, r.y - q.h, r.y])];
  let bx = d, by = d; xs.forEach(x => { const e = Math.abs(x - q.x); if (e < bx) { bx = e; q.x = x; } }); ys.forEach(y => { const e = Math.abs(y - q.y); if (e < by) { by = e; q.y = y; } });
  q.x = Math.max(0, Math.min(C - q.w, q.x)); q.y = Math.max(0, Math.min(R - q.h, q.y));
  return q;
}
// "Alinhar automaticamente": mantém a ordem atual (página, linha, coluna) e encosta todos os cards
function fgAutoAlign() {
  const order = fg.items.map((g, i) => i).sort((a, b) => { const p = fg.place[a], q = fg.place[b]; return (p.p - q.p) || (Math.round(p.y * 4) - Math.round(q.y * 4)) || (p.x - q.x); });
  const placed = [];
  order.forEach(i => { const pl = fg.place[i], c = frFit(placed, pl.w, pl.h, placed.length ? placed[placed.length - 1].p : 0); placed.push(c); fgSetFr(fg.items[i], c); });
  sfx('ok'); renderFavGrid(); toast('Cards alinhados');
}
// "Ordenar por nome": encosta todos os cards em ordem alfabética (esquerda → direita, de cima para baixo), mantendo os tamanhos
function fgSortByName() {
  const order = fg.items.map((g, i) => i).sort((a, b) => nameCmp(fg.items[a], fg.items[b]));
  if (fgFree) { const placed = []; order.forEach(i => { const pl = fg.place[i], c = frFit(placed, pl.w, pl.h, placed.length ? placed[placed.length - 1].p : 0); placed.push(c); fgSetFr(fg.items[i], c); }); }
  else order.forEach(i => fgSetPos(fg.items[i], null));   // grade: sem posições fixas, a grade se monta na ordem alfabética
  if (!fgFree) { fg.items.sort(nameCmp); shown = fg.items; }
  sfx('ok'); renderFavGrid(); toast('Ordenados por nome');
}
// trocar entre grade fixa e livre: avisa que a organização atual se perde (posições e tamanhos do modo atual são apagados)
async function fgSetMode(free) {
  if (free === fgFree) return true;
  if (!await ask('Trocar o modo da grade?', 'A organização atual dos cards (posições e tamanhos) será perdida e os Favoritos serão reorganizados.', 'Trocar')) return false;
  const pre = fgFree ? ['ffree|'] : ['fpos|', 'fsz|'];
  Object.keys(covers).filter(k => pre.some(p => k.startsWith(p))).forEach(k => { delete covers[k]; api('/api/cover', { method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify({ key: k, url: '' }) }).catch(() => {}); });
  fgFree = free; try { localStorage.setItem('fgfree', free ? '1' : '0'); } catch (e) {}
  sfx('ok'); if (screen === 'favgrid') renderFavGrid();
  return true;
}
// menus de contexto dos Favoritos: ícones próprios, seções com título e submenus
const SV = d => `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">${d}</svg>`;
Object.assign(ICO, {
  info: SV('<circle cx="12" cy="12" r="9"/><path d="M12 11v6M12 7.5v.5"/>'),
  img: SV('<rect x="5" y="3" width="14" height="18" rx="2"/><circle cx="10" cy="9" r="1.6"/><path d="M5 17l4-4 3 3 2-2 5 5"/>'),
  wall: SV('<rect x="2.5" y="4.5" width="19" height="15" rx="2"/><path d="M2.5 15l5-5 4 4 3-3 7 7"/><circle cx="16.5" cy="8.5" r="1.4"/>'),
  move: SV('<path d="M12 3v18M3 12h18M12 3l-2.5 2.5M12 3l2.5 2.5M12 21l-2.5-2.5M12 21l2.5-2.5M3 12l2.5-2.5M3 12l2.5 2.5M21 12l-2.5-2.5M21 12l-2.5 2.5"/>'),
  resize: SV('<path d="M14 4h6v6M10 20H4v-6M20 4l-7 7M4 20l7-7"/>'),
  grow: SV('<circle cx="11" cy="11" r="7"/><path d="M21 21l-5-5M11 8v6M8 11h6"/>'),
  shrink: SV('<circle cx="11" cy="11" r="7"/><path d="M21 21l-5-5M8 11h6"/>'),
  shape: SV('<rect x="3" y="6" width="8" height="12" rx="1.5"/><rect x="13" y="9" width="8" height="6" rx="1.5"/>'),
  unfav: SV('<path d="M12 3.5l2.6 5.3 5.9.9-4.3 4.1 1 5.8L12 16.9l-5.2 2.7 1-5.8-4.3-4.1 5.9-.9z"/><path d="M4 4l16 16"/>'),
  snap: SV('<path d="M4 4h16v16H4zM4 12h16M12 4v16"/>'),
  auto: SV('<rect x="3" y="4" width="7" height="7" rx="1"/><rect x="12" y="4" width="9" height="7" rx="1"/><rect x="3" y="13" width="11" height="7" rx="1"/><rect x="16" y="13" width="5" height="7" rx="1"/>'),
  az: SV('<path d="M4 18l3.5-10L11 18M5.2 14.5h4.6M14 8h6l-6 10h6"/>'),
  free: SV('<rect x="3" y="3" width="8" height="10" rx="1.5"/><rect x="13" y="6" width="8" height="6" rx="1.5"/><rect x="7" y="15" width="11" height="6" rx="1.5"/>'),
  grid: SV('<rect x="3" y="3" width="7.5" height="7.5" rx="1"/><rect x="13.5" y="3" width="7.5" height="7.5" rx="1"/><rect x="3" y="13.5" width="7.5" height="7.5" rx="1"/><rect x="13.5" y="13.5" width="7.5" height="7.5" rx="1"/>'),
  back: SV('<path d="M15 5l-7 7 7 7"/>'),
  clear: SV('<rect x="3" y="3" width="18" height="18" rx="3" stroke-dasharray="3 3"/><path d="M9 9l6 6M15 9l-6 6"/>'),
  title: SV('<path d="M4 6V4h16v2M12 4v16M9 20h6"/>'),
  org: SV('<path d="M4 6h16M4 12h10M4 18h6"/><path d="M17 15l3 3-3 3"/>'),
});
function ctxHtml(items) { return items.map((it, k) => !it ? '<div class="sep"></div>' : typeof it === 'string' ? `<div class="ch">${it}</div>` : `<div class="ci ${it[3] || ''}" data-k="${k}">${ICO[it[0]] || ''}<span>${it[1]}</span>${it[4] === 1 ? '<b class="sub">›</b>' : ''}</div>`).join(''); }
function ctxBind(m, lvl) {
  m.querySelectorAll('.ci').forEach(el => {
    el.onclick = e => { e.stopPropagation(); const it = (lvl ? ctx2Items : ctxItems)[+el.dataset.k];
      if (it[4] === 1) { if (lvl) { it[2](); return; } if (el.classList.contains('open')) { if (ctxKbOpen) { ctxLvl = 1; ctx2Sel = -1; ctxMove(1); } return; } closeSub(); ctxSubFrom = el; it[2](); return; }
      closeCtx(); it[2](); };
    if (!lvl) el.onmouseenter = () => { clearTimeout(ctxHov); ctxHov = setTimeout(() => { const it = ctxItems[+el.dataset.k]; if (!$('ctx').classList.contains('on')) return; if (it && it[4] === 1) { if (!el.classList.contains('open')) el.click(); } else if ($('ctx2').classList.contains('on')) closeSub(); }, 220); };
  });
  if (!lvl) m.onmouseleave = () => clearTimeout(ctxHov);
}
function fgMenu(items, x, y) {
  if (ctxSubFrom) { const a = ctxSubFrom; ctxSubFrom = null; if ($('ctx').classList.contains('on') && a.isConnected) return ctxOpenSub(a, items); }
  closeSub(); ctxItems = items; const m = $('ctx');
  m.innerHTML = ctxHtml(items); ctxBind(m, 0);
  m.classList.add('on'); ctxSel = -1;
  m.style.maxHeight = (innerHeight - 20) + 'px'; m.style.overflowY = 'auto';
  ctxPlace(m, x, y); ctxMove(1);
}
// submenu ao lado do item que o abriu; vira para a esquerda / sobe quando não cabe na tela
function ctxOpenSub(anchor, items) {
  items = items.filter(it => !(it && it[4] === 2)); while (items.length && !items[0]) items.shift();
  ctx2Items = items; const m = $('ctx2');
  m.innerHTML = ctxHtml(items); ctxBind(m, 1);
  m.style.maxHeight = (innerHeight - 16) + 'px'; m.style.overflowY = 'auto'; m.style.left = '0px'; m.style.top = '0px';
  m.classList.add('on'); anchor.classList.add('open');
  const ar = anchor.getBoundingClientRect(), pr = $('ctx').getBoundingClientRect(), r = m.getBoundingClientRect();
  let x = pr.right - 2; if (x + r.width > innerWidth - 8) x = pr.left - r.width + 2; if (x < 8) x = Math.max(8, innerWidth - r.width - 8);
  let y = ar.top - 6; if (y + r.height > innerHeight - 8) y = Math.max(8, innerHeight - 8 - r.height);
  m.style.left = x + 'px'; m.style.top = y + 'px';
  ctx2Sel = -1; if (ctxKbOpen) { ctxLvl = 1; ctxMove(1); }
}
const fgModeItems = () => ['Organização', ['grid', `Grade fixa${fgFree ? '' : '  ✓'}`, () => fgSetMode(false)], ['free', `Livre${fgFree ? '  ✓' : ''}`, () => fgSetMode(true)]];
const fgArrangeItems = () => [['az', 'Ordenar por nome', () => fgSortByName()], ...(fgFree ? [['auto', 'Alinhar automaticamente', () => fgAutoAlign()]] : [])];
// menu do botão direito fora dos cards: fundo do jogo em foco + organização da tela
function fgViewCtx(x, y) {
  const g = fg.items[fg.sel];
  fgMenu([
    ...(g ? [`Fundo · ${esc(dn(g))}`, ['wall', 'Alterar fundo', () => { coverGame = g; openCover(true); }], ['move', 'Reposicionar fundo', () => fgBgPosOpen()], null] : []),
    ...fgArrangeItems(), null, ...fgModeItems(),
  ], x, y);
}
$('favgrid').addEventListener('contextmenu', e => { if (e.target.closest('.fgcard, #fgHeader, #fgDots, .fgdet')) return; e.preventDefault(); if (screen === 'favgrid') fgViewCtx(e.clientX, e.clientY); });
let fgJournal = null;   // durante a prévia, guarda os valores antigos para desfazer
function fgSetPos(g, pos) {
  const key = 'fpos|' + coverKey(g), val = pos ? `${pos.p},${pos.x},${pos.y}` : '';
  if (fgJournal) { if (!(key in fgJournal)) fgJournal[key] = covers[key]; if (val) covers[key] = val; else delete covers[key]; return; }
  if (val) covers[key] = val; else delete covers[key];
  api('/api/cover', { method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify({ key, url: val }) }).catch(() => {});
}
// solta o card i no lugar t; quem estava embaixo sai do caminho (vai para o próximo espaço livre)
function fgDropInto(i, t) {
  const pl = fg.place[i]; fgSetPos(fg.items[i], { p: t.p, x: t.x, y: t.y });
  const hit = [];
  fg.items.forEach((o, k) => { const q = fg.place[k]; if (k !== i && q && q.p === t.p && q.x < t.x + pl.w && q.x + q.w > t.x && q.y < t.y + pl.h && q.y + q.h > t.y) hit.push(o); });
  // 1 card no caminho: troca de lugar com o arrastado; vários: só esses vão para o primeiro espaço livre (os demais nunca se mexem)
  if (hit.length === 1) fgSetPos(hit[0], { p: pl.p, x: pl.x, y: pl.y }); else hit.forEach(o => fgSetPos(o, null));
}
// todos os cards ficam com lugar fixo: desfavoritar ou mover um card não mexe nos outros (só cards novos procuram espaço)
function fgPinAll() { fg.items.forEach((g, i) => { const q = fgPos(g), pl = fg.place[i]; if (pl && (!q || q.p !== pl.p || q.x !== pl.x || q.y !== pl.y)) fgSetPos(g, { p: pl.p, x: pl.x, y: pl.y }); }); }
// prévia: reorganiza os cards na tela como ficariam, sem salvar nada
function fgPreview(i, t) {
  const place0 = fg.place, pages0 = fg.pages;
  fgJournal = {}; fgDropInto(i, t); fgLayout();
  for (const k in fgJournal) { if (fgJournal[k] === undefined) delete covers[k]; else covers[k] = fgJournal[k]; }
  fgJournal = null;
  fgApplyDom(); fg.place = place0; fg.pages = pages0;
}
function fgApplyDom() {
  const tr = $('fgTrack');
  fg.place.forEach((pl, i) => {
    const el = tr.querySelector(`.fgcard[data-i="${i}"]`); if (!el || !pl) return;
    while (tr.children.length <= pl.p) fgAddPage();
    if (el.parentNode !== tr.children[pl.p]) tr.children[pl.p].appendChild(el);
    el.style.gridColumn = `${pl.x + 1} / span ${pl.w}`; el.style.gridRow = `${pl.y + 1} / span ${pl.h}`;
  });
}
// geometria da grade (células quadradas, centralizadas na página)
function fgCell() {
  const { R, C } = fgDim(), v = $('fgView').getBoundingClientRect(), gap = 20, pad = 36;   // pad: folga para a borda/brilho do card selecionado não ser cortada
  const cell = Math.max(20, Math.floor(Math.min((v.width - pad - gap * (C - 1)) / C, (v.height - pad - gap * (R - 1)) / R)));
  $('fgTrack').style.setProperty('--cell', cell + 'px');
}
function fgGeom(pg) {
  const { R, C } = fgDim(), r = pg.getBoundingClientRect(), gap = 20, cell = parseFloat(getComputedStyle($('fgTrack')).getPropertyValue('--cell')) || 100;
  return { ox: r.left + (r.width - (C * cell + (C - 1) * gap)) / 2, oy: r.top + (r.height - (R * cell + (R - 1) * gap)) / 2, pitch: cell + gap, cell, gap };
}
window.addEventListener('resize', () => { if (screen !== 'favgrid') return; const c0 = fgFreeDimCache && fgFreeDimCache.C; if (fgFree && fgFreeDim().C !== c0) renderFavGrid(); else fgCell(); });   // grade livre: muda o nº de colunas com a proporção da janela
// 1º os cards com lugar fixo (arrastados), depois os demais no primeiro espaço livre (linha por linha); não coube → próxima página
function fgLayout() {
  const { R, C } = fgDim(), pages = [];
  const ensure = p => { while (pages.length <= p) pages.push(Array.from({ length: R }, () => Array(C).fill(false))); };
  const free = (p, x, y, w, h) => { if (x < 0 || y < 0 || x + w > C || y + h > R) return false; ensure(p); for (let j = y; j < y + h; j++) for (let i = x; i < x + w; i++) if (pages[p][j][i]) return false; return true; };
  const take = (p, x, y, w, h) => { for (let j = y; j < y + h; j++) for (let i = x; i < x + w; i++) pages[p][j][i] = true; return { p, x, y, w, h }; };
  fg.place = fg.items.map(() => null);
  fg.items.forEach((g, i) => { const s = fgSize(g), q = fgPos(g); if (q && q.p >= 0 && q.p < 50 && free(q.p, q.x, q.y, s.w, s.h)) fg.place[i] = take(q.p, q.x, q.y, s.w, s.h); });
  fg.items.forEach((g, i) => {
    if (fg.place[i]) return;
    const { w, h } = fgSize(g);
    for (let p = 0; !fg.place[i]; p++) for (let y = 0; y < R && !fg.place[i]; y++) for (let x = 0; x < C && !fg.place[i]; x++) if (free(p, x, y, w, h)) fg.place[i] = take(p, x, y, w, h);
  });
  // páginas que ficaram vazias (no meio ou no fim) somem: as seguintes "andam" uma posição
  const used = [...new Set(fg.place.filter(Boolean).map(q => q.p))].sort((a, b) => a - b), map = {};
  used.forEach((p, k) => map[p] = k);
  fg.place.forEach(q => { if (q) q.p = map[q.p]; });
  fg.pages = Math.max(1, used.length);
}
async function openFavGrid() {
  if (!fgUndoing && screen !== 'favgrid') { fgLastSnap = null; fgUndo = []; }   // histórico vale enquanto está nos Favoritos
  sfx('ok'); globalMode = false; favMode = false;
  show('favgrid'); history.replaceState(null, '', '#favoritos');
  $('fgTrack').innerHTML = '<div class="empty">Carregando...</div>';
  if (!allGames) {
    const lists = await Promise.all(allSystems.map(s => loadGames(s.id).catch(() => [])));
    allGames = [].concat(...lists).sort((a, b) => a.name.localeCompare(b.name, 'pt', { sensitivity:'base' }));
  }
  const keys = new Set(favKeys().map(k => k.slice(4)));
  fg.items = allGames.filter(g => keys.has(coverKey(g)) && !g.priv).sort(nameCmp);
  shown = fg.items; fg.sel = Math.min(fg.sel, Math.max(0, fg.items.length - 1)); fg.page = 0; gIdx = fg.sel; if (fg.items[fg.sel]) sys = sysOf(fg.items[fg.sel]);
  renderFavGrid();
}
function renderFavGrid() {
  if (fgFree) { fgLayoutFree(); fgPinFree(); } else { fgLayout(); fgPinAll(); }
  fgCell(); fg.moving = null; fgMulti.clear();
  $('favgrid').classList.toggle('free', fgFree);
  $('favgrid').classList.remove('arrange');
  const { R, C } = fgDim();
  if (!fg.items.length) { fgDetails(); fgHist(); $('fgTrack').innerHTML = '<div class="empty">Nenhum jogo favoritado ainda — use a ⭐ ao lado de um jogo.</div>'; $('fgDots').innerHTML = ''; return; }
  let html = '';
  for (let p = 0; p < fg.pages; p++) {
    html += `<div class="fgpage" style="grid-template-columns:repeat(${C},var(--cell));grid-template-rows:repeat(${R},var(--cell))">`;
    // espaços vazios (só aparecem ao mover/arrastar um card)
    for (let y = 0; y < R; y++) for (let x = 0; x < C; x++) html += `<div class="fgempty" style="grid-column:${x + 1};grid-row:${y + 1}"></div>`;
    fg.place.forEach((pl, i) => {
      if (pl.p !== p) return;
      const g = fg.items[i];
      html += `<div class="fgcard${i === fg.sel ? ' sel' : ''}" data-i="${i}" style="${fgFree ? frStyle(pl) : `grid-column:${pl.x + 1} / span ${pl.w};grid-row:${pl.y + 1} / span ${pl.h}`}">
        <div class="fgimg" style="--gh:${genHash(dn(g)) % 360};--gh2:${(genHash(dn(g)) % 360 + 50) % 360}"></div><div class="fgname">${esc(dn(g))}</div>
        <button class="fgi" data-info title="Info (I)">i</button><span class="fgrz r" data-rz="r"></span><span class="fgrz b" data-rz="b"></span><span class="fgrz rb" data-rz="rb"></span></div>`;
    });
    html += '</div>';
  }
  $('fgTrack').innerHTML = html;
  $('fgDots').innerHTML = fg.pages > 1 ? `<button class="fgnav" data-nv="-1"></button>` + Array.from({ length: fg.pages }, (_, p) => `<span class="${p === fg.page ? 'on' : ''}" data-p="${p}">${p + 1}</span>`).join('') + `<button class="fgnav" data-nv="1"></button>` : '';
  $('fgDots').querySelectorAll('[data-p]').forEach(fgDotBind);
  $('fgDots').querySelectorAll('[data-nv]').forEach(b => b.onclick = () => { b.blur(); fgInput(+b.dataset.nv < 0 ? 'pgup' : 'pgdn'); });
  fgNavKey = ''; fgNavPaint();
  fgPage(fg.place[fg.sel] ? fg.place[fg.sel].p : 0, true);
  $('fgTrack').querySelectorAll('.fgcard').forEach(el => { fgBind(el); fgArt(+el.dataset.i, el); });
  fgDetails();
  fgHist();
}
// imagem do card: escolhida pelo usuário > (card largo) tela/fundo do jogo > capa
async function fgArt(i, el) {
  const g = fg.items[i], pl = fg.place[i], custom = covers['fcard|' + coverKey(g)] || covers[coverKey(g)];   // fundo escolhido só para o card (fcard|) > capa compartilhada com os consoles
  let url = custom || ((sysOf(g) || {}).type === 'video' ? vpUrl(g, 'vthumb') : '');   // vídeo: a miniatura do Explorador do Windows
  if (!url) { const a = cachedArt(g) || await resolveArt(g).catch(() => null); if (a) { const r = el.getBoundingClientRect(), ar = r.height > 0 ? r.width / r.height : pl.w / pl.h; url = (sgdbOn && ar > 16 / 9 && a.snap) ? a.snap : a.box; } }   // fundo só com SteamGridDB e card mais largo que 16:9; senão, capa
  const im = el.querySelector('.fgimg');
  if (url) { im.style.backgroundImage = `url("${cp(url).replace(/"/g, '%22')}")`; el.classList.add('has'); el._url = url; fgApplyOfs(el, g); }
  if (url && covers['fnew|' + coverKey(g)]) fgAutoShape(i, g, url);
}
// recém-favoritado: o card assume o formato da capa (uma vez só, assim que a capa aparece)
async function fgAutoShape(i, g, url) {
  const key = 'fnew|' + coverKey(g); delete covers[key]; api('/api/cover', { method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify({ key, url: '' }) }).catch(() => {});
  const d = await loadDims(url); if (!d || !d.w || !d.h || fg.moving || screen !== 'favgrid') return;
  const k = fg.items.indexOf(g), pl = fg.place[k]; if (k < 0 || !pl) return;
  const r = Math.max(.4, Math.min(2.4, d.w / d.h)), { R, C } = fgDim();
  if (fgFree) {
    const h = r > 1.2 ? 1.2 : 1.5, w = Math.max(FR_MIN, Math.min(4, C, h * r));
    if (Math.abs(w - pl.w) < .05 && Math.abs(h - pl.h) < .05) return;
    frResizeMany([k], w, h, { ...pl, w, h: Math.min(h, R) });
  } else {
    const w = r > 1.3 ? 2 : 1, h = r < .75 ? 2 : 1;
    if (w !== pl.w || h !== pl.h) fgResize(g, w, h);
  }
}
function fgPage(p, quiet) {
  fg.page = Math.max(0, Math.min(Math.max(fg.pages, $('fgTrack').querySelectorAll('.fgpage').length) - 1, p));
  $('fgTrack').style.transform = `translateX(-${fg.page * 100}%)`;
  $('fgDots').querySelectorAll('[data-p]').forEach(d => d.classList.toggle('on', +d.dataset.p === fg.page));
  if (!quiet) sfx('tick');
}
function fgSelect(i, quiet) {
  if (!fg.items[i]) return;
  fg.sel = i; gIdx = i; sys = sysOf(fg.items[i]);
  $('fgTrack').querySelectorAll('.fgcard').forEach(el => el.classList.toggle('sel', +el.dataset.i === i));
  if (fg.place[i].p !== fg.page) fgPage(fg.place[i].p, true);
  fgDetails();
  if (!quiet) sfx('tick');
}
// navegação pelas setas: card mais próximo na direção (passa de página nas laterais)
function fgMove(dir) {
  const cur = fg.place[fg.sel]; if (!cur) return;
  const cx = cur.x + cur.w / 2, cy = cur.y + cur.h / 2;
  let best = -1, bd = 1e9;
  // vizinho na direção: tolera pequenas sobreposições (posições livres em frações de célula) e mede pela borda mais próxima,
  // dando preferência a quem está na mesma linha/coluna — assim nenhum card do caminho é pulado
  const H = dir === 'left' || dir === 'right';
  fg.place.forEach((pl, i) => {
    if (i === fg.sel || !pl || pl.p !== cur.p) return;
    const x = pl.x + pl.w / 2, y = pl.y + pl.h / 2, dx = x - cx, dy = y - cy, tol = .3 * Math.min(H ? pl.w : pl.h, H ? cur.w : cur.h);
    const gap = dir === 'left' ? cur.x - (pl.x + pl.w) : dir === 'right' ? pl.x - (cur.x + cur.w) : dir === 'up' ? cur.y - (pl.y + pl.h) : pl.y - (cur.y + cur.h);
    const ahead = dir === 'left' ? dx < -.05 : dir === 'right' ? dx > .05 : dir === 'up' ? dy < -.05 : dy > .05;
    if (!ahead || gap < -tol) return;
    const ov = H ? Math.min(pl.y + pl.h, cur.y + cur.h) - Math.max(pl.y, cur.y) : Math.min(pl.x + pl.w, cur.x + cur.w) - Math.max(pl.x, cur.x);
    const off = Math.abs(H ? dy : dx);
    const d = Math.max(0, gap) + off * .5 + (ov > .05 ? 0 : 4 + off);
    if (d < bd) { bd = d; best = i; }
  });
  if (best < 0 && (dir === 'left' || dir === 'right')) {   // borda: vai para a página vizinha, no card mais perto da mesma altura
    const np = cur.p + (dir === 'right' ? 1 : -1);
    fg.place.forEach((pl, i) => { if (pl.p !== np) return; const d = Math.abs(pl.y + pl.h / 2 - cy) * 2 + (dir === 'right' ? pl.x : (fgDim().C - pl.x - pl.w)); if (d < bd) { bd = d; best = i; } });
  }
  if (best >= 0) fgSelect(best);
}
function fgBind(el) {
  const i = +el.dataset.i;
  el.querySelector('[data-info]').onclick = e => { e.stopPropagation(); fgSelect(i, true); fgInfo(true); };
  el.querySelector('[data-info]').onpointerdown = e => e.stopPropagation();
  el.onclick = e => {
    if (e.target.dataset.rz || el._dragged) { el._dragged = false; return; }
    if (e.ctrlKey) { fgToggleMulti(i); return; }          // Ctrl+clique: seleção em lote
    if (fgMulti.size) fgClearMulti();
    fgSelect(i);
  };
  el.onpointerdown = e => { if (e.button !== 0 || e.target.dataset.rz || e.ctrlKey) return; if (e.altKey) fgAltPan(e, el, i); else fgDragStart(e, el, i); };
  el.ondblclick = e => { if (e.target.dataset.rz) return; fgSelect(i, true); fgLaunch(); };
  el.oncontextmenu = e => { e.preventDefault(); fgSelect(i, true); fgCtx(e.clientX, e.clientY); };
  // redimensionar arrastando a lateral direita, a de baixo ou o canto (sempre grudando na grade, máx. 4x4)
  el.querySelectorAll('[data-rz]').forEach(h => h.onpointerdown = e => {
    e.preventDefault(); e.stopPropagation(); fgSelect(i, true);
    if (fgFree) {   // livre: qualquer tamanho/formato (limites: mín. 0,6 e máx. 4 células por lado)
      const { R, C } = fgDim(), pl = fg.place[i], G = fgGeom(el.parentNode), mode = h.dataset.rz, sx = e.clientX, sy = e.clientY;
      const q = { ...pl }; let rzRaf = 0; h.setPointerCapture(e.pointerId); el.classList.add('rz');
      const batch = fgMulti.size > 1 && fgMulti.has(i) ? [...fgMulti].filter(k => k !== i) : null;   // seleção em lote: todos ficam com o tamanho deste
      h.onpointermove = ev => {
        if (ev.ctrlKey) {   // Ctrl: mantém a proporção, muda só o tamanho
          const fx = (pl.w + (ev.clientX - sx) / G.pitch) / pl.w, fy = (pl.h + (ev.clientY - sy) / G.pitch) / pl.h;
          let f = mode === 'r' ? fx : mode === 'b' ? fy : Math.max(fx, fy);
          f = Math.max(FR_MIN / Math.min(pl.w, pl.h), Math.min(f, FR_MAX / pl.w, FR_MAX / pl.h, (C - pl.x) / pl.w, (R - pl.y) / pl.h));
          q.w = pl.w * f; q.h = pl.h * f;
        } else {
        if (mode.includes('r')) q.w = Math.max(FR_MIN, Math.min(FR_MAX, C - pl.x, pl.w + (ev.clientX - sx) / G.pitch));
        if (mode.includes('b')) q.h = Math.max(FR_MIN, Math.min(FR_MAX, R - pl.y, pl.h + (ev.clientY - sy) / G.pitch));
        }
        el.style.cssText = frStyle(q);
        if (!rzRaf) rzRaf = requestAnimationFrame(() => { rzRaf = 0; frPreviewResize([i, ...(batch || [])], q.w, q.h, q); });   // os outros cards já vão se empurrando
      };
      h.onpointerup = () => { h.onpointermove = h.onpointerup = null; el.classList.remove('rz'); frResizeMany([i, ...(batch || [])], q.w, q.h, q); };   // grava o que a prévia mostrou
      return;
    }
    const { R, C } = fgDim(), pl = fg.place[i], G = fgGeom(el.parentNode);
    const cw = G.pitch, ch = G.pitch, mode = h.dataset.rz, sx = e.clientX, sy = e.clientY;
    let w = pl.w, hh = pl.h;
    h.setPointerCapture(e.pointerId); el.classList.add('rz');
    h.onpointermove = ev => {
      if (mode.includes('r')) w = Math.max(1, Math.min(C - pl.x, Math.round(pl.w + (ev.clientX - sx) / cw)));
      if (mode.includes('b')) hh = Math.max(1, Math.min(R - pl.y, Math.round(pl.h + (ev.clientY - sy) / ch)));
      el.style.gridColumn = `${pl.x + 1} / span ${w}`; el.style.gridRow = `${pl.y + 1} / span ${hh}`;
    };
    h.onpointerup = () => { h.onpointermove = h.onpointerup = null; el.classList.remove('rz'); if (fgMulti.size > 1 && fgMulti.has(i)) { const sel = [...fgMulti].map(k => fg.items[k]); sel.forEach(g => { const key = 'fsz|' + coverKey(g), val = (w === 1 && hh === 1) ? '' : `${w},${hh}`; if (val) covers[key] = val; else delete covers[key]; api('/api/cover', { method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify({ key, url: val }) }).catch(() => {}); fgSetPos(g, null); }); sfx('ok'); renderFavGrid(); sel.forEach(g => { const k = fg.items.indexOf(g); if (k >= 0) fgMulti.add(k); }); fgMultiDom(); return; } fgResize(fg.items[i], w, hh); };
  });
}
function fgResize(g, w, h) {
  const i = fg.items.indexOf(g), pl = fg.place[i];
  if (pl) {   // mantém o card onde está; quem ficar por baixo vai para o próximo espaço livre
    const { C, R } = fgDim(), x = Math.min(pl.x, C - w), y = Math.min(pl.y, R - h);
    fgSetPos(g, { p: pl.p, x, y });
    fg.items.forEach((o, k) => { const q = fg.place[k]; if (k !== i && q && q.p === pl.p && q.x < x + w && q.x + q.w > x && q.y < y + h && q.y + q.h > y) fgSetPos(o, null); });
  }
  const key = 'fsz|' + coverKey(g), val = (w === 1 && h === 1) ? '' : `${w},${h}`;
  if (val) covers[key] = val; else delete covers[key];
  api('/api/cover', { method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify({ key, url: val }) }).catch(() => {});
  sfx('ok'); renderFavGrid();
}
// arrastar o card para qualquer lugar da grade (encostar na lateral da tela troca de página, inclusive para uma nova)
function fgDragStart(e, el, i) {
  const sx = e.clientX, sy = e.clientY, r0 = el.getBoundingClientRect(), pl = fg.place[i];
  let ghost = null, target = null, edgeT = 0, edgeDir = 0, last = e, prevKey = '', prevT = 0, previewed = false, cancelled = false;
  const group = fgMulti.size > 1 && fgMulti.has(i) ? [...fgMulti].filter(k => k !== i) : [];   // lote: os demais selecionados acompanham
  const edge = () => {
    const v = $('fgView').getBoundingClientRect(), dir = last.clientX > v.right - 50 ? 1 : last.clientX < v.left + 50 ? -1 : 0;
    if (dir !== edgeDir) { edgeDir = dir; edgeT = performance.now(); }
    if (dir && performance.now() - edgeT > 550) {   // segurou na borda: muda de página (cria uma nova no fim, se precisar)
      const np = fg.page + dir;
      if (np >= 0) { if (np >= $('fgTrack').children.length) fgAddPage(); fg.pages = Math.max(fg.pages, np + 1); fgPage(np); setTimeout(aim, 380); }
      edgeT = performance.now();
    }
  };
  const tick = setInterval(() => { if (ghost) edge(); }, 120);
  const { R, C } = fgDim();
  const cellAt = (x, y) => {
    const pg = $('fgTrack').children[fg.page]; if (!pg) return null;
    const G = fgGeom(pg);
    if (fgFree) return { ...frSnap(i, { p: fg.page, x: (x - (sx - r0.left) - G.ox) / G.pitch, y: (y - (sy - r0.top) - G.oy) / G.pitch, w: pl.w, h: pl.h }), G };
    const gx = Math.round((x - (sx - r0.left) - G.ox) / G.pitch), gy = Math.round((y - (sy - r0.top) - G.oy) / G.pitch);
    return { p: fg.page, x: Math.max(0, Math.min(C - pl.w, gx)), y: Math.max(0, Math.min(R - pl.h, gy)), G };
  };
  const move = ev => {
    if (!ghost) {
      if (Math.hypot(ev.clientX - sx, ev.clientY - sy) < 7) return;
      fgSelect(i, true); el._dragged = true; el.classList.add('dragsrc'); $('favgrid').classList.add('arrange');
      ghost = el.cloneNode(true); ghost.className = el.className.replace('dragsrc', '') + ' sel fgghost'; ghost.style.cssText = `width:${r0.width}px;height:${r0.height}px;`; document.body.appendChild(ghost);
      $('fgView').insertAdjacentHTML('beforeend', '<div class="fgslot" id="fgSlot"></div>' + group.map(k => `<div class="fgslot fgslot2" data-k="${k}"></div>`).join(''));
      document.addEventListener('keydown', esc, true);
    }
    ghost.style.transform = `translate(${ev.clientX - (sx - r0.left)}px, ${ev.clientY - (sy - r0.top)}px)`;
    last = ev; edge(); aim();
  };
  function aim() {
    if (!ghost) return;
    const v = $('fgView').getBoundingClientRect();
    target = cellAt(last.clientX, last.clientY);
    const s = $('fgSlot');
    if (s && target) { const G = target.G; s.style.cssText = `left:${G.ox - v.left + target.x * G.pitch}px;top:${G.oy - v.top + target.y * G.pitch}px;width:${pl.w * G.pitch - G.gap}px;height:${pl.h * G.pitch - G.gap}px`; }
    // lote: marcação de onde cada um dos outros selecionados vai cair (mesmo deslocamento)
    const mq = target ? fgGroupTargets(i, target) : null;
    $('fgView').querySelectorAll('.fgslot2').forEach(sl => { const q = mq && mq[+sl.dataset.k]; if (!q || q.p !== fg.page) { sl.style.display = 'none'; return; } const G = target.G; sl.style.cssText = `left:${G.ox - v.left + q.x * G.pitch}px;top:${G.oy - v.top + q.y * G.pitch}px;width:${q.w * G.pitch - G.gap}px;height:${q.h * G.pitch - G.gap}px`; });
    if (fgFree || group.length) {   // depois de um instante parado: mostra onde os cards empurrados vão parar (prévia, nada é salvo)
      const key = target ? `${target.p},${target.x.toFixed(2)},${target.y.toFixed(2)}` : '';
      if (key !== prevKey) { prevKey = key; clearTimeout(prevT); if (previewed) { fgPreviewUndo(); previewed = false; } if (target) { const t = target; prevT = setTimeout(() => { if (ghost) { fgPreviewMany(i, t); previewed = true; } }, 320); } }
      return;
    }
    // depois de um instante parado no mesmo lugar, mostra como os outros cards ficariam
    const key = target ? `${target.p},${target.x},${target.y}` : '';
    if (key !== prevKey) { prevKey = key; clearTimeout(prevT); if (target) { const t = target; prevT = setTimeout(() => { if (ghost) fgPreview(i, t); }, 260); } }
  }
  // Esc durante o arraste: desiste — tudo volta para onde estava
  function esc(ev) { if (ev.key !== 'Escape') return; ev.preventDefault(); ev.stopPropagation(); cancelled = true; up(); }
  function up() {
    document.removeEventListener('pointermove', move); document.removeEventListener('pointerup', up); document.removeEventListener('keydown', esc, true); clearInterval(tick); clearTimeout(prevT);
    if (!ghost) return;
    ghost.remove(); $('fgView').querySelectorAll('.fgslot').forEach(x => x.remove()); el.classList.remove('dragsrc'); $('favgrid').classList.remove('arrange');
    if (previewed) fgPreviewUndo();
    if (cancelled || !target) { const keep = [...fgMulti].map(k => fg.items[k]); renderFavGrid(); keep.forEach(g => fgMulti.add(fg.items.indexOf(g))); fgMultiDom(); sfx('back'); return; }
    if (fgMulti.size > 1 && fgMulti.has(i)) { fgMoveMany(i, target); return; }   // lote: todos andam juntos
    if (fgFree) { const { G, ...q } = target; frCommit(i, q); return; }
    fgDropInto(i, target); sfx('ok'); renderFavGrid();
  }
  document.addEventListener('pointermove', move); document.addEventListener('pointerup', up);
}
// destino de cada card do lote (mesmo deslocamento do card arrastado, preso às bordas)
function fgGroupTargets(i, t) {
  const { R, C } = fgDim(), pl = fg.place[i], dp = t.p - pl.p, dx = t.x - pl.x, dy = t.y - pl.y, out = {};
  fgMulti.forEach(k => { const o = fg.place[k]; let x = Math.max(0, Math.min(C - o.w, o.x + dx)), y = Math.max(0, Math.min(R - o.h, o.y + dy)); if (!fgFree) { x = Math.round(x); y = Math.round(y); } out[k] = { p: Math.max(0, o.p + dp), x, y, w: o.w, h: o.h }; });
  out[i] = { p: t.p, x: t.x, y: t.y, w: pl.w, h: pl.h };
  return out;
}
// prévia: move na tela os selecionados e os empurrados para onde ficariam (sem salvar); desfazer volta tudo
function fgPreviewMany(i, t) {
  const { R, C } = fgDim(), mq = fgGroupTargets(i, t), movedKeys = new Set(Object.keys(mq).map(Number));
  const placed = Object.values(mq), result = {};
  const hit = (a, b) => a.p === b.p && a.x < b.x + b.w - .001 && a.x + a.w > b.x + .001 && a.y < b.y + b.h - .001 && a.y + a.h > b.y + .001;
  const pushed = [];
  fg.place.forEach((r, k) => { if (movedKeys.has(k) || !r) return; if (placed.some(q => hit(q, r))) pushed.push(k); else placed.push(r); });
  pushed.forEach(k => { const r = fg.place[k]; const c = fgFree ? frFit(placed, r.w, r.h, r.p) : (() => { for (let p = r.p; p < 60; p++) for (let y = 0; y + r.h <= R; y++) for (let x = 0; x + r.w <= C; x++) { const q = { p, x, y, w: r.w, h: r.h }; if (!placed.some(o => hit(q, o))) return q; } return r; })(); placed.push(c); result[k] = c; });
  Object.entries(mq).forEach(([k, q]) => { if (+k !== i) result[k] = q; });
  const tr = $('fgTrack');
  Object.entries(result).forEach(([k, q]) => {
    const el = tr.querySelector(`.fgcard[data-i="${k}"]`); if (!el) return;
    while (tr.children.length <= q.p) fgAddPage();
    if (el.parentNode !== tr.children[q.p]) tr.children[q.p].appendChild(el);
    el.classList.add('pv');
    if (fgFree) el.style.cssText = frStyle(q); else { el.style.gridColumn = `${q.x + 1} / span ${q.w}`; el.style.gridRow = `${q.y + 1} / span ${q.h}`; }
  });
}
function fgPreviewUndo() {
  const tr = $('fgTrack');
  fg.place.forEach((q, k) => {
    const el = tr.querySelector(`.fgcard[data-i="${k}"].pv`); if (!el) return;
    el.classList.remove('pv');
    if (el.parentNode !== tr.children[q.p]) tr.children[q.p].appendChild(el);
    if (fgFree) el.style.cssText = frStyle(q); else { el.style.gridColumn = `${q.x + 1} / span ${q.w}`; el.style.gridRow = `${q.y + 1} / span ${q.h}`; }
  });
}
function fgAddPage() { const { R, C } = fgDim(); $('fgTrack').insertAdjacentHTML('beforeend', `<div class="fgpage" style="grid-template-columns:repeat(${C},var(--cell));grid-template-rows:repeat(${R},var(--cell))"></div>`); }
// painel flutuante com os detalhes do jogo selecionado (arraste pelo topo; gruda no canto/centro de baixo mais próximo)
let fgDock = 'left'; try { fgDock = localStorage.getItem('fgDock') || 'left'; } catch (e) {}
// ícone genérico de teclado + mouse para jogos de PC (no estilo dos desenhos de controle)
const PC_CTRL = 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 600 350"><g fill="none" stroke="#F4F4F4" stroke-width="2" stroke-linejoin="round" stroke-linecap="round"><rect x="40" y="110" width="390" height="190" rx="18"/><rect x="46" y="116" width="378" height="178" rx="14"/><rect x="58" y="130" width="24" height="26" rx="4"/><rect x="86" y="130" width="24" height="26" rx="4"/><rect x="114" y="130" width="24" height="26" rx="4"/><rect x="142" y="130" width="24" height="26" rx="4"/><rect x="170" y="130" width="24" height="26" rx="4"/><rect x="198" y="130" width="24" height="26" rx="4"/><rect x="226" y="130" width="24" height="26" rx="4"/><rect x="254" y="130" width="24" height="26" rx="4"/><rect x="282" y="130" width="24" height="26" rx="4"/><rect x="310" y="130" width="24" height="26" rx="4"/><rect x="338" y="130" width="24" height="26" rx="4"/><rect x="366" y="130" width="24" height="26" rx="4"/><rect x="394" y="130" width="24" height="26" rx="4"/><rect x="66" y="160" width="24" height="26" rx="4"/><rect x="94" y="160" width="24" height="26" rx="4"/><rect x="122" y="160" width="24" height="26" rx="4"/><rect x="150" y="160" width="24" height="26" rx="4"/><rect x="178" y="160" width="24" height="26" rx="4"/><rect x="206" y="160" width="24" height="26" rx="4"/><rect x="234" y="160" width="24" height="26" rx="4"/><rect x="262" y="160" width="24" height="26" rx="4"/><rect x="290" y="160" width="24" height="26" rx="4"/><rect x="318" y="160" width="24" height="26" rx="4"/><rect x="346" y="160" width="24" height="26" rx="4"/><rect x="374" y="160" width="24" height="26" rx="4"/><rect x="72" y="190" width="24" height="26" rx="4"/><rect x="100" y="190" width="24" height="26" rx="4"/><rect x="128" y="190" width="24" height="26" rx="4"/><rect x="156" y="190" width="24" height="26" rx="4"/><rect x="184" y="190" width="24" height="26" rx="4"/><rect x="212" y="190" width="24" height="26" rx="4"/><rect x="240" y="190" width="24" height="26" rx="4"/><rect x="268" y="190" width="24" height="26" rx="4"/><rect x="296" y="190" width="24" height="26" rx="4"/><rect x="324" y="190" width="24" height="26" rx="4"/><rect x="352" y="190" width="24" height="26" rx="4"/><rect x="78" y="220" width="24" height="26" rx="4"/><rect x="106" y="220" width="24" height="26" rx="4"/><rect x="134" y="220" width="24" height="26" rx="4"/><rect x="162" y="220" width="24" height="26" rx="4"/><rect x="190" y="220" width="24" height="26" rx="4"/><rect x="218" y="220" width="24" height="26" rx="4"/><rect x="246" y="220" width="24" height="26" rx="4"/><rect x="274" y="220" width="24" height="26" rx="4"/><rect x="302" y="220" width="24" height="26" rx="4"/><rect x="330" y="220" width="24" height="26" rx="4"/><rect x="58" y="250" width="52" height="26" rx="4"/><rect x="116" y="250" width="200" height="26" rx="4"/><rect x="322" y="250" width="52" height="26" rx="4"/><path d="M505 120c-38 0-62 26-62 66v58c0 40 26 64 62 64s62-24 62-64v-58c0-40-24-66-62-66z"/><path d="M443 196h124M505 120v76"/><rect x="498" y="140" width="14" height="30" rx="7"/><path d="M505 120c0-30-18-46-60-52"/></g></svg>`);
const ctrlImg = s => s.type === 'pc' || s.id === 'pc' ? PC_CTRL : `${ART}controllers/${s.art}.svg`;
// cabeçalho dos Favoritos = detalhes do card selecionado (controle do console, nome, console, tamanho e caminho)
function fgDetails() {
  const g = fg.items[fg.sel], d = $('fgHead'); if (!d) return;
  if (!g) { d.innerHTML === '' || (d.querySelector('.fdn').textContent = 'Favoritos'); d.querySelector('.fdc').textContent = ''; d.querySelector('.fdm').style.display = 'none'; d.querySelector('.fdctrl').style.display = 'none'; fgLogo(null); return; }
  const s = sysOf(g);
  d.querySelector('.fdm').style.display = '';
  d.querySelector('.fdn').textContent = dn(g);
  d.querySelector('.fdc').textContent = s.name || '';
  const ci = d.querySelector('.fdctrl'); ci.style.display = ''; ci.onerror = () => { ci.style.display = 'none'; };
  ci.src = ctrlImg(s);
  d.querySelector('.fdp').textContent = g.path; d.querySelector('.fdp').title = 'Abrir a pasta do arquivo';
  d.querySelector('.fds').textContent = fmtSize(g.size);
  fgGameBg(g);
  fgLogo(g);
}
// logo de título do jogo selecionado, no canto superior direito do cabeçalho
let fgLogoTok = 0;
async function fgLogo(g) {
  let im = $('fgLogo');
  if (!im) { im = document.createElement('img'); im.id = 'fgLogo'; im.alt = ''; $('fgHeader').appendChild(im); }
  const my = ++fgLogoTok; im.classList.remove('on');
  if (!g) return;
  const tries = [covers['logo|' + coverKey(g)]];
  const a = cachedArt(g) || await resolveArt(g, true).catch(() => null);
  if (my !== fgLogoTok) return;
  if (a) { tries.push(a.logo); if (a.box && /\/Named_Boxarts\//.test(a.box)) tries.push(a.box.replace('/Named_Boxarts/', '/Named_Logos/')); }
  for (const u of tries.filter(Boolean)) {
    const src = cp(u);
    if (await loadImg(src)) { if (my !== fgLogoTok) return; im.src = src; im.classList.add('on'); return; }
    if (my !== fgLogoTok) return;
  }
}
$('fgHead').querySelector('.fdp').onclick = () => { const g = fg.items[fg.sel]; if (g) api('/api/reveal', { method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify({ path: g.path }) }).catch(er => toast(er.message, true)); };
// setas ao lado das páginas: ← → no teclado; L1/R1 (ou LB/RB, L/R) com o controle
let fgNavKey = '';
function fgNavPaint(mode) {
  mode = mode || (typeof legendMode !== 'undefined' && document.body.classList.contains('pad') && typeof padType !== 'undefined' && padType && navigator.getGamepads && [...navigator.getGamepads()].some(Boolean) ? legendMode : 'kb');
  const key = mode + '|' + (typeof padType !== 'undefined' ? padType : ''); if (key === fgNavKey) return; fgNavKey = key;
  const bs = $('fgDots') ? $('fgDots').querySelectorAll('[data-nv]') : []; if (!bs.length) return;
  bs.forEach(b => { const l = +b.dataset.nv < 0; b.innerHTML = mode === 'pad' ? SH(l ? 0 : 1) : `<b class="kk">${l ? '←' : '→'}</b>`; b.title = l ? 'Página anterior' : 'Próxima página'; });
}
// fundo da tela de favoritos = fundo do jogo selecionado (opcional, Configuração → Favoritos)
let favBgGame = false, fgBgTok = 0;
async function fgGameBg(g, force) {
  const host = $('fgBg');
  if (!force && favBgGame && g && host._g === g && host.querySelector('.bgl')) return;   // mesmo jogo: mantém a camada (clique duplo não pisca o fundo)
  const tok = ++fgBgTok;
  if (!favBgGame || !g) { host._g = null; host.querySelectorAll('.bgl').forEach(o => { o.classList.remove('on'); setTimeout(() => o.remove(), 600); }); return; }
  const over = covers['bg|' + coverKey(g)];
  let url = over; if (!url && (sysOf(g) || {}).type === 'video') url = await videoFirstFrame(g) || vpUrl(g, 'vthumb');   // vídeo: o primeiro quadro
  if (!url) { const a = cachedArt(g) || await resolveArt(g).catch(() => null); url = a && a.snap; if (!url) url = await findBg(g).catch(() => null); if (!url && a) url = a.box; }   // sem fundo da capa: busca um fundo de verdade antes de usar a própria capa
  if (tok !== fgBgTok || !url) return;
  const old = [...host.querySelectorAll('.bgl')];
  const l = document.createElement('div'); l.className = 'bgl'; l.style.backgroundImage = `url("${cpb(url).replace(/"/g, '%22')}")`;
  host.appendChild(l); host._url = url; host._g = g; fgBgRender(l, url, g); requestAnimationFrame(() => requestAnimationFrame(() => l.classList.add('on')));
  old.forEach(o => { o.classList.remove('on'); setTimeout(() => o.remove(), 600); });
}
// abrir o jogo: a imagem do card se expande até a tela inteira, escurece e mostra "Bom jogo."
let fxOpen = false;
let fxTimer = 0, fxAt = 0;
// animação de abertura: a imagem cresce de "rect" até a tela inteira (o app entra em tela cheia de verdade), escurece e mostra "Bom jogo.";
// o jogo abre depois da animação completa + 0,5 s
function playFx(rect, bgImage, bgPos, radius, bgSize) {
  if (fxOpen) return;
  const fx = $('fgFx');
  clearTimeout(fxTimer); fxTimer = setTimeout(() => { if (fxOpen) launch(); }, 1400);
  if (window.chrome && chrome.webview && !$('fgFx').classList.contains('frombg')) chrome.webview.postMessage('fxon');   // pelo fundo: só ocupa a janela, sem tela cheia (evita a piscada)
  fx.style.backgroundImage = bgImage || ''; fx.style.backgroundPosition = bgPos || 'center'; fx.style.backgroundSize = bgSize && bgSize !== 'auto' ? bgSize : 'cover';
  fx.className = 'fgfx' + (fx.classList.contains('frombg') ? ' frombg' : '') + (fx.classList.contains('zoomfit') ? ' zoomfit' : ''); Object.assign(fx.style, { left: rect.left + 'px', top: rect.top + 'px', width: rect.width + 'px', height: rect.height + 'px', borderRadius: (radius || 0) + 'px' });
  fxOpen = true; fxAt = Date.now(); fx.classList.add('on');
  requestAnimationFrame(() => requestAnimationFrame(() => { fx.classList.add('grow'); Object.assign(fx.style, { left: '0px', top: '0px', width: '100vw', height: '100vh', borderRadius: '0px' }); }));
}
let fgLaunching = false;
const emuReady = g => { const s = sysOf(g) || sys || {}; return s.type === 'pc' || !!s.emulatorOk; };
function fgLaunch(noWait) {
  const g = fg.items[fg.sel], el = $('fgTrack').querySelector(`.fgcard[data-i="${fg.sel}"]`); if (!g || fxOpen) return;
  if ((sysOf(g) || {}).type === 'video') { openVPlayer(g); return; }   // vídeo: abre o player (sem animação de tela cheia)
  if (!emuReady(g)) { launch(); return; }   // sem emulador: primeiro a oferta de emuladores, sem animação por cima
  // com o fundo do jogo na tela: os itens somem e o próprio fundo cresce até a tela cheia
  const host = $('fgBg');
  if (favBgGame && host._g !== g && !noWait && !fgLaunching && !(fgLaunch._w > 0)) {   // fundo do jogo ainda carregando (ex.: clique duplo num card novo): espera até 0,8 s
    fgLaunch._w = 1; const t0 = Date.now();
    const wait = () => { if (host._g === g || Date.now() - t0 > 800) { fgLaunch._w = 0; fgLaunch(true); } else setTimeout(wait, 50); };
    wait(); return;
  }
  const lay = [...host.querySelectorAll('.bgl')].pop();
  if (favBgGame && lay && host._g === g) {
    if (fgLaunching) return; fgLaunching = true;
    $('favgrid').classList.add('launching');   // 1) tudo some num fade rápido
    setTimeout(() => {                          // 2) depois o fundo cresce até a tela cheia
      fgLaunching = false;
      const fx = $('fgFx'), cs = getComputedStyle(lay);
      fx.classList.add('frombg');
      fx.style.opacity = cs.opacity; fx.style.filter = cs.filter === 'none' ? '' : cs.filter;   // começa igual ao fundo atual (opacidade e efeitos)
      const f = lay._fit;
      if (f) {   // imagem original (sem bordas esticadas), crescendo até cobrir a tela inteira sem distorcer
        playFx(host.getBoundingClientRect(), `url("${f.src.replace(/"/g, '%22')}")`, `${f.px}% ${f.py}%`, 0, `${f.dw}px ${f.dh}px`);
        const sc = Math.max(innerWidth / f.iw, innerHeight / f.ih, f.dw / f.iw);
        fx.classList.add('zoomfit'); requestAnimationFrame(() => requestAnimationFrame(() => { fx.style.backgroundSize = `${f.iw * sc}px ${f.ih * sc}px`; }));
      } else playFx(host.getBoundingClientRect(), lay.style.backgroundImage, cs.backgroundPosition, 0, cs.backgroundSize);
      host.classList.add('hidebg');   // o fundo original some na hora: a cópia que cresce está exatamente por cima, igual a ele
      clearTimeout(fxTimer); fxTimer = setTimeout(() => { if (fxOpen) launch(); }, 2000);   // animação mais longa: o jogo abre depois dela
      setTimeout(() => { if (fxOpen) { fx.classList.add('sharp'); fx.style.opacity = '1'; fx.style.filter = 'none'; } }, 600);   // depois de crescer: fica nítido aos poucos
    }, 320);
    return;
  }
  if (!el) { launch(); return; }
  const im = el.querySelector('.fgimg'), o = fgOfs(g);
  playFx(el.getBoundingClientRect(), im ? im.style.backgroundImage : '', o ? `${o.x}% ${o.y}%` : 'center', 12);
}
// lista de jogos dos consoles: parte do painel da capa, com o fundo do jogo (ou a capa)
function listLaunch() {
  const g = shown[gIdx]; if (!g || fxOpen) return;
  if ((sysOf(g) || {}).type === 'video') { openVPlayer(g); return; }   // vídeo: player na janela, sem animação/tela cheia
  if (!emuReady(g)) { launch(); return; }
  const right = document.querySelector('#games .right') || $('art'), a = cachedArt(g);
  const src = covers['bg|' + coverKey(g)] || (a && (a.snap || a.box)) || (lastArt && lastArt.g === g && lastArt.url);   // fundo do jogo > tela > capa
  let img = src ? `url("${cpb(src).replace(/"/g, '%22')}")` : '';
  if (!img) { const bgl = [...$('gameBg').querySelectorAll('.bgl')].pop(); img = bgl ? bgl.style.backgroundImage : ''; }
  if (!img) { launch(); return; }
  playFx(right.getBoundingClientRect(), img, 'center', 10);
}
function fgFxClose() { clearTimeout(fxTimer); if (!fxOpen) return; fxOpen = false; $('favgrid').classList.remove('launching'); $('fgBg').classList.remove('hidebg'); const fx = $('fgFx'); fx.classList.add('out'); setTimeout(() => { fx.className = 'fgfx'; fx.style.backgroundSize = ''; fx.style.opacity = ''; fx.style.filter = ''; }, 350); if (window.chrome && chrome.webview) chrome.webview.postMessage('fxoff'); }
window.addEventListener('blur', () => { if (fxOpen && Date.now() - fxAt > 1300) fgFxClose(); });   // o jogo abriu (o foco saiu do app)
// ---- reposicionar a imagem do card: 'fofs|chave' = "posX%,posY%,zoom" ----
const fgBgOfs = g => { const v = covers['bofs|' + coverKey(g)]; if (!v) return null; const [x, y, z] = v.split(',').map(Number); return { x, y, z: z || 1 }; };
// fundo do jogo: por padrão preenche tudo (cover). Só "estica as bordas" quando o usuário escolheu uma imagem menor que a área
// ou afastou/diminuiu o fundo em "Reposicionar fundo" deixando cantos vazios — e aí as bordas esticadas ficam embaçadas e escurecidas
async function fgBgRender(l, url, g) {
  const tok = fgBgTok, o = fgBgOfs(g), manual = !!covers['bg|' + coverKey(g)];
  // sempre pela cópia local (mesma origem): assim o canvas pode ler os pixels para esticar/embaçar as bordas
  const load = u => new Promise(ok => { const i = new Image(); i.onload = () => ok(i.naturalWidth > 1 ? i : null); i.onerror = () => ok(null); i.src = u; });
  // cópia local de fundo > cópia local de capa > direto do site (se uma falhar, o fundo não fica preto)
  const alts = /^https?:/.test(url) ? ['/api/img?u=' + encodeURIComponent(url) + '&k=bg', '/api/img?u=' + encodeURIComponent(url), url] : [cp(url)];
  let src = alts[0], im = null; for (const u of alts) { im = await load(u); if (im) { src = u; break; } }
  if (!im || tok !== fgBgTok && l.parentNode !== $('fgBg')) return;   // nenhuma carregou: mantém a camada como está
  const W = l.offsetWidth || innerWidth, H = l.offsetHeight || innerHeight, iw = im.naturalWidth, ih = im.naturalHeight;
  const cover = Math.max(W / iw, H / ih), contain = Math.min(W / iw, H / ih);
  const sc = o ? cover * o.z : manual ? Math.min(cover, Math.max(contain, 1)) : cover;
  const px = o ? o.x : 50, py = o ? o.y : 50, dw = iw * sc, dh = ih * sc;
  l.style.backgroundImage = `url("${src.replace(/"/g, '%22')}")`; l._fit = { src, iw, ih, dw, dh, px, py };   // usado na animação de abrir o jogo
  l.querySelectorAll('.bgfill').forEach(e => e.remove());
  if (dw >= W - .5 && dh >= H - .5) { l.style.backgroundSize = `${dw}px ${dh}px`; l.style.backgroundPosition = `${px}% ${py}%`; return; }
  // já preenche na hora (só CSS): a própria imagem ampliada e embaçada atrás; o canvas abaixo troca por bordas esticadas quando conseguir
  l.style.backgroundSize = `${dw}px ${dh}px`; l.style.backgroundPosition = `${px}% ${py}%`; l.style.backgroundRepeat = 'no-repeat';
  { const fill = document.createElement('div'); fill.className = 'bgfill'; fill.style.backgroundImage = `url("${src.replace(/"/g, '%22')}")`; l.prepend(fill); }
  try {
    const k = Math.min(1, 1920 / W), cw = Math.round(W * k), ch = Math.round(H * k), w = dw * k, h = dh * k;
    const x0 = (cw - w) * px / 100, y0 = (ch - h) * py / 100, x1 = x0 + w, y1 = y0 + h;
    const cv = document.createElement('canvas'); cv.width = cw; cv.height = ch; const x = cv.getContext('2d');
    // 1) bordas esticadas (últimos pixels de cada lado) — depois embaçadas
    const ed = document.createElement('canvas'); ed.width = cw; ed.height = ch; const e = ed.getContext('2d');
    e.drawImage(im, x0, y0, w, h);
    if (x0 > 0) e.drawImage(im, 0, 0, 1, ih, 0, y0, Math.ceil(x0) + 1, h);
    if (x1 < cw) e.drawImage(im, iw - 1, 0, 1, ih, Math.floor(x1) - 1, y0, cw - Math.floor(x1) + 1, h);
    if (y0 > 0) e.drawImage(ed, 0, Math.ceil(Math.max(0, y0)), cw, 1, 0, 0, cw, Math.ceil(y0) + 1);
    if (y1 < ch) e.drawImage(ed, 0, Math.floor(Math.min(ch, y1)) - 1, cw, 1, 0, Math.floor(y1) - 1, cw, ch - Math.floor(y1) + 1);
    // embaça só a parte esticada (sem escurecer); um 2º passe mais leve deixa a transição mais natural
    x.filter = 'blur(32px) saturate(1.15)'; x.drawImage(ed, -48, -48, cw + 96, ch + 96); x.filter = 'blur(10px)'; x.globalAlpha = .5; x.drawImage(ed, -12, -12, cw + 24, ch + 24); x.globalAlpha = 1; x.filter = 'none';
    // 3) a imagem nítida por cima, com a borda suavizada (sem corte seco)
    const sh = document.createElement('canvas'); sh.width = cw; sh.height = ch; const s2 = sh.getContext('2d');
    s2.drawImage(im, x0, y0, w, h);
    const f = Math.min(40, w * .06, h * .06); s2.globalCompositeOperation = 'destination-in';
    const mk = document.createElement('canvas'); mk.width = cw; mk.height = ch; const m = mk.getContext('2d');
    m.filter = `blur(${f / 2}px)`; m.fillStyle = '#000'; m.fillRect(x0 + (x0 > 0 ? f / 2 : -f), y0 + (y0 > 0 ? f / 2 : -f), w - (x0 > 0 ? f / 2 : -f) - (x1 < cw ? f / 2 : -f), h - (y0 > 0 ? f / 2 : -f) - (y1 < ch ? f / 2 : -f));
    s2.drawImage(mk, 0, 0); x.drawImage(sh, 0, 0);
    if (l.parentNode !== $('fgBg')) return;
    const du = cv.toDataURL('image/jpeg', .9);
    l.style.backgroundImage = `url("${du}")`; l.style.backgroundSize = '100% 100%'; l.style.backgroundPosition = 'center'; l.querySelectorAll('.bgfill').forEach(e => e.remove());
  } catch (er) {}   // sem acesso aos pixels: fica o preenchimento embaçado (CSS) já aplicado acima
}
function fgApplyBgOfs(l, url, g) { return fgBgRender(l, url, g); }
const fgOfs = g => { const v = covers['fofs|' + coverKey(g)]; if (!v) return null; const [x, y, z] = v.split(',').map(Number); return { x, y, z: z || 1 }; };
const imgDims = {};
const loadDims = url => imgDims[url] ? Promise.resolve(imgDims[url]) : new Promise(ok => { const i = new Image(); i.onload = () => ok(imgDims[url] = { w: i.naturalWidth, h: i.naturalHeight }); i.onerror = () => ok(null); i.src = cp(url); });
async function fgApplyOfs(el, g) {
  const o = fgOfs(g), im = el.querySelector('.fgimg');
  if (!o) { im.style.backgroundSize = ''; im.style.backgroundPosition = ''; return; }
  im.style.backgroundPosition = `${o.x}% ${o.y}%`;
  if (o.z === 1) { im.style.backgroundSize = 'cover'; return; }
  const d = await loadDims(el._url); if (!d) return;
  const W = im.offsetWidth, H = im.offsetHeight, s = Math.max(W / d.w, H / d.h) * o.z;
  im.style.backgroundSize = `${d.w * s}px ${d.h * s}px`;
}
const fp = { open: false };
async function fgBgPosOpen() {
  const g = fg.items[fg.sel], host = $('fgBg');
  if (!g || !favBgGame || host._g !== g || !host._url) { toast(favBgGame ? 'Este jogo ainda não tem fundo' : 'Ative "Fundo do jogo" em Configuração → Favoritos', true); return; }
  const d = await loadDims(host._url); if (!d) return;
  const o = fgBgOfs(g) || { x: 50, y: 50, z: 1 };
  Object.assign(fp, { open: true, kind: 'bg', g, el: null, url: host._url, d, x: o.x, y: o.y, z: o.z });
  const r = (host.offsetWidth || innerWidth) / (host.offsetHeight || innerHeight), maxW = innerWidth * .6, maxH = innerHeight * .6;
  fp.W = Math.min(maxW, maxH * r); fp.H = fp.W / r;
  $('fpFrame').style.width = fp.W + 'px'; $('fpFrame').style.height = fp.H + 'px';
  $('fpImg').src = cp(fp.url);
  $('fpModal').classList.add('on'); fpRender(); sfx('ok');
}
async function fgPosOpen() {
  const i = fg.sel, g = fg.items[i], el = $('fgTrack').querySelector(`.fgcard[data-i="${i}"]`); if (!g || !el || !el._url) { toast('Este card ainda não tem imagem', true); return; }
  const pl = fg.place[i], d = await loadDims(el._url); if (!d) return;
  const o = fgOfs(g) || { x: 50, y: 50, z: 1 };
  Object.assign(fp, { open: true, kind: 'card', g, el, url: el._url, d, x: o.x, y: o.y, z: o.z });
  // card simulado no centro, com a proporção real do card
  const maxW = innerWidth * .5, maxH = innerHeight * .55, r = pl.w / pl.h;
  fp.W = Math.min(maxW, maxH * r); fp.H = fp.W / r;
  $('fpFrame').style.width = fp.W + 'px'; $('fpFrame').style.height = fp.H + 'px';
  $('fpImg').src = cp(fp.url);
  $('fpModal').classList.add('on'); fpRender(); sfx('ok');
}
function fpRender() {
  const { d, W, H } = fp, s = Math.max(W / d.w, H / d.h) * fp.z, Dw = d.w * s, Dh = d.h * s;
  fp.Dw = Dw; fp.Dh = Dh;
  const f = $('fpFrame').getBoundingClientRect();
  const ox = (W - Dw) * fp.x / 100, oy = (H - Dh) * fp.y / 100;   // mesmo cálculo do background-position em %
  Object.assign($('fpImg').style, { width: Dw + 'px', height: Dh + 'px', left: (f.left + ox) + 'px', top: (f.top + oy) + 'px' });
  $('fpZoom').textContent = Math.round(fp.z * 100) + '%';
}
function fpPan(dx, dy) {   // dx/dy em pixels de tela
  const ex = fp.W - fp.Dw, ey = fp.H - fp.Dh;
  if (ex < 0 || (fp.kind === 'bg' && ex > 0)) fp.x = Math.max(0, Math.min(100, fp.x + dx / ex * 100));
  if (ey < 0 || (fp.kind === 'bg' && ey > 0)) fp.y = Math.max(0, Math.min(100, fp.y + dy / ey * 100));
  fpRender();
}
function fpZoom(f) { fp.z = Math.max(fp.kind === 'bg' ? .3 : 1, Math.min(4, fp.z * f)); fpRender(); }   // fundo pode ficar menor que a tela (as bordas são preenchidas)
function fpClose(save) {
  if (!fp.open) return;
  fp.open = false; $('fpModal').classList.remove('on');
  if (save) {
    const key = (fp.kind === 'bg' ? 'bofs|' : 'fofs|') + coverKey(fp.g), def = Math.abs(fp.x - 50) < .5 && Math.abs(fp.y - 50) < .5 && fp.z === 1;
    const val = def ? '' : `${fp.x.toFixed(1)},${fp.y.toFixed(1)},${fp.z.toFixed(3)}`;
    if (val) covers[key] = val; else delete covers[key];
    api('/api/cover', { method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify({ key, url: val }) }).catch(() => {});
    if (fp.kind === 'bg') { const l = [...$('fgBg').querySelectorAll('.bgl')].pop(); if (l) fgApplyBgOfs(l, fp.url, fp.g); toast('Posição do fundo salva'); }
    else { fgApplyOfs(fp.el, fp.g); toast('Posição da capa salva'); }
    fgHist();
    sfx('ok');
  } else sfx('back');
}
function fpInput(a) {
  const st = 14;
  if (a === 'left') fpPan(-st, 0); else if (a === 'right') fpPan(st, 0); else if (a === 'up') fpPan(0, -st); else if (a === 'down') fpPan(0, st);
  else if (a === 'pgup') fpZoom(1 / 1.1); else if (a === 'pgdn') fpZoom(1.1);
  else if (a === 'ok' || a === 'fav') fpClose(true); else if (a === 'back' || a === 'menu') fpClose(false);
}
(() => {
  const m = $('fpModal'); let dr = null;
  m.addEventListener('pointerdown', e => { if (e.target.closest('button')) return; dr = { x: e.clientX, y: e.clientY }; m.setPointerCapture(e.pointerId); m.classList.add('grab'); });
  m.addEventListener('pointermove', e => { if (!dr) return; fpPan(e.clientX - dr.x, e.clientY - dr.y); dr = { x: e.clientX, y: e.clientY }; });
  m.addEventListener('pointerup', () => { dr = null; m.classList.remove('grab'); });
  m.addEventListener('wheel', e => { e.preventDefault(); fpZoom(e.deltaY < 0 ? 1.1 : 1 / 1.1); }, { passive:false });
  $('fpOk').onclick = () => fpClose(true); $('fpCancel').onclick = () => fpClose(false);
  $('fpReset').onclick = () => { fp.x = 50; fp.y = 50; fp.z = 1; fpRender(); };
  window.addEventListener('resize', () => { if (fp.open) fpRender(); });
})();
// Alt + arrastar: move só a imagem dentro do card (salva ao soltar)
async function fgAltPan(e, el, i) {
  e.preventDefault(); fgSelect(i, true);
  const g = fg.items[i], im = el.querySelector('.fgimg'); if (!el._url) return;
  const d = await loadDims(el._url); if (!d) return;
  const o = fgOfs(g) || { x: 50, y: 50, z: 1 }, W = im.offsetWidth, H = im.offsetHeight, s = Math.max(W / d.w, H / d.h) * o.z, ex = W - d.w * s, ey = H - d.h * s;
  let lx = e.clientX, ly = e.clientY; el.classList.add('alting'); el._dragged = true;
  const mv = ev => {
    if (ex < 0) o.x = Math.max(0, Math.min(100, o.x + (ev.clientX - lx) / ex * 100));
    if (ey < 0) o.y = Math.max(0, Math.min(100, o.y + (ev.clientY - ly) / ey * 100));
    lx = ev.clientX; ly = ev.clientY; im.style.backgroundPosition = `${o.x}% ${o.y}%`; if (o.z === 1) im.style.backgroundSize = 'cover';
  };
  const up = () => {
    document.removeEventListener('pointermove', mv); document.removeEventListener('pointerup', up); el.classList.remove('alting');
    const key = 'fofs|' + coverKey(g), val = `${o.x.toFixed(1)},${o.y.toFixed(1)},${o.z.toFixed(3)}`;
    covers[key] = val; api('/api/cover', { method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify({ key, url: val }) }).catch(() => {});
    fgHist(); setTimeout(() => { el._dragged = false; }, 0);
  };
  document.addEventListener('pointermove', mv); document.addEventListener('pointerup', up);
}
// seleção em lote (Ctrl + clique)
const fgMulti = new Set();
function fgMultiDom() { $('fgTrack').querySelectorAll('.fgcard').forEach(el => el.classList.toggle('msel', fgMulti.has(+el.dataset.i))); }
function fgToggleMulti(i) { if (!fgMulti.size && fg.sel !== i && fg.items[fg.sel]) fgMulti.add(fg.sel); if (fgMulti.has(i)) fgMulti.delete(i); else fgMulti.add(i); fgSelect(i, true); fgMultiDom(); sfx('tick'); }
function fgClearMulti() { fgMulti.clear(); fgMultiDom(); }
async function fgBatchUnfav() {
  const list = [...fgMulti].map(k => fg.items[k]).filter(Boolean);
  if (!await ask(`Desfavoritar ${list.length} jogos?`, 'Eles saem da tela de Favoritos (os jogos continuam no seu PC).', 'Desfavoritar')) return;
  for (const g of list) { clearFavLayout(g); delete covers['fav|' + coverKey(g)]; api('/api/cover', { method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify({ key: 'fav|' + coverKey(g), url: '' }) }).catch(() => {}); }
  fgMulti.clear(); toast(`${list.length} jogos removidos dos favoritos`); sfx('back'); openFavGrid();
}
// menu de contexto do card (botão direito / △)
/* ---------- lote: alinhar / redimensionar todos os selecionados ---------- */
const fgSelList = () => { const l = [...fgMulti].filter(k => fg.place[k]); const a = l.indexOf(fg.sel); if (a > 0) { l.splice(a, 1); l.unshift(fg.sel); } return l; };
const fgOrd = (a, b) => { const p = fg.place[a], q = fg.place[b]; return (p.p - q.p) || (Math.round(p.y * 4) - Math.round(q.y * 4)) || (p.x - q.x); };
// grava as novas posições do lote; quem (do lote ou não) ficar por baixo vai para o próximo espaço livre
function fgApplyMany(news) {
  const list = Object.keys(news).map(Number).sort(fgOrd), set = new Set(list), kept = [];
  list.forEach(k => { if (kept.some(j => news[j].p === news[k].p && frHit(news[j], news[k]))) fgSetFr(fg.items[k], { p: -1, x: 0, y: 0, w: news[k].w, h: news[k].h }); else { fgSetFr(fg.items[k], news[k]); kept.push(k); } });
  fg.items.forEach((o, k) => { const r = fg.place[k]; if (!set.has(k) && r && kept.some(j => news[j].p === r.p && frHit(news[j], r))) fgSetFr(o, { p: -1, x: 0, y: 0, w: r.w, h: r.h }); });
  const keep = list.map(k => fg.items[k]); sfx('ok'); renderFavGrid();
  keep.forEach(g => { const k = fg.items.indexOf(g); if (k >= 0) fgMulti.add(k); }); fgMultiDom();
}
const fgKeepSel = fn => { const keep = [...fgMulti].map(k => fg.items[k]); fn(); keep.forEach(g => { const k = fg.items.indexOf(g); if (k >= 0) fgMulti.add(k); }); fgMultiDom(); };
// alinhar à grade: posição e tamanho de cada card vão para a célula inteira mais próxima
function fgBatchGrid() {
  const { R, C } = fgDim(), news = {};
  fgSelList().forEach(k => { const o = fg.place[k], w = Math.max(1, Math.min(C, Math.round(o.w))), h = Math.max(1, Math.min(R, Math.round(o.h))); news[k] = { p: o.p, x: Math.max(0, Math.min(C - w, Math.round(o.x))), y: Math.max(0, Math.min(R - h, Math.round(o.y))), w, h }; });
  fgApplyMany(news);
}
// alinhar automaticamente: o lote se encosta (na ordem atual) a partir do canto do primeiro card
function fgBatchAuto() {
  const l = fgSelList().sort(fgOrd);
  if (!fgFree) { fgKeepSel(() => { l.forEach(k => fgSetPos(fg.items[k], null)); sfx('ok'); renderFavGrid(); }); return; }
  const { R, C } = fgDim(), f = fg.place[l[0]], x0 = Math.min(...l.filter(k => fg.place[k].p === f.p).map(k => fg.place[k].x)), news = {};
  let x = x0, y = f.y, p = f.p, rh = 0;
  l.forEach(k => { const o = fg.place[k], w = Math.min(o.w, C), h = Math.min(o.h, R);
    if (x + w > C + .001 && x > x0) { x = x0; y += rh; rh = 0; } if (x + w > C + .001) x = Math.max(0, C - w);
    if (y + h > R + .001) { p++; y = 0; x = x0; rh = 0; }
    news[k] = { p, x, y, w, h }; x += w; rh = Math.max(rh, h); });
  fgApplyMany(news);
}
// aumentar / diminuir: todos crescem juntos a partir do card escolhido, sem se afastar uns dos outros
function fgBatchScale(f) {
  const l = fgSelList(), { R, C } = fgDim();
  if (!fgFree) { fgKeepSel(() => { l.forEach(k => { const o = fg.place[k], w = Math.max(1, Math.min(C, o.w + (f > 1 ? 1 : -1))), h = Math.max(1, Math.min(R, o.h + (f > 1 ? 1 : -1))); fgResize(fg.items[k], w, h); }); }); return; }
  const a = fg.place[l[0]], news = {};
  l.forEach(k => { const o = fg.place[k], w = Math.max(FR_MIN, Math.min(FR_MAX, C, o.w * f)), h = Math.max(FR_MIN, Math.min(FR_MAX, R, o.h * f));
    news[k] = o.p !== a.p ? { ...o, w: Math.min(w, C - o.x), h: Math.min(h, R - o.y) } : { p: o.p, x: Math.max(0, Math.min(C - w, a.x + (o.x - a.x) * f)), y: Math.max(0, Math.min(R - h, a.y + (o.y - a.y) * f)), w, h }; });
  fgApplyMany(news);
}
// formato da capa: cada card assume o formato da sua imagem atual (mantendo o tamanho)
async function fgBatchShape() {
  const l = fgSelList(), { R, C } = fgDim(), news = {};
  for (const k of l) {
    const g = fg.items[k], o = fg.place[k], el = $('fgTrack').querySelector(`.fgcard[data-i="${k}"]`), u = covers[coverKey(g)] || (el && el._url);
    const d = u ? await loadDims(u) : null, r = d ? Math.max(.4, Math.min(2.4, d.w / d.h)) : null;
    if (!fgFree) { if (r) { const w = r > 1.3 ? 2 : 1, h = r < .75 ? 2 : 1; news[k] = [w, h]; } continue; }
    const area = o.w * o.h, s2 = r ? { h: Math.sqrt(area / r), w: Math.sqrt(area * r) } : fgFrSize(g);
    const w = Math.max(FR_MIN, Math.min(FR_MAX, C, s2.w)), h = Math.max(FR_MIN, Math.min(FR_MAX, R, s2.h));
    news[k] = { p: o.p, x: Math.min(o.x, C - w), y: Math.min(o.y, R - h), w, h };
  }
  if (!fgFree) { fgKeepSel(() => Object.keys(news).forEach(k => fgResize(fg.items[k], ...news[k]))); sfx('ok'); return; }
  fgApplyMany(news);
}
function fgCtx(x, y, sizes) {
  const g = fg.items[fg.sel]; if (!g) return;
  if (!x) { const r = $('fgTrack').querySelector('.fgcard.sel').getBoundingClientRect(); x = r.left + 20; y = r.top + 20; }
  const { R, C } = fgDim(), cur = fgSize(g), sub = (k) => () => setTimeout(() => fgCtx(x, y, k), 0), back = ['back', 'Voltar', sub(false), '', 2];
  const many = fgMulti.size > 1 && fgMulti.has(fg.sel);
  let items;
  if (many && !sizes) items = [
    `${fgMulti.size} jogos selecionados`,
    ['resize', 'Redimensionar', sub('many'), '', 1],
    ...(fgFree ? [['snap', 'Alinhar à grade', () => fgBatchGrid()]] : []),
    ['auto', 'Alinhar automaticamente', () => fgBatchAuto()],
    null,
    ['clear', 'Limpar seleção', () => fgClearMulti()],
    ['unfav', `Desfavoritar ${fgMulti.size} jogos`, () => fgBatchUnfav(), 'red'],
  ];
  else if (sizes === 'many') items = [back, null, 'Redimensionar lote', ['grow', 'Aumentar', () => fgBatchScale(1.25)], ['shrink', 'Diminuir', () => fgBatchScale(.8)], ['shape', 'Formato da capa', () => fgBatchShape()]];
  else if (sizes === 'org') items = [back, null, ...fgArrangeItems(), null, ...fgModeItems()];
  else if (sizes && fgFree) {
    const i = fg.sel, pl = fg.place[i];
    const rs = f => frCommit(i, { ...pl, w: Math.max(FR_MIN, Math.min(FR_MAX, C - pl.x, pl.w * f)), h: Math.max(FR_MIN, Math.min(FR_MAX, R - pl.y, pl.h * f)) });
    items = [back, null, 'Redimensionar', ['grow', 'Aumentar', () => rs(1.25)], ['shrink', 'Diminuir', () => rs(.8)], ['shape', 'Formato da capa', async () => {   // usa a imagem que está no card agora (inclusive uma capa recém-trocada)
      const g = fg.items[i], el = $('fgTrack').querySelector(`.fgcard[data-i="${i}"]`), u = covers[coverKey(g)] || (el && el._url);
      const d = u ? await loadDims(u) : null, r = d ? Math.max(.4, Math.min(2.4, d.w / d.h)) : null;
      const area = pl.w * pl.h, s2 = r ? { h: Math.sqrt(area / r), w: Math.sqrt(area * r) } : fgFrSize(g);   // mantém o tamanho, muda só o formato
      s2.w = Math.max(FR_MIN, Math.min(FR_MAX, s2.w)); s2.h = Math.max(FR_MIN, Math.min(FR_MAX, s2.h));
      frCommit(i, { ...pl, w: Math.min(s2.w, C - pl.x), h: Math.min(s2.h, R - pl.y) });
    }]];
  } else if (sizes) {
    items = [back, null, 'Tamanho (colunas × linhas)'];
    for (let h = 1; h <= R; h++) for (let w = 1; w <= C; w++) items.push(['resize', `${w} × ${h}${w === cur.w && h === cur.h ? '  ✓' : ''}`, () => fgResize(g, w, h)]);
  } else items = [
    esc(dn(g)),
    ['info', 'Info', () => fgInfo(true)],
    ['pen', 'Renomear', () => fgRename()],
    null, 'Card',
    ['img', 'Alterar imagem', () => openCover('card')],
    ['title', 'Alterar título', () => openCover('logo')],
    ['move', 'Reposicionar imagem', () => fgPosOpen()],
    ['resize', 'Redimensionar', sub(true), '', 1],
    null, 'Fundo',
    ['wall', 'Alterar fundo', () => openCover(true)],
    ['move', 'Reposicionar fundo', () => fgBgPosOpen()],
    null,
    ['org', 'Organizar Favoritos', sub('org'), '', 1],
    ['unfav', 'Desfavoritar', async () => { if (!await ask('Desfavoritar este jogo?', `"${dn(g)}" sai da tela de Favoritos (o jogo continua no seu PC).`, 'Desfavoritar')) return; await toggleFav(g); openFavGrid(); }, 'red'],
  ];
  fgMenu(items, x, y);
}
// "Info": capa 3D, vídeo e dados do jogo num modal (reaproveita o painel da direita da lista)
function fgInfo(on) {
  const right = $('fgInfoBox').querySelector('.right') || document.querySelector('.right');
  if (on) {
    const g = fg.items[fg.sel]; if (!g) return;
    fgInfoOpen = true; $('fgInfo').classList.add('on'); $('fgInfoBox').appendChild(right);
    screen = 'games'; sys = sysOf(g); shown = fg.items; gIdx = -1;
    selectGame(fg.sel, true); sfx('ok');
  } else {
    if (!fgInfoOpen) return;
    stopVideo(); fgInfoOpen = false; $('fgInfo').classList.remove('on');
    document.querySelector('#games .body').appendChild(right);
    screen = 'favgrid'; sfx('back');
  }
}
$('fgInfo').onclick = e => { if (e.target === $('fgInfo')) fgInfo(false); };
$('fgiClose').onclick = () => fgInfo(false);
$('fgiPlay').onclick = () => { fgInfo(false); fgLaunch(); };
// mover com o controle: □ "levanta" o card, o D-pad leva célula por célula (passa de página nas laterais), □ de novo solta
function fgMoveMode() {
  const i = fg.sel, pl = fg.place[i]; if (!pl) return;
  if (!fg.moving) { fg.moving = { i, t: { p: pl.p, x: pl.x, y: pl.y } }; fgLift(); sfx('ok'); return; }
  const t = fg.moving.t; fg.moving = null;
  if (fgFree) { frCommit(i, { p: t.p, x: t.x, y: t.y, w: pl.w, h: pl.h }); return; }
  fgDropInto(i, t); sfx('ok'); renderFavGrid();
}
function fgLift() { $('favgrid').classList.add('arrange'); const el = $('fgTrack').querySelector(`.fgcard[data-i="${fg.moving.i}"]`); if (el) el.classList.add('lift'); }
function fgMoveStep(dir) {
  const m = fg.moving, pl = fg.place[m.i], t = m.t, { R, C } = fgDim();
  if (fgFree) {   // livre: anda 1/4 de célula; nas laterais passa de página
    const st = FR_STEP;
    if (dir === 'up') t.y = Math.max(0, t.y - st); else if (dir === 'down') t.y = Math.min(R - pl.h, t.y + st);
    else if (dir === 'left') { if (t.x > .001) t.x = Math.max(0, t.x - st); else if (t.p > 0) { t.p--; t.x = C - pl.w; } }
    else if (dir === 'right') { if (t.x < C - pl.w - .001) t.x = Math.min(C - pl.w, t.x + st); else { t.p++; t.x = 0; } }
    const el = $('fgTrack').querySelector(`.fgcard[data-i="${m.i}"]`);
    if (el) { while ($('fgTrack').children.length <= t.p) fgAddPage(); const pg = $('fgTrack').children[t.p]; if (el.parentNode !== pg) pg.appendChild(el); el.style.cssText = frStyle({ x: t.x, y: t.y, w: pl.w, h: pl.h }); }
    fgLift(); if (t.p !== fg.page) fgPage(t.p, true); sfx('tick'); return;
  }
  if (dir === 'up') t.y = Math.max(0, t.y - 1); else if (dir === 'down') t.y = Math.min(R - pl.h, t.y + 1);
  else if (dir === 'left') { if (t.x > 0) t.x--; else if (t.p > 0) { t.p--; t.x = C - pl.w; } }
  else if (dir === 'right') { if (t.x < C - pl.w) t.x++; else { t.p++; t.x = 0; } }
  fgPreview(m.i, t); fgLift(); if (t.p !== fg.page) fgPage(t.p, true); sfx('tick');
}
function fgInput(a) {
  if (fg.moving) {
    if (a === 'left' || a === 'right' || a === 'up' || a === 'down') return fgMoveStep(a);
    if (a === 'fav' || a === 'ok') return fgMoveMode();
    if (a === 'back') { fg.moving = null; sfx('back'); renderFavGrid(); return; }
    return;
  }
  if (a === 'left' || a === 'right' || a === 'up' || a === 'down') fgMove(a);
  else if (a === 'pgup') { fgPage(fg.page - 1); const i = fg.place.findIndex(p => p.p === fg.page); if (i >= 0) fgSelect(i, true); }
  else if (a === 'pgdn') { fgPage(fg.page + 1); const i = fg.place.findIndex(p => p.p === fg.page); if (i >= 0) fgSelect(i, true); }
  else if (a === 'ok') { if (fg.items[fg.sel]) fgLaunch(); }
  else if (a === 'menu') fgCtx();
  else if (a === 'fav') fgMoveMode();
  else if (a === 'back') { if (fgMulti.size) { fgClearMulti(); return; } fgInfo(false); back(); }
}
$('fgHome').onclick = () => { $('fgHome').blur(); back(); };
let fgWheelT = 0;
$('favgrid').addEventListener('wheel', e => { if (e.target.closest && e.target.closest('.fgdet')) return; if (screen !== 'favgrid') return; if (Date.now() - fgWheelT < 350) { e.preventDefault(); return; } fgWheelT = Date.now(); const d = Math.abs(e.deltaX) > Math.abs(e.deltaY) ? e.deltaX : e.deltaY; if (Math.abs(d) < 20) return; e.preventDefault(); fgInput(d > 0 ? 'pgdn' : 'pgup'); }, { passive:false });

// janela "em pé" (mais alta que larga): os Favoritos viram a lista comum (como nos consoles); voltando a ficar larga, volta a grade
const isPortrait = () => innerWidth < innerHeight;
let favAsList = false;
// Favoritos em grade (padrão) ou em lista (igual às telas de console); a escolha fica salva
let favView = 'grid'; try { favView = localStorage.getItem('favview') || 'grid'; } catch (e) {}
function openFavorites() { if (isPortrait() || favView === 'list') { favAsList = true; openGlobal('', true); } else { favAsList = false; openFavGrid(); } favViewsPaint(); }
function setFavView(v) {
  if (favView === v) return; favView = v; try { localStorage.setItem('favview', v); } catch (e) {}
  sfx('ok'); stopVideo(); if (v === 'list') { favAsList = true; openGlobal('', true); } else { favAsList = false; openFavGrid(); } favViewsPaint();
}
function favViewsPaint() {
  ['gv', 'fv'].forEach(p => ['Grid', 'List'].forEach(k => { const b = $(p + k); if (b) b.classList.toggle('on', (k === 'Grid') === (favView !== 'list')); }));
  const gv = $('gViews'); if (gv) gv.style.display = favMode ? 'flex' : 'none';
}
document.querySelectorAll('.hview').forEach(b => b.onclick = e => { e.stopPropagation(); b.blur(); setFavView(b.dataset.v); });
window.addEventListener('resize', () => {
  if (fgInfoOpen || fp.open || fxOpen) return;
  if (screen === 'favgrid' && isPortrait()) { favAsList = true; openGlobal('', true); }
  else if (screen === 'games' && favMode && favAsList && !isPortrait() && favView !== 'list') { favAsList = false; stopVideo(); openFavGrid(); }
});
// cabeçalho redimensionável: arrastar a borda de baixo (90–320 px), lembrado entre sessões
(() => {
  const h = $('fgHeader'); if (!h) return;
  const set = v => { v = Math.max(90, Math.min(320, Math.round(v))); $('favgrid').style.setProperty('--fgh', v + 'px'); return v; };
  let cur = 150; try { cur = +localStorage.getItem('fgh') || 150; } catch (e) {}
  set(cur);
  const g = document.createElement('div'); g.className = 'fghgrip'; g.title = 'Arraste para redimensionar'; h.appendChild(g);
  g.addEventListener('pointerdown', e => {
    e.preventDefault(); e.stopPropagation(); g.setPointerCapture(e.pointerId); g.classList.add('on');
    const y0 = e.clientY, h0 = h.offsetHeight;
    const mv = ev => { cur = set(h0 + ev.clientY - y0); if (typeof fgCell === 'function') fgCell(); };
    const up = () => { g.removeEventListener('pointermove', mv); g.removeEventListener('pointerup', up); g.classList.remove('on'); try { localStorage.setItem('fgh', cur); } catch (e) {} if (typeof fgCell === 'function') { fgCell(); } };
    g.addEventListener('pointermove', mv); g.addEventListener('pointerup', up);
  });
})();
// retângulo de seleção (como na Área de Trabalho do Windows): arrastar a partir de um espaço vazio seleciona os cards tocados; Ctrl soma à seleção
$('favgrid').addEventListener('pointerdown', e => {
  if (e.button !== 0 || screen !== 'favgrid' || e.target.closest('.fgcard, #fgHeader, #fgDots, .fgdet, button, .ctx')) return;
  const x0 = e.clientX, y0 = e.clientY, base = e.ctrlKey ? new Set(fgMulti) : new Set();
  let box = null, cards = null;
  const mv = ev => {
    if (!box) {
      if (Math.hypot(ev.clientX - x0, ev.clientY - y0) < 6) return;
      box = document.createElement('div'); box.className = 'fgmarq'; document.body.appendChild(box);
      cards = [...$('fgTrack').children[fg.page].querySelectorAll('.fgcard')].map(el => ({ i: +el.dataset.i, r: el.getBoundingClientRect() }));   // mede uma vez só
    }
    const l = Math.min(x0, ev.clientX), t = Math.min(y0, ev.clientY), r = Math.max(x0, ev.clientX), b = Math.max(y0, ev.clientY);
    Object.assign(box.style, { left: l + 'px', top: t + 'px', width: (r - l) + 'px', height: (b - t) + 'px' });
    fgMulti.clear(); base.forEach(k => fgMulti.add(k));
    cards.forEach(c => { if (c.r.left < r && c.r.right > l && c.r.top < b && c.r.bottom > t) fgMulti.add(c.i); });
    fgMultiDom();
  };
  const up = () => {
    document.removeEventListener('pointermove', mv); document.removeEventListener('pointerup', up);
    if (!box) { if (!e.ctrlKey && fgMulti.size) fgClearMulti(); return; }   // clique simples no vazio: limpa a seleção
    box.remove();
    if (fgMulti.size) { const last = [...fgMulti].pop(); fgSelect(last, true); fgMultiDom(); sfx('tick'); }
  };
  document.addEventListener('pointermove', mv); document.addEventListener('pointerup', up);
});

// ---------- Ctrl+Z nos Favoritos: desfaz a última mudança (posição, tamanho, imagem do card, fundo, desfavoritar) ----------
const FG_KEYS = ['fcard|', 'fpos|', 'fsz|', 'ffree|', 'fofs|', 'bofs|', 'fav|'];
let fgUndo = [], fgLastSnap = null, fgUndoing = false;
function fgSnap() { const o = {}; for (const k in covers) if (FG_KEYS.some(p => k.startsWith(p))) o[k] = covers[k]; return o; }
const fgSame = (a, b) => { const ka = Object.keys(a), kb = Object.keys(b); return ka.length === kb.length && ka.every(k => a[k] === b[k]); };
// chamado depois de cada mudança: se algo mudou desde a última vez, guarda o estado anterior
function fgHist() {
  const cur = fgSnap();
  if (fgLastSnap && !fgUndoing && !fgSame(cur, fgLastSnap)) { fgUndo.push(fgLastSnap); if (fgUndo.length > 40) fgUndo.shift(); }
  fgLastSnap = cur;
}
async function fgUndoLast() {
  const snap = fgUndo.pop(); if (!snap) { toast('Nada para desfazer'); return; }
  const cur = fgSnap(), favChanged = Object.keys({ ...cur, ...snap }).some(k => k.startsWith('fav|') && cur[k] !== snap[k]);
  Object.keys({ ...cur, ...snap }).forEach(k => {
    if (cur[k] === snap[k]) return;
    if (snap[k] === undefined) delete covers[k]; else covers[k] = snap[k];
    api('/api/cover', { method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify({ key: k, url: snap[k] === undefined ? '' : snap[k] }) }).catch(() => {});
  });
  fgUndoing = true;
  try { if (favChanged) await openFavGrid(); else renderFavGrid(); } finally { fgUndoing = false; fgLastSnap = fgSnap(); }
  if (typeof applyCustom === 'function' && favChanged) FAVSYS.count = favKeys().length;
  sfx('back'); toast('Desfeito');
}
document.addEventListener('keydown', e => {
  if (screen !== 'favgrid' || !(e.ctrlKey || e.metaKey) || (e.key !== 'z' && e.key !== 'Z') || e.shiftKey) return;
  if (fp.open || fxOpen || modalOpen || oskOpen) return;
  e.preventDefault(); e.stopPropagation(); fgUndoLast();
}, true);

// renomear pelos Favoritos (menu ou F2): mesmo nome usado nas listas
async function fgRename() {
  const g = fg.items[fg.sel]; if (!g) return;
  const ok = await askInput('Renomear jogo', 'O nome muda só no Koru (o arquivo continua igual). Deixe vazio para voltar ao original.', 'Salvar', dn(g), 'Nome do jogo');
  if (!ok) return;
  const v = (($('catName') && $('catName').value) || '').trim(), key = 'name|' + coverKey(g), val = (!v || v === tidyName(g.name)) ? '' : v;
  const changed = (covers[key] || '') !== val;
  if (val) covers[key] = val; else delete covers[key];
  if (changed) artForget(g);   // busca as imagens de novo pelo nome novo
  try { await api('/api/cover', { method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify({ key, url: val }) }); } catch (e) { toast(e.message, true); }
  toast(val ? `Renomeado para "${val}"` : 'Nome original restaurado'); sfx('ok');
  const keep = fg.sel; renderFavGrid(); fgSelect(Math.min(keep, fg.items.length - 1), true);
}
// janela mudou de tamanho: refaz o encaixe/preenchimento do fundo atual
{ let t = 0; window.addEventListener('resize', () => { clearTimeout(t); t = setTimeout(() => { const host = $('fgBg'), l = host && [...host.querySelectorAll('.bgl')].pop(); if (l && host._url && host._g) fgBgRender(l, host._url, host._g); }, 250); }); }

// páginas: reordenar arrastando a bolinha (ou Ctrl+PageUp/PageDown na página atual)
function fgMovePage(from, to) {
  if (from === to || from < 0 || to < 0 || from >= fg.pages || to >= fg.pages) return;
  const ord = [...Array(fg.pages).keys()]; ord.splice(to, 0, ord.splice(from, 1)[0]);
  const np = []; ord.forEach((old, n) => np[old] = n);
  fg.items.forEach((g, i) => { const pl = fg.place[i]; if (!pl) return; const q = { ...pl, p: np[pl.p] }; if (fgFree) fgSetFr(g, q); else fgSetPos(g, { p: q.p, x: q.x, y: q.y }); });
  renderFavGrid(); fgPage(to); const i = fg.place.findIndex(p => p && p.p === to); if (i >= 0) fgSelect(i, true); sfx('tick');
}
function fgDotBind(d) {
  d.onpointerdown = e => {
    if (e.button !== 0) return; const from = +d.dataset.p, x0 = e.clientX; let drag = false, to = from;
    const dots = [...$('fgDots').querySelectorAll('[data-p]')];
    const mv = ev => {
      if (!drag && Math.abs(ev.clientX - x0) < 6) return; drag = true; d.classList.add('drag');
      d.style.transform = `translateX(${ev.clientX - x0}px) scale(1.15)`;
      to = dots.filter(o => o !== d && o.getBoundingClientRect().left + o.offsetWidth / 2 < ev.clientX).length;
      dots.forEach(o => o.classList.toggle('gap', o !== d && dots.filter(z => z !== d).indexOf(o) === to));
    };
    const up = () => { removeEventListener('pointermove', mv); removeEventListener('pointerup', up);
      if (!drag) { fgPage(from); return; } d.style.transform = ''; d.classList.remove('drag'); dots.forEach(o => o.classList.remove('gap')); fgMovePage(from, to); };
    addEventListener('pointermove', mv); addEventListener('pointerup', up);
  };
}
