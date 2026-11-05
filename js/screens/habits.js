// Ecrã "Hábitos": todos os hábitos, últimos 7 dias, sequência e taxa.
import { state } from '../state.js';
import { todayKey, weekday, WEEKDAY_LETTER } from '../engine/dates.js';
import { last7, streak, rate, frequencyLabel } from '../engine/habits.js';
import { createScreen } from '../ui/screen.js';
import { esc, ICONS } from '../ui/dom.js';
import { line, whisper } from '../ui/phrase.js';
import { openHabitForm } from './habitForm.js';

export function createHabits(section) {
  const scr = createScreen(section, { title: 'Hábitos' });
  section.insertAdjacentHTML('beforeend', `<button class="fab" type="button" data-action="new" aria-label="Novo hábito">${ICONS.plus}</button>`);

  section.addEventListener('click', (e) => {
    if (e.target.closest('[data-action=new]')) return openHabitForm();
    const card = e.target.closest('[data-habit]');
    if (card) openHabitForm(state.habits.find((h) => h.id === card.dataset.habit));
  });

  function render() {
    if (!state.ready) return;
    const today = todayKey();
    scr.setCaps(`${state.habits.length} ${state.habits.length === 1 ? 'hábito' : 'hábitos'}`);
    const t = line('habitos');
    scr.setSubtitle(t ? `“${t}”` : '');

    if (!state.habits.length) {
      scr.content.innerHTML = `<div class="empty"><div class="empty-star">✦</div><h3>Página em branco</h3><p>Cria o primeiro hábito no <b>+</b>.<br>Começa pequeno.</p></div>`;
      return;
    }

    const letters = last7(state.habits[0], state.idx, today).map((d) => WEEKDAY_LETTER[weekday(d.date)]);

    scr.content.innerHTML = `
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
      <p class="group-footer">Percentagem = cumprimento nos últimos 30 dias. Toca num hábito para ver detalhes.</p>
      ${whisper('habitos-fim')}`;
  }

  return { render, scroller: scr.scroller };
}
