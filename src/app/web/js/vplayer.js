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
  bri: '<svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="4.5"/><path d="M12 2v3M12 19v3M2 12h3M19 12h3M4.9 4.9l2.1 2.1M17 17l2.1 2.1M4.9 19.1L7 17M17 7l2.1-2.1" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg>',
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
      <button class="vpb wide" data-a="bri" id="vpBri" title="Brilho (B) — vídeos HDR costumam ficar escuros">${VP_ICO.bri}<span>100%</span></button>
      <button class="vpb wide" data-a="up" id="vpUp" title="Upscaling (U): melhora a nitidez do vídeo ampliado, direto na placa de vídeo">${VP_ICO.hq}<span>Desligado</span></button>
      <button class="vpb" data-a="full" title="Tela cheia (F)">${VP_ICO.full}</button>
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
  el.addEventListener('wheel', e => { e.preventDefault(); if (e.ctrlKey) vpZoom(e.deltaY < 0 ? 1.1 : 1 / 1.1, e); else vpVolume(e.deltaY < 0 ? .05 : -.05); }, { passive:false });
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
  { let b0 = 0; try { b0 = +(localStorage.getItem('vbri|' + coverKey(g)) || 0); } catch (e) {} VP.bri = b0 || (/\b(hdr|hdr10|dv|dovi|dolby.?vision)\b/i.test(g.name || g.path) ? 1.4 : 1); vpBri(0); }
  VP.zoom = 1; VP.zx = 0; VP.zy = 0; vpZoomApply(); VP.up = +(localStorage.getItem('vpup') || 0) || 0; vpUpscale(0);
  el.classList.add('on'); music.pause(); vpAspect(0); vpShow(); $('vpNext').style.display = vpNextOf(g) ? '' : 'none';
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
  v.pause(); v.removeAttribute('src'); v.load(); clearInterval(VP.saveT); vpGlStop();
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
  setTimeout(vpGlSize, 0);
  const box = $('vplayer').querySelector('.vpbox'), v = $('vpV'), k = VP_ASPECTS[VP.aspect][0], fr = $('vplayer').querySelector('.vpframe').getBoundingClientRect(), W = fr.width, H = fr.height;
  v.style.objectFit = k === 'fill' ? 'cover' : k === 'auto' ? 'contain' : 'fill';
  if (k === 'auto' || k === 'fill' || k === 'stretch') { Object.assign(box.style, { width: W + 'px', height: H + 'px' }); return; }
  const [a, b] = k.split(':').map(Number), r = a / b, w = Math.min(W, H * r);
  Object.assign(box.style, { width: w + 'px', height: (w / r) + 'px' });
}
function vpSetSub(k) {
  const tr = [...$('vpV').textTracks]; VP.sub = k;
  tr.forEach((t, i) => { t.mode = i === k ? 'hidden' : 'disabled'; t.oncuechange = i === k ? vpCues : null; });   // legenda desenhada pelo Koru (fica visível também com o upscaling)
  vpCues();
  vpSubMenu();
}
function vpCues() {
  let box = $('vpCues'); if (!box) { box = document.createElement('div'); box.id = 'vpCues'; $('vplayer').querySelector('.vpframe').appendChild(box); }
  const t = VP.sub >= 0 ? [...$('vpV').textTracks][VP.sub] : null, cs = t && t.activeCues ? [...t.activeCues] : [];
  box.innerHTML = cs.map(c => `<span>${esc(c.text).replace(/&lt;(\/?)(i|b|u)&gt;/g, '<$1$2>').replace(/\n/g, '<br>')}</span>`).join('<br>');
  box.style.bottom = (100 - (+((VP.s && VP.s.subPos) || 95))) + 6 + '%';
}
function vpSubMenu() {
  const m = $('vpSubs'); if (!m) return;
  m.innerHTML = `<div class="vpmi${VP.sub < 0 ? ' on' : ''}" data-k="-1">Desligadas</div>` + (VP.subs.length ? VP.subs.map((x, i) => `<div class="vpmi${VP.sub === i ? ' on' : ''}" data-k="${i}">${esc(x.name)}</div>`).join('') : '<div class="vpmi dim">Nenhuma legenda .srt/.vtt ao lado do vídeo</div>');
  m.querySelectorAll('[data-k]').forEach(x => x.onclick = e => { e.stopPropagation(); vpSetSub(+x.dataset.k); m.classList.remove('on'); });
}
function vpSubStyle(s) {
  let st = $('vpCue'); if (!st) { st = document.createElement('style'); st.id = 'vpCue'; document.head.appendChild(st); }
  const col = s.subColor === 'yellow' ? '#FFE14D' : s.subColor === 'cyan' ? '#7FE7FF' : '#fff', sz = (+s.subSize || 46) / 46 * 2.6, bg = s.subBg || 'outline';
  st.textContent = `#vpCues span { font: 600 ${sz.toFixed(2)}vw/1.25 "Segoe UI", sans-serif; color:${col}; background:${bg === 'box' ? 'rgba(0,0,0,.72)' : 'transparent'}; text-shadow:${bg === 'box' ? 'none' : bg === 'shadow' ? '2px 2px 4px #000' : '0 0 3px #000, 0 0 3px #000, 0 0 3px #000, 0 0 3px #000'}; }`;
}
async function vpAct(a) {
  const v = $('vpV'); vpShow();
  if (a === 'play') { if (v.paused) v.play().catch(() => {}); else v.pause(); }
  else if (a === 'back') vpSeek(-10); else if (a === 'fwd') vpSeek(10);
  else if (a === 'mute') { v.muted = !v.muted; if (!v.muted && v.volume === 0) v.volume = .5; }
  else if (a === 'sub') $('vpSubs').classList.toggle('on');
  else if (a === 'subnext') { const n = VP.subs.length; if (!n) { vpOsd('Sem legendas'); return; } const k = VP.sub + 1 >= n ? -1 : VP.sub + 1; vpSetSub(k); vpOsd(k < 0 ? 'Legendas desligadas' : 'Legenda: ' + VP.subs[k].name); }
  else if (a === 'asp') vpAspect(1);
  else if (a === 'bri') vpBri(1);
  else if (a === 'full') { document.body.classList.toggle('vpfull'); if (host) host.postMessage('fs'); setTimeout(vpLayout, 300); }
  else if (a === 'close') vpClose();
  else if (a === 'max') { const el = $('vplayer'); el.classList.toggle('win'); el.classList.toggle('max', !el.classList.contains('win')); setTimeout(vpLayout, 260); }
  else if (a === 'next') { const n = vpNextOf(VP.g); if (!n) { vpOsd('Último vídeo da lista'); return; } const v0 = $('vpV'); if (v0.currentTime > 5 && v0.duration && v0.currentTime < v0.duration - 10) try { localStorage.setItem('vpos|' + coverKey(VP.g), v0.currentTime); } catch (e) {} const j = shown.indexOf(n); if (j >= 0 && typeof selectGame === 'function') selectGame(j, true); openVPlayer(n); vpOsd('▶ ' + dn(n)); }
  else if (a === 'up') vpUpscale(1);
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
     pgup: () => vpSeek(-60), pgdn: () => vpSeek(60), fav: () => vpAct('subnext'), menu: () => vpAspect(1), start: () => vpAct('full'), select: () => vpAct('mute'), search: () => vpAct('next'), lt: () => vpZoom(1 / 1.1), rt: () => vpZoom(1.1) }[a] || (() => {}))();
}
function vpKey(e) {
  const k = e.key, map = { ' ': 'play', k: 'play', K: 'play', ArrowLeft: 'back', ArrowRight: 'fwd', m: 'mute', M: 'mute', f: 'full', F: 'full', F11: 'full', s: 'subnext', S: 'subnext', a: 'asp', A: 'asp', b: 'bri', B: 'bri', u: 'up', U: 'up', n: 'next', N: 'next', Escape: 'close', Backspace: 'close' };
  e.preventDefault();
  if (k === 'ArrowUp') return vpVolume(.05); if (k === 'ArrowDown') return vpVolume(-.05);
  if (k === 'PageUp') return vpSeek(-60); if (k === 'PageDown') return vpSeek(60);
  if (e.ctrlKey && (k === '+' || k === '=')) return vpZoom(1.1); if (e.ctrlKey && k === '-') return vpZoom(1 / 1.1); if (e.ctrlKey && k === '0') return vpZoom(0);
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

// brilho: vídeos HDR/Dolby Vision ficam escuros fora do modo HDR do Windows — compensa no próprio player (lembra por vídeo)
const VP_BRI = [1, 1.2, 1.4, 1.6, 1.8];
function vpBri(d) {
  if (d) { const i = VP_BRI.findIndex(x => Math.abs(x - VP.bri) < .01); VP.bri = VP_BRI[(i + 1) % VP_BRI.length]; try { localStorage.setItem('vbri|' + coverKey(VP.g), VP.bri); } catch (e) {} vpOsd('Brilho ' + Math.round(VP.bri * 100) + '%'); }
  $('vpV').style.filter = VP.bri > 1 ? `brightness(${VP.bri}) contrast(${(1 + (VP.bri - 1) * .25).toFixed(2)}) saturate(${(1 + (VP.bri - 1) * .3).toFixed(2)})` : '';
  $('vpBri').querySelector('span').textContent = Math.round(VP.bri * 100) + '%';
}

// zoom de verdade (Ctrl+scroll / Ctrl + −): amplia o vídeo em volta do mouse; arrastar com o mouse move a imagem ampliada
function vpZoomApply() { const b = $('vplayer') && $('vplayer').querySelector('.vpbox'); if (!b) return; b.style.transform = `translate(-50%,-50%) translate(${VP.zx}px,${VP.zy}px) scale(${VP.zoom})`; }
function vpZoom(f, e) {
  if (!f) { VP.zoom = 1; VP.zx = VP.zy = 0; vpZoomApply(); vpOsd('Zoom 100%'); return; }
  const z0 = VP.zoom, z = Math.max(1, Math.min(6, z0 * f));
  if (z === 1) { VP.zx = VP.zy = 0; }
  else if (e) { const r = $('vplayer').querySelector('.vpframe').getBoundingClientRect(), mx = e.clientX - r.left - r.width / 2, my = e.clientY - r.top - r.height / 2; VP.zx = mx - (mx - VP.zx) * z / z0; VP.zy = my - (my - VP.zy) * z / z0; }
  VP.zoom = z; vpZoomApply(); vpOsd('Zoom ' + Math.round(z * 100) + '%');
}
(() => { let d = null; document.addEventListener('pointerdown', e => { if (!VP.open || VP.zoom <= 1 || !e.target.closest('.vpbox')) return; d = { x: e.clientX, y: e.clientY, zx: VP.zx, zy: VP.zy, moved: false }; }, true);
  document.addEventListener('pointermove', e => { if (!d) return; const dx = e.clientX - d.x, dy = e.clientY - d.y; if (Math.abs(dx) + Math.abs(dy) > 4) d.moved = true; VP.zx = d.zx + dx; VP.zy = d.zy + dy; vpZoomApply(); });
  document.addEventListener('pointerup', e => { if (d && d.moved) { const v = $('vpV'); const st = e => { e.stopPropagation(); v.removeEventListener('click', st, true); }; v.addEventListener('click', st, true); } d = null; }); })();

/* ---------- upscaling na placa de vídeo (WebGL): ampliação suave + nitidez adaptativa (estilo AMD FSR/CAS) ---------- */
const VP_UP = [['Desligado', 0], ['Suave', .45], ['Médio', .7], ['Forte', 1]];
let vpGl = null;
function vpUpscale(d) {
  VP.up = ((VP.up || 0) + d + VP_UP.length) % VP_UP.length; try { localStorage.setItem('vpup', VP.up); } catch (e) {}
  $('vpUp').querySelector('span').textContent = VP_UP[VP.up][0]; $('vpUp').classList.toggle('on', VP.up > 0);
  if (d) vpOsd('Upscaling: ' + VP_UP[VP.up][0]);
  if (VP.up > 0) vpGlStart(); else vpGlStop();
}
function vpGlStop() { if (!vpGl) return; vpGl.stop = true; try { vpGl.cv.remove(); } catch (e) {} $('vpV').style.opacity = ''; vpGl = null; }
function vpGlSize() { if (!vpGl) return; const b = $('vplayer').querySelector('.vpbox'), r = b.getBoundingClientRect(), dpr = devicePixelRatio || 1; vpGl.cv.width = Math.round(b.clientWidth * dpr); vpGl.cv.height = Math.round(b.clientHeight * dpr); }
function vpGlStart() {
  if (vpGl) return; const v = $('vpV'), box = $('vplayer').querySelector('.vpbox');
  const cv = document.createElement('canvas'); cv.className = 'vpgl'; const gl = cv.getContext('webgl', { premultipliedAlpha: false, alpha: false });
  if (!gl) { vpOsd('Upscaling indisponível nesta placa de vídeo'); return; }
  const vs = 'attribute vec2 p; varying vec2 uv; uniform vec4 fit; void main(){ uv = vec2(p.x*.5+.5, .5-p.y*.5); gl_Position = vec4(p*fit.xy + fit.zw, 0., 1.); }';
  const fs = `precision highp float; varying vec2 uv; uniform sampler2D t; uniform vec2 px; uniform float sh;
    vec3 T(vec2 o){ return texture2D(t, uv + o*px).rgb; }
    void main(){
      vec3 a=T(vec2(-1.,-1.)), b=T(vec2(0.,-1.)), c=T(vec2(1.,-1.)), d=T(vec2(-1.,0.)), e=T(vec2(0.)), f=T(vec2(1.,0.)), g=T(vec2(-1.,1.)), h=T(vec2(0.,1.)), i=T(vec2(1.,1.));
      vec3 mn=min(min(min(d,e),min(f,b)),h), mx=max(max(max(d,e),max(f,b)),h);
      vec3 mn2=min(mn,min(min(a,c),min(g,i))), mx2=max(mx,max(max(a,c),max(g,i))); mn+=mn2; mx+=mx2;
      vec3 amp=clamp(min(mn,2.-mx)/max(mx,1e-4),0.,1.); amp=sqrt(amp);
      float pk=-1./mix(8.,5.,sh); vec3 w=amp*pk;
      vec3 r=(b*w+d*w+f*w+h*w+e)/(1.+4.*w);
      gl_FragColor=vec4(clamp(r,0.,1.),1.);
    }`;
  const sh = (ty, src) => { const o = gl.createShader(ty); gl.shaderSource(o, src); gl.compileShader(o); return o; };
  const pr = gl.createProgram(); gl.attachShader(pr, sh(gl.VERTEX_SHADER, vs)); gl.attachShader(pr, sh(gl.FRAGMENT_SHADER, fs)); gl.linkProgram(pr);
  if (!gl.getProgramParameter(pr, gl.LINK_STATUS)) { vpOsd('Upscaling indisponível'); return; }
  gl.useProgram(pr);
  const buf = gl.createBuffer(); gl.bindBuffer(gl.ARRAY_BUFFER, buf); gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1,-1, 1,-1, -1,1, 1,1]), gl.STATIC_DRAW);
  const lp = gl.getAttribLocation(pr, 'p'); gl.enableVertexAttribArray(lp); gl.vertexAttribPointer(lp, 2, gl.FLOAT, false, 0, 0);
  const tex = gl.createTexture(); gl.bindTexture(gl.TEXTURE_2D, tex);
  [[gl.TEXTURE_MIN_FILTER, gl.LINEAR], [gl.TEXTURE_MAG_FILTER, gl.LINEAR], [gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE], [gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE]].forEach(([k, x]) => gl.texParameteri(gl.TEXTURE_2D, k, x));
  const U = n => gl.getUniformLocation(pr, n), uPx = U('px'), uSh = U('sh'), uFit = U('fit');
  box.appendChild(cv); vpGl = { cv, gl, stop: false }; vpGlSize();
  const draw = () => {
    if (!vpGl || vpGl.stop) return;
    if (v.videoWidth && v.readyState >= 2) {
      try { gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGB, gl.RGB, gl.UNSIGNED_BYTE, v); } catch (e) { vpOsd('Upscaling indisponível para este vídeo'); VP.up = VP_UP.length - 1; vpUpscale(1); return; }
      // mesmo enquadramento do vídeo (contain/cover/fill)
      const W = cv.width, H = cv.height, vr = v.videoWidth / v.videoHeight, br = W / H, fit = v.style.objectFit || 'contain';
      let sx = 1, sy = 1; if (fit === 'contain') { if (vr > br) sy = br / vr; else sx = vr / br; } else if (fit === 'cover') { if (vr > br) sx = vr / br; else sy = br / vr; }
      gl.viewport(0, 0, W, H); gl.clearColor(0, 0, 0, 1); gl.clear(gl.COLOR_BUFFER_BIT);
      gl.uniform4f(uFit, sx, sy, 0, 0); gl.uniform2f(uPx, 1 / v.videoWidth, 1 / v.videoHeight); gl.uniform1f(uSh, VP_UP[VP.up][1]);
      gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4); v.style.opacity = '0'; cv.style.filter = v.style.filter;
    }
    if (v.requestVideoFrameCallback) v.requestVideoFrameCallback(draw); else requestAnimationFrame(draw);
  };
  draw();
}
