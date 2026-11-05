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
