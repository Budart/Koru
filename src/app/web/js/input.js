// Koru — input.js
/* ---------- modo TV de tubo ---------- */
let crtOn = false; try { crtOn = localStorage.getItem('crt') === '1'; } catch (e) {}
const TV_ICO = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M8 3l4 4 4-4"/><rect x="2" y="7" width="20" height="14" rx="4"/><rect x="5" y="10" width="11" height="8" rx="2.5"/><circle cx="19" cy="12" r=".8"/><circle cx="19" cy="15.5" r=".8"/></svg>', MON_ICO = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><rect x="2" y="4" width="20" height="13" rx="1.5"/><path d="M8 21h8M12 17v4"/></svg>';
function setCrt(on) {
  crtOn = on; document.body.classList.toggle('crt', on);
  $('crtBtn').innerHTML = on ? MON_ICO : TV_ICO; $('crtBtn').title = on ? 'Voltar ao layout de monitor' : 'Layout para TV de tubo (CRT)';
  try { localStorage.setItem('crt', on ? '1' : '0'); } catch (e) {}
  if (screen === 'systems' && systems.length) selectSystem(sysIdx);
  if (lastArt && screen === 'games') $('art').innerHTML = buildCase(lastArt.g, lastArt.url, false, lastArt.ratio);
}
$('crtBtn').onclick = () => { setCrt(!crtOn); sfx('ok'); $('crtBtn').blur(); };
setCrt(crtOn);

