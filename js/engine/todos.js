// Tarefas: por dia, atrasadas, sem data, repetições. Funções puras (testadas em tests.html).
import { addDays, fromKey, pad } from './dates.js';

const rank = (t) => (t.feito ? 1 : 0);
const byOrder = (a, b) =>
  rank(a) - rank(b) ||
  (b.prioridade ? 1 : 0) - (a.prioridade ? 1 : 0) ||
  (a.hora || '99:99').localeCompare(b.hora || '99:99') ||
  (a.ordem ?? 0) - (b.ordem ?? 0);

/** Tarefas por fazer de dias anteriores. */
export const overdue = (todos, today) => todos.filter((t) => !t.feito && t.data && t.data < today).sort((a, b) => (a.data < b.data ? -1 : 1));

/** Tarefas sem data ("um dia destes"), por fazer. */
export const inbox = (todos) => todos.filter((t) => !t.data && !t.feito).sort(byOrder);

/**
 * Tarefas de um dia. Se o dia for hoje, junta as atrasadas (marcadas com `atrasada`).
 * Devolve objetos { todo, atrasada }.
 */
export function todosOn(todos, date, today) {
  const list = todos.filter((t) => t.data === date);
  const out = list.sort(byOrder).map((todo) => ({ todo, atrasada: false }));
  if (date === today) {
    const late = overdue(todos, today).map((todo) => ({ todo, atrasada: true }));
    // Atrasadas por fazer vêm antes das concluídas de hoje.
    const firstDone = out.findIndex((x) => x.todo.feito);
    out.splice(firstDone === -1 ? out.length : firstDone, 0, ...late);
  }
  return out;
}

/** As prioridades (✦) do dia, por fazer ou feitas. */
export const prioritiesOn = (todos, date) => todos.filter((t) => t.data === date && t.prioridade).sort(byOrder);

/** Próxima data de uma tarefa que se repete. */
export function nextDate(data, repetir) {
  if (!data) return null;
  if (repetir === 'diario') return addDays(data, 1);
  if (repetir === 'semanal') return addDays(data, 7);
  if (repetir === 'mensal') {
    const d = fromKey(data);
    const day = d.getDate();
    const next = new Date(d.getFullYear(), d.getMonth() + 1, 1);
    const last = new Date(next.getFullYear(), next.getMonth() + 1, 0).getDate();
    next.setDate(Math.min(day, last));
    return `${next.getFullYear()}-${pad(next.getMonth() + 1)}-${pad(next.getDate())}`;
  }
  return null;
}

export const datesWithTodos = (todos, dates) => new Set(dates.filter((d) => todos.some((t) => t.data === d && !t.feito)));

export function stepsLabel(t) {
  const steps = t.passos || [];
  if (!steps.length) return '';
  return `${steps.filter((s) => s.feito).length}/${steps.length}`;
}
