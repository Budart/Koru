// Koru — player de vídeo da página (janela do app, sem tela cheia de início) + prévia de fundo na lista
const VP = { open: false, g: null, s: null, aspect: 0, subs: [], sub: -1, hideT: 0, saveT: 0 };
const VP_ASPECTS = [['auto', 'Original'], ['16:9', '16:9'], ['4:3', '4:3'], ['21:9', '21:9'], ['9:16', 'Vertical 9:16'], ['1:1', '1:1'], ['fill', 'Preencher'], ['stretch', 'Esticar']];
const VP_ICO = {
  play: '<svg viewBox="0 0 24 24"><path d="M8 5v14l11-7z"/></svg>',
  pause: '<svg viewBox="0 0 24 24"><path d="M6 5h4v14H6zM14 5h4v14h-4z"/></svg>',
  back: '<svg viewBox="0 0 24 24"><path d="M12 5V1L7 6l5 5V7a6 6 0 1 1-6 6H4a8 8 0 1 0 8-8z"/><text x="12" y="16.5" font-size="6.5" text-anchor="middle" font-family="Segoe UI" font-weight="700">10</text></svg>',
  fwd: '<svg viewBox="0 0 24 24"><path d="M12 5V1l5 5-5 5V7a6 6 0 1 0 6 6h2a8 8 0 1 1-8-8z"/><text x="12" y="16.5" font-size="6.5" text-anchor="middle" font-family="Segoe UI" font-weight="700">10</text></svg>',
  vol: '<svg viewBox="0 0 24 24"><path d="M4 9h4l5-4v14l-5-4H4z"/><path d="M16 8.5a5 5 0 0 1 0 7M18.5 6a8.5 8.5 0 0 1 0 12" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg>',
  mute: '<svg viewBox="0 0 24 24"><path d="M4 9h4l5-4v14l-5-4H4z"/><path d="M16 9l6 6M22 9l-6 6" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg>',
  sub: '<svg viewBox="0 0 24 24"><rect x="3" y="5" width="18" height="14" rx="3" fill="none" stroke="currentColor" stroke-width="2"/><path d="M7 11h4M13 11h4M7 15h7M16 15h1" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg>',
  asp: '<svg viewBox="0 0 24 24"><rect x="3" y="6" width="18" height="12" rx="2" fill="none" stroke="currentColor" stroke-width="2"/><path d="M7 10v-1h3M17 14v1h-3" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg>',
  hq: '<svg viewBox="0 0 24 24"><path d="M3 7h3v4h4V7h3v10h-3v-3H6v3H3zM15 7h3a3 3 0 0 1 3 3v4a3 3 0 0 1-3 3h-3zm3 3h-0v4h0z" /></svg>',
  full: '<svg viewBox="0 0 24 24"><path d="M4 9V4h5M20 9V4h-5M4 15v5h5M20 15v5h-5" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"/></svg>',
  next: '<svg viewBox="0 0 24 24"><path d="M5 5v14l10-7zM16 5h3v14h-3z"/></svg>',
  max: '<svg viewBox="0 0 24 24"><rect x="4" y="5" width="16" height="14" rx="2" fill="none" stroke="currentColor" stroke-width="2"/><path d="M4 9h16" stroke="currentColor" stroke-width="2"/></svg>',
  close: '<svg viewBox="0 0 24 24"><path d="M6 6l12 12M18 6L6 18" stroke="currentColor" stroke-width="2.4" stroke-linecap="round"/></svg>',
};
const vpUrl = (g, k, extra) => `/api/${k}?c=${encodeURIComponent(g.sid || (sysOf(g) || {}).id)}&p=${encodeURIComponent(g.path)}${extra || ''}`;
const vpFmt = t => { t = Math.max(0, Math.floor(t || 0)); const h = Math.floor(t / 3600), m = Math.floor(t / 60) % 60, s = t % 60; return (h ? h + ':' + String(m).padStart(2, '0') : m) + ':' + String(s).padStart(2, '0'); };
function vpEl() {
  let el = $('vplayer'); if (el) return el;
  el = document.createElement('div'); el.id = 'vplayer';
  el.innerHTML = `<div class="vpframe"><div class="vpbox"><video id="vpV" preload="auto" playsinline></video></div><div class="vpmsg" id="vpMsg"></div>
  <div class="vptop"><div class="vptitle" id="vpTitle"></div><button class="vpb" data-a="close" title="Fechar (Esc)">${VP_ICO.close}</button></div>
  <div class="vpbar">
    <div class="vpseek" id="vpSeek"><div class="vpbuf" id="vpBuf"></div><div class="vpprog" id="vpProg"></div><div class="vpknob" id="vpKnob"></div><div class="vptip" id="vpTip"></div></div>
    <div class="vprow">
      <button class="vpb" data-a="back" title="Voltar 10 s (←)">${VP_ICO.back}</button><button class="vpb big" data-a="play" id="vpPlay" title="Play/Pause (Espaço)">${VP_ICO.pause}</button><button class="vpb" data-a="fwd" title="Avançar 10 s (→)">${VP_ICO.fwd}</button><button class="vpb" data-a="next" id="vpNext" title="Próximo vídeo (N)">${VP_ICO.next}</button>
      <div class="vpvol"><button class="vpb" data-a="mute" id="vpMute" title="Mudo (M)">${VP_ICO.vol}</button><input type="range" id="vpVol" min="0" max="1" step="0.02" value="1"></div>
      <span class="vptime" id="vpTime">0:00 / 0:00</span><span class="vpgrow"></span>
      <div class="vpmenu-w"><button class="vpb" data-a="sub" title="Legendas (S)">${VP_ICO.sub}</button><div class="vpmenu" id="vpSubs"></div></div>
      <button class="vpb wide" data-a="asp" id="vpAsp" title="Proporção (Ctrl+scroll)">${VP_ICO.asp}<span>Original</span></button>
      <button class="vpb wide" data-a="hq" title="Abrir no player avançado (upscaling, todos os formatos)">${VP_ICO.hq}<span>Upscaling</span></button>
      <button class="vpb" data-a="max" id="vpMax" title="Ocupar a janela toda (W)">${VP_ICO.max}</button><button class="vpb" data-a="full" title="Tela cheia (F)">${VP_ICO.full}</button>
    </div></div></div>`;
  document.body.appendChild(el);
  const v = $('vpV');
  el.querySelectorAll('[data-a]').forEach(b => b.onclick = e => { e.stopPropagation(); vpAct(b.dataset.a); });
  v.onclick = () => vpAct('play'); v.ondblclick = () => vpAct('full');
  v.onplay = v.onpause = () => { $('vpPlay').innerHTML = v.paused ? VP_ICO.play : VP_ICO.pause; el.classList.toggle('paused', v.paused); vpShow(); };
  v.ontimeupdate = vpPaint; v.onprogress = vpPaint; v.onvolumechange = () => { $('vpMute').innerHTML = v.muted || v.volume === 0 ? VP_ICO.mute : VP_ICO.vol; $('vpVol').value = v.muted ? 0 : v.volume; try { localStorage.setItem('vpvol', v.volume); localStorage.setItem('vpmute', v.muted ? '1' : ''); } catch (e) {} };
  v.onloadedmetadata = () => { vpLayout(); if (!v.videoWidth) vpFail(); };
  v.onerror = () => vpFail();
  v.onended = () => { try { localStorage.removeItem('vpos|' + coverKey(VP.g)); } catch (e) {} if (vpNextOf(VP.g)) vpAct('next'); else vpClose(); };
  $('vpVol').oninput = () => { v.volume = +$('vpVol').value; v.muted = v.volume === 0; };
  const sk = $('vpSeek'), at = e => { const r = sk.getBoundingClientRect(); return Math.max(0, Math.min(1, (e.clientX - r.left) / r.width)) * (v.duration || 0); };
  let drag = false;
  sk.onpointerdown = e => { drag = true; sk.setPointerCapture(e.pointerId); v.currentTime = at(e); vpPaint(); };
  sk.onpointermove = e => { const t = at(e), r = sk.getBoundingClientRect(); $('vpTip').textContent = vpFmt(t); $('vpTip').style.left = (e.clientX - r.left) + 'px'; if (drag) { v.currentTime = t; vpPaint(); } };
  sk.onpointerup = () => drag = false;
  el.addEventListener('mousemove', vpShow);
  el.addEventListener('mousedown', e => { if (e.target === el && el.classList.contains('win')) vpClose(); });
  el.addEventListener('wheel', e => { e.preventDefault(); if (e.ctrlKey) vpAspect(e.deltaY < 0 ? 1 : -1); else vpVolume(e.deltaY < 0 ? .05 : -.05); }, { passive:false });
  window.addEventListener('resize', () => { if (VP.open) vpLayout(); });
  return el;
}
async function openVPlayer(g) {
  const el = vpEl(), v = $('vpV'), s = sysOf(g) || {};
  vpPrevStop(); VP.open = true; VP.g = g; VP.s = s; VP.sub = -1; VP.aspect = Math.max(0, VP_ASPECTS.findIndex(a => a[0] === (s.aspect || 'auto')));
  $('vpTitle').textContent = dn(g); $('vpMsg').textContent = ''; el.classList.remove('fail');
  try { v.volume = +(localStorage.getItem('vpvol') || 1); v.muted = !!localStorage.getItem('vpmute'); } catch (e) {}
  vpSubStyle(s);
  [...v.querySelectorAll('track')].forEach(t => t.remove());
  v.src = vpUrl(g, 'vfile');
  let pos = 0; try { pos = +(localStorage.getItem('vpos|' + coverKey(g)) || 0); } catch (e) {}
  v.onloadeddata = () => { if (pos > 5 && v.duration && pos < v.duration - 10) v.currentTime = pos; v.onloadeddata = null; };
  el.classList.add('on'); if (!el.classList.contains('max')) el.classList.add('win'); music.pause(); vpAspect(0); vpShow(); $('vpNext').style.display = vpNextOf(g) ? '' : 'none';
  v.play().catch(() => {});
  clearInterval(VP.saveT); VP.saveT = setInterval(() => { if (VP.open && v.currentTime > 5) try { localStorage.setItem('vpos|' + coverKey(g), v.currentTime); } catch (e) {} }, 4000);
  // legendas externas (.srt / .vtt com o mesmo nome do vídeo)
  try { VP.subs = await api(vpUrl(g, 'vsubs')); } catch (e) { VP.subs = []; }
  VP.subs.forEach((x, i) => { const t = document.createElement('track'); t.kind = 'subtitles'; t.label = x.name; t.src = vpUrl(g, 'vsub', '&f=' + encodeURIComponent(x.file)); v.appendChild(t); });
  if (VP.subs.length && s.subOn !== false) { const pref = (s.subLang || 'pt').split(',').map(x => x.trim().toLowerCase()); let k = VP.subs.findIndex(x => pref.some(p => x.name.toLowerCase().includes(p))); vpSetSub(k < 0 ? 0 : k); } else vpSetSub(-1);
  vpSubMenu();
}
function vpFail() {
  if (!VP.open) return;
  $('vplayer').classList.add('fail');
  $('vpMsg').innerHTML = 'Este formato não toca no player rápido.<br><button class="btn" id="vpHq">Abrir no player avançado</button>';
  $('vpHq').onclick = () => vpAct('hq');
}
function vpClose() {
  if (!VP.open) return; const v = $('vpV');
  if (v.currentTime > 5 && v.duration && v.currentTime < v.duration - 10) try { localStorage.setItem('vpos|' + coverKey(VP.g), v.currentTime); } catch (e) {}
  v.pause(); v.removeAttribute('src'); v.load(); clearInterval(VP.saveT);
  VP.open = false; $('vplayer').classList.remove('on');
  if (host && document.body.classList.contains('vpfull')) { document.body.classList.remove('vpfull'); host.postMessage('fs'); }
  sfx('back');
}
function vpShow() { const el = $('vplayer'); if (!el) return; el.classList.add('ui'); clearTimeout(VP.hideT); VP.hideT = setTimeout(() => { if (!$('vpV').paused && !el.querySelector('.vpmenu.on')) el.classList.remove('ui'); }, 2600); }
function vpPaint() {
  const v = $('vpV'), d = v.duration || 0, t = v.currentTime || 0;
  $('vpProg').style.width = d ? (t / d * 100) + '%' : '0'; $('vpKnob').style.left = d ? (t / d * 100) + '%' : '0';
  try { const b = v.buffered; if (b.length && d) $('vpBuf').style.width = (b.end(b.length - 1) / d * 100) + '%'; } catch (e) {}
  $('vpTime').textContent = vpFmt(t) + ' / ' + vpFmt(d);
}
function vpVolume(dv) { const v = $('vpV'); v.muted = false; v.volume = Math.max(0, Math.min(1, v.volume + dv)); vpOsd('Volume ' + Math.round(v.volume * 100) + '%'); }
function vpSeek(dt) { const v = $('vpV'); v.currentTime = Math.max(0, Math.min((v.duration || 0) - .5, v.currentTime + dt)); vpShow(); vpPaint(); }
function vpOsd(t) { const m = $('vpMsg'); if ($('vplayer').classList.contains('fail')) return; m.textContent = t; m.classList.add('on'); clearTimeout(vpOsd.t); vpOsd.t = setTimeout(() => m.classList.remove('on'), 1200); }
function vpAspect(d) { VP.aspect = (VP.aspect + d + VP_ASPECTS.length) % VP_ASPECTS.length; $('vpAsp').querySelector('span').textContent = VP_ASPECTS[VP.aspect][1]; vpLayout(); if (d) vpOsd('Proporção: ' + VP_ASPECTS[VP.aspect][1]); }
function vpLayout() {
  const box = $('vplayer').querySelector('.vpbox'), v = $('vpV'), k = VP_ASPECTS[VP.aspect][0], fr = $('vplayer').querySelector('.vpframe').getBoundingClientRect(), W = fr.width, H = fr.height;
  v.style.objectFit = k === 'fill' ? 'cover' : k === 'auto' ? 'contain' : 'fill';
  if (k === 'auto' || k === 'fill' || k === 'stretch') { Object.assign(box.style, { width: W + 'px', height: H + 'px' }); return; }
  const [a, b] = k.split(':').map(Number), r = a / b, w = Math.min(W, H * r);
  Object.assign(box.style, { width: w + 'px', height: (w / r) + 'px' });
}
function vpSetSub(k) {
  const tr = [...$('vpV').textTracks]; VP.sub = k;
  tr.forEach((t, i) => t.mode = i === k ? 'showing' : 'disabled');
  vpSubMenu();
}
function vpSubMenu() {
  const m = $('vpSubs'); if (!m) return;
  m.innerHTML = `<div class="vpmi${VP.sub < 0 ? ' on' : ''}" data-k="-1">Desligadas</div>` + (VP.subs.length ? VP.subs.map((x, i) => `<div class="vpmi${VP.sub === i ? ' on' : ''}" data-k="${i}">${esc(x.name)}</div>`).join('') : '<div class="vpmi dim">Nenhuma legenda .srt/.vtt ao lado do vídeo</div>');
  m.querySelectorAll('[data-k]').forEach(x => x.onclick = e => { e.stopPropagation(); vpSetSub(+x.dataset.k); m.classList.remove('on'); });
}
function vpSubStyle(s) {
  let st = $('vpCue'); if (!st) { st = document.createElement('style'); st.id = 'vpCue'; document.head.appendChild(st); }
  const col = s.subColor === 'yellow' ? '#FFE14D' : s.subColor === 'cyan' ? '#7FE7FF' : '#fff', sz = (+s.subSize || 46) / 46 * 2.6, bg = s.subBg || 'outline';
  st.textContent = `#vpV::cue { font: 600 ${sz.toFixed(2)}vw/1.25 "Segoe UI", sans-serif; color:${col}; background:${bg === 'box' ? 'rgba(0,0,0,.72)' : 'transparent'}; text-shadow:${bg === 'box' ? 'none' : bg === 'shadow' ? '2px 2px 4px #000' : '0 0 3px #000, 0 0 3px #000, 0 0 3px #000, 0 0 3px #000'}; }`;
}
async function vpAct(a) {
  const v = $('vpV'); vpShow();
  if (a === 'play') { if (v.paused) v.play().catch(() => {}); else v.pause(); }
  else if (a === 'back') vpSeek(-10); else if (a === 'fwd') vpSeek(10);
  else if (a === 'mute') { v.muted = !v.muted; if (!v.muted && v.volume === 0) v.volume = .5; }
  else if (a === 'sub') $('vpSubs').classList.toggle('on');
  else if (a === 'subnext') { const n = VP.subs.length; if (!n) { vpOsd('Sem legendas'); return; } const k = VP.sub + 1 >= n ? -1 : VP.sub + 1; vpSetSub(k); vpOsd(k < 0 ? 'Legendas desligadas' : 'Legenda: ' + VP.subs[k].name); }
  else if (a === 'asp') vpAspect(1);
  else if (a === 'full') { document.body.classList.toggle('vpfull'); if (host) host.postMessage('fs'); setTimeout(vpLayout, 300); }
  else if (a === 'close') vpClose();
  else if (a === 'max') { const el = $('vplayer'); el.classList.toggle('win'); el.classList.toggle('max', !el.classList.contains('win')); setTimeout(vpLayout, 260); }
  else if (a === 'next') { const n = vpNextOf(VP.g); if (!n) { vpOsd('Último vídeo da lista'); return; } const v0 = $('vpV'); if (v0.currentTime > 5 && v0.duration && v0.currentTime < v0.duration - 10) try { localStorage.setItem('vpos|' + coverKey(VP.g), v0.currentTime); } catch (e) {} const j = shown.indexOf(n); if (j >= 0 && typeof selectGame === 'function') selectGame(j, true); openVPlayer(n); vpOsd('▶ ' + dn(n)); }
  else if (a === 'hq') {   // player avançado (mpv): upscaling + qualquer formato
    if (!await mpvReady(true)) return;
    const g = VP.g, t = v.currentTime; vpClose();
    try { await api('/api/vplayer', { method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify({ console: g.sid || (sysOf(g) || {}).id, path: g.path, upscale: (VP.s && VP.s.upscale && VP.s.upscale !== 'off') ? VP.s.upscale : 'fsr', aspect: VP_ASPECTS[VP.aspect][0] }) }); }
    catch (e) { toast(e.message, true); }
  }
}
// controle e teclado dentro do player
function vpInput(a) {
  const m = $('vpSubs');
  if (m.classList.contains('on')) {
    const items = [...m.querySelectorAll('[data-k]')], i = items.findIndex(x => x.classList.contains('kb'));
    if (a === 'up' || a === 'down') { const n = (i + (a === 'down' ? 1 : -1) + items.length) % items.length; items.forEach((x, j) => x.classList.toggle('kb', j === n)); return; }
    if (a === 'ok') { (items[i] || items[0]).click(); return; }
    if (a === 'back' || a === 'fav') { m.classList.remove('on'); return; }
    return;
  }
  ({ ok: () => vpAct('play'), back: () => vpClose(), left: () => vpSeek(-10), right: () => vpSeek(10), up: () => vpVolume(.05), down: () => vpVolume(-.05),
     pgup: () => vpSeek(-60), pgdn: () => vpSeek(60), fav: () => vpAct('subnext'), menu: () => vpAspect(1), start: () => vpAct('max'), select: () => vpAct('mute'), search: () => vpAct('next') }[a] || (() => {}))();
}
function vpKey(e) {
  const k = e.key, map = { ' ': 'play', k: 'play', K: 'play', ArrowLeft: 'back', ArrowRight: 'fwd', m: 'mute', M: 'mute', f: 'full', F: 'full', F11: 'full', s: 'subnext', S: 'subnext', a: 'asp', A: 'asp', u: 'hq', U: 'hq', n: 'next', N: 'next', w: 'max', W: 'max', Escape: 'close', Backspace: 'close' };
  e.preventDefault();
  if (k === 'ArrowUp') return vpVolume(.05); if (k === 'ArrowDown') return vpVolume(-.05);
  if (k === 'PageUp') return vpSeek(-60); if (k === 'PageDown') return vpSeek(60);
  if (e.ctrlKey && (k === '+' || k === '=')) return vpAspect(1); if (e.ctrlKey && k === '-') return vpAspect(-1);
  if (k === 'Escape' && document.body.classList.contains('vpfull')) return vpAct('full');
  if (map[k]) vpAct(map[k]);
}

