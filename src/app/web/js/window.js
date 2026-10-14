// Koru — window.js
/* ---------- janela (barra de título do Windows) + tela cheia com F11 / Alt+Enter ---------- */
const host = window.chrome && window.chrome.webview;
if (host) document.body.classList.add('host');
window.addEventListener('keydown', e => {
  if (e.key === 'F11' || (e.key === 'Enter' && e.altKey)) {
    e.preventDefault(); e.stopImmediatePropagation();
    if (host) host.postMessage('fs');
    else if (document.fullscreenElement) document.exitFullscreen(); else document.documentElement.requestFullscreen().catch(() => {});
  }
}, true);

/* ---------- jogo aberto: o app ignora teclado/controle até o jogo fechar ---------- */
let gameOn = false;
function setGameOn(on) {
  gameOn = on;
  if (on) { try { document.activeElement && document.activeElement.blur(); } catch (e) {} }
}
// mini busca da bandeja pede a capa: responde com a mesma capa usada aqui (resolve se ainda não tiver)
if (host) host.addEventListener('message', e => { if (typeof e.data !== 'string' || !e.data.startsWith('art:')) return; try {
  const o = JSON.parse(e.data.slice(4)), l = [].concat(typeof allGames !== 'undefined' && allGames || [], (typeof gameCache !== 'undefined' && gameCache[o.sid]) || []), g = l.find(x => (x.sid || o.sid) === o.sid && x.path === o.path) || o;
  const k = o.sid + '|' + o.path, man = covers[k];
  const send = box => host.postMessage('artres:' + JSON.stringify({ sid: o.sid, path: o.path, box: box || '' }));
  if (man) return send(man);
  resolveArt(g, true).then(a => send(a && a.box)).catch(() => send(''));
} catch (er) {} });
if (host) host.addEventListener('message', e => { if (typeof e.data === 'string' && e.data.startsWith('play:')) { try { const o = JSON.parse(e.data.slice(5)), l = [].concat(typeof allGames !== 'undefined' && allGames || [], typeof games !== 'undefined' && games || [], (typeof gameCache !== 'undefined' && gameCache[o.sid]) || []); openVPlayer(l.find(x => (x.sid || o.sid) === o.sid && x.path === o.path) || o); } catch (er) {} return; } if (e.data === 'game:on') setGameOn(true); else if (e.data === 'game:off') { setGameOn(false); setTimeout(refreshScreen, 250); } });
// voltou do jogo: redesenha a tela atual para recarregar capas, cards e fundos
function refreshScreen() {
  try {
    if (screen === 'favgrid') renderFavGrid();
    else if (screen === 'games' && shown[gIdx]) { lastArt = null; showArt(shown[gIdx]); }
    else if (screen === 'systems' && systems.length) renderSystems();
  } catch (e) {}
}
// clicar no app com o mouse = o usuário voltou de propósito
document.addEventListener('mousedown', () => { if (gameOn) { setGameOn(false); if (host) host.postMessage('gameoff'); } }, true);
