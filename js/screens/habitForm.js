// Bottom sheet para criar/editar um hábito.
import { state, saveHabit, deleteHabit } from '../state.js';
import { todayKey } from '../engine/dates.js';
import { streak, bestStreak, rate } from '../engine/habits.js';
import { esc, el } from '../ui/dom.js';
import { openSheet, actionSheet } from '../ui/sheet.js';
import { toast } from '../ui/effects.js';

const WEEKDAYS = ['Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb', 'Dom'];

export function openHabitForm(existing = null) {
  const r = existing?.recorrencia || {};
  const f = {
    nome: existing?.nome || '',
    freq: r.tipo || 'diario',
    dias: r.dias ? [...r.dias] : [1, 2, 3, 4, 5],
    n: r.n || 3,
  };

  let stats = '';
  if (existing) {
    const today = todayKey();
    const s = streak(existing, state.idx, today);
    const best = bestStreak(existing, state.idx, today);
    const rt = rate(existing, state.idx, today);
    const unit = existing.recorrencia?.tipo === 'xPorSemana' ? 'sem.' : 'dias';
    stats = `
      <div class="stats-row">
        <div><b>${s.value}</b><span>sequência</span></div>
        <div><b>${best}</b><span>melhor (${unit})</span></div>
        <div><b>${rt == null ? '—' : Math.round(rt * 100) + '%'}</b><span>30 dias</span></div>
      </div>`;
  }

  const form = el(`
    <form class="form" novalidate autocomplete="off">
      ${stats}
      <div class="group">
        <div class="cell"><input name="nome" type="text" maxlength="60" enterkeyhint="done"
          placeholder="Ex.: Ler 20 páginas" value="${esc(f.nome)}" aria-label="Nome do hábito"></div>
      </div>

      <div class="group-header">Frequência</div>
      <div class="pad">
        <div class="segmented" data-field="freq">
          <button type="button" data-v="diario">Todos os dias</button>
          <button type="button" data-v="dias">Dias</button>
          <button type="button" data-v="xPorSemana">X / semana</button>
        </div>
      </div>
      <div class="pad weekdays" data-show-freq="dias">
        ${WEEKDAYS.map((d, i) => `<button type="button" class="wd" data-d="${i + 1}" aria-label="${d}">${d}</button>`).join('')}
      </div>
      <div class="group stepper-group" data-show-freq="xPorSemana">
        <div class="cell">
          <span class="cell-label"><b class="n-val">${f.n}</b> vezes por semana</span>
          <div class="stepper">
            <button type="button" data-step="-1" aria-label="Menos">−</button>
            <button type="button" data-step="1" aria-label="Mais">+</button>
          </div>
        </div>
      </div>

      <div class="form-actions">
        <button type="submit" class="btn-primary">${existing ? 'Guardar' : 'Criar hábito'}</button>
        ${existing ? '<button type="button" class="btn-destructive" data-action="delete">Apagar hábito</button>' : ''}
      </div>
    </form>`);

  const sync = () => {
    form.querySelectorAll('[data-field=freq] [data-v]').forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.v === f.freq)));
    form.querySelectorAll('[data-show-freq]').forEach((s) => (s.hidden = s.dataset.showFreq !== f.freq));
    form.querySelectorAll('.wd').forEach((b) => b.setAttribute('aria-pressed', String(f.dias.includes(+b.dataset.d))));
    form.querySelector('.n-val').textContent = f.n;
  };

  form.addEventListener('click', (e) => {
    const opt = e.target.closest('[data-field=freq] [data-v]');
    if (opt) { f.freq = opt.dataset.v; return sync(); }
    const wd = e.target.closest('.wd');
    if (wd) {
      const d = +wd.dataset.d;
      f.dias = f.dias.includes(d) ? f.dias.filter((x) => x !== d) : [...f.dias, d].sort();
      return sync();
    }
    const st = e.target.closest('[data-step]');
    if (st) { f.n = Math.min(7, Math.max(1, f.n + +st.dataset.step)); return sync(); }
  });

  const sheet = openSheet({ title: existing ? existing.nome : 'Novo hábito', body: form, size: 'large' });
  sync();

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const input = form.elements.nome;
    f.nome = input.value.trim();
    if (!f.nome) {
      const g = input.closest('.group');
      g.classList.remove('shake');
      void g.offsetWidth;
      g.classList.add('shake');
      input.focus();
      return;
    }
    if (f.freq === 'dias' && f.dias.length === 0) return toast('Escolhe pelo menos um dia');
    const recorrencia = f.freq === 'dias' ? { tipo: 'dias', dias: f.dias } : f.freq === 'xPorSemana' ? { tipo: 'xPorSemana', n: f.n } : { tipo: 'diario' };
    await saveHabit({ ...(existing || {}), nome: f.nome, recorrencia });
    sheet.close('saved');
    toast(existing ? 'Guardado' : 'Hábito criado', { icon: '✦' });
  });

  form.querySelector('[data-action=delete]')?.addEventListener('click', async () => {
    if (await confirmDeleteHabit(existing)) sheet.close('deleted');
  });
}

export async function confirmDeleteHabit(habit) {
  const ok = await actionSheet({
    title: `Apagar "${habit.nome}"?`,
    message: 'O histórico deste hábito também é apagado.',
    actions: [{ label: 'Apagar hábito', destructive: true }],
  });
  if (!ok) return false;
  await deleteHabit(habit.id);
  toast('Apagado');
  return true;
}
