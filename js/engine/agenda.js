// Agenda: eventos, repetições, horas. Funções puras (testadas em tests.html).
import { weekday, fromKey, pad } from './dates.js';

export const REPEAT = {
  nunca: 'Não se repete',
  diario: 'Todos os dias',
  semanal: 'Todas as semanas',
  mensal: 'Todos os meses',
};

/** O evento acontece neste dia? (respeita repetições, data final e exceções) */
export function occursOn(ev, date) {
  if (date < ev.data) return false;
  if (ev.ate && date > ev.ate) return false;
  if ((ev.excecoes || []).includes(date)) return false;
  switch (ev.repetir || 'nunca') {
    case 'nunca': return date === ev.data;
    case 'diario': return true;
    case 'semanal': return weekday(date) === weekday(ev.data);
    case 'mensal': return date.slice(8) === ev.data.slice(8);
    default: return false;
  }
}

export const toMin = (hhmm) => {
  if (!hhmm) return -1;
  const [h, m] = hhmm.split(':').map(Number);
  return h * 60 + m;
};

export const fromMin = (min) => `${pad(Math.floor(min / 60) % 24)}:${pad(min % 60)}`;

/** Eventos de um dia, por ordem: primeiro os de "dia todo", depois por hora de início. */
export function eventsOn(events, date) {
  return events
    .filter((e) => occursOn(e, date))
    .sort((a, b) => toMin(a.inicio) - toMin(b.inicio) || (a.titulo < b.titulo ? -1 : 1));
}

/** Duração em minutos (fim antes do início = passa da meia-noite). */
export function duration(ev) {
  if (!ev.inicio || !ev.fim) return 0;
  let d = toMin(ev.fim) - toMin(ev.inicio);
  if (d < 0) d += 24 * 60;
  return d;
}

export function formatDuration(min) {
  if (!min) return '';
  const h = Math.floor(min / 60);
  const m = min % 60;
  return h && m ? `${h}h ${m}min` : h ? `${h}h` : `${m}min`;
}

/** Estado do evento face à hora atual: 'past' | 'now' | 'next' (o próximo) | 'later'. */
export function timeStates(list, nowMin) {
  let nextGiven = false;
  return list.map((e) => {
    if (!e.inicio) return 'allday';
    const s = toMin(e.inicio);
    const end = s + (duration(e) || 0);
    if (nowMin >= s && nowMin < Math.max(end, s + 1)) return 'now';
    if (end <= nowMin) return 'past';
    if (!nextGiven) { nextGiven = true; return 'next'; }
    return 'later';
  });
}

/** Posição da linha "agora": índice do primeiro evento com hora que começa depois de agora. */
export function nowLineIndex(list, nowMin) {
  const i = list.findIndex((e) => e.inicio && toMin(e.inicio) > nowMin);
  return i === -1 ? list.length : i;
}

/** Conjunto das datas com eventos entre `from` e `to` (inclusive). */
export function datesWithEvents(events, dates) {
  return new Set(dates.filter((d) => events.some((e) => occursOn(e, d))));
}

/** Ficheiro .ics para adicionar o evento ao Calendário do iPhone. */
export function toICS(ev) {
  const stamp = (date, time) => {
    const d = fromKey(date);
    if (time) {
      const [h, m] = time.split(':').map(Number);
      d.setHours(h, m, 0, 0);
      return d.toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '');
    }
    return date.replace(/-/g, '');
  };
  const esc = (s) => String(s || '').replace(/\\/g, '\\\\').replace(/\n/g, '\\n').replace(/[,;]/g, (c) => `\\${c}`);
  const lines = ['BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//LevelUp//PT', 'BEGIN:VEVENT', `UID:${ev.id}@levelup`, `DTSTAMP:${new Date().toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '')}`];
  if (ev.inicio) {
    lines.push(`DTSTART:${stamp(ev.data, ev.inicio)}`);
    let endDate = ev.data;
    if (ev.fim && toMin(ev.fim) < toMin(ev.inicio)) {
      const d = fromKey(ev.data); d.setDate(d.getDate() + 1);
      endDate = `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
    }
    lines.push(`DTEND:${stamp(endDate, ev.fim || fromMin(toMin(ev.inicio) + 60))}`);
  } else {
    lines.push(`DTSTART;VALUE=DATE:${stamp(ev.data)}`);
  }
  const rule = { diario: 'DAILY', semanal: 'WEEKLY', mensal: 'MONTHLY' }[ev.repetir];
  if (rule) lines.push(`RRULE:FREQ=${rule}${ev.ate ? `;UNTIL=${ev.ate.replace(/-/g, '')}T235959Z` : ''}`);
  lines.push(`SUMMARY:${esc(ev.titulo)}`);
  if (ev.local) lines.push(`LOCATION:${esc(ev.local)}`);
  if (ev.notas) lines.push(`DESCRIPTION:${esc(ev.notas)}`);
  lines.push('END:VEVENT', 'END:VCALENDAR');
  return lines.join('\r\n');
}
