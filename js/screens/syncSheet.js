// Ecrã de configuração da sincronização entre dispositivos.
import { syncStatus, onSyncStatus, enableNew, linkExisting, disable, syncNow } from '../sync.js';
import { formatSyncId, parseSyncId } from '../engine/sync.js';
import { esc, el } from '../ui/dom.js';
import { openSheet, actionSheet } from '../ui/sheet.js';
import { toast, glow } from '../ui/effects.js';

export function syncLabel(st = syncStatus()) {
  if (!st.enabled) return 'Desligada';
  if (st.state === 'syncing') return 'A sincronizar…';
  if (st.state === 'error') return 'Erro';
  if (st.state === 'offline') return 'Sem internet';
  if (!st.lastSync) return 'Ligada';
  const s = Math.round((Date.now() - st.lastSync) / 1000);
  if (s < 60) return 'Sincronizado agora';
  if (s < 3600) return `Sincronizado há ${Math.round(s / 60)} min`;
  return `Sincronizado às ${new Date(st.lastSync).toLocaleTimeString('pt-PT', { hour: '2-digit', minute: '2-digit' })}`;
}

export function openSyncSheet() {
  const body = el('<div class="form sync-form"></div>');
  let mode = 'menu'; // menu | new | link
  let busy = false;
  let unsub = null;
  const sheet = openSheet({ title: 'Sincronização', body, leftLabel: 'Fechar', size: 'large', onClose: () => unsub?.() });

  function render() {
    const st = syncStatus();
    if (st.enabled) {
      body.innerHTML = `
        <div class="sync-hero on">
          <div class="sync-icon">⇅</div>
          <h3>${esc(syncLabel(st))}</h3>
          <p class="muted small">${st.state === 'error' ? esc(st.message) : 'Encriptado de ponta a ponta. Sincroniza sozinho quando mexes e quando abres a app.'}</p>
        </div>
        <div class="group-header">Código desta sincronização</div>
        <div class="code-box"><code>${esc(formatSyncId(st.id))}</code><button type="button" class="pill-btn" data-act="copy">Copiar</button></div>
        <p class="group-footer">Para ligar outro dispositivo: abre a app nele → ⚙️ → Sincronização → <b>Ligar a um dispositivo</b>, e escreve este código e a <b>mesma frase-passe</b>.</p>
        <div class="form-actions">
          <button type="button" class="btn-primary" data-act="now" ${busy ? 'disabled' : ''}>Sincronizar agora</button>
          <button type="button" class="btn-destructive" data-act="off">Desligar neste dispositivo</button>
        </div>`;
      return;
    }
    if (mode === 'menu') {
      body.innerHTML = `
        <div class="sync-hero">
          <div class="sync-icon">⇅</div>
          <h3>iPhone e PC sempre iguais</h3>
          <p class="muted">Os dados são <b>encriptados neste dispositivo</b> com uma frase-passe tua antes de saírem. No servidor fica só texto ilegível.</p>
        </div>
        <div class="form-actions">
          <button type="button" class="btn-primary" data-mode="new">Ativar neste dispositivo (primeira vez)</button>
          <button type="button" class="btn-secondary" data-mode="link">Ligar a um dispositivo que já sincroniza</button>
        </div>
        <ul class="sync-notes">
          <li>Ativa primeiro no dispositivo onde tens os dados (ex.: iPhone) e depois liga os outros.</li>
          <li>Ao ligar, os dados dos dois juntam-se (nada se perde).</li>
          <li>Se esqueceres a frase-passe, a cópia no servidor não se recupera. Os dados em cada dispositivo ficam.</li>
          <li>Só funciona no endereço do Netlify.</li>
        </ul>`;
      return;
    }
    const isNew = mode === 'new';
    body.innerHTML = `
      <div class="sync-hero"><div class="sync-icon">⇅</div><h3>${isNew ? 'Criar sincronização' : 'Ligar a um dispositivo'}</h3></div>
      <form data-form novalidate autocomplete="off">
        ${isNew ? '' : `
          <div class="group-header">Código (no outro dispositivo, em ⚙️ → Sincronização)</div>
          <div class="group"><div class="cell"><input name="code" type="text" autocapitalize="characters" spellcheck="false" placeholder="XXXXX-XXXXX-XXXXX-XXXXX-XXXXXX" aria-label="Código"></div></div>`}
        <div class="group-header">Frase-passe</div>
        <div class="group">
          <div class="cell"><input name="pass" type="password" autocomplete="${isNew ? 'new-password' : 'current-password'}" placeholder="${isNew ? 'Pelo menos 8 caracteres' : 'A mesma do outro dispositivo'}" aria-label="Frase-passe"></div>
          ${isNew ? '<div class="cell"><input name="pass2" type="password" autocomplete="new-password" placeholder="Repete a frase-passe" aria-label="Repetir frase-passe"></div>' : ''}
        </div>
        <p class="group-footer">${isNew ? 'Usa algo que te lembres mas difícil de adivinhar, ex.: "café forte às 7 da manhã". Guarda-a num sítio seguro (ex.: Palavras-passe do iPhone).' : 'Os dados deste dispositivo juntam-se aos do outro.'}</p>
        <p class="sync-error" data-err></p>
        <div class="form-actions">
          <button type="submit" class="btn-primary" ${busy ? 'disabled' : ''}>${busy ? 'A preparar… (pode demorar uns segundos)' : isNew ? 'Ativar sincronização' : 'Ligar'}</button>
          <button type="button" class="btn-secondary" data-mode="menu">Voltar</button>
        </div>
      </form>`;
  }

  body.addEventListener('click', async (e) => {
    const m = e.target.closest('[data-mode]');
    if (m) { mode = m.dataset.mode; return render(); }
    const a = e.target.closest('[data-act]')?.dataset.act;
    if (a === 'copy') {
      const code = formatSyncId(syncStatus().id);
      try { await navigator.clipboard.writeText(code); toast('Código copiado'); } catch { toast(code); }
    }
    if (a === 'now') { const r = await syncNow(); if (r) toast('Sincronizado ✦'); }
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
    const f = e.target;
    const err = body.querySelector('[data-err]');
    const pass = f.elements.pass.value;
    if (pass.length < 8) { err.textContent = 'A frase-passe tem de ter pelo menos 8 caracteres.'; return; }
    if (mode === 'new' && pass !== f.elements.pass2.value) { err.textContent = 'As frases-passe não são iguais.'; return; }
    let id = null;
    if (mode === 'link') {
      id = parseSyncId(f.elements.code.value);
      if (!id) { err.textContent = 'O código tem 26 letras e números. Confirma no outro dispositivo.'; return; }
    }
    busy = true;
    render();
    try {
      if (mode === 'new') await enableNew(pass);
      else await linkExisting(id, pass);
      busy = false;
      glow();
      toast(mode === 'new' ? 'Sincronização ativa ✦' : 'Ligado. Dados juntos ✦', { long: true });
      render();
    } catch (ex) {
      busy = false;
      render();
      const e2 = body.querySelector('[data-err]');
      if (e2) e2.textContent = ex.message || 'Não foi possível.';
      if (mode === 'link' && f.elements.code) body.querySelector('input[name=code]').value = f.elements.code.value;
    }
  });

  unsub = onSyncStatus(() => { if (!busy) render(); });
  render();
}
