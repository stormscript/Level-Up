// Ecrã principal: "Hoje".
import { state, toggleCheck, journalOn, addQty } from '../state.js';
import { prefs, setPref } from '../prefs.js';
import { todayList, streak, frequencyLabel, atRisk, avoidList, dayState, MOMENTOS } from '../engine/habits.js';
import { todayKey, capsDate, greeting } from '../engine/dates.js';
import { closingLine, journalPrompt } from '../engine/phrases.js';
import { createScreen } from '../ui/screen.js';
import { esc, ICONS } from '../ui/dom.js';
import { attachSwipe } from '../ui/swipe.js';
import { toast, glow, play } from '../ui/effects.js';
import { line, whisper } from '../ui/phrase.js';
import { shouldShowInstallBanner } from '../ui/install.js';
import { openHabitForm, confirmDeleteHabit } from './habitForm.js';
import { openHabitSheet } from './habitSheet.js';
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
import { todosOn } from '../engine/todos.js';
import { countdowns } from '../engine/agenda.js';
import { nudges } from '../engine/nudges.js';
import { progress } from '../engine/goals.js';
import { addDays } from '../engine/dates.js';
import { quickAddHTML, bindQuickAdd, todoRowHTML, bindTodoRows, openTodoForm } from './todoUI.js';
import { openPlanner, openInbox } from './planner.js';
import { openObjectiveForm } from './objectiveForm.js';

const goTab = (tab) => window.dispatchEvent(new CustomEvent('goto-tab', { detail: tab }));

const MILESTONES = [7, 14, 21, 30, 50, 75, 100, 150, 200, 365];

const fmtN = (n) => new Intl.NumberFormat('pt-PT', { maximumFractionDigits: 2 }).format(n);

/** Linha de hábito com gestos (usada no Hoje). */
export function habitRow({ habit, done, week, min, qty }, today) {
  const s = streak(habit, state.idx, today);
  const risk = atRisk(habit, state.idx, today);
  let meta = week ? `${week.count}/${week.n} esta semana` : frequencyLabel(habit);
  if (qty != null) meta = `${fmtN(qty)}/${fmtN(habit.quantidade.alvo)} ${habit.quantidade.unidade || ''}`.trim();
  if (min) meta = `Mínimo feito · ${meta}`;
  const step = Number(habit.quantidade?.passo) || 1;
  const pct = qty != null ? Math.min(1, qty / Number(habit.quantidade.alvo)) : 0;
  const check = qty != null && !done
    ? `<button type="button" class="check qplus" data-qplus="${esc(habit.id)}" aria-label="Somar ${fmtN(step)}" style="--p:${(pct * 100).toFixed(0)}"><span class="qring"><span>+${fmtN(step)}</span></span></button>`
    : `<button type="button" class="check" aria-label="${done ? 'Mudar' : 'Marcar'} ${esc(habit.nome)}"><span class="ring ${min ? 'min' : ''}">${min ? '½' : ICONS.check}</span></button>`;
  return `
    <div class="swipe-row habit-row ${done ? 'done' : ''} ${min ? 'is-min' : ''}" data-id="${esc(habit.id)}">
      <div class="swipe-under">${done ? 'Desmarcar' : 'Feito'}</div>
      <div class="swipe-actions">
        <button type="button" class="sa-edit" data-swipe="edit">Editar</button>
        <button type="button" class="sa-delete" data-swipe="delete">Apagar</button>
      </div>
      <div class="swipe-content task">
        ${check}
        <div class="task-body">
          <div class="task-title">${esc(habit.nome)}</div>
          <div class="task-meta">${risk ? '<span class="late">Hoje não pode falhar · </span>' : ''}${esc(meta)}</div>
        </div>
        ${s.value ? `<span class="streak ${done ? 'hot' : ''}">${s.value} ${s.unit}</span>` : ''}
      </div>
    </div>`;
}

