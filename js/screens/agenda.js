// Ecrã "Agenda": vista de dia (com faixa da semana) e vista de mês.
import { state } from '../state.js';
import { todayKey, addDays, weekStart, weekday, fromKey, monthLabel, WEEKDAY_SHORT, WEEKDAY_LETTER, formatLong, pad } from '../engine/dates.js';
import { eventsOn, duration, formatDuration, nowLineIndex, timeStates, datesWithEvents, REPEAT } from '../engine/agenda.js';
import { lastDayOfMonth } from '../engine/money.js';
import { createScreen } from '../ui/screen.js';
import { esc, ICONS } from '../ui/dom.js';
import { whisper } from '../ui/phrase.js';
import { openEventForm } from './eventForm.js';
import { todosOn, datesWithTodos, inbox } from '../engine/todos.js';
import { quickAddHTML, bindQuickAdd, todoRowHTML, bindTodoRows } from './todoUI.js';
import { openInbox } from './planner.js';

const nowMin = () => { const d = new Date(); return d.getHours() * 60 + d.getMinutes(); };
const nowHHMM = () => { const d = new Date(); return `${pad(d.getHours())}:${pad(d.getMinutes())}`; };

/** Lista de eventos de um dia (usada também no Hoje). */
export function agendaListHTML(date, { limit = 0 } = {}) {
  const list = eventsOn(state.events, date);
  if (!list.length) return '';
  const isToday = date === todayKey();
  const now = nowMin();
  const states = isToday ? timeStates(list, now) : list.map((e) => (e.inicio ? 'later' : 'allday'));
  let shown = list.map((e, i) => ({ e, s: states[i] }));
  if (limit && isToday) {
    // No Hoje: esconde o que já passou, se houver muitos.
    const upcoming = shown.filter((x) => x.s !== 'past');
    if (upcoming.length) shown = upcoming;
    shown = shown.slice(0, limit);
  }
  const lineAt = isToday ? nowLineIndex(shown.map((x) => x.e), now) : -1;
  const rows = shown.map(({ e, s }) => {
    const dur = formatDuration(duration(e));
    const meta = [e.local, dur, e.repetir && e.repetir !== 'nunca' ? '↻' : ''].filter(Boolean).map(esc).join(' · ');
    return `
      <button type="button" class="ev-row ${s}" data-ev="${esc(e.id)}" data-date="${date}">
        <div class="ev-time">${e.inicio ? `<b>${esc(e.inicio)}</b><span>${esc(e.fim || '')}</span>` : '<b class="allday">Dia<br>todo</b>'}</div>
        <div class="ev-bar"></div>
        <div class="ev-body"><div class="ev-title">${esc(e.titulo)}</div>${meta ? `<div class="ev-meta">${meta}</div>` : ''}</div>
      </button>`;
  });
  if (lineAt >= 0 && shown.some((x) => x.e.inicio)) {
    rows.splice(lineAt, 0, `<div class="now-line" aria-label="Agora"><span>${nowHHMM()}</span><i></i></div>`);
  }
  return rows.join('');
}

