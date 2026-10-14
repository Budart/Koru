// Koru — config.js
/* ---------- SteamGridDB: ajuda + links (abrem no navegador) ---------- */
const SGDB_HELP = `<div class="sghelp">O <b>SteamGridDB</b> é um site gratuito, feito pela comunidade, com milhares de capas, fundos e logos de jogos em alta qualidade. Para o Koru buscar essas imagens, você precisa de uma <b>chave da API</b> (gratuita):
  <ol><li>Entre no site com a sua conta Steam: <a data-href="https://www.steamgriddb.com/login">steamgriddb.com/login</a></li>
  <li>Abra <a data-href="https://www.steamgriddb.com/profile/preferences/api">Preferências → API</a> e clique em <b>Generate API Key</b>.</li>
  <li>Copie a chave e cole no campo abaixo.</li></ol></div>`;
function bindLinks(root) { root.querySelectorAll('a[data-href]').forEach(a => a.onclick = e => { e.preventDefault(); api('/api/open', { method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify({ url: a.dataset.href }) }).catch(() => {}); }); }

/* ---------- tela de configuração ---------- */
let cfg = null;
async function openConfig() {
  show('config'); history.replaceState(null, '', '/config');
  $('cfBody').innerHTML = '<div class="empty">Carregando...</div>';
  try { cfg = await api('/api/config'); cfgSaved = cfgJson(); } catch (e) { $('cfBody').innerHTML = `<div class="empty">Erro: ${esc(e.message)}</div>`; return; }
  renderConfig();
}
function fieldHtml(i, key, label, val, browse, multi) {
  const inp = multi ? `<textarea data-i="${i}" data-k="${key}" rows="2">${esc(val)}</textarea>` : `<input data-i="${i}" data-k="${key}" value="${esc(val)}">`;
  return `<div class="fld"><label>${label}</label><div class="line">${inp}${browse ? `<button class="btn sec sm" data-browse="${browse}" data-i="${i}" data-k="${key}">Procurar...</button>` : ''}${key === 'emulator' ? `<span class="st" id="st${i}"></span>` : ''}</div></div>`;
}
const CF_SECS = [['geral', 'Geral'], ['consoles', 'Consoles'], ['capas', 'Capas e vídeo'], ['favoritos', 'Favoritos'], ['sobre', 'Sobre e créditos']];
let cfSec = 'geral';
// créditos e licenças (as imagens do tema carbon são CC BY-NC-SA: exigem atribuição)
const CREDITS = [
  ['mpv', 'mpv-player', 'Player de vídeo usado em Filmes e vídeos (baixado do site oficial na primeira vez).', [['mpv.io', 'https://mpv.io']]],
  ['Tema "carbon" para EmulationStation', 'Rookervik — baseado no tema "simple" de Nils Bonenberger', 'Logos, fundos e desenhos de controle dos consoles. Licença CC BY-NC-SA (atribuição, uso não comercial, compartilha igual). As imagens são exibidas sem alteração de conteúdo (apenas redimensionadas/recortadas na tela).', [['Repositório (fabricecaruso)', 'https://github.com/fabricecaruso/es-theme-carbon'], ['Repositório (RetroPie, reserva)', 'https://github.com/RetroPie/es-theme-carbon'], ['Licença CC BY-NC-SA', 'https://creativecommons.org/licenses/by-nc-sa/4.0/deed.pt_BR']]],
  ['libretro-thumbnails', 'Projeto libretro / RetroArch e colaboradores', 'Capas, telas e títulos de jogos.', [['Repositório', 'https://github.com/libretro-thumbnails/libretro-thumbnails']]],
  ['SteamGridDB', 'Comunidade SteamGridDB', 'Capas, fundos e logos (opcional, com a sua chave da API).', [['Site', 'https://www.steamgriddb.com/']]],
  ['GameTDB', 'GameTDB', 'Capas de jogos de GameCube, Wii, Wii U, 3DS e DS.', [['Site', 'https://www.gametdb.com/']]],
  ['Steam', 'Valve Corporation', 'Capas e fundos de jogos de PC.', [['Loja', 'https://store.steampowered.com/']]],
  ['Fandom, PCGamingWiki, StrategyWiki e Wikipédia', 'Comunidades de cada wiki', 'Capas encontradas pelas APIs públicas das wikis.', [['PCGamingWiki', 'https://www.pcgamingwiki.com/'], ['StrategyWiki', 'https://strategywiki.org/'], ['Wikipédia', 'https://pt.wikipedia.org/']]],
  ['YouTube', 'Google', 'Vídeos de gameplay exibidos pelo player oficial incorporado.', [['Termos do YouTube', 'https://www.youtube.com/t/terms']]],
  ['Fonte Poppins', 'Indian Type Foundry', 'Licença SIL Open Font License 1.1.', [['Google Fonts', 'https://fonts.google.com/specimen/Poppins']]],
  ['Microsoft Edge WebView2', 'Microsoft', 'Motor da janela do aplicativo.', [['Documentação', 'https://developer.microsoft.com/microsoft-edge/webview2/']]],
];
function creditsHtml() {
  return `<div class="cfcache"><h3>Koru</h3><div class="msg">Front-end para os seus emuladores e jogos. Os jogos, capas, logos e vídeos pertencem aos seus respectivos donos; o Koru apenas os exibe a partir das fontes abaixo.</div></div>` +
    CREDITS.map(([t, by, what, links]) => `<div class="cfcache cred"><h3>${esc(t)}</h3><div class="by">${esc(by)}</div><div class="msg">${esc(what)}</div><div class="line">${links.map(([l, u]) => `<button class="btn sec sm" data-href="${esc(u)}">🔗 ${esc(l)}</button>`).join('')}</div></div>`).join('') +
    `<div class="cfcache"><h3>Marcas registradas</h3><div class="msg">Nintendo, PlayStation, Xbox, Sega, Neo Geo, Steam e demais nomes e logos de consoles são marcas registradas de seus respectivos donos e aparecem apenas para identificar cada plataforma. O Koru não é afiliado a nenhuma delas.</div></div>`;
}
// opções com desenho ilustrativo (o rádio fica escondido; o cartão inteiro é clicável)
const langPv = t => `<svg viewBox="0 0 120 70"><rect width="120" height="70" rx="8" fill="#111a2e"/><text x="60" y="46" text-anchor="middle" font-size="28" font-weight="700" fill="#3D7BFF" font-family="Poppins,sans-serif">${t}</text></svg>`;
const freePv = () => `<svg viewBox="0 0 112 78"><rect width="112" height="78" rx="6" fill="#14161c"/>${[[6,6,22,30],[31,6,40,22],[74,6,32,30],[31,31,18,24],[52,31,19,40],[6,39,22,33],[74,39,32,18]].map(([x, y, w, h]) => `<rect x="${x}" y="${y}" width="${w}" height="${h}" rx="3" fill="#23262e" stroke="#3D7BFF" stroke-opacity=".6"/>`).join('')}</svg>`;
const pick = (name, val, on, svg, title, sub) => `<label class="pick"><input type="radio" name="${name}" value="${val}" ${on ? 'checked' : ''}><div class="pv">${svg}</div><b>${title}</b><small>${sub || ''}</small></label>`;
const PV = {
  c3d: `<svg viewBox="0 0 120 90"><defs><linearGradient id="pf" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#2F6BFF"/><stop offset="1" stop-color="#3D7BFF"/></linearGradient></defs><path d="M38 14 L52 8 L52 82 L38 76 Z" fill="#0b0b0b"/><path d="M52 8 L96 16 L96 76 L52 82 Z" fill="url(#pf)" stroke="#0b0b0b" stroke-width="2"/><path d="M58 20 L90 25 M58 30 L84 34" stroke="#fff" stroke-opacity=".6" stroke-width="3" stroke-linecap="round"/><path d="M45 20 L45 70" stroke="#fff" stroke-opacity=".35" stroke-width="2"/></svg>`,
  c2d: `<svg viewBox="0 0 120 90"><defs><linearGradient id="pg" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#2F6BFF"/><stop offset="1" stop-color="#3D7BFF"/></linearGradient></defs><rect x="26" y="10" width="72" height="70" rx="5" fill="#0b0b0b"/><rect x="31" y="15" width="11" height="60" fill="#1d1d1d"/><path d="M36.5 22 L36.5 68" stroke="#fff" stroke-opacity=".4" stroke-width="2"/><rect x="43" y="15" width="50" height="60" fill="url(#pg)"/><path d="M49 26 H86 M49 35 H78" stroke="#fff" stroke-opacity=".6" stroke-width="3" stroke-linecap="round"/></svg>`,
  video: `<svg viewBox="0 0 120 90"><rect x="14" y="14" width="92" height="62" rx="6" fill="#23262e" stroke="#2F6BFF" stroke-width="2"/><circle cx="60" cy="45" r="15" fill="#ff2d2d"/><path d="M55 37 L68 45 L55 53 Z" fill="#fff"/><rect x="22" y="66" width="76" height="3" rx="1.5" fill="#475569"/><rect x="22" y="66" width="30" height="3" rx="1.5" fill="#3D7BFF"/></svg>`,
  image: `<svg viewBox="0 0 120 90"><rect x="14" y="14" width="92" height="62" rx="6" fill="#23262e" stroke="#2F6BFF" stroke-width="2"/><circle cx="84" cy="30" r="7" fill="#fbbf24"/><path d="M18 72 L46 40 L64 58 L76 48 L102 72 Z" fill="#2F6BFF"/></svg>`,
};
function themePv(bg, surf, acc, txt) {
  return `<svg viewBox="0 0 120 90"><rect x="8" y="8" width="104" height="74" rx="8" fill="${bg}" stroke="#475569" stroke-width="1"/><rect x="8" y="8" width="104" height="14" rx="8" fill="${surf}"/><rect x="16" y="30" width="40" height="8" rx="3" fill="${acc}"/><rect x="16" y="44" width="40" height="5" rx="2.5" fill="${txt}" opacity=".7"/><rect x="16" y="54" width="32" height="5" rx="2.5" fill="${txt}" opacity=".45"/><rect x="66" y="30" width="38" height="44" rx="5" fill="${surf}" stroke="${acc}" stroke-width="1.5"/></svg>`;
}
function gridPv(d) {
  const [R, C] = d.split('x').map(Number), W = 112, H = 78, g = 2.5, cw = (W - g * (C - 1)) / C, ch = (H - g * (R - 1)) / R;
  let s = '';
  for (let y = 0; y < R; y++) for (let x = 0; x < C; x++) s += `<rect x="${(4 + x * (cw + g)).toFixed(1)}" y="${(6 + y * (ch + g)).toFixed(1)}" width="${cw.toFixed(1)}" height="${ch.toFixed(1)}" rx="1.6" fill="${x < 2 && y < 2 ? '#3D7BFF' : '#2c3038'}"/>`;
  return `<svg viewBox="0 0 120 90">${s}</svg>`;
}
function renderConfig() {
  const cs = cfg.consoles;
  const sec = (id, title, html) => `<div class="cfsec${cfSec === id ? ' on' : ''}" data-sec="${id}"><h2>${title}</h2>${html}</div>`;
  $('cfBody').innerHTML = `<nav class="cfnav">${CF_SECS.map(([id, t]) => `<button class="${cfSec === id ? 'on' : ''}" data-nav="${id}">${t}</button>`).join('')}</nav><div class="cfmain" id="cfMain">` +
    sec('geral', '🚀 Geral', `<div class="cfcache"><h3>🎨 Tema</h3><div class="picks">${pick('thm', 'blue', !cfg.theme || cfg.theme === 'blue', themePv('#14161c', '#23262e', '#3D7BFF', '#E5E7EB'), 'Azul', 'padrão')}${pick('thm', 'oled', cfg.theme === 'oled', themePv('#000', '#0d0d0d', '#3D7BFF', '#E5E7EB'), 'Preto', 'ideal para telas OLED')}${pick('thm', 'light', cfg.theme === 'light', themePv('#F1F5F9', '#fff', '#2563EB', '#14161c'), 'Branco', 'claro')}</div><h3 style="margin-top:16px">🌐 Idioma</h3><div class="picks">${pick('lng', 'pt', LANG === 'pt', langPv('PT'), 'Português', '')}${pick('lng', 'en', LANG === 'en', langPv('EN'), 'Inglês', '')}${pick('lng', 'es', LANG === 'es', langPv('ES'), 'Espanhol', '')}</div></div><div class="cfcache"><h3>⌨ Busca rápida</h3><div class="msg">Atalho de teclado que abre a janelinha de busca de jogos e vídeos de qualquer lugar do Windows (mesmo com o Koru fechado na bandeja).</div><div class="line"><input id="cfHk" readonly value="${esc(cfg.miniHotkey == null ? 'Win+F' : cfg.miniHotkey || 'Desligado')}" style="width:220px;background:#101010;border:1px solid #333;color:#eee;border-radius:6px;padding:8px 10px;text-align:center;font-weight:600;cursor:pointer" title="Clique e aperte a combinação"><button class="btn sec sm" id="cfHkDef">Win+F</button><button class="btn sec sm" id="cfHkOff">Desligar</button></div><div class="msg" style="font-size:12px;opacity:.75">Clique no campo e aperte a combinação (precisa ter Win, Ctrl ou Alt). Com Win+F, o atalho do Windows para o Hub de Comentários deixa de funcionar.</div></div><div class="cfgen">
      ${fieldHtml(-1, 'root', 'Pasta dos emuladores e jogos', cfg.root || '', 'folder')}
    </div>
    <div class="cfcache">
      <h3>🚀 Inicialização</h3>
      <div class="line"><button class="btn sec sm" id="cfRedo">Refazer configuração inicial (detectar consoles de novo)</button></div>
      <label class="chk2"><input type="checkbox" id="cfAuto" ${cfg.autostart === false ? '' : 'checked'}> Abrir na inicialização do Windows (em segundo plano, perto do relógio)</label>
    </div>
    `) +
    sec('consoles', '🎮 Consoles e emuladores', `<div class="cfadd"><button class="btn sec" id="cfAdd">+ Adicionar console</button> <button class="btn sec" id="cfAddPc">+ Adicionar jogos de PC</button> <button class="btn sec" id="cfAddVid">+ Adicionar filmes e vídeos</button></div><div class="cfgrid">
      ${cs.map((c, i) => `
      <div class="ccard${c.enabled === false ? ' off' : ''}">
        <div class="top"><button class="icobtn" data-ico="${i}" title="Trocar ícone"><img src="${logoUrl(c)}" alt="" onerror="this.style.opacity=.2"><span>trocar ícone</span></button><button class="icobtn bgb" data-bgp="${i}" title="Trocar fundo do console" style="background-image:url('${bgUrlOf(c)}')"><span>trocar fundo</span></button><input data-i="${i}" data-k="name" value="${esc(c.name)}"><label class="chk2 en"><input type="checkbox" data-en="${i}" ${c.enabled === false ? '' : 'checked'}> Habilitar</label></div>
        <div class="icopick" id="ip${i}" style="display:none"></div>
        ${c.type === 'video' ? videoCardHtml(i, c) : c.type === 'pc' ? `<div class="msg">🖥 Jogos de PC — escolha uma ou mais pastas com atalhos (.lnk / .url / .exe) dos jogos instalados. Eles abrem direto, sem emulador.</div>` : fieldHtml(i, 'emulator', 'Emulador (.exe)', c.emulator || '', 'file') + fieldHtml(i, 'args', 'Argumentos — {rom} é trocado pelo caminho do jogo', c.args || '"{rom}"') + `<div class="fld"><label class="chk2"><input type="checkbox" data-fs="${i}" ${c.fullscreen === true ? 'checked' : ''}> Abrir os jogos em tela cheia</label></div>` + fieldHtml(i, 'fsArgs', 'Argumento de tela cheia deste emulador (vai antes dos argumentos)', c.fsArgs == null ? '' : c.fsArgs)}
        ${dirsHtml(i, c)}
        ${fieldHtml(i, 'extensions', c.type === 'video' ? 'Extensões dos vídeos (separadas por vírgula)' : 'Extensões dos jogos (separadas por vírgula)', (c.extensions || []).join(', '))}
        ${c.type === 'video' ? videoPrivHtml(i, c) : ''}
      </div>`).join('')}
    </div>`) +
    sec('capas', '🖼 Capas e vídeo', `<div class="cfcache">
      <h3>🎬 Fundo dos jogos</h3>
      <div class="picks">${pick('bgm', 'video', cfg.bgMode !== 'image', PV.video, 'Vídeo', 'gameplay do YouTube')}${pick('bgm', 'image', cfg.bgMode === 'image', PV.image, 'Imagem', 'tela ou arte do jogo')}</div>
      <label class="chk2" style="margin-top:12px"><input type="checkbox" id="cfVidSound" ${(() => vidPref('vidsound', '1') !== '0')() ? 'checked' : ''}> Som do vídeo</label>
    </div>
    <div class="cfcache">
      <h3>📦 Estilo das capas</h3>
      <div class="picks">${pick('cst', '3d', cfg.coverStyle !== '2d', PV.c3d, '3D', 'caixa girando')}${pick('cst', '2d', cfg.coverStyle === '2d', PV.c2d, '2D', 'encarte aberto, mais leve')}</div>
    </div>
    <div class="cfcache">
      <h3>💾 Cache</h3>
      <label class="chk2"><input type="checkbox" id="cfCacheOn" ${cfg.coverCache === false ? '' : 'checked'}> Salvar capas no computador (carregam na hora nas próximas vezes)</label>
      <div class="cclist">${[['covers', '🖼 Imagens das capas e logos'], ['bg', '🌄 Imagens de fundo'], ['search', '🔎 Resultados das buscas de capas e fundos'], ['videos', '🎬 Vídeos encontrados no YouTube'], ['thumbs', '📇 Índice de miniaturas (libretro)']].map(([k, t]) => `<div class="line ccrow"><span class="cct">${t}</span><span class="msg" data-ci="${k}"></span><button class="btn sec sm" data-cc="${k}">Limpar</button></div>`).join('')}</div>
      <h3 style="margin-top:14px">📌 Escolhas salvas</h3>
      <div class="cclist">${[['picks', '🖼 Capas, fundos e logos escolhidos manualmente'], ['frames', '🎯 Enquadramento (posição e zoom) das imagens']].map(([k, t]) => `<div class="line ccrow"><span class="cct">${t}</span><span class="msg" data-ci="${k}"></span><button class="btn sec sm" data-cp="${k}">Limpar</button></div>`).join('')}</div>
      <div class="msg">Para que as capas automáticas também sejam escolhidas de novo, limpe "Resultados das buscas".</div>
      <div class="line"><button class="btn sec sm" id="cfCacheClear">Limpar todo o cache</button><span class="msg" id="cfCacheInfo"></span></div>
    </div>
    <div class="cfcache">
      <h3>🎨 SteamGridDB (opcional)</h3>
      ${SGDB_HELP}
      <div class="line"><input id="cfSgKey" type="password" autocomplete="new-password" spellcheck="false" placeholder="Cole aqui a sua chave da API" value="${esc(cfg.sgdbKey || '')}" style="flex:1;background:#101010;border:1px solid #333;color:#eee;border-radius:6px;padding:8px 10px"><button class="btn sec sm" id="cfSgTest">Testar chave</button></div>
      <label class="chk2"><input type="checkbox" id="cfSgOn" ${cfg.useSgdb && cfg.sgdbKey ? 'checked' : ''}> Usar o SteamGridDB para capas, fundos e logos</label>
    </div>`) +
    sec('favoritos', '⭐ Favoritos', `<div class="cfcache"><h3>Grade dos favoritos</h3>
        <h3 style="margin-top:0">Organização dos cards</h3>
        <div class="picks">${pick('fgm', 'free', fgFree, freePv(), 'Livre', 'tamanho e posição à vontade (mais lenta)')}${pick('fgm', 'grid', !fgFree, gridPv('4x12'), 'Grade fixa', 'cards encaixados na grade (mais leve)')}</div>
        <div id="cfGridDim" style="display:${fgFree ? 'none' : ''}"><h3 style="margin-top:16px">Tamanho da grade</h3>
        <div class="picks">${['4x10', '4x12', '6x14'].map(d => pick('fgd', d, ((cfg.favGrid === '6x12' ? '6x14' : cfg.favGrid) || '4x12') === d, gridPv(d), d.replace('x', ' × '), d === '4x12' ? 'padrão' : (d === '6x14' ? 'mais jogos por página' : 'cards maiores'))).join('')}</div></div>
        <h3 style="margin-top:16px">Fundo da tela</h3>
        <div class="picks">${pick('fbg', '1', cfg.favBgGame !== false, PV.video.replace('#ff2d2d', '#2F6BFF'), 'Fundo do jogo', 'muda ao selecionar um card')}${pick('fbg', '0', cfg.favBgGame === false, PV.image, 'Fundo fixo', 'uma imagem que você escolhe')}</div>
        <div class="wpsearch" id="wpBox" style="display:${cfg.favBgGame === false ? '' : 'none'}"><div class="line wpbar"><span class="wpico">🔍</span><input id="wpQ" placeholder="Buscar imagem de fundo (ex.: montanhas, synthwave)" autocomplete="off"><button class="btn sec sm" id="wpGo">Buscar</button></div><div class="wpres" id="wpRes"><div class="msg">Escreva o que você quer e aperte Buscar. Só aparecem imagens grandes (resolução de wallpaper).</div></div></div>
        <div class="msg">Cada jogo favorito vira um card. Arraste um card para mudar de lugar (até para outra página), arraste a borda para mudar o tamanho (até a página inteira) ou use o botão direito → Redimensionar.</div></div><div class="cfgrid"><div class="ccard${favCfg().enabled ? '' : ' off'}">
        <div class="top"><button class="icobtn" data-ico="-2" title="Trocar ícone"><img src="${logoUrl(Object.assign({}, FAVSYS, { logo: favCfg().logo || 'builtin:fav' }))}" alt=""><span>trocar ícone</span></button><button class="icobtn bgb" data-bgp="-2" title="Trocar fundo" style="background-image:url('${favCfg().bg ? bgUrlOf({ bg: favCfg().bg }) : FAV_BG}')"><span>trocar fundo</span></button><input value="⭐ Favoritos" disabled><label class="chk2 en"><input type="checkbox" data-en="-2" ${favCfg().enabled ? 'checked' : ''}> Habilitar</label></div>
        <div class="icopick" id="ip-2" style="display:none"></div>
        <div class="msg">Grade com todos os jogos que você marcou com ⭐. Arraste na tela inicial para mudar a posição deste console.</div>
      </div></div>`) +
    sec('sobre', 'ℹ Sobre e créditos', creditsHtml()) + '</div>';
  $('cfBody').querySelectorAll('[data-nav]').forEach(b => b.onclick = () => { cfSec = b.dataset.nav; $('cfBody').querySelectorAll('[data-nav]').forEach(x => x.classList.toggle('on', x === b)); $('cfBody').querySelectorAll('.cfsec').forEach(s => s.classList.toggle('on', s.dataset.sec === cfSec)); $('cfMain').scrollTop = 0; sfx('tick'); });
  $('cfBody').querySelectorAll('input[name=lng]').forEach(r => r.onchange = () => { cfg.lang = r.value; setLang(r.value); sfx('ok'); });
  $('cfVidSound').onchange = e => { vidPrefSet('vidsound', e.target.checked ? '1' : '0'); vidApplySound(); };
  $('cfBody').querySelectorAll('input[name=thm]').forEach(r => r.onchange = () => { cfg.theme = r.value; applyTheme(r.value); });
  $('cfBody').querySelectorAll('input[name=fbg]').forEach(r => r.onchange = () => { cfg.favBgGame = r.value === '1'; favBgGame = cfg.favBgGame; $('wpBox').style.display = favBgGame ? 'none' : ''; });
  $('wpGo').onclick = () => wpSearch($('wpQ').value);
  $('wpQ').addEventListener('keydown', e => { if (e.key === 'Enter') { e.preventDefault(); e.stopPropagation(); wpSearch($('wpQ').value); } });
  $('cfBody').querySelectorAll('input[name=fgm]').forEach(r => r.onchange = async () => { const ok = await fgSetMode(r.value === 'free'); if (!ok) $('cfBody').querySelector(`input[name=fgm][value="${fgFree ? 'free' : 'grid'}"]`).checked = true; $('cfGridDim').style.display = fgFree ? 'none' : ''; });   // tamanho da grade só existe na grade fixa
  $('cfBody').querySelectorAll('input[name=fgd]').forEach(r => r.onchange = () => { cfg.favGrid = r.value; favGridDim = r.value; });
  $('cfBody').querySelectorAll('[data-k]').forEach(el => el.oninput = () => setField(+el.dataset.i, el.dataset.k, el.value));
  $('cfBody').querySelectorAll('[data-browse]').forEach(el => el.onclick = () => browse(el));
  dirsBind(); cfLoadStores();
  $('cfBody').querySelectorAll('[data-en]').forEach(el => el.onchange = () => {
    const i = +el.dataset.en;
    if (i === -2) favCfg().enabled = el.checked; else cfg.consoles[i].enabled = el.checked;
    el.closest('.ccard').classList.toggle('off', !el.checked);
  });
  $('cfBody').querySelectorAll('[data-del]').forEach(el => el.onclick = () => { if (confirmDel(+el.dataset.del)) { cfg.consoles.splice(+el.dataset.del, 1); renderConfig(); } });
  $('cfRedo').onclick = () => { if (confirm('Refazer a configuração inicial? Os consoles serão detectados de novo (capas, favoritos e ocultos são mantidos).')) location.href = '/welcome'; };
  $('cfBody').querySelectorAll('input[name=bgm]').forEach(r => r.onchange = () => { cfg.bgMode = r.value; });
  $('cfBody').querySelectorAll('input[name=cst]').forEach(r => r.onchange = () => { cfg.coverStyle = r.value; coverStyle2d = r.value === '2d'; });
  $('cfAuto').onchange = () => { cfg.autostart = $('cfAuto').checked; };
  $('cfSgKey').oninput = () => { cfg.sgdbKey = $('cfSgKey').value.trim(); if (!cfg.sgdbKey) { cfg.useSgdb = false; $('cfSgOn').checked = false; } };
  $('cfSgOn').onchange = () => { if ($('cfSgOn').checked && !cfg.sgdbKey) { $('cfSgOn').checked = false; toast('Cole a chave da API primeiro', true); return; } cfg.useSgdb = $('cfSgOn').checked; };
  $('cfSgTest').onclick = async () => { await saveCfg(); try { await api('/api/sgdb?p=' + encodeURIComponent('/api/v2/search/autocomplete/mario')); toast('Chave válida! ✓'); } catch (e) { toast('Chave inválida ou sem internet: ' + e.message, true); } };
  bindLinks($('cfBody'));
  $('cfBody').querySelectorAll('button[data-href]').forEach(b => b.onclick = () => api('/api/open', { method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify({ url: b.dataset.href }) }).catch(() => {}));
  $('cfBody').querySelectorAll('[data-fs]').forEach(el => el.onchange = () => { cfg.consoles[+el.dataset.fs].fullscreen = el.checked; });
  cfg.consoles.forEach(async (c, i) => { if (c.fsArgs == null && c.emulator && c.type !== 'pc' && c.type !== 'video') { try { const r = await api('/api/fsarg?emu=' + encodeURIComponent(c.emulator)); c.fsArgs = r.arg; const el = $('cfBody').querySelector(`[data-i="${i}"][data-k="fsArgs"]`); if (el) el.value = r.arg; } catch (e) {} } });
  { const hk = $('cfHk'), setHk = v => { cfg.miniHotkey = v; hk.value = v || 'Desligado'; hk.blur(); sfx('ok'); };
    hk.onfocus = () => { hk.value = 'Aperte a combinação...'; };
    hk.onblur = () => { hk.value = cfg.miniHotkey == null ? 'Win+F' : cfg.miniHotkey || 'Desligado'; };
    hk.onkeydown = e => { e.preventDefault(); e.stopPropagation(); const k = e.key; if (['Control', 'Alt', 'Shift', 'Meta', 'OS'].includes(k)) return; if (k === 'Escape') { hk.blur(); return; }
      const key = k === ' ' ? 'Espaço' : /^F\d{1,2}$/.test(k) ? k : k.length === 1 ? k.toUpperCase() : ''; if (!key || !(e.metaKey || e.ctrlKey || e.altKey)) { toast('Use Win, Ctrl ou Alt junto com uma letra, número ou F1–F24', true); return; }
      setHk([e.metaKey && 'Win', e.ctrlKey && 'Ctrl', e.altKey && 'Alt', e.shiftKey && 'Shift', key].filter(Boolean).join('+')); };
    $('cfHkDef').onclick = () => setHk('Win+F'); $('cfHkOff').onclick = () => setHk(''); }
  $('cfCacheOn').onchange = () => { cfg.coverCache = $('cfCacheOn').checked; };
  $('cfCacheClear').onclick = () => cacheClear('all');
  document.querySelectorAll('[data-cc]').forEach(b => b.onclick = () => cacheClear(b.dataset.cc));
  document.querySelectorAll('[data-cp]').forEach(b => b.onclick = () => picksClear(b.dataset.cp));
  cacheInfo();
  $('cfBody').querySelectorAll('[data-ico]').forEach(el => el.onclick = () => iconPicker(+el.dataset.ico, 'logo'));
  $('cfBody').querySelectorAll('[data-bgp]').forEach(el => el.onclick = () => iconPicker(+el.dataset.bgp, 'bg'));
  $('cfAddPc').onclick = () => { cfg.consoles.push({ id: 'pc' + Date.now(), type: 'pc', name: 'Jogos de PC', art: 'pc', thumbs: '', emulator: '', args: '', romDirs: [], extensions: ['lnk', 'url', 'exe'] }); renderConfig(); $('cfMain').scrollTop = 1e9; const cc = [...document.querySelectorAll('#cfBody .cfsec.on .ccard')].pop(); if (cc && typeof cfgMark === 'function' && document.querySelector('#cfBody .kbf')) cfgMark(cc); };
  $('cfAddVid').onclick = () => { cfg.consoles.push(Object.assign({ id: 'v' + Date.now(), name: 'Filmes e vídeos' }, VIDEO_DEF)); renderConfig(); $('cfMain').scrollTop = 1e9; };
  videoCardBind();
  $('cfAdd').onclick = () => { cfg.consoles.push({ id: 'c' + Date.now(), name: 'Novo console', art: '', thumbs: '', emulator: '', args: '"{rom}"', romDirs: [], extensions: [] }); renderConfig(); $('cfMain').scrollTop = 1e9; const cc = [...document.querySelectorAll('#cfBody .cfsec.on .ccard')].pop(); if (cc && typeof cfgMark === 'function' && document.querySelector('#cfBody .kbf')) cfgMark(cc); };
  cs.forEach((c, i) => { if (c.type !== 'video') checkEmu(i); });
  $('cfBody').querySelectorAll('.icobtn.bgb').forEach(b => { const m = (b.style.backgroundImage || '').match(/url\("?(.*?)"?\)$/); if (m) setBgImage(b, m[1]); });   // fundos com reserva
}
const ICON_ART = ['pc','windows','steam','snes','nes','n64','gc','wii','wiiu','switch','gb','gbc','gba','nds','3ds','mastersystem','megadrive','genesis','segacd','32x','saturn','dreamcast','neogeo','arcade','mame','psx','ps2','ps3','ps4','psp','psvita','xbox','xbox360','atari2600','pcengine'];
function iconPicker(i, kind) {
  const box = $('ip' + i), c = i === -2 ? favCfg() : cfg.consoles[i], isBg = kind === 'bg', field = isBg ? 'bg' : 'logo';
  if (box.style.display !== 'none' && box.dataset.kind === kind) { box.style.display = 'none'; return; }
  box.dataset.kind = kind;
  const opts = isBg ? ICON_ART.map(a => ['art:' + a, `${ART}background/${a}.jpg`, a])
    : [['builtin:pc', BUILTIN_LOGOS.pc, 'Moderno'], ['builtin:pc2', BUILTIN_LOGOS.pc2, 'Neon']].concat(ICON_ART.map(a => ['art:' + a, `${ART}logos/${a}.svg`, a]));
  box.style.display = 'block';
  box.innerHTML = `<div class="pkt">${isBg ? 'Imagem de fundo do console' : 'Ícone do console'}</div><div class="icogrid${isBg ? ' bgs' : ''}">${opts.map(o => `<div class="ico${(c[field] || '') === o[0] ? ' sel' : ''}" data-v="${esc(o[0])}"><img src="${esc(o[1])}" alt="" loading="lazy"><span>${esc(o[2])}</span></div>`).join('')}<div class="ico more" data-more="1"><b>＋</b><span>Mais...</span></div></div>
    <div class="line" style="margin-top:8px"><input placeholder="...ou cole o link de uma imagem" id="ipu${i}"><button class="btn sec sm" id="ipok${i}">Usar link</button><button class="btn sec sm" id="ipfile${i}">📁 Arquivo do computador...</button><button class="btn sec sm" id="ipdef${i}">Padrão</button></div>`;
  const set = v => { c[field] = v; const y = $('cfMain').scrollTop; renderConfig(); $('cfMain').scrollTop = y; };
  box.querySelectorAll('.ico:not(.more)').forEach(el => el.onclick = () => set(el.dataset.v));
  box.querySelector('.ico.more').onclick = () => openArtPick(isBg ? 'bg' : 'logo', v => set(v));
  $('ipok' + i).onclick = () => { const u = $('ipu' + i).value.trim(); if (/^https?:\/\//.test(u)) set(u); };
  $('ipfile' + i).onclick = async () => {
    try { const r = await api('/api/browse', { method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify({ type: 'image', start: '' }) }); if (r.path) set('/api/localimg?p=' + encodeURIComponent(r.path)); }
    catch (e) { toast(e.message, true); }
  };
  $('ipdef' + i).onclick = () => set('');
}
const ccFmt = (n, sz) => `${n} ${n === 1 ? 'arquivo' : 'arquivos'} · ${(sz / 1048576).toFixed(1)} MB`;
function thumbsCacheKeys() { const o = []; try { for (let i = 0; i < localStorage.length; i++) { const k = localStorage.key(i); if (k && k.startsWith('tidx|')) o.push(k); } } catch (e) {} return o; }
async function cacheInfo() {
  picksInfo();
  try {
    const r = await api('/api/cache/info'); if ($('cfCacheInfo')) $('cfCacheInfo').textContent = 'Total: ' + ccFmt(r.files, r.size);
    const ks = r.kinds || {}; for (const k in ks) { const e = document.querySelector(`[data-ci="${k}"]`); if (e) e.textContent = ccFmt(ks[k].files, ks[k].size); }
    const tk = thumbsCacheKeys(), e = document.querySelector('[data-ci="thumbs"]'); if (e) { let sz = 0; try { tk.forEach(k => sz += (localStorage.getItem(k) || '').length * 2); } catch (er) {} e.textContent = `${tk.length} ${tk.length === 1 ? 'console' : 'consoles'} · ${(sz / 1048576).toFixed(1)} MB`; }
  } catch (e) {}
}
const PICK_KNOWN = ['bg', 'bofs', 'cat', 'fav', 'fcard', 'ffree', 'fnew', 'fofs', 'fpos', 'fsz', 'lcat', 'logo', 'name', 'pref', 'bga'];
const pickMatch = (k, key) => { const i = key.indexOf('|'), pre = i > 0 ? key.slice(0, i) : ''; return k === 'frames' ? (pre === 'fofs' || pre === 'bofs') : k === 'picks' && (pre === 'bg' || pre === 'fcard' || pre === 'logo' || (i > 0 && !PICK_KNOWN.includes(pre))); };
function picksInfo() { for (const k of ['picks', 'frames']) { const e = document.querySelector(`[data-ci="${k}"]`); if (e) { const n = Object.keys(covers).filter(x => pickMatch(k, x)).length; e.textContent = `${n} ${n === 1 ? 'item' : 'itens'}`; } } }
async function picksClear(k) {
  try {
    await api('/api/cover/clear?k=' + k, { method:'POST' });
    Object.keys(covers).filter(x => pickMatch(k, x)).forEach(x => delete covers[x]);
    toast(k === 'picks' ? 'Escolhas de capas e fundos limpas' : 'Enquadramentos limpos'); picksInfo();
  } catch (e) { toast(e.message, true); }
}
async function cacheClear(k) {
  try {
    if (k === 'thumbs' || k === 'all') { thumbsCacheKeys().forEach(x => { try { localStorage.removeItem(x); } catch (e) {} }); for (const x in thumbIndex) delete thumbIndex[x]; }
    if (k !== 'thumbs') await api('/api/cache/clear?k=' + k, { method:'POST' });
    if (k === 'search' || k === 'all') { artDisk = {}; for (const x in artCache) delete artCache[x]; }
    toast(k === 'all' ? 'Cache limpo' : 'Cache limpo: ' + document.querySelector(`[data-cc="${k}"]`).previousElementSibling.previousElementSibling.textContent.replace(/^\S+\s/, '')); cacheInfo();
  } catch (e) { toast(e.message, true); }
}
// configurações do console "Favoritos" (cfg.fav = { enabled, logo, bg })
function favCfg() { if (!cfg.fav) cfg.fav = { enabled: cfg.favConsole !== false }; if (cfg.fav.enabled == null) cfg.fav.enabled = true; return cfg.fav; }
function confirmDel(i) { return window.confirm(`Remover "${cfg.consoles[i].name}" do Koru? (os arquivos não são apagados)`); }
// pastas de jogos/atalhos: uma caixa por pasta (adicionar / excluir); no PC, as lojas viram caixinhas com o caminho editável
let cfStores = null;
async function cfLoadStores() { if (cfStores) return; try { cfStores = (await api('/api/setup')).stores || []; } catch (e) { cfStores = []; } if (screen === 'config' && cfStores.length) { const y = $('cfMain').scrollTop; renderConfig(); $('cfMain').scrollTop = y; } }
function pcStoreMigrate(c) {   // pasta padrão de loja que estava na lista comum vira caixinha marcada
  if (c.type !== 'pc' || !cfStores) return; c.storeDirs = c.storeDirs || {}; c.romDirs = c.romDirs || [];
  Object.keys(c.storeDirs).forEach(id => { if (!cfStores.some(st => st.id === id)) { if (c.storeDirs[id]) c.romDirs.push(c.storeDirs[id]); delete c.storeDirs[id]; } });   // lojas que não são mais oferecidas viram pastas comuns
  cfStores.forEach(st => { const j = (c.romDirs || []).findIndex(d => d.trim().toLowerCase().replace(/\\$/, '') === st.path.toLowerCase().replace(/\\$/, '')); if (j >= 0 && c.storeDirs[st.id] == null) { c.storeDirs[st.id] = c.romDirs[j]; c.romDirs.splice(j, 1); } });
}
/* ---------- card de Filmes e vídeos ---------- */
const VIDEO_EXT = ['mkv', 'mp4', 'avi', 'mov', 'wmv', 'm4v', 'webm', 'flv', 'ts', 'm2ts', 'mts', 'mpg', 'mpeg', 'vob', 'ogv', '3gp', 'rmvb', 'divx', 'iso'];
const VIDEO_DEF = { type: 'video', art: '', thumbs: '', emulator: '', args: '', romDirs: [], privateDirs: [], extensions: VIDEO_EXT, aspect: 'auto', videoFull: true, subOn: true, subLang: 'pt,por,pob,pt-BR,en,eng', subSize: '46', subColor: 'white', subBg: 'outline', subPos: '95' };
const ASPECTS_V = [['auto', 'Original'], ['16:9', '16:9'], ['4:3', '4:3'], ['21:9', '21:9 (ultrawide)'], ['9:16', 'Vertical 9:16'], ['1:1', 'Quadrado 1:1'], ['fill', 'Preencher a tela (corta as bordas)'], ['stretch', 'Esticar (tela cheia)']];
function vSel(i, k, list, v) { return `<select data-vk="${i}|${k}">${list.map(([a, b]) => `<option value="${a}"${String(v) === a ? ' selected' : ''}>${b}</option>`).join('')}</select>`; }
function videoCardHtml(i, c) {
  for (const k in VIDEO_DEF) if (c[k] == null) c[k] = Array.isArray(VIDEO_DEF[k]) ? VIDEO_DEF[k].slice() : VIDEO_DEF[k];
  return `<div class="msg">🎬 Filmes e vídeos — tocam no player do Koru, em qualquer formato (MKV, MP4, AVI, HEVC, AV1, DTS, legendas…).</div>
  <div class="fld vplayer"><label>Player (mpv)</label><div class="line"><span class="msg" id="vMpv${i}">verificando…</span><button class="btn sec sm" data-vmpv="${i}">Baixar / atualizar</button></div></div>
  <div class="fld vgrid">
    <div><label>Proporção padrão</label>${vSel(i, 'aspect', ASPECTS_V, c.aspect)}</div>
  </div>
  <div class="fld"><label class="chk2"><input type="checkbox" data-vk="${i}|videoFull" ${c.videoFull !== false ? 'checked' : ''}> Abrir os vídeos em tela cheia</label></div>
  <div class="fld vsub"><label>Legendas</label>
    <label class="chk2"><input type="checkbox" data-vk="${i}|subOn" ${c.subOn !== false ? 'checked' : ''}> Mostrar legendas</label>
    <div class="vgrid">
      <div><label>Idiomas preferidos (em ordem)</label><input data-vk="${i}|subLang" value="${esc(c.subLang)}" spellcheck="false"></div>
      <div><label>Cor</label>${vSel(i, 'subColor', [['white', 'Branca'], ['yellow', 'Amarela'], ['cyan', 'Ciano']], c.subColor)}</div>
      <div><label>Estilo</label>${vSel(i, 'subBg', [['outline', 'Contorno'], ['shadow', 'Sombra'], ['box', 'Caixa escura']], c.subBg)}</div>
      <div><label>Tamanho <b id="vSz${i}">${c.subSize}</b></label><input type="range" min="26" max="90" data-vk="${i}|subSize" value="${c.subSize}"></div>
      <div><label>Altura <b id="vPs${i}">${c.subPos}</b></label><input type="range" min="60" max="100" data-vk="${i}|subPos" value="${c.subPos}"></div>
    </div>
    <div class="msg">Legendas .srt / .ass com o mesmo nome do vídeo são carregadas sozinhas.</div>
  </div>
  <div class="msg vkeys"><b>No vídeo:</b> Espaço/A pausa · ← →/D-pad ±10 s · PgUp PgDn/LB RB ±1 min · ↑ ↓ volume · S/X legenda · A/Y áudio · Ctrl+scroll/LT RT proporção · F/Start/duplo clique tela cheia · Esc/B sair</div>`;
}
function videoPrivHtml(i, c) {
  if (!c.privateDirs) c.privateDirs = [];
  return `<details class="vadv"><summary>⋯</summary><div class="fld"><label>Pasta privada</label>${c.privateDirs.map((d, j) => `<div class="line dline"><input data-vp="${i}|${j}" value="${esc(d)}" spellcheck="false" placeholder="Caminho da pasta"><button class="btn sec sm" data-bvp="${i}|${j}">...</button><button class="btn sec sm dx" data-xvp="${i}|${j}">Excluir</button></div>`).join('')}<div class="line"><button class="btn sec sm" data-vpa="${i}">+ Pasta</button></div><div class="msg">Os vídeos destas pastas ficam escondidos. Na lista, Ctrl+Shift+H (ou L3+R3 no controle) mostra/esconde; ao sair, voltam a ficar escondidos.</div></div></details>`;
}
async function vMpvStatus() { try { const st = await api('/api/mpv'); document.querySelectorAll('[id^=vMpv]').forEach(e => e.textContent = st.busy ? `${st.step} ${st.progress}%` : st.installed ? '✓ instalado' : 'não baixado ainda (baixa sozinho ao abrir o 1º vídeo)'); if (st.busy) setTimeout(vMpvStatus, 800); } catch (e) {} }
function videoCardBind() {
  const B = $('cfBody'), rer = () => { const y = $('cfMain').scrollTop; renderConfig(); $('cfMain').scrollTop = y; const d = B.querySelector('.vadv'); if (d) d.open = true; };
  B.querySelectorAll('[data-vk]').forEach(el => { const [i, k] = el.dataset.vk.split('|'); const c = cfg.consoles[+i];
    const up = () => { c[k] = el.type === 'checkbox' ? el.checked : el.value; if (k === 'subSize') $('vSz' + i).textContent = el.value; if (k === 'subPos') $('vPs' + i).textContent = el.value; };
    el.oninput = up; el.onchange = up; });
  B.querySelectorAll('[data-vmpv]').forEach(el => el.onclick = async () => { try { await api('/api/mpv', { method:'POST' }); } catch (e) {} vMpvStatus(); });
  B.querySelectorAll('[data-vp]').forEach(el => el.oninput = () => { const [i, j] = el.dataset.vp.split('|'); cfg.consoles[+i].privateDirs[+j] = el.value.trim(); });
  B.querySelectorAll('[data-xvp]').forEach(el => el.onclick = () => { const [i, j] = el.dataset.xvp.split('|'); cfg.consoles[+i].privateDirs.splice(+j, 1); rer(); });
  B.querySelectorAll('[data-vpa]').forEach(el => el.onclick = () => { cfg.consoles[+el.dataset.vpa].privateDirs.push(''); rer(); });
  B.querySelectorAll('[data-bvp]').forEach(el => el.onclick = async () => { const [i, j] = el.dataset.bvp.split('|'), c = cfg.consoles[+i];
    try { const r = await api('/api/browse', { method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify({ type: 'folder', start: c.privateDirs[+j] || '' }) }); if (r.path) { c.privateDirs[+j] = r.path; rer(); } } catch (e) { toast(e.message, true); } });
  if (B.querySelector('[id^=vMpv]')) vMpvStatus();
}
function dirsHtml(i, c) {
  const pc = c.type === 'pc'; pcStoreMigrate(c);
  if (!c.romDirs) c.romDirs = []; if (!c.romDirs.length && !(pc && c.storeDirs && Object.keys(c.storeDirs).length)) c.romDirs.push('');
  const row = (attr, v, del) => `<div class="line dline"><input ${attr} value="${esc(v)}" spellcheck="false" placeholder="Caminho da pasta"><button class="btn sec sm" ${attr.replace('data-', 'data-b')}>...</button>${del ? `<button class="btn sec sm dx" ${attr.replace('data-', 'data-x')}>Excluir pasta</button>` : ''}</div>`;
  const stores = pc && cfStores ? `<div class="fld"><label>Loja</label>${cfStores.map(st => { const on = c.storeDirs && c.storeDirs[st.id] != null; return `<div class="stbox${on ? ' on' : ''}"><label class="chk2"><input type="checkbox" data-st="${i}|${st.id}"${on ? ' checked' : ''}> ${esc(st.name)}${st.exists ? '' : ' <i class="dim">(pasta padrão não encontrada)</i>'}</label>${on ? row(`data-sd="${i}|${st.id}"`, c.storeDirs[st.id], false) : ''}</div>`; }).join('')}</div>` : '';
  return stores + `<div class="fld"><label>${pc ? 'Pastas com atalhos dos jogos (.lnk / .url / .exe)' : c.type === 'video' ? 'Pastas de filmes e vídeos' : 'Pastas de jogos'}</label>${c.romDirs.map((d, j) => row(`data-rd="${i}|${j}"`, d, true)).join('')}<div class="line"><button class="btn sec sm" data-rda="${i}">+ Adicionar pasta</button></div></div>`;
}
function dirsBind() {
  const B = $('cfBody'), rer = (focusSel) => { const y = $('cfMain').scrollTop; renderConfig(); $('cfMain').scrollTop = y; if (focusSel) { const el = $('cfBody').querySelector(focusSel); if (el) { el.focus(); if (typeof cfgMark === 'function' && document.querySelector('#cfBody .kbf')) cfgMark(el); } } };
  const ij = el => { const [a, b] = Object.values(el.dataset)[0].split('|'); return [+a, b]; };
  B.querySelectorAll('[data-rd]').forEach(el => el.oninput = () => { const [i, j] = ij(el); cfg.consoles[i].romDirs[+j] = el.value.trim(); });
  B.querySelectorAll('[data-sd]').forEach(el => el.oninput = () => { const [i, id] = ij(el); cfg.consoles[i].storeDirs[id] = el.value.trim(); });
  B.querySelectorAll('[data-xrd]').forEach(el => el.onclick = () => { const [i, j] = el.dataset.xrd.split('|'); cfg.consoles[+i].romDirs.splice(+j, 1); sfx('back'); rer(`[data-rda="${i}"]`); });
  B.querySelectorAll('[data-rda]').forEach(el => el.onclick = () => { const i = +el.dataset.rda, c = cfg.consoles[i]; c.romDirs.push(''); sfx('ok'); rer(`[data-rd="${i}|${c.romDirs.length - 1}"]`); });
  B.querySelectorAll('[data-st]').forEach(el => el.onchange = () => { const [i, id] = el.dataset.st.split('|'), c = cfg.consoles[+i]; c.storeDirs = c.storeDirs || {}; if (el.checked) c.storeDirs[id] = (cfStores.find(x => x.id === id) || {}).path || ''; else delete c.storeDirs[id]; sfx('tick'); rer(el.checked ? `[data-sd="${i}|${id}"]` : `[data-st="${i}|${id}"]`); });
  B.querySelectorAll('[data-brd],[data-bsd]').forEach(el => el.onclick = async () => {
    const rd = el.dataset.brd, [i, k] = (rd || el.dataset.bsd).split('|'), c = cfg.consoles[+i], cur = rd ? c.romDirs[+k] : c.storeDirs[k];
    try { const r = await api('/api/browse', { method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify({ type: 'folder', start: cur || '' }) }); if (r.path) { if (rd) c.romDirs[+k] = r.path; else c.storeDirs[k] = r.path; sfx('ok'); rer(); } } catch (e) { toast(e.message, true); }
  });
}
function setField(i, k, v) {
  if (i < 0) { cfg[k] = k === 'port' ? (parseInt(v) || 8765) : v; return; }
  const c = cfg.consoles[i];
  if (k === 'romDirs') c.romDirs = v.split('\n').map(x => x.trim()).filter(Boolean);
  else if (k === 'extensions') c.extensions = v.split(/[,\s;]+/).map(x => x.trim().replace(/^\./, '').toLowerCase()).filter(Boolean);
  else c[k] = v;
  if (k === 'emulator') { clearTimeout(c._t); c._t = setTimeout(() => checkEmu(i), 300); }
}
async function checkEmu(i) {
  const c = cfg.consoles[i], el = $('st' + i); if (!el) return;
  if (!c.emulator) { el.className = 'st no'; el.textContent = 'sem emulador'; return; }
  try { const r = await api('/api/exists?p=' + encodeURIComponent(c.emulator)); el.className = 'st ' + (r.file ? 'ok' : 'no'); el.textContent = r.file ? '✓ encontrado' : '✗ não encontrado'; } catch (e) {}
}
async function browse(btn) {
  const i = +btn.dataset.i, k = btn.dataset.k, type = btn.dataset.browse;
  const cur = i < 0 ? cfg[k] : (k === 'romDirs' ? (cfg.consoles[i].romDirs[0] || '') : cfg.consoles[i][k]);
  btn.disabled = true;
  try {
    const r = await api('/api/browse', { method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify({ type: type === 'file' ? 'file' : 'folder', start: cur || '' }) });
    if (r.path) {
      if (type === 'folder-add') { const c = cfg.consoles[i]; if (!c.romDirs.includes(r.path)) c.romDirs.push(r.path); }
      else if (i < 0) cfg[k] = r.path; else cfg.consoles[i][k] = r.path;
      const y = $('cfMain').scrollTop; renderConfig(); $('cfMain').scrollTop = y;
    }
  } catch (e) { toast(e.message, true); }
  btn.disabled = false;
}
// configuração salva sozinha: a cada alteração (com um pequeno atraso) e ao sair da tela
let cfgSaved = '';
const cfgJson = () => JSON.stringify(cfg, (k, v) => k === '_t' ? undefined : v, 2);
async function saveCfg() {
  if (!cfg) return; const j = cfgJson(); if (j === cfgSaved) return;
  try { await api('/api/config', { method:'POST', headers:{'Content-Type':'application/json'}, body: j }); cfgSaved = j; $('cfSaved').textContent = '✓ salvo'; setTimeout(() => $('cfSaved').textContent = '', 1500); }
  catch (e) { toast('Erro ao salvar: ' + e.message, true); }
}
setInterval(() => { if (screen === 'config') saveCfg(); }, 1500);
$('cfCancel').onclick = async () => { await saveCfg(); location.href = '/'; };
$('gear').onclick = openConfig;

/* ---------- busca de wallpaper para o fundo fixo dos Favoritos (só busca quando o usuário pede) ---------- */
let wpTok = 0;
async function wpSearch(q) {
  q = (q || '').trim(); const box = $('wpRes'); if (!q) { $('wpQ').focus(); return; }
  const tok = ++wpTok; box.innerHTML = '<div class="msg">Buscando…</div>';
  let res = [];
  try {   // Wallhaven: só imagens SFW com no mínimo 1920×1080
    const r = await api('/api/proxy?u=' + encodeURIComponent('https://wallhaven.cc/api/v1/search?purity=100&categories=111&atleast=1920x1080&sorting=relevance&q=' + encodeURIComponent(q)));
    res = (r.data || []).map(x => ({ full: x.path, thumb: x.thumbs && (x.thumbs.large || x.thumbs.small), w: x.dimension_x, h: x.dimension_y }));
  } catch (e) {}
  if (res.length < 6) try {   // reserva: Wikimedia Commons, só fotos grandes
    const u = 'https://commons.wikimedia.org/w/api.php?action=query&format=json&origin=*&generator=search&gsrnamespace=6&gsrlimit=40&prop=imageinfo&iiprop=url|size&iiurlwidth=480&gsrsearch=' + encodeURIComponent(q + ' filetype:bitmap');
    const r = await (await fetch(u)).json();
    Object.values((r.query && r.query.pages) || {}).forEach(p => { const ii = p.imageinfo && p.imageinfo[0]; if (ii && ii.width >= 1920 && ii.height >= 1000 && ii.width >= ii.height) res.push({ full: ii.url, thumb: ii.thumburl, w: ii.width, h: ii.height }); });
  } catch (e) {}
  if (tok !== wpTok) return;
  res = res.filter(x => x.full && x.thumb && x.w >= 1920);
  if (!res.length) { box.innerHTML = '<div class="msg">Nada encontrado em alta resolução. Tente outras palavras (em inglês costuma render mais).</div>'; return; }
  let n = 24, page = 1;
  const draw = () => {
    box.innerHTML = res.slice(0, n).map((x, k) => `<button class="wpimg" data-k="${k}" style="background-image:url('${x.thumb.replace(/'/g, '%27')}')"><span>${x.w}×${x.h}</span></button>`).join('') + '<button class="wpimg wpmore"><b>＋</b><span>Mais</span></button>';
    box.querySelectorAll('.wpimg:not(.wpmore)').forEach(b => b.onclick = () => {
      const x = res[+b.dataset.k]; favCfg().bg = x.full; FAVSYS.bg = x.full;
      box.querySelectorAll('.wpimg').forEach(o => o.classList.toggle('on', o === b));
      const bb = document.querySelector('#cfBody [data-bgp="-2"]'); if (bb) bb.style.backgroundImage = `url('${x.full.replace(/'/g, '%27')}')`;
      sfx('ok'); toast('Fundo escolhido — salve a configuração para aplicar');
    });
    box.querySelector('.wpmore').onclick = async e => {   // "Mais": mostra as próximas; acabando, busca a próxima página
      const b = e.currentTarget; if (b.disabled) return; b.disabled = true; b.querySelector('span').textContent = 'Buscando…';
      if (n >= res.length) { try { page++; const r = await api('/api/proxy?u=' + encodeURIComponent('https://wallhaven.cc/api/v1/search?purity=100&categories=111&atleast=1920x1080&sorting=relevance&page=' + page + '&q=' + encodeURIComponent(q))); (r.data || []).forEach(x => { if (!res.some(o => o.full === x.path) && x.dimension_x >= 1920) res.push({ full: x.path, thumb: x.thumbs && (x.thumbs.large || x.thumbs.small), w: x.dimension_x, h: x.dimension_y }); }); } catch (er) {} }
      if (tok !== wpTok) return;
      if (n >= res.length) { b.querySelector('span').textContent = 'Sem mais imagens'; return; }
      const k0 = n; n += 24; draw(); sfx('tick');
      const nb = box.querySelectorAll('.wpimg')[k0]; if (nb) { nb.scrollIntoView({ block: 'nearest' }); if (document.querySelector('#cfBody .kbf') && typeof cfgMark === 'function') cfgMark(nb); }
    };
  };
  draw();
  if (document.querySelector('#cfBody .kbf') && typeof cfgMark === 'function') cfgMark(box.querySelector('.wpimg'));
}
