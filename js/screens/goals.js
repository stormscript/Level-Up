// Ecrã "Metas": Mês · Semana · Hábitos.
import { state, goalCtx } from '../state.js';
import { todayKey, monthLabel, daysBetween, addDays } from '../engine/dates.js';
import { goalsFor, childrenOf, progress, currentPeriod, shiftPeriod, weekLabel, periodRange, fmtValue } from '../engine/goals.js';
import { createScreen } from '../ui/screen.js';
import { esc, ICONS } from '../ui/dom.js';
import { whisper } from '../ui/phrase.js';
import { openGoalForm } from './goalForm.js';
import { openGoalSheet } from './goalSheet.js';
import { habitsListHTML } from './habits.js';
import { openHabitForm } from './habitForm.js';
import { openHabitSheet } from './habitSheet.js';
import { toggleCheck } from '../state.js';
import { glow, play, toast } from '../ui/effects.js';
import { todayList } from '../engine/habits.js';
import { closingLine } from '../engine/phrases.js';

/** Cartão de meta (usado também no Hoje). */
export function goalCardHTML(g, { compact = false } = {}) {
  const p = progress(g, goalCtx());
  const kids = !compact && g.tipo === 'mes' ? childrenOf(state.goals, g) : [];
  const thisWeek = currentPeriod('semana', todayKey());
  const value = g.medida === 'feito'
    ? `<span class="gc-done ${p.done ? 'on' : ''}">${p.done ? 'Feito ✦' : 'Por fazer'}</span>`
    : `<div class="gc-num"><b>${esc(fmtValue(p.value))}</b><span>/ ${esc(fmtValue(p.target, g.unidade))}</span></div>`;
  return `
    <button type="button" class="card goal-card ${p.done ? 'done' : ''}" data-goal="${esc(g.id)}">
      <div class="gc-top"><div class="gc-title">${esc(g.titulo)}</div>${value}</div>
      ${g.medida === 'feito' ? '' : `<div class="bar"><i style="width:${(p.pct * 100).toFixed(1)}%"></i></div>`}
      ${kids.map((k) => {
        const kp = progress(k, goalCtx());
        const cur = k.periodo === thisWeek;
        return `<div class="gc-child ${cur ? 'cur' : ''}"><span>${esc(weekLabel(k.periodo))} · ${esc(k.titulo)}</span>
          <span class="${kp.done ? 'hot' : ''}">${k.medida === 'feito' ? (kp.done ? '✦' : '—') : `${esc(fmtValue(kp.value))}${kp.done ? ' ✦' : ''}`}</span></div>`;
      }).join('')}
    </button>`;
}

