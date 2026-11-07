// "Planear amanhã" (1 minuto) e a caixa "Sem data".
import { state, subscribe, setPriorities, moveTodo } from '../state.js';
import { todayKey, addDays, formatLong, formatRelative } from '../engine/dates.js';
import { overdue, inbox } from '../engine/todos.js';
import { esc, el } from '../ui/dom.js';
import { openSheet } from '../ui/sheet.js';
import { toast, glow } from '../ui/effects.js';
import { agendaListHTML } from './agenda.js';
import { quickAddHTML, bindQuickAdd, todoRowHTML, bindTodoRows } from './todoUI.js';

const MAX = 3;

export function openPlanner() {
  const today = todayKey();
  const tomorrow = addDays(today, 1);
  const body = el('<div class="planner"></div>');
  // Começa com as prioridades que já existam para amanhã.
  const chosen = new Set(state.todos.filter((t) => t.data === tomorrow && t.prioridade && !t.feito).map((t) => t.id));
  let unsub = null;
  const sheet = openSheet({ title: 'Planear amanhã', body, leftLabel: 'Fechar', size: 'large', onClose: () => unsub?.() });

  function candidates() {
    const seen = new Set();
    const list = [];
    const add = (t, tag) => { if (!seen.has(t.id) && !t.feito) { seen.add(t.id); list.push({ t, tag }); } };
    state.todos.filter((t) => t.data === tomorrow).forEach((t) => add(t, 'Amanhã'));
    state.todos.filter((t) => t.data === today).forEach((t) => add(t, 'Hoje'));
    overdue(state.todos, today).forEach((t) => add(t, formatRelative(t.data, today)));
    inbox(state.todos).forEach((t) => add(t, 'Sem data'));
    return list;
  }

  body.innerHTML = `
    <div class="caps center">${esc(formatLong(tomorrow))}</div>
    <p class="planner-lead">Escolhe as <b>3 coisas</b> que, se as fizeres amanhã, o dia valeu a pena.</p>
    <div data-slot="agenda"></div>
    <div class="sec"><span class="caps" data-slot="count"></span></div>
    ${quickAddHTML('Nova tarefa para amanhã…')}
    <div data-slot="list"></div>
    <div class="form-actions">
      <button type="button" class="btn-primary" data-action="done">Fechar o plano ✦</button>
    </div>`;
  bindQuickAdd(body, () => tomorrow);

  function render() {
    const agenda = agendaListHTML(tomorrow);
    const list = candidates();
    body.querySelector('[data-slot=agenda]').innerHTML = `
      <div class="sec"><span class="caps">Amanhã na agenda</span></div>
      ${agenda ? `<div class="group ev-list">${agenda}</div>` : '<p class="group-footer">Agenda livre.</p>'}`;
    body.querySelector('[data-slot=count]').textContent = `As 3 de amanhã · ${chosen.size}/${MAX}`;
    body.querySelector('[data-slot=list]').innerHTML = `
      ${list.length ? `<div class="group pick-list">${list.map(({ t, tag }) => `
        <button type="button" class="cell pick ${chosen.has(t.id) ? 'on' : ''}" data-pick="${esc(t.id)}" aria-pressed="${chosen.has(t.id)}">
          <span class="pick-star">✦</span>
          <span class="cell-label">${esc(t.titulo)}</span>
          <span class="muted small">${esc(tag)}</span>
        </button>`).join('')}</div>` : '<p class="group-footer">Ainda sem tarefas. Escreve acima o que tens para fazer.</p>'}`;
  }

  body.addEventListener('click', async (e) => {
    const p = e.target.closest('[data-pick]');
    if (p) {
      const id = p.dataset.pick;
      if (chosen.has(id)) chosen.delete(id);
      else if (chosen.size >= MAX) return toast('Só 3. Foco.');
      else chosen.add(id);
      return render();
    }
    if (e.target.closest('[data-action=done]')) {
      // As escolhidas que não são de amanhã passam para amanhã.
      for (const id of chosen) {
        const t = state.todos.find((x) => x.id === id);
        if (t && t.data !== tomorrow) await moveTodo(id, tomorrow);
      }
      await setPriorities(tomorrow, [...chosen]);
      sheet.close('done');
      glow();
      toast(chosen.size ? 'Amanhã está planeado.' : 'Plano fechado.', { icon: '✦', long: true });
    }
  });

  unsub = subscribe(() => {
    // Tarefa nova para amanhã: escolhe-a logo se ainda houver lugar.
    const fresh = state.todos.filter((t) => t.data === tomorrow && !t.feito && !chosen.has(t.id) && Date.now() - (t.ordem || 0) < 3000);
    for (const t of fresh) if (chosen.size < MAX) chosen.add(t.id);
    render();
  });
  render();
}

export function openInbox() {
  const body = el('<div class="inbox"></div>');
  let unsub = null;
  openSheet({ title: 'Sem data', body, leftLabel: 'Fechar', size: 'large', onClose: () => unsub?.() });
  body.innerHTML = `
    <p class="planner-lead">Tudo o que é "um dia destes". Despeja aqui e escolhe um dia quando der.</p>
    ${quickAddHTML('Nova ideia ou tarefa…')}
    <div data-slot="list"></div>
    <p class="group-footer">Desliza ← numa tarefa e toca em <b>Hoje</b> para a trazer para hoje.</p>`;
  bindQuickAdd(body, () => null);
  const slot = body.querySelector('[data-slot=list]');
  const render = () => {
    const list = inbox(state.todos);
    slot.innerHTML = list.length
      ? `<div class="group list">${list.map((t) => todoRowHTML({ todo: t, atrasada: false })).join('')}</div>`
      : '<div class="empty small"><p>Caixa vazia. Cabeça leve.</p></div>';
    bindTodoRows(slot);
  };
  unsub = subscribe(render);
  render();
}
