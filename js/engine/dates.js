// Datas como texto "AAAA-MM-DD" (hora local). Simples de comparar e de guardar.

export const pad = (n) => String(n).padStart(2, '0');

export function toKey(d = new Date()) {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

export const todayKey = () => toKey(new Date());

export function fromKey(key) {
  const [y, m, d] = key.split('-').map(Number);
  return new Date(y, m - 1, d);
}

export function addDays(key, n) {
  const d = fromKey(key);
  d.setDate(d.getDate() + n);
  return toKey(d);
}

/** 1 = segunda … 7 = domingo */
export function weekday(key) {
  const w = fromKey(key).getDay();
  return w === 0 ? 7 : w;
}

/** Segunda-feira da semana da data */
export function weekStart(key) {
  return addDays(key, 1 - weekday(key));
}

/** Semana ISO, ex.: "2026-W45" */
export function weekKey(key) {
  const thursday = fromKey(addDays(key, 4 - weekday(key)));
  const year = thursday.getFullYear();
  const days = Math.round((thursday - new Date(year, 0, 1)) / 86400000);
  return `${year}-W${pad(Math.floor(days / 7) + 1)}`;
}

export const monthKey = (key) => key.slice(0, 7);

export function daysBetween(a, b) {
  return Math.round((fromKey(b) - fromKey(a)) / 86400000);
}

const fmtLong = new Intl.DateTimeFormat('pt-PT', { weekday: 'long', day: 'numeric', month: 'long' });
const fmtShort = new Intl.DateTimeFormat('pt-PT', { weekday: 'short', day: 'numeric', month: 'short' });

const cap = (s) => s.charAt(0).toUpperCase() + s.slice(1);

export const formatLong = (key) => cap(fmtLong.format(fromKey(key)));

export function formatRelative(key, today = todayKey()) {
  const diff = daysBetween(today, key);
  if (diff === 0) return 'Hoje';
  if (diff === 1) return 'Amanhã';
  if (diff === -1) return 'Ontem';
  return cap(fmtShort.format(fromKey(key)).replace(/\./g, ''));
}

const fmtMonth = new Intl.DateTimeFormat('pt-PT', { month: 'long', year: 'numeric' });
const fmtCaps = new Intl.DateTimeFormat('pt-PT', { weekday: 'long', day: 'numeric', month: 'long' });

/** "novembro de 2026" → "Novembro 2026" */
export const monthLabel = (key) => cap(fmtMonth.format(fromKey(key)).replace(' de ', ' '));

/** "quinta · 5 de novembro" (para etiquetas em maiúsculas) */
export function capsDate(key) {
  const [wd, ...rest] = fmtCaps.format(fromKey(key)).split(', ');
  return `${wd.replace('-feira', '')} · ${rest.join(', ')}`;
}

export const WEEKDAY_SHORT = ['', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb', 'Dom'];
export const WEEKDAY_LETTER = ['', 'S', 'T', 'Q', 'Q', 'S', 'S', 'D'];

export function greeting(date = new Date()) {
  const h = date.getHours();
  if (h >= 6 && h < 13) return 'Bom dia';
  if (h >= 13 && h < 20) return 'Boa tarde';
  return 'Boa noite';
}
