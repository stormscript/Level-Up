// Sincronização em modo simples: ativar com um toque, ligar outro dispositivo com um link.
import { syncStatus, onSyncStatus, enableNew, linkExisting, disable, syncNow, ping, linkFor } from '../sync.js';
import { formatSyncId } from '../engine/sync.js';
import { esc, el } from '../ui/dom.js';
import { openSheet, actionSheet } from '../ui/sheet.js';
import { toast, glow } from '../ui/effects.js';

export function syncLabel(st = syncStatus()) {
  if (!st.enabled) return 'Desligada';
  if (st.state === 'syncing') return 'A sincronizar…';
  if (st.state === 'error') return 'Erro · toca para ver';
  if (st.state === 'offline') return 'Sem internet';
  if (!st.lastSync) return 'Ligada';
  const s = Math.round((Date.now() - st.lastSync) / 1000);
  if (s < 60) return 'Sincronizado agora';
  if (s < 3600) return `Sincronizado há ${Math.round(s / 60)} min`;
  return `Sincronizado às ${new Date(st.lastSync).toLocaleTimeString('pt-PT', { hour: '2-digit', minute: '2-digit' })}`;
}

const REASONS = {
  offline: { t: 'Sem internet', d: 'Liga-te à internet e tenta outra vez.' },
  nofunction: {
    t: 'A função de sincronização não está publicada',
    d: `A app tem de estar aberta pelo endereço do <b>Netlify</b> (não o do GitHub Pages) e o Netlify tem de ter publicado a função.
        <ol><li>Abre <b>app.netlify.com</b> → o teu projeto → <b>Deploys</b>.</li>
        <li>O último deploy deve estar <b>Published</b> e dizer <b>"1 function"</b>.</li>
        <li>Se falhou, toca nele e copia-me o erro do log.</li></ol>`,
  },
  server: { t: 'O servidor respondeu com erro', d: 'Normalmente é o armazenamento do Netlify (Blobs). Envia-me o detalhe abaixo.' },
};

/** Partilha o link de ligação (AirDrop, WhatsApp, email…) ou copia-o. */
async function shareLink(code) {
  const url = linkFor(code);
  try {
    if (navigator.share) await navigator.share({ title: 'Ligar a LevelUp', text: 'Abre este link no outro dispositivo para sincronizar:', url });
    else { await navigator.clipboard.writeText(url); toast('Link copiado'); }
  } catch (e) {
    if (e?.name !== 'AbortError') { try { await navigator.clipboard.writeText(url); toast('Link copiado'); } catch { toast(url); } }
  }
}

