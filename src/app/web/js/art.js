// Koru — art.js
// ---- mais repositórios (MediaWiki, via servidor): Fandom, PCGamingWiki, StrategyWiki ----
async function mw(base, q, n) {
  const u = `${base}?action=query&format=json&generator=search&gsrnamespace=0&gsrlimit=${n || 1}&gsrsearch=${encodeURIComponent(q)}&prop=pageimages&piprop=thumbnail|original&pithumbsize=1000`;
  try {
    const d = await api('/api/proxy?u=' + encodeURIComponent(u));
    return Object.values((d.query && d.query.pages) || {}).sort((a, b) => a.index - b.index)
      .map(p => ({ title: p.title, img: (p.thumbnail && p.thumbnail.source) || (p.original && p.original.source) }))
      .filter(p => p.img && !/\.svg/i.test(p.img));
  } catch (e) { return []; }
}
function fandomWikis(t) {
  const base = t.split(/:| - | – /)[0].trim(), slug = x => x.toLowerCase().replace(/&/g, 'and').replace(/[^a-z0-9]/g, '');
  const words = base.split(/\s+/).filter(w => w.length > 2 && !/^(the|of|and)$/i.test(w));
  return [...new Set([slug(t), slug(base), words[0] ? slug(words[0]) : '', words.length > 1 ? slug(words[0] + words[1]) : ''])].filter(x => x.length >= 3).slice(0, 4);
}
async function fandomImage(g, n) {
  const t = cleanTitle(g.name); if (!t) return [];
  const out = [];
  for (const w of fandomWikis(t)) {
    for (const p of await mw(`https://${w}.fandom.com/api.php`, t, n || 1)) out.push({ ...p, src: `Fandom (${w})` });
    if (out.length && !n) break;
  }
  return out;
}
const EXTRA_REPOS = [
  { key:'fandom', label:'Fandom', find: g => fandomImage(g) },
  { key:'pcgw', label:'PCGamingWiki', find: async g => (await mw('https://www.pcgamingwiki.com/w/api.php', cleanTitle(g.name))).map(p => ({ ...p, src:'PCGamingWiki' })) },
  { key:'strategywiki', label:'StrategyWiki', find: async g => (await mw('https://strategywiki.org/w/api.php', cleanTitle(g.name))).map(p => ({ ...p, src:'StrategyWiki' })) },
];
let covers = {};
const coverKey = g => g.sid + '|' + g.path;
// 3º repositório: capas pelo código do jogo lido da ROM (GameTDB p/ Wii/DS/3DS, xlenore p/ PS1/PS2)
const idCache = {};
async function idCovers(g) {
  const s = systems.concat(allSystems).find(x => x.id === g.sid) || sys;
  const kind = s.type === 'pc' ? 'pc' : s.id;
  if (!['wii', 'nds', '3ds', 'ps1', 'ps2', 'pc'].includes(kind)) return [];
  const k = coverKey(g);
  if (!(k in idCache)) { try { idCache[k] = (await api(`/api/gameid?c=${encodeURIComponent(s.id)}&p=${encodeURIComponent(g.path)}`)).id || ''; } catch (e) { idCache[k] = ''; } }
  const id = idCache[k]; if (!id) return [];
  if (kind === 'pc') return steamUrls(id);
  if (s.id === 'ps2') return [`https://raw.githubusercontent.com/xlenore/ps2-covers/main/covers/default/${id}.jpg`];
  if (s.id === 'ps1') return [`https://raw.githubusercontent.com/xlenore/psx-covers/main/covers/default/${id}.jpg`];
  const reg = { E:'US', P:'EN', J:'JA', D:'DE', F:'FR', S:'ES', I:'IT', K:'KO' }[id[3]] || 'US';
  const regs = [...new Set([reg, 'US', 'EN', 'JA'])];
  const plat = { wii:'wii', nds:'ds', '3ds':'3ds' }[s.id];
  const out = [];
  regs.forEach(r => ['png', 'jpg'].forEach(x => out.push(`https://art.gametdb.com/${plat}/cover/${r}/${id}.${x}`)));
  return out;
}
// 4º repositório: Steam (busca feita pelo servidor do app)
const STEAM = 'https://cdn.cloudflare.steamstatic.com/steam/apps/';
const steamUrls = id => [`${STEAM}${id}/library_600x900_2x.jpg`, `${STEAM}${id}/library_600x900.jpg`, `${STEAM}${id}/header.jpg`];
const steamCache = {};
async function steamSearch(q) {
  if (!q) return [];
  if (!steamCache[q]) { try { steamCache[q] = ((await api('/api/steam?q=' + encodeURIComponent(q))).items || []).filter(i => i.type === 'app'); } catch (e) { steamCache[q] = []; } }
  return steamCache[q];
}
// cache de capas no computador (servidor guarda as imagens e o resultado da busca)
let cacheOn = true, artDisk = {};
const cp = u => (cacheOn && u && /^https?:/.test(u)) ? '/api/img?u=' + encodeURIComponent(u) : u;
const cpb = u => { const r = cp(u); return r && r.startsWith('/api/img?u=') ? r + '&k=bg' : r; };   // imagem de fundo: cache separado
// capa já conhecida (manual, memória ou cache em disco) — resposta imediata, sem esperar nada
function cachedArt(g) {
  const key = coverKey(g);
  if (covers[key]) return { box: covers[key], snap: null, src: 'manual', ratio: artDisk[key] && artDisk[key].ratio, logo: artDisk[key] && artDisk[key].logo };
  if (artCache[key]) { const a = artCache[key]; if (a.box || !a.t || Date.now() - a.t < 2000) return a; delete artCache[key]; }   // capa genérica nunca é definitiva: depois de 1 min tenta de novo
  const d = artDisk[key]; if (cacheOn && d && (d.v === 2 || d.v === 3) && d.box) return artCache[key] = d;   // v2: capas reais primeiro (resultados antigos são refeitos uma vez)   // ignora capas antigas da Wikipédia
  return null;
}
// fila de buscas: no máximo 3 ao mesmo tempo; o pedido mais recente (o que está na tela/selecionado) vai na frente;
// pedidos repetidos do mesmo jogo esperam a mesma busca
const artInflight = {}, artQueue = []; let artRunning = 0;
function artPump() {
  while (artRunning < 3 && artQueue.length) {
    const job = artQueue.pop(); artRunning++;
    resolveArt0(job.g).then(job.ok, () => job.ok(null)).finally(() => { artRunning--; artPump(); });
  }
}
function resolveArt(g, now) {   // now: jogo em foco — passa na frente de tudo, sem esperar a fila
  const key = coverKey(g);
  const c = cachedArt(g); if (c) return Promise.resolve(c);
  if (artInflight[key] && now) { const j = artQueue.find(x => x.key === key); if (j) { artQueue.splice(artQueue.indexOf(j), 1); resolveArt0(j.g).then(j.ok, () => j.ok(null)); } return artInflight[key]; }
  if (artInflight[key]) { const j = artQueue.find(x => x.key === key); if (j) { artQueue.splice(artQueue.indexOf(j), 1); artQueue.push(j); } return artInflight[key]; }   // pediu de novo: sobe na fila
  return artInflight[key] = new Promise(ok => { if (now) resolveArt0(g).then(ok, () => ok(null)); else { artQueue.push({ key, g, ok }); artPump(); } }).then(r => {
    delete artInflight[key];
    if (r && !r.box) { artCache[key] = { ...r, t: Date.now() }; return r; }   // sem capa: só em memória por 1 min (nunca salvo como definitivo)
    if (cacheOn && r && r.src !== 'manual') { const v = { ...r, t: Date.now() }; artDisk[key] = v; api('/api/artcache', { method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify({ key, val: v }) }).catch(() => {}); }   // sem capa também fica guardado (por uns dias), para não refazer tudo a cada abertura
    return r;
  });
}
// mede a imagem (largura × altura); null se não carregar
const imgSize = (url, ms) => new Promise(ok => { const i = new Image(); const t = setTimeout(() => ok(null), ms || 6000);
  i.onload = () => { clearTimeout(t); ok(i.naturalWidth > 1 ? { url, px: i.naturalWidth * i.naturalHeight, ar: i.naturalWidth / i.naturalHeight } : null); }; i.onerror = () => { clearTimeout(t); ok(null); }; i.src = url; });
