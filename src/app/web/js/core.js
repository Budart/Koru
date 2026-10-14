// Koru — core.js
const ART = 'https://raw.githubusercontent.com/fabricecaruso/es-theme-carbon/master/art/';
const THUMBS = 'https://raw.githubusercontent.com/libretro-thumbnails/';
const $ = id => document.getElementById(id);
const esc = s => String(s).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const fmtSize = b => b > 1e9 ? (b/1e9).toFixed(2)+' GB' : b > 1e6 ? (b/1e6).toFixed(1)+' MB' : Math.max(1,Math.round(b/1e3))+' KB';
let systems = [], sysIdx = 0, sys = null, games = [], shown = [], gIdx = 0, screen = 'systems';
const gameCache = {}, thumbIndex = {};

async function api(url, opts) { const r = await fetch(url, opts); const t = await r.text(); const d = t ? JSON.parse(t) : []; if (!r.ok) throw new Error(d.error || r.status); return d; }
function toast(msg, err) { const t = $('toast'); t.textContent = msg; t.className = 'show' + (err ? ' err' : ''); clearTimeout(t._h); t._h = setTimeout(() => t.className = '', 3500); }
const BUILTIN_LOGOS = { video: 'data:image/svg+xml;charset=utf-8,%3Csvg%20xmlns%3D%22http%3A//www.w3.org/2000/svg%22%20viewBox%3D%220%200%20560%20120%22%3E%3Cg%20fill%3D%22none%22%20stroke%3D%22%23f1ece3%22%20stroke-width%3D%227%22%20stroke-linejoin%3D%22round%22%3E%3Crect%20x%3D%2240%22%20y%3D%2230%22%20width%3D%2278%22%20height%3D%2260%22%20rx%3D%228%22/%3E%3Cpath%20d%3D%22M40%2046h78M40%2074h78M58%2030v60M100%2030v60%22/%3E%3C/g%3E%3Cpath%20d%3D%22M74%2048l18%2012-18%2012z%22%20fill%3D%22%233D7BFF%22/%3E%3Ctext%20x%3D%22146%22%20y%3D%2278%22%20font-family%3D%22Segoe%20UI%2CPoppins%2Csans-serif%22%20font-weight%3D%22700%22%20font-size%3D%2246%22%20letter-spacing%3D%223%22%20fill%3D%22%23f1ece3%22%3EFILMES%20E%20V%C3%8DDEOS%3C/text%3E%3C/svg%3E', fav: 'data:image/svg+xml;charset=utf-8,%3Csvg%20xmlns%3D%22http%3A//www.w3.org/2000/svg%22%20viewBox%3D%220%200%20560%20120%22%3E%3Cdefs%3E%3ClinearGradient%20id%3D%22f%22%20x1%3D%220%22%20y1%3D%220%22%20x2%3D%221%22%20y2%3D%221%22%3E%3Cstop%20offset%3D%220%22%20stop-color%3D%22%23ffd84a%22/%3E%3Cstop%20offset%3D%221%22%20stop-color%3D%22%23ff8a00%22/%3E%3C/linearGradient%3E%3C/defs%3E%3Cpath%20d%3D%22M60%208l15%2031%2034%205-25%2024%206%2034-30-16-30%2016%206-34-25-24%2034-5z%22%20fill%3D%22url%28%23f%29%22/%3E%3Ctext%20x%3D%22130%22%20y%3D%2284%22%20font-family%3D%22Segoe%20UI%20Variable%20Display%2CSegoe%20UI%2CArial%2Csans-serif%22%20font-weight%3D%22800%22%20font-size%3D%2262%22%20letter-spacing%3D%223%22%20fill%3D%22%23161616%22%3EFAVORITOS%3C/text%3E%3C/svg%3E', pc: 'data:image/svg+xml;charset=utf-8,%3Csvg%20xmlns%3D%22http%3A//www.w3.org/2000/svg%22%20viewBox%3D%220%200%20540%20120%22%3E%3Cdefs%3E%3ClinearGradient%20id%3D%22g%22%20x1%3D%220%22%20y1%3D%220%22%20x2%3D%221%22%20y2%3D%221%22%3E%3Cstop%20offset%3D%220%22%20stop-color%3D%22%237c3aed%22/%3E%3Cstop%20offset%3D%221%22%20stop-color%3D%22%2306b6d4%22/%3E%3C/linearGradient%3E%3C/defs%3E%3Crect%20x%3D%224%22%20y%3D%2210%22%20width%3D%22100%22%20height%3D%22100%22%20rx%3D%2226%22%20fill%3D%22url%28%23g%29%22/%3E%3Crect%20x%3D%2225%22%20y%3D%2233%22%20width%3D%2258%22%20height%3D%2239%22%20rx%3D%226%22%20fill%3D%22none%22%20stroke%3D%22%23fff%22%20stroke-width%3D%227%22/%3E%3Crect%20x%3D%2245%22%20y%3D%2277%22%20width%3D%2218%22%20height%3D%228%22%20rx%3D%222%22%20fill%3D%22%23fff%22/%3E%3Crect%20x%3D%2235%22%20y%3D%2286%22%20width%3D%2238%22%20height%3D%227%22%20rx%3D%223.5%22%20fill%3D%22%23fff%22/%3E%3Ctext%20x%3D%22128%22%20y%3D%2285%22%20font-family%3D%22Segoe%20UI%20Variable%20Display%2CSegoe%20UI%2CArial%2Csans-serif%22%20font-weight%3D%22800%22%20font-size%3D%2264%22%20letter-spacing%3D%223%22%20fill%3D%22%23161616%22%3EPC%20GAMES%3C/text%3E%3C/svg%3E', pc2: 'data:image/svg+xml;charset=utf-8,%3Csvg%20xmlns%3D%22http%3A//www.w3.org/2000/svg%22%20viewBox%3D%220%200%20540%20120%22%3E%3Cdefs%3E%3ClinearGradient%20id%3D%22h%22%20x1%3D%220%22%20y1%3D%220%22%20x2%3D%221%22%20y2%3D%220%22%3E%3Cstop%20offset%3D%220%22%20stop-color%3D%22%23ff2d75%22/%3E%3Cstop%20offset%3D%22.5%22%20stop-color%3D%22%238b5cf6%22/%3E%3Cstop%20offset%3D%221%22%20stop-color%3D%22%2300d4ff%22/%3E%3C/linearGradient%3E%3C/defs%3E%3Cpath%20d%3D%22M20%2030h86l-8%2060H12z%22%20fill%3D%22url%28%23h%29%22/%3E%3Cpath%20d%3D%22M40%2048h46M34%2062h46M28%2076h46%22%20stroke%3D%22%23fff%22%20stroke-width%3D%226%22%20stroke-linecap%3D%22round%22/%3E%3Ctext%20x%3D%22128%22%20y%3D%2284%22%20font-family%3D%22Segoe%20UI%20Variable%20Display%2CSegoe%20UI%2CArial%2Csans-serif%22%20font-style%3D%22italic%22%20font-weight%3D%22900%22%20font-size%3D%2266%22%20fill%3D%22url%28%23h%29%22%3EPC%20GAMING%3C/text%3E%3C/svg%3E' };
{ const favSrc = BUILTIN_LOGOS.fav; Object.defineProperty(BUILTIN_LOGOS, 'fav', { get: () => LANG === 'en' ? favSrc.replace('FAVORITOS', 'FAVORITES') : favSrc }); }   // logo do Favoritos no idioma do app
function bgUrlOf(s) {
  const b = s.bg || '';
  if (b.startsWith('art:')) return `${ART}background/${b.slice(4)}.jpg`;
  if (!b && s.type === 'video') return '';
  return b || `${ART}background/${s.type === 'pc' ? 'steam' : s.art}.jpg`;   // PC: fundo padrão "steam"
}
/* ---------- imagens do tema com reserva: se a original sumir/quebrar, usa a 2ª opção automaticamente ----------
   1) a própria imagem guardada no cache do Koru (depois da 1ª vez, funciona mesmo se o site sair do ar)
   2) espelho do mesmo repositório (jsDelivr)
   2b) outro repositório com o mesmo tema (RetroPie/es-theme-carbon), direto e pelo jsDelivr
   3) desenho embutido no app, nas cores do Koru (fundo em degradê / controle genérico) */
