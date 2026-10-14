// Koru — systems.js
/* ---------- sistemas ---------- */
function renderSystems() {
  $('track').innerHTML = systems.map((s, i) => `<div class="sys" data-i="${i}">${logo(s)}</div>`).join('');
  // clique = escolher/entrar; arrastar para os lados = mudar a ordem dos consoles
  $('track').querySelectorAll('.sys').forEach(el => {
    let st = null;
    // arrastar até a borda: o carrossel anda sozinho
    const place = () => { if (!st) return; el.style.transform = `translateX(${st.dx + st.scroll * sysW()}px) scale(1.08)`; };
    const edge = () => {
      if (!st || !st.moved) return;
      const r = $('track').parentNode.getBoundingClientRect(), m = 110;
      const dir = st.cx > r.right - m ? 1 : st.cx < r.left + m ? -1 : 0;
      if (dir && sysIdx + dir >= 0 && sysIdx + dir < systems.length) { selectSystem(sysIdx + dir); st.scroll += dir; place(); }
    };
    el.onpointerdown = e => { if (e.button !== 0) return; st = { x: e.clientX, cx: e.clientX, dx: 0, i: +el.dataset.i, moved: false, scroll: 0, t: setInterval(edge, 200) }; el.setPointerCapture(e.pointerId); };
    el.onpointermove = e => {
      if (!st) return; st.dx = e.clientX - st.x; st.cx = e.clientX;
      if (Math.abs(st.dx) > 8) st.moved = true;
      if (st.moved) { el.style.transition = 'none'; place(); el.style.opacity = 1; el.style.zIndex = 5; el.style.cursor = 'grabbing'; }
    };
    el.onpointerup = e => {
      if (!st) return; const s0 = st; st = null; clearInterval(s0.t);
      if (!s0.moved) { if (s0.i === sysIdx) openSystem(); else selectSystem(s0.i); return; }
      const to = Math.max(0, Math.min(systems.length - 1, s0.i + Math.round((e.clientX - s0.x) / sysW()) + s0.scroll));
      if (to !== s0.i) { const [m] = systems.splice(s0.i, 1); systems.splice(to, 0, m); saveSysOrder(m); sfx('ok'); }
      sysIdx = to; renderSystems();
    };
  });
  selectSystem(sysIdx);
}
function sysW() { const el = $('track').querySelector('.sys'); return (el && el.offsetWidth) || 340; }
window.addEventListener('resize', () => { if (screen === 'systems' && systems.length) selectSystem(sysIdx); });
function selectSystem(i) {
  if (!systems.length) { $('track').innerHTML = ''; $('sysInfo').innerHTML = 'Nenhum console encontrado — abra a ⚙ configuração.'; return; }
  const prevIdx = sysIdx;
  sysIdx = Math.max(0, Math.min(systems.length - 1, i));
  const s = systems[sysIdx];
  const w = sysW(); $('track').style.transform = `translateX(${-(sysIdx * w + w / 2)}px)`;
  $('track').querySelectorAll('.sys').forEach((el, k) => el.classList.toggle('cur', k === sysIdx));
  $('prev').classList.toggle('off', sysIdx === 0); $('next').classList.toggle('off', sysIdx === systems.length - 1);
  setBgImage($('sysBg'), s.virtual ? (s.bg ? bgUrlOf(s) : FAV_BG) : bgUrlOf(s));
  $('sysCtrl').style.visibility = s.virtual ? 'hidden' : ''; if (!s.virtual) $('sysCtrl').src = ctrlImg(s);
  if (prevIdx !== sysIdx) sfx('move');
  const n = total(s);
  $('sysInfo').innerHTML = s.virtual ? `${n} jogo${n === 1 ? '' : 's'} favorito${n === 1 ? '' : 's'}` : `${n} jogo${n === 1 ? '' : 's'} disponíve${n === 1 ? 'l' : 'is'}` + (s.emulatorOk ? '' : ' · <span class="warn">sem emulador</span>');
  history.replaceState(null, '', '#');
}
async function openSystem(id) {
  sys = id ? systems.find(s => s.id === id) : systems[sysIdx];
  if (!sys) return;
  if (sys.virtual) { sysIdx = systems.indexOf(sys); return openFavorites(); }
  sysIdx = systems.indexOf(sys); globalMode = false; favMode = false; privOn = false; if (typeof favViewsPaint === 'function') favViewsPaint(); sfx('ok'); music.play(sys.type === 'pc' || sys.type === 'video' ? 'pc' : sys.id);
  show('games'); history.replaceState(null, '', '#' + sys.id);
  $('gHead').innerHTML = logo(sys);
  setBg(bgUrlOf(sys), '');
  $('q').value = ''; $('list').innerHTML = '<div class="empty">Carregando...</div>'; $('art').innerHTML = ''; $('details').innerHTML = '';
  games = await loadGames(sys.id);
  gIdx = 0; filter();
  loadThumbIndex(sys).then(() => { if (screen === 'games') selectGame(gIdx, true); });
}
async function loadGames(id) {
  if (!gameCache[id]) {
    let l = await api('/api/games?c=' + encodeURIComponent(id)); if (!Array.isArray(l)) l = [];
    l.forEach(g => { g.sid = id; g.cat = g.cat || ''; }); gameCache[id] = l;
  }
  return gameCache[id];
}
let globalMode = false, allGames = null, allSystems = [];
const CATS = ['Traduzidos', '', 'Hack / Mod', 'Homebrew / Port', 'Beta / Protótipo', 'Não licenciado', 'Ferramentas para jogos', 'Outros programas'];

