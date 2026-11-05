// O que aparece em cada dia: hábitos (recorrentes) e missões pontuais. Funções puras.
import { weekday, weekStart, addDays } from './dates.js';

const isCompletion = (e) => e.tipo === 'concluir';

export function isDoneOn(log, taskId, date) {
  return log.some((e) => isCompletion(e) && e.taskId === taskId && e.data === date);
}

/** Nº de conclusões na semana (segunda a domingo) que contém `date` */
export function weekCount(log, taskId, date) {
  const start = weekStart(date);
  const end = addDays(start, 6);
  return log.filter((e) => isCompletion(e) && e.taskId === taskId && e.data >= start && e.data <= end).length;
}

/** O hábito está agendado para este dia? */
export function isHabitScheduled(task, date) {
  const r = task.recorrencia || { tipo: 'diario' };
  if (r.tipo === 'diario') return true;
  if (r.tipo === 'dias') return (r.dias || []).includes(weekday(date));
  if (r.tipo === 'xPorSemana') return true;
  return false;
}

/**
 * Constrói a lista de um dia.
 * - Hábitos: agendados nesse dia. "X por semana" desaparece quando a meta da semana é atingida.
 * - Missões pontuais: as do dia, as atrasadas por fazer e as concluídas nesse dia.
 * - Próximas: missões pontuais dos próximos 7 dias.
 */
export function buildDay(tasks, log, date) {
  const habits = [];
  const missions = [];
  const upcoming = [];

  for (const t of tasks) {
    if (t.arquivada) continue;

    if (t.tipo === 'habito') {
      if (t.criadaEm && date < t.criadaEm) continue;
      if (!isHabitScheduled(t, date)) continue;
      const done = isDoneOn(log, t.id, date);
      let week = null;
      if (t.recorrencia?.tipo === 'xPorSemana') {
        const count = weekCount(log, t.id, date);
        week = { count, n: t.recorrencia.n };
        if (!done && count >= t.recorrencia.n) continue;
      }
      habits.push({ task: t, done, week });
    } else {
      const completions = log.filter((e) => isCompletion(e) && e.taskId === t.id);
      if (completions.length) {
        if (completions.some((c) => c.data === date)) missions.push({ task: t, done: true, overdue: false });
        continue;
      }
      if (t.data <= date) missions.push({ task: t, done: false, overdue: t.data < date });
      else if (t.data <= addDays(date, 7)) upcoming.push({ task: t });
    }
  }

  const rank = (i) => (i.done ? 2 : i.overdue ? 0 : 1);
  habits.sort((a, b) => rank(a) - rank(b));
  missions.sort((a, b) => rank(a) - rank(b) || (a.task.data < b.task.data ? -1 : 1));
  upcoming.sort((a, b) => (a.task.data < b.task.data ? -1 : 1));

  const all = [...habits, ...missions];
  return { habits, missions, upcoming, total: all.length, done: all.filter((i) => i.done).length };
}