/* ---------- janelas de confirmação com o controle: D-pad escolhe o botão/link, ✕ aperta o que está em foco, ○ cancela ---------- */
function askItems() { return [...$('askModal').querySelectorAll('.catin, .emurec a, .mfoot button')].filter(e => e.offsetParent); }
function askPad(a) {
  const it = askItems(); if (!it.length) return;
  let k = it.indexOf(document.activeElement);
  if (a === 'back') { askDone(false); return; }
  if (a === 'ok') { const t = k >= 0 ? it[k] : $('askNo'); if (t.tagName === 'INPUT') openOsk(t); else t.click(); return; }
  if (['left','right','up','down'].includes(a)) {
    k = k < 0 ? 0 : (k + ((a === 'left' || a === 'up') ? -1 : 1) + it.length) % it.length;
    it[k].focus(); sfx('tick');
  }
}
/* ---------- configuração com o controle: D-pad navega, ✕ ativa, ○ volta ao menu lateral / sai ---------- */
// cards (.ccard): o D-pad anda de card em card; ✕ entra no card e aí navega entre os campos dele; ○ sai do card
let cfgIn = null;
function cfgFocusables() {
  const sec = document.querySelector('#cfBody .cfsec.on'); if (!sec) return [];
  if (cfgIn && !sec.contains(cfgIn)) cfgIn = null;
  const all = [...(cfgIn || sec).querySelectorAll('.pick, .icopick .ico, input:not([type=radio]), textarea, button')].filter(e => e.offsetParent && !e.disabled && !e.closest('.pick') || e.classList.contains('pick'));
  if (cfgIn) return all;
  const out = []; all.forEach(e => { const c = e.closest('.ccard'); const it = c || e; if (!out.includes(it)) out.push(it); });
  return out;
}
function cfgMark(el) {
  document.querySelectorAll('#cfBody .kbf').forEach(e => e.classList.remove('kbf'));
  if (!el) return; el.classList.add('kbf'); if (el.tabIndex < 0 && !/INPUT|TEXTAREA|BUTTON/.test(el.tagName)) el.tabIndex = -1;
  el.focus({ preventScroll: true }); el.scrollIntoView({ block: 'nearest' });
}
function cfgPad(a) {
  const nav = [...document.querySelectorAll('#cfBody .cfnav button')], cur = document.querySelector('#cfBody .kbf'), inNav = !cur || nav.includes(cur);
  if (a === 'start') { $('cfCancel').onclick(); return; }
  if (inNav) {
    cfgIn = null;
    if (!cur) { cfgMark(nav.find(b => b.classList.contains('on')) || nav[0]); return; }   // 1º toque: só mostra o foco
    const k = Math.max(0, nav.indexOf(cur) < 0 ? nav.findIndex(b => b.classList.contains('on')) : nav.indexOf(cur));
    if (a === 'up' || a === 'down') { const n = nav[Math.max(0, Math.min(nav.length - 1, k + (a === 'up' ? -1 : 1)))]; n.click(); cfgMark(n); }
    else if (a === 'right' || a === 'ok') { if (!cur) { cfgMark(nav[k]); return; } const f = cfgFocusables(); if (f.length) { cfgMark(f[0]); sfx('tick'); } }
    else if (a === 'back') $('cfCancel').onclick();
    return;
  }
  if (cfgIn && (a === 'back' || (a === 'left' && cur && cur.tagName !== 'INPUT' && cur.tagName !== 'TEXTAREA' && cfgFocusables().indexOf(cur) === 0))) { const c = cfgIn; cfgIn = null; cfgMark(c); sfx('back'); return; }
  if (cur && cur.classList.contains('ico')) {   // grade de ícones / fundos: setas andam pela posição na tela
    const box = cur.closest('.icopick'), trig = () => box.closest('.ccard').querySelector(box.dataset.kind === 'bg' ? '[data-bgp]' : '[data-ico]');
    if (a === 'ok') { const t = trig(); cur.click(); sfx('ok'); setTimeout(() => { const nb = document.querySelector(`#cfBody [${t.hasAttribute('data-bgp') ? 'data-bgp' : 'data-ico'}="${t.dataset.bgp || t.dataset.ico}"]`); if (nb) cfgMark(nb); }, 30); return; }
    if (a === 'back') { const t = trig(); box.style.display = 'none'; cfgMark(t); sfx('back'); return; }
    const all = [...box.querySelectorAll('.ico')], r = cur.getBoundingClientRect(), cx = r.left + r.width / 2, cy = r.top + r.height / 2; let best = null, bd = 1e9;
    all.forEach(e => { if (e === cur) return; const q = e.getBoundingClientRect(), dx = q.left + q.width / 2 - cx, dy = q.top + q.height / 2 - cy;
      const ok = a === 'left' ? dx < -5 && Math.abs(dy) < r.height / 2 : a === 'right' ? dx > 5 && Math.abs(dy) < r.height / 2 : a === 'up' ? dy < -5 : dy > 5;
      if (!ok) return; const d = Math.abs(dx) * (a === 'up' || a === 'down' ? 1 : 1) + Math.abs(dy) * 3; if (d < bd) { bd = d; best = e; } });
    if (best) { cfgMark(best); sfx('tick'); return; }
    if (a === 'up') { cfgMark(trig()); sfx('tick'); return; }
    if (a === 'down') { const f = cfgFocusables(), j = f.indexOf(all[all.length - 1]); if (f[j + 1]) { cfgMark(f[j + 1]); sfx('tick'); } return; }
    return;
  }
  if (a === 'ok' && cur && (cur.hasAttribute('data-ico') || cur.hasAttribute('data-bgp'))) {   // abriu a grade pelo controle: o foco já vai para as imagens
    if (!cfgIn) cfgIn = cur.closest('.ccard');
    cur.click(); sfx('ok');
    const box = cur.closest('.ccard').querySelector('.icopick'); if (box && box.style.display !== 'none') { const s = box.querySelector('.ico.sel') || box.querySelector('.ico'); if (s) cfgMark(s); }
    return;
  }
  if (a === 'ok' && cur && cur.classList.contains('ccard')) { cfgIn = cur; const f0 = cfgFocusables(); if (f0.length) cfgMark(f0[0]); sfx('ok'); return; }
  const f = cfgFocusables(), k = f.indexOf(cur);
  if (cur && cur.classList.contains('ccard') && ['left','right','up','down'].includes(a)) {   // cards lado a lado: anda pela posição na tela
    const r = cur.getBoundingClientRect(), cx = r.left + r.width / 2, cy = r.top + r.height / 2; let best = null, bd = 1e9;
    f.forEach(e => { if (e === cur) return; const q = e.getBoundingClientRect(), dx = q.left + q.width / 2 - cx, dy = q.top + q.height / 2 - cy;
      const ok = a === 'left' ? dx < -20 && Math.abs(dy) < r.height / 2 : a === 'right' ? dx > 20 && Math.abs(dy) < r.height / 2 : a === 'up' ? dy < -20 : dy > 20;
      if (!ok) return; const d = Math.abs(dx) * (a === 'up' || a === 'down' ? 2 : 1) + Math.abs(dy) * (a === 'left' || a === 'right' ? 2 : 1); if (d < bd) { bd = d; best = e; } });
    if (best) { cfgMark(best); sfx('tick'); } else if (a === 'left') { cfgMark(nav.find(b => b.classList.contains('on'))); sfx('back'); }
    return;
  }
  if (a === 'back' || (a === 'left' && !(cur.tagName === 'INPUT' && cur.type !== 'checkbox') && !cur.classList.contains('pick'))) { cfgMark(nav.find(b => b.classList.contains('on'))); sfx('back'); return; }
  if (a === 'up' || a === 'down' || a === 'left' || a === 'right') {
    // cartões ilustrados lado a lado: ←/→ andam entre eles; ↑/↓ andam na ordem da tela
    let j = k + ((a === 'up' || a === 'left') ? -1 : 1);
    if ((a === 'up' || a === 'down') && cur.classList.contains('pick')) { const row = cur.parentNode; while (f[j] && f[j].parentNode === row) j += a === 'up' ? -1 : 1; }
    if (a === 'left' && j < 0) { cfgMark(nav.find(b => b.classList.contains('on'))); return; }
    if (f[j]) { cfgMark(f[j]); sfx('tick'); }
    return;
  }
  if (a === 'ok') {
    if (cur.classList.contains('pick')) { const r = cur.querySelector('input'); if (r && !r.checked) { r.checked = true; r.dispatchEvent(new Event('change', { bubbles: true })); } sfx('ok'); return; }
    if (cur.tagName === 'INPUT' && cur.type === 'checkbox') { cur.click(); sfx('ok'); return; }
    if (cur.tagName === 'BUTTON') { cur.click(); sfx('ok'); return; }
    openOsk(cur);   // campo de texto: abre o teclado virtual
  }
}
/* ---------- barra do topo na home (busca, config, som, TV) via ↑ ---------- */
let topSel = -1;
const TOP_IDS = ['gq', 'gear', 'mute', 'crtBtn', 'trBtn'];
function topMark(i) {
  topSel = i; TOP_IDS.forEach((id, k) => $(id) && $(id).classList.toggle('padsel', k === i));
  if (i >= 0) sfx('tick');
}
function topInput(a) {
  if (a === 'left' && topSel > 0) topMark(topSel - 1);
  else if (a === 'right' && topSel < TOP_IDS.length - 1) topMark(topSel + 1);
  else if (a === 'down' || a === 'back') { topMark(-1); sfx('back'); }
  else if (a === 'ok') {
    const id = TOP_IDS[topSel]; topMark(-1);
    if (id === 'gq') { openGlobal(''); setTimeout(() => openOsk($('q')), 50); }
    else { $(id).click(); if (id !== 'gear') topMark(TOP_IDS.indexOf(id)); }
  }
}
document.addEventListener('mousedown', () => { if (topSel >= 0) topMark(-1); }, true);
/* ---------- controles: teclado + gamepad ---------- */
function input(a) {
  if (gameOn) return;   // jogo aberto: comandos só voltam quando ele fecha
  if (VP.open) { vpInput(a); return; }
  if (oskOpen) { oskInput(a); return; }
  if (ARTPICK.open) { apInput(a); return; }
  if (askOpen) { askPad(a); return; }
  if ($('ctx').classList.contains('on')) { if (a === 'down') ctxMove(1); else if (a === 'up') ctxMove(-1); else if (a === 'ok') ctxOk(); else if (a === 'right') ctxRight(); else if (a === 'left' || a === 'back') ctxLeft(); else if (a === 'menu') closeCtx(); return; }
  if (modalOpen) { if ((a === 'pgup' || a === 'pgdn') && cardMode) { setCardKind(a === 'pgup' ? 'cover' : 'bg'); return; } if (a === 'back') closeCover(); else if (['left','right','up','down'].includes(a)) coverNav(a); else if (a === 'ok') coverPick(); else if (a === 'menu') openOsk($('cq')); return; }
  if (fxOpen) { if (a === 'back') fgFxClose(); return; }
  if (fp.open) { fpInput(a); return; }
  if (fgInfoOpen) { if (a === 'back') fgInfo(false); else if (a === 'ok') { fgInfo(false); fgLaunch(); } return; }
  if (screen === 'config') { cfgPad(a); return; }
  if (a === 'start') { openConfig(); return; }
  if (a === 'select') { if (screen === 'favgrid' || (screen === 'games' && favMode && !isPortrait())) setFavView(favView === 'list' ? 'grid' : 'list'); else setCrt(!crtOn); return; }
  if (a === 'search') { if (screen === 'games') { $('q').focus(); openOsk($('q')); } else if (screen === 'systems' || screen === 'favgrid') { openGlobal(''); setTimeout(() => openOsk($('q')), 50); } return; }
  if (screen === 'favgrid') { fgInput(a); return; }
  if (screen === 'systems' && (sysMoving || a === 'fav') && sysMoveInput(a)) return;   // □: mover console no carrossel
  if (screen === 'systems' && topSel >= 0) { topInput(a); return; }
  if (screen === 'systems') {
    if (a === 'up') { topMark(0); return; }
    if (a === 'menu') { openTradutor(); return; }
    if (a === 'left') selectSystem(sysIdx - 1); else if (a === 'right') selectSystem(sysIdx + 1);
    else if (a === 'ok') openSystem();
  } else {
    // topo da lista: busca e ordenação acessíveis pelo D-pad/setas (subir além do 1º jogo)
    const ae = document.activeElement, qi = $('q'), tops = [qi, $('sortBtn'), $('catBtn')].filter(x => x && x.offsetParent), ti = tops.indexOf(ae);
    if (ti >= 0) {
      const go = el => { ae.classList.remove('padsel'); el.focus(); el.classList.add('padsel'); sfx('tick'); };
      if (a === 'down') { ae.blur(); ae.classList.remove('padsel'); selectGame(Math.max(0, gIdx)); return; }
      if (a === 'right' && ti < tops.length - 1) { go(tops[ti + 1]); return; }
      if (a === 'left' && ti > 0) { go(tops[ti - 1]); return; }
      if (a === 'ok') { if (ae === qi) { if (lastInputPad) openOsk(qi); } else ae.click(); return; }
      if (a === 'back') { ae.blur(); ae.classList.remove('padsel'); return; }
      if (a === 'up' || a === 'right' || a === 'left') return;
    }
    if (a === 'up' && gIdx <= 0) { qi.focus(); qi.classList.add('padsel'); sfx('tick'); return; }
    if ((a === 'up' || a === 'down') && padPrev.fav && shown[gIdx]) {   // □ segurado: seleciona os jogos por onde passa
      multi.add(shown[gIdx]); selectGame(gIdx + (a === 'up' ? -1 : 1)); if (shown[gIdx]) multi.add(shown[gIdx]);
      $('list').classList.toggle('multi', multi.size > 1 || multiKeep); vRender(); multiInfo(); return;
    }
    if (a === 'up') selectGame(gIdx - 1); else if (a === 'down') selectGame(gIdx + 1);
    else if (a === 'pgup' || a === 'left') selectGame(gIdx - 10); else if (a === 'pgdn') selectGame(gIdx + 10);
    else if (a === 'home') selectGame(0); else if (a === 'end') selectGame(shown.length - 1);
    else if (a === 'ok') listLaunch(); else if (a === 'back') back(); else if (a === 'cover') openCover();
    else if (a === 'fav' && shown[gIdx]) {   // □: marca/desmarca o jogo em foco (segurando □ e andando, marca os percorridos)
      const g = shown[gIdx]; if (multi.has(g)) multi.delete(g); else multi.add(g);
      anchor = gIdx; $('list').classList.toggle('multi', multi.size > 1 || multiKeep); vRender(); multiInfo(); sfx('tick');
    }
    else if ((a === 'menu' || a === 'right') && shown[gIdx]) {   // → (ou △): menu de contexto; com lote selecionado, o menu do lote
      ensureVisible(gIdx); const el = $('list').querySelector('.row.cur'), r = el ? el.getBoundingClientRect() : $('list').getBoundingClientRect();
      if (multi.size > 1) openBatchCtx(r.left + 60, r.bottom); else openCtx(shown[gIdx], r.left + 60, r.bottom);
      ctxMove(1);
    }
  }
}
document.addEventListener('keydown', e => {
  if (VP.open) { vpKey(e); return; }
  if (gameOn) { e.preventDefault(); return; }
  { const ae = document.activeElement, typing = ae && (ae.tagName === 'TEXTAREA' || (ae.tagName === 'INPUT' && !/checkbox|radio|range/.test(ae.type)));
    if ((e.key === 'm' || e.key === 'M') && !e.ctrlKey && !e.altKey && !e.metaKey && !typing && !oskOpen && !renaming) { e.preventDefault(); setMute(!muted); return; } }   // M: liga/desliga o som em qualquer tela
  if (screen === 'systems' && e.ctrlKey && (e.key === 'ArrowLeft' || e.key === 'ArrowRight') && topSel < 0) {   // Ctrl + ←/→: leva o console (soltar o Ctrl grava)
    e.preventDefault(); if (!sysMoving) sysMoveInput('fav'); sysMoveInput(e.key === 'ArrowLeft' ? 'left' : 'right'); return;
  }
  if ((e.ctrlKey || e.metaKey) && (e.key === 'f' || e.key === 'F')) {   // Ctrl+F: busca do app (no lugar da busca do navegador)
    e.preventDefault(); e.stopPropagation();
    if (screen === 'games') { $('q').focus(); $('q').select(); } else if (screen !== 'config' && screen !== 'welcome') openGlobal('');
    return;
  }
  if (ARTPICK.open && !oskOpen) { const d = { ArrowLeft:'left', ArrowRight:'right', ArrowUp:'up', ArrowDown:'down', Escape:'back' }[e.key]; const inQ = document.activeElement === $('apQ'); if (d && !(inQ && (d === 'left' || d === 'right'))) { e.preventDefault(); apInput(d); } else if (e.key === 'Enter' && !inQ) { e.preventDefault(); apInput('ok'); } return; }
  if (oskOpen) { if (e.key === 'Escape') { e.preventDefault(); closeOsk(false); } else if (e.key === 'Enter') { closeOsk(false); } else setTimeout(oskShow, 0); return; }
  if (askOpen) {
    if (e.key === 'Escape') { e.preventDefault(); askDone(false); return; }
    const d = { ArrowLeft:'left', ArrowRight:'right', ArrowUp:'up', ArrowDown:'down' }[e.key]; if (d) { e.preventDefault(); askPad(d); }
    return;   // Enter/Espaço apertam o botão em foco (comportamento nativo)
  }
  if ($('ctx').classList.contains('on')) { e.preventDefault(); if (e.key === 'ArrowDown') ctxMove(1); else if (e.key === 'ArrowUp') ctxMove(-1); else if (e.key === 'Enter' || e.key === ' ') ctxOk(); else if (e.key === 'ArrowRight') ctxRight(); else if (e.key === 'Escape' || e.key === 'ArrowLeft') ctxLeft(); return; }
  if (e.ctrlKey && e.shiftKey && (e.key === 'H' || e.key === 'h') && screen === 'games') { e.preventDefault(); togglePriv(); return; }
  if (e.key === 'F4' && screen === 'systems') { e.preventDefault(); openTradutor(); return; }
  if (e.key === 'F1' && screen === 'favgrid' && !modalOpen && !$('ctx').classList.contains('on') && typeof fp !== 'undefined' && !fp.open) { e.preventDefault(); fgInput('menu'); return; }
  if (e.key === 'F1') { e.preventDefault(); if (screen !== 'config' && screen !== 'welcome') { if (modalOpen) closeCover(); openConfig(); } return; }
  if (screen === 'welcome' || renaming) return;
  if (fxOpen) { if (e.key === 'Escape' || e.key === 'Backspace') { e.preventDefault(); fgFxClose(); } return; }
  if (fp.open) { const k = { ArrowLeft:'left', ArrowRight:'right', ArrowUp:'up', ArrowDown:'down', Enter:'ok', Escape:'back', PageUp:'pgup', PageDown:'pgdn', '+':'pgdn', '-':'pgup' }[e.key]; if (k) { e.preventDefault(); fpInput(k); } return; }
  if (fgInfoOpen && !modalOpen) { if (e.key === 'Escape' || e.key === 'Backspace') { e.preventDefault(); fgInfo(false); } else if (e.key === 'Enter') { e.preventDefault(); fgInfo(false); fgLaunch(); } return; }
  if (screen === 'favgrid' && !modalOpen && e.key === 'Backspace') { e.preventDefault(); back(); return; }
  if (screen === 'favgrid' && !modalOpen && (e.key === 'i' || e.key === 'I') && !e.ctrlKey && !e.altKey && fg.items[fg.sel]) { e.preventDefault(); fgInfo(true); return; }   // I = Info do card
  if (screen === 'favgrid' && !modalOpen && e.key.length === 1 && e.key !== ' ' && !e.ctrlKey && !e.altKey && !e.metaKey) { e.preventDefault(); openGlobal(e.key); return; }   // digitar = busca geral
  if (screen === 'favgrid' && !modalOpen && e.key === ' ') { e.preventDefault(); fgInput('fav'); return; }   // Espaço = □ (mover card)
  if (e.key === 'F3' && (screen === 'favgrid' || (screen === 'games' && favMode))) { e.preventDefault(); setFavView(favView === 'list' ? 'grid' : 'list'); return; }
  if (e.key === 'F2' && screen === 'games' && shown[gIdx]) { e.preventDefault(); startRename(gIdx); return; }
  if (e.key === 'F2' && screen === 'favgrid' && fg.items[fg.sel] && !modalOpen) { e.preventDefault(); fgRename(); return; }
  if (screen === 'config') {   // teclado igual ao D-pad: setas navegam, Tab = próximo (Shift+Tab = anterior), Enter ativa, Esc volta
    const ae = document.activeElement, typing = ae && (ae.tagName === 'TEXTAREA' || (ae.tagName === 'INPUT' && !/checkbox|radio/.test(ae.type)));
    if (!document.querySelector('#cfBody .kbf') && ae && ae.closest && ae.closest('#cfBody')) cfgMark(ae.closest('.pick') || ae);   // começou com o mouse: segue dali
    const m = { ArrowUp: 'up', ArrowDown: 'down', ArrowLeft: 'left', ArrowRight: 'right', Escape: 'back' }[e.key];
    if (e.key === 'Tab') { e.preventDefault(); cfgPad(e.shiftKey ? 'up' : 'down'); return; }
    if (m && !(typing && (m === 'left' || m === 'right'))) { e.preventDefault(); cfgPad(m); return; }
    if (e.key === 'Enter' && !typing) { e.preventDefault(); cfgPad('ok'); return; }
    return;
  }
  if (modalOpen) {
    if (e.key === 'Escape') { e.preventDefault(); closeCover(); return; }
    const inInput = document.activeElement && document.activeElement.tagName === 'INPUT';
    const d = { ArrowLeft:'left', ArrowRight:'right', ArrowUp:'up', ArrowDown:'down' }[e.key];
    if (d && !(inInput && (d === 'left' || d === 'right'))) { e.preventDefault(); coverNav(d); return; }
    if (e.key === 'Enter' && !inInput && coverPick()) { e.preventDefault(); return; }
    return;
  }
  if (e.key === 'Escape' && screen === 'games' && clearMulti()) { e.preventDefault(); return; }   // Esc limpa a seleção em lote
  // Shift + setas (ou PgUp/PgDn/Home/End): seleciona em lote os jogos por onde passa
  const sm = { ArrowUp: -1, ArrowDown: 1, PageUp: -10, PageDown: 10, Home: -1e9, End: 1e9 }[e.key];
  if (screen === 'favgrid' && e.shiftKey && { ArrowUp: 1, ArrowDown: 1, ArrowLeft: 1, ArrowRight: 1 }[e.key] && fg.items.length && !fg.moving) {   // Favoritos: Shift + setas seleciona os cards por onde passa
    e.preventDefault();
    if (!fgMulti.size) fgMulti.add(fg.sel);
    fgMove({ ArrowUp: 'up', ArrowDown: 'down', ArrowLeft: 'left', ArrowRight: 'right' }[e.key]);
    fgMulti.add(fg.sel); fgMultiDom();
    return;
  }
  if (screen === 'games' && e.shiftKey && sm && shown[gIdx] && !renaming && (document.activeElement !== $('q') || Math.abs(sm) === 1)) {   // também na busca (↑/↓ no campo de busca)
    e.preventDefault();
    if (anchor < 0 || !multi.size) anchor = gIdx;
    selectGame(Math.max(0, Math.min(shown.length - 1, gIdx + sm)));
    multi.clear(); const a = Math.min(anchor, gIdx), b = Math.max(anchor, gIdx);
    for (let k = a; k <= b; k++) multi.add(shown[k]);
    $('list').classList.toggle('multi', multi.size > 1 || multiKeep); vRender(); multiInfo();
    return;
  }
  if (screen === 'favgrid' && e.ctrlKey && (e.key === 'PageUp' || e.key === 'PageDown') && fg.pages > 1) { e.preventDefault(); fgMovePage(fg.page, fg.page + (e.key === 'PageUp' ? -1 : 1)); return; }
  const map = { ArrowLeft:'left', ArrowRight:'right', ArrowUp:'up', ArrowDown:'down', Enter:'ok', Escape:'back', PageUp:'pgup', PageDown:'pgdn', Home:'home', End:'end' };
  const inSearch = document.activeElement === $('q');
  // Ctrl + Espaço: marca/desmarca o jogo em foco na seleção em lote (Ctrl + setas andam sem perder a seleção)
  if (screen === 'games' && e.ctrlKey && e.key === ' ' && !inSearch && shown[gIdx]) { e.preventDefault(); multiKeep = true; toggleMulti(shown[gIdx], true); if (!multi.size) multiKeep = false; $('list').classList.toggle('multi', multi.size > 0); sfx('tick'); return; }
  // → no fim do texto da busca: abre o menu do jogo em foco (ou do lote), mesmo depois de digitar
  if (inSearch && screen === 'games' && e.key === 'ArrowRight' && !e.shiftKey && $('q').selectionStart === $('q').value.length) { e.preventDefault(); input('right'); return; }   // fim do texto: → vai para ordenação / subcategorias
  if (map[e.key] && !(inSearch && ['left','right','home','end'].includes(map[e.key]))) {
    if (inSearch && e.key === 'Escape' && $('q').value) { $('q').value = ''; filter(); e.preventDefault(); return; }
    e.preventDefault(); if (inSearch && map[e.key] === 'back') $('q').blur(); input(map[e.key]); return;
  }
  if (screen === 'systems' && e.key === ' ' && topSel < 0) { e.preventDefault(); input('fav'); return; }   // Espaço = □ (mover console)
  if (screen === 'systems' && e.key.length === 1 && e.key !== ' ' && !e.ctrlKey && !e.altKey && !e.metaKey) { e.preventDefault(); openGlobal(e.key); return; }
  if (e.key === 'Backspace' && screen === 'games' && !inSearch) { e.preventDefault(); back(); return; }
  if (screen === 'games' && !inSearch && e.key.length === 1 && !e.ctrlKey && !e.altKey) { $('q').focus(); }
});
$('q').oninput = filter;
$('homeBtn').onclick = () => { $('homeBtn').blur(); back(); };
const sortLbl = () => $('sortBtn').textContent = '⇅ ' + (SORTS.find(x => x[0] === sortMode) || SORTS[0])[1];
function renderSortMenu() { $('sortMenu').innerHTML = SORTS.map(([k, l]) => `<div class="sopt${k === sortMode ? ' sel' : ''}" data-s="${k}">${k === sortMode ? '✓ ' : ''}${l}</div>`).join(''); $('sortMenu').querySelectorAll('.sopt').forEach(el => el.onclick = e => { e.stopPropagation(); setSort(el.dataset.s); }); }
function setSort(k) { sortMode = k; try { localStorage.setItem('sort', k); } catch (e) {} sortLbl(); $('sortMenu').classList.remove('on'); sfx('tick'); refilterKeep(); }
$('sortBtn').onclick = e => { e.stopPropagation(); renderSortMenu(); $('sortMenu').classList.toggle('on'); sfx('tick'); $('sortBtn').blur(); };
document.addEventListener('click', () => $('sortMenu').classList.remove('on'));
sortLbl();

