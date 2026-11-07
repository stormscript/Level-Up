// Avisos ao abrir a app: o que merece atenção agora. Função pura (testada em tests.html).
import { addDays, weekday, daysBetween } from './dates.js';

/**
 * @param ctx {
 *   today, hour,
 *   journalToday: bool, plannedTomorrow: bool,
 *   weekGoal: { titulo, falta, unidade } | null,
 *   budgetPct: number (0–1+) | null,
 *   lastBackup: ISO | null, hasData: bool,
 *   overdueCount: number,
 *   dismissed: { [id]: 'AAAA-MM-DD' }
 * }
 * @returns lista de { id, text, action } por ordem de importância (no máximo `max`).
 */
export function nudges(ctx, max = 2) {
  const { today, hour } = ctx;
  const out = [];
  const push = (id, text, action) => {
    if (ctx.dismissed?.[id] !== today) out.push({ id, text, action });
  };

  if (ctx.overdueCount > 0) {
    push('atrasadas', ctx.overdueCount === 1 ? '1 tarefa ficou para trás.' : `${ctx.overdueCount} tarefas ficaram para trás.`, 'overdue');
  }
  if (hour >= 20 && !ctx.plannedTomorrow) push('planear', 'Planeia amanhã. Leva 1 minuto.', 'plan');
  if (hour >= 20 && !ctx.journalToday) push('diario', 'Ainda não escreveste hoje.', 'journal');
  if (ctx.weekGoal && weekday(today) >= 5 && ctx.weekGoal.falta > 0) {
    const f = ctx.weekGoal.falta;
    push('meta', `Faltam ${f}${ctx.weekGoal.unidade ? ` ${ctx.weekGoal.unidade}` : ''} para "${ctx.weekGoal.titulo}".`, 'goal');
  }
  if (ctx.budgetPct != null && ctx.budgetPct >= 0.8) {
    push('orcamento', ctx.budgetPct >= 1 ? 'Passaste o orçamento do mês.' : `Já gastaste ${Math.round(ctx.budgetPct * 100)}% do orçamento.`, 'finance');
  }
  if (ctx.hasData) {
    const days = ctx.lastBackup ? daysBetween(ctx.lastBackup.slice(0, 10), today) : null;
    if (days == null || days >= 7) push('backup', days == null ? 'Ainda não fizeste nenhum backup.' : `Sem backup há ${days} dias.`, 'backup');
  }
  return out.slice(0, max);
}

export const tomorrow = (today) => addDays(today, 1);
