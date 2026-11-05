// Regras de XP, níveis e moedas. Funções puras (testadas em tests.html).

export const DIFFICULTY = {
  facil: { label: 'Fácil', xp: 10 },
  media: { label: 'Média', xp: 25 },
  dificil: { label: 'Difícil', xp: 50 },
  epica: { label: 'Épica', xp: 100 },
};

export const DIFFICULTY_ORDER = ['facil', 'media', 'dificil', 'epica'];

/** XP necessário para passar do nível n para o n+1 = 100 × n^1.5 */
export function xpForNext(n) {
  return Math.round(100 * Math.pow(n, 1.5));
}

/** Converte XP total em nível + progresso dentro do nível */
export function levelFromXp(total) {
  let level = 1;
  let rest = Math.max(0, Math.floor(total || 0));
  while (rest >= xpForNext(level)) {
    rest -= xpForNext(level);
    level++;
  }
  const need = xpForNext(level);
  return { level, xpInLevel: rest, xpForNext: need, progress: rest / need };
}

/** XP de uma missão. `values` permite valores personalizados por dificuldade. */
export function xpForTask(task, { priority = false, values } = {}) {
  const base = values?.[task.dificuldade] ?? DIFFICULTY[task.dificuldade]?.xp ?? 0;
  return priority ? base * 2 : base;
}

/** 1 moeda por cada 5 XP */
export function coinsForXp(xp) {
  return Math.floor(xp / 5);
}

export function totalXp(log) {
  return log.reduce((sum, e) => sum + (e.xp || 0), 0);
}

export function xpByArea(log) {
  const map = {};
  for (const e of log) {
    if (e.areaId && e.xp) map[e.areaId] = (map[e.areaId] || 0) + e.xp;
  }
  return map;
}

export function xpOnDate(log, date) {
  return log.reduce((sum, e) => sum + (e.data === date ? e.xp || 0 : 0), 0);
}