const isCustom = g => { const c = ecat(g); return !!c && !['Traduzidos', 'Ferramentas para jogos', 'Outros programas'].includes(c); };
const total = s => s.count + (s.customCount || 0);
let favConsoleOn = true;
const FAV_BG = 'data:image/svg+xml;charset=utf-8,%3Csvg%20xmlns%3D%22http%3A//www.w3.org/2000/svg%22%20viewBox%3D%220%200%201600%20900%22%20preserveAspectRatio%3D%22xMidYMid%20slice%22%3E%3Cdefs%3E%3CradialGradient%20id%3D%22g%22%20cx%3D%2250%25%22%20cy%3D%2238%25%22%20r%3D%2275%25%22%3E%3Cstop%20offset%3D%220%22%20stop-color%3D%22%236b3d00%22/%3E%3Cstop%20offset%3D%22.45%22%20stop-color%3D%22%232a1640%22/%3E%3Cstop%20offset%3D%221%22%20stop-color%3D%22%230b0716%22/%3E%3C/radialGradient%3E%3C/defs%3E%3Crect%20width%3D%221600%22%20height%3D%22900%22%20fill%3D%22url%28%23g%29%22/%3E%3Cpath%20transform%3D%22translate%28663%20154%29%20scale%280.87%29%20rotate%286%29%22%20d%3D%22M0-10l3%207%207%201-5%205%201%207-6-3-6%203%201-7-5-5%207-1z%22%20fill%3D%22%23ffc940%22%20opacity%3D%220.10%22/%3E%3Cpath%20transform%3D%22translate%281097%2096%29%20scale%280.84%29%20rotate%287%29%22%20d%3D%22M0-10l3%207%207%201-5%205%201%207-6-3-6%203%201-7-5-5%207-1z%22%20fill%3D%22%23ffc940%22%20opacity%3D%220.33%22/%3E%3Cpath%20transform%3D%22translate%28439%2038%29%20scale%280.50%29%20rotate%2853%29%22%20d%3D%22M0-10l3%207%207%201-5%205%201%207-6-3-6%203%201-7-5-5%207-1z%22%20fill%3D%22%23ffc940%22%20opacity%3D%220.10%22/%3E%3Cpath%20transform%3D%22translate%28185%20564%29%20scale%280.91%29%20rotate%2815%29%22%20d%3D%22M0-10l3%207%207%201-5%205%201%207-6-3-6%203%201-7-5-5%207-1z%22%20fill%3D%22%23ffc940%22%20opacity%3D%220.34%22/%3E%3Cpath%20transform%3D%22translate%281291%20642%29%20scale%281.10%29%20rotate%287%29%22%20d%3D%22M0-10l3%207%207%201-5%205%201%207-6-3-6%203%201-7-5-5%207-1z%22%20fill%3D%22%23ffc940%22%20opacity%3D%220.24%22/%3E%3Cpath%20transform%3D%22translate%28812%2050%29%20scale%281.57%29%20rotate%285%29%22%20d%3D%22M0-10l3%207%207%201-5%205%201%207-6-3-6%203%201-7-5-5%207-1z%22%20fill%3D%22%23ffc940%22%20opacity%3D%220.23%22/%3E%3Cpath%20transform%3D%22translate%28272%20296%29%20scale%280.90%29%20rotate%2869%29%22%20d%3D%22M0-10l3%207%207%201-5%205%201%207-6-3-6%203%201-7-5-5%207-1z%22%20fill%3D%22%23ffc940%22%20opacity%3D%220.11%22/%3E%3Cpath%20transform%3D%22translate%28631%20573%29%20scale%281.38%29%20rotate%2823%29%22%20d%3D%22M0-10l3%207%207%201-5%205%201%207-6-3-6%203%201-7-5-5%207-1z%22%20fill%3D%22%23ffc940%22%20opacity%3D%220.11%22/%3E%3Cpath%20transform%3D%22translate%281169%20654%29%20scale%280.63%29%20rotate%2812%29%22%20d%3D%22M0-10l3%207%207%201-5%205%201%207-6-3-6%203%201-7-5-5%207-1z%22%20fill%3D%22%23ffc940%22%20opacity%3D%220.23%22/%3E%3Cpath%20transform%3D%22translate%28128%20577%29%20scale%280.47%29%20rotate%2826%29%22%20d%3D%22M0-10l3%207%207%201-5%205%201%207-6-3-6%203%201-7-5-5%207-1z%22%20fill%3D%22%23ffc940%22%20opacity%3D%220.21%22/%3E%3Cpath%20transform%3D%22translate%281088%20437%29%20scale%281.33%29%20rotate%2859%29%22%20d%3D%22M0-10l3%207%207%201-5%205%201%207-6-3-6%203%201-7-5-5%207-1z%22%20fill%3D%22%23ffc940%22%20opacity%3D%220.24%22/%3E%3Cpath%20transform%3D%22translate%28928%20370%29%20scale%280.76%29%20rotate%2823%29%22%20d%3D%22M0-10l3%207%207%201-5%205%201%207-6-3-6%203%201-7-5-5%207-1z%22%20fill%3D%22%23ffc940%22%20opacity%3D%220.27%22/%3E%3Cpath%20transform%3D%22translate%28499%2083%29%20scale%281.09%29%20rotate%2867%29%22%20d%3D%22M0-10l3%207%207%201-5%205%201%207-6-3-6%203%201-7-5-5%207-1z%22%20fill%3D%22%23ffc940%22%20opacity%3D%220.21%22/%3E%3Cpath%20transform%3D%22translate%28703%20746%29%20scale%280.94%29%20rotate%289%29%22%20d%3D%22M0-10l3%207%207%201-5%205%201%207-6-3-6%203%201-7-5-5%207-1z%22%20fill%3D%22%23ffc940%22%20opacity%3D%220.11%22/%3E%3Cpath%20transform%3D%22translate%28856%20168%29%20scale%281.31%29%20rotate%2819%29%22%20d%3D%22M0-10l3%207%207%201-5%205%201%207-6-3-6%203%201-7-5-5%207-1z%22%20fill%3D%22%23ffc940%22%20opacity%3D%220.33%22/%3E%3Cpath%20transform%3D%22translate%28863%2040%29%20scale%281.55%29%20rotate%289%29%22%20d%3D%22M0-10l3%207%207%201-5%205%201%207-6-3-6%203%201-7-5-5%207-1z%22%20fill%3D%22%23ffc940%22%20opacity%3D%220.29%22/%3E%3Cpath%20transform%3D%22translate%281173%20808%29%20scale%281.45%29%20rotate%2840%29%22%20d%3D%22M0-10l3%207%207%201-5%205%201%207-6-3-6%203%201-7-5-5%207-1z%22%20fill%3D%22%23ffc940%22%20opacity%3D%220.17%22/%3E%3Cpath%20transform%3D%22translate%28717%20608%29%20scale%281.00%29%20rotate%2858%29%22%20d%3D%22M0-10l3%207%207%201-5%205%201%207-6-3-6%203%201-7-5-5%207-1z%22%20fill%3D%22%23ffc940%22%20opacity%3D%220.10%22/%3E%3Cpath%20transform%3D%22translate%28191%20276%29%20scale%280.97%29%20rotate%288%29%22%20d%3D%22M0-10l3%207%207%201-5%205%201%207-6-3-6%203%201-7-5-5%207-1z%22%20fill%3D%22%23ffc940%22%20opacity%3D%220.10%22/%3E%3Cpath%20transform%3D%22translate%281436%20317%29%20scale%281.18%29%20rotate%2857%29%22%20d%3D%22M0-10l3%207%207%201-5%205%201%207-6-3-6%203%201-7-5-5%207-1z%22%20fill%3D%22%23ffc940%22%20opacity%3D%220.16%22/%3E%3Cpath%20transform%3D%22translate%28790%20684%29%20scale%280.82%29%20rotate%2859%29%22%20d%3D%22M0-10l3%207%207%201-5%205%201%207-6-3-6%203%201-7-5-5%207-1z%22%20fill%3D%22%23ffc940%22%20opacity%3D%220.18%22/%3E%3Cpath%20transform%3D%22translate%281251%20119%29%20scale%280.99%29%20rotate%2827%29%22%20d%3D%22M0-10l3%207%207%201-5%205%201%207-6-3-6%203%201-7-5-5%207-1z%22%20fill%3D%22%23ffc940%22%20opacity%3D%220.29%22/%3E%3Cpath%20transform%3D%22translate%28264%20756%29%20scale%280.70%29%20rotate%2850%29%22%20d%3D%22M0-10l3%207%207%201-5%205%201%207-6-3-6%203%201-7-5-5%207-1z%22%20fill%3D%22%23ffc940%22%20opacity%3D%220.33%22/%3E%3Cpath%20transform%3D%22translate%281016%2082%29%20scale%280.60%29%20rotate%2851%29%22%20d%3D%22M0-10l3%207%207%201-5%205%201%207-6-3-6%203%201-7-5-5%207-1z%22%20fill%3D%22%23ffc940%22%20opacity%3D%220.23%22/%3E%3Cpath%20transform%3D%22translate%28280%20838%29%20scale%280.92%29%20rotate%2870%29%22%20d%3D%22M0-10l3%207%207%201-5%205%201%207-6-3-6%203%201-7-5-5%207-1z%22%20fill%3D%22%23ffc940%22%20opacity%3D%220.16%22/%3E%3Cpath%20transform%3D%22translate%28850%20367%29%20scale%281.22%29%20rotate%2848%29%22%20d%3D%22M0-10l3%207%207%201-5%205%201%207-6-3-6%203%201-7-5-5%207-1z%22%20fill%3D%22%23ffc940%22%20opacity%3D%220.34%22/%3E%3Cpath%20transform%3D%22translate%28309%2084%29%20scale%280.61%29%20rotate%2829%29%22%20d%3D%22M0-10l3%207%207%201-5%205%201%207-6-3-6%203%201-7-5-5%207-1z%22%20fill%3D%22%23ffc940%22%20opacity%3D%220.26%22/%3E%3Cpath%20transform%3D%22translate%2824%20496%29%20scale%281.40%29%20rotate%2823%29%22%20d%3D%22M0-10l3%207%207%201-5%205%201%207-6-3-6%203%201-7-5-5%207-1z%22%20fill%3D%22%23ffc940%22%20opacity%3D%220.15%22/%3E%3Cpath%20transform%3D%22translate%288%20149%29%20scale%280.90%29%20rotate%2847%29%22%20d%3D%22M0-10l3%207%207%201-5%205%201%207-6-3-6%203%201-7-5-5%207-1z%22%20fill%3D%22%23ffc940%22%20opacity%3D%220.24%22/%3E%3Cpath%20transform%3D%22translate%28652%20128%29%20scale%281.23%29%20rotate%2865%29%22%20d%3D%22M0-10l3%207%207%201-5%205%201%207-6-3-6%203%201-7-5-5%207-1z%22%20fill%3D%22%23ffc940%22%20opacity%3D%220.34%22/%3E%3Cpath%20transform%3D%22translate%281341%20692%29%20scale%281.29%29%20rotate%2858%29%22%20d%3D%22M0-10l3%207%207%201-5%205%201%207-6-3-6%203%201-7-5-5%207-1z%22%20fill%3D%22%23ffc940%22%20opacity%3D%220.32%22/%3E%3Cpath%20transform%3D%22translate%281597%20895%29%20scale%281.22%29%20rotate%2850%29%22%20d%3D%22M0-10l3%207%207%201-5%205%201%207-6-3-6%203%201-7-5-5%207-1z%22%20fill%3D%22%23ffc940%22%20opacity%3D%220.19%22/%3E%3Cpath%20transform%3D%22translate%28807%20106%29%20scale%280.98%29%20rotate%2851%29%22%20d%3D%22M0-10l3%207%207%201-5%205%201%207-6-3-6%203%201-7-5-5%207-1z%22%20fill%3D%22%23ffc940%22%20opacity%3D%220.10%22/%3E%3Cpath%20transform%3D%22translate%28137%20213%29%20scale%280.93%29%20rotate%2814%29%22%20d%3D%22M0-10l3%207%207%201-5%205%201%207-6-3-6%203%201-7-5-5%207-1z%22%20fill%3D%22%23ffc940%22%20opacity%3D%220.17%22/%3E%3Cpath%20transform%3D%22translate%28107%20104%29%20scale%280.40%29%20rotate%2819%29%22%20d%3D%22M0-10l3%207%207%201-5%205%201%207-6-3-6%203%201-7-5-5%207-1z%22%20fill%3D%22%23ffc940%22%20opacity%3D%220.22%22/%3E%3Cpath%20transform%3D%22translate%28744%20628%29%20scale%280.43%29%20rotate%2826%29%22%20d%3D%22M0-10l3%207%207%201-5%205%201%207-6-3-6%203%201-7-5-5%207-1z%22%20fill%3D%22%23ffc940%22%20opacity%3D%220.25%22/%3E%3Cpath%20transform%3D%22translate%28304%20649%29%20scale%280.70%29%20rotate%2844%29%22%20d%3D%22M0-10l3%207%207%201-5%205%201%207-6-3-6%203%201-7-5-5%207-1z%22%20fill%3D%22%23ffc940%22%20opacity%3D%220.24%22/%3E%3Cpath%20transform%3D%22translate%28971%20125%29%20scale%280.54%29%20rotate%2862%29%22%20d%3D%22M0-10l3%207%207%201-5%205%201%207-6-3-6%203%201-7-5-5%207-1z%22%20fill%3D%22%23ffc940%22%20opacity%3D%220.35%22/%3E%3Cpath%20transform%3D%22translate%28954%20491%29%20scale%280.98%29%20rotate%2810%29%22%20d%3D%22M0-10l3%207%207%201-5%205%201%207-6-3-6%203%201-7-5-5%207-1z%22%20fill%3D%22%23ffc940%22%20opacity%3D%220.12%22/%3E%3Cpath%20transform%3D%22translate%281535%20350%29%20scale%281.29%29%20rotate%2861%29%22%20d%3D%22M0-10l3%207%207%201-5%205%201%207-6-3-6%203%201-7-5-5%207-1z%22%20fill%3D%22%23ffc940%22%20opacity%3D%220.30%22/%3E%3Cpath%20transform%3D%22translate%28330%20528%29%20scale%280.43%29%20rotate%2867%29%22%20d%3D%22M0-10l3%207%207%201-5%205%201%207-6-3-6%203%201-7-5-5%207-1z%22%20fill%3D%22%23ffc940%22%20opacity%3D%220.18%22/%3E%3Cpath%20transform%3D%22translate%281413%20556%29%20scale%281.50%29%20rotate%2867%29%22%20d%3D%22M0-10l3%207%207%201-5%205%201%207-6-3-6%203%201-7-5-5%207-1z%22%20fill%3D%22%23ffc940%22%20opacity%3D%220.16%22/%3E%3Cpath%20transform%3D%22translate%281316%20884%29%20scale%280.51%29%20rotate%2833%29%22%20d%3D%22M0-10l3%207%207%201-5%205%201%207-6-3-6%203%201-7-5-5%207-1z%22%20fill%3D%22%23ffc940%22%20opacity%3D%220.22%22/%3E%3Cpath%20transform%3D%22translate%28342%20364%29%20scale%281.33%29%20rotate%2868%29%22%20d%3D%22M0-10l3%207%207%201-5%205%201%207-6-3-6%203%201-7-5-5%207-1z%22%20fill%3D%22%23ffc940%22%20opacity%3D%220.23%22/%3E%3Cpath%20transform%3D%22translate%281029%20337%29%20scale%281.16%29%20rotate%2824%29%22%20d%3D%22M0-10l3%207%207%201-5%205%201%207-6-3-6%203%201-7-5-5%207-1z%22%20fill%3D%22%23ffc940%22%20opacity%3D%220.30%22/%3E%3Cpath%20transform%3D%22translate%28820%20757%29%20scale%281.36%29%20rotate%2825%29%22%20d%3D%22M0-10l3%207%207%201-5%205%201%207-6-3-6%203%201-7-5-5%207-1z%22%20fill%3D%22%23ffc940%22%20opacity%3D%220.22%22/%3E%3Cpath%20transform%3D%22translate%28728%20748%29%20scale%280.43%29%20rotate%283%29%22%20d%3D%22M0-10l3%207%207%201-5%205%201%207-6-3-6%203%201-7-5-5%207-1z%22%20fill%3D%22%23ffc940%22%20opacity%3D%220.29%22/%3E%3Cpath%20transform%3D%22translate%28967%20265%29%20scale%280.63%29%20rotate%2844%29%22%20d%3D%22M0-10l3%207%207%201-5%205%201%207-6-3-6%203%201-7-5-5%207-1z%22%20fill%3D%22%23ffc940%22%20opacity%3D%220.20%22/%3E%3Cpath%20transform%3D%22translate%281480%20357%29%20scale%281.55%29%20rotate%2846%29%22%20d%3D%22M0-10l3%207%207%201-5%205%201%207-6-3-6%203%201-7-5-5%207-1z%22%20fill%3D%22%23ffc940%22%20opacity%3D%220.10%22/%3E%3Cpath%20transform%3D%22translate%28209%20232%29%20scale%280.96%29%20rotate%2843%29%22%20d%3D%22M0-10l3%207%207%201-5%205%201%207-6-3-6%203%201-7-5-5%207-1z%22%20fill%3D%22%23ffc940%22%20opacity%3D%220.14%22/%3E%3Cpath%20transform%3D%22translate%281278%20624%29%20scale%281.41%29%20rotate%2861%29%22%20d%3D%22M0-10l3%207%207%201-5%205%201%207-6-3-6%203%201-7-5-5%207-1z%22%20fill%3D%22%23ffc940%22%20opacity%3D%220.33%22/%3E%3Cpath%20transform%3D%22translate%28704%20818%29%20scale%281.17%29%20rotate%2815%29%22%20d%3D%22M0-10l3%207%207%201-5%205%201%207-6-3-6%203%201-7-5-5%207-1z%22%20fill%3D%22%23ffc940%22%20opacity%3D%220.33%22/%3E%3Cpath%20transform%3D%22translate%281457%20768%29%20scale%280.64%29%20rotate%2822%29%22%20d%3D%22M0-10l3%207%207%201-5%205%201%207-6-3-6%203%201-7-5-5%207-1z%22%20fill%3D%22%23ffc940%22%20opacity%3D%220.20%22/%3E%3Cpath%20transform%3D%22translate%281302%20340%29%20scale%280.50%29%20rotate%2850%29%22%20d%3D%22M0-10l3%207%207%201-5%205%201%207-6-3-6%203%201-7-5-5%207-1z%22%20fill%3D%22%23ffc940%22%20opacity%3D%220.21%22/%3E%3Cpath%20transform%3D%22translate%281522%2086%29%20scale%281.27%29%20rotate%2821%29%22%20d%3D%22M0-10l3%207%207%201-5%205%201%207-6-3-6%203%201-7-5-5%207-1z%22%20fill%3D%22%23ffc940%22%20opacity%3D%220.35%22/%3E%3Cpath%20transform%3D%22translate%2856%20154%29%20scale%281.11%29%20rotate%2859%29%22%20d%3D%22M0-10l3%207%207%201-5%205%201%207-6-3-6%203%201-7-5-5%207-1z%22%20fill%3D%22%23ffc940%22%20opacity%3D%220.30%22/%3E%3Cpath%20transform%3D%22translate%28299%20626%29%20scale%281.39%29%20rotate%2860%29%22%20d%3D%22M0-10l3%207%207%201-5%205%201%207-6-3-6%203%201-7-5-5%207-1z%22%20fill%3D%22%23ffc940%22%20opacity%3D%220.26%22/%3E%3Cpath%20transform%3D%22translate%28717%20159%29%20scale%281.06%29%20rotate%2816%29%22%20d%3D%22M0-10l3%207%207%201-5%205%201%207-6-3-6%203%201-7-5-5%207-1z%22%20fill%3D%22%23ffc940%22%20opacity%3D%220.09%22/%3E%3Cpath%20transform%3D%22translate%281487%20665%29%20scale%280.52%29%20rotate%2817%29%22%20d%3D%22M0-10l3%207%207%201-5%205%201%207-6-3-6%203%201-7-5-5%207-1z%22%20fill%3D%22%23ffc940%22%20opacity%3D%220.20%22/%3E%3Cpath%20transform%3D%22translate%28398%20845%29%20scale%281.45%29%20rotate%283%29%22%20d%3D%22M0-10l3%207%207%201-5%205%201%207-6-3-6%203%201-7-5-5%207-1z%22%20fill%3D%22%23ffc940%22%20opacity%3D%220.15%22/%3E%3Cpath%20transform%3D%22translate%28599%20513%29%20scale%280.69%29%20rotate%2841%29%22%20d%3D%22M0-10l3%207%207%201-5%205%201%207-6-3-6%203%201-7-5-5%207-1z%22%20fill%3D%22%23ffc940%22%20opacity%3D%220.15%22/%3E%3Cpath%20transform%3D%22translate%28858%20854%29%20scale%280.56%29%20rotate%2845%29%22%20d%3D%22M0-10l3%207%207%201-5%205%201%207-6-3-6%203%201-7-5-5%207-1z%22%20fill%3D%22%23ffc940%22%20opacity%3D%220.32%22/%3E%3Cpath%20transform%3D%22translate%281356%20597%29%20scale%281.38%29%20rotate%2866%29%22%20d%3D%22M0-10l3%207%207%201-5%205%201%207-6-3-6%203%201-7-5-5%207-1z%22%20fill%3D%22%23ffc940%22%20opacity%3D%220.19%22/%3E%3Cpath%20transform%3D%22translate%281027%20133%29%20scale%281.04%29%20rotate%2867%29%22%20d%3D%22M0-10l3%207%207%201-5%205%201%207-6-3-6%203%201-7-5-5%207-1z%22%20fill%3D%22%23ffc940%22%20opacity%3D%220.22%22/%3E%3Cpath%20transform%3D%22translate%28901%20795%29%20scale%280.62%29%20rotate%280%29%22%20d%3D%22M0-10l3%207%207%201-5%205%201%207-6-3-6%203%201-7-5-5%207-1z%22%20fill%3D%22%23ffc940%22%20opacity%3D%220.29%22/%3E%3Cpath%20transform%3D%22translate%28306%20176%29%20scale%280.57%29%20rotate%2815%29%22%20d%3D%22M0-10l3%207%207%201-5%205%201%207-6-3-6%203%201-7-5-5%207-1z%22%20fill%3D%22%23ffc940%22%20opacity%3D%220.23%22/%3E%3Cpath%20transform%3D%22translate%28667%20698%29%20scale%281.02%29%20rotate%2861%29%22%20d%3D%22M0-10l3%207%207%201-5%205%201%207-6-3-6%203%201-7-5-5%207-1z%22%20fill%3D%22%23ffc940%22%20opacity%3D%220.29%22/%3E%3Cpath%20transform%3D%22translate%28217%20573%29%20scale%280.47%29%20rotate%2824%29%22%20d%3D%22M0-10l3%207%207%201-5%205%201%207-6-3-6%203%201-7-5-5%207-1z%22%20fill%3D%22%23ffc940%22%20opacity%3D%220.15%22/%3E%3Cpath%20transform%3D%22translate%281581%20100%29%20scale%281.01%29%20rotate%283%29%22%20d%3D%22M0-10l3%207%207%201-5%205%201%207-6-3-6%203%201-7-5-5%207-1z%22%20fill%3D%22%23ffc940%22%20opacity%3D%220.29%22/%3E%3Cpath%20transform%3D%22translate%28129%20453%29%20scale%280.79%29%20rotate%2864%29%22%20d%3D%22M0-10l3%207%207%201-5%205%201%207-6-3-6%203%201-7-5-5%207-1z%22%20fill%3D%22%23ffc940%22%20opacity%3D%220.24%22/%3E%3C/svg%3E';
const FAVSYS = { id: '__favs', name: 'Favoritos', virtual: true, art: '', logo: 'builtin:fav', emulatorOk: true, count: 0 };
try { if (!localStorage.getItem('favPos2')) { localStorage.removeItem('favPos'); localStorage.setItem('favPos2', '1'); } } catch (e) {}   // posição antiga podia estar errada (bug): volta ao padrão uma vez
function favPos() { try { const v = parseInt(localStorage.getItem('favPos')); return isNaN(v) || v < 0 ? 0 : v; } catch (e) { return 0; } }   // padrão: primeira posição
// favoritos válidos: jogo não oculto, console ativo e arquivo ainda existente (favoritos "órfãos" são limpos)
const favMissing = new Set();
function favKeys() {
  return Object.keys(covers).filter(k => {
    if (!k.startsWith('fav|') || covers[k] !== '1') return false;
    const gk = k.slice(4), sid = gk.split('|')[0], s = allSystems.find(x => x.id === sid);
    return s && s.enabled !== false && !hidden.has(gk) && !favMissing.has(gk);
  });
}
async function checkFavFiles() {
  const keys = Object.keys(covers).filter(k => k.startsWith('fav|') && covers[k] === '1');
  await Promise.all(keys.map(async k => {
    const gk = k.slice(4), p = gk.slice(gk.indexOf('|') + 1);
    try { const r = await api('/api/exists?p=' + encodeURIComponent(p)); if (!r.file && !r.dir) { favMissing.add(gk); delete covers[k]; api('/api/cover', { method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify({ key: k, url: '' }) }).catch(() => {}); } } catch (e) {}
  }));
  if (screen === 'systems') applyCustom();
}
function applyCustom() {
  const cur = systems[sysIdx] && systems[sysIdx].id;
  systems = allSystems.filter(s => s.enabled !== false);   // todo console habilitado aparece, mesmo sem jogos encontrados
  FAVSYS.count = favKeys().length;
  if (favConsoleOn && FAVSYS.count > 0) systems.splice(Math.min(favPos(), systems.length), 0, FAVSYS);   // console virtual "Favoritos" (some quando não há favoritos)
  const k = systems.findIndex(s => s.id === cur); sysIdx = k >= 0 ? k : Math.min(sysIdx, systems.length - 1);
  renderSystems();
}
async function openGlobal(text, fav) {
  favMode = !!fav; if (fav) sfx('ok'); if (typeof favViewsPaint === 'function') setTimeout(favViewsPaint, 0);
  globalMode = true; show('games'); history.replaceState(null, '', fav ? '#favoritos' : '#busca');
  $('gHead').innerHTML = fav ? logo(FAVSYS) : '<div class="gtitle">🔍 Todos os jogos</div>';
  setBg(fav ? (FAVSYS.bg ? bgUrlOf(FAVSYS) : FAV_BG) : '', '');
  $('q').value = text; if (!fav) $('q').focus();
  if (!allGames) {
    $('list').innerHTML = '<div class="empty">Carregando todos os jogos...</div>';
    const lists = await Promise.all(allSystems.map(s => loadGames(s.id).catch(() => [])));
    allGames = [].concat(...lists).sort((a, b) => a.name.localeCompare(b.name, 'pt', { sensitivity:'base' }));
  }
  if (globalMode) filter();
}
function back() { stopVideo(); favMode = false; applyCustom(); sfx('back'); music.play('home'); globalMode = false; show('systems'); sys = null; selectSystem(sysIdx); }

