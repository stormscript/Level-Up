// Lógica dos hábitos: agenda, sequências, quantidades, versão mínima, "nunca falhar duas vezes",
// hábitos a evitar, pausas e estatísticas. Funções puras (testadas em tests.html).
import { weekday, weekStart, addDays, daysBetween } from './dates.js';

export const checkId = (habitId, date) => `${habitId}|${date}`;

/** Índice das marcações: Map "habitId|data" → marcação. */
export function makeIndex(checks) {
  const m = new Map();
  for (const c of checks) m.set(checkId(c.habitId, c.data), c);
  return m;
}

const getCheck = (idx, h, date) => {
  const id = checkId(h.id, date);
  if (idx.get) return idx.get(id);
  return idx.has(id) ? {} : undefined;
};

export const isAvoid = (h) => h.tipo === 'evitar';
export const isQty = (h) => !isAvoid(h) && !!h.quantidade && Number(h.quantidade.alvo) > 0;
const isWeekly = (h) => !isAvoid(h) && h.recorrencia?.tipo === 'xPorSemana';
export const MOMENTOS = { manha: 'Manhã', tarde: 'Tarde', noite: 'Noite', '': 'Qualquer hora' };

/** Quantidade registada num dia (hábitos com quantidade). */
export const qtyOn = (idx, h, date) => Number(getCheck(idx, h, date)?.valor) || 0;

/** Feito nesse dia? (com quantidade: chegou ao alvo; versão mínima também conta) */
function done(idx, h, date) {
  const c = getCheck(idx, h, date);
  if (!c) return false;
  if (isQty(h) && !c.min) return (Number(c.valor) || 0) >= Number(h.quantidade.alvo);
  return true;
}

/** Dia bem passado: feito (hábito normal) ou sem deslize (hábito a evitar). */
function ok(idx, h, date) {
  return isAvoid(h) ? !getCheck(idx, h, date) : done(idx, h, date);
}

export const isMinOn = (idx, h, date) => !!getCheck(idx, h, date)?.min;

export function isPaused(h, date) {
  return (h.pausas || []).some((p) => date >= p.de && (!p.ate || date <= p.ate));
}
export const pausedNow = (h, today) => isPaused(h, today);

/** O hábito está agendado para este dia? ("X por semana" e "evitar" contam como todos os dias.) */
export function isScheduled(h, date) {
  if (h.criadaEm && date < h.criadaEm) return false;
  if (isPaused(h, date)) return false;
  if (isAvoid(h)) return true;
  const r = h.recorrencia || { tipo: 'diario' };
  if (r.tipo === 'dias') return (r.dias || []).includes(weekday(date));
  return true;
}

/** Nº de vezes feito na semana (segunda a domingo) que contém `date`. */
export function weekCount(idx, h, date) {
  const start = weekStart(date);
  let n = 0;
  for (let i = 0; i < 7; i++) if (done(idx, h, addDays(start, i))) n++;
  return n;
}

/** Lista de hoje (hábitos a fazer). "X por semana" desaparece quando a meta da semana é cumprida (exceto se feito hoje). */
export function todayList(habits, idx, date) {
  const out = [];
  for (const h of habits) {
    if (h.arquivado || isAvoid(h) || !isScheduled(h, date)) continue;
    const d = done(idx, h, date);
    let week = null;
    if (isWeekly(h)) {
      week = { count: weekCount(idx, h, date), n: h.recorrencia.n };
      if (!d && week.count >= week.n) continue;
    }
    out.push({ habit: h, done: d, week, min: isMinOn(idx, h, date), qty: isQty(h) ? qtyOn(idx, h, date) : null });
  }
  return out.sort((a, b) => a.done - b.done);
}

/** Hábitos a evitar ativos. */
export const avoidList = (habits, date) => habits.filter((h) => !h.arquivado && isAvoid(h) && isScheduled(h, date));

/**
 * Sequência atual.
 * - Diário / dias específicos: dias agendados seguidos feitos. Hoje por fazer não quebra.
 *   Com `tolerancia` ("nunca falhar duas vezes"), uma falha isolada não quebra; duas seguidas sim.
 * - X por semana: semanas seguidas com a meta cumprida.
 * - Evitar: dias seguidos sem deslize (inclui hoje).
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
  let d = isAvoid(h) || done(idx, h, today) ? today : addDays(today, -1);
  let count = 0;
  let missRun = 0;
  for (let guard = 0; d >= start && guard < 4000; guard++, d = addDays(d, -1)) {
    if (!isScheduled(h, d)) continue;
    if (ok(idx, h, d)) { count++; missRun = 0; continue; }
    if (h.tolerancia && !isAvoid(h) && missRun === 0) { missRun = 1; continue; }
    break;
  }
  return { value: count, unit: count === 1 ? 'dia' : 'dias' };
}

/** Melhor sequência de sempre (mesma unidade que streak). */
export function bestStreak(h, idx, today) {
  const start = h.criadaEm || today;
  let best = 0, run = 0;
  if (isWeekly(h)) {
    for (let w = weekStart(start); w <= today; w = addDays(w, 7)) {
      const okW = weekCount(idx, h, w) >= h.recorrencia.n;
      if (okW) best = Math.max(best, ++run);
      else if (w !== weekStart(today)) run = 0;
    }
    return best;
  }
  let prevMiss = false;
  for (let d = start; d <= today; d = addDays(d, 1)) {
    if (!isScheduled(h, d)) continue;
    if (ok(idx, h, d)) { best = Math.max(best, ++run); prevMiss = false; continue; }
    if (d === today) continue;
    if (h.tolerancia && !isAvoid(h) && !prevMiss) { prevMiss = true; continue; }
    run = 0;
    prevMiss = true;
  }
  return best;
}

