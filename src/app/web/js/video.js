// Koru — video.js
// ---- fundo em vídeo: gameplay do YouTube, começando em 1/4 da duração; leve: só 1 vídeo por vez, só depois de parar no jogo ----
const SMALL = matchMedia('(max-width: 1050px), (max-height: 620px)');
let bgKind = 'video', vidTimer = null, vidFor = null;
function rerenderCase() { if (lastArt && lastArt.g && screen === 'games') { if (!lastArt.done) { $('art').innerHTML = skeletonCase(lastArt.g); return; } $('art').innerHTML = buildCase(lastArt.g, lastArt.url, false, lastArt.ratio); if (lastArt.logo) { const sp = $('art').querySelector('.spine'); if (sp) sp.innerHTML = `<img class="spl" src="${esc(lastArt.logo)}" alt="">`; } } }
// capa desliza suavemente para o canto (FLIP: mede antes/depois e anima a diferença)
function setVidPlay(on) {
  const r = document.querySelector('.right'); if (!r || r.classList.contains('vidplay') === on) return;
  const el0 = $('art').firstElementChild, a0 = el0 && el0.getBoundingClientRect();
  r.classList.toggle('vidplay', on); rerenderCase(); placeVidLogo(on);
  if (on && vidSoundOn()) music.pause(); else if (!on && !muted && screen === 'games') music.resume();
  const el = $('art').firstElementChild; if (!a0 || !el || !a0.width) return;
  const a1 = el.getBoundingClientRect(); if (!a1.width) return;
  const s = a0.width / a1.width;
  el.style.transformOrigin = '0 0'; el.style.transition = 'none';
  el.style.transform = `translate(${a0.left - a1.left}px, ${a0.top - a1.top}px) scale(${s})`;
  el.getBoundingClientRect();
  el.style.transition = 'transform .7s cubic-bezier(.22,.8,.24,1)'; el.style.transform = '';
  setTimeout(() => { el.style.transition = ''; el.style.transformOrigin = ''; }, 750);
}
function stopVideo() { if (typeof vpPrevStop === 'function') vpPrevStop(); $('vidBox').classList.remove('loading'); clearTimeout(vidTimer); vidFor = null; setVidPlay(false); document.querySelectorAll('#vidBox .vid').forEach(v => { v.classList.remove('on'); setTimeout(() => v.remove(), 600); }); }
function vqReveal(f) { if (!f.isConnected || f.classList.contains('on') || !vidFor) return; diag('exibido'); f.classList.add('on'); setVidPlay(true); $('vidBox').classList.remove('loading'); }
// comandos para o player do YouTube (sem carregar a biblioteca deles)
const ytCmd = (f, func, args) => { try { f.contentWindow.postMessage(JSON.stringify({ event:'command', func, args: args || [] }), '*'); } catch (e) {} };
window.addEventListener('message', e => {
  if (!/youtube(-nocookie)?\.com$/.test(new URL(e.origin).hostname)) return;
  let d; try { d = typeof e.data === 'string' ? JSON.parse(e.data) : e.data; } catch (x) { return; }
  const f = [...document.querySelectorAll('#vidBox .vid')].find(x => x.contentWindow === e.source); if (!f) return;
  const st = d.event === 'onStateChange' ? d.info : d.info && d.info.playerState;
  if (d.event === 'onError') { const E = { 2:'parâmetro inválido', 5:'erro do player HTML5', 100:'vídeo removido/privado', 101:'dono não permite incorporar', 150:'dono não permite incorporar (ou restrição de idade)', 153:'player sem origem/referência' }; if (f._next) f._next(`erro ${d.info} (${E[d.info] || 'desconhecido'})`); return; }
  if (st === 1 && !f._t0) diag('tocando');
  if (st === 1 && !f._t0) { f._t0 = Date.now(); vqReveal(f); }   // tocou: mostra na hora
  if (st === 0) { ytCmd(f, 'seekTo', [+f.dataset.start || 0, true]); ytCmd(f, 'playVideo'); }   // repetir sem "playlist" (que mostrava botões voltar/avançar)
});
// diagnóstico do vídeo (clique no "ⓘ vídeo" na linha de detalhes)
let vidDiag = null;
function diag(msg) { if (!vidDiag) return; vidDiag.steps.push(msg); const d = $('vdiag'); if (d) d.title = diagText(); }
function diagText() { if (!vidDiag) return ''; return `Busca: "${vidDiag.query}"\n\nResultados analisados:\n${(vidDiag.log || []).join('\n') || '(nenhum)'}\n\nPlayer:\n${vidDiag.steps.join('\n') || '(nada ainda)'}`; }
function diagBadge() {
  const m = [...$('details').querySelectorAll('.m')].pop(); if (!m || $('vdiag')) return;
  const s = document.createElement('a'); s.id = 'vdiag'; s.textContent = ' ⓘ vídeo'; s.style.cssText = 'margin-left:8px;opacity:.6;cursor:pointer';
  s.onclick = () => ask('Diagnóstico do vídeo', diagText(), 'OK'); s.title = diagText(); m.appendChild(s);
}
function playCandidate(g, list, k) {
  if (vidFor !== g || shown[gIdx] !== g) return;
  $('vidBox').querySelectorAll('.vid').forEach(x => x.remove());
  if (k >= list.length) { if (list.more) { list.more(); return; } diag('nenhum vídeo conseguiu tocar — ficando só com a capa'); $('vidBox').classList.remove('loading'); return; }
  const v = list[k];
  diag(`tentando ${k + 1}/${list.length}: ${v.id} — ${v.title} (início em ${v.start} s) → https://youtu.be/${v.id}`);
  const f = document.createElement('iframe');
  f.className = 'vid';   // tamanho real: o YouTube escolhe a melhor qualidade para o tamanho do player f.allow = 'autoplay; encrypted-media; fullscreen; picture-in-picture'; f.allowFullscreen = true; f.tabIndex = -1; f.dataset.start = v.start;
  f._next = reason => { if (f._dead) return; f._dead = true; diag(`${v.id} falhou: ${reason}`); playCandidate(g, list, k + 1); };
  f.src = `https://www.youtube-nocookie.com/embed/${v.id}?autoplay=1&mute=${vidSoundOn() ? 0 : 1}&controls=0&disablekb=1&fs=0&start=${v.start}&rel=0&iv_load_policy=3&cc_load_policy=0&enablejsapi=1&vq=hd1080&playsinline=1&origin=${encodeURIComponent(location.origin)}`;
  f.onload = () => {
    [400, 1200, 2500, 4000].forEach(t => setTimeout(() => { vidSetVol(f); vidCmd(f, 'setPlaybackQuality', ['highres']); }, t));   // volume salvo e melhor qualidade
    setTimeout(() => { if (f.isConnected && !f._t0 && vidFor === g) f._next('não começou a tocar em 3 s (restrição de idade, bloqueio regional ou incorporação desativada)'); }, 3000);
    const t = setInterval(() => { if (!f.isConnected || f.classList.contains('on')) return clearInterval(t); try { f.contentWindow.postMessage(JSON.stringify({ event:'listening', id: 1 }), '*'); } catch (e) {} }, 250);
  };
  $('vidBox').classList.add('loading'); $('vidBox').appendChild(f);
}
function queueVideo(g) {
  stopVideo(); if (typeof vpPrev === 'function') vpPrev(g);
  if (bgKind !== 'video' || !document.hasFocus() || SMALL.matches || ((sysOf(g) || {}).type === 'video')) return;   // janela pequena: sem vídeo (economia)
  vidFor = g;
  vidTimer = setTimeout(async () => {   // espera o usuário "parar" no jogo (evita carregar vídeos ao rolar a lista)
    if (vidFor !== g || shown[gIdx] !== g) return;
    const name = cleanTitle(dn(g)) || dn(g), plat = sys.type === 'pc' ? 'PC' : sys.name;
    // buscas em sequência: se nenhum vídeo da 1ª tocar (ex.: jogos +18 com restrição de idade), tenta a próxima
    const queries = [`${name} ${plat} gameplay walkthrough`, `${name} ${plat} gameplay`, `${name} official trailer`];
    vidDiag = { query: queries[0], log: [], steps: [] }; diagBadge();
    const tried = new Set();
    const run = async qi => {
      if (qi >= queries.length || vidFor !== g || shown[gIdx] !== g) { if (qi >= queries.length) { diag('nenhum vídeo conseguiu tocar — ficando só com a capa'); $('vidBox').classList.remove('loading'); } return; }
      diag(`busca ${qi + 1}: "${queries[qi]}"`);
      let v; try { v = await api('/api/ytsearch?q=' + encodeURIComponent(queries[qi])); } catch (e) { diag('erro ao buscar: ' + e.message); return run(qi + 1); }
      if (vidFor !== g || shown[gIdx] !== g) return;
      vidDiag.log = vidDiag.log.concat(v.log || []);
      const list = (v.candidates || (v.id ? [v] : [])).filter(c => !tried.has(c.id)); list.forEach(c => tried.add(c.id));
      diag(`${list.length} vídeo(s) novo(s)`);
      list.more = () => run(qi + 1);
      playCandidate(g, list, 0);
    };
    run(0);
  }, 500);
}
window.addEventListener('blur', () => setTimeout(() => { const a = document.activeElement; if (a && a.classList && a.classList.contains('vid')) { a.blur(); window.focus(); return; } if (document.querySelector('#vidBox .vid')) stopVideo(); }, 0));   // clicar no player não para o vídeo; abrir um jogo, sim   // jogo aberto: libera o vídeo
window.addEventListener('focus', () => { if (document.querySelector('#vidBox .vid')) return; if (screen === 'games' && shown[gIdx]) queueVideo(shown[gIdx]); });
// troca de jogo: se capa e fundo já estão em cache, desenha na hora (sem placeholder); senão, placeholder
function paintCached(g) {
  const a = cachedArt(g); if (!a || !a.box) return false;
  const front = cp(a.box), ratio = ratioCache[front] || a.ratio;
  lastArt = { g, url: front, ratio, done: true };
  $('art').innerHTML = buildCase(g, front, false, ratio);
  const bgOver = covers['bg|' + coverKey(g)];
  setBg(bgOver || a.snap ? cpb(bgOver || a.snap) : cp(a.box), bgOver || a.snap ? 'game' : 'blur', true);
  return true;
}
// placeholder fixo (skeleton) do tamanho aproximado da capa do console, enquanto nada foi carregado
function skeletonCase(g) { return buildCase(g, null, false); }   // enquanto busca: já mostra a capa genérica (nada de placeholder)
function clearBg() { bgCur = ''; bgTok++; $('gameBg').querySelectorAll('.bgl').forEach(o => o.remove()); }
// fundo com transição suave (crossfade entre a imagem antiga e a nova)
let bgCur = '', bgTok = 0;
async function setBg(url, mode, instant) {
  const id = url + '|' + mode; if (id === bgCur) return; bgCur = id;
  const tok = ++bgTok, host = $('gameBg');
  if (url && artAlts(url).length > 1) url = await artResolve(url);   // imagem do tema: usa a reserva se a original falhar
  else if (url && !instant) { const r = await Promise.race([loadImg(url), new Promise(r => setTimeout(() => r('t'), 1200))]); if (r === null && url.startsWith('/api/img?u=')) url = decodeURIComponent(url.slice(11).replace(/&k=bg$/, '')); }
  if (tok !== bgTok) return;
  const old = [...host.querySelectorAll('.bgl')];
  if (url) {
    const l = document.createElement('div'); l.className = 'bgl' + (mode ? ' ' + mode : ''); l.style.backgroundImage = `url("${url}")`;
    host.appendChild(l); requestAnimationFrame(() => requestAnimationFrame(() => l.classList.add('on')));
  }
  old.forEach(o => { o.classList.remove('on'); setTimeout(() => o.remove(), 700); });
}
// girar com o mouse (arrastar) e zoom (roda do mouse)
const view3d = { ry: 0, rx: 0, z: 1 };
// giro sempre no centro da capa; o zoom é aplicado por fora (no invólucro), ancorado onde a capa está (canto superior direito com vídeo)
const viewTf = () => `rotateX(${view3d.rx}deg) rotateY(${view3d.ry}deg)`;
const scaleTf = () => `scale(${view3d.z})`;
// zoom limitado: a capa nunca passa da sua área (painel da capa; com vídeo tocando, cresce para baixo/esquerda até o fim do vídeo)
function zoomMax() {
  const c = $('art').querySelector('.case3d'); if (!c) return 2.6;
  const base = { w: c.offsetWidth, h: c.offsetHeight }; if (!base.w) return 2.6;
  const right = $('art').closest('.right'), vid = right && right.classList.contains('vidplay');
  const art = $('art').getBoundingClientRect();
  let w, h;
  if (vid) { const vb = $('vidBox').getBoundingClientRect(), cr = c.getBoundingClientRect(); w = cr.right - vb.left; h = vb.bottom - cr.top; }
  else { w = art.width; h = art.height; }
  return Math.max(.5, Math.min(2.6, w / (base.w * 1.35), h / (base.h * 1.15)));   // folga para a lateral/rotação da caixa
}
// giro limitado: a caixa já fica virada ~30° (balanço); somando, nunca passa de ~±78°, então o verso nunca aparece
const RY_MIN = -106, RY_MAX = 46, RX_LIM = 50;
function applyView() { view3d.ry = Math.max(RY_MIN, Math.min(RY_MAX, view3d.ry)); view3d.rx = Math.max(-RX_LIM, Math.min(RX_LIM, view3d.rx)); view3d.z = Math.max(.5, Math.min(view3d.z, zoomMax())); const r = $('art').querySelector('.rot'); if (r) r.style.transform = viewTf(); const w = $('art').querySelector('.cw'); if (w && r) w.style.transform = scaleTf(); }
(() => {
  const a = $('art'); let drag = null;
  a.addEventListener('pointerdown', e => { if (e.button !== 0) return; drag = { x: e.clientX, y: e.clientY, ry: view3d.ry, rx: view3d.rx }; a.setPointerCapture(e.pointerId); a.style.cursor = 'grabbing'; });
  a.addEventListener('pointermove', e => { if (!drag) return; view3d.ry = drag.ry + (e.clientX - drag.x) * .5; view3d.rx = Math.max(-60, Math.min(60, drag.rx - (e.clientY - drag.y) * .35)); applyView(); });
  const end = () => { drag = null; a.style.cursor = 'grab'; };
  a.addEventListener('pointerup', end); a.addEventListener('pointercancel', end);
  a.addEventListener('wheel', e => { e.preventDefault(); view3d.z = Math.max(.5, Math.min(2.6, view3d.z * (e.deltaY < 0 ? 1.1 : 1 / 1.1))); applyView(); }, { passive:false });
  a.addEventListener('dblclick', () => { view3d.ry = 0; view3d.rx = 0; view3d.z = 1; applyView(); });
  a.style.cursor = 'grab'; a.style.touchAction = 'none';
})();
async function showArt(g) {
  const my = ++artReq, box = $('art'), bg = $('gameBg');
  // troca de jogo: mostra na hora a caixa genérica do novo jogo (nunca a capa anterior)
  setVidLogo(g, covers['logo|' + coverKey(g)] || ((cachedArt(g) || {}).logo));
  const pre = lastArt && lastArt.g === g && lastArt.done ? lastArt : null;   // já desenhada a partir do cache
  if (!pre) { lastArt = { g, url: null }; box.innerHTML = skeletonCase(g); }

  const a = await resolveArt(g, true);
  if (my !== artReq || shown[gIdx] !== g || screen !== 'games') return;
  if (!covers['logo|' + coverKey(g)] && a.logo) setVidLogo(g, a.logo);
  let front = cp(a.box), ratio = front ? ratioCache[front] : undefined;
  // a caixa assume o formato da imagem (horizontal/vertical); espera no máx. 0,3 s pela medida
  const TO = new Promise(r => setTimeout(() => r(undefined), 300));
  let pr = front && ratio === undefined ? loadRatio(front) : null;
  if (pr) ratio = await Promise.race([pr, TO]);
  if (ratio === null && front !== a.box) { front = a.box; pr = loadRatio(front); ratio = await Promise.race([pr, new Promise(r => setTimeout(() => r(undefined), 300))]); }   // cache falhou (ex.: Fandom): usa direto da internet
  if (my !== artReq) return;
  if (ratio && cacheOn && artDisk[coverKey(g)] && artDisk[coverKey(g)].ratio !== ratio) { artDisk[coverKey(g)].ratio = ratio; api('/api/artcache', { method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify({ key: coverKey(g), val: artDisk[coverKey(g)] }) }).catch(() => {}); }   // guarda o formato para desenhar na hora da próxima vez
  // capa real chegando por cima da genérica: troca suave na mesma caixa (sem girar, sem redesenhar, rotação continua)
  if (!front && lastArt && lastArt.g === g && box.querySelector('.generic')) { lastArt = { g, url: null, done: true }; }   // continua a genérica que já está na tela (sem redesenhar)
  else if (front && lastArt && lastArt.g === g && !lastArt.url && box.querySelector('.generic')) {
    lastArt = { g, url: front, ratio: lastArt.ratio, done: true, soft: true };
    // 1) baixa a imagem por inteiro; 2) esmaece por cima da genérica; 3) só depois disso a caixa muda de formato (medida pela própria imagem)
    const im = new Image(), src0 = front;
    const apply = (url, ok) => {
      if (my !== artReq || lastArt.g !== g) return;
      const layers = [];
      box.querySelectorAll('.generic').forEach(el => { const d = document.createElement('div'); d.className = 'texfade'; d.style.backgroundImage = `url("${url.replace(/"/g, '%22')}")`; el.parentNode.appendChild(d); layers.push(d); });
      requestAnimationFrame(() => requestAnimationFrame(() => layers.forEach(d => d.classList.add('on'))));
      const r2 = ok && im.naturalWidth > 1 ? im.naturalWidth / im.naturalHeight : null;
      setTimeout(() => { if (r2 && my === artReq && lastArt.g === g) { lastArt.ratio = r2; morphCase(g, url, r2); } }, 800);   // depois do esmaecimento (0,7 s) terminar
    };
    let cur = src0;
    im.onload = () => apply(cur, true);
    im.onerror = () => { if (a.box && cur !== a.box) { cur = a.box; im.src = cur; return; } apply(src0, false); };   // cache falhou: usa a imagem original
    im.src = cur;
    { const lg = covers['logo|' + coverKey(g)] || a.logo; if (lg) spineLogo(lg, my); }
  } else
  if (pre && pre.url === front && (pre.ratio || 0) === (ratio || pre.ratio || 0)) { { const lg = covers['logo|' + coverKey(g)] || a.logo; if (lg) spineLogo(lg, my); } }   // já está na tela: não redesenha
  else {
  lastArt = { g, url: front, ratio, done: true };
  box.innerHTML = buildCase(g, front, !pre, ratio);   // começa virada para trás (só quando não veio do cache)
  { const lg = covers['logo|' + coverKey(g)] || a.logo; if (lg) spineLogo(lg, my); }
  if (ratio === undefined && pr) pr.then(rr => { if (rr && my === artReq) { lastArt.ratio = rr; box.innerHTML = buildCase(g, front, false, rr); } });
  requestAnimationFrame(() => requestAnimationFrame(() => { const f = box.querySelector('.flip'); if (f) f.classList.remove('back'); }));   // gira para a frente (0,3 s)
  }
  const lbl = { libretro:'capa: libretro', gametdb:'capa: GameTDB', wikimain:'capa: Wikipédia', xlenore:'capa: xlenore', steam:'capa: Steam', fandom:'capa: Fandom', pcgw:'capa: PCGamingWiki', strategywiki:'capa: StrategyWiki', manual:'capa escolhida manualmente', generica:'capa genérica (não encontrada)' }[a.src];
  // segunda imagem de fundo: tela do jogo (ou a capa desfocada) no lugar do fundo do console
  const bgOver = covers['bg|' + coverKey(g)];
  const bgUrl = bgOver || a.snap ? cpb(bgOver || a.snap) : cp(a.box);
  setBg(bgUrl || bgUrlOf(sys), bgOver || a.snap ? 'game' : a.box ? 'blur' : '');
  if (!bgOver) queueVideo(g); else stopVideo();   // fundo escolhido manualmente tem prioridade sobre o vídeo
}
window.addEventListener('resize', () => { if (lastArt && !lastArt.done) return rerenderCase(); if (lastArt && screen === 'games' && shown[gIdx] === lastArt.g) $('art').innerHTML = buildCase(lastArt.g, lastArt.url, false, lastArt.ratio); if (lastArt && lastArt.logo) { const sp = $('art').querySelector('.spine'); if (sp) sp.innerHTML = `<img class="spl" src="${esc(lastArt.logo)}" alt="">`; } });

