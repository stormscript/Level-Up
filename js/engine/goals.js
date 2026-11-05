// Metas mensais e semanais. Funções puras (testadas em tests.html).
import { addDays, weekStart, monthKey, weekKey } from './dates.js';
import { balanceBetween, lastDayOfMonth } from './money.js';

/** Intervalo de datas da meta: mês "2026-11" ou semana que começa na segunda "2026-11-02". */
export function periodRange(goal) {
  if (goal.tipo === 'mes') {
    return [`${goal.periodo}-01`, `${goal.periodo}-${String(lastDayOfMonth(goal.periodo)).padStart(2, '0')}`];
  }
  return [goal.periodo, addDays(goal.periodo, 6)];
}

export const currentPeriod = (tipo, today) => (tipo === 'mes' ? monthKey(today) : weekStart(today));

export function shiftPeriod(tipo, periodo, n) {
  if (tipo === 'semana') return addDays(periodo, 7 * n);
  const [y, m] = periodo.split('-').map(Number);
  const d = new Date(y, m - 1 + n, 1);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}

export const goalsFor = (goals, tipo, periodo) =>
  goals.filter((g) => g.tipo === tipo && g.periodo === periodo).sort((a, b) => (a.ordem ?? 0) - (b.ordem ?? 0));

export const childrenOf = (goals, parent) => goals.filter((g) => g.paiId === parent.id).sort((a, b) => (a.periodo < b.periodo ? -1 : 1));

const sumRegistos = (g) => (g.registos || []).reduce((s, r) => s + (Number(r.valor) || 0), 0);

/**
 * Progresso de uma meta.
 * - "feito": 0 ou 1.
 * - manual: soma dos registos (+ registos das metas semanais da mesma unidade, se for mensal).
 * - habito: nº de vezes que o hábito foi marcado no período.
 * - poupanca: receitas − despesas no período (em euros).
 */
export function progress(goal, { goals = [], checks = [], txs = [] } = {}) {
  const target = goal.medida === 'feito' ? 1 : Number(goal.alvo) || 0;
  let value = 0;
  if (goal.medida === 'feito') {
    value = goal.feito ? 1 : 0;
  } else if (goal.modo === 'habito') {
    const [from, to] = periodRange(goal);
    value = checks.filter((c) => c.habitId === goal.habitId && c.data >= from && c.data <= to).length;
  } else if (goal.modo === 'poupanca') {
    const [from, to] = periodRange(goal);
    value = balanceBetween(txs, from, to) / 100;
  } else {
    value = sumRegistos(goal);
    if (goal.tipo === 'mes') {
      for (const c of childrenOf(goals, goal)) {
        if (c.medida !== 'feito' && (c.modo || 'manual') === 'manual' && (c.unidade || '') === (goal.unidade || '')) value += sumRegistos(c);
      }
    }
  }
  value = Math.round(value * 100) / 100;
  const pct = target > 0 ? Math.max(0, Math.min(1, value / target)) : 0;
  return { value, target, pct, done: target > 0 && value >= target };
}

/** Rótulo curto da semana: "Semana 45". */
export const weekLabel = (periodo) => `Semana ${Number(weekKey(periodo).split('W')[1])}`;

export function fmtValue(v, unidade = '') {
  const n = new Intl.NumberFormat('pt-PT', { maximumFractionDigits: 2 }).format(v);
  if (!unidade) return n;
  return unidade === '€' ? `${n} €` : `${n} ${unidade}`;
}

/** A meta da semana a destacar no Hoje: a primeira por cumprir (ou a primeira, se todas cumpridas). */
export function featuredWeekly(goals, today, ctx) {
  const list = goalsFor(goals, 'semana', weekStart(today));
  if (!list.length) return null;
  return list.find((g) => !progress(g, ctx).done) || list[0];
}