/** "Nunca falhar duas vezes": falhaste o último dia agendado e hoje ainda não está feito. */
export function atRisk(h, idx, today) {
  if (!h.tolerancia || isAvoid(h) || isWeekly(h) || !isScheduled(h, today) || done(idx, h, today)) return false;
  for (let d = addDays(today, -1), g = 0; g < 14; g++, d = addDays(d, -1)) {
    if (h.criadaEm && d < h.criadaEm) return false;
    if (!isScheduled(h, d)) continue;
    return !done(idx, h, d);
  }
  return false;
}

/**
 * Estado de um dia:
 * 'done' · 'min' (versão mínima) · 'partial' (quantidade a meio) · 'miss' · 'pending' (hoje por fazer)
 * 'off' (não agendado) · 'paused' · 'future' · 'before' (antes de existir) · 'clean' / 'slip' (hábitos a evitar).
 */
export function dayState(h, idx, date, today) {
  if (date > today) return 'future';
  if (h.criadaEm && date < h.criadaEm) return 'before';
  if (isPaused(h, date)) return 'paused';
  if (isAvoid(h)) return getCheck(idx, h, date) ? 'slip' : 'clean';
  if (done(idx, h, date)) return isMinOn(idx, h, date) ? 'min' : 'done';
  if (isQty(h) && qtyOn(idx, h, date) > 0) return 'partial';
  if (isWeekly(h)) return date === today ? 'pending' : 'off';
  if (!isScheduled(h, date)) return 'off';
  return date === today ? 'pending' : 'miss';
}

/** Últimos 7 dias (compatibilidade). */
export function last7(h, idx, today) {
  return Array.from({ length: 7 }, (_, i) => {
    const date = addDays(today, i - 6);
    return { date, state: dayState(h, idx, date, today) };
  });
}

/** Taxa de cumprimento (0–1) nos últimos `days` dias, ou null se ainda não há dados. */
export function rate(h, idx, today, days = 30) {
  return rateBetween(h, idx, addDays(today, -(days - 1)), today, today);
}

/** Taxa entre duas datas (inclusive). Hoje por fazer não conta. */
export function rateBetween(h, idx, from, to, today) {
  if (isWeekly(h)) {
    let got = 0, need = 0;
    for (let w = weekStart(from); w <= to; w = addDays(w, 7)) {
      if (h.criadaEm && addDays(w, 6) < h.criadaEm) continue;
      const current = w === weekStart(today);
      const c = Math.min(weekCount(idx, h, w), h.recorrencia.n);
      if (current && c < h.recorrencia.n) { got += c; need += c; continue; }
      got += c;
      need += h.recorrencia.n;
    }
    return need ? got / need : null;
  }
  let got = 0, need = 0;
  for (let d = from; d <= to && d <= today; d = addDays(d, 1)) {
    if (!isScheduled(h, d)) continue;
    const good = ok(idx, h, d);
    if (d === today && !good && !isAvoid(h)) continue;
    need++;
    if (good) got++;
  }
  return need ? got / need : null;
}

/** Taxa por dia da semana (1 = segunda … 7 = domingo) nas últimas `weeks` semanas. */
export function weekdayRates(h, idx, today, weeks = 12) {
  const got = Array(8).fill(0), need = Array(8).fill(0);
  if (!isWeekly(h)) {
    for (let d = addDays(today, -(weeks * 7 - 1)); d <= today; d = addDays(d, 1)) {
      if (!isScheduled(h, d)) continue;
      const good = ok(idx, h, d);
      if (d === today && !good && !isAvoid(h)) continue;
      need[weekday(d)]++;
      if (good) got[weekday(d)]++;
    }
  } else {
    // "X por semana": em que dias costumas fazer (percentagem de semanas em que fizeste nesse dia).
    for (let d = addDays(today, -(weeks * 7 - 1)); d <= today; d = addDays(d, 1)) {
      if (h.criadaEm && d < h.criadaEm) continue;
      need[weekday(d)]++;
      if (done(idx, h, d)) got[weekday(d)]++;
    }
  }
  return [1, 2, 3, 4, 5, 6, 7].map((w) => ({ weekday: w, pct: need[w] ? got[w] / need[w] : null, n: need[w] }));
}

