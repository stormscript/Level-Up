// Lógica dos hábitos: agenda, sequências (streaks) e taxas. Funções puras (testadas em tests.html).
import { weekday, weekStart, addDays } from './dates.js';

export const checkId = (habitId, date) => `${habitId}|${date}`;

/** Índice rápido das marcações: Set de "habitId|data". */
export function makeIndex(checks) {
  const s = new Set();
  for (const c of checks) s.add(checkId(c.habitId, c.data));
  return s;
}

const done = (idx, h, date) => idx.has(checkId(h.id, date));
const isWeekly = (h) => h.recorrencia?.tipo === 'xPorSemana';

/** O hábito está agendado para este dia? ("X por semana" conta como todos os dias.) */
export function isScheduled(h, date) {
  if (h.criadaEm && date < h.criadaEm) return false;
  const r = h.recorrencia || { tipo: 'diario' };
  if (r.tipo === 'dias') return (r.dias || []).includes(weekday(date));
  return true;
}

/** Nº de marcações na semana (segunda a domingo) que contém `date`. */
export function weekCount(idx, h, date) {
  const start = weekStart(date);
  let n = 0;
  for (let i = 0; i < 7; i++) if (done(idx, h, addDays(start, i))) n++;
  return n;
}

/** Lista de hoje: hábitos agendados. "X por semana" desaparece quando a meta da semana é cumprida (exceto se marcado hoje). */
export function todayList(habits, idx, date) {
  const out = [];
  for (const h of habits) {
    if (h.arquivado || !isScheduled(h, date)) continue;
    const d = done(idx, h, date);
    let week = null;
    if (isWeekly(h)) {
      week = { count: weekCount(idx, h, date), n: h.recorrencia.n };
      if (!d && week.count >= week.n) continue;
    }
    out.push({ habit: h, done: d, week });
  }
  return out.sort((a, b) => a.done - b.done);
}

/**
 * Sequência atual.
 * - Diário / dias específicos: dias agendados seguidos cumpridos. Hoje por fazer não quebra a sequência.
 * - X por semana: semanas seguidas com a meta cumprida. A semana atual ainda por cumprir não quebra.
 */
export function streak(h, idx, today) {
  const start = h.criadaEm || '0000-01-01';
  if (isWeekly(h)) {
    let w = weekStart(today);
    let count = 0;
    if (weekCount(idx, h, w) >= h.recorrencia.n) count++;
    w = addDays(w, -7);
    while (addDays(w, 6) >= start && weekCount(idx, h, w) >= h.recorrencia.n && count < 600) {
      count++;
      w = addDays(w, -7);
    }
    return { value: count, unit: count === 1 ? 'semana' : 'semanas' };
  }
  let d = done(idx, h, today) ? today : addDays(today, -1);
  let count = 0;
  for (let guard = 0; d >= start && guard < 4000; guard++, d = addDays(d, -1)) {
    if (!isScheduled(h, d)) continue;
    if (!done(idx, h, d)) break;
    count++;
  }
  return { value: count, unit: count === 1 ? 'dia' : 'dias' };
}

/** Melhor sequência de sempre (mesma unidade que streak). */
export function bestStreak(h, idx, today) {
  const start = h.criadaEm || today;
  let best = 0, run = 0;
  if (isWeekly(h)) {
    for (let w = weekStart(start); w <= today; w = addDays(w, 7)) {
      const ok = weekCount(idx, h, w) >= h.recorrencia.n;
      if (ok) best = Math.max(best, ++run);
      else if (w !== weekStart(today)) run = 0;
    }
    return best;
  }
  for (let d = start; d <= today; d = addDays(d, 1)) {
    if (!isScheduled(h, d)) continue;
    if (done(idx, h, d)) best = Math.max(best, ++run);
    else if (d !== today) run = 0;
  }
  return best;
}