export function createAgenda(section) {
  const scr = createScreen(section, {
    title: 'Agenda',
    trailing: `<button class="icon-btn inbox-btn" type="button" data-action="inbox" aria-label="Tarefas sem data">${ICONS.inbox}<span class="badge" hidden></span></button>`,
  });
  // Estrutura fixa: o campo de escrita rápida nunca é redesenhado (o teclado não fecha).
  scr.content.innerHTML = `<div data-slot="top"></div><div data-slot="qa">${quickAddHTML()}</div><div data-slot="list"></div>`;
  const slot = (n) => scr.content.querySelector(`[data-slot=${n}]`);
  bindQuickAdd(scr.content, () => selected);
  section.insertAdjacentHTML('beforeend', `<button class="fab" type="button" data-action="new" aria-label="Novo evento">${ICONS.plus}</button>`);

  let selected = todayKey();
  let view = 'dia';
  let month = selected.slice(0, 7);

  section.addEventListener('click', (e) => {
    const t = e.target.closest('[data-action],[data-day],[data-ev],[data-view]');
    if (!t) return;
    if (t.dataset.view) { view = t.dataset.view; month = selected.slice(0, 7); return render(); }
    if (t.dataset.day) { selected = t.dataset.day; if (view === 'mes') view = 'dia'; return render(); }
    if (t.dataset.ev) {
      const ev = state.events.find((x) => x.id === t.dataset.ev);
      if (ev) openEventForm(ev, { date: t.dataset.date });
      return;
    }
    const a = t.dataset.action;
    if (a === 'new') return openEventForm(null, { date: selected });
    if (a === 'inbox') return openInbox();
    if (a === 'today') { selected = todayKey(); month = selected.slice(0, 7); return render(); }
    if (a === 'prev-week') { selected = addDays(selected, -7); return render(); }
    if (a === 'next-week') { selected = addDays(selected, 7); return render(); }
    if (a === 'prev-month' || a === 'next-month') {
      const [y, m] = month.split('-').map(Number);
      const d = new Date(y, m - 1 + (a === 'next-month' ? 1 : -1), 1);
      month = `${d.getFullYear()}-${pad(d.getMonth() + 1)}`;
      return render();
    }
  });

  // Deslizar na faixa da semana muda de semana.
  let sx = null;
  section.addEventListener('touchstart', (e) => { if (e.target.closest('.week-strip, .month-grid')) sx = e.touches[0].clientX; }, { passive: true });
  section.addEventListener('touchend', (e) => {
    if (sx == null) return;
    const dx = e.changedTouches[0].clientX - sx;
    sx = null;
    if (Math.abs(dx) < 50) return;
    if (view === 'dia') selected = addDays(selected, dx < 0 ? 7 : -7);
    else {
      const [y, m] = month.split('-').map(Number);
      const d = new Date(y, m - 1 + (dx < 0 ? 1 : -1), 1);
      month = `${d.getFullYear()}-${pad(d.getMonth() + 1)}`;
    }
    render();
  });

  function weekStrip() {
    const start = weekStart(selected);
    const days = Array.from({ length: 7 }, (_, i) => addDays(start, i));
    const has = datesWithEvents(state.events, days);
    const hasT = datesWithTodos(state.todos, days);
    const today = todayKey();
    return `
      <div class="week-strip">
        <button type="button" class="strip-arrow" data-action="prev-week" aria-label="Semana anterior">‹</button>
        ${days.map((d) => `
          <button type="button" class="day ${d === selected ? 'sel' : ''} ${d === today ? 'today' : ''}" data-day="${d}">
            <span>${WEEKDAY_SHORT[weekday(d)]}</span><b>${fromKey(d).getDate()}</b>
            <em>${has.has(d) ? '<i class="on"></i>' : ''}${hasT.has(d) ? '<i class="td"></i>' : ''}</em>
          </button>`).join('')}
        <button type="button" class="strip-arrow" data-action="next-week" aria-label="Semana seguinte">›</button>
      </div>`;
  }

  function monthGrid() {
    const first = `${month}-01`;
    const offset = weekday(first) - 1;
    const total = lastDayOfMonth(month);
    const days = Array.from({ length: total }, (_, i) => `${month}-${pad(i + 1)}`);
    const has = datesWithEvents(state.events, days);
    const hasT = datesWithTodos(state.todos, days);
    const today = todayKey();
    return `
      <div class="month-nav">
        <button type="button" class="strip-arrow" data-action="prev-month" aria-label="Mês anterior">‹</button>
        <strong>${esc(monthLabel(first))}</strong>
        <button type="button" class="strip-arrow" data-action="next-month" aria-label="Mês seguinte">›</button>
      </div>
      <div class="month-grid">
        ${[1, 2, 3, 4, 5, 6, 7].map((w) => `<span class="mg-head">${WEEKDAY_LETTER[w]}</span>`).join('')}
        ${'<span></span>'.repeat(offset)}
        ${days.map((d) => `
          <button type="button" class="mg-day ${d === selected ? 'sel' : ''} ${d === today ? 'today' : ''}" data-day="${d}">
            ${fromKey(d).getDate()}<em>${has.has(d) ? '<i class="on"></i>' : ''}${hasT.has(d) ? '<i class="td"></i>' : ''}</em>
          </button>`).join('')}
      </div>
      <p class="group-footer">Toca num dia para ver tudo. <span class="legend"><i class="on"></i> eventos <i class="td"></i> tarefas</span></p>`;
  }

  function render() {
    if (!state.ready) return;
    const today = todayKey();
    scr.setCaps(view === 'dia' ? monthLabel(selected) : 'Vista do mês');
    const n = inbox(state.todos).length;
    const badge = section.querySelector('.inbox-btn .badge');
    badge.hidden = !n;
    badge.textContent = n;

    const rel = selected === today ? 'Hoje' : selected === addDays(today, 1) ? 'Amanhã' : selected === addDays(today, -1) ? 'Ontem' : '';
    const controls = `
      <div class="agenda-controls">
        <div class="segmented">
          <button type="button" data-view="dia" aria-pressed="${view === 'dia'}">Dia</button>
          <button type="button" data-view="mes" aria-pressed="${view === 'mes'}">Mês</button>
        </div>
        <button type="button" class="pill-btn" data-action="today" ${selected === today && month === today.slice(0, 7) ? 'disabled' : ''}>Hoje</button>
      </div>`;
    slot('qa').hidden = view !== 'dia';

    if (view === 'mes') {
      slot('top').innerHTML = controls + monthGrid();
      slot('list').innerHTML = whisper('agenda-fim');
      return;
    }

    const tasks = todosOn(state.todos, selected, today);
    const doneN = tasks.filter((x) => x.todo.feito).length;
    const events = agendaListHTML(selected);
    slot('top').innerHTML = `${controls}${weekStrip()}
      <div class="sec"><span class="caps">${esc(rel ? `${rel} · ` : '')}${esc(formatLong(selected))}</span></div>
      <div class="sub-sec"><span>Tarefas${tasks.length ? ` · ${doneN}/${tasks.length}` : ''}</span></div>`;
    slot('list').innerHTML = `
      ${tasks.length ? `<div class="group list">${tasks.map((x) => todoRowHTML(x, today)).join('')}</div>` : ''}
      <div class="sub-sec"><span>Eventos</span><button type="button" class="sec-link" data-action="new">+ Evento</button></div>
      ${events ? `<div class="group ev-list">${events}</div>` : '<div class="empty small"><p>Nada marcado.</p></div>'}
      ${whisper('agenda-fim')}`;
    bindTodoRows(slot('list'));
  }

  // Atualiza a linha "agora" de minuto a minuto, quando o ecrã está visível.
  setInterval(() => { if (!section.hidden && document.visibilityState === 'visible' && view === 'dia' && selected === todayKey()) render(); }, 60000);

  return { render, scroller: scr.scroller, goTo(date) { selected = date; view = 'dia'; render(); } };
}

export { REPEAT };