/** Hábitos de hoje agrupados por momento do dia (só mostra cabeçalhos se houver mais de um grupo). */
function habitGroupsHTML(list, today) {
  const order = ['manha', 'tarde', 'noite', ''];
  const groups = order.map((k) => ({ k, items: list.filter((i) => (i.habit.momento || '') === k) })).filter((g) => g.items.length);
  if (groups.length <= 1) return `<div class="group list">${list.map((i) => habitRow(i, today)).join('')}</div>`;
  return groups.map((g) => {
    const doneN = g.items.filter((i) => i.done).length;
    return `<div class="sub-sec"><span>${esc(MOMENTOS[g.k])}${g.k ? '' : ''} · ${doneN}/${g.items.length}</span></div>
      <div class="group list">${g.items.map((i) => habitRow(i, today)).join('')}</div>`;
  }).join('');
}

/** Hábitos a evitar: dias limpos + botão de deslize. */
function avoidHTML(today) {
  const list = avoidList(state.habits, today);
  if (!list.length) return '';
  return `<div class="sec"><span class="caps">A evitar</span></div>
    <div class="group">${list.map((h) => {
      const s = streak(h, state.idx, today);
      const slipped = dayState(h, state.idx, today, today) === 'slip';
      return `<div class="cell avoid-row">
        <button type="button" class="avoid-body" data-hopen="${esc(h.id)}"><b>${esc(h.nome)}</b><span class="${slipped ? 'late' : 'muted'} small">${slipped ? 'Deslize hoje' : 'Hoje limpo até agora'}</span></button>
        <span class="avoid-count ${s.value ? 'hot' : ''}"><b>${s.value}</b><span>${s.value === 1 ? 'dia limpo' : 'dias limpo'}</span></span>
        <button type="button" class="pill-btn ${slipped ? '' : 'slip-btn'}" data-slip="${esc(h.id)}">${slipped ? 'Desfazer' : 'Escorreguei'}</button>
      </div>`;
    }).join('')}</div>`;
}

