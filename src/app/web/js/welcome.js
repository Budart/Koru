// Koru — welcome.js
/* ---------- boas-vindas (primeira abertura) ---------- */
// passo 1: como organizar as pastas (ilustrado) — sem sugerir nenhum caminho
const WF = '<svg viewBox="0 0 24 24"><path d="M3 6.5A1.5 1.5 0 0 1 4.5 5h4l2 2h9A1.5 1.5 0 0 1 21 8.5v9a1.5 1.5 0 0 1-1.5 1.5h-15A1.5 1.5 0 0 1 3 17.5z" fill="#f5b942"/></svg>';
const WE = '<svg viewBox="0 0 24 24"><rect x="4" y="4" width="16" height="16" rx="3" fill="#2F6BFF"/><path d="M9 9l6 3-6 3z" fill="#fff"/></svg>';
const wrow = (lvl, ico, name, note) => `<div class="wt" style="--l:${lvl}">${ico}<b>${name}</b>${note ? `<i>${note}</i>` : ''}</div>`;
const WEL_TREE = `<span>Uma pasta para cada console. O Koru configura o resto sozinho.</span>
<div class="wtree">
  ${wrow(0, WF, 'Emuladores', '')}
  ${wrow(1, WF, 'PlayStation', '')}
  ${wrow(2, WF, 'ROMs', '')}
  ${wrow(2, WE, 'Emulador de PS1', '')}
  ${wrow(1, WF, 'Super Nintendo', '')}
  ${wrow(1, WF, '…', '')}
</div>`;
function runWelcome() {
  return new Promise(async resolve => {
    show('welcome'); let st = 0; const picks = { root: '', pc: '', video: '', sgdbKey: '', pcDirs: [] };
    let suggest = '', stores = []; try { const r = await api('/api/setup'); suggest = r.suggest || ''; stores = (r.stores || []).map(x => ({ ...x, on: !!x.exists })); } catch (e) {}
    const syncPc = () => { picks.pcDirs = stores.filter(x => x.on && x.path.trim()).map(x => x.path.trim()); };
    const steps = [
      { k: 'root', n: 'Passo 1 de 4', t: 'Onde estão seus emuladores?', p: 'Escolha a pasta principal onde ficam os emuladores e as ROMs (uma subpasta por console). O Koru encontra tudo sozinho.', skip: false },
      { k: 'pc', n: 'Passo 2 de 4', t: 'E os seus jogos de PC?', p: 'Marque a Steam para usar a pasta padrão dos atalhos dela (dá para trocar). Para outras lojas ou pastas, use "Outra pasta...". Se não quiser, é só pular.', skip: true },
      { k: 'video', n: 'Passo 3 de 4 · opcional', t: 'Quer ver filmes e vídeos também?', p: 'Escolha a pasta dos seus filmes, séries ou vídeos. Eles tocam no próprio Koru, em qualquer formato, com legendas. Se não quiser, é só pular.', skip: true },
      { k: 'sgdbKey', n: 'Passo 4 de 4 · opcional', t: 'Opcional: quer ainda mais opções de capas?', key: true, skip: true },
    ];
    const upd = () => { const s = steps[st]; if (!s.key) $('wNext').disabled = !picks[s.k] && !(s.k === 'pc' && picks.pcDirs.length) && !s.skip; };
    const render = () => {
      const s = steps[st];
      $('wStepN').textContent = s.n; $('wTitle').textContent = s.t;
      if (s.key) {   // SteamGridDB: explica, guia com links e recebe a chave
        $('wText').innerHTML = `<div class="wopt"><b>Este passo é opcional — pode pular.</b> O Koru já encontra capas e fundos sozinho em várias fontes gratuitas. A chave do SteamGridDB só aumenta as opções, e dá para configurar depois em Configuração → Capas e vídeo.</div>` + SGDB_HELP + `<input id="wKey" type="password" autocomplete="new-password" spellcheck="false" placeholder="Cole aqui a chave da API" value="${esc(picks.sgdbKey)}" style="width:100%;margin-top:10px;background:#0e0b1a;border:1px solid #4a3f70;color:#fff;border-radius:8px;padding:10px 12px;font-size:14px">`;
        bindLinks($('wText')); $('wKey').oninput = () => { picks.sgdbKey = $('wKey').value.trim(); $('wNext').disabled = !picks.sgdbKey; };
        $('wPath').style.display = 'none'; $('wPick').style.display = 'none';
      } else { if (s.k === 'root') $('wText').innerHTML = WEL_TREE; else $('wText').textContent = s.p; $('wPath').style.display = ''; $('wPick').style.display = ''; }
      const ws = $('wStores'); ws.style.display = s.k === 'pc' && stores.length ? '' : 'none';
      if (s.k === 'pc') {
        ws.innerHTML = stores.map((x, j) => `<div class="wst${x.on ? ' on' : ''}" data-j="${j}"><label><input type="checkbox"${x.on ? ' checked' : ''}> ${esc(x.name)}${x.exists ? '' : ' <i>(pasta não encontrada neste PC)</i>'}</label><div class="wsrow"><input type="text" spellcheck="false" value="${esc(x.path)}"><button class="btn sec">...</button></div></div>`).join('');
        ws.querySelectorAll('.wst').forEach(el => { const x = stores[+el.dataset.j], cb = el.querySelector('input[type=checkbox]'), tb = el.querySelector('input[type=text]');
          cb.onchange = () => { x.on = cb.checked; el.classList.toggle('on', x.on); syncPc(); upd(); if (x.on) tb.focus(); };
          tb.oninput = () => { x.path = tb.value; syncPc(); upd(); };
          el.querySelector('button').onclick = async () => { try { const r = await api('/api/browse', { method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify({ type: 'folderabs', start: x.path }) }); if (r.path) { x.path = tb.value = r.path; syncPc(); upd(); sfx('ok'); } } catch (e) { toast(e.message, true); } };
        });
        syncPc(); $('wPick').textContent = 'Outra pasta...';
      } else $('wPick').textContent = 'Escolher pasta...';
      $('wPath').textContent = picks[s.k] || (s.k === 'pc' && stores.length ? 'Nenhuma outra pasta' : 'Nenhuma pasta escolhida'); $('wPath').classList.toggle('ok', !!picks[s.k]);
      $('wSkip').style.display = s.skip ? '' : 'none';
      $('wBack').style.display = st > 0 ? '' : 'none';
      $('wNext').textContent = st === steps.length - 1 ? 'Concluir' : 'Continuar'; upd();
      $('wSkip').textContent = s.key ? 'Pular e concluir' : 'Pular'; $('wSkip').classList.toggle('wprim', !!s.key);
      if (s.key) { $('wNext').textContent = 'Salvar chave e concluir'; $('wNext').disabled = !picks.sgdbKey; }
    };
    $('wPick').onclick = async () => {
      try { const r = await api('/api/browse', { method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify({ type: 'folderabs', start: picks[steps[st].k] || '' }) }); if (r.path) { picks[steps[st].k] = r.path; sfx('ok'); render(); } } catch (e) { toast(e.message, true); }
    };
    const next = async () => {
      if (st < steps.length - 1) { st++; sfx('move'); render(); return; }
      $('wTitle').textContent = 'Preparando tudo...'; $('wText').textContent = 'Procurando consoles, emuladores e jogos. Isso leva só alguns segundos.';
      $('wPath').style.display = 'none'; document.querySelector('.wbtns').style.display = 'none'; $('wStepN').textContent = '';
      try { const r = await api('/api/setup', { method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify(picks) }); sfx('launch'); toast(`${r.consoles} consoles encontrados!`); }
      catch (e) { toast('Erro: ' + e.message, true); }
      setTimeout(() => { location.href = '/'; }, 700);
    };
    $('wNext').onclick = next;
    $('wBack').onclick = () => { if (st > 0) { st--; sfx('back'); render(); } };
    $('wSkip').onclick = () => { picks[steps[st].k] = ''; if (steps[st].k === 'pc') { stores.forEach(x => x.on = false); picks.pcDirs = []; } next(); };
    render();
    setTimeout(() => $('wCard').classList.add('on'), 850);   // logo aparece e some em menos de 1 s
  });
}
