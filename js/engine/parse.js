// Escrita rápida: "amanhã 15h ligar ao banco !" → { titulo, data, hora, prioridade }.
import { addDays, weekday, fromKey, pad } from './dates.js';

const WEEKDAYS = {
  segunda: 1, 'segunda-feira': 1, seg: 1,
  terca: 2, 'terca-feira': 2, ter: 2,
  quarta: 3, 'quarta-feira': 3, qua: 3,
  quinta: 4, 'quinta-feira': 4, qui: 4,
  sexta: 5, 'sexta-feira': 5, sex: 5,
  sabado: 6, sab: 6,
  domingo: 7, dom: 7,
};

const strip = (s) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();

/**
 * @param text  o que escreveste
 * @param today data de hoje "AAAA-MM-DD"
 * @param base  data por omissão (ex.: o dia aberto na agenda); null = sem data
 */
export function parseQuick(text, today, base = today) {
  let s = ` ${String(text || '').normalize('NFC').trim()} `;
  let data = base;
  let hora = '';
  let prioridade = false;
  const found = [];

  const take = (re, fn) => {
    const m = strip(s).match(re);
    if (!m) return false;
    // Remove a parte encontrada do texto original (mesma posição, sem acentos não muda o tamanho).
    s = s.slice(0, m.index) + ' ' + s.slice(m.index + m[0].length);
    fn(m);
    found.push(m[0].trim());
    return true;
  };

  // Importante: "!" no início ou no fim
  take(/(^\s*!+\s)|(\s!+\s*$)/, () => { prioridade = true; });

  // Datas
  take(/\s(depois de amanha)\s/, () => { data = addDays(today, 2); }) ||
    take(/\s(amanha)\s/, () => { data = addDays(today, 1); }) ||
    take(/\s(hoje)\s/, () => { data = today; }) ||
    take(/\s(sem data|um dia)\s/, () => { data = null; }) ||
    take(/\s(?:na |no |a |ao )?(?:proxima |proximo )?(segunda-feira|terca-feira|quarta-feira|quinta-feira|sexta-feira|segunda|terca|quarta|quinta|sexta|sabado|domingo)\s/, (m) => {
      // O próximo dia com esse nome ("sexta" dita numa sexta = a da semana seguinte).
      const diff = (WEEKDAYS[m[1]] - weekday(today) + 7) % 7 || 7;
      data = addDays(today, diff);
    }) ||
    take(/\s(?:dia )?(\d{1,2})\/(\d{1,2})(?:\/(\d{2,4}))?\s/, (m) => {
      const y = m[3] ? (m[3].length === 2 ? 2000 + +m[3] : +m[3]) : fromKey(today).getFullYear();
      let key = `${y}-${pad(+m[2])}-${pad(+m[1])}`;
      if (!m[3] && key < today) key = `${y + 1}-${pad(+m[2])}-${pad(+m[1])}`;
      if (isValid(key)) data = key;
    }) ||
    take(/\s(?:no )?dia (\d{1,2})\s/, (m) => {
      const t = fromKey(today);
      let d = new Date(t.getFullYear(), t.getMonth(), +m[1]);
      if (+m[1] < t.getDate()) d = new Date(t.getFullYear(), t.getMonth() + 1, +m[1]);
      const key = `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
      if (d.getDate() === +m[1]) data = key;
    });

  // Horas: "15h", "15h30", "15:30", "às 9"
  take(/\s(?:as |a )?(\d{1,2})(?:h(\d{2})?|:(\d{2}))\s/, (m) => {
    const h = +m[1], mi = +(m[2] || m[3] || 0);
    if (h < 24 && mi < 60) hora = `${pad(h)}:${pad(mi)}`;
  }) || take(/\s(?:as) (\d{1,2})\s/, (m) => { if (+m[1] < 24) hora = `${pad(+m[1])}:00`; });

  if (hora && !data) data = today; // com hora, tem de ter dia
  const titulo = s.replace(/\s+/g, ' ').trim();
  const cap = titulo ? titulo.charAt(0).toUpperCase() + titulo.slice(1) : '';
  return { titulo: cap, data, hora, prioridade, found };
}

function isValid(key) {
  const d = fromKey(key);
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}` === key;
}