$('gq').oninput = () => { const v = $('gq').value; $('gq').value = ''; if (v.trim()) openGlobal(v); };
$('prev').onclick = () => selectSystem(sysIdx - 1); $('next').onclick = () => selectSystem(sysIdx + 1);
document.addEventListener('wheel', e => { if (screen === 'systems') selectSystem(sysIdx + (e.deltaY > 0 ? 1 : -1)); }, { passive:true });
// gamepad (Xbox/PS): D-pad/analógico, A = entrar/jogar, B = voltar
let padPrev = {}, padRepeat = 0;
function pollPad() {
  requestAnimationFrame(pollPad);   // agenda antes: um erro em qualquer tela nunca mais "desliga" o controle
  try { pollPad1(); } catch (e) { console.error('controle:', e); }
}
// lê um controle e devolve os comandos pressionados (mapeamento padrão do navegador; controles sem ele usam o "hat" do D-pad)
function padState(p) {
  const b = i => !!(p.buttons[i] && (p.buttons[i].pressed || p.buttons[i].value > .5)), ax = p.axes[0] || 0, ay = p.axes[1] || 0;
  let hu = false, hd = false, hl = false, hr = false;
  if (p.mapping !== 'standard') {   // DirectInput: D-pad costuma vir como um eixo "hat" (−1 = cima, girando no sentido horário)
    const h = p.axes.length > 9 ? p.axes[9] : null;
    if (h !== null && h >= -1.05 && h <= 1.05 && Math.abs(h) > .01) {
      const v = Math.round((h + 1) / (2 / 7));   // 0 cima, 1 cima-dir, 2 dir, 3 baixo-dir, 4 baixo, 5 baixo-esq, 6 esq, 7 cima-esq
      if (v >= 0 && v <= 7) { hu = v === 0 || v === 1 || v === 7; hr = v >= 1 && v <= 3; hd = v >= 3 && v <= 5; hl = v >= 5 && v <= 7; }
    }
  }
  return { up: b(12) || hu || ay < -.6, down: b(13) || hd || ay > .6, left: b(14) || hl || ax < -.6, right: b(15) || hr || ax > .6, ok: b(0), back: b(1), fav: b(2), menu: b(3), pgup: b(4), pgdn: b(5), select: b(8), start: b(9), search: b(10) || b(11), both: b(10) && b(11) };
}
let padLast = null;   // controle usado por último (define os símbolos da legenda)
function pollPad1() {
  // todos os controles conectados funcionam ao mesmo tempo (os comandos são somados)
  const pads = [...(navigator.getGamepads ? navigator.getGamepads() : [])].filter(g => g && g.connected !== false);
  const states = pads.map(padState);
  pads.forEach((p, k) => { if (Object.values(states[k]).some(Boolean) || p.buttons.some(x => x && x.pressed)) padLast = p.id; });
  const legendPad = pads.find(p => p.id === padLast) || pads[0];
  if (typeof updatePadHelp === 'function') updatePadHelp(legendPad);
  // Xbox / PlayStation / Nintendo / genéricos: A/✕ ok · B/○ voltar · X/□ · Y/△ menu · LB/RB pular · Start configuração · Select modo TV
  { const bo = states.some(x => x.both); if (bo && !pollPad1._both) togglePriv(); pollPad1._both = bo; }
  if (pads.length && (!renaming || oskOpen) && screen !== 'welcome') {
    const st = {}; states.forEach(x => { for (const k in x) st[k] = st[k] || x[k]; });
    const now = performance.now();
    for (const k in st) {
      if (st[k] && !padPrev[k]) { lastInputPad = true; legendMode = 'pad'; input(k); padRepeat = now + 380; }
      else if (st[k] && ['up','down','left','right'].includes(k) && now > padRepeat) { input(k); padRepeat = now + 70; }
      // teclado virtual: segurar □ (apagar) ou ✕ sobre a tecla ⌫ apaga em sequência
      else if (st[k] && oskOpen && (k === 'fav' || (k === 'ok' && OSK_ROWS[oskSel[0]][oskSel[1]] === '⌫')) && now > padRepeat) { input(k); padRepeat = now + 60; }
    }
    padPrev = st;
    if (Object.values(st).some(Boolean)) legendMode = 'pad';
    // R2 / L2 e analógico direito: usa o controle que estiver mexendo mais
    let r2 = 0, l2 = 0, rx = 0, ry = 0;
    pads.forEach(p => {
      const tv = i => p.buttons[i] ? p.buttons[i].value || (p.buttons[i].pressed ? 1 : 0) : 0;
      r2 = Math.max(r2, tv(7)); l2 = Math.max(l2, tv(6));
      const x = p.axes[2] || 0, y = p.axes[3] || 0; if (Math.abs(x) + Math.abs(y) > Math.abs(rx) + Math.abs(ry)) { rx = x; ry = y; }
    });
    if ((r2 > .15 || l2 > .15) && $('art').querySelector('.rot')) { view3d.z = Math.max(.5, Math.min(2.6, view3d.z * (1 + (r2 - l2) * .03))); applyView(); }
    if ((Math.abs(rx) > .18 || Math.abs(ry) > .18) && $('art').querySelector('.rot')) { view3d.ry += rx * 4; view3d.rx = Math.max(-60, Math.min(60, view3d.rx - ry * 3)); applyView(); }
  }
}
requestAnimationFrame(pollPad);
window.addEventListener('gamepadconnected', e => { padLast = e.gamepad.id; toast('🎮 Controle conectado: ' + (e.gamepad.id || '').replace(/\(.*\)/, '').trim()); });
['q', 'sortBtn', 'catBtn'].forEach(id => $(id) && $(id).addEventListener('blur', () => $(id).classList.remove('padsel')));

