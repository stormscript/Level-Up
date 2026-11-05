// Ecrã principal: "Hoje".
import { state, toggleCheck, journalOn } from '../state.js';
import { prefs, setPref } from '../prefs.js';
import { todayList, streak, frequencyLabel } from '../engine/habits.js';
import { todayKey, capsDate, greeting } from '../engine/dates.js';
import { closingLine, journalPrompt } from '../engine/phrases.js';
import { createScreen } from '../ui/screen.js';
import { esc, ICONS } from '../ui/dom.js';
import { attachSwipe } from '../ui/swipe.js';
import { toast, glow, play } from '../ui/effects.js';
import { line, whisper } from '../ui/phrase.js';
import { shouldShowInstallBanner } from '../ui/install.js';
import { openHabitForm, confirmDeleteHabit } from './habitForm.js';
import { openJournal, moodBars } from './journalForm.js';
import { openSettings } from './settings.js';
import { agendaListHTML } from './agenda.js';
import { openEventForm } from './eventForm.js';
import { goalCardHTML } from './goals.js';
import { openGoalForm } from './goalForm.js';
import { openGoalSheet } from './goalSheet.js';
import { openTxForm } from './txForm.js';
import { goalCtx } from '../state.js';
import { featuredWeekly } from '../engine/goals.js';
import { spentOn, monthSummary, fmtEUR } from '../engine/money.js';
import { actionSheet } from '../ui/sheet.js';

const goTab = (tab) => window.dispatchEvent(new CustomEvent('goto-tab', { detail: tab }));

const MILESTONES = [7, 14, 21, 30, 50, 75, 100, 150, 200, 365];

/** Linha de hábito com gestos (usada no Hoje). */
export function habitRow({ habit, done, week }, today) {
  const s = streak(habit, state.idx, today);
  const meta = week ? `${week.count}/${week.n} esta semana` : frequencyLabel(habit);
  return `
    <div class="swipe-row ${done ? 'done' : ''}" data-id="${esc(habit.id)}">
      <div class="swipe-under">${done ? 'Desmarcar' : 'Feito'}</div>
      <div class="swipe-actions">
        <button type="button" class="sa-edit" data-swipe="edit">Editar</button>
        <button type="button" class="sa-delete" data-swipe="delete">Apagar</button>
      </div>
      <div class="swipe-content task">
        <button type="button" class="check" aria-label="${done ? 'Desmarcar' : 'Marcar'} ${esc(habit.nome)}"><span class="ring">${ICONS.check}</span></button>
        <div class="task-body">
          <div class="task-title">${esc(habit.nome)}</div>
          <div class="task-meta">${esc(meta)}</div>
        </div>
        ${s.value ? `<span class="streak ${done ? 'hot' : ''}">${s.value} ${s.unit}</span>` : ''}
      </div>
    </div>`;
}