const ART_MIRROR = 'https://cdn.jsdelivr.net/gh/fabricecaruso/es-theme-carbon@master/art/';
const svgUri = s => 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(s);
const FALLBACK_BG = svgUri(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1920 1080"><defs><radialGradient id="a" cx="30%" cy="25%" r="80%"><stop offset="0" stop-color="#2F6BFF" stop-opacity=".55"/><stop offset=".55" stop-color="#14161c" stop-opacity="0"/></radialGradient><radialGradient id="b" cx="80%" cy="85%" r="70%"><stop offset="0" stop-color="#2F6BFF" stop-opacity=".5"/><stop offset=".6" stop-color="#14161c" stop-opacity="0"/></radialGradient><pattern id="g" width="60" height="60" patternUnits="userSpaceOnUse"><path d="M60 0H0v60" fill="none" stroke="#3D7BFF" stroke-opacity=".07"/></pattern></defs><rect width="1920" height="1080" fill="#14161c"/><rect width="1920" height="1080" fill="url(#g)"/><rect width="1920" height="1080" fill="url(#a)"/><rect width="1920" height="1080" fill="url(#b)"/></svg>`);
const FALLBACK_CTRL = svgUri(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 600 350"><g fill="none" stroke="#F4F4F4" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M170 70h260c70 0 120 60 130 140 8 70-30 110-75 110-35 0-55-25-80-60H195c-25 35-45 60-80 60-45 0-83-40-75-110 10-80 60-140 130-140z"/><path d="M150 150v60M120 180h60"/><circle cx="440" cy="155" r="14"/><circle cx="470" cy="185" r="14"/><circle cx="410" cy="185" r="14"/><circle cx="440" cy="215" r="14"/><path d="M265 135h30M305 135h30"/></g></svg>`);
function artAlts(url) {
  if (!url || typeof url !== 'string') return [];
  const raw = url.startsWith('/api/img?u=') ? decodeURIComponent(url.slice(11).replace(/&k=bg$/, '')) : url;
  if (!raw.startsWith(ART)) return [url];
  const kind = /\/background\//.test(raw) ? 'bg' : /\/controllers\//.test(raw) ? 'ctrl' : 'logo';
  const list = [cp(raw), raw, raw.replace(ART, ART_MIRROR)];
  // 2º repositório, independente: RetroPie/es-theme-carbon (pasta por console: background.jpg / system.svg / controller.svg)
  const m = raw.slice(ART.length).match(/^(background|logos|controllers)\/([^/]+)\.(jpg|png|svg)$/);
  if (m) {
    const f = { background: 'background.jpg', logos: 'system.svg', controllers: 'controller.svg' }[m[1]];
    const rp = `RetroPie/es-theme-carbon/master/${m[2]}/art/${f}`;
    list.push(cp('https://raw.githubusercontent.com/' + rp), 'https://raw.githubusercontent.com/' + rp, 'https://cdn.jsdelivr.net/gh/' + rp.replace('/master/', '@master/'));
  }
  if (kind === 'bg') list.push(FALLBACK_BG); else if (kind === 'ctrl') list.push(FALLBACK_CTRL);
  return [...new Set(list.filter(Boolean))];
}
// primeira opção que carrega (com memória, para não testar de novo)
const artOkMemo = {};
function artResolve(url) {
  const alts = artAlts(url); if (alts.length <= 1) return Promise.resolve(url);
  if (artOkMemo[url]) return artOkMemo[url];
  const tryOne = u => new Promise(ok => { const i = new Image(); const t = setTimeout(() => ok(false), 6000); i.onload = () => { clearTimeout(t); ok(i.naturalWidth > 1); }; i.onerror = () => { clearTimeout(t); ok(false); }; i.src = u; });
  return artOkMemo[url] = (async () => { for (const u of alts) if (await tryOne(u)) return u; return alts[alts.length - 1]; })();
}
// <img> do tema que falhar troca sozinha para a próxima opção
document.addEventListener('error', e => {
  const im = e.target; if (!im || im.tagName !== 'IMG') return;
  const src = im.getAttribute('src') || '';
  if (!im._alts) { const a = artAlts(src); if (a.length <= 1) return; im._alts = a.filter(u => u !== src); }
  const next = im._alts.shift(); if (next) { e.stopImmediatePropagation(); im.src = next; }
}, true);
// fundo via CSS (background-image) com reserva
function setBgImage(el, url) { if (!url) { el.style.backgroundImage = ''; return; } el.style.backgroundImage = `url("${url}")`; artResolve(url).then(u => { if (u !== url && el.style.backgroundImage.includes(url)) el.style.backgroundImage = `url("${u}")`; }); }
function logoUrl(s) {
  const l = s.logo || (s.type === 'pc' ? 'builtin:pc' : s.type === 'video' ? 'builtin:video' : '');
  if (l.startsWith('builtin:')) return BUILTIN_LOGOS[l.slice(8)] || BUILTIN_LOGOS.pc;
  if (l.startsWith('art:')) return `${ART}logos/${l.slice(4)}.svg`;
  if (/^https?:|^data:|^\/api\//.test(l)) return l;
  return `${ART}logos/${s.art}.svg`;
}
function logo(s) { return `<img src="${logoUrl(s)}" alt="${esc(s.name)}" onerror="this.outerHTML='<div class=fallback>${esc(s.name)}</div>'">`; }
function show(id) { screen = id; document.querySelectorAll('.screen').forEach(e => e.classList.toggle('on', e.id === id)); }

// temas: azul (padrão), preto (OLED) e branco
function applyTheme(t) { t = t || 'blue'; document.body.classList.toggle('th-oled', t === 'oled'); document.body.classList.toggle('th-light', t === 'light'); try { localStorage.setItem('theme', t); } catch (e) {} }
try { applyTheme(localStorage.getItem('theme')); } catch (e) {}