// logo de título no canto inferior esquerdo do vídeo (só aparece quando a imagem carrega; sem placeholder)
function setVidLogo(g, url) {
  const im = $('vidLogo'); if (!im) return;
  const src = url ? cp(url) : '';
  if (im._g === g && im._src === src) return;
  im._g = g; im._src = src; im.classList.remove('on');
  if (!src) { im.removeAttribute('src'); return; }
  im.onload = () => { if (im._src === src) im.classList.add('on'); };
  im.onerror = () => im.classList.remove('on');
  im.src = src;
}

// som do vídeo: ligado por padrão; desligado pelo botão de som do app ou em Configuração → Capas e vídeo
// gravado também no arquivo do app ('pref|...'), porque o localStorage pode se perder quando o app fecha de repente
function vidPref(k, def) { const c = typeof covers !== 'undefined' && covers && covers['pref|' + k]; if (c != null && c !== '') return c; try { const v = localStorage.getItem(k); if (v != null) return v; } catch (e) {} return def; }
function vidPrefSet(k, v) { try { localStorage.setItem(k, v); } catch (e) {} if (typeof covers !== 'undefined' && covers) { covers['pref|' + k] = String(v); api('/api/cover', { method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify({ key: 'pref|' + k, url: String(v) }) }).catch(() => {}); } }
let vidAway = false;   // janela sem foco: vídeo mudo e pausado
function vidSoundOn() { return !vidAway && vidPref('vidsound', '1') !== '0' && !(typeof muted !== 'undefined' && muted); }
let VID_VOL = 20; const vidVolLoad = () => { VID_VOL = Math.max(0, Math.min(100, +vidPref('vidvol', 20))); }; vidVolLoad();
function vidCmd(f, func, args) { try { f.contentWindow.postMessage(JSON.stringify({ event: 'command', func, args: args || [] }), '*'); } catch (e) {} }
function vidSetVol(f) { vidCmd(f, 'setVolume', [VID_VOL]); }
// controles próprios sobre o vídeo: volume e mudo (aparecem ao passar o mouse); clique no vídeo mostra/oculta a interface do YouTube
(() => {
  const box = $('vidBox'); if (!box) return;
  const ui = document.createElement('div'); ui.className = 'vidvol';
  ui.innerHTML = '<button class="vvm" title="Som do vídeo"></button><input class="vvr" type="range" min="0" max="100" step="1" title="Volume do vídeo">';
  box.appendChild(ui);
  const btn = ui.querySelector('.vvm'), rng = ui.querySelector('.vvr');
  const paint = () => { const on = vidSoundOn(); btn.textContent = !on || VID_VOL === 0 ? '🔇' : VID_VOL < 50 ? '🔉' : '🔊'; rng.value = VID_VOL; rng.style.setProperty('--p', VID_VOL + '%'); };
  rng.oninput = () => { VID_VOL = +rng.value; clearTimeout(rng._t); rng._t = setTimeout(() => { vidPrefSet('vidvol', VID_VOL); if (VID_VOL > 0 && vidPref('vidsound', '1') === '0') vidPrefSet('vidsound', '1'); }, 250); box.querySelectorAll('.vid').forEach(vidSetVol); vidApplySound(); paint(); };
  btn.onclick = e => { e.stopPropagation(); vidPrefSet('vidsound', vidPref('vidsound', '1') === '0' ? '1' : '0'); vidApplySound(); paint(); };
  ui.addEventListener('click', e => e.stopPropagation()); ui.addEventListener('pointerdown', e => e.stopPropagation());
  box.addEventListener('click', () => box.classList.toggle('ui'));
  box.addEventListener('mouseleave', () => box.classList.remove('ui'));
  window.vidVolPaint = paint; setTimeout(paint, 0);
})();
function vidApplySound() {
  if (window.vidVolPaint) window.vidVolPaint();
  const on = vidSoundOn();
  document.querySelectorAll('#vidBox .vid').forEach(f => { vidSetVol(f); try { f.contentWindow.postMessage(JSON.stringify({ event: 'command', func: on ? 'unMute' : 'mute', args: [] }), '*'); } catch (e) {} });
  if (document.querySelector('.right.vidplay')) { if (on) music.pause(); else if (!muted) music.resume(); }
}
// logo de título: em cima do fundo enquanto não há vídeo; dentro do vídeo quando ele toca
function placeVidLogo(on) {
  const im = $('vidLogo'), r = document.querySelector('.right'); if (!im || !r) return;
  const host = on ? $('vidBox') : r; if (im.parentNode !== host) host.appendChild(im);
}
(() => {   // altura do painel de detalhes, para a logo ficar logo acima dele
  const d = $('details'), r = document.querySelector('.right'); if (!d || !r || !window.ResizeObserver) return;
  new ResizeObserver(() => r.style.setProperty('--dh', d.offsetHeight + 'px')).observe(d);
})();

