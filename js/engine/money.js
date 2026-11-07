// Finanças: valores em cêntimos (inteiros) para não haver erros de arredondamento.
import { monthKey, fromKey, daysBetween } from './dates.js';

export const CATEGORIES = {
  despesa: [
    { id: 'comida', nome: 'Comida', icone: '🍔' },
    { id: 'super', nome: 'Supermercado', icone: '🛒' },
    { id: 'saidas', nome: 'Saídas', icone: '🍸' },
    { id: 'transporte', nome: 'Transporte', icone: '🚗' },
    { id: 'compras', nome: 'Compras', icone: '🛍️' },
    { id: 'subs', nome: 'Subscrições', icone: '📱' },
    { id: 'casa', nome: 'Casa', icone: '🏠' },
    { id: 'saude', nome: 'Saúde', icone: '💊' },
    { id: 'educacao', nome: 'Educação', icone: '📚' },
    { id: 'ginasio', nome: 'Desporto', icone: '🏋️' },
    { id: 'presentes', nome: 'Presentes', icone: '🎁' },
    { id: 'outros', nome: 'Outros', icone: '•' },
  ],
  receita: [
    { id: 'salario', nome: 'Salário', icone: '💼' },
    { id: 'mesada', nome: 'Mesada', icone: '🤝' },
    { id: 'extra', nome: 'Extra', icone: '⚡' },
    { id: 'venda', nome: 'Venda', icone: '🏷️' },
    { id: 'outros-r', nome: 'Outros', icone: '•' },
  ],
};

export const categoryById = (id) =>
  [...CATEGORIES.despesa, ...CATEGORIES.receita].find((c) => c.id === id) || { id, nome: 'Outros', icone: '•' };

/** "12,5" · "12.50" · "1.234,56" · "€ 3" → cêntimos (inteiro) ou null se inválido. */
export function parseAmount(input) {
  let s = String(input ?? '').replace(/[€\s]/g, '');
  if (!s) return null;
  if (s.includes(',') && s.includes('.')) s = s.replace(/\./g, '').replace(',', '.');
  else s = s.replace(',', '.');
  if (!/^-?\d*\.?\d{0,2}$/.test(s) || s === '.' || s === '-') return null;
  const n = Math.round(parseFloat(s) * 100);
  return Number.isFinite(n) ? n : null;
}

const fmt = new Intl.NumberFormat('pt-PT', { style: 'currency', currency: 'EUR' });
const fmt0 = new Intl.NumberFormat('pt-PT', { style: 'currency', currency: 'EUR', maximumFractionDigits: 0 });

/** Cêntimos → "12,50 €" (round: sem cêntimos). */
export function fmtEUR(cents, { sign = false, round = false } = {}) {
  const v = (cents || 0) / 100;
  const s = (round ? fmt0 : fmt).format(Math.abs(v)).replace(/ /g, ' ');
  if (v < 0) return `−${s}`;
  return sign && v > 0 ? `+${s}` : s;
}

export const inMonth = (txs, month) => txs.filter((t) => monthKey(t.data) === month);

export function summary(txs) {
  let despesas = 0, receitas = 0;
  const byCat = {};
  for (const t of txs) {
    if (t.tipo === 'receita') receitas += t.valor;
    else {
      despesas += t.valor;
      byCat[t.categoria] = (byCat[t.categoria] || 0) + t.valor;
    }
  }
  const cats = Object.entries(byCat).map(([id, total]) => ({ id, total })).sort((a, b) => b.total - a.total);
  return { despesas, receitas, saldo: receitas - despesas, cats };
}

export const monthSummary = (txs, month) => summary(inMonth(txs, month));

export const spentOn = (txs, date) => txs.reduce((s, t) => s + (t.data === date && t.tipo !== 'receita' ? t.valor : 0), 0);

export function lastDayOfMonth(month) {
  const [y, m] = month.split('-').map(Number);
  return new Date(y, m, 0).getDate();
}

/** Ritmo do orçamento: quanto falta e quanto podes gastar por dia até ao fim do mês. */
export function budgetPace(spent, budget, today) {
  const month = monthKey(today);
  const end = `${month}-${String(lastDayOfMonth(month)).padStart(2, '0')}`;
  const daysLeft = daysBetween(today, end) + 1; // inclui hoje
  const left = budget - spent;
  return {
    left,
    daysLeft,
    perDay: daysLeft > 0 ? Math.floor(Math.max(0, left) / daysLeft) : 0,
    pct: budget > 0 ? spent / budget : 0,
    over: left < 0,
  };
}

/** Saldo (receitas − despesas) entre duas datas, inclusive. */
export function balanceBetween(txs, from, to) {
  return txs.reduce((s, t) => (t.data >= from && t.data <= to ? s + (t.tipo === 'receita' ? t.valor : -t.valor) : s), 0);
}

export function groupByDay(txs) {
  const map = new Map();
  for (const t of [...txs].sort((a, b) => (a.data === b.data ? b.ts - a.ts : a.data < b.data ? 1 : -1))) {
    if (!map.has(t.data)) map.set(t.data, []);
    map.get(t.data).push(t);
  }
  return [...map.entries()];
}

export const dayOfMonth = (key) => fromKey(key).getDate();

// ---------- Gráficos e análises ----------