export function createToday(section) {
  const scr = createScreen(section, {
    title: 'Hoje',
    trailing: `<button class="icon-btn" type="button" data-action="settings" aria-label="Definições">${ICONS.gear}</button>`,
  });
  section.insertAdjacentHTML('beforeend', `<button class="fab" type="button" data-action="new" aria-label="Adicionar">${ICONS.plus}</button>`);

  let holdUntil = 0;
  let pending = null;

  section.addEventListener('click', (e) => {
    const action = e.target.closest('[data-action]')?.dataset.action;
    if (action === 'settings') return openSettings();
    if (action === 'new') return quickAdd();
    if (action === 'journal') return openJournal();
    if (action === 'goto') return goTab(e.target.closest('[data-action]').dataset.tab);
    const goal = e.target.closest('[data-goal]');
    if (goal) return openGoalSheet(goal.dataset.goal);
    const ev = e.target.closest('[data-ev]');
    if (ev) return openEventForm(state.events.find((x) => x.id === ev.dataset.ev), { date: ev.dataset.date });
    if (action === 'dismiss-install') {
      setPref('bannerInstalarFechado', true);
      return render();
    }
    const check = e.target.closest('.check');
    if (check) return toggle(check.closest('.swipe-row'));
    const row = e.target.closest('.swipe-row');
    if (row) {
      const h = state.habits.find((x) => x.id === row.dataset.id);
      if (h) openHabitForm(h);
    }
  });

  async function quickAdd() {
    const choice = await actionSheet({
      title: 'Adicionar',
      actions: [
        { label: 'Gasto', value: 'tx' },
        { label: 'Evento na agenda', value: 'ev' },
        { label: 'Hábito', value: 'habit' },
        { label: 'Meta', value: 'goal' },
      ],
    });
    if (choice === 'tx') openTxForm();
    if (choice === 'ev') openEventForm();
    if (choice === 'habit') openHabitForm();
    if (choice === 'goal') openGoalForm(null, { tipo: 'semana' });
  }

  async function toggle(row) {
    const today = todayKey();
    holdUntil = performance.now() + 600;
    const wasDone = row.classList.contains('done');
    row.classList.toggle('done', !wasDone);
    if (!wasDone) row.classList.add('pop');
    play(wasDone ? 'undo' : 'check');
    const res = await toggleCheck(row.dataset.id, today);
    if (res.done) {
      const list = todayList(state.habits, state.idx, today);
      if (list.length && list.every((i) => i.done)) {
        setTimeout(() => { glow(); play('closed'); toast(closingLine(today), { long: true }); }, 250);
      } else if (res.streak && MILESTONES.includes(res.streak.value) && res.streak.unit !== 'semanas') {
        toast(`${res.streak.value} dias. não quebres a corrente.`, { icon: '✦' });
      }
    }
    schedule();
  }

  function schedule() {
    clearTimeout(pending);
    const wait = holdUntil - performance.now();
    if (wait > 0) pending = setTimeout(render, wait);
    else render();
  }

  function render() {
    if (!state.ready) return;
    const today = todayKey();
    const name = prefs.nome?.trim();
    scr.setCaps(capsDate(today));
    scr.setTitleHTML(`${greeting()}${name ? `, ${esc(name)}` : ''}.<span class="star">✦</span>`);
    const t = line('hoje');
    scr.setSubtitle(t ? `“${t}”` : '');

    const list = todayList(state.habits, state.idx, today);
    const doneN = list.filter((i) => i.done).length;
    const pct = list.length ? Math.round((doneN / list.length) * 100) : 0;
    const closed = list.length > 0 && doneN === list.length;
    const j = journalOn(today);
    const weekGoal = featuredWeekly(state.goals, today, goalCtx());
    const agenda = agendaListHTML(today, { limit: 4 });
    const spentToday = spentOn(state.txs, today);
    const month = monthSummary(state.txs, today.slice(0, 7));

    const installBanner = shouldShowInstallBanner(prefs.bannerInstalarFechado)
      ? `<div class="banner">
          <img src="icons/icon-180.png" alt="" class="banner-img">
          <div class="banner-text"><strong>Instala a app</strong>
            <span>Toca em <b>Partilhar</b> ${ICONS.share} (no iOS 26 está em <b>···</b>) → <b>Adicionar ao ecrã principal</b>.</span></div>
          <button type="button" class="icon-btn small" data-action="dismiss-install" aria-label="Fechar">${ICONS.close}</button>
        </div>`
      : '';

    scr.content.innerHTML = `
      ${installBanner}
      <div class="card summary ${closed ? 'closed' : ''}">
        <div class="ring-progress" style="--p:${pct}"><span>${doneN}/${list.length}</span></div>
        <div>
          <div class="caps small">Hábitos de hoje</div>
          <div class="summary-title">${closed ? 'Dia fechado ✦' : list.length ? `${list.length - doneN} por fazer` : 'Sem hábitos hoje'}</div>
          <div class="muted">${closed ? 'O resto do dia é teu.' : 'Desliza → para marcar'}</div>
        </div>
      </div>

      ${weekGoal ? `<div class="sec"><span class="caps">Meta da semana</span><button type="button" class="sec-link" data-action="goto" data-tab="goals">Todas</button></div>${goalCardHTML(weekGoal, { compact: true })}` : ''}

      <div class="sec"><span class="caps">Agenda</span><button type="button" class="sec-link" data-action="goto" data-tab="agenda">Ver tudo</button></div>
      ${agenda ? `<div class="group ev-list">${agenda}</div>` : `<div class="empty small"><p>Nada marcado para hoje.</p></div>`}

      <div class="sec"><span class="caps">Hábitos</span></div>
      ${list.length
        ? `<div class="group list">${list.map((i) => habitRow(i, today)).join('')}</div>`
        : `<div class="empty small"><p>Nenhum hábito para hoje.</p></div>`}

      <div class="sec"><span class="caps">Dinheiro</span><button type="button" class="sec-link" data-action="goto" data-tab="finance">Finanças</button></div>
      <button type="button" class="card money-card" data-action="goto" data-tab="finance">
        <div><span class="caps small">Hoje</span><b>${esc(fmtEUR(spentToday))}</b></div>
        <div><span class="caps small">Este mês</span><b>${esc(fmtEUR(month.despesas, { round: true }))}${prefs.orcamento ? `<small> / ${esc(fmtEUR(prefs.orcamento, { round: true }))}</small>` : ''}</b></div>
        ${prefs.orcamento ? `<div class="bar thin ${month.despesas > prefs.orcamento ? 'over' : ''}"><i style="width:${Math.min(100, (month.despesas / prefs.orcamento) * 100).toFixed(1)}%"></i></div>` : ''}
      </button>

      <div class="sec"><span class="caps">Diário</span></div>
      <button type="button" class="card journal-card" data-action="journal">
        ${j
          ? `<div class="jc-top">${moodBars(j.humor)}<span class="muted small">Escrito hoje</span></div>
             <p class="jc-text">${esc((j.texto || '').slice(0, 140)) || '<span class="muted">Sem texto.</span>'}</p>`
          : `<div class="jc-top"><span class="jc-icon">${ICONS.pen}</span><span class="muted small">Ainda em branco</span></div>
             <p class="jc-prompt">${esc(journalPrompt(today))}</p>`}
      </button>

      ${whisper('hoje-fim')}`;

    scr.content.querySelectorAll('.swipe-row').forEach((row) => {
      const h = state.habits.find((x) => x.id === row.dataset.id);
      attachSwipe(row, {
        onRight: () => toggle(row),
        onEdit: () => openHabitForm(h),
        onDelete: () => confirmDeleteHabit(h),
      });
    });
  }

  return { render: schedule, scroller: scr.scroller };
}
