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
import { toggleCheck, addQty } from '../state.js';
import { glow, play, toast } from '../ui/effects.js';
import { todayList } from '../engine/habits.js';
import { closingLine } from '../engine/phrases.js';
import { history } from '../engine/goals.js';
import { objProgress, pace, sortObjectives } from '../engine/objectives.js';
import { barChart } from '../ui/charts.js';
import { openObjectiveForm } from './objectiveForm.js';
import { openObjectiveSheet } from './objectiveSheet.js';
import { fromKey, shortDate } from '../engine/dates.js';

/** Cartão de objetivo (lista). */
export function objectiveCardHTML(o, today = todayKey()) {
  const ctx = goalCtx();
  const p = o.tipo === 'feito' ? objProgress(o, ctx, today) : pace(o, ctx, today);
  const done = p.done || !!o.feito;
  const left = daysBetween(today, o.prazo);
  const date = shortDate(o.prazo, today);
  const u = o.unidade || '';
  let foot = '', marker = '';
  if (o.tipo === 'feito') {
    const steps = o.marcos || [];
    foot = `<span>${steps.filter((m) => m.feito).length} de ${steps.length} passos</span><span>${done ? 'Cumprido ✦' : ''}</span>`;
  } else {
    const span = p.target - p.start;
    const ePct = span ? Math.max(0, Math.min(1, (p.expected - p.start) / span)) : 0;
    if (!done && left >= 0) marker = `<b style="left:${(ePct * 100).toFixed(1)}%"></b>`;
    const status = done ? '<span class="hot">Cumprido ✦</span>'
      : p.late ? '<span class="hot">prazo passou</span>'
      : p.elapsed < 7 ? '<span>a começar</span>'
      : p.ahead ? '<span class="hot">à frente do ritmo ✦</span>'
      : '<span>um pouco atrás</span>';
    foot = `<span>${esc(fmtValue(p.value))}${o.tipo === 'medicao' ? ` ${esc(u)} → ${esc(fmtValue(p.target, u))}` : ` de ${esc(fmtValue(p.target, u))}`}</span>${status}`;
  }
  return `
    <button type="button" class="card obj-card ${done ? 'done' : ''}" data-obj="${esc(o.id)}">
      <div class="ob-top">
        <span class="ob-emoji">${esc(o.emoji || '🎯')}</span>
        <div class="ob-text"><div class="gc-title">${esc(o.titulo)}</div>
          <div class="muted small">${done ? `cumprido${o.concluidoEm ? ` a ${shortDate(o.concluidoEm, today)}` : ''}` : left >= 0 ? `até ${esc(date)} · ${left === 0 ? 'último dia' : `faltam ${left} dias`}` : `prazo: ${esc(date)}`}</div></div>
      </div>
      ${done ? '' : `<div class="bar obj-bar"><i style="width:${(p.pct * 100).toFixed(1)}%"></i>${marker}</div>`}
      <div class="ob-foot">${foot}</div>
    </button>`;
}

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

  let tab = 'objetivos';
  let month = currentPeriod('mes', todayKey());
  let week = currentPeriod('semana', todayKey());
  let habitWeek = currentPeriod('semana', todayKey());

  section.addEventListener('click', (e) => {
    const t = e.target.closest('[data-seg],[data-action],[data-goal],[data-htoggle],[data-hplus],[data-hopen],[data-hweek],[data-obj]');
    if (!t) return;
    if (t.dataset.obj) return openObjectiveSheet(t.dataset.obj);
    if (t.dataset.seg) { tab = t.dataset.seg; return render(); }
    if (t.dataset.goal) return openGoalSheet(t.dataset.goal);
    if (t.dataset.htoggle) return toggleHabit(t);
    if (t.dataset.hplus) return plusHabit(t);
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
      if (tab === 'objetivos') return openObjectiveForm();
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

  async function plusHabit(btn) {
    const h = state.habits.find((x) => x.id === btn.dataset.hplus);
    if (!h) return;
    const today = todayKey();
    btn.classList.add('pop');
    const before = todayList(state.habits, state.idx, today).find((i) => i.habit.id === h.id)?.done;
    const res = await addQty(h.id, today, Number(h.quantidade?.passo) || 1);
    play('check');
    if (res.done && !before) {
      const list = todayList(state.habits, state.idx, today);
      if (list.length && list.every((i) => i.done)) { glow(); play('closed'); toast(closingLine(today), { long: true }); }
      else toast(`${h.nome}: alvo atingido ✦`);
    }
  }

  async function toggleHabit(btn) {
    if (btn.disabled) return;
    const today = todayKey();
    btn.classList.add('pop');
    const res = await toggleCheck(btn.dataset.htoggle, btn.dataset.date);
    play(res.done ? 'check' : 'undo');
    if (res.state === 'slip') toast('Acontece. O que conta é o próximo dia limpo.');
    if (res.state === 'min') toast('Mínimo feito. Conta para a sequência ✦');
    if (res.done && res.state !== 'min' && btn.dataset.date === today) {
      const list = todayList(state.habits, state.idx, today);
      if (list.length && list.every((i) => i.done)) { glow(); play('closed'); toast(closingLine(today), { long: true }); }
      else if (res.streak && [7, 14, 21, 30, 50, 100, 365].includes(res.streak.value) && res.streak.unit !== 'semanas') toast(`${res.streak.value} dias. não quebres a corrente.`, { icon: '✦' });
    }
  }

  function historyHTML(tipo, current) {
    const n = tipo === 'mes' ? 6 : 8;
    const periods = Array.from({ length: n }, (_, i) => shiftPeriod(tipo, current, i - (n - 1)));
    const h = history(state.goals, tipo, periods, goalCtx());
    if (!h.some((x) => x.total)) return '';
    const items = h.map((x) => ({
      label: tipo === 'mes' ? new Intl.DateTimeFormat('pt-PT', { month: 'short' }).format(fromKey(`${x.periodo}-01`)).replace('.', '') : `S${weekLabel(x.periodo).split(' ')[1]}`,
      pct: x.total ? x.pct : null,
      text: x.total ? `${x.done}/${x.total}` : '—',
      current: x.periodo === current,
    }));
    return `
      <div class="sec"><span class="caps">${tipo === 'mes' ? 'Últimos 6 meses' : 'Últimas 8 semanas'}</span></div>
      <div class="card chart-card">${barChart(items)}<p class="muted small">Metas cumpridas em cada ${tipo === 'mes' ? 'mês' : 'semana'}.</p></div>`;
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
    } else if (tab === 'objetivos') {
      const active = state.objectives.filter((o) => !(objProgress(o, goalCtx(), today).done || o.feito)).length;
      const doneN = state.objectives.length - active;
      scr.setCaps(`${active} ${active === 1 ? 'objetivo' : 'objetivos'}${doneN ? ` · ${doneN} ${doneN === 1 ? 'cumprido' : 'cumpridos'}` : ''}`);
    } else scr.setCaps(`${state.habits.length} ${state.habits.length === 1 ? 'hábito' : 'hábitos'}`);

    const tabs = `
      <div class="pad">
        <div class="segmented">
          <button type="button" data-seg="objetivos" aria-pressed="${tab === 'objetivos'}">Objetivos</button>
          <button type="button" data-seg="mes" aria-pressed="${tab === 'mes'}">Mês</button>
          <button type="button" data-seg="semana" aria-pressed="${tab === 'semana'}">Semana</button>
          <button type="button" data-seg="habitos" aria-pressed="${tab === 'habitos'}">Hábitos</button>
        </div>
      </div>`;

    let body = '';
    if (tab === 'habitos') {
      body = habitsListHTML(habitWeek);
    } else if (tab === 'objetivos') {
      const list = sortObjectives(state.objectives, goalCtx(), today);
      const active = list.filter((o) => !(objProgress(o, goalCtx(), today).done || o.feito));
      const done = list.filter((o) => objProgress(o, goalCtx(), today).done || o.feito);
      body = list.length
        ? `${active.map((o) => objectiveCardHTML(o, today)).join('')}
           ${done.length ? `<div class="sec"><span class="caps">Cumpridos ✦</span></div>${done.map((o) => objectiveCardHTML(o, today)).join('')}` : ''}
           <p class="group-footer">O traço branco na barra é onde devias estar hoje para chegares a tempo.</p>`
        : `<div class="empty"><div class="empty-star">✦</div><h3>Sem objetivos</h3><p>Algo concreto, com data e com um porquê.<br>Ex.: "Juntar 3 000 € até junho".<br>Toca em <b>+</b> para começar.</p></div>`;
    } else {
      const periodo = tab === 'mes' ? month : week;
      const list = goalsFor(state.goals, tab, periodo);
      const label = tab === 'mes' ? monthLabel(`${month}-01`) : `${weekLabel(week)} · ${new Intl.DateTimeFormat('pt-PT', { day: 'numeric', month: 'short' }).format(new Date(`${week}T12:00`))}`;
      const doneN = list.filter((g) => progress(g, goalCtx()).done).length;
      body = `
        ${periodNav(label, periodo === (tab === 'mes' ? curMonth : curWeek))}
        ${list.length ? `<p class="group-footer center tight">${doneN} de ${list.length} cumpridas</p>${list.map((g) => goalCardHTML(g)).join('')}`
          : `<div class="empty small"><p>Sem metas ${tab === 'mes' ? 'para este mês' : 'para esta semana'}.<br>Toca em <b>+</b> para definir.</p></div>`}
        ${historyHTML(tab, tab === 'mes' ? curMonth : curWeek)}`;
    }
    scr.content.innerHTML = `${tabs}${body}${whisper(`metas-${tab}`)}`;
  }

  return { render, scroller: scr.scroller, setTab(t) { tab = t; render(); } };
}
