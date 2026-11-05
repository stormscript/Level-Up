// Definições (bottom sheet): tema, som, dados (backup, exemplos).
import { state, hasSampleData, clearSampleData, resetAll, exportData, importData } from '../state.js';
import { prefs, setPref } from '../prefs.js';
import { applyTheme } from '../ui/theme.js';
import { openSheet, actionSheet } from '../ui/sheet.js';
import { toast } from '../ui/effects.js';
import { el, esc } from '../ui/dom.js';
import { todayKey } from '../engine/dates.js';

export const APP_VERSION = '0.1.0';

export function openSettings() {
  const body = el(`<div class="form"></div>`);
  const sheet = openSheet({ title: 'Definições', body, leftLabel: 'Fechar', size: 'large' });

  function render() {
    const last = prefs.ultimoBackup ? new Date(prefs.ultimoBackup).toLocaleDateString('pt-PT') : 'nunca';
    body.innerHTML = `
      <div class="group-header">Aparência</div>
      <div class="pad">
        <div class="segmented" data-field="tema">
          <button type="button" data-v="auto" aria-pressed="${prefs.tema === 'auto'}">Automático</button>
          <button type="button" data-v="light" aria-pressed="${prefs.tema === 'light'}">Claro</button>
          <button type="button" data-v="dark" aria-pressed="${prefs.tema === 'dark'}">Escuro</button>
        </div>
      </div>

      <div class="group">
        <label class="cell"><span class="cell-label">Som ao concluir</span>
          <input type="checkbox" class="switch" data-pref="som" ${prefs.som ? 'checked' : ''}></label>
      </div>

      <div class="group-header">Áreas</div>
      <div class="group">
        ${state.areas.map((a) => `<div class="cell"><span class="area-icon" style="--area:${esc(a.cor)}">${esc(a.icone)}</span><span class="cell-label">${esc(a.nome)}</span></div>`).join('')}
      </div>
      <p class="group-footer">A edição das áreas chega na Fase 5.</p>

      <div class="group-header">Os teus dados</div>
      <div class="group">
        <button type="button" class="cell cell-btn accent" data-action="export">Exportar backup (JSON)</button>
        <button type="button" class="cell cell-btn accent" data-action="import">Importar backup…</button>
        ${hasSampleData() ? '<button type="button" class="cell cell-btn destructive" data-action="clear-sample">Apagar dados de exemplo</button>' : ''}
        <button type="button" class="cell cell-btn destructive" data-action="reset">Apagar todos os dados</button>
      </div>
      <p class="group-footer">Os dados vivem só neste iPhone. Último backup: ${last}.</p>
      <input type="file" accept="application/json,.json" hidden data-import>

      <p class="group-footer center">LevelUp ${APP_VERSION} · Fase 1</p>`;
  }
  render();

  body.addEventListener('click', async (e) => {
    const seg = e.target.closest('[data-field=tema] [data-v]');
    if (seg) {
      setPref('tema', seg.dataset.v);
      applyTheme();
      return render();
    }
    const action = e.target.closest('[data-action]')?.dataset.action;
    if (action === 'export') return doExport();
    if (action === 'import') return body.querySelector('[data-import]').click();
    if (action === 'clear-sample') {
      const ok = await actionSheet({
        title: 'Apagar dados de exemplo?',
        message: 'Remove as missões, os hábitos e o histórico de exemplo. O que criaste fica.',
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
    if (e.target.matches('[data-pref=som]')) setPref('som', e.target.checked);
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
        applyTheme();
        toast('Backup importado', { icon: '✓' });
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
      // No iPhone abre a folha de partilha → "Guardar em Ficheiros".
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
      toast('Backup exportado', { icon: '✓' });
      render();
    } catch (err) {
      if (err?.name !== 'AbortError') toast('Não foi possível exportar');
    }
  }

  return sheet;
}
