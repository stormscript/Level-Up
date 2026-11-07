// Bottom sheet para criar/editar um evento da agenda.
import { saveEvent, deleteEvent, skipOccurrence } from '../state.js';
import { todayKey, formatRelative } from '../engine/dates.js';
import { toICS, toMin, fromMin, REPEAT } from '../engine/agenda.js';
import { esc, el } from '../ui/dom.js';
import { openSheet, actionSheet } from '../ui/sheet.js';
import { toast } from '../ui/effects.js';

function nextHalfHour() {
  const d = new Date();
  const m = d.getHours() * 60 + d.getMinutes();
  return fromMin(Math.min(23 * 60, Math.ceil((m + 1) / 30) * 30));
}

/** @param existing evento a editar  @param date data da ocorrência tocada (para repetições) */
export function openEventForm(existing = null, { date = todayKey() } = {}) {
  const start = existing?.inicio ?? nextHalfHour();
  const f = {
    titulo: existing?.titulo || '',
    data: existing ? existing.data : date,
    diaTodo: existing ? !existing.inicio : false,
    inicio: start || '09:00',
    fim: existing?.fim || fromMin(Math.min(23 * 60 + 59, toMin(start || '09:00') + 60)),
    repetir: existing?.repetir || 'nunca',
    local: existing?.local || '',
    notas: existing?.notas || '',
  };
  const repeats = existing && existing.repetir && existing.repetir !== 'nunca';

  const form = el(`
    <form class="form" novalidate autocomplete="off">
      <div class="group">
        <div class="cell"><input name="titulo" type="text" maxlength="80" enterkeyhint="next" placeholder="Título" value="${esc(f.titulo)}" aria-label="Título"></div>
        <div class="cell"><input name="local" type="text" maxlength="80" enterkeyhint="done" placeholder="Local (opcional)" value="${esc(f.local)}" aria-label="Local"></div>
      </div>

      <div class="group-header">Quando</div>
      <div class="group">
        <label class="cell"><span class="cell-label">Dia todo</span><input type="checkbox" class="switch" name="diaTodo" ${f.diaTodo ? 'checked' : ''}></label>
        <label class="cell"><span class="cell-label">${repeats ? 'Começa a' : 'Data'}</span><input type="date" name="data" value="${esc(f.data)}" required></label>
        <label class="cell" data-time><span class="cell-label">Início</span><input type="time" name="inicio" value="${esc(f.inicio)}"></label>
        <label class="cell" data-time><span class="cell-label">Fim</span><input type="time" name="fim" value="${esc(f.fim)}"></label>
      </div>

      <div class="group-header">Repetir</div>
      <div class="pad">
        <div class="segmented" data-field="repetir">
          <button type="button" data-v="nunca">Não</button>
          <button type="button" data-v="diario">Diário</button>
          <button type="button" data-v="semanal">Semanal</button>
          <button type="button" data-v="mensal">Mensal</button>
          <button type="button" data-v="anual">Anual</button>
        </div>
      </div>

      <div class="group" style="margin-top:14px">
        <label class="cell"><span class="cell-label">Contagem decrescente no Hoje</span><input type="checkbox" class="switch" name="contagem" ${existing?.contagem ? 'checked' : ''}></label>
      </div>
      <p class="group-footer">Ex.: "Exame · faltam 12 dias". Ideal para exames, viagens e aniversários.</p>

      <div class="group-header">Notas</div>
      <div class="group"><textarea name="notas" class="notes" rows="3" placeholder="Opcional">${esc(f.notas)}</textarea></div>

      <div class="form-actions">
        <button type="submit" class="btn-primary">${existing ? 'Guardar' : 'Adicionar à agenda'}</button>
        ${existing ? '<button type="button" class="btn-secondary" data-action="ics">Adicionar ao Calendário do iPhone</button>' : ''}
        ${existing ? '<button type="button" class="btn-destructive" data-action="delete">Apagar evento</button>' : ''}
      </div>
    </form>`);

  const sync = () => {
    form.querySelectorAll('[data-field=repetir] [data-v]').forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.v === f.repetir)));
    form.querySelectorAll('[data-time]').forEach((c) => (c.hidden = f.diaTodo));
  };
  form.addEventListener('click', (e) => {
    const opt = e.target.closest('[data-field=repetir] [data-v]');
    if (opt) { f.repetir = opt.dataset.v; sync(); }
  });
  form.elements.diaTodo.addEventListener('change', (e) => { f.diaTodo = e.target.checked; sync(); });
  // Ao mudar o início, o fim acompanha (mantém a duração).
  let lastStart = f.inicio;
  form.elements.inicio.addEventListener('change', (e) => {
    const dur = toMin(form.elements.fim.value) - toMin(lastStart);
    if (e.target.value && dur > 0) form.elements.fim.value = fromMin(Math.min(23 * 60 + 59, toMin(e.target.value) + dur));
    lastStart = e.target.value;
  });

  const sheet = openSheet({ title: existing ? 'Evento' : 'Novo evento', body: form, size: 'large' });
  sync();

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const titulo = form.elements.titulo.value.trim();
    if (!titulo) {
      const g = form.elements.titulo.closest('.group');
      g.classList.remove('shake'); void g.offsetWidth; g.classList.add('shake');
      form.elements.titulo.focus();
      return;
    }
    const ev = {
      ...(existing || {}),
      titulo,
      local: form.elements.local.value.trim(),
      data: form.elements.data.value || todayKey(),
      inicio: f.diaTodo ? '' : form.elements.inicio.value || '09:00',
      fim: f.diaTodo ? '' : form.elements.fim.value || '',
      repetir: f.repetir,
      notas: form.elements.notas.value.trim(),
      contagem: form.elements.contagem.checked,
    };
    delete ev.seed;
    await saveEvent(ev);
    sheet.close('saved');
    toast(existing ? 'Guardado' : `Na agenda · ${formatRelative(ev.data)}`, { icon: '✦' });
  });

  form.querySelector('[data-action=ics]')?.addEventListener('click', () => shareICS(existing));

  form.querySelector('[data-action=delete]')?.addEventListener('click', async () => {
    const actions = repeats
      ? [
          { label: 'Apagar só este dia', destructive: true, value: 'one' },
          { label: 'Apagar todos', destructive: true, value: 'all' },
        ]
      : [{ label: 'Apagar evento', destructive: true, value: 'all' }];
    const choice = await actionSheet({ title: `Apagar "${existing.titulo}"?`, message: repeats ? 'Este evento repete-se.' : '', actions });
    if (!choice) return;
    if (choice === 'one') await skipOccurrence(existing, date);
    else await deleteEvent(existing.id);
    sheet.close('deleted');
    toast('Apagado');
  });
}

async function shareICS(ev) {
  const ics = toICS(ev);
  const name = `${ev.titulo.replace(/[^\p{L}\p{N} ]/gu, '').trim() || 'evento'}.ics`;
  const file = new File([ics], name, { type: 'text/calendar' });
  try {
    if (navigator.canShare?.({ files: [file] })) await navigator.share({ files: [file] });
    else {
      const a = document.createElement('a');
      a.href = URL.createObjectURL(file);
      a.download = name;
      a.click();
      setTimeout(() => URL.revokeObjectURL(a.href), 2000);
    }
  } catch (err) {
    if (err?.name !== 'AbortError') toast('Não foi possível partilhar');
  }
}

export { REPEAT };
