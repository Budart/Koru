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
  aud: '<svg viewBox="0 0 24 24"><path d="M12 3a7 7 0 0 0-7 7v5a3 3 0 0 0 3 3h1v-7H7v-1a5 5 0 0 1 10 0v1h-2v7h1a3 3 0 0 0 3-3v-5a7 7 0 0 0-7-7z"/></svg>',
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
      <button class="vpb" data-a="back" title="Voltar 10 s (←)">${VP_ICO.back}</button><button class="vpb big" data-a="play" id="vpPlay" title="Play/Pause (Espaço)">${VP_ICO.pause}</button><button class="vpb" data-a="fwd" title="Avançar 10 s (→)">${VP_ICO.fwd}</button><button class="vpb" data-a="next" id="vpNext" title="Próximo vídeo (Ctrl+→)">${VP_ICO.next}</button>
      <div class="vpvol"><button class="vpb" data-a="mute" id="vpMute" title="Mudo (M)">${VP_ICO.vol}</button><input type="range" id="vpVol" min="0" max="1" step="0.02" value="1"></div>
      <span class="vptime" id="vpTime">0:00 / 0:00</span><span class="vpgrow"></span>
      <div class="vpmenu-w"><button class="vpb wide" data-a="aud" id="vpAud" title="Faixa de áudio (A)">${VP_ICO.aud}<span>Áudio</span></button><div class="vpmenu" id="vpAuds"></div></div>
      <div class="vpmenu-w"><button class="vpb" data-a="sub" title="Legendas (S)">${VP_ICO.sub}</button><div class="vpmenu" id="vpSubs"></div></div>
      <button class="vpb wide" data-a="asp" id="vpAsp" title="Proporção (Ctrl+scroll)">${VP_ICO.asp}<span>Original</span></button>
      <button class="vpb wide" data-a="bri" id="vpBri" title="Brilho (B) — vídeos HDR costumam ficar escuros">${VP_ICO.bri}<span>100%</span></button>
      <button class="vpb" data-a="full" title="Tela cheia (F)">${VP_ICO.full}</button>
    </div></div></div>`;
  document.body.appendChild(el);
  const v = $('vpV');
  el.querySelectorAll('[data-a]').forEach(b => b.onclick = e => { e.stopPropagation(); vpAct(b.dataset.a); });
  v.onclick = () => vpAct('play'); v.ondblclick = () => vpAct('full');
  v.onplay = v.onpause = () => { const x = VPV(); $('vpPlay').innerHTML = x.paused ? VP_ICO.play : VP_ICO.pause; el.classList.toggle('paused', x.paused); vpShow(); };
  v.ontimeupdate = vpPaint; v.onprogress = vpPaint; v.onvolumechange = () => { const x = VPV(); $('vpMute').innerHTML = x.muted || x.volume === 0 ? VP_ICO.mute : VP_ICO.vol; $('vpVol').value = x.muted ? 0 : x.volume; try { localStorage.setItem('vpvol', x.volume); localStorage.setItem('vpmute', x.muted ? '1' : ''); } catch (e) {} };
  v.onloadedmetadata = () => { vpLayout(); if (!VPM && !v.videoWidth) vpFail(); };
  v.onerror = () => { if (!VPM && VP.open && v.getAttribute('src')) vpFail(); };
  v.onended = () => { try { localStorage.removeItem('vpos|' + coverKey(VP.g)); } catch (e) {} if (vpNextOf(VP.g)) vpAct('next'); else vpClose(); };
  $('vpVol').oninput = () => { const x = VPV(); x.volume = +$('vpVol').value; x.muted = x.volume === 0; };
  const sk = $('vpSeek'), at = e => { const r = sk.getBoundingClientRect(); return Math.max(0, Math.min(1, (e.clientX - r.left) / r.width)) * (VPV().duration || 0); };
  let drag = false;
  sk.onpointerdown = e => { drag = true; sk.setPointerCapture(e.pointerId); VPV().currentTime = at(e); vpPaint(); };
  sk.onpointermove = e => { const t = at(e), r = sk.getBoundingClientRect(); $('vpTip').textContent = vpFmt(t); $('vpTip').style.left = (e.clientX - r.left) + 'px'; if (drag) { VPV().currentTime = t; vpPaint(); } };
  sk.onpointerup = () => drag = false;
  el.addEventListener('mousemove', vpShow);
  el.addEventListener('wheel', e => { e.preventDefault(); if (e.ctrlKey) vpZoom(e.deltaY < 0 ? 1.1 : 1 / 1.1, e); else vpVolume(e.deltaY < 0 ? .05 : -.05); }, { passive:false });
  window.addEventListener('resize', () => { if (VP.open) { vpLayout(); vpMpvRect(); } });
  return el;
}
async function openVPlayer(g) {
  const el = vpEl(), v = $('vpV'), s = sysOf(g) || {};
  vpPrevStop(); vpMpvStop(); VP.open = true; VP.g = g; VP.s = s; VP.sub = -1; VP.aspect = Math.max(0, VP_ASPECTS.findIndex(a => a[0] === (s.aspect || 'auto')));
  $('vpTitle').textContent = dn(g); $('vpMsg').textContent = ''; el.classList.remove('fail');
  try { v.volume = +(localStorage.getItem('vpvol') || 1); v.muted = !!localStorage.getItem('vpmute'); } catch (e) {}
  vpSubStyle(s);
  [...v.querySelectorAll('track')].forEach(t => t.remove());
  v.src = vpUrl(g, 'vfile');
  let pos = 0; try { pos = +(localStorage.getItem('vpos|' + coverKey(g)) || 0); } catch (e) {}
  v.onloadeddata = () => { if (pos > 5 && v.duration && pos < v.duration - 10) v.currentTime = pos; v.onloadeddata = null; };
  { let b0 = 0; try { b0 = +(localStorage.getItem('vbri|' + coverKey(g)) || 0); } catch (e) {} VP.bri = b0 || (/\b(hdr|hdr10|dv|dovi|dolby.?vision)\b/i.test(g.name || g.path) ? 1.4 : 1); vpBri(0); }
  VP.zoom = 1; VP.zx = 0; VP.zy = 0; vpZoomApply();
  el.classList.add('on'); music.pause(); vpAspect(0); vpShow(); $('vpNext').style.display = vpNextOf(g) ? '' : 'none';
  v.play().catch(() => {});
  clearInterval(VP.saveT); VP.saveT = setInterval(() => { const x = VPV(); if (VP.open && x.currentTime > 5) try { localStorage.setItem('vpos|' + coverKey(g), x.currentTime); } catch (e) {} }, 4000);
  VP.auds = []; VP.aud = 0; $('vpAud').style.display = 'none';
  api(vpUrl(g, 'vaudio')).then(l => { if (!VP.open || VP.g !== g) return; VP.auds = l || []; if (!VP.auds.length) return;
    $('vpAud').style.display = VP.auds.length > 1 || !VP.auds[0].ok ? '' : 'none';
    const pref = (s.subLang || 'pt').split(',').map(x => x.trim().toLowerCase()), lang = x => ((x.lang || '') + ' ' + x.name).toLowerCase();
    const okIdx = VP.auds.map((x, i) => i).filter(i => VP.auds[i].ok);
    let k = -1; for (const p of ['pt', 'por', 'pob']) { if (!pref.includes(p) && p !== 'pt') continue; k = okIdx.find(i => /\b(por|pt|pob)\b|portugu/.test(lang(VP.auds[i]))); if (k != null && k >= 0) break; k = -1; }
    if (k < 0) k = okIdx.find(i => VP.auds[i].def); if (k == null || k < 0) k = okIdx.length ? okIdx[0] : VP.auds.findIndex(x => x.def);
    vpSetAud(Math.max(0, k), false);
  }).catch(() => {});
  // legendas externas (.srt / .vtt com o mesmo nome do vídeo)
  try { VP.subs = await api(vpUrl(g, 'vsubs')); } catch (e) { VP.subs = []; }
  if (!VP.open || VP.g !== g) return;
  VP.subs = VP.subs.filter(x => x.text !== false || x.emb == null).concat(VP.subs.filter(x => x.text === false));   // legendas de imagem (PGS) no fim: não dá para mostrar
  VP.subs.forEach(x => vpAddTrack(g, x));
  const usable = VP.subs.map((x, i) => i).filter(i => VP.subs[i].text !== false);
  if (usable.length && s.subOn !== false) {
    const pref = (s.subLang || 'pt').split(',').map(x => x.trim().toLowerCase()).filter(Boolean), nm = i => (VP.subs[i].name + ' ' + (VP.subs[i].lang || '')).toLowerCase();
    let k = -1; for (const p of pref) { k = usable.find(i => nm(i).split(/[\s()—,.-]+/).includes(p) || nm(i).includes(p === 'pt' || p === 'por' || p === 'pob' ? 'portugu' : p === 'en' || p === 'eng' ? 'ingl' : '\u0000')); if (k != null && k >= 0) break; k = -1; }
    const d = usable.find(i => VP.subs[i].def); vpSetSub(k >= 0 ? k : d != null ? d : usable[0]);
  } else vpSetSub(-1);
  vpSubMenu();
}
function vpFail() {
  if (!VP.open) return;
  $('vplayer').classList.add('fail');
  $('vpMsg').innerHTML = 'Este formato não toca no player rápido.<br><button class="btn" id="vpHq">Abrir no player avançado (mpv)</button>';
  $('vpHq').onclick = () => vpAct('hq');
}
function vpClose() {
  if (!VP.open) return; const v = VPV();
  if (v.currentTime > 5 && v.duration && v.currentTime < v.duration - 10) try { localStorage.setItem('vpos|' + coverKey(VP.g), v.currentTime); } catch (e) {}
  vpMpvStop(); { const r = $('vpV'); r.pause(); r.removeAttribute('src'); r.load(); } clearInterval(VP.saveT);
  VP.open = false; $('vplayer').classList.remove('on');
  if (host && document.body.classList.contains('vpfull')) { document.body.classList.remove('vpfull'); host.postMessage('fs'); }
  sfx('back');
}
function vpShow() { const el = $('vplayer'); if (!el) return; el.classList.add('ui'); clearTimeout(VP.hideT); VP.hideT = setTimeout(() => { if (!VPV().paused && !el.querySelector('.vpmenu.on')) el.classList.remove('ui'); }, 2600); }
function vpPaint() {
  const v = VPV(), d = v.duration || 0, t = v.currentTime || 0;
  $('vpProg').style.width = d ? (t / d * 100) + '%' : '0'; $('vpKnob').style.left = d ? (t / d * 100) + '%' : '0';
  try { const b = v.buffered; if (b.length && d) $('vpBuf').style.width = (b.end(b.length - 1) / d * 100) + '%'; } catch (e) {}
  $('vpTime').textContent = vpFmt(t) + ' / ' + vpFmt(d);
}
function vpVolume(dv) { const v = VPV(); v.muted = false; v.volume = Math.max(0, Math.min(1, v.volume + dv)); vpOsd('Volume ' + Math.round(v.volume * 100) + '%'); }
function vpSeek(dt) { const v = VPV(); v.currentTime = Math.max(0, Math.min((v.duration || 0) - .5, v.currentTime + dt)); vpShow(); vpPaint(); }
function vpOsd(t) { if (VPM) { VPM.v.cmd('show-text', t, 1500); return; } const m = $('vpMsg'); if ($('vplayer').classList.contains('fail')) return; m.textContent = t; m.classList.add('on'); clearTimeout(vpOsd.t); vpOsd.t = setTimeout(() => m.classList.remove('on'), 1200); }
function vpAspect(d) { VP.aspect = (VP.aspect + d + VP_ASPECTS.length) % VP_ASPECTS.length; $('vpAsp').querySelector('span').textContent = VP_ASPECTS[VP.aspect][1]; vpLayout(); if (d) vpOsd('Proporção: ' + VP_ASPECTS[VP.aspect][1]); }
function vpLayout() {
  const box = $('vplayer').querySelector('.vpbox'), v = $('vpV'), k = VP_ASPECTS[VP.aspect][0], fr = $('vplayer').querySelector('.vpframe').getBoundingClientRect(), W = fr.width, H = fr.height;
  v.style.objectFit = k === 'fill' ? 'cover' : k === 'auto' ? 'contain' : 'fill';
  if (k === 'auto' || k === 'fill' || k === 'stretch') { Object.assign(box.style, { width: W + 'px', height: H + 'px' }); return; }
  const [a, b] = k.split(':').map(Number), r = a / b, w = Math.min(W, H * r);
  Object.assign(box.style, { width: w + 'px', height: (w / r) + 'px' });
}
function vpAddTrack(g, x) {
  const t = document.createElement('track'); t.kind = 'subtitles'; t.label = x.name;
  t.src = x.path ? '/api/vsubfile?f=' + encodeURIComponent(x.path) : x.emb != null ? vpUrl(g, 'vsub', '&emb=' + x.emb) : vpUrl(g, 'vsub', '&f=' + encodeURIComponent(x.file));
  t.addEventListener('load', () => { if (VP.subs[VP.sub] === x) { vpCues(); if (x.emb != null) vpOsd('Legenda: ' + x.name); } });
  t.addEventListener('error', () => { if (VP.subs[VP.sub] === x) vpOsd('Não foi possível ler esta legenda'); });
  $('vpV').appendChild(t);
}
async function vpPickSub() {
  const g = VP.g; let r; try { r = await api('/api/vsubpick', { method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify({ c: g.sid || (sysOf(g) || {}).id, p: g.path }) }); } catch (e) { toast(e.message, true); return; }
  if (!r || !r.ok || VP.g !== g) return;
  const x = { name: r.name, path: r.path }; VP.subs.push(x); vpAddTrack(g, x); vpSetSub(VP.subs.length - 1); vpOsd('Legenda: ' + r.name);
}
function vpSetSub(k) {
  const tr = [...$('vpV').textTracks]; VP.sub = k;
  if (k >= 0 && VP.subs[k] && VP.subs[k].text === false) { vpOsd('Legenda em imagem (PGS) — não suportada'); return; }
  if (k >= 0 && VP.subs[k] && VP.subs[k].emb != null && !VP.subs[k]._ld) { VP.subs[k]._ld = 1; vpOsd('Carregando legenda do arquivo…'); }
  tr.forEach((t, i) => { t.mode = i === k ? 'hidden' : 'disabled'; t.oncuechange = i === k ? vpCues : null; });   // legenda desenhada pelo Koru
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
  const tag = x => x.path ? ' <small>arquivo escolhido</small>' : x.emb != null ? (x.text === false ? ' <small>no vídeo · imagem, não suportada</small>' : ' <small>no vídeo</small>') : ' <small>' + esc(x.file.split('.').pop()) + '</small>';
  m.innerHTML = `<div class="vpmi${VP.sub < 0 ? ' on' : ''}" data-k="-1">Desligadas</div>` + VP.subs.map((x, i) => `<div class="vpmi${VP.sub === i ? ' on' : ''}${x.text === false ? ' dim' : ''}" data-k="${i}">${esc(x.name)}${tag(x)}</div>`).join('') + `<div class="vpmi pick" data-k="pick">📂 Escolher arquivo de legenda…</div>`;
  m.querySelectorAll('[data-k]').forEach(x => x.onclick = e => { e.stopPropagation(); m.classList.remove('on'); if (x.dataset.k === 'pick') vpPickSub(); else vpSetSub(+x.dataset.k); });
}
function vpSubStyle(s) {
  let st = $('vpCue'); if (!st) { st = document.createElement('style'); st.id = 'vpCue'; document.head.appendChild(st); }
  const col = s.subColor === 'yellow' ? '#FFE14D' : s.subColor === 'cyan' ? '#7FE7FF' : '#fff', sz = (+s.subSize || 46) / 46 * 2.6, bg = s.subBg || 'outline';
  st.textContent = `#vpCues span { font: 600 ${sz.toFixed(2)}vw/1.25 "Segoe UI", sans-serif; color:${col}; background:${bg === 'box' ? 'rgba(0,0,0,.72)' : 'transparent'}; text-shadow:${bg === 'box' ? 'none' : bg === 'shadow' ? '2px 2px 4px #000' : '0 0 3px #000, 0 0 3px #000, 0 0 3px #000, 0 0 3px #000'}; }`;
}
async function vpAct(a) {
  const v = $('vpV'); vpShow();
  if (a === 'play') { if (v.paused) v.play().catch(() => {}); else v.pause(); vpFlash(v.paused ? 'pause' : 'play'); }
  else if (a === 'back') vpSeek(-10); else if (a === 'fwd') vpSeek(10);
  else if (a === 'mute') { v.muted = !v.muted; if (!v.muted && v.volume === 0) v.volume = .5; }
  else if (a === 'sub') { $('vpAuds').classList.remove('on'); $('vpSubs').classList.toggle('on'); }
  else if (a === 'aud') { $('vpSubs').classList.remove('on'); vpAudMenu(); $('vpAuds').classList.toggle('on'); }
  else if (a === 'audnext') { const n = VP.auds.length; if (n < 2) { vpOsd(n ? 'Só há uma faixa de áudio' : 'Sem informações de áudio'); return; } vpSetAud((VP.aud + 1) % n, true); }
  else if (a === 'subnext') { const n = VP.subs.length; if (!n) { vpOsd('Sem legendas'); return; } let k = VP.sub + 1; while (k < n && VP.subs[k].text === false) k++; if (k >= n) k = -1; vpSetSub(k); vpOsd(k < 0 ? 'Legendas desligadas' : 'Legenda: ' + VP.subs[k].name); }
  else if (a === 'asp') vpAspect(1);
  else if (a === 'bri') { vpBri(1); vpBriSlider(); }
  else if (a === 'full') { document.body.classList.toggle('vpfull'); if (host) host.postMessage('fs'); setTimeout(vpLayout, 300); }
  else if (a === 'close') vpClose();
  else if (a === 'max') { const el = $('vplayer'); el.classList.toggle('win'); el.classList.toggle('max', !el.classList.contains('win')); setTimeout(vpLayout, 260); }
  else if (a === 'prev') { const n = vpPrevOf(VP.g); if (!n) { vpOsd('Primeiro vídeo da lista'); return; } const j = shown.indexOf(n); if (j >= 0 && typeof selectGame === 'function') selectGame(j, true); vpTxStop(); openVPlayer(n); vpOsd('▶ ' + dn(n)); }
  else if (a === 'next') { vpTxStop(); const n = vpNextOf(VP.g); if (!n) { vpOsd('Último vídeo da lista'); return; } const v0 = $('vpV'); if (v0.currentTime > 5 && v0.duration && v0.currentTime < v0.duration - 10) try { localStorage.setItem('vpos|' + coverKey(VP.g), v0.currentTime); } catch (e) {} const j = shown.indexOf(n); if (j >= 0 && typeof selectGame === 'function') selectGame(j, true); openVPlayer(n); vpOsd('▶ ' + dn(n)); }
  else if (a === 'hq') {   // player avançado (mpv): formatos que o player rápido não toca
    if (!await mpvReady(true)) return;
    const g = VP.g, t = v.currentTime; vpClose();
    try { await api('/api/vplayer', { method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify({ console: g.sid || (sysOf(g) || {}).id, path: g.path, aspect: VP_ASPECTS[VP.aspect][0], aid: String((VP.aud || 0) + 1), start: String(Math.floor(t || 0)) }) }); }
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
     pgup: () => vpSeek(-60), pgdn: () => vpSeek(60), fav: () => vpAct('subnext'), menu: () => vpAct('audnext'), start: () => vpAct('full'), select: () => vpAct('mute'), search: () => vpAct('next'), lt: () => vpZoom(1 / 1.1), rt: () => vpZoom(1.1) }[a] || (() => {}))();
}
function vpKey(e) {
  const k = e.key, map = { ' ': 'play', k: 'play', K: 'play', ArrowLeft: 'back', ArrowRight: 'fwd', m: 'mute', M: 'mute', f: 'full', F: 'full', F11: 'full', s: 'subnext', S: 'subnext', a: 'audnext', A: 'audnext', b: 'bri', B: 'bri',  Escape: 'close', Backspace: 'close' };
  e.preventDefault();
  if (e.ctrlKey && k === 'ArrowRight') return vpAct('next');
  if (e.ctrlKey && k === 'ArrowLeft') return vpAct('prev');
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
function vpPrevOf(g) { const i = shown.indexOf(g); for (let k = i - 1; k >= 0; k--) { const s = sysOf(shown[k]) || {}; if (s.type === 'video') return shown[k]; } return null; }
function vpNextOf(g) { const i = shown.indexOf(g); if (i < 0) return null; for (let k = i + 1; k < shown.length; k++) { const s = sysOf(shown[k]) || {}; if (s.type === 'video') return shown[k]; } return null; }
// antes de excluir: fecha o player e a prévia (o Windows só deixa apagar arquivo que ninguém está usando)
function vpRelease() { try { if (VP.open) vpClose(); } catch (e) {} try { vpPrevStop(); const v = $('vpV'); if (v) { v.removeAttribute('src'); v.load(); } } catch (e) {} }

// brilho: vídeos HDR/Dolby Vision ficam escuros fora do modo HDR do Windows — compensa no próprio player (lembra por vídeo)
const VP_BRI = [1, 1.2, 1.4, 1.6, 1.8];
function vpBri(d) {
  if (d) { const i = VP_BRI.findIndex(x => Math.abs(x - VP.bri) < .01); VP.bri = VP_BRI[(i + 1) % VP_BRI.length]; try { localStorage.setItem('vbri|' + coverKey(VP.g), VP.bri); } catch (e) {} vpOsd('Brilho ' + Math.round(VP.bri * 100) + '%'); }
  $('vpV').style.filter = VP.bri !== 1 ? `brightness(${VP.bri}) contrast(${(1 + (VP.bri - 1) * .25).toFixed(2)}) saturate(${(1 + (VP.bri - 1) * .3).toFixed(2)})` : '';
  $('vpBri').querySelector('span').textContent = Math.round(VP.bri * 100) + '%';
}

// zoom de verdade (Ctrl+scroll / Ctrl + −): amplia o vídeo em volta do mouse; arrastar com o mouse move a imagem ampliada
function vpZoomApply() { const b = $('vplayer') && $('vplayer').querySelector('.vpbox'); if (!b) return; b.style.transform = `translate(-50%,-50%) translate(${VP.zx}px,${VP.zy}px) scale(${VP.zoom})`; }
function vpZoom(f, e) {
  if (!f) { VP.zoom = 1; VP.zx = VP.zy = 0; vpZoomApply(); vpOsd('Zoom 100%'); return; }
  const z0 = VP.zoom, z = Math.max(.25, Math.min(6, z0 * f));
  if (z <= 1) { VP.zx = VP.zy = 0; }
  else if (e) { const r = $('vplayer').querySelector('.vpframe').getBoundingClientRect(), mx = e.clientX - r.left - r.width / 2, my = e.clientY - r.top - r.height / 2; VP.zx = mx - (mx - VP.zx) * z / z0; VP.zy = my - (my - VP.zy) * z / z0; }
  VP.zoom = z; vpZoomApply(); vpOsd('Zoom ' + Math.round(z * 100) + '%');
}
(() => { let d = null; document.addEventListener('pointerdown', e => { if (!VP.open || VP.zoom <= 1 || !e.target.closest('.vpbox')) return; d = { x: e.clientX, y: e.clientY, zx: VP.zx, zy: VP.zy, moved: false }; }, true);
  document.addEventListener('pointermove', e => { if (!d) return; const dx = e.clientX - d.x, dy = e.clientY - d.y; if (Math.abs(dx) + Math.abs(dy) > 4) d.moved = true; VP.zx = d.zx + dx; VP.zy = d.zy + dy; vpZoomApply(); });
  document.addEventListener('pointerup', e => { if (d && d.moved) { const v = $('vpV'); const st = e => { e.stopPropagation(); v.removeEventListener('click', st, true); }; v.addEventListener('click', st, true); } d = null; }); })();


// ícone de play/pause no centro ao pausar/retomar (some em 0,5 s)
function vpFlash(k) {
  let f = $('vpFlash'); if (!f) { f = document.createElement('div'); f.id = 'vpFlash'; $('vplayer').querySelector('.vpframe').appendChild(f); }
  f.innerHTML = VP_ICO[k]; f.classList.remove('go'); void f.offsetWidth; f.classList.add('go');
}

// primeiro quadro do vídeo (fundo dos Favoritos): lido pelo próprio player da página e guardado nesta sessão
const vFrames = new Map();
function videoFirstFrame(g) {
  const k = coverKey(g); if (vFrames.has(k)) return vFrames.get(k);
  const pr = new Promise(ok => {
    const v = document.createElement('video'); let done = false;
    const end = u => { if (done) return; done = true; clearTimeout(t); try { v.removeAttribute('src'); v.load(); } catch (e) {} ok(u); };
    const t = setTimeout(() => end(null), 8000);
    v.muted = true; v.preload = 'auto'; v.playsInline = true;
    v.onloadeddata = () => { try { const w = Math.min(1920, v.videoWidth), h = Math.round(w * v.videoHeight / v.videoWidth); if (!w || !h) return end(null);
      const c = document.createElement('canvas'); c.width = w; c.height = h; c.getContext('2d').drawImage(v, 0, 0, w, h); end(c.toDataURL('image/jpeg', .86)); } catch (e) { end(null); } };
    v.onerror = () => end(null);
    v.src = vpUrl(g, 'vfile');
  });
  vFrames.set(k, pr); pr.then(u => { if (!u) vFrames.delete(k); }); return pr;
}

// slider de brilho: aparece acima do botão por alguns segundos
function vpBriSlider() {
  const b = $('vpBri'); let w = $('vpBriS');
  if (!w) {
    w = document.createElement('div'); w.id = 'vpBriS'; w.innerHTML = '<input type="range" min="0.6" max="2" step="0.05" orient="vertical"><b></b>';
    b.parentNode.style.position = 'relative'; b.insertAdjacentElement('afterend', w);
    const r = w.querySelector('input');
    r.oninput = () => { VP.bri = +r.value; try { localStorage.setItem('vbri|' + coverKey(VP.g), VP.bri); } catch (e) {} vpBri(0); w.querySelector('b').textContent = Math.round(VP.bri * 100) + '%'; vpBriSlider.keep(); };
    w.onpointerenter = () => clearTimeout(vpBriSlider.t); w.onpointerleave = () => vpBriSlider.keep();
  }
  const rb = b.getBoundingClientRect(), rp = b.offsetParent.getBoundingClientRect();
  w.style.left = (rb.left - rp.left + rb.width / 2) + 'px';
  w.querySelector('input').value = VP.bri; w.querySelector('b').textContent = Math.round(VP.bri * 100) + '%';
  w.classList.add('on'); vpBriSlider.keep();
}
vpBriSlider.keep = () => { clearTimeout(vpBriSlider.t); vpBriSlider.t = setTimeout(() => { const w = $('vpBriS'); if (w) w.classList.remove('on'); }, 2500); };

// faixas de áudio: troca pela lista do próprio navegador; Dolby/DTS não tocam no player rápido → oferece o player avançado (mpv)
function vpSetAud(k, show) {
  const v = $('vpV'), x = VP.auds[k]; if (!x) return; VP.aud = k;
  const at = v.audioTracks; if (at && at.length) for (let i = 0; i < at.length; i++) at[i].enabled = i === k;
  $('vpAud').querySelector('span').textContent = (x.lang || x.name).toUpperCase().slice(0, 3);
  vpTxStop();
  if (!x.ok) { vpTxStart(k); return; }
  if (false) {
    $('vpMsg').innerHTML = `Áudio <b>${esc(x.name)}</b> (${esc(x.codec)}) não toca no player rápido.<br>${VP.auds.some(y => y.ok) ? 'Escolha outra faixa no botão de áudio, ou ' : ''}<button class="btn" id="vpHqA">Abrir no player avançado</button>`;
    $('vplayer').classList.add('fail'); $('vpHqA').onclick = () => vpAct('hq');
  } else if ($('vplayer').classList.contains('fail') && $('vpHqA')) { $('vplayer').classList.remove('fail'); $('vpMsg').textContent = ''; }
  if (show) vpOsd('Áudio: ' + x.name + ' · ' + x.codec + (at && at.length ? '' : ' (troca indisponível)'));
  vpAudMenu();
}
function vpAudMenu() {
  const m = $('vpAuds'); if (!m) return;
  m.innerHTML = VP.auds.length ? VP.auds.map((x, i) => `<div class="vpmi${VP.aud === i ? ' on' : ''}${x.ok ? '' : ' dim'}" data-k="${i}">${esc(x.name)} <small>${esc(x.codec)}${x.ok ? '' : ' · só no player avançado'}</small></div>`).join('') : '<div class="vpmi dim">Sem faixas de áudio identificadas</div>';
  m.querySelectorAll('[data-k]').forEach(el => el.onclick = e => { e.stopPropagation(); m.classList.remove('on'); vpSetAud(+el.dataset.k, true); });
}

/* ---------- Dolby Digital (Plus) / Atmos / TrueHD / DTS: som nativo — o mpv decodifica e toca o áudio original,
   sincronizado com o vídeo do player do Koru (sem conversão) ---------- */
let vpTx = null;
const audPost = b => api('/api/aud', { method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify(b) });
async function mpvAuto() {   // baixa o mpv sozinho na primeira vez (uma vez só)
  let st; try { st = await api('/api/mpv'); } catch (e) { return false; }
  if (st.installed && !st.busy) return true;
  if (!st.busy) { vpOsd('Preparando o som Dolby/DTS (uma vez só)…'); try { st = await api('/api/mpv', { method:'POST' }); } catch (e) { return false; } }
  while (true) {
    await new Promise(r => setTimeout(r, 800));
    try { st = await api('/api/mpv'); } catch (e) { return false; }
    if (st.error) { toast('Não foi possível preparar o som: ' + st.error, true); return false; }
    if (!st.busy) return !!st.installed;
    if (VP.open) vpOsd(`${st.step || 'Baixando…'} ${st.progress || 0}%`);
  }
}
function vpTxStop() {
  if (!vpTx) return; const t = vpTx; vpTx = null; t.dead = true; clearInterval(t.sync);
  const v = $('vpV'); ['seeked', 'play', 'pause', 'ratechange', 'volumechange'].forEach(ev => v.removeEventListener(ev, t.h[ev]));
  audPost({ op: 'stop' }).catch(() => {});
}
async function vpTxStart(k) {
  const g = VP.g, v = $('vpV'), x = VP.auds[k];
  vpOsd('Áudio ' + x.codec + '…');
  if (!await mpvAuto() || !VP.open || VP.g !== g || VP.aud !== k) return;
  const at = v.audioTracks; if (at && at.length) for (let i = 0; i < at.length; i++) at[i].enabled = false;   // o som vem do mpv
  const vol = () => v.muted ? 0 : Math.round(v.volume * 100);
  const t = vpTx = { k, g, dead: false, h: {}, speed: 1 };
  const r = await audPost({ op: 'start', c: g.sid || (sysOf(g) || {}).id, p: g.path, k: String(k), t: String(v.currentTime + .25), vol: String(vol()), paused: String(v.paused) }).catch(e => ({ error: e.message }));
  if (r.error) { vpOsd('Não foi possível tocar este áudio: ' + r.error); vpTx = null; return; }
  const cmd = c => audPost({ op: 'cmd', cmd: c }).catch(() => {});
  t.h.seeked = () => cmd(['seek', v.currentTime, 'absolute+exact']);
  t.h.play = () => { cmd(['seek', v.currentTime, 'absolute+exact']); cmd(['set_property', 'pause', false]); };
  t.h.pause = () => cmd(['set_property', 'pause', true]);
  t.h.ratechange = () => cmd(['set_property', 'speed', v.playbackRate]);
  t.h.volumechange = () => cmd(['set_property', 'volume', vol()]);
  ['seeked', 'play', 'pause', 'ratechange', 'volumechange'].forEach(ev => v.addEventListener(ev, t.h[ev]));
  // sincronia: diferença pequena = ajusta a velocidade de leve; grande = reposiciona o som
  t.sync = setInterval(async () => {
    if (t.dead || v.paused) return;
    let p; try { p = (await audPost({ op: 'pos' })).pos; } catch (e) { return; }
    if (t.dead || p == null || p < 0) return;
    const d = p - v.currentTime;
    if (Math.abs(d) > .35) { cmd(['seek', v.currentTime + .05, 'absolute+exact']); t.speed = 1; cmd(['set_property', 'speed', v.playbackRate]); }
    else { const sp = Math.abs(d) < .03 ? 1 : Math.max(.95, Math.min(1.05, 1 - d * .6)); if (Math.abs(sp - t.speed) > .004) { t.speed = sp; cmd(['set_property', 'speed', +(v.playbackRate * sp).toFixed(4)]); } }
  }, 700);
  vpOsd('Áudio: ' + x.name + ' · ' + x.codec);
}

// o vídeo é sempre o do player da página; o som que ele não toca vem do mpv (ver vpTxStart)
const VPV = () => $('vpV'); const VPM = null;
function vpMpvStop() {} function vpMpvRect() {}