document.addEventListener('keyup', e => { if (e.key === 'Control' && screen === 'systems' && sysMoving) sysMoveInput('fav'); });

// vídeos da pasta privada: revela/oculta (discreto, sem aviso na legenda)
function togglePriv() {
  if (screen !== 'games' || !sys || sys.type !== 'video' || globalMode) return;
  if (!games.some(g => g.priv)) return;
  privOn = !privOn; sfx('tick'); refilterKeep();
  privToast(privOn);
}

function privToast(on) {
  let t = $('privTip'); if (!t) { t = document.createElement('div'); t.id = 'privTip'; document.body.appendChild(t); }
  t.innerHTML = on ? '<svg viewBox="0 0 24 24"><rect x="4" y="11" width="16" height="10" rx="2.5"/><path d="M8 11V7.5a4 4 0 0 1 7.6-1.7" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"/></svg>Ocultos' : '<svg viewBox="0 0 24 24"><rect x="4" y="11" width="16" height="10" rx="2.5"/><path d="M8 11V7.5a4 4 0 0 1 8 0V11" fill="none" stroke="currentColor" stroke-width="2.2"/></svg>Ocultos';
  t.classList.add('on'); clearTimeout(privToast.t); privToast.t = setTimeout(() => t.classList.remove('on'), 1800);
}
