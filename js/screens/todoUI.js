// Tarefas: linha com gestos, escrita rápida e formulário completo.
import { state, saveTodo, deleteTodo, toggleTodo, moveTodo, toggleStep } from '../state.js';
import { todayKey, addDays, formatRelative } from '../engine/dates.js';
import { parseQuick } from '../engine/parse.js';
import { stepsLabel } from '../engine/todos.js';
import { progress } from '../engine/goals.js';
import { esc, el, ICONS } from '../ui/dom.js';
import { attachSwipe } from '../ui/swipe.js';
import { openSheet, actionSheet } from '../ui/sheet.js';
import { toast, play } from '../ui/effects.js';
import { uid } from '../seed.js';

// ---------- Linha ----------

export function todoRowHTML({ todo: t, atrasada }, today = todayKey()) {
  const meta = [];
  if (atrasada) meta.push(`<span class="late">${esc(formatRelative(t.data, today))}</span>`);
  if (t.hora) meta.push(esc(t.hora));
  const steps = stepsLabel(t);
  if (steps) meta.push(`☰ ${steps}`);
  if (t.repetir && t.repetir !== 'nunca') meta.push('↻');
  const goal = t.goalId && state.goals.find((g) => g.id === t.goalId);
  if (goal) meta.push(`◎ ${esc(goal.titulo)}`);
  return `
    <div class="swipe-row todo-row ${t.feito ? 'done' : ''} ${t.prioridade ? 'prio' : ''}" data-todo="${esc(t.id)}">
      <div class="swipe-under">${t.feito ? 'Desfazer' : 'Feito'}</div>
      <div class="swipe-actions">
        <button type="button" class="sa-move" data-swipe="tomorrow">${t.data && t.data <= today ? 'Amanhã' : 'Hoje'}</button>
        <button type="button" class="sa-edit" data-swipe="edit">Editar</button>
        <button type="button" class="sa-delete" data-swipe="delete">Apagar</button>
      </div>
      <div class="swipe-content task">
        <button type="button" class="check square" aria-label="${t.feito ? 'Desfazer' : 'Concluir'} ${esc(t.titulo)}"><span class="ring">${ICONS.check}</span></button>
        <div class="task-body">
          <div class="task-title">${t.prioridade ? '<span class="star-mini">✦</span>' : ''}${esc(t.titulo)}</div>
          ${meta.length ? `<div class="task-meta">${meta.join(' · ')}</div>` : ''}
        </div>
      </div>
    </div>`;
}

/** Liga gestos e toques às linhas de tarefa dentro de `container`. */
export function bindTodoRows(container, { onToggled } = {}) {
  container.querySelectorAll('.todo-row').forEach((row) => {
    const id = row.dataset.todo;
    const toggle = () => doToggle(row, onToggled);
    attachSwipe(row, {
      onRight: toggle,
      onEdit: () => openTodoForm(state.todos.find((t) => t.id === id)),
      onDelete: () => confirmDeleteTodo(state.todos.find((t) => t.id === id)),
      onAction: (a) => {
        const t = state.todos.find((x) => x.id === id);
        if (a !== 'tomorrow' || !t) return;
        const today = todayKey();
        const target = t.data && t.data <= today ? addDays(today, 1) : today;
        moveTodo(id, target);
        toast(target === today ? 'Passou para hoje' : 'Passou para amanhã');
      },
    });
    row.querySelector('.check').addEventListener('click', (e) => { e.stopPropagation(); toggle(); });
    row.querySelector('.task-body').addEventListener('click', () => openTodoForm(state.todos.find((t) => t.id === id)));
  });
}

async function doToggle(row, onToggled) {
  const wasDone = row.classList.contains('done');
  row.classList.toggle('done', !wasDone);
  if (!wasDone) row.classList.add('pop');
  play(wasDone ? 'undo' : 'check');
  const t = state.todos.find((x) => x.id === row.dataset.todo);
  const res = await toggleTodo(row.dataset.todo);
  if (res?.done && t?.goalId) {
    const g = state.goals.find((x) => x.id === t.goalId);
    if (g) toast(`+1 em "${g.titulo}"${progress(g, { goals: state.goals }).done ? ' ✦' : ''}`);
  } else if (res?.done && t?.repetir && t.repetir !== 'nunca') toast('Feito. A próxima já está marcada.', { icon: '↻' });
  onToggled?.(res);
}

// ---------- Escrita rápida ----------

/**
 * Campo "Nova tarefa…" que percebe datas e horas.
 * @param base data por omissão (null = sem data)
 */