/** Gasto acumulado por dia do mês: [{ day: 1..N, v: cêntimos }] até `today` (ou até ao fim do mês, se já passou). */
export function cumulativeByDay(txs, month, today) {
  const last = lastDayOfMonth(month);
  const end = today.slice(0, 7) === month ? Number(today.slice(8)) : today.slice(0, 7) > month ? last : 0;
  const perDay = Array(last + 1).fill(0);
  for (const t of txs) if (t.tipo !== 'receita' && monthKey(t.data) === month) perDay[Number(t.data.slice(8))] += t.valor;
  const out = [];
  let acc = 0;
  for (let d = 1; d <= end; d++) { acc += perDay[d]; out.push({ day: d, v: acc }); }
  return out;
}

/** Previsão do gasto no fim do mês ao ritmo atual (cêntimos), ou null no início do mês. */
export function projectMonth(txs, month, today) {
  if (today.slice(0, 7) !== month) return null;
  const day = Number(today.slice(8));
  if (day < 5) return null;
  const spent = monthSummary(txs, month).despesas;
  return Math.round((spent / day) * lastDayOfMonth(month));
}

/** Despesas e receitas por mês: [{ month, despesas, receitas, saldo }]. */
export const monthsSeries = (txs, months) => months.map((month) => ({ month, ...monthSummary(txs, month) }));

export function prevMonth(month, n = 1) {
  const [y, m] = month.split('-').map(Number);
  const d = new Date(y, m - 1 - n, 1);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}

/** Variação face ao mês anterior até ao mesmo dia (para ser justo a meio do mês). */
export function vsPrevMonth(txs, month, today) {
  const prev = prevMonth(month);
  const cut = today.slice(0, 7) === month ? Number(today.slice(8)) : 31;
  const sumUntil = (mk) => txs.reduce((s, t) => (t.tipo !== 'receita' && monthKey(t.data) === mk && Number(t.data.slice(8)) <= cut ? s + t.valor : s), 0);
  const a = sumUntil(month), b = sumUntil(prev);
  if (!b) return null;
  return { prev, pct: (a - b) / b, a, b };
}

/** Categorias com limite: [{ id, total, limit, pct, over }] (inclui as com limite e sem gastos). */
export function categoryStatus(txs, month, limits = {}) {
  const s = monthSummary(txs, month);
  const map = new Map(s.cats.map((c) => [c.id, c.total]));
  for (const id of Object.keys(limits)) if (limits[id] > 0 && !map.has(id)) map.set(id, 0);
  return [...map.entries()]
    .map(([id, total]) => {
      const limit = limits[id] > 0 ? limits[id] : null;
      return { id, total, limit, pct: limit ? total / limit : null, over: limit ? total > limit : false };
    })
    .sort((a, b) => b.total - a.total || (b.limit || 0) - (a.limit || 0));
}

/** Gastos frequentes (para repetir com um toque): os pares nota+categoria mais usados nos últimos 60 dias. */
export function frequentTxs(txs, today, n = 4) {
  const recent = txs.filter((t) => t.tipo !== 'receita' && t.data <= today && t.data >= shiftDays(today, -60));
  const groups = new Map();
  for (const t of recent) {
    const key = `${t.categoria}|${(t.nota || '').trim().toLowerCase()}`;
    const g = groups.get(key) || { categoria: t.categoria, nota: (t.nota || '').trim(), count: 0, last: t, valores: [] };
    g.count++;
    g.valores.push(t.valor);
    if (t.data >= g.last.data) g.last = t;
    groups.set(key, g);
  }
  return [...groups.values()]
    .filter((g) => g.count >= 2)
    .sort((a, b) => b.count - a.count || (a.last.data < b.last.data ? 1 : -1))
    .slice(0, n)
    .map((g) => ({ categoria: g.categoria, nota: g.nota, valor: g.last.valor, count: g.count }));
}

function shiftDays(key, n) {
  const [y, m, d] = key.split('-').map(Number);
  const dt = new Date(y, m - 1, d + n);
  return `${dt.getFullYear()}-${String(dt.getMonth() + 1).padStart(2, '0')}-${String(dt.getDate()).padStart(2, '0')}`;
}

// ---------- Gastos fixos (recorrentes) ----------

/** Data do lançamento de um fixo num mês (o dia é ajustado a meses mais curtos). */
export function recurringDate(r, month) {
  const day = Math.min(Number(r.dia) || 1, lastDayOfMonth(month));
  return `${month}-${String(day).padStart(2, '0')}`;
}

/**
 * Lançamentos em falta de um fixo até hoje: [{ month, data }].
 * Começa no mês `inicio` (ou no seguinte ao último lançado) e só lança quando o dia já chegou.
 */
export function dueRecurring(r, today) {
  if (r.ativo === false) return [];
  const current = today.slice(0, 7);
  let month = r.ultimoMes ? prevMonth(r.ultimoMes, -1) : r.inicio || current;
  const out = [];
  for (let guard = 0; month <= current && guard < 24; guard++, month = prevMonth(month, -1)) {
    const data = recurringDate(r, month);
    if (data <= today) out.push({ month, data });
  }
  return out;
}

/** Próximo lançamento (data) de um fixo, a partir de hoje. */
export function nextRecurring(r, today) {
  if (r.ativo === false) return null;
  const current = today.slice(0, 7);
  const thisMonth = recurringDate(r, current);
  const launched = !!r.ultimoMes && r.ultimoMes >= current;
  if (thisMonth > today || (thisMonth === today && !launched)) return thisMonth;
  return recurringDate(r, prevMonth(current, -1));
}

/** Total mensal dos fixos ativos (despesas). */
export const recurringTotal = (list) => list.filter((r) => r.ativo !== false && r.tipo !== 'receita').reduce((s, r) => s + r.valor, 0);