// janela perdeu o foco (ou foi minimizada): vídeo fica mudo e pausado; ao voltar, retoma
let vidFreeT = 0, vidFreed = null;
function vidAwaySet(away) {
  if (away === vidAway) return; vidAway = away;
  document.querySelectorAll('#vidBox .vid').forEach(f => vidCmd(f, away ? 'pauseVideo' : 'playVideo'));
  vidApplySound();
  clearTimeout(vidFreeT);
  if (away) vidFreeT = setTimeout(() => { if (vidAway && vidFor) { vidFreed = vidFor; stopVideo(); } }, 45000);   // muito tempo em segundo plano: descarta o player do YouTube (é o que mais ocupa memória)
  else if (vidFreed) { const g = vidFreed; vidFreed = null; if (typeof shown !== 'undefined' && shown[gIdx] === g && screen === 'games') queueVideo(g); }
}
window.vidAwaySet = vidAwaySet;
window.addEventListener('blur', () => setTimeout(() => { const a = document.activeElement; if (!(a && a.tagName === 'IFRAME')) vidAwaySet(true); }, 0));   // clicar no próprio vídeo não conta
window.addEventListener('focus', () => vidAwaySet(false));
document.addEventListener('visibilitychange', () => vidAwaySet(document.hidden || !document.hasFocus()));