export function quickAddHTML(placeholder = 'Nova tarefa… ex.: sexta 15h') {
  return `
    <form class="quick-add" novalidate autocomplete="off">
      <span class="qa-plus">+</span>
      <input type="text" name="q" maxlength="120" placeholder="${esc(placeholder)}" enterkeyhint="done" aria-label="Nova tarefa">
      <button type="submit" class="qa-go" aria-label="Adicionar">↵</button>
      <div class="qa-hint" aria-live="polite"></div>
    </form>`;
}

export function bindQuickAdd(container, getBase) {
  const form = container.querySelector('.quick-add');
  if (!form) return;
  const input = form.elements.q;
  const hint = form.querySelector('.qa-hint');
  const describe = () => {
    const v = input.value.trim();
    if (!v) { hint.textContent = ''; form.classList.remove('typing'); return; }
    form.classList.add('typing');
    const p = parseQuick(v, todayKey(), getBase());
    const when = p.data ? formatRelative(p.data) : 'Sem data';
    hint.textContent = `→ ${when}${p.hora ? ` · ${p.hora}` : ''}${p.prioridade ? ' · ✦ importante' : ''}`;
  };
  input.addEventListener('input', describe);
  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const p = parseQuick(input.value, todayKey(), getBase());
    if (!p.titulo) return input.focus();
    await saveTodo({ titulo: p.titulo, data: p.data, hora: p.hora, prioridade: p.prioridade });
    input.value = '';
    describe();
    toast(`Tarefa · ${p.data ? formatRelative(p.data) : 'sem data'}${p.hora ? ` · ${p.hora}` : ''}`, { icon: '✦' });
    // O campo não é redesenhado: o teclado fica aberto para escrever a seguinte.
  });
}

// ---------- Formulário completo ----------

