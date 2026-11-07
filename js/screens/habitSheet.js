// Detalhe de um hábito: estatísticas + calendário do mês onde marcas qualquer dia.
import { state, subscribe, toggleCheck } from '../state.js';
import { todayKey, weekday, fromKey, pad, monthLabel, WEEKDAY_LETTER } from '../engine/dates.js';
import { streak, bestStreak, rate, totalDone, frequencyLabel, dayState } from '../engine/habits.js';
import { lastDayOfMonth } from '../engine/money.js';
import { esc, el } from '../ui/dom.js';
import { openSheet } from '../ui/sheet.js';
import { play } from '../ui/effects.js';
import { openHabitForm, confirmDeleteHabit } from './habitForm.js';

export function openHabitSheet(habitId) {
  const body = el('<div class="habit-detail"></div>');
  let month = todayKey().slice(0, 7);
  let unsub = null;
  const sheet = openSheet({ title: 'Hábito', body, leftLabel: 'Fechar', size: 'large', onClose: () => unsub?.() });

  function render() {
    const h = state.habits.find((x) => x.id === habitId);
    if (!h) return sheet.close('gone');
    const today = todayKey();
    const s = streak(h, state.idx, today);
    const best = bestStreak(h, state.idx, today);
    const r = rate(h, state.idx, today);
    const weekly = h.recorrencia?.tipo === 'xPorSemana';
    const total = lastDayOfMonth(month);
    const offset = weekday(`${month}-01`) - 1;
    const days = Array.from({ length: total }, (_, i) => `${month}-${pad(i + 1)}`);
    const doneInMonth = days.filter((d) => dayState(h, state.idx, d, today) === 'done').length;
    const isCurrent = month === today.slice(0, 7);

    body.innerHTML = `
      <div class="gd-head">
        <div class="caps">${esc(frequencyLabel(h))}</div>
        <h2>${esc(h.nome)}</h2>
      </div>

      <div class="stats-row four">
        <div><b>${s.value}</b><span>sequência${weekly ? ' (sem.)' : ''}</span></div>
        <div><b>${best}</b><span>melhor</span></div>
        <div><b>${r == null ? '—' : `${Math.round(r * 100)}%`}</b><span>30 dias</span></div>
        <div><b>${totalDone(h, state.checks)}</b><span>total</span></div>
      </div>

      <div class="month-nav">
        <button type="button" class="strip-arrow" data-m="-1" aria-label="Mês anterior">‹</button>
        <strong>${esc(monthLabel(`${month}-01`))} <small class="muted">· ${doneInMonth}×</small></strong>
        <button type="button" class="strip-arrow" data-m="1" ${isCurrent ? 'disabled' : ''} aria-label="Mês seguinte">›</button>
      </div>
      <div class="month-grid habit-cal">
        ${[1, 2, 3, 4, 5, 6, 7].map((w) => `<span class="mg-head">${WEEKDAY_LETTER[w]}</span>`).join('')}
        ${'<span></span>'.repeat(offset)}
        ${days.map((d) => {
          const st = dayState(h, state.idx, d, today);
          return `<button type="button" class="hc-day ${st} ${d === today ? 'is-today' : ''}" data-day="${d}" ${st === 'future' ? 'disabled' : ''}
            aria-label="Dia ${fromKey(d).getDate()}: ${st === 'done' ? 'feito' : 'por marcar'}">${fromKey(d).getDate()}</button>`;
        }).join('')}
      </div>
      <p class="group-footer"><span class="legend"><i class="on"></i> feito <i class="miss"></i> falhado <i class="off"></i> folga</span><br>Toca num dia para marcar ou desmarcar.</p>

      <div class="form-actions">
        <button type="button" class="btn-secondary" data-action="edit">Editar hábito</button>
        <button type="button" class="btn-destructive" data-action="delete">Apagar hábito</button>
      </div>`;
  }

  body.addEventListener('click', async (e) => {
    const h = state.habits.find((x) => x.id === habitId);
    const day = e.target.closest('[data-day]');
    if (day && !day.disabled) {
      day.classList.toggle('done');
      const res = await toggleCheck(habitId, day.dataset.day);
      play(res.done ? 'check' : 'undo');
      return;
    }
    const m = e.target.closest('[data-m]');
    if (m && !m.disabled) {
      const [y, mo] = month.split('-').map(Number);
      const d = new Date(y, mo - 1 + Number(m.dataset.m), 1);
      month = `${d.getFullYear()}-${pad(d.getMonth() + 1)}`;
      return render();
    }
    const a = e.target.closest('[data-action]')?.dataset.action;
    if (a === 'edit') openHabitForm(h);
    if (a === 'delete' && (await confirmDeleteHabit(h))) sheet.close('deleted');
  });

  unsub = subscribe(render);
  render();
}
