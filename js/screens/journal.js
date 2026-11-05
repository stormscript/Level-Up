// Ecrã "Diário": entrada de hoje + histórico agrupado por mês.
import { state, journalOn } from '../state.js';
import { todayKey, fromKey, monthKey, monthLabel, WEEKDAY_SHORT, weekday, addDays } from '../engine/dates.js';
import { journalPrompt } from '../engine/phrases.js';
import { createScreen } from '../ui/screen.js';
import { esc, ICONS } from '../ui/dom.js';
import { whisper } from '../ui/phrase.js';
import { openJournal, moodBars } from './journalForm.js';

export function createJournal(section) {
  const scr = createScreen(section, { title: 'Diário' });
  section.insertAdjacentHTML('beforeend', `<button class="fab" type="button" data-action="write" aria-label="Escrever hoje">${ICONS.pen}</button>`);

  section.addEventListener('click', (e) => {
    if (e.target.closest('[data-action=write]')) return openJournal(todayKey());
    const item = e.target.closest('[data-date]');
    if (item) openJournal(item.dataset.date);
  });

  function render() {
    if (!state.ready) return;
    const today = todayKey();
    const month = monthKey(today);
    const thisMonth = state.journal.filter((j) => monthKey(j.data) === month).length;
    scr.setCaps(`${thisMonth} ${thisMonth === 1 ? 'entrada' : 'entradas'} este mês`);
    scr.setSubtitle('“o que não se escreve, esquece-se.”');

    // Dias seguidos com entrada
    let run = 0;
    for (let d = journalOn(today) ? today : addDays(today, -1); journalOn(d); d = addDays(d, -1)) run++;

    const j = journalOn(today);
    const past = state.journal.filter((x) => x.data !== today);
    const groups = new Map();
    for (const e of past) {
      const k = monthKey(e.data);
      if (!groups.has(k)) groups.set(k, []);
      groups.get(k).push(e);
    }

    scr.content.innerHTML = `
      <button type="button" class="card journal-card big" data-date="${today}">
        <div class="jc-top">
          ${j ? moodBars(j.humor) : `<span class="jc-icon">${ICONS.pen}</span>`}
          <span class="muted small">${j ? 'Hoje · toca para continuar' : 'Hoje · em branco'}</span>
          ${run > 1 ? `<span class="streak hot">${run} dias</span>` : ''}
        </div>
        ${j?.texto ? `<p class="jc-text">${esc(j.texto.slice(0, 220))}</p>` : `<p class="jc-prompt">${esc(journalPrompt(today))}</p>`}
      </button>

      ${[...groups.entries()].map(([k, items]) => `
        <div class="sec"><span class="caps">${esc(monthLabel(`${k}-01`))}</span></div>
        <div class="group">
          ${items.map((e) => `
            <button type="button" class="cell entry" data-date="${e.data}">
              <div class="entry-date"><b>${fromKey(e.data).getDate()}</b><span>${WEEKDAY_SHORT[weekday(e.data)]}</span></div>
              <div class="entry-body">
                <div class="entry-text">${esc((e.texto || '').trim() || e.pergunta || '')}</div>
              </div>
              ${moodBars(e.humor, { small: true })}
            </button>`).join('')}
        </div>`).join('')}

      ${past.length ? '' : '<div class="empty small"><p>As entradas antigas aparecem aqui.</p></div>'}
      ${whisper('diario-fim')}`;
  }

  return { render, scroller: scr.scroller };
}