// troca o formato da caixa 3D aos poucos: monta a nova geometria escondida e passa só as medidas para os elementos que já estão na tela
function morphCase(g, url, ratio) {
  const cw = $('art').querySelector('.cw'); if (!cw) return;
  const tmp = document.createElement('div'); tmp.innerHTML = buildCase(g, url, false, ratio);
  const nw = tmp.firstElementChild; if (!nw) return;
  // só a estrutura da caixa: ignora camadas de imagem e o conteúdo da lombada (logo/texto mudam quando a imagem do título carrega)
  const keep = el => !el.classList.contains('texfade') && !el.classList.contains('tex') && !(el.parentElement && el.parentElement.closest('.spine, .face.spine, [class*="spine"]'));
  const A = [cw, ...cw.querySelectorAll('*')].filter(keep), B = [nw, ...nw.querySelectorAll('*')].filter(keep);
  if (A.length !== B.length) return;
  cw.classList.add('morph');
  A.forEach((el, i) => { if (el.classList.contains('rot') || el.classList.contains('flip') || el.tagName !== B[i].tagName) return; const st = B[i].getAttribute('style'); if (st != null && st !== el.getAttribute('style')) el.setAttribute('style', st); });
  clearTimeout(morphCase._t); morphCase._t = setTimeout(() => cw.classList.remove('morph'), 900);
}
