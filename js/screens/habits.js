// Lista de hábitos (dentro de Metas → Hábitos): últimos 7 dias, sequência e taxa.
import { state } from '../state.js';
import { todayKey, weekday, WEEKDAY_LETTER } from '../engine/dates.js';
import { last7, streak, rate, frequencyLabel } from '../engine/habits.js';
import { esc } from '../ui/dom.js';

export function habitsListHTML() {
  const today = todayKey();
  if (!state.habits.length) {
    return `<div class="empty"><div class="empty-star">✦</div><h3>Página em branco</h3><p>Cria o primeiro hábito no <b>+</b>.<br>Começa pequeno.</p></div>`;
  }
  const letters = last7(state.habits[0], state.idx, today).map((d) => WEEKDAY_LETTER[weekday(d.date)]);
  return `
    <div class="week-letters" aria-hidden="true">${letters.map((l, i) => `<span class="${i === 6 ? 'today' : ''}">${l}</span>`).join('')}</div>
    <div class="group">
      ${state.habits.map((h) => {
        const s = streak(h, state.idx, today);
        const r = rate(h, state.idx, today);
        return `
          <button type="button" class="cell habit-cell" data-habit="${esc(h.id)}">
            <div class="hc-body">
              <div class="hc-name">${esc(h.nome)}</div>
              <div class="muted small">${esc(frequencyLabel(h))}${r == null ? '' : ` · ${Math.round(r * 100)}%`}</div>
            </div>
            <div class="hc-right">
              <div class="dots">${last7(h, state.idx, today).map((d) => `<i class="${d.state}"></i>`).join('')}</div>
              <div class="streak ${s.value ? 'hot' : ''}">${s.value ? `${s.value} ${s.unit}` : '—'}</div>
            </div>
          </button>`;
      }).join('')}
    </div>
    <p class="group-footer">Percentagem = cumprimento nos últimos 30 dias. Toca num hábito para ver detalhes.</p>`;
}