/* ---------- prévia de fundo na lista: o próprio vídeo, do início, mudo e leve ---------- */
let vpPrevT = 0;
function vpPrevStop() {
  clearTimeout(vpPrevT); document.body.classList.remove('vprevon'); const o = $('vprev'); if (!o) return;
  o.classList.remove('on'); const v = o; setTimeout(() => { try { v.pause(); v.removeAttribute('src'); v.load(); v.remove(); } catch (e) {} }, 500); o.id = '';
}
function vpPrev(g) {
  vpPrevStop();
  if (!g || (sysOf(g) || {}).type !== 'video' || VP.open || !document.hasFocus()) return;
  vpPrevT = setTimeout(() => {
    if (shown[gIdx] !== g || screen !== 'games' || VP.open) return;
    const v = document.createElement('video'); v.id = 'vprev'; v.muted = true; v.playsInline = true; v.loop = true; v.preload = 'auto';
    v.src = vpUrl(g, 'vfile');
    v.onplaying = () => { v.classList.add('on'); document.body.classList.add('vprevon'); if (typeof setVidPlay === 'function') setVidPlay(true); }; v.onerror = () => v.remove();
    $('gameBg').appendChild(v); v.play().catch(() => v.remove());
  }, 2500);
}

// próximo vídeo da lista atual (mesma ordem da tela)
function vpNextOf(g) { const i = shown.indexOf(g); if (i < 0) return null; for (let k = i + 1; k < shown.length; k++) { const s = sysOf(shown[k]) || {}; if (s.type === 'video') return shown[k]; } return null; }
// antes de excluir: fecha o player e a prévia (o Windows só deixa apagar arquivo que ninguém está usando)
function vpRelease() { try { if (VP.open) vpClose(); } catch (e) {} try { vpPrevStop(); const v = $('vpV'); if (v) { v.removeAttribute('src'); v.load(); } } catch (e) {} }