// grava a ordem atual dos consoles (e a posição do Favoritos, se foi ele que mudou)
function saveSysOrder(m) {
  if (m === FAVSYS) try { localStorage.setItem('favPos', String(systems.indexOf(FAVSYS))); } catch (e) {}
  const order = systems.filter(x => !x.virtual).map(x => x.id).concat(allSystems.filter(x => !systems.includes(x)).map(x => x.id));
  allSystems.sort((a, b) => order.indexOf(a.id) - order.indexOf(b.id));
  api('/api/order', { method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify({ ids: order }) }).catch(e => toast(e.message, true));
}
// mover console com o controle: □ levanta, ←/→ leva, □ (ou ✕) solta, ○ desiste
let sysMoving = null;
function sysMoveInput(a) {
  if (!sysMoving) { if (a !== 'fav' || !systems[sysIdx]) return false; sysMoving = { order: systems.slice(), idx: sysIdx }; sysLift(); sfx('ok'); return true; }
  if (a === 'left' || a === 'right') {
    const to = sysIdx + (a === 'left' ? -1 : 1); if (to < 0 || to >= systems.length) return true;
    const [m] = systems.splice(sysIdx, 1); systems.splice(to, 0, m); sysIdx = to; renderSystems(); sysLift(); sfx('move'); return true;
  }
  if (a === 'fav' || a === 'ok') { const m = systems[sysIdx]; sysMoving = null; saveSysOrder(m); renderSystems(); sfx('ok'); return true; }
  if (a === 'back') { systems = sysMoving.order; sysIdx = sysMoving.idx; sysMoving = null; renderSystems(); sfx('back'); return true; }
  return true;
}
function sysLift() { const el = $('track').querySelector(`.sys[data-i="${sysIdx}"]`); if (el) el.classList.add('lift'); }