/** Últimos 7 dias: 'done' | 'miss' (agendado e falhado) | 'pending' (hoje por fazer) | 'off' (não agendado). */
export function last7(h, idx, today) {
  const out = [];
  for (let i = 6; i >= 0; i--) {
    const date = addDays(today, -i);
    let s;
    if (done(idx, h, date)) s = 'done';
    else if (!isScheduled(h, date) || isWeekly(h)) s = 'off';
    else s = date === today ? 'pending' : 'miss';
    out.push({ date, state: s });
  }
  return out;
}

/** Taxa de cumprimento (0–1) nos últimos `days` dias, ou null se ainda não há dados. */
export function rate(h, idx, today, days = 30) {
  const from = addDays(today, -(days - 1));
  if (isWeekly(h)) {
    let got = 0, need = 0;
    for (let w = weekStart(from); w <= today; w = addDays(w, 7)) {
      if (h.criadaEm && addDays(w, 6) < h.criadaEm) continue;
      const current = w === weekStart(today);
      const c = Math.min(weekCount(idx, h, w), h.recorrencia.n);
      if (current && c < h.recorrencia.n) { got += c; need += c; continue; } // semana em curso só conta o que já fez
      got += c;
      need += h.recorrencia.n;
    }
    return need ? got / need : null;
  }
  let got = 0, need = 0;
  for (let d = from; d <= today; d = addDays(d, 1)) {
    if (!isScheduled(h, d)) continue;
    const ok = done(idx, h, d);
    if (d === today && !ok) continue; // hoje ainda não acabou
    need++;
    if (ok) got++;
  }
  return need ? got / need : null;
}

export function frequencyLabel(h) {
  const r = h.recorrencia || {};
  const WD = ['', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb', 'Dom'];
  if (r.tipo === 'dias') return r.dias.length === 7 ? 'Todos os dias' : r.dias.map((d) => WD[d]).join(' · ');
  if (r.tipo === 'xPorSemana') return `${r.n}× por semana`;
  return 'Todos os dias';
}

/** Converte dados da versão 1 (missões/log com XP) em hábitos + marcações. Ignora dados de exemplo. */
export function migrateV1(tasks = [], log = []) {
  const habits = tasks
    .filter((t) => t.tipo === 'habito' && !t.seed)
    .map((t) => ({ id: t.id, nome: t.titulo, recorrencia: t.recorrencia || { tipo: 'diario' }, criadaEm: t.criadaEm, ordem: t.ordem ?? 0 }));
  const ids = new Set(habits.map((h) => h.id));
  const seen = new Set();
  const checks = [];
  for (const e of log) {
    if (e.tipo !== 'concluir' || !ids.has(e.taskId)) continue;
    const id = checkId(e.taskId, e.data);
    if (seen.has(id)) continue;
    seen.add(id);
    checks.push({ id, habitId: e.taskId, data: e.data, ts: e.ts });
  }
  return { habits, checks };
}

/**
 * Estado de um dia para um hábito (para a semana e o calendário):
 * 'done' feito · 'miss' falhado · 'pending' hoje por fazer · 'off' não agendado
 * 'future' ainda não chegou · 'before' antes de o hábito existir.
 */
export function dayState(h, idx, date, today) {
  if (date > today) return 'future';
  if (done(idx, h, date)) return 'done';
  if (h.criadaEm && date < h.criadaEm) return 'before';
  if (isWeekly(h)) return date === today ? 'pending' : 'off';
  if (!isScheduled(h, date)) return 'off';
  return date === today ? 'pending' : 'miss';
}

/** Total de vezes que o hábito foi feito. */
export const totalDone = (h, checks) => checks.filter((c) => c.habitId === h.id).length;

/** Resumo do dia: quantos hábitos agendados hoje e quantos feitos. */
export function todaySummary(habits, idx, today) {
  const list = todayList(habits, idx, today);
  return { total: list.length, done: list.filter((i) => i.done).length };
}

/** O hábito com a maior sequência ativa (para destacar). */
export function bestActive(habits, idx, today) {
  let best = null;
  for (const h of habits) {
    if (h.arquivado) continue;
    const s = streak(h, idx, today);
    if (s.value > 0 && (!best || s.value > best.streak.value)) best = { habit: h, streak: s };
  }
  return best;
}