/** O dia da semana mais difícil (com pelo menos 2 ocorrências), ou null. */
export function weakestDay(rates) {
  const valid = rates.filter((r) => r.pct != null && r.n >= 2);
  if (valid.length < 3) return null;
  const min = valid.reduce((a, b) => (b.pct < a.pct ? b : a));
  const avg = valid.reduce((s, r) => s + r.pct, 0) / valid.length;
  return min.pct < avg - 0.1 ? min : null;
}

/** Taxa por mês nos últimos `months` meses: [{ month: 'AAAA-MM', pct }]. */
export function monthRates(h, idx, today, months = 6) {
  const out = [];
  const [y, m] = today.slice(0, 7).split('-').map(Number);
  for (let i = months - 1; i >= 0; i--) {
    const dt = new Date(y, m - 1 - i, 1);
    const month = `${dt.getFullYear()}-${String(dt.getMonth() + 1).padStart(2, '0')}`;
    const last = new Date(dt.getFullYear(), dt.getMonth() + 1, 0).getDate();
    out.push({ month, pct: rateBetween(h, idx, `${month}-01`, `${month}-${String(last).padStart(2, '0')}`, today) });
  }
  return out;
}

/** Consistência geral de um dia: parte dos hábitos agendados (a fazer, não semanais) que foram feitos. */
export function dayScore(habits, idx, date) {
  let need = 0, got = 0;
  for (const h of habits) {
    if (h.arquivado || isAvoid(h) || isWeekly(h) || !isScheduled(h, date)) continue;
    need++;
    if (done(idx, h, date)) got++;
  }
  return need ? got / need : null;
}

/** Total de vezes feito (ou de deslizes, num hábito a evitar). */
export const totalDone = (h, checks) =>
  checks.filter((c) => c.habitId === h.id && (!isQty(h) || c.min || (Number(c.valor) || 0) >= Number(h.quantidade.alvo))).length;

/** Resumo do dia: quantos hábitos (a fazer) agendados hoje e quantos feitos. */
export function todaySummary(habits, idx, today) {
  const list = todayList(habits, idx, today);
  return { total: list.length, done: list.filter((i) => i.done).length };
}

/** O hábito com a maior sequência ativa (para destacar). */
export function bestActive(habits, idx, today) {
  let best = null;
  for (const h of habits) {
    if (h.arquivado || isPaused(h, today)) continue;
    const s = streak(h, idx, today);
    if (s.value > 0 && s.unit !== 'semanas' && s.unit !== 'semana' && (!best || s.value > best.streak.value)) best = { habit: h, streak: s };
  }
  return best;
}

/** Dias desde o último deslize (hábito a evitar) e data desse deslize. */
export function lastSlip(h, checks) {
  const mine = checks.filter((c) => c.habitId === h.id).map((c) => c.data).sort();
  return mine.length ? mine[mine.length - 1] : null;
}

export function frequencyLabel(h) {
  if (isAvoid(h)) return 'A evitar';
  const r = h.recorrencia || {};
  const WD = ['', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb', 'Dom'];
  let base = 'Todos os dias';
  if (r.tipo === 'dias') base = r.dias.length === 7 ? 'Todos os dias' : r.dias.map((d) => WD[d]).join(' · ');
  if (r.tipo === 'xPorSemana') base = `${r.n}× por semana`;
  return isQty(h) ? `${base} · ${h.quantidade.alvo} ${h.quantidade.unidade || ''}`.trim() : base;
}

/** Sugestões prontas para criar hábitos com um toque. */
export const HABIT_TEMPLATES = [
  { nome: 'Beber 2 L de água', momento: '', quantidade: { alvo: 8, unidade: 'copos', passo: 1 }, minimo: '4 copos' },
  { nome: 'Ler', momento: 'noite', quantidade: { alvo: 20, unidade: 'páginas', passo: 5 }, minimo: '1 página' },
  { nome: '10 000 passos', momento: '', quantidade: { alvo: 10000, unidade: 'passos', passo: 1000 }, minimo: '5 000 passos' },
  { nome: 'Treinar', momento: 'tarde', recorrencia: { tipo: 'xPorSemana', n: 4 }, minimo: '10 flexões' },
  { nome: 'Meditar 10 min', momento: 'manha', minimo: '1 minuto a respirar' },
  { nome: 'Fazer a cama', momento: 'manha' },
  { nome: 'Dormir antes da meia-noite', momento: 'noite' },
  { nome: 'Sem redes sociais depois das 23h', tipo: 'evitar' },
  { nome: 'Sem fast food', tipo: 'evitar' },
  { nome: 'Sem tabaco', tipo: 'evitar' },
];

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

export { daysBetween };