export function createToday(section) {
  const scr = createScreen(section, {
    title: 'Hoje',
    trailing: `<button class="icon-btn" type="button" data-action="settings" aria-label="Definições">${ICONS.gear}</button>`,
  });
  section.insertAdjacentHTML('beforeend', `<button class="fab" type="button" data-action="new" aria-label="Adicionar">${ICONS.plus}</button>`);
  // Estrutura fixa: o campo de escrita rápida não é redesenhado (o teclado não fecha).
  scr.content.innerHTML = `<div data-slot="a"></div><div data-slot="qa">${quickAddHTML('Nova tarefa… ex.: 18h ginásio')}</div><div data-slot="b"></div>`;
  const slot = (n) => scr.content.querySelector(`[data-slot=${n}]`);
  bindQuickAdd(scr.content, () => todayKey());
  let weekGoalId = null;

  let holdUntil = 0;
  let pending = null;

  section.addEventListener('click', (e) => {
    const action = e.target.closest('[data-action]')?.dataset.action;
    if (action === 'settings') return openSettings();
    if (action === 'new') return quickAdd();
    if (action === 'journal') return openJournal();
    if (action === 'goto') return goTab(e.target.closest('[data-action]').dataset.tab);
    if (action === 'plan') return openPlanner();
    if (action === 'start') {
      const k = e.target.closest('[data-action]').dataset.k;
      if (k === 'nome') return openSettings();
      if (k === 'habito') return openHabitForm();
      if (k === 'objetivo') return openObjectiveForm();
      if (k === 'evento') return openEventForm();
      if (k === 'gasto') return openTxForm();
      if (k === 'tarefa') return slot('qa').querySelector('input')?.focus();
    }
    if (action === 'inbox') return openInbox();
    if (action === 'nudge') return runNudge(e.target.closest('[data-action]').dataset.nudge);
    if (action === 'dismiss-nudge') {
      setPref('avisosFechados', { ...pruneDismissed(), [e.target.closest('[data-action]').dataset.nudge]: todayKey() });
      return render();
    }
    const cd = e.target.closest('[data-countdown]');
    if (cd) return openEventForm(state.events.find((x) => x.id === cd.dataset.countdown), { date: cd.dataset.date });
    const goal = e.target.closest('[data-goal]');
    if (goal) return openGoalSheet(goal.dataset.goal);
    const ev = e.target.closest('[data-ev]');
    if (ev) return openEventForm(state.events.find((x) => x.id === ev.dataset.ev), { date: ev.dataset.date });
    if (action === 'dismiss-install') {
      setPref('bannerInstalarFechado', true);
      return render();
    }
    const qp = e.target.closest('[data-qplus]');
    if (qp) return plusQty(qp);
    const slipBtn = e.target.closest('[data-slip]');
    if (slipBtn) return slip(slipBtn.dataset.slip);
    const ho = e.target.closest('[data-hopen]');
    if (ho) return openHabitSheet(ho.dataset.hopen);
    const check = e.target.closest('.habit-row .check');
    if (check) return toggle(check.closest('.swipe-row'));
    const row = e.target.closest('.habit-row');
    if (row) {
      const h = state.habits.find((x) => x.id === row.dataset.id);
      if (h) openHabitSheet(h.id);
    }
  });

  async function quickAdd() {
    const choice = await actionSheet({
      title: 'Adicionar',
      actions: [
        { label: 'Tarefa', value: 'todo' },
        { label: 'Gasto', value: 'tx' },
        { label: 'Evento na agenda', value: 'ev' },
        { label: 'Hábito', value: 'habit' },
        { label: 'Meta', value: 'goal' },
      ],
    });
    if (choice === 'todo') openTodoForm();
    if (choice === 'tx') openTxForm();
    if (choice === 'ev') openEventForm();
    if (choice === 'habit') openHabitForm();
    if (choice === 'goal') openGoalForm(null, { tipo: 'semana' });
  }

  // Remove avisos fechados em dias anteriores.
  function pruneDismissed() {
    const today = todayKey();
    return Object.fromEntries(Object.entries(prefs.avisosFechados || {}).filter(([, d]) => d === today));
  }

  function runNudge(kind) {
    if (kind === 'plan') return openPlanner();
    if (kind === 'journal') return openJournal();
    if (kind === 'goal' && weekGoalId) return openGoalSheet(weekGoalId);
    if (kind === 'finance') return goTab('finance');
    if (kind === 'backup') return openSettings();
    if (kind === 'overdue') return slot('qa').scrollIntoView({ behavior: 'smooth', block: 'start' });
  }

  async function plusQty(btn) {
    const h = state.habits.find((x) => x.id === btn.dataset.qplus);
    if (!h) return;
    holdUntil = performance.now() + 500;
    btn.classList.add('pop');
    const res = await addQty(h.id, todayKey(), Number(h.quantidade?.passo) || 1);
    play('check');
    if (res?.done) { toast(`${h.nome}: alvo atingido ✦`); checkClosed(); }
    schedule();
  }

  async function slip(id) {
    const res = await toggleCheck(id, todayKey());
    if (res?.state === 'slip') toast('Acontece. O que conta é o próximo dia limpo.');
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
      if (res.streak && MILESTONES.includes(res.streak.value) && res.streak.unit !== 'semanas') {
        toast(`${res.streak.value} dias. não quebres a corrente.`, { icon: '✦' });
      }
      checkClosed();
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
    const hour = new Date().getHours();
    const name = prefs.nome?.trim();
    scr.setCaps(capsDate(today));
    scr.setTitleHTML(`${greeting()}${name ? `, ${esc(name)}` : ''}.<span class="star">✦</span>`);
    const t = line('hoje');
    scr.setSubtitle(t ? `“${t}”` : '');

    const list = todayList(state.habits, state.idx, today);
    const tasks = todosOn(state.todos, today, today);
    const habitsDone = list.filter((i) => i.done).length;
    const tasksDone = tasks.filter((x) => x.todo.feito).length;
    const total = list.length + tasks.length;
    const doneN = habitsDone + tasksDone;
    const pct = total ? Math.round((doneN / total) * 100) : 0;
    const closed = total > 0 && doneN === total;
    const j = journalOn(today);
    const weekGoal = featuredWeekly(state.goals, today, goalCtx());
    weekGoalId = weekGoal?.id || null;
    const agenda = agendaListHTML(today, { limit: 4 });
    const spentToday = spentOn(state.txs, today);
    const month = monthSummary(state.txs, today.slice(0, 7));
    const cds = countdowns(state.events, today, 3);
    const planned = prefs.planeadoPara === addDays(today, 1);

    // Avisos ao abrir
    let notes = [];
    if (prefs.avisos) {
      const wp = weekGoal && weekGoal.medida !== 'feito' ? progress(weekGoal, goalCtx()) : null;
      notes = nudges({
        today, hour,
        journalToday: !!j,
        plannedTomorrow: planned,
        weekGoal: wp ? { titulo: weekGoal.titulo, falta: Math.round((wp.target - wp.value) * 100) / 100, unidade: weekGoal.unidade } : null,
        budgetPct: prefs.orcamento ? month.despesas / prefs.orcamento : null,
        lastBackup: prefs.ultimoBackup,
        hasData: ['habits', 'todos', 'txs', 'journal', 'events', 'goals'].some((k) => state[k].some((x) => !x.seed)),
        overdueCount: tasks.filter((x) => x.atrasada).length,
        dismissed: prefs.avisosFechados || {},
      });
    }

    const installBanner = shouldShowInstallBanner(prefs.bannerInstalarFechado)
      ? `<div class="banner">
          <img src="icons/icon-180.png" alt="" class="banner-img">
          <div class="banner-text"><strong>Instala a app</strong>
            <span>Toca em <b>Partilhar</b> ${ICONS.share} (no iOS 26 está em <b>···</b>) → <b>Adicionar ao ecrã principal</b>.</span></div>
          <button type="button" class="icon-btn small" data-action="dismiss-install" aria-label="Fechar">${ICONS.close}</button>
        </div>`
      : '';

    const nudgesHTML = notes.map((n) => `
      <div class="nudge">
        <button type="button" class="nudge-main" data-action="nudge" data-nudge="${n.action}"><span class="nudge-dot"></span>${esc(n.text)}</button>
        <button type="button" class="icon-btn small" data-action="dismiss-nudge" data-nudge="${n.id}" aria-label="Fechar aviso">${ICONS.close}</button>
      </div>`).join('');

    const cdHTML = cds.length ? `
      <div class="countdowns">${cds.map((c) => `
        <button type="button" class="cd" data-countdown="${esc(c.ev.id)}" data-date="${c.data}">
          <b>${c.dias === 0 ? 'Hoje' : c.dias}</b><span>${c.dias === 0 ? '' : c.dias === 1 ? 'dia' : 'dias'}</span>
          <em>${esc(c.ev.titulo)}</em>
        </button>`).join('')}</div>` : '';

    const left = [];
    if (tasks.length - tasksDone) left.push(`${tasks.length - tasksDone} ${tasks.length - tasksDone === 1 ? 'tarefa' : 'tarefas'}`);
    if (list.length - habitsDone) left.push(`${list.length - habitsDone} ${list.length - habitsDone === 1 ? 'hábito' : 'hábitos'}`);

    const empty = ['habits', 'todos', 'events', 'goals', 'objectives', 'txs', 'journal'].every((k) => !state[k].length);
    const starter = empty ? `
      <div class="card starter">
        <div class="caps small">Começa aqui ✦</div>
        <p class="starter-lead">Página em branco. Constrói o teu sistema em 5 minutos:</p>
        <div class="starter-grid">
          ${prefs.nome ? '' : '<button type="button" class="starter-btn" data-action="start" data-k="nome"><b>1</b>O teu nome</button>'}
          <button type="button" class="starter-btn" data-action="start" data-k="objetivo"><b>🎯</b>Um objetivo</button>
          <button type="button" class="starter-btn" data-action="start" data-k="habito"><b>✓</b>Primeiro hábito</button>
          <button type="button" class="starter-btn" data-action="start" data-k="tarefa"><b>☐</b>Tarefa de hoje</button>
          <button type="button" class="starter-btn" data-action="start" data-k="evento"><b>📅</b>Evento na agenda</button>
          <button type="button" class="starter-btn" data-action="start" data-k="gasto"><b>€</b>Primeiro gasto</button>
        </div>
        <p class="muted small">Este cartão desaparece quando criares a primeira coisa.</p>
      </div>` : '';

    slot('a').innerHTML = `
      ${installBanner}
      ${starter}
      ${nudgesHTML}
      ${cdHTML}
      <div class="card summary ${closed ? 'closed' : ''}">
        <div class="ring-progress" style="--p:${pct}"><span>${doneN}/${total}</span></div>
        <div>
          <div class="caps small">O teu dia</div>
          <div class="summary-title">${closed ? 'Dia fechado ✦' : total ? `${left.join(' · ')} por fazer` : 'Dia livre'}</div>
          <div class="muted">${closed ? 'O resto do dia é teu.' : total ? 'Desliza → para concluir' : 'Adiciona uma tarefa ou um hábito.'}</div>
        </div>
      </div>

      <div class="sec"><span class="caps">Tarefas${tasks.length ? ` · ${tasksDone}/${tasks.length}` : ''}</span><button type="button" class="sec-link" data-action="inbox">Sem data</button></div>`;

    slot('b').innerHTML = `
      ${tasks.length ? `<div class="group list">${tasks.map((x) => todoRowHTML(x, today)).join('')}</div>` : ''}

      ${hour >= 18 && !planned ? `
        <button type="button" class="card plan-card" data-action="plan">
          <span class="plan-star">✦</span><div><strong>Planear amanhã</strong><span class="muted small">Escolhe as 3 que importam. 1 minuto.</span></div><span class="chev">${ICONS.chevron}</span>
        </button>` : ''}

      ${weekGoal ? `<div class="sec"><span class="caps">Meta da semana</span><button type="button" class="sec-link" data-action="goto" data-tab="goals">Todas</button></div>${goalCardHTML(weekGoal, { compact: true })}` : ''}

      <div class="sec"><span class="caps">Agenda</span><button type="button" class="sec-link" data-action="goto" data-tab="agenda">Ver tudo</button></div>
      ${agenda ? `<div class="group ev-list">${agenda}</div>` : `<div class="empty small"><p>Nada marcado para hoje.</p></div>`}

      <div class="sec"><span class="caps">Hábitos</span></div>
      ${list.length
        ? habitGroupsHTML(list, today)
        : `<div class="empty small"><p>Nenhum hábito para hoje.</p></div>`}
      ${avoidHTML(today)}

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

      ${planned ? '<p class="group-footer center">Amanhã já está planeado ✦ <button type="button" class="link-btn inline" data-action="plan">rever</button></p>' : ''}
      ${whisper('hoje-fim')}`;

    slot('b').querySelectorAll('.habit-row').forEach((row) => {
      const h = state.habits.find((x) => x.id === row.dataset.id);
      attachSwipe(row, {
        onRight: () => toggle(row),
        onEdit: () => openHabitForm(h),
        onDelete: () => confirmDeleteHabit(h),
      });
    });
    bindTodoRows(slot('b'), { onToggled: (res) => { holdUntil = performance.now() + 600; if (res?.done) checkClosed(); } });
  }

  function checkClosed() {
    const today = todayKey();
    const list = todayList(state.habits, state.idx, today);
    const tasks = todosOn(state.todos, today, today);
    const all = [...list.map((i) => i.done), ...tasks.map((x) => x.todo.feito)];
    if (all.length && all.every(Boolean)) setTimeout(() => { glow(); play('closed'); toast(closingLine(today), { long: true }); }, 250);
  }

  return { render: schedule, scroller: scr.scroller };
}
