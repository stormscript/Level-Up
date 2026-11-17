// Progresso de um dia (hábitos + tarefas) e "momentum" da semana. Funções puras (testadas em tests.html).
import { addDays } from './dates.js';
import { todayList } from './habits.js';
import { eventsOn, timeStates, toMin } from './agenda.js';

/** { done, total, pct } de um dia, ou null se não havia nada para fazer. */
export function dayProgress(habits, idx, todos, date) {
  const list = todayList(habits, idx, date);
  const ts = todos.filter((t) => t.data === date);
  const total = list.length + ts.length;
  if (!total) return null;
  const done = list.filter((i) => i.done).length + ts.filter((t) => t.feito).length;
  return { done, total, pct: done / total };
}

/** Últimos `n` dias (do mais antigo para hoje): [{ date, pct|null }]. */
export function momentum(habits, idx, todos, today, n = 7) {
  return Array.from({ length: n }, (_, i) => {
    const date = addDays(today, i - (n - 1));
    return { date, pct: dayProgress(habits, idx, todos, date)?.pct ?? null };
  });
}

/** Dias fortes seguidos (≥ 80%), a contar de ontem (hoje conta se já passou dos 80%). Dias vazios não quebram. */
export function strongStreak(habits, idx, todos, today, min = 0.8) {
  let count = 0;
  const t = dayProgress(habits, idx, todos, today);
  if (t && t.pct >= min) count++;
  for (let d = addDays(today, -1), g = 0; g < 400; g++, d = addDays(d, -1)) {
    const p = dayProgress(habits, idx, todos, d);
    if (!p) { if (g > 60) break; continue; }
    if (p.pct < min) break;
    count++;
  }
  return count;
}

/** O que vem a seguir na agenda: { ev, date, state: 'now'|'next', minutes } ou null (hoje; senão o 1.º de amanhã). */
export function upNext(events, today, nowMin) {
  const list = eventsOn(events, today).filter((e) => e.inicio);
  const states = timeStates(list, nowMin);
  const i = states.findIndex((s) => s === 'now');
  if (i >= 0) return { ev: list[i], date: today, state: 'now', minutes: 0 };
  const j = states.findIndex((s) => s === 'next');
  if (j >= 0) return { ev: list[j], date: today, state: 'next', minutes: toMin(list[j].inicio) - nowMin };
  const tm = eventsOn(events, addDays(today, 1));
  const first = tm.find((e) => e.inicio) || tm[0];
  return first ? { ev: first, date: addDays(today, 1), state: 'tomorrow', minutes: null } : null;
}