export function openSyncSheet() {
  const body = el('<div class="form sync-form"></div>');
  let mode = 'menu'; // menu | link
  let busy = false;
  let diag = null; // resultado do ping
  let unsub = null;
  const sheet = openSheet({ title: 'Sincronização', body, leftLabel: 'Fechar', size: 'large', onClose: () => unsub?.() });

  const diagHTML = () => {
    if (!diag || diag.ok) return '';
    const r = REASONS[diag.reason] || REASONS.server;
    return `<div class="sync-diag"><b>⚠︎ ${r.t}</b><div>${r.d}</div>${diag.detail ? `<code>${esc(diag.detail)}</code>` : ''}
      <button type="button" class="btn-secondary small-btn" data-act="retry">Testar outra vez</button></div>`;
  };

  function render() {
    const st = syncStatus();
    if (st.enabled && !st.code) {
      // Ligação antiga (com frase-passe): passa para o modo simples.
      body.innerHTML = `
        <div class="sync-hero"><div class="sync-icon">⇅</div><h3>Atualiza a ligação</h3>
          <p class="muted">A sincronização ficou mais simples (sem frase-passe). Recria a ligação com um toque.</p></div>
        <div class="form-actions"><button type="button" class="btn-primary" data-act="recreate">Recriar ligação</button></div>`;
      return;
    }
    if (st.enabled) {
      body.innerHTML = `
        <div class="sync-hero on">
          <div class="sync-icon">⇅</div>
          <h3>${esc(syncLabel(st))}</h3>
          <p class="muted small">${st.state === 'error' ? esc(st.message) : 'Os teus dispositivos ficam iguais sozinhos. Encriptado de ponta a ponta.'}</p>
        </div>
        ${diagHTML()}
        <div class="sync-steps">
          <div class="sync-step"><span>1</span><div><b>Envia o link para o outro dispositivo</b><small>AirDrop, WhatsApp, email para ti…</small></div></div>
          <div class="sync-step"><span>2</span><div><b>Abre-o lá</b><small>A app liga-se sozinha e junta os dados.</small></div></div>
        </div>
        <div class="form-actions">
          <button type="button" class="btn-primary" data-act="share">Enviar link de ligação</button>
          <button type="button" class="btn-secondary" data-act="now" ${busy ? 'disabled' : ''}>Sincronizar agora</button>
        </div>
        <div class="group-header">Ou escreve este código no outro dispositivo</div>
        <div class="code-box"><code>${esc(formatSyncId(st.code))}</code><button type="button" class="pill-btn" data-act="copy">Copiar</button></div>
        <p class="group-footer">Guarda o código como uma palavra-passe: quem o tiver vê os teus dados.</p>
        <div class="form-actions"><button type="button" class="btn-destructive" data-act="off">Desligar neste dispositivo</button></div>`;
      return;
    }
    if (mode === 'link') {
      body.innerHTML = `
        <div class="sync-hero"><div class="sync-icon">⇅</div><h3>Ligar a outro dispositivo</h3>
          <p class="muted">Cola o <b>link</b> ou o <b>código</b> que aparece no outro dispositivo, em ⚙️ → Sincronização.</p></div>
        ${diagHTML()}
        <form data-form novalidate autocomplete="off">
          <div class="group"><div class="cell"><input name="code" type="text" autocapitalize="characters" spellcheck="false" placeholder="Link ou código" aria-label="Link ou código"></div></div>
          <p class="sync-error" data-err></p>
          <div class="form-actions">
            <button type="submit" class="btn-primary" ${busy ? 'disabled' : ''}>${busy ? 'A ligar…' : 'Ligar'}</button>
            <button type="button" class="btn-secondary" data-mode="menu">Voltar</button>
          </div>
        </form>`;
      return;
    }
    body.innerHTML = `
      <div class="sync-hero">
        <div class="sync-icon">⇅</div>
        <h3>iPhone e PC sempre iguais</h3>
        <p class="muted">Um toque para ativar. Depois envias um link para o outro dispositivo e pronto.</p>
      </div>
      ${diagHTML()}
      <p class="sync-error" data-err></p>
      <div class="form-actions">
        <button type="button" class="btn-primary" data-act="enable" ${busy ? 'disabled' : ''}>${busy ? 'A ativar…' : 'Ativar sincronização'}</button>
        <button type="button" class="btn-secondary" data-mode="link">Já ativei noutro dispositivo</button>
      </div>
      <ul class="sync-notes">
        <li>Ativa no dispositivo onde tens os dados (ex.: iPhone) e depois liga os outros.</li>
        <li>Os dados são encriptados no dispositivo. No servidor fica só texto ilegível.</li>
        <li>Ao ligar, os dados dos dois juntam-se: nada se perde.</li>
      </ul>`;
  }

  const runPing = async () => { diag = await ping(); render(); return diag; };

  body.addEventListener('click', async (e) => {
    const m = e.target.closest('[data-mode]');
    if (m) { mode = m.dataset.mode; return render(); }
    const a = e.target.closest('[data-act]')?.dataset.act;
    if (!a) return;
    const st = syncStatus();
    if (a === 'retry') { const d = await runPing(); if (d.ok) toast('Servidor OK ✦'); return; }
    if (a === 'enable' || a === 'recreate') {
      if (a === 'recreate') disable();
      busy = true; render();
      const d = await ping();
      if (!d.ok) { busy = false; diag = d; return render(); }
      try { await enableNew(); glow(); toast('Sincronização ativa ✦'); }
      catch (ex) { busy = false; render(); const err = body.querySelector('[data-err]'); if (err) err.textContent = ex.message; return; }
      busy = false; diag = null; render();
      return;
    }
    if (a === 'share') return shareLink(st.code);
    if (a === 'copy') {
      try { await navigator.clipboard.writeText(formatSyncId(st.code)); toast('Código copiado'); } catch { toast(formatSyncId(st.code)); }
    }
    if (a === 'now') {
      busy = true; render();
      const r = await syncNow();
      busy = false;
      if (r) toast('Sincronizado ✦'); else await runPing();
      render();
    }
    if (a === 'off') {
      const ok = await actionSheet({
        title: 'Desligar a sincronização neste dispositivo?',
        message: 'Os dados ficam neste dispositivo, mas deixam de acompanhar os outros.',
        actions: [{ label: 'Desligar', destructive: true }],
      });
      if (ok) { disable(); mode = 'menu'; render(); toast('Sincronização desligada'); }
    }
  });

  body.addEventListener('submit', async (e) => {
    e.preventDefault();
    if (busy) return;
    const value = e.target.elements.code.value;
    busy = true; render();
    body.querySelector('input[name=code]').value = value;
    const d = await ping();
    if (!d.ok) { busy = false; diag = d; render(); body.querySelector('input[name=code]').value = value; return; }
    try {
      await linkExisting(value);
      busy = false; diag = null; glow(); toast('Ligado. Dados juntos ✦', { long: true }); render();
    } catch (ex) {
      busy = false; render();
      body.querySelector('input[name=code]').value = value;
      body.querySelector('[data-err]').textContent = ex.message;
    }
  });

  unsub = onSyncStatus(() => { if (!busy) render(); });
  render();
  // Se houver erro, faz logo o diagnóstico.
  if (syncStatus().state === 'error') runPing();
}

/** Abriste um link "#ligar=…": pergunta e liga. */
export async function handleLinkHash() {
  const m = location.hash.match(/ligar=([A-Za-z2-7-]+)/);
  if (!m) return;
  history.replaceState(null, '', location.pathname + location.search);
  const st = syncStatus();
  if (st.enabled && st.code && st.code === m[1].toUpperCase().replace(/-/g, '')) return toast('Este dispositivo já está ligado ✦');
  const ok = await actionSheet({
    title: 'Ligar este dispositivo à sincronização?',
    message: 'Os dados deste dispositivo juntam-se aos do outro. Nada se perde.',
    actions: [{ label: 'Ligar', value: true }],
  });
  if (!ok) return;
  const d = await ping();
  if (!d.ok) { toast('Não consegui falar com o servidor. Abre ⚙️ → Sincronização.', { long: true }); return; }
  try {
    if (st.enabled) disable();
    await linkExisting(m[1]);
    glow();
    toast('Ligado. Dados juntos ✦', { long: true });
  } catch (e) {
    toast(e.message, { long: true });
  }
}