export function createGoals(section) {
  const scr = createScreen(section, { title: 'Metas' });
  section.insertAdjacentHTML('beforeend', `<button class="fab" type="button" data-action="new" aria-label="Nova">${ICONS.plus}</button>`);

  let tab = 'mes';
  let month = currentPeriod('mes', todayKey());
  let week = currentPeriod('semana', todayKey());
  let habitWeek = currentPeriod('semana', todayKey());

  section.addEventListener('click', (e) => {
    const t = e.target.closest('[data-seg],[data-action],[data-goal],[data-htoggle],[data-hopen],[data-hweek]');
    if (!t) return;
    if (t.dataset.seg) { tab = t.dataset.seg; return render(); }
    if (t.dataset.goal) return openGoalSheet(t.dataset.goal);
    if (t.dataset.htoggle) return toggleHabit(t);
    if (t.dataset.hopen) return openHabitSheet(t.dataset.hopen);
    if (t.dataset.hweek) {
      const n = Number(t.dataset.hweek);
      const cur = currentPeriod('semana', todayKey());
      habitWeek = n === 0 ? cur : shiftPeriod('semana', habitWeek, n);
      if (habitWeek > cur) habitWeek = cur;
      return render();
    }
    const a = t.dataset.action;
    if (a === 'new') {
      if (tab === 'habitos') return openHabitForm();
      return openGoalForm(null, { tipo: tab, periodo: tab === 'mes' ? month : week });
    }
    if (a === 'prev' || a === 'next') {
      const n = a === 'next' ? 1 : -1;
      if (tab === 'mes') month = shiftPeriod('mes', month, n);
      else week = shiftPeriod('semana', week, n);
      return render();
    }
    if (a === 'now') { month = currentPeriod('mes', todayKey()); week = currentPeriod('semana', todayKey()); return render(); }
  });

  async function toggleHabit(btn) {
    if (btn.disabled) return;
    const today = todayKey();
    const wasDone = btn.classList.contains('on') || btn.classList.contains('done');
    btn.classList.toggle(btn.classList.contains('hcheck') ? 'on' : 'done', !wasDone);
    btn.classList.add('pop');
    const res = await toggleCheck(btn.dataset.htoggle, btn.dataset.date);
    play(res.done ? 'check' : 'undo');
    if (res.done && btn.dataset.date === today) {
      const list = todayList(state.habits, state.idx, today);
      if (list.length && list.every((i) => i.done)) { glow(); play('closed'); toast(closingLine(today), { long: true }); }
      else if (res.streak && [7, 14, 21, 30, 50, 100, 365].includes(res.streak.value) && res.streak.unit !== 'semanas') toast(`${res.streak.value} dias. não quebres a corrente.`, { icon: '✦' });
    }
  }

  function periodNav(label, isCurrent) {
    return `
      <div class="period-nav">
        <button type="button" class="strip-arrow" data-action="prev" aria-label="Anterior">‹</button>
        <button type="button" class="period-label" data-action="now">${esc(label)}${isCurrent ? '' : ' <small>· voltar</small>'}</button>
        <button type="button" class="strip-arrow" data-action="next" aria-label="Seguinte">›</button>
      </div>`;
  }

  function render() {
    if (!state.ready) return;
    const today = todayKey();
    const curMonth = currentPeriod('mes', today);
    const curWeek = currentPeriod('semana', today);

    if (tab === 'mes') {
      const [, end] = periodRange({ tipo: 'mes', periodo: month });
      const left = daysBetween(today, end);
      scr.setCaps(month === curMonth ? `${monthLabel(`${month}-01`).split(' ')[0]} · ${left === 0 ? 'último dia' : `faltam ${left} dias`}` : monthLabel(`${month}-01`));
    } else if (tab === 'semana') {
      const left = daysBetween(today, addDays(week, 6));
      scr.setCaps(week === curWeek ? `${weekLabel(week)} · ${left === 0 ? 'último dia' : `faltam ${left} dias`}` : weekLabel(week));
    } else scr.setCaps(`${state.habits.length} ${state.habits.length === 1 ? 'hábito' : 'hábitos'}`);

    const tabs = `
      <div class="pad">
        <div class="segmented">
          <button type="button" data-seg="mes" aria-pressed="${tab === 'mes'}">Mês</button>
          <button type="button" data-seg="semana" aria-pressed="${tab === 'semana'}">Semana</button>
          <button type="button" data-seg="habitos" aria-pressed="${tab === 'habitos'}">Hábitos</button>
        </div>
      </div>`;

    let body = '';
    if (tab === 'habitos') {
      body = habitsListHTML(habitWeek);
    } else {
      const periodo = tab === 'mes' ? month : week;
      const list = goalsFor(state.goals, tab, periodo);
      const label = tab === 'mes' ? monthLabel(`${month}-01`) : `${weekLabel(week)} · ${new Intl.DateTimeFormat('pt-PT', { day: 'numeric', month: 'short' }).format(new Date(`${week}T12:00`))}`;
      const doneN = list.filter((g) => progress(g, goalCtx()).done).length;
      body = `
        ${periodNav(label, periodo === (tab === 'mes' ? curMonth : curWeek))}
        ${list.length ? `<p class="group-footer center tight">${doneN} de ${list.length} cumpridas</p>${list.map((g) => goalCardHTML(g)).join('')}`
          : `<div class="empty small"><p>Sem metas ${tab === 'mes' ? 'para este mês' : 'para esta semana'}.<br>Toca em <b>+</b> para definir.</p></div>`}`;
    }
    scr.content.innerHTML = `${tabs}${body}${whisper(`metas-${tab}`)}`;
  }

  return { render, scroller: scr.scroller, setTab(t) { tab = t; render(); } };
}