export function openTodoForm(existing = null, { date = todayKey() } = {}) {
  const f = {
    titulo: existing?.titulo || '',
    comData: existing ? !!existing.data : date !== null,
    data: existing?.data || date || todayKey(),
    comHora: !!existing?.hora,
    hora: existing?.hora || '09:00',
    prioridade: !!existing?.prioridade,
    repetir: existing?.repetir || 'nunca',
    goalId: existing?.goalId || '',
    nota: existing?.nota || '',
    passos: (existing?.passos || []).map((p) => ({ ...p })),
  };
  const goals = state.goals.filter((g) => g.medida !== 'feito' && (g.modo || 'manual') === 'manual');

  const form = el(`
    <form class="form" novalidate autocomplete="off">
      <div class="group">
        <div class="cell"><input name="titulo" type="text" maxlength="120" enterkeyhint="done" placeholder="O que tens de fazer?" value="${esc(f.titulo)}" aria-label="Tarefa"></div>
      </div>

      <div class="group" style="margin-top:14px">
        <label class="cell"><span class="cell-label">✦ Importante</span><input type="checkbox" class="switch" name="prioridade" ${f.prioridade ? 'checked' : ''}></label>
      </div>

      <div class="group-header">Quando</div>
      <div class="group">
        <label class="cell"><span class="cell-label">Com data</span><input type="checkbox" class="switch" name="comData" ${f.comData ? 'checked' : ''}></label>
        <label class="cell" data-if="data"><span class="cell-label">Dia</span><input type="date" name="data" value="${esc(f.data)}"></label>
        <label class="cell" data-if="data"><span class="cell-label">Hora</span><input type="checkbox" class="switch" name="comHora" ${f.comHora ? 'checked' : ''}></label>
        <label class="cell" data-if="hora"><span class="cell-label">Às</span><input type="time" name="hora" value="${esc(f.hora)}"></label>
      </div>
      <div data-if="data">
        <div class="group-header">Repetir</div>
        <div class="pad">
          <div class="segmented" data-field="repetir">
            <button type="button" data-v="nunca">Não</button>
            <button type="button" data-v="diario">Diário</button>
            <button type="button" data-v="semanal">Semanal</button>
            <button type="button" data-v="mensal">Mensal</button>
          </div>
        </div>
      </div>

      <div class="group-header">Passos</div>
      <div class="group steps"></div>
      <div class="add-step"><input type="text" name="passo" maxlength="80" placeholder="+ Adicionar passo" enterkeyhint="done" aria-label="Novo passo"></div>

      ${goals.length ? `
        <div class="group-header">Conta para uma meta</div>
        <div class="group">
          <label class="cell"><span class="cell-label">Meta</span>
            <select name="goalId" class="select-right">
              <option value="">Nenhuma</option>
              ${goals.map((g) => `<option value="${esc(g.id)}" ${g.id === f.goalId ? 'selected' : ''}>${esc(g.titulo)}</option>`).join('')}
            </select></label>
        </div>
        <p class="group-footer">Ao concluir a tarefa, soma +1 à meta.</p>` : ''}

      <div class="group-header">Nota</div>
      <div class="group"><textarea name="nota" class="notes" rows="2" placeholder="Opcional">${esc(f.nota)}</textarea></div>

      <div class="form-actions">
        <button type="submit" class="btn-primary">${existing ? 'Guardar' : 'Criar tarefa'}</button>
        ${existing ? '<button type="button" class="btn-destructive" data-action="delete">Apagar tarefa</button>' : ''}
      </div>
    </form>`);

  const stepsEl = form.querySelector('.steps');
  const renderSteps = () => {
    stepsEl.hidden = !f.passos.length;
    stepsEl.innerHTML = f.passos.map((p) => `
      <div class="cell step ${p.feito ? 'done' : ''}">
        <button type="button" class="step-check" data-step="${esc(p.id)}" aria-label="Marcar passo">${p.feito ? '✓' : ''}</button>
        <span class="cell-label">${esc(p.texto)}</span>
        <button type="button" class="icon-btn small" data-del-step="${esc(p.id)}" aria-label="Apagar passo">×</button>
      </div>`).join('');
  };
  const sync = () => {
    form.querySelectorAll('[data-field=repetir] [data-v]').forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.v === f.repetir)));
    form.querySelectorAll('[data-if=data]').forEach((x) => (x.hidden = !f.comData));
    form.querySelectorAll('[data-if=hora]').forEach((x) => (x.hidden = !f.comData || !f.comHora));
  };

  form.addEventListener('click', (e) => {
    const opt = e.target.closest('[data-field=repetir] [data-v]');
    if (opt) { f.repetir = opt.dataset.v; return sync(); }
    const st = e.target.closest('[data-step]');
    if (st) { const p = f.passos.find((x) => x.id === st.dataset.step); p.feito = !p.feito; return renderSteps(); }
    const del = e.target.closest('[data-del-step]');
    if (del) { f.passos = f.passos.filter((x) => x.id !== del.dataset.delStep); return renderSteps(); }
  });
  form.elements.comData.addEventListener('change', (e) => { f.comData = e.target.checked; sync(); });
  form.elements.comHora.addEventListener('change', (e) => { f.comHora = e.target.checked; sync(); });
  form.elements.passo.addEventListener('keydown', (e) => {
    if (e.key !== 'Enter') return;
    e.preventDefault();
    const v = e.target.value.trim();
    if (!v) return;
    f.passos.push({ id: uid(), texto: v, feito: false });
    e.target.value = '';
    renderSteps();
  });

  const sheet = openSheet({ title: existing ? 'Tarefa' : 'Nova tarefa', body: form, size: 'large' });
  sync();
  renderSteps();

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const titulo = form.elements.titulo.value.trim();
    if (!titulo) {
      const g = form.elements.titulo.closest('.group');
      g.classList.remove('shake'); void g.offsetWidth; g.classList.add('shake');
      return form.elements.titulo.focus();
    }
    // Passo escrito mas sem Enter: também conta.
    const pending = form.elements.passo.value.trim();
    if (pending) f.passos.push({ id: uid(), texto: pending, feito: false });
    await saveTodo({
      ...(existing || {}),
      titulo,
      prioridade: form.elements.prioridade.checked,
      data: f.comData ? form.elements.data.value || todayKey() : null,
      hora: f.comData && f.comHora ? form.elements.hora.value : '',
      repetir: f.comData ? f.repetir : 'nunca',
      goalId: form.elements.goalId?.value || null,
      nota: form.elements.nota.value.trim(),
      passos: f.passos,
      seed: undefined,
    });
    sheet.close('saved');
    toast(existing ? 'Guardado' : 'Tarefa criada', { icon: '✦' });
  });

  form.querySelector('[data-action=delete]')?.addEventListener('click', async () => {
    if (await confirmDeleteTodo(existing)) sheet.close('deleted');
  });
}

export async function confirmDeleteTodo(t) {
  if (!t) return false;
  const ok = await actionSheet({ title: `Apagar "${t.titulo}"?`, actions: [{ label: 'Apagar tarefa', destructive: true }] });
  if (!ok) return false;
  await deleteTodo(t.id);
  toast('Apagada');
  return true;
}

export { toggleStep };
