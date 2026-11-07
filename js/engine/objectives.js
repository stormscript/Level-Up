// Objetivos (longo prazo): progresso, série para o gráfico, ritmo, previsão e marcos.
// Funções puras (testadas em tests.html).
import { addDays, daysBetween } from './dates.js';

export const OBJ_TYPES = {
  acumular: 'Acumular',
  poupanca: 'Poupança',
  medicao: 'Medição',
  feito: 'Sim / Não',
};

const round2 = (n) => Math.round(n * 100) / 100;

/** Registos que contam para o objetivo: os dele + os das metas ligadas (mesma unidade, "à mão"). */
function allEntries(o, goals = []) {
  const own = (o.registos || []).map((r) => ({ data: r.data, valor: Number(r.valor) || 0 }));
  if (o.tipo !== 'acumular') return own;
  const linked = goals
    .filter((g) => g.objetivoId === o.id && g.medida !== 'feito' && (g.modo || 'manual') === 'manual' && (g.unidade || '') === (o.unidade || ''))
    .flatMap((g) => (g.registos || []).map((r) => ({ data: r.data, valor: Number(r.valor) || 0 })));
  return [...own, ...linked].sort((a, b) => (a.data < b.data ? -1 : 1));
}

/** Valor de partida (para o gráfico e o ritmo). */
export const startValue = (o) => (o.tipo === 'medicao' || o.tipo === 'poupanca' ? Number(o.inicial) || 0 : 0);

/** +1 se o objetivo é subir (juntar, acumular), −1 se é descer (peso, tempo). */
export const direction = (o) => (o.tipo === 'medicao' && Number(o.alvo) < startValue(o) ? -1 : 1);

/**
 * Série diária do valor desde o início até `today` (ou até ao prazo, se já passou).
 * Devolve [{ d: 'AAAA-MM-DD', v: número }].
 */
export function series(o, { goals = [], txs = [] } = {}, today) {
  const start = o.inicio;
  const end = today < o.prazo ? today : o.prazo;
  if (!start || end < start) return [];
  const out = [];
  if (o.tipo === 'medicao') {
    // Só os dias com medição (mais o valor inicial).
    out.push({ d: start, v: startValue(o) });
    for (const r of [...(o.registos || [])].sort((a, b) => (a.data < b.data ? -1 : 1))) {
      if (r.data >= start && r.data <= end) out.push({ d: r.data, v: Number(r.valor) });
    }
    return out;
  }
  const deltas = new Map();
  if (o.tipo === 'poupanca') {
    for (const t of txs) {
      if (t.data < start || t.data > end) continue;
      deltas.set(t.data, (deltas.get(t.data) || 0) + (t.tipo === 'receita' ? t.valor : -t.valor) / 100);
    }
  } else if (o.tipo === 'acumular') {
    for (const r of allEntries(o, goals)) {
      if (r.data < start || r.data > end) continue;
      deltas.set(r.data, (deltas.get(r.data) || 0) + r.valor);
    }
  }
  let v = startValue(o);
  // Entradas anteriores ao início também contam no ponto de partida (acumular).
  if (o.tipo === 'acumular') for (const r of allEntries(o, goals)) if (r.data < start) v += r.valor;
  for (let d = start; d <= end; d = addDays(d, 1)) {
    v += deltas.get(d) || 0;
    out.push({ d, v: round2(v) });
  }
  return out;
}

/** Progresso atual: { value, start, target, pct, done }. */
export function objProgress(o, ctx = {}, today) {
  if (o.tipo === 'feito') {
    const steps = o.marcos || [];
    const doneSteps = steps.filter((m) => m.feito).length;
    const done = !!o.feito;
    return { value: done ? 1 : 0, start: 0, target: 1, pct: done ? 1 : steps.length ? doneSteps / steps.length : 0, done };
  }
  const s = series(o, ctx, today);
  const start = startValue(o);
  const value = s.length ? s[s.length - 1].v : start;
  const target = Number(o.alvo) || 0;
  const span = target - start;
  const pct = span === 0 ? 1 : Math.max(0, Math.min(1, (value - start) / span));
  const done = direction(o) > 0 ? value >= target : value <= target;
  return { value: round2(value), start, target, pct, done };
}

/**
 * Ritmo: onde devias estar hoje (linha reta do início ao prazo), diferença, previsão
 * e quanto precisas por dia/semana/mês para chegar a tempo.
 */
export function pace(o, ctx = {}, today) {
  const p = objProgress(o, ctx, today);
  const total = Math.max(1, daysBetween(o.inicio, o.prazo));
  const elapsed = Math.max(0, Math.min(total, daysBetween(o.inicio, today)));
  const daysLeft = Math.max(0, daysBetween(today, o.prazo));
  const expected = round2(p.start + (p.target - p.start) * (elapsed / total));
  const dir = direction(o);
  const diff = round2((p.value - expected) * dir); // > 0 = à frente
  const remaining = Math.max(0, (p.target - p.value) * dir);
  const perDay = daysLeft > 0 ? remaining / daysLeft : remaining;
  let forecast = null;
  if (!p.done && elapsed >= 7) {
    const rate = ((p.value - p.start) * dir) / elapsed; // por dia, no sentido certo
    if (rate > 0) forecast = addDays(today, Math.ceil(remaining / rate));
  }
  return {
    ...p,
    expected,
    diff,
    ahead: diff >= 0,
    daysLeft,
    elapsed,
    total,
    remaining: round2(remaining),
    perDay: round2(perDay),
    perWeek: round2(perDay * 7),
    perMonth: round2(perDay * 30.44),
    forecast,
    late: !p.done && today > o.prazo,
  };
}

/** Marcos: para objetivos numéricos, atingidos quando a série passa o valor (com a data). */
export function milestones(o, ctx = {}, today) {
  const ms = [...(o.marcos || [])];
  if (o.tipo === 'feito') return ms.map((m) => ({ ...m, reached: !!m.feito, date: m.feitoEm || null }));
  const dir = direction(o);
  const s = series(o, ctx, today);
  return ms
    .sort((a, b) => (a.valor - b.valor) * dir)
    .map((m) => {
      const hit = s.find((pt) => (dir > 0 ? pt.v >= m.valor : pt.v <= m.valor));
      return { ...m, reached: !!hit, date: hit ? hit.d : null };
    });
}

/** Sugere 3 marcos (25%, 50%, 75%) arredondados. */
export function suggestMilestones(o) {
  const start = startValue(o);
  const target = Number(o.alvo) || 0;
  const span = target - start;
  if (!span) return [];
  const step = Math.abs(span) >= 100 ? 50 : Math.abs(span) >= 10 ? 1 : 0.5;
  return [0.25, 0.5, 0.75].map((f) => Math.round((start + span * f) / step) * step);
}

/** Ordem na lista: ativos por prazo, cumpridos no fim. */
export function sortObjectives(list, ctx, today) {
  return [...list].sort((a, b) => {
    const da = objProgress(a, ctx, today).done || a.concluidoEm ? 1 : 0;
    const db = objProgress(b, ctx, today).done || b.concluidoEm ? 1 : 0;
    return da - db || (a.prazo < b.prazo ? -1 : 1);
  });
}