// Wikipédia: só a imagem principal (infobox) de artigos de JOGO — nada de fotos secundárias
async function wikiMain(title, n) {
  const out = [];
  for (const [lang, tpl] of [['en', 'Infobox video game'], ['pt', 'Info/Jogo eletrônico']]) {
    try {
      const u = `https://${lang}.wikipedia.org/w/api.php?action=query&format=json&origin=*&generator=search&gsrnamespace=0&gsrlimit=${n || 1}&gsrsearch=${encodeURIComponent(title + ' hastemplate:"' + tpl + '"')}&prop=pageimages&piprop=original|thumbnail&pithumbsize=1000&pilicense=any`;
      const d = await (await fetch(u)).json();
      Object.values((d.query && d.query.pages) || {}).sort((a, b) => a.index - b.index).forEach(p => {
        const img = (p.thumbnail && p.thumbnail.source) || (p.original && p.original.source);
        if (img && !/\.svg/i.test(img)) out.push({ img, title: p.title, src: 'Wikipédia ' + lang.toUpperCase() });
      });
      if (out.length && !n) break;
    } catch (e) {}
  }
  return out;
}
// ---- relevância: quantas palavras do nome do jogo aparecem no título do resultado ----
const STOP = new Set(['the', 'of', 'a', 'an', 'and', 'o', 'a', 'os', 'as', 'de', 'do', 'da', 'dos', 'das', 'e', 'in', 'on', 'to', 'for']);
const normT = t => (t || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/\.(png|jpe?g|webp)$/, '').replace(/\([^)]*\)|\[[^\]]*\]/g, ' ').replace(/&/g, ' and ').replace(/[^a-z0-9]+/g, ' ').trim();
const words = t => normT(t).split(' ').filter(w => w && !STOP.has(w));
function relevance(query, title) {
  const qw = words(query), tw = new Set(words(title));
  if (!qw.length) return { phrase: 0, overlap: 0 };
  const phrase = (' ' + normT(title) + ' ').includes(' ' + normT(query) + ' ') ? 1 : 0;   // contém o nome inteiro, ex.: "elite soccer"
  const overlap = qw.filter(w => tw.has(w)).length / qw.length;
  return { phrase, overlap };
}
// proporções (largura ÷ altura) padrão das capas de cada console — 2 por console (ex.: EUA e Japão/Europa)
const ASPECTS = {
  snes: [1.38, 1.30], n64: [1.38, 1.30], gb: [1.00, 0.80], gbc: [1.00, 0.80], gba: [1.00, 0.72],
  nds: [0.89, 0.86], '3ds': [0.87, 0.91], wii: [0.71, 0.70], wiiu: [0.79, 0.71], gc: [0.70, 0.71], switch: [0.62, 0.63],
  nes: [0.72, 0.62], sms: [0.71, 0.75], genesis: [0.72, 0.79], dreamcast: [1.00, 0.89], saturn: [1.00, 0.63], neogeo: [0.70, 0.66],
  ps1: [1.00, 0.89], ps2: [0.70, 0.71], psp: [0.58, 0.56], ps3: [0.81, 0.79], xbox: [0.70, 0.71], xbox360: [0.70, 0.71], pc: [0.67, 0.78],
};
function aspectOk(ar) {   // 1 se a imagem tem a proporção de uma capa do console (±10%)
  const list = ASPECTS[sys && sys.type === 'pc' ? 'pc' : sys && sys.id] || [];
  return ar && list.some(r => Math.abs(ar - r) / r <= .10) ? 1 : 0;
}
// prioridade: nome inteiro > palavras em comum > proporção de capa do console > resolução
const relCmp = (a, b) => (b.phrase - a.phrase) || (b.overlap - a.overlap) || (aspectOk(b.ar) - aspectOk(a.ar)) || (b.px - a.px);
// ---- SteamGridDB: capa (grid), fundo (hero) e logo, pela nota da comunidade ----
let sgdbOn = false;
const sgdbCache = {};
const sg = p => api('/api/sgdb?p=' + encodeURIComponent(p)).then(r => (r && r.data) || []);
async function sgdbGame(g) {
  const k = coverKey(g); if (k in sgdbCache) return sgdbCache[k];
  const q = cleanTitle(dn(g)) || dn(g);
  let id = null;
  try {
    const sid = await idCovers(g).then(u => (u[0] || '').match(/steam\/apps\/(\d+)/));   // jogos de PC da Steam: pelo número do app
    if (sid) { const r = await api('/api/sgdb?p=' + encodeURIComponent('/api/v2/games/steam/' + sid[1])); id = r && r.data && r.data.id; }
    if (!id) {
      const list = await sg('/api/v2/search/autocomplete/' + encodeURIComponent(q));
      // o mais parecido; se nenhum tiver nome parecido, o 1º sugerido pelo SteamGridDB (igual à busca manual — ex.: nome japonês x inglês)
      const best = list.map(x => ({ x, ...relevance(q, x.name) })).sort((a, b) => (b.phrase - a.phrase) || (b.overlap - a.overlap))[0];
      id = best && (best.phrase || best.overlap >= .6) ? best.x.id : (list[0] ? list[0].id : null);
    }
  } catch (e) {}
  return sgdbCache[k] = id;
}
const STATIC = 'types=static&nsfw=false&humor=any&epilepsy=any';
async function sgdbGrids(id) { return (await sg(`/api/v2/grids/game/${id}?${STATIC}&mimes=image/png,image/jpeg,image/webp`)).filter(x => !/\.(gif|webm)$/i.test(x.url)); }
async function sgdbArt(g) {
  const id = await sgdbGame(g); if (!id) return null;
  const [grids, heroes, logos] = await Promise.all([sgdbGrids(id).catch(() => []), sg(`/api/v2/heroes/game/${id}?${STATIC}`).catch(() => []), sg(`/api/v2/logos/game/${id}?${STATIC}`).catch(() => [])]);
  // grids já vêm por nota (maior primeiro); preferimos a de proporção de capa do console
  const grid = grids.find(x => aspectOk(x.width / x.height)) || grids[0];
  return { box: grid ? grid.url : null, snap: heroes[0] ? heroes[0].url : null, logo: logos[0] ? logos[0].url : null };
}
function genHash(n) { let h = 0; for (const ch of (n || '')) h = (h * 31 + ch.charCodeAt(0)) >>> 0; return h; }   // cor da capa genérica (fixa por jogo)
// escolha automática da capa — as MESMAS fontes da busca manual, todas ao mesmo tempo.
// Cada imagem achada é testada (carrega?) em paralelo; a melhor que carregar vence:
//  • capa oficial (libretro / código do jogo) com o nome certo → na hora
//  • depois de 2 s → a melhor com nome parecido de qualquer fonte (inclui SteamGridDB)
//  • se tudo terminar sem nome parecido → a que carregou de qualquer jeito (nunca genérica se alguma imagem existe)
// Fundo e título são completados depois, sem atrasar a capa.
const SRC_PRIO = { libretro: 6, code: 6, sgdb: 5, steam: 4, wikimain: 2, fandom: 2, pcgw: 2, strategywiki: 2 };
/* ---------- pôsteres de filmes e séries (sem chave): iTunes → Wikipedia ---------- */
function movieQuery(g) {
  let n = (dn(g) || g.name || '').replace(/[._]+/g, ' ');
  const tv = n.match(/^(.*?)[\s-]*\bS(\d{1,2})\s*E\d{1,3}/i) || n.match(/^(.*?)[\s-]*\b(\d{1,2})x\d{2}\b/i);
  const ym = n.match(/[\[(\s]((?:19|20)\d{2})[\])\s]|[\s(]((?:19|20)\d{2})$/);
  const year = ym ? +(ym[1] || ym[2]) : 0;
  if (tv) n = tv[1]; else if (ym) n = n.slice(0, ym.index);
  n = n.replace(/\[[^\]]*\]|\([^)]*\)/g, ' ').replace(/\b(2160p|1080p|720p|480p|4k|uhd|hdr\d*|bluray|blu-ray|brrip|bdrip|webrip|web-?dl|web|hdtv|dvdrip|x26[45]|h\.?26[45]|hevc|aac\d?|ac3|dts|5\.1|dual|dublado|legendado|nacional|remux|proper|repack|extended|unrated|yify|rarbg)\b.*$/i, ' ').replace(/\s+/g, ' ').trim();
  return { q: n, year, tv: !!tv };
}
const posterCache = {};
async function moviePoster(g) {
  const { q, year, tv } = movieQuery(g); if (!q) return null;
  const k = q + '|' + year + '|' + tv; if (k in posterCache) return posterCache[k];
  const norm = s => (s || '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-z0-9]+/g, ' ').trim();
  let url = null;
  try {
    for (const country of ['BR', 'US']) {
      const u = `https://itunes.apple.com/search?country=${country}&limit=10&media=${tv ? 'tvShow&entity=tvSeason' : 'movie'}&term=${encodeURIComponent(q)}`;
      const r = await api('/api/proxy?u=' + encodeURIComponent(u)); const res = (r && r.results) || [];
      const nm = x => norm(tv ? (x.artistName || x.collectionName) : x.trackName);
      const sc = x => (nm(x) === norm(q) ? 3 : nm(x).includes(norm(q)) || norm(q).includes(nm(x)) ? 1 : 0) + (year && x.releaseDate && +x.releaseDate.slice(0, 4) === year ? 2 : 0);
      const best = res.filter(x => x.artworkUrl100 && sc(x) > 0).sort((a, b) => sc(b) - sc(a))[0];
      if (best) { url = best.artworkUrl100.replace(/\/\d+x\d+bb\./, '/600x900bb.'); break; }
    }
  } catch (e) {}
  if (!url) try {   // Wikipedia: imagem principal do artigo do filme/série
    for (const lang of ['pt', 'en']) {
      const u = `https://${lang}.wikipedia.org/w/api.php?action=query&format=json&generator=search&gsrlimit=3&prop=pageimages&piprop=original&gsrsearch=${encodeURIComponent(q + (year ? ' ' + year : '') + (tv ? ' série' : ' filme'))}`;
      const r = await api('/api/proxy?u=' + encodeURIComponent(u)); const pages = Object.values((r && r.query && r.query.pages) || {}).sort((a, b) => a.index - b.index);
      const p = pages.find(x => x.original && /\.(jpe?g|png|webp)$/i.test(x.original.source)); if (p) { url = p.original.source; break; }
    }
  } catch (e) {}
  return posterCache[k] = url;
}
async function resolveArt0(g) {
  const key = coverKey(g);
  if (covers[key]) return { box: covers[key], snap: null, src: 'manual' };
  { const sv = (typeof sysOf === 'function' && sysOf(g)) || {}; if (sv.type === 'video') { const u = `/api/vthumb?c=${encodeURIComponent(g.sid || sv.id)}&p=${encodeURIComponent(g.path)}`; const po = await moviePoster(g).catch(() => null); return { box: po || u, snap: u, src: po ? 'poster' : 'video', v: 3 }; } }   // vídeo: pôster do filme/série (iTunes, Wikipedia) e um quadro do próprio vídeo no fundo
  if (artCache[key] && artCache[key].box) return artCache[key];
  const q = cleanTitle(dn(g)) || dn(g), S = (typeof sysOf === 'function' && sysOf(g)) || {}, pc = S.type === 'pc', t0 = Date.now();
  const sgP = sgdbOn ? sgdbArt(g).catch(() => null) : Promise.resolve(null);
  const cands = [];
  let pending = 0, finish;
  const out = new Promise(r => finish = r);
  const level = c => c.trusted || c.phrase ? 2 : c.overlap >= .6 ? 1 : 0;
  const score = c => level(c) * 100 + (SRC_PRIO[c.src] || 1) * 10 + Math.min(9, (c.overlap || 0) * 9);
  const pick = minLevel => { const ok = cands.filter(c => c.ok && level(c) >= minLevel); ok.sort((x, y) => score(y) - score(x)); return ok[0]; };
  let decided = false;
  // ordem: oficial com nome certo (na hora) > SteamGridDB (aos 4 s sem oficial) > outras fontes com nome parecido > qualquer imagem
  const decide = final => {
    if (decided) return;
    const el = Date.now() - t0, ok = cands.filter(c => c.ok);
    const by = l => l.sort((x, y) => score(y) - score(x))[0];
    const off = by(ok.filter(c => level(c) === 2 && SRC_PRIO[c.src] === 6));
    const late = el >= (sgdbOn ? 4000 : 2000) || final;   // sem a chave não há por que esperar 4 s
    const sgc = late ? by(ok.filter(c => c.src === 'sgdb')) : null;
    const other = late ? by(ok.filter(c => c.src !== 'sgdb' && level(c) >= 1)) : null;
    const c = off || sgc || other || (final ? by(ok) : null);
    if (c || final) { decided = true; finish(c || null); }
  };
  const tmr = setTimeout(() => decide(false), 2000), tmr2 = setTimeout(() => decide(false), 4000);
  const addC = (list, src, trusted) => {
    for (const it of list || []) {
      if (!it || !it.url || cands.some(c => c.url === it.url)) continue;
      const c = { url: it.url, src, trusted: !!trusted, ...relevance(q, it.title || q) }; cands.push(c); pending++;
      loadImg(it.url, 4000).then(ok => { c.ok = !!ok; pending--; decide(false); if (!pending && !sources) decide(true); });
    }
  };
  let sources = 0;
  const source = (p, src, trusted) => { sources++; Promise.resolve(p).then(l => addC(l, src, trusted), () => {}).finally(() => { sources--; if (!pending && !sources) decide(true); }); };
  // libretro: pelo nome do arquivo (confiável) e pelas palavras do nome, como na busca manual
  if (!pc && S.thumbs) {
    source(Promise.race([loadThumbIndex(S), new Promise(r => setTimeout(r, 800))]).then(() => {
      const base = `${THUMBS}${S.thumbs}/master/Named_Boxarts/`, ix = thumbIndex[S.thumbs], out = [...new Set([...(covers['name|' + key] ? boxartUrls(S, covers['name|' + key]) : []), ...boxartUrls(S, g.name)])].map(u => ({ url: u, title: q }));   // nome renomeado primeiro, depois o do arquivo
      if (ix && ix.names) { const ws = q.toLowerCase().split(/\s+/).filter(w => w.length > 1); ix.names.filter(n => ws.every(w => n.toLowerCase().includes(w))).slice(0, 4).forEach(n => out.push({ url: base + encodeURIComponent(n), title: n.replace(/\.png$/i, '') })); }
      return out;
    }), 'libretro', false);
    // os achados pelo nome do arquivo entram como confiáveis
  }
  source(idCovers(g).then(us => us.map(u => ({ url: u, title: q }))), pc ? 'steam' : 'code', true);
  source(steamSearch(q).then(l => l.slice(0, 3).map(it => ({ url: `${STEAM}${it.id}/library_600x900_2x.jpg`, title: it.name }))), 'steam', false);
  source(wikiMain(q, 2).then(l => l.map(p => ({ url: p.img, title: p.title }))), 'wikimain', false);
  source(fandomImage({ name: q }, 2).then(l => l.map(p => ({ url: p.img, title: p.title }))), 'fandom', false);
  source(mw('https://www.pcgamingwiki.com/w/api.php', q, 2).then(l => l.map(p => ({ url: p.img, title: p.title }))), 'pcgw', false);
  source(mw('https://strategywiki.org/w/api.php', q, 2).then(l => l.map(p => ({ url: p.img, title: p.title }))), 'strategywiki', false);
  if (sgdbOn) source(sgP.then(a => a && a.box ? [{ url: a.box, title: q }] : []), 'sgdb', true);
  const best = await out; clearTimeout(tmr); clearTimeout(tmr2);
  // libretro achada pelo nome exato do arquivo conta como oficial confiável
  let box = best ? best.url : null, src = best ? best.src : 'generica';
  if (src === 'code') src = /gametdb/.test(box) ? 'gametdb' : /steam/.test(box) ? 'steam' : 'xlenore';
  const r = artCache[key] = { box, snap: null, src, v: 3 };
  // fundo e título em segundo plano: SteamGridDB > libretro (Snaps/Titles/Logos) > Steam
  (async () => {
    const sg = await sgP; let snap = sg && sg.snap, logo = sg && sg.logo;
    if (!snap && box && /Named_Boxarts/.test(box)) snap = await firstOk([box.replace('/Named_Boxarts/', '/Named_Snaps/'), box.replace('/Named_Boxarts/', '/Named_Titles/')]);
    else if (!snap && box && /steamstatic/.test(box)) snap = await firstOk([box.replace(/\/[^/]+$/, '/library_hero.jpg')]);
    if (!logo && box && /Named_Boxarts/.test(box)) logo = await firstOk([box.replace('/Named_Boxarts/', '/Named_Logos/')]);
    else if (!logo && box && /steamstatic/.test(box)) logo = await firstOk([box.replace(/\/[^/]+$/, '/logo.png')]);
    if (!snap && !logo) return;
    Object.assign(r, snap ? { snap } : {}, logo ? { logo } : {});
    if (cacheOn && box && artDisk[key]) { artDisk[key] = { ...artDisk[key], ...r }; api('/api/artcache', { method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify({ key, val: artDisk[key] }) }).catch(() => {}); }
  })();
  return r;
}
/* ---------- case 3D: proporção e laterais de cada console ---------- */
const CASES = {
  snes:   { r:1.40, d:.24, spine:'#d8d8d8', txt:'#3a3a3a', rim:0 },
  n64:    { r:1.40, d:.24, spine:'#161616', txt:'#e8e8e8', rim:0 },
  gbc:    { r:1.00, d:.20, spine:'#ececec', txt:'#333',    rim:0 },
  gba:    { r:1.00, d:.20, spine:'#2d2f7a', txt:'#fff',    rim:0 },
  nds:    { r:.89,  d:.12, spine:'#cfd3d7', txt:'#444',    rim:.025, rimc:'#dfe3e7' },
  '3ds':  { r:.89,  d:.12, spine:'#f4f4f4', txt:'#ce181e', rim:.025, rimc:'#fafafa' },
  wii:    { r:.71,  d:.075, spine:'#f5f5f5', txt:'#666',   rim:.03,  rimc:'#fbfbfb' },
  switch: { r:.62,  d:.06, spine:'#e60012', txt:'#fff',    rim:.025, rimc:'#e60012' },
  sms:    { r:.72,  d:.13, spine:'#141414', txt:'#ddd',    rim:.03,  rimc:'#161616' },
  genesis:{ r:.72,  d:.13, spine:'#141414', txt:'#ddd',    rim:.03,  rimc:'#161616' },
  neogeo: { r:.70,  d:.17, spine:'#111',    txt:'#e5c100', rim:0 },
  ps1:    { r:1.00, d:.075, spine:'#1b1b1b', txt:'#bbb',   rim:.02,  rimc:'rgba(35,35,35,.92)' },
  ps2:    { r:.70,  d:.075, spine:'#0a0a0a', txt:'#8fb0ff', rim:.03, rimc:'#0d0d0d' },
  psp:    { r:.58,  d:.08, spine:'#dcdcdc', txt:'#333',    rim:.025, rimc:'rgba(225,225,225,.92)' },
  pc:     { r:.667, d:.1,  spine:'#1b2838', txt:'#66c0f4', rim:.02, rimc:'#171a21' },
  ps3:    { r:.81,  d:.07, spine:'#10295c', txt:'#fff',    rim:.025, rimc:'#1c3f86' },
};
const ratioCache = {};
function spineLogo(url, my) {   // logo do SteamGridDB na lateral, só depois de carregada (antes: texto)
  const u = cp(url);
  const sp0 = $('art').querySelector('.spine .spl'); if (sp0 && sp0.getAttribute('src') === u) { lastArt.logo = u; return; }   // já está na lombada
  loadImg(u).then(ok => { if (!ok || my !== artReq) return; const sp = $('art').querySelector('.spine'); if (!sp) return; sp.innerHTML = `<img class="spl" src="${esc(u)}" alt="">`; lastArt.logo = u; });
}
function loadRatio(url) { return new Promise(ok => { const i = new Image(); i.onload = () => { const r = i.naturalWidth > 1 ? i.naturalWidth / i.naturalHeight : null; if (r) ratioCache[url] = r; ok(r); }; i.onerror = () => ok(null); i.src = url; }); }
let coverStyle2d = false;
// balanço da caixa 3D preso a um relógio único: recriar/trocar a capa nunca reinicia nem "estala" o movimento
const swayPhase = () => (-(performance.now() % 3000) / 1000).toFixed(3) + 's';
function buildCase(g, url, back, ratio) {
  const base = CASES[sys.type === 'pc' ? 'pc' : sys.id] || { r:.72, d:.1, spine:'#222', txt:'#ddd', rim:0 };
  const gen = base.txt;   // cor da capa genérica
  const c = Object.assign({}, base, { spine:'#0b0b0b', txt:'#fff', rimc:'#0b0b0b', rim: base.rim || .02 });
  if (url && ratio) c.r = Math.max(.45, Math.min(2.2, ratio));
  const vhs = sys.type === 'video';   // filmes e vídeos: fita VHS (formato fixo)
  if (vhs) Object.assign(c, { r: 1.78, d: .2, rim: 0, rimc: '#121212' });   // formato real da capa (varia por país/versão)   // bordas pretas, texto branco
  const area = $('art').getBoundingClientRect();
  const small = area.width < 400, fh = small ? .8 : .52, fw = small ? .78 : .45;
  const H = Math.max(60, Math.min(area.height * fh, area.width * fw / c.r)), W = H * c.r, D = Math.max(small ? 8 : 14, H * Math.max(c.d, .12));
  const rim = c.rim ? Math.max(1, Math.round(H * c.rim / 2)) : 0;   // borda preta da frente (metade da original)
  const R = Math.max(5, Math.round(H * .035));          // raio das quinas (igual na frente, atrás e nas laterais)
  const px = v => v.toFixed(2) + 'px';
  const face = (cls, w, h, tf, style, html) => `<div class="face ${cls}" style="width:${px(w)};height:${px(h)};left:${px((W - w) / 2)};top:${px((H - h) / 2)};transform:${tf};${style}">${html || ''}</div>`;
  const fs = Math.max(9, D * .36);
  // título da lateral: já desenhado junto com a capa quando a logo é conhecida (mesma velocidade da frente); o texto fica até a imagem carregar
  const ca = cachedArt(g), lg = covers['logo|' + coverKey(g)] || (ca && ca.logo);
  const spineHtml = `<span style="color:var(--etxt, ${c.txt});font-size:${px(fs)}">${esc(cleanTitle(dn(g)) || dn(g))}</span>` +
    (lg ? `<img class="spl" src="${esc(cp(lg))}" alt="" style="opacity:0" onload="this.style.opacity=1;const t=this.previousElementSibling;if(t)t.remove()" onerror="this.remove()">` : '');
  // capa genérica: degradê com cor própria de cada jogo (pelo nome), brilhos suaves e textura leve
  const hh = genHash(dn(g)), hue = hh % 360, hue2 = (hue + 40 + (hh >> 8) % 60) % 360;
  const coverStyle = `background:radial-gradient(120% 80% at 15% 10%, hsla(${hue2},90%,65%,.55), transparent 60%), radial-gradient(90% 70% at 90% 95%, hsla(${hue},85%,55%,.5), transparent 65%), linear-gradient(155deg, hsl(${hue},55%,22%) 0%, hsl(${hue2},45%,12%) 60%, #07080d 100%);`;
  const tex = url ? `<div class="tex" style="position:absolute;inset:0;background:url('${url.replace(/'/g, "%27")}') center/cover no-repeat"></div>` : '';
  const inner = `<div class="generic" style="position:absolute;inset:0;color:#fff"><div class="gx"></div><div class="glg"><img class="lg" src="${logoUrl(sys)}" alt=""></div><img class="ct" src="${ART}controllers/${sys.art}.svg" alt=""><div class="gb"><div class="gt" style="font-size:${px(Math.max(13, W * .095))}">${esc(cleanTitle(dn(g)) || dn(g))}</div><div class="gs" style="font-size:${px(Math.max(8, W * .038))}">${esc(sys.name || '')}</div></div></div>`;
  const edge = vhs ? '#141414' : 'var(--edge, #0b0b0b)';   // cor principal da capa (calculada da imagem), preto enquanto não sabe
  if (coverStyle2d) {   // 2D: encarte esticado — lombada (logo/nome deitados) encostada na frente, moldura preta
    const S = Math.max(small ? 14 : 22, W * .11), F = Math.max(4, Math.round(H * .025));
    return `<div class="cw c2d"><div class="flip${back ? ' back' : ''}"><div class="flat2d" style="--fr:${F}px">` +
      `<div class="spine" style="width:${px(S)};height:${px(H)};--sh:${px(H * .85)};--sw:${px(S * .8)}"><span style="color:#fff;font-size:${px(Math.max(9, S * .42))}">${esc(cleanTitle(dn(g)) || dn(g))}</span></div>` +
      `<div class="front" style="width:${px(W)};height:${px(H)}"><div style="position:absolute;inset:0;${coverStyle}"></div>${inner}${tex}</div>` +
      `</div></div></div>`;
  }
  const rimStyle = `border:${rim}px solid var(--edge, ${c.rimc});box-sizing:border-box;border-radius:${R}px;`;
  // quinas arredondadas: fatias finas formando um quarto de cilindro em cada canto, unindo frente, laterais, topo e fundo
  let corners = '';
  const N = 8, seg = (Math.PI * R / 2) / N + 1.5, O = 2;   // O = sobreposição para não sobrar fresta entre as faces
  [[R, R, 180], [W - R, R, 270], [W - R, H - R, 0], [R, H - R, 90]].forEach(([cx, cy, a0]) => {
    for (let k = 0; k < N; k++) {
      const th = (a0 + (k + .5) * 90 / N) * Math.PI / 180;
      const x = cx + R * Math.cos(th) - W / 2, y = cy + R * Math.sin(th) - H / 2;
      const shade = .55 + .45 * Math.max(0, Math.cos(th - Math.PI * 1.25));
      corners += face('corner', seg, D + O, `translate3d(${px(x)},${px(y)},0) rotateZ(${(th * 180 / Math.PI + 90).toFixed(2)}deg) rotateX(90deg)`, `background:${edge};backface-visibility:visible;`);
    }
  });
  return `<div class="cw" style="transform:${scaleTf()}"><div class="rot" style="transform:${viewTf()};transform-style:preserve-3d"><div class="flip${back ? ' back' : ''}"><div class="case3d" style="width:${px(W)};height:${px(H)};animation-delay:${swayPhase()}">` +
    (vhs ? face('front vhsf', W, H, `translateZ(${px(D / 2)})`, `background:#141414;border-radius:${R}px;`, vhsFront(g, W, H, coverStyle, tex)) :
    face('front', W, H, `translateZ(${px(D / 2)})`, rimStyle + `background-color:var(--edge, ${c.rimc});`, `<div style="position:absolute;inset:0;background-size:cover;background-position:center;${coverStyle}"></div>${inner}${tex}`)) +
    face('back', W, H, `rotateY(180deg) translateZ(${px(D / 2)})`, `background:${edge};border-radius:${R}px;`) +
    face('spine', D + O, H - 2 * R + O, `rotateY(-90deg) translateZ(${px(W / 2)})`, `--sh:${px((H - 2 * R) * .85)};--sw:${px(D * .8)};background:${edge};`, spineHtml) +
    face('side', D + O, H - 2 * R + O, `rotateY(90deg) translateZ(${px(W / 2)})`, `background:${edge};`) +
    face('top', W - 2 * R + O, D + O, `rotateX(90deg) translateZ(${px(H / 2)})`, `background:${edge};`) +
    face('bottom', W - 2 * R + O, D + O, `rotateX(-90deg) translateZ(${px(H / 2)})`, `background:${edge};`) +
    corners +
    [-.25, 0, .25].map(z => face('core', W - 2, H - 2, `translateZ(${px(D * z)})`, `background:${edge};border-radius:${R}px;backface-visibility:visible;`)).join('') +
    `</div></div></div></div>`;
}
// frente da fita VHS: etiqueta com a imagem do vídeo, janela com os dois rolos e detalhes do plástico
function vhsFront(g, W, H, coverStyle, tex) {
  const t = esc(cleanTitle(dn(g)) || dn(g)), fs = Math.max(11, W * .045);
  return `<div class="vhs"><div class="vlab"><div class="generic" style="position:absolute;inset:0;${coverStyle}"><div class="vgt" style="font-size:${(fs * 1.4).toFixed(1)}px">${t}</div></div>${tex}<div class="vband"><span style="font-size:${fs.toFixed(1)}px">${t}</span><b>VHS</b></div></div>` +
    `<div class="vwin"><i class="reel l"></i><i class="reel r"></i><b class="tape"></b></div><i class="vscrew a"></i><i class="vscrew b"></i><i class="vgrip"></i></div>`;
}
let artReq = 0, lastArt = null;
// fundo automático do jogo (quando a capa não trouxe um): SteamGridDB (heroes) > Steam (library_hero) > tela/título do jogo (libretro)
const bgFind = {};
async function findBg(g) {
  const key = 'bga|' + coverKey(g);
  if (key in bgFind) return bgFind[key];
  if (cacheOn && artDisk[key]) return bgFind[key] = artDisk[key].snap || null;
  return bgFind[key] = (async () => {
    const s = (typeof sysOf === 'function' && sysOf(g)) || sys || {}, q = cleanTitle(dn(g)) || dn(g);
    let u = null;
    try { if (sgdbOn) { const id = await sgdbGame(g); if (id) { const h = await sg(`/api/v2/heroes/game/${id}?${STATIC}`).catch(() => []); if (h[0]) u = h[0].url; } } } catch (e) {}
    if (!u) try { const m = (await idCovers(g).catch(() => []) || []).map(x => (x || '').match(/steam\/apps\/(\d+)/)).find(Boolean); if (m) u = await firstOk([`${STEAM}${m[1]}/library_hero.jpg`]); } catch (e) {}
    if (!u && s.thumbs) try { await loadThumbIndex(s); const b = boxartUrls(s, g.name); const alt = []; b.forEach(x => alt.push(x.replace('/Named_Boxarts/', '/Named_Snaps/'), x.replace('/Named_Boxarts/', '/Named_Titles/'))); u = await firstOk(alt); } catch (e) {}
    if (!u) try { const it = (await steamSearch(q)).map(x => ({ x, ...relevance(q, x.name) })).filter(x => x.phrase || x.overlap >= .8).sort((a, b) => (b.phrase - a.phrase) || (b.overlap - a.overlap))[0]; if (it) u = await firstOk([`${STEAM}${it.x.id}/library_hero.jpg`]); } catch (e) {}
    if (cacheOn) { artDisk[key] = { snap: u || '', src: 'bg' }; api('/api/artcache', { method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify({ key, val: artDisk[key] }) }).catch(() => {}); }
    return bgFind[key] = u;
  })();
}

// enquanto houver capa genérica na tela, continua procurando a imagem de verdade (a cada 3 s; só o que está visível)
setInterval(() => {
  if (document.hidden || (typeof gameOn !== 'undefined' && gameOn)) return;
  if (typeof screen === 'undefined') return;
  if (screen === 'games' && typeof shown !== 'undefined') {
    const g = shown[gIdx];
    if (g && lastArt && lastArt.g === g && !lastArt.url && !covers[coverKey(g)]) resolveArt(g, true).then(a => { if (a && a.box && shown[gIdx] === g && screen === 'games') showArt(g); });
  } else if (screen === 'favgrid' && typeof fgArt === 'function') {
    [...document.querySelectorAll('#fgTrack .fgcard:not(.has)')].slice(0, 4).forEach(el => fgArt(+el.dataset.i, el));
  }
}, 2000);

// renomeou: as imagens automáticas (capa, fundo, título) são buscadas de novo com o nome novo
function artForget(g) {
  const key = coverKey(g);
  for (const k of [key, 'bga|' + key]) { delete artCache[k]; if (artDisk[k]) { delete artDisk[k]; api('/api/artcache', { method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify({ key: k, val: null }) }).catch(() => {}); } }
  delete bgFind['bga|' + key]; if (typeof sgdbCache !== 'undefined') delete sgdbCache[key];
}
