// Koru — list.js
/* ---------- jogos ---------- */
let hidden = new Set(), hiddenOpen = false;
const EYE_OFF = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M2 12s3.6-7 10-7 10 7 10 7-3.6 7-10 7S2 12 2 12z"/><circle cx="12" cy="12" r="3"/></svg>';
const EYE_ON = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M3 3l18 18M10.6 5.1A10.8 10.8 0 0 1 12 5c6.4 0 10 7 10 7a17 17 0 0 1-3.2 4.1M6.6 6.6C3.8 8.4 2 12 2 12s3.6 7 10 7c1.6 0 3-.4 4.3-1"/></svg>';
const STAR = '<svg viewBox="0 0 24 24" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round"><path d="M12 3.5l2.6 5.3 5.8.8-4.2 4.1 1 5.8L12 16.8l-5.2 2.7 1-5.8-4.2-4.1 5.8-.8z"/></svg>';
const PEN = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M4 20h4L19 9l-4-4L4 16z"/><path d="M13.5 6.5l4 4"/></svg>';
let renaming = false;
function startRename(i) {
  const g = shown[i]; if (!g) return;
  if (i !== gIdx) selectGame(i); else ensureVisible(i);
  const row = $('list').querySelector(`.row[data-i="${i}"]`); if (!row) return;
  renaming = true;
  const nm = row.querySelector('.nm');
  nm.innerHTML = `<input class="rn" value="${esc(dn(g))}" spellcheck="false">`;
  const inp = nm.querySelector('input'); inp.focus(); inp.select();
  if (lastInputPad) setTimeout(() => openOsk(inp), 0);   // renomear pelo controle: teclado virtual
  inp.onclick = e => e.stopPropagation(); inp.ondblclick = e => e.stopPropagation();
  let finished = false;
  const finish = async save => {
    if (finished) return; finished = true; renaming = false;
    const v = inp.value.trim(), key = 'name|' + coverKey(g);
    if (save) {
      const val = (!v || v === tidyName(g.name)) ? '' : v;   // igual ao nome automático: não precisa guardar (o nome completo do arquivo pode ser guardado de propósito)
      const changed = (covers[key] || '') !== val;
      if (val) covers[key] = val; else delete covers[key];
      if (changed) { artForget(g); if (lastArt && lastArt.g === g) lastArt = null; }
      try { await api('/api/cover', { method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify({ key, url: val }) }); } catch (e) { toast(e.message, true); }
      toast(val ? `Renomeado para "${val}"` : 'Nome original restaurado'); sfx('ok');
    }
    refilterKeep();
  };
  inp.onkeydown = e => { e.stopPropagation(); if (e.key === 'Enter') finish(true); else if (e.key === 'Escape') finish(false); };
  inp.onblur = () => finish(true);
}
// ---- seleção em lote (Ctrl / Shift + clique) ----
const multi = new Set(); let anchor = -1;
function toggleMulti(g, keep) { if (!g) return; if (multi.has(g)) multi.delete(g); else multi.add(g); if (multi.size < 2 && !keep) multi.clear(); vRender(); multiInfo(); }
let multiKeep = false;   // seleção por Ctrl+Espaço: vale mesmo com 1 jogo só
function clearMulti() { multiKeep = false; if (!multi.size) return false; multi.clear(); anchor = -1; vRender(); multiInfo(); return true; }
function multiInfo() { const n = multi.size; $('count').textContent = n > 1 ? `${n} selecionados` : $('count').dataset.t || $('count').textContent; }
const postCover = (key, url) => api('/api/cover', { method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify({ key, url }) }).catch(() => {});
async function batchFav(on) {
  const list = [...multi];
  for (const g of list) { const key = 'fav|' + coverKey(g); if (on) { covers[key] = '1'; markFavNew(g); } else delete covers[key]; }
  sfx(on ? 'ok' : 'back'); toast(`${list.length} jogos ${on ? 'favoritados' : 'removidos dos favoritos'}`);
  await Promise.all(list.map(g => postCover('fav|' + coverKey(g), on ? '1' : '')));
  const nb = on ? nextBelow(new Set(list)) : null; multi.clear(); multiKeep = false;
  if (nb) refilterTo(nb); else refilterKeep();
}
// jogo logo abaixo do foco que não está entre os afetados (ou o de cima, se acabou a lista)
function nextBelow(ex) { const i0 = gIdx; return shown.slice(i0 + 1).find(x => !ex.has(x)) || shown.slice(0, i0).reverse().find(x => !ex.has(x)) || null; }
function refilterTo(g) { filter(); const j = shown.indexOf(g); selectGame(j >= 0 ? j : Math.min(gIdx, shown.length - 1), true); }
async function batchHide(on) {
  const list = [...multi];
  list.forEach(g => { const k = coverKey(g); if (on) hidden.add(k); else hidden.delete(k); });
  sfx('back'); toast(`${list.length} jogos ${on ? 'ocultados' : 'visíveis de novo'}`);
  try { await api('/api/hidden', { method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify([...hidden]) }); } catch (e) { toast(e.message, true); }
  refilterKeep();
}
async function batchCat(c) {
  const list = [...multi];
  for (const g of list) {
    const k = coverKey(g), val = c === g.cat ? '' : (c === '' ? '__main' : c);
    if (val) covers['cat|' + k] = val; else delete covers['cat|' + k];
    postCover('cat|' + k, val);
  }
  sfx('ok'); toast(`${list.length} jogos → ${catLabel(c)}`); refilterKeep();
}
async function batchDelete() {
  const list = [...multi], pc = list.some(g => sysOf(g).type === 'pc');
  if (!await ask(`Excluir ${list.length} jogos?`, pc ? 'Os jogos de PC serão desinstalados (quando possível) e as ROMs irão para a Lixeira do Windows.' : 'As ROMs (e arquivos com o mesmo nome) irão para a Lixeira do Windows.', 'Excluir todos')) return;
  let ok = 0;
  for (const g of list) {
    try { const r = await api('/api/delete', { method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify({ console: g.sid, path: g.path }) });
      if (r.ok) { ok++; if (!r.keep) [games, gameCache[g.sid], allGames].forEach(l => { if (l) { const k = l.indexOf(g); if (k >= 0) l.splice(k, 1); } }); } } catch (e) {}
  }
  toast(`${ok} de ${list.length} excluídos`); multi.clear(); refilterKeep();
}
function openBatchCtx(x, y) {
  const list = [...multi], allFav = list.every(isFavG), allHid = list.every(g => hidden.has(coverKey(g)));
  const n = list.length;
  ctxItems = [
    ['star', allFav ? `Remover ${n} dos favoritos` : `Favoritar ${n} jogos`, () => batchFav(!allFav)],
    ['eye', allHid ? `Mostrar ${n} jogos` : `Ocultar ${n} jogos`, () => batchHide(!allHid)],
    null,
    ...catTargets().map(c => ['cover', 'Mover para ' + catLabel(c), () => batchCat(c)]),
    null,
    ['pen', 'Limpar seleção', () => clearMulti()],
    ['del', `Excluir ${n} jogos`, () => batchDelete(), 'red'],
  ];
  const m = $('ctx');
  m.innerHTML = ctxItems.map((it, k) => it ? `<div class="ci ${it[3] || ''}" data-k="${k}">${ICO[it[0]]}${it[1]}</div>` : '<div class="sep"></div>').join('');
  m.querySelectorAll('.ci').forEach(el => el.onclick = e => { e.stopPropagation(); closeCtx(); ctxItems[+el.dataset.k][2](); });
  m.classList.add('on'); ctxSel = -1;
  const r = m.getBoundingClientRect();
  ctxPlace(m, x, y);
}
// ---- menu do botão direito ----
const ICO = {
  pen: PEN, star: STAR, eye: EYE_OFF,
  cover: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><rect x="5" y="3" width="14" height="18" rx="2"/><path d="M8 17l2.5-3 2 2 1.5-2 2 3"/></svg>',
  bg: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><rect x="3" y="5" width="18" height="14" rx="2"/><path d="M3 16l5-5 4 4 3-3 6 6"/></svg>',
  del: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"><path d="M4 7h16M9 7V4h6v3M6 7l1 13h10l1-13"/></svg>',
};
let ctxItems = [], ctxSel = -1;
function openCtx(g, x, y) {
  const i = shown.indexOf(g), hid = hidden.has(coverKey(g)), fav = isFavG(g);
  ctxItems = [
    ['pen', 'Renomear', () => startRename(i)],
    ['star', fav ? 'Remover dos favoritos' : 'Favoritar', () => toggleFav(g)],
    ['eye', hid ? 'Mostrar' : 'Ocultar', () => toggleHidden(g)],
    ['cover', 'Trocar capa', () => openCover(false)],
    ['bg', 'Trocar fundo', () => openCover(true)],
    ['cover', 'Trocar título (lombada)', () => openCover('logo')],
    ...(catSid() ? [null, ['folder', 'Mover para subcategoria', () => setTimeout(() => catMoveMenu(g, x, y), 0), '', 1]] : []),
    null,
    ['del', sysOf(g).type === 'pc' ? 'Desinstalar / excluir' : 'Excluir', () => askDelete(g), 'red'],
  ];
  if (!ICO.folder) catMenuIco();
  fgMenu(ctxItems, x, y);
}
function catMoveMenu(g, x, y) {
  const cur = ecat(g) || '';
  fgMenu([['back', 'Voltar', () => setTimeout(() => openCtx(g, x, y), 0), '', 2], null, 'Mover para',
    ...catTargets().map(c => ['folder', esc(catLabel(c)) + (c === cur ? '  ✓' : ''), async () => { await saveKey('cat|' + coverKey(g), c || '__main'); toast(`Movido para "${catLabel(c)}"`); refilterKeep(); }]),
    null, ['plus', 'Nova subcategoria', async () => { const v = await catAdd(); if (v) { await saveKey('cat|' + coverKey(g), v); refilterKeep(); } }]], x, y);
}
// posiciona o menu: abre para cima quando não cabe embaixo; nunca sai da tela
function ctxPlace(m, x, y) {
  m.style.maxHeight = (innerHeight - 16) + 'px'; m.style.overflowY = 'auto';
  const r = m.getBoundingClientRect(), h = r.height, w = r.width;
  m.style.left = Math.max(8, Math.min(x, innerWidth - w - 8)) + 'px';
  m.style.top = (y + h > innerHeight - 8 ? Math.max(8, y - h) : y) + 'px';
}
// menus com submenu ao lado (nível 0 = #ctx, nível 1 = #ctx2)
let ctx2Items = [], ctx2Sel = -1, ctxLvl = 0, ctxSubFrom = null, ctxKbOpen = false, ctxHov = 0;
const ctxEl = l => $(l ? 'ctx2' : 'ctx');
function closeSub() { $('ctx2').classList.remove('on'); ctx2Sel = -1; ctxLvl = 0; $('ctx').querySelectorAll('.ci.open').forEach(e => e.classList.remove('open')); }
function closeCtx() { closeSub(); $('ctx').classList.remove('on'); ctxSel = -1; }
function ctxMove(d) { const els = [...ctxEl(ctxLvl).querySelectorAll('.ci')]; if (!els.length) return; let s = ctxLvl ? ctx2Sel : ctxSel; s = (s + d + els.length) % els.length; if (ctxLvl) ctx2Sel = s; else ctxSel = s; els.forEach((e, k) => e.classList.toggle('kb', k === s)); els[s].scrollIntoView({ block: 'nearest' }); }
function ctxOk() { const el = ctxEl(ctxLvl).querySelectorAll('.ci')[ctxLvl ? ctx2Sel : ctxSel]; if (el) { ctxKbOpen = true; el.click(); setTimeout(() => ctxKbOpen = false, 50); } }
function ctxRight() { const el = !ctxLvl && $('ctx').querySelectorAll('.ci')[ctxSel]; if (el && el.querySelector('.sub')) ctxOk(); }
function ctxLeft() { if ($('ctx2').classList.contains('on')) closeSub(); else closeCtx(); }
document.addEventListener('click', () => closeCtx());
const sysOf = g => allSystems.find(s => s.id === g.sid) || sys;
// confirmação (modal próprio, funciona também com controle)
function ask(title, text, yes, alt, html) {   // alt: 3º botão opcional (resolve com 'alt')
  return new Promise(res => {
    $('askTitle').textContent = title; if (html) { $('askText').innerHTML = text; $('askText').querySelectorAll('a[data-href]').forEach(a => a.tabIndex = 0); $('askText').querySelectorAll('a[data-href]').forEach(a => a.onclick = e => { e.preventDefault(); api('/api/open', { method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify({ url: a.dataset.href }) }).catch(() => {}); }); } else $('askText').textContent = text; $('askYes').textContent = yes || 'Excluir';
    $('askAlt').style.display = alt ? '' : 'none'; $('askAlt').textContent = alt || '';
    $('askModal').classList.add('on'); askOpen = true; $('askNo').focus();
    const done = v => { $('askModal').classList.remove('on'); askOpen = false; res(v); };
    $('askYes').onclick = () => done(true); $('askNo').onclick = () => done(false); $('askAlt').onclick = () => done('alt');
    askDone = done;
  });
}
let askOpen = false, askDone = null;
// pergunta com campo de texto (Enter confirma; pelo controle, ✕ no campo abre o teclado virtual)
function askInput(title, text, yes, value, ph) {
  const p = ask(title, `${esc(text)}<input id="catName" class="catin" maxlength="120" placeholder="${esc(ph || '')}" value="${esc(value || '')}">`, yes, null, true);
  setTimeout(() => { const i = $('catName'); if (!i) return; i.focus(); i.select(); i.onkeydown = e => { e.stopPropagation(); if (e.key === 'Enter') { e.preventDefault(); $('askYes').click(); } else if (e.key === 'Escape') { e.preventDefault(); $('askNo').click(); } }; }, 30);
  return p;
}
async function askDelete(g) {
  const pc = sysOf(g).type === 'pc', vid = sysOf(g).type === 'video';
  if (vid) { const ok = await ask('Excluir este vídeo do seu PC?', `"${esc(dn(g))}" vai para a Lixeira do Windows.`, 'Excluir'); if (!ok) return; vpRelease(); await new Promise(r => setTimeout(r, 400)); return askDeleteGo(g, false); }
  const ok = await ask(pc ? 'Desinstalar este jogo?' : 'Excluir este jogo do seu PC?',
    pc ? `"${dn(g)}" será desinstalado do computador (pela Steam ou pelo desinstalador do jogo, quando possível).`
       : `"${dn(g)}" e seus arquivos (ROM, faixas e saves com o mesmo nome) serão apagados do seu PC — vão para a Lixeira do Windows.`, pc ? 'Desinstalar' : 'Excluir');
  if (!ok) return;
  return askDeleteGo(g, pc);
}
async function askDeleteGo(g, pc) {
  let r; try { r = await api('/api/delete', { method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify({ console: g.sid, path: g.path }) }); } catch (e) { toast(e.message, true); return; }
  if (!r.ok) { await ask(pc ? 'Não foi possível desinstalar' : 'Não foi possível excluir', r.msg, 'OK'); return; }
  toast(r.msg); sfx('back');
  if (!r.keep) {
    [games, gameCache[g.sid], allGames].forEach(l => { if (l) { const k = l.indexOf(g); if (k >= 0) l.splice(k, 1); } });
    const s = allSystems.find(x => x.id === g.sid); if (s && s.count) s.count--;
    refilterKeep();
  }
}
// desfavoritou: esquece posição e tamanho do card — se favoritar de novo, entra como novo (primeiro espaço livre, no alto à esquerda)
function clearFavLayout(g) {
  ['fpos|', 'fsz|', 'ffree|'].forEach(p => { const k = p + coverKey(g); if (covers[k] === undefined) return; delete covers[k]; api('/api/cover', { method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify({ key: k, url: '' }) }).catch(() => {}); });
}
function markFavNew(g) { const k = 'fnew|' + coverKey(g); covers[k] = '1'; postCover(k, '1'); }   // nos Favoritos, o card vai pegar o formato da capa
async function toggleFav(g) {
  const key = 'fav|' + coverKey(g), on = covers[key] !== '1';
  if (on) { covers[key] = '1'; markFavNew(g); } else { delete covers[key]; clearFavLayout(g); }
  sfx(on ? 'ok' : 'back');
  const nb = on && screen === 'games' && shown[gIdx] === g ? nextBelow(new Set([g])) : null;   // favoritou o jogo em foco: segue para o de baixo
  try { await api('/api/cover', { method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify({ key, url: on ? '1' : '' }) }); } catch (e) { toast(e.message, true); }
  if (nb) refilterTo(nb); else refilterKeep();
}
async function toggleHidden(g) {
  const k = coverKey(g), hiding = !hidden.has(k), i0 = shown.indexOf(g);
  if (hiding) hidden.add(k); else hidden.delete(k);
  sfx('back');
  // ocultou o jogo em foco: o foco vai para o que estava logo abaixo dele (ou o de cima, se era o último)
  const nb = hiding && i0 >= 0 && shown[gIdx] === g ? (shown.slice(i0 + 1).find(x => !hidden.has(coverKey(x))) || shown.slice(0, i0).reverse().find(x => !hidden.has(coverKey(x)))) : null;
  try { await api('/api/hidden', { method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify([...hidden]) }); } catch (e) { toast(e.message, true); }
  const keep = nb || shown[gIdx]; filter(); const j = shown.indexOf(keep); selectGame(j >= 0 ? j : Math.min(gIdx, shown.length - 1), true);
}
// ---- categoria manual (arrastar), ordenação e categorias recolhíveis ----
// vídeos: só "Filmes" (1 h ou mais; sem a duração, arquivo de 1 GB ou mais) e "Vídeos" — pastas e subcategorias manuais não contam
// vídeos: subcategoria = pasta (séries ficam juntas); dentro da pasta só separa em Filmes/Vídeos se houver dos dois tipos
const vkind = g => (g.secs ? g.secs >= 5100 : (g.size || 0) >= 1073741824) ? 'Filmes' : 'Vídeos';   // filme: 1 h 25 min ou mais
let vMixMemo = { src: null, n: 0, map: null };
function vMix() {
  const src = typeof games !== 'undefined' ? games : [];
  if (vMixMemo.src !== src || vMixMemo.n !== src.length) { const m = {}; src.forEach(g => { const d = g.vdir || ''; (m[d] = m[d] || new Set()).add(vkind(g)); }); vMixMemo = { src, n: src.length, map: m }; }
  return vMixMemo.map;
}
const vcat = g => { const d = g.vdir || '', k = vkind(g), mixed = (vMix()[d] || new Set()).size > 1; return d ? (mixed ? d + ' · ' + k : d) : k; };
function ecat(g) { if ((sysOf(g) || {}).type === 'video') return vcat(g); const o = covers['cat|' + coverKey(g)]; const c = o === undefined ? g.cat : (o === '__main' ? '' : o); return c && deadCats(g.sid).includes(c) ? '' : c; }
// subcategorias por console: criadas pelo usuário ('ucat|console'), excluídas ('dcat|console') e nomes trocados ('lcat|console|cat')
const catSid = () => (sys && !sys.virtual && sys.id) || '';
const jsonOf = k => { try { return JSON.parse(covers[k] || '[]'); } catch (e) { return []; } };
const userCats = sid => jsonOf('ucat|' + sid), deadCats = sid => jsonOf('dcat|' + sid);
function saveKey(key, url) { if (url) covers[key] = url; else delete covers[key]; return api('/api/cover', { method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify({ key, url: url || '' }) }).catch(() => {}); }
const catLabel = c => { if (!c) return sys && sys.type === 'video' && !globalMode ? 'Vídeos' : 'Jogos'; const o = covers['lcat|' + catSid() + '|' + c]; return o || c; };
function catTargets() {
  if (sys && sys.type === 'video') return [];   // vídeos: subcategorias automáticas, sem mover
  const base = (sys && sys.type === 'pc') ? ['', 'Ferramentas para jogos', 'Outros programas'] : ['Traduzidos', '', 'Hack / Mod', 'Homebrew / Port', 'Beta / Protótipo', 'Não licenciado'];
  const sid = catSid(), dead = deadCats(sid);
  return base.filter(c => !c || !dead.includes(c)).concat(userCats(sid).filter(c => !base.includes(c)));
}
// ✏ e + ao lado da ordenação: gerenciar subcategorias do console
async function catAdd() {
  const sid = catSid(); if (!sid) { toast('Abra um console para criar subcategorias', true); return; }
  const ok = await askInput('Nova subcategoria', 'Ela fica vazia até você arrastar jogos para ela.', 'Criar', '', 'Nome da subcategoria');
  const v = ok && (($('catName') && $('catName').value) || '').trim(); if (!v) return;
  if (catTargets().some(c => catLabel(c).toLowerCase() === v.toLowerCase())) { toast('Já existe uma subcategoria com esse nome', true); return; }
  const list = userCats(sid); list.push(v); await saveKey('ucat|' + sid, JSON.stringify(list));
  saveKey('dcat|' + sid, JSON.stringify(deadCats(sid).filter(c => c !== v)));
  toast(`Subcategoria "${v}" criada`); refilterKeep(); return v;
}
// botão "Subcategorias": um só lugar para criar, renomear e excluir (funciona com mouse, teclado e controle)
const CAT_ICO = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round"><path d="M3 7.5A1.5 1.5 0 0 1 4.5 6H9l2 2h8.5A1.5 1.5 0 0 1 21 9.5v8a1.5 1.5 0 0 1-1.5 1.5h-15A1.5 1.5 0 0 1 3 17.5z"/></svg>';
function catMenuIco() { Object.assign(ICO, { folder: CAT_ICO, plus: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M12 5v14M5 12h14"/></svg>' }); }
function catMenu(x, y, c) {
  const sid = catSid(); if (!sid) { toast('Abra um console para editar subcategorias', true); return; }
  if (!ICO.folder) catMenuIco();
  const n = k => (games || []).filter(g => g.sid === sys.id && ecat(g) === k).length, again = k => () => setTimeout(() => catMenu(x, y, k), 0);
  let items;
  if (c != null) items = [['back', 'Voltar', again(null), '', 2], null, esc(catLabel(c)), ['pen', 'Renomear', () => catRename(c)], ['del', 'Excluir', () => catDelete(c), 'red']];
  else {
    const cs = catTargets().filter(Boolean);
    items = [`Subcategorias · ${esc(sys.name)}`, ['plus', 'Nova subcategoria', () => catAdd()], null,
      ...(cs.length ? cs.map(k => ['folder', `${esc(catLabel(k))} <i class="cn">${n(k)}</i>`, again(k), '', 1]) : ['Nenhuma subcategoria ainda']),
      null, 'Para mover jogos: arraste-os ou use o menu do jogo'];
  }
  fgMenu(items, x, y);
}
async function catRename(c) {
  const sid = catSid(), ok = await askInput('Renomear subcategoria', 'Só o nome muda; os jogos continuam nela.', 'Salvar', catLabel(c), 'Nome da subcategoria');
  const v = ok && (($('catName') && $('catName').value) || '').trim(); if (!v) return;
  await saveKey('lcat|' + sid + '|' + c, v === c ? '' : v); toast('Subcategoria renomeada'); refilterKeep();
}
async function catDelete(c) {
  const sid = catSid();
  if (!await ask('Excluir subcategoria?', `Os jogos de "${catLabel(c)}" vão para "Jogos". Nenhum arquivo é apagado.`, 'Excluir')) return;
  (games || []).forEach(g => { const k = 'cat|' + coverKey(g); if (covers[k] === c) saveKey(k, '__main'); });
  const uc = userCats(sid);
  if (uc.includes(c)) await saveKey('ucat|' + sid, JSON.stringify(uc.filter(x => x !== c)));
  else { const d = deadCats(sid); if (!d.includes(c)) d.push(c); await saveKey('dcat|' + sid, JSON.stringify(d)); }
  saveKey('lcat|' + sid + '|' + c, '');
  toast('Subcategoria excluída'); refilterKeep();
}
let collapsed = new Set(['Ocultos']); try { const c = JSON.parse(localStorage.getItem('collapsed') || 'null'); if (Array.isArray(c)) collapsed = new Set(c); } catch (e) {}
const saveCollapsed = () => { try { localStorage.setItem('collapsed', JSON.stringify([...collapsed])); } catch (e) {} };
const SORTS = [['az', 'Nome A→Z'], ['za', 'Nome Z→A'], ['size', 'Tamanho'], ['recent', 'Mais recentes']];
let sortMode = 'az'; try { sortMode = localStorage.getItem('sort') || 'az'; } catch (e) {}
// nome de exibição (só no app; o arquivo não muda): o que o usuário renomeou, ou o nome sem as marcações entre () e [] — ex.: "(J) [C][T+Eng]"
const tidyCache = new Map();
function tidyName(n) {
  let t = tidyCache.get(n); if (t !== undefined) return t;
  t = n.replace(/\s*(\([^)]*\)|\[[^\]]*\])/g, ' ').replace(/\s{2,}/g, ' ').replace(/[\s\-–_,.]+$/, '').trim();
  if (!t) t = n;
  tidyCache.set(n, t); return t;
}
function dn(g) { return covers['name|' + coverKey(g)] || tidyName(g.name); }
function nameCmp(a, b) { return dn(a).localeCompare(dn(b), 'pt', { sensitivity:'base' }); }
function sortCmp(a, b) {
  if (sortMode === 'za') return -nameCmp(a, b);
  if (sortMode === 'size') return (b.size - a.size) || nameCmp(a, b);
  if (sortMode === 'recent') return ((b.mtime || 0) - (a.mtime || 0)) || nameCmp(a, b);
  return nameCmp(a, b);
}
function refilterKeep() { const keep = shown[gIdx]; filter(); const j = shown.indexOf(keep); selectGame(j >= 0 ? j : Math.min(gIdx, shown.length - 1), true); }
async function moveToCat(g, c) {
  if (!g) return;
  const k = coverKey(g);
  if (c === '__hidden') { if (!hidden.has(k)) return toggleHidden(g); return; }
  if (c === '__fav') { if (covers['fav|' + k] !== '1') return toggleFav(g); return; }
  if (covers['fav|' + k] === '1') { delete covers['fav|' + k]; api('/api/cover', { method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify({ key: 'fav|' + k, url: '' }) }).catch(() => {}); }
  if (hidden.has(k)) { hidden.delete(k); api('/api/hidden', { method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify([...hidden]) }).catch(() => {}); }
  const key = 'cat|' + k, val = c === g.cat ? '' : (c === '' ? '__main' : c);
  if (val) covers[key] = val; else delete covers[key];
  try { await api('/api/cover', { method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify({ key, url: val }) }); } catch (e) { toast(e.message, true); }
  sfx('ok'); toast(`"${g.name}" → ${catLabel(c)}`);
  refilterKeep();
}
let dragGame = null;
const dragBatch = () => dragGame && multi.size > 1 && multi.has(dragGame);   // arrastando um jogo do lote: vale para todos
function dropTo(g, c) {
  if (!(multi.size > 1 && multi.has(g))) return moveToCat(g, c);
  if (c === '__fav') return batchFav(true);
  if (c === '__hidden') return batchHide(true);
  return batchCat(c);
}
function showDropPanel(on) {
  const p = $('dropPanel');
  if (!on) { p.classList.remove('on'); return; }
  const n = dragBatch() ? multi.size : 0;
  p.innerHTML = `<div class="dt">Solte em uma categoria${n ? ` · ${n} jogos` : ''}</div>` + ['__fav'].concat(catTargets(), ['__hidden']).map(c => `<div class="dz" data-cat="${esc(c)}">${c === '__hidden' ? '🙈 Ocultos' : c === '__fav' ? '⭐ Favoritos' : esc(catLabel(c))}</div>`).join('');
  p.querySelectorAll('[data-cat]').forEach(bindDrop);
  const r = $('list').getBoundingClientRect();   // canto esquerdo, por cima da lista (perto do mouse)
  Object.assign(p.style, { left: (r.left + 8) + 'px', top: (r.top + 8) + 'px', transform: 'none' });
  p.classList.add('on');
}
function bindDrop(el) {
  el.addEventListener('dragover', e => { if (!dragGame) return; e.preventDefault(); el.classList.add('over'); });
  el.addEventListener('dragleave', () => el.classList.remove('over'));
  el.addEventListener('drop', e => { e.preventDefault(); el.classList.remove('over'); const g = dragGame; dragGame = null; showDropPanel(false); dropTo(g, el.dataset.cat); });
}
let favMode = false;
const isFavG = g => covers['fav|' + coverKey(g)] === '1';
// monta os grupos (Favoritos, categorias, Ocultos) de uma lista de jogos
let privOn = false;   // pasta privada de vídeos: só aparece quando revelada (Ctrl+Shift+H / L3+R3), até sair do console
function makeGroups(match, noFav) {
  const priv = privOn ? match.filter(g => g.priv).sort(sortCmp) : [];
  match = match.filter(g => !g.priv);
  const sorter = (a, b) => (CATS.indexOf(ecat(a)) - CATS.indexOf(ecat(b))) || String(ecat(a) || '').localeCompare(String(ecat(b) || '')) || sortCmp(a, b);   // mesma subcategoria sempre junta (uma só por nome)
  const favs = noFav ? [] : match.filter(g => !hidden.has(coverKey(g)) && isFavG(g)).sort(sortCmp);
  const vis = match.filter(g => !hidden.has(coverKey(g)) && (noFav || !isFavG(g))).sort(sorter);
  const hid = match.filter(g => hidden.has(coverKey(g))).sort(sortCmp);
  const groups = [];
  if (priv.length) groups.push({ cat: '__priv', label: '🔓 Ocultos', items: priv });   // pasta privada revelada: sempre no topo
  if (favs.length) groups.push({ cat: '__fav', label: '⭐ Favoritos', items: favs, fav: true });
  vis.forEach(g => { const c = ecat(g); let gr = groups[groups.length - 1]; if (!gr || gr.cat !== c || gr.fav) groups.push(gr = { cat: c, label: catLabel(c), items: [] }); gr.items.push(g); });
  if (hid.length) groups.push({ cat: '__hidden', label: 'Ocultos', items: hid, hid: true });
  return { groups, nvis: favs.length + vis.length, grouped: vis.some(g => ecat(g)) || hid.length > 0 || favs.length > 0 };
}
// ---- lista virtualizada: só as linhas visíveis existem no DOM ----
let vItems = [], vRowH = 34, vHeadH = 32, vRaf = 0, vEmpty = '';
function measureRows() {
  const L = $('list'), p = document.createElement('div');
  p.style.cssText = 'position:absolute;visibility:hidden;left:0;right:0;top:0';
  p.innerHTML = '<div class="row"><span class="nm">X</span></div><div class="cathead"><span class="tog">+</span>X</div>';
  L.appendChild(p); vRowH = p.children[0].offsetHeight || 34; vHeadH = p.children[1].offsetHeight || 32; p.remove();
}
function vRender() {
  vRaf = 0; if (renaming) return;
  const L = $('list');
  if (!vItems.length) { L.innerHTML = vEmpty; return; }
  const top = L.scrollTop, h = L.clientHeight || 800;
  let y = 0, k = 0;
  while (k < vItems.length && y + vItems[k].h < top - 300) { y += vItems[k].h; k++; }
  const padTop = y; let html = '';
  while (k < vItems.length && y < top + h + 300) { html += vItems[k].mk ? vItems[k].mk() : vItems[k].html; y += vItems[k].h; k++; }
  let rest = 0; for (let j = k; j < vItems.length; j++) rest += vItems[j].h;
  L.innerHTML = `<div style="height:${padTop}px"></div>${html}<div style="height:${rest}px"></div>`;
  L.classList.toggle('multi', multi.size > 1 || multiKeep);
  const cur = L.querySelector(`.row[data-i="${gIdx}"]`); if (cur) cur.classList.add('cur');
  if (dragGame) { const d = L.querySelector(`.row[data-i="${shown.indexOf(dragGame)}"]`); if (d) d.classList.add('dragging'); }
}
function vSchedule() { if (!vRaf) vRaf = requestAnimationFrame(vRender); }
function rowTop(i) { let y = 0; for (const it of vItems) { if (it.i === i) return y; y += it.h; } return -1; }
let listMouseAt = 0;
document.addEventListener('pointerdown', e => { if (e.target.closest && e.target.closest('#list')) listMouseAt = Date.now(); }, true);
function ensureVisible(i) {
  const L = $('list'), y = rowTop(i); if (y < 0) return;
  if (Date.now() - listMouseAt < 400) {   // clique do mouse: só garante que aparece (sem pular a lista)
    if (y < L.scrollTop) L.scrollTop = y;
    else if (y + vRowH > L.scrollTop + L.clientHeight) L.scrollTop = y + vRowH - L.clientHeight;
  } else L.scrollTop = Math.max(0, y - (L.clientHeight - vRowH) / 2);   // teclado/controle: jogo em foco no meio, mostrando os que vêm depois
  vRender();
}
function bindListOnce() {
  const L = $('list'); if (L._bound) return; L._bound = true;
  L.addEventListener('scroll', vSchedule, { passive: true });
  window.addEventListener('resize', () => { measureRows(); vSchedule(); });
  const rowOf = e => e.target.closest && e.target.closest('.row');
  L.addEventListener('click', e => {
    const t = e.target.closest('[data-pen],[data-star],[data-eye]');
    if (t) { e.stopPropagation(); if (t.dataset.pen) startRename(+t.dataset.pen); else if (t.dataset.star) toggleFav(shown[+t.dataset.star]); else toggleHidden(shown[+t.dataset.eye]); return; }
    const h = e.target.closest('.cathead');
    if (h) { const l = h.dataset.label; if (collapsed.has(l)) collapsed.delete(l); else collapsed.add(l); saveCollapsed(); sfx('tick'); refilterKeep(); return; }
    const ck = e.target.closest('[data-ck]');
    if (ck) { e.stopPropagation(); toggleMulti(shown[+ck.dataset.ck]); return; }
    const r = rowOf(e); if (!r || renaming) return;
    const i = +r.dataset.i;
    if (e.shiftKey && shown[gIdx]) {   // Shift: seleciona do jogo atual até o clicado
      const a = Math.min(anchor >= 0 ? anchor : gIdx, i), b = Math.max(anchor >= 0 ? anchor : gIdx, i);
      if (!e.ctrlKey) multi.clear();
      for (let k = a; k <= b; k++) multi.add(shown[k]);
      if (anchor < 0) anchor = gIdx;
      selectGame(i); vRender(); multiInfo(); return;
    }
    if (e.ctrlKey) {   // Ctrl: adiciona/remove da seleção
      if (!multi.size && shown[gIdx]) multi.add(shown[gIdx]);
      toggleMulti(shown[i], true); anchor = i; selectGame(i); return;
    }
    if (multi.size) { multi.clear(); vRender(); multiInfo(); }
    anchor = -1; selectGame(i);
  });
  L.addEventListener('mousedown', e => { if (e.shiftKey) e.preventDefault(); });   // Shift+clique não seleciona texto
  L.addEventListener('dblclick', e => { if (e.shiftKey || e.ctrlKey || e.target.closest('[data-pen],[data-star],[data-eye],[data-ck],input')) return; if (rowOf(e)) listLaunch(); });
  L.addEventListener('contextmenu', e => { const r = rowOf(e); if (!r) return; e.preventDefault(); const g = shown[+r.dataset.i];
    if (multi.size > 1 && multi.has(g)) { openBatchCtx(e.clientX, e.clientY); return; }
    if (multi.size) { multi.clear(); vRender(); multiInfo(); }
    selectGame(+r.dataset.i); openCtx(g, e.clientX, e.clientY); });
  L.addEventListener('dragstart', e => { const r = rowOf(e); if (!r) return; dragGame = shown[+r.dataset.i]; e.dataTransfer.effectAllowed = 'move'; e.dataTransfer.setData('text/plain', dragGame.name); r.classList.add('dragging'); setTimeout(() => showDropPanel(true), 0); });
  L.addEventListener('dragend', () => { L.querySelectorAll('.dragging').forEach(x => x.classList.remove('dragging')); dragGame = null; showDropPanel(false); });
  // soltar sobre o cabeçalho de uma categoria
  const headOf = e => { const h = e.target.closest && e.target.closest('.cathead'); return h && !h.classList.contains('folder') ? h : null; };
  L.addEventListener('dragover', e => { const h = headOf(e); if (!h || !dragGame) return; e.preventDefault(); h.classList.add('over'); });
  L.addEventListener('dragleave', e => { const h = headOf(e); if (h) h.classList.remove('over'); });
  L.addEventListener('drop', e => { const h = headOf(e); if (!h) return; e.preventDefault(); h.classList.remove('over'); const g = dragGame; dragGame = null; showDropPanel(false); dropTo(g, h.dataset.cat); });
}
function filter() {
  bindListOnce(); measureRows();
  const q = $('q').value.toLowerCase().trim();
  const src = globalMode ? (allGames || []) : games;
  const qm = g => !q || dn(g).toLowerCase().includes(q) || g.name.toLowerCase().includes(q);
  let match = favMode ? src.filter(g => isFavG(g) && qm(g)) : (globalMode && !q ? [] : src.filter(qm));
  if (globalMode) match = match.filter(g => !g.priv && !hidden.has(coverKey(g)));   // busca geral: nunca mostra ocultos
  const sname = id => (allSystems.find(s => s.id === id) || {}).name || '';
  shown = []; vItems = [];
  let nvis = 0;
  const head = (cls, cat, key, isCol, label) => vItems.push({ h: vHeadH, i: -1, html: `<div class="cathead${cls}" data-cat="${esc(cat)}" data-label="${esc(key)}"><span class="tog">${isCol ? '+' : '−'}</span>${label}</div>` });
  const renderGroups = (res, pre, indent) => {
    nvis += res.nvis;
    const grouped = res.grouped || !!pre;
    res.groups.forEach(gr => {
      const key = pre + gr.label + (gr.hid ? '#open' : ''), isCol = grouped && (gr.hid ? !collapsed.has(key) : collapsed.has(key));   // Ocultos começa recolhido
      if (grouped) head(`${gr.hid ? ' hidh' : ''}${indent ? ' sub' : ''}`, gr.cat, key, isCol, `${esc(gr.label)} · ${gr.items.length}`);
      if (isCol) return;
      gr.items.forEach(g => {
        const i = shown.push(g) - 1, isHid = !!gr.hid, fav = isFavG(g);
        vItems.push({ h: vRowH, i, mk: () => `<div class="row${isHid ? ' hid' : ''}${indent ? ' sub' : ''}${multi.has(g) ? ' sel' : ''}" data-i="${i}" draggable="true">${multi.size > 1 || multiKeep ? `<span class="ck${multi.has(g) ? ' on' : ''}" data-ck="${i}"></span>` : ''}${globalMode ? `<span class="tag">${esc(sname(g.sid))}</span>` : ''}<span class="nm">${esc(dn(g))}</span>${ecat(g) && !grouped && !globalMode ? `<span class="cat">${esc(ecat(g))}</span>` : ''}<span class="eye" data-eye="${i}" title="${isHid ? 'Mostrar jogo' : 'Ocultar jogo'}">${isHid ? EYE_ON : EYE_OFF}</span><span class="pen" data-pen="${i}" title="Renomear (F2)">${PEN}</span>${isHid ? '' : `<span class="star${fav ? ' on' : ''}" data-star="${i}" title="${fav ? 'Remover dos favoritos' : 'Favoritar'}">${STAR}</span>`}</div>` });
      });
    });
  };
  if (globalMode) {
    // busca geral / Favoritos: uma "pasta" por console, com os jogos direto dentro
    const nSys = new Set(match.map(g => g.sid)).size;   // mais de um console no resultado: mostra o controle de cada um no título
    allSystems.forEach(s => {
      if (s.enabled === false) return;
      const items = match.filter(g => g.sid === s.id); if (!items.length) return;
      const key = 'c:' + s.id, isCol = collapsed.has(key);
      head(' folder', '', key, isCol, `${nSys > 1 ? `<img class="hctl" src="${logoUrl(s)}" alt="">` : '📁 '}${esc(s.name)} · ${items.length}`);
      if (isCol) { nvis += items.length; return; }
      const vis = items.filter(g => !hidden.has(coverKey(g))).sort(sortCmp);   // só a pasta do console, sem subcategorias
      renderGroups({ groups: [{ cat: '', label: '', items: vis }], nvis: vis.length, grouped: false }, '', true);
    });
  } else renderGroups(makeGroups(match, false), '', false);
  $('count').dataset.t = `${nvis} / ${src.length}`; $('count').textContent = $('count').dataset.t;
  for (const g of [...multi]) if (!shown.includes(g)) multi.delete(g);
  if (multi.size < 2 && !multiKeep) multi.clear(); if (!multi.size) multiKeep = false; $('list').classList.toggle('multi', multi.size > 1 || multiKeep); multiInfo();
  $('list').classList.toggle('g', globalMode);
  $('catBtn').style.display = globalMode || (sys && sys.type === 'video') ? 'none' : '';   // subcategorias são de cada console
  vEmpty = `<div class="empty">${favMode ? 'Nenhum jogo favoritado ainda — use a ⭐ ao lado de um jogo.' : globalMode && !q ? 'Digite o nome de um jogo.' : 'Nenhum jogo encontrado.'}</div>`;
  $('list').scrollTop = 0; vRender();
  selectGame(0, true);
}
let artTimer;
function selectGame(i, force) {
  if (!shown.length) { $('art').innerHTML = ''; $('details').innerHTML = ''; lastArt = null; stopVideo(); if (typeof setVidLogo === 'function') setVidLogo(null, ''); if (typeof clearBg === 'function' && globalMode && !favMode) clearBg(); return; }   // nada na lista (ex.: busca vazia): nenhum resto do jogo anterior
  i = Math.max(0, Math.min(shown.length - 1, i));
  if (i === gIdx && !force) return;
  if (!force) sfx('tick');
  gIdx = i;
  $('list').querySelectorAll('.row.cur').forEach(e => e.classList.remove('cur'));
  ensureVisible(i);
  const g = shown[i];
  if (globalMode) { sys = systems.find(s => s.id === g.sid); loadThumbIndex(sys).then(() => { if (shown[gIdx] === g) showArt(g); }); }
  $('details').innerHTML = `<h2>${esc(dn(g))}</h2>${g.cat ? `<div class="m" style="color:#ffcf8a">${isCustom(g) ? 'Custom ROM · ' : ''}${esc(g.cat)}</div>` : ''}<div class="m">${globalMode ? esc(sys.name) + ' · ' : ''}${fmtSize(g.size)} · <a class="plink" id="pathLink" title="Abrir a pasta do arquivo">${esc(g.path)}</a></div>` + `<div class="cbtns"><button class="cbtn" id="coverBtn"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><rect x="5" y="3" width="14" height="18" rx="2"/><path d="M8 17l2.5-3 2 2 1.5-2 2 3"/><circle cx="10" cy="9" r="1.5"/></svg>Trocar capa</button><button class="cbtn" id="bgBtn"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="5" width="18" height="14" rx="2"/><path d="M3 16l5-5 4 4 3-3 6 6"/><circle cx="16" cy="9" r="1.5"/></svg>Trocar fundo</button><button class="cbtn" id="logoBtn"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><rect x="9" y="2" width="6" height="20" rx="1.5"/><path d="M12 6v12"/></svg>Trocar título</button></div>` + (sys.emulatorOk ? '' : `<div class="notice">Sem emulador para este console — veja como configurar no menu do ícone do Koru (perto do relógio) → "Editar configuração".</div>`);
  $('pathLink').onclick = () => api('/api/reveal', { method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify({ path: g.path }) }).catch(e => toast(e.message, true));
  $('coverBtn').onclick = () => openCover(false); $('bgBtn').onclick = () => openCover(true); $('logoBtn').onclick = () => openCover('logo');
  artReq++; stopVideo(); if (!paintCached(g)) { lastArt = { g, url: null }; $('art').innerHTML = skeletonCase(g); clearBg(); }   // troca de jogo: limpa capa e fundo na hora (placeholder até carregar)

  clearTimeout(artTimer); artTimer = setTimeout(() => showArt(g), 90);   // evita baixar capa a cada tecla ao rolar rápido
}
const artCache = {};
const loadImg = (url, ms) => new Promise(ok => { const i = new Image(), t = setTimeout(() => { i.src = ''; ok(null); }, ms || 8000); i.onload = () => { clearTimeout(t); ok(i.naturalWidth > 1 ? url : null); }; i.onerror = () => { clearTimeout(t); ok(null); }; i.src = url; });
// testa todas ao mesmo tempo, mas devolve a primeira da lista que existir (mantém a preferência)
async function firstOk(urls) { const ps = (urls || []).map(u => loadImg(u)); for (const p of ps) { const r = await p; if (r) return r; } return null; }
const cleanTitle = n => n.replace(/\([^)]*\)|\[[^\]]*\]|\{[^}]*\}/g, ' ').replace(/www\.\S+|\b(BR|PTBR|PT-BR|Decrypted|USA|Europe|Rev ?\d*)\b/gi, ' ')
  .replace(/^(.*), The\b/, 'The $1').replace(/[_]+/g, ' ').replace(/\s+/g, ' ').trim();

$('catBtn').onclick = e => { e.stopPropagation(); const r = $('catBtn').getBoundingClientRect(); $('catBtn').blur(); catMenu(r.left, r.bottom + 4); };
