// Definições (bottom sheet): nome, som, frases, dados.
import { hasSampleData, clearSampleData, resetAll, exportData, importData } from '../state.js';
import { prefs, setPref } from '../prefs.js';
import { openSheet, actionSheet } from '../ui/sheet.js';
import { toast } from '../ui/effects.js';
import { el, esc } from '../ui/dom.js';
import { todayKey } from '../engine/dates.js';

export const APP_VERSION = '0.4.0';

export function openSettings() {
  const body = el(`<div class="form"></div>`);
  openSheet({ title: 'Definições', body, leftLabel: 'Fechar', size: 'large', onClose: notifyChange });

  function render() {
    const last = prefs.ultimoBackup ? new Date(prefs.ultimoBackup).toLocaleDateString('pt-PT') : 'nunca';
    body.innerHTML = `
      <div class="group-header">Tu</div>
      <div class="group">
        <label class="cell"><span class="cell-label">Nome</span>
          <input type="text" class="input-right" data-pref="nome" maxlength="24" placeholder="Opcional" value="${esc(prefs.nome)}" enterkeyhint="done" autocomplete="given-name"></label>
      </div>
      <p class="group-footer">Aparece na saudação: "Boa noite, ${esc(prefs.nome || 'Nome')}."</p>

      <div class="group-header">Frases</div>
      <div class="group">
        <label class="cell"><span class="cell-label">Mostrar frases</span>
          <input type="checkbox" class="switch" data-pref="mostrarFrases" ${prefs.mostrarFrases ? 'checked' : ''}></label>
      </div>
      <div class="group-header">As tuas frases <span class="muted">(uma por linha)</span></div>
      <div class="group">
        <textarea class="phrases" data-pref="frases" rows="4" placeholder="ex.: lembra-te de quem duvidou.">${esc((prefs.frases || []).join('\n'))}</textarea>
      </div>
      <p class="group-footer">Misturam-se com as da app e aparecem de forma discreta ao longo do dia.</p>

      <div class="group-header">Geral</div>
      <div class="group">
        <label class="cell"><span class="cell-label">Som ao marcar</span>
          <input type="checkbox" class="switch" data-pref="som" ${prefs.som ? 'checked' : ''}></label>
        <label class="cell"><span class="cell-label">Avisos ao abrir a app</span>
          <input type="checkbox" class="switch" data-pref="avisos" ${prefs.avisos ? 'checked' : ''}></label>
      </div>
      <p class="group-footer">Tarefas atrasadas, planear amanhã, diário, metas, orçamento e backup. No máximo 2 de cada vez.</p>

      <div class="group-header">Os teus dados</div>
      <div class="group">
        <button type="button" class="cell cell-btn accent" data-action="export">Exportar backup (JSON)</button>
        <button type="button" class="cell cell-btn accent" data-action="import">Importar backup…</button>
        ${hasSampleData() ? '<button type="button" class="cell cell-btn destructive" data-action="clear-sample">Apagar dados de exemplo</button>' : ''}
        <button type="button" class="cell cell-btn destructive" data-action="reset">Apagar todos os dados</button>
      </div>
      <p class="group-footer">Os dados vivem só neste iPhone. Último backup: ${last}.</p>
      <input type="file" accept="application/json,.json" hidden data-import>

      <p class="group-footer center">LevelUp ${APP_VERSION} · ✦</p>`;
  }
  render();

  body.addEventListener('input', (e) => {
    const k = e.target.dataset.pref;
    if (k === 'nome') setPref('nome', e.target.value.trim());
    if (k === 'frases') setPref('frases', e.target.value.split('\n').map((s) => s.trim().toLowerCase()).filter(Boolean));
  });

  body.addEventListener('click', async (e) => {
    const action = e.target.closest('[data-action]')?.dataset.action;
    if (action === 'export') return doExport();
    if (action === 'import') return body.querySelector('[data-import]').click();
    if (action === 'clear-sample') {
      const ok = await actionSheet({
        title: 'Apagar dados de exemplo?',
        message: 'Remove tudo o que é de exemplo (hábitos, tarefas, agenda, metas, finanças, diário). O que criaste fica.',
        actions: [{ label: 'Apagar exemplos', destructive: true }],
      });
      if (ok) { await clearSampleData(); toast('Exemplos apagados'); render(); }
    }
    if (action === 'reset') {
      const ok = await actionSheet({
        title: 'Apagar TODOS os dados?',
        message: 'Isto não se pode desfazer. Faz primeiro um backup.',
        actions: [{ label: 'Apagar tudo', destructive: true }],
      });
      if (ok) { await resetAll(); toast('Dados apagados'); render(); }
    }
  });

  body.addEventListener('change', async (e) => {
    const k = e.target.dataset.pref;
    if (k === 'som' || k === 'mostrarFrases' || k === 'avisos') setPref(k, e.target.checked);
    if (e.target.matches('[data-import]')) {
      const file = e.target.files?.[0];
      e.target.value = '';
      if (!file) return;
      try {
        const json = JSON.parse(await file.text());
        const ok = await actionSheet({
          title: 'Substituir os dados atuais?',
          message: `Backup de ${json.exportadoEm ? new Date(json.exportadoEm).toLocaleString('pt-PT') : 'data desconhecida'}.`,
          actions: [{ label: 'Importar e substituir', destructive: true }],
        });
        if (!ok) return;
        await importData(json);
        toast('Backup importado', { icon: '✦' });
        render();
      } catch (err) {
        toast(err.message?.startsWith('Este ficheiro') ? err.message : 'Ficheiro inválido');
      }
    }
  });

  async function doExport() {
    const data = await exportData();
    const name = `levelup-backup-${todayKey()}.json`;
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
    const file = new File([blob], name, { type: 'application/json' });
    try {
      if (navigator.canShare?.({ files: [file] })) {
        await navigator.share({ files: [file], title: 'Backup LevelUp' });
      } else {
        const a = document.createElement('a');
        a.href = URL.createObjectURL(blob);
        a.download = name;
        a.click();
        setTimeout(() => URL.revokeObjectURL(a.href), 2000);
      }
      setPref('ultimoBackup', new Date().toISOString());
      toast('Backup exportado', { icon: '✦' });
      render();
    } catch (err) {
      if (err?.name !== 'AbortError') toast('Não foi possível exportar');
    }
  }
}

// O nome e as frases mudam o ecrã Hoje: avisa a app para redesenhar.
function notifyChange() {
  window.dispatchEvent(new CustomEvent('prefs-changed'));
}
