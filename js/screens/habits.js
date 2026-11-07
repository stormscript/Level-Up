// Metas → Hábitos: consistência geral, marcar hoje e dias da semana, quantidades, mínimo, hábitos a evitar.
import { state } from '../state.js';
import { todayKey, addDays, weekday, weekStart, fromKey, WEEKDAY_LETTER } from '../engine/dates.js';
import {
  streak, rate, frequencyLabel, dayState, weekCount, isScheduled, todaySummary, bestActive,
  isAvoid, isQty, qtyOn, atRisk, isPaused, dayScore, MOMENTOS,
} from '../engine/habits.js';
import { weekLabel } from '../engine/goals.js';
import { heatmap, heatFill } from '../ui/charts.js';
import { esc, ICONS } from '../ui/dom.js';

const fmtN = (n) => new Intl.NumberFormat('pt-PT', { maximumFractionDigits: 2 }).format(n);

function consistencyCard(today) {
  const weeks = 26;
  const start = addDays(weekStart(today), -(weeks - 1) * 7);
  const days = [];
  let sum = 0, n = 0;
  for (let d = start, i = 0; i < weeks * 7; i++, d = addDays(d, 1)) {
    const v = d > today ? null : dayScore(state.habits, state.idx, d);
    if (v != null && d >= addDays(today, -29) && d < today) { sum += v; n++; }
    days.push({ date: d, fill: d > today ? null : heatFill(v) });
  }
  const avg = n ? Math.round((sum / n) * 100) : null;
  return `
    <div class="card chart-card consistency">
      <div class="cons-top"><span class="caps small">Consistência · 6 meses</span>${avg != null ? `<b>${avg}%</b><span class="muted small">nos últimos 30 dias</span>` : ''}</div>
      ${heatmap(days, { cell: 10.5, gap: 2 })}
      <p class="muted small">Cada quadrado é um dia: quanto mais vermelho, mais hábitos cumpriste.</p>
    </div>`;
}

function card(h, monday, days, today) {
  const idx = state.idx;
  const s = streak(h, idx, today);
  const r = rate(h, idx, today);
  const st = dayState(h, idx, today, today);
  const avoid = isAvoid(h);
  const qty = isQty(h);
  const paused = isPaused(h, today);
  const risk = atRisk(h, idx, today);
  const weekly = h.recorrencia?.tipo === 'xPorSemana' && !avoid;
  const doneToday = st === 'done' || st === 'min';
  const scheduledToday = isScheduled(h, today);
  const wc = weekly ? weekCount(idx, h, monday) : 0;

  // Botão de hoje
  let check;
  if (paused) check = `<span class="hcheck rest" aria-hidden="true"><span class="ring">‖</span></span>`;
  else if (avoid) {
    check = `<button type="button" class="hcheck avoid ${st === 'slip' ? 'slip' : 'on'}" data-htoggle="${esc(h.id)}" data-date="${today}" aria-label="${st === 'slip' ? 'Tirar deslize de hoje' : 'Marcar deslize hoje'}">
      <span class="ring">${st === 'slip' ? '✕' : ICONS.check}</span></button>`;
  } else if (qty) {
    const v = qtyOn(idx, h, today);
    const pct = Math.min(1, v / Number(h.quantidade.alvo));
    check = `<button type="button" class="hcheck qty ${doneToday ? 'on' : ''}" data-hplus="${esc(h.id)}" aria-label="Somar ${fmtN(h.quantidade.passo || 1)} ${esc(h.quantidade.unidade || '')}" style="--p:${(pct * 100).toFixed(0)}">
      <span class="qring"><span>${doneToday && st !== 'min' ? '✓' : `+${fmtN(h.quantidade.passo || 1)}`}</span></span></button>`;
  } else {
    check = `<button type="button" class="hcheck ${doneToday ? 'on' : ''} ${st === 'min' ? 'min' : ''} ${scheduledToday ? '' : 'rest'}" data-htoggle="${esc(h.id)}" data-date="${today}"
      aria-label="${doneToday ? 'Mudar' : 'Marcar'} ${esc(h.nome)} hoje" aria-pressed="${doneToday}"><span class="ring">${ICONS.check}</span></button>`;
  }

  const sub = [];
  if (paused) sub.push('Em pausa');
  else if (risk) sub.push('<span class="hot">Hoje não pode falhar</span>');
  else if (qty) sub.push(`${fmtN(qtyOn(idx, h, today))}/${fmtN(h.quantidade.alvo)} ${esc(h.quantidade.unidade || '')} hoje${st === 'min' ? ' · mínimo' : ''}`);
  else if (st === 'min') sub.push('Mínimo feito hoje');
  else if (!avoid && !scheduledToday) sub.push('Hoje é folga');
  if (!qty || paused) sub.push(esc(avoid ? 'A evitar' : frequencyLabel(h)));
  if (h.momento) sub.push(esc(MOMENTOS[h.momento]));
  if (r != null && !paused) sub.push(`${Math.round(r * 100)}%`);

  return `
    <div class="habit-card ${doneToday || (avoid && st === 'clean') ? 'done' : ''} ${paused ? 'paused' : ''} ${avoid ? 'is-avoid' : ''}">
      <div class="hcard-top">
        ${check}
        <button type="button" class="hcard-name" data-hopen="${esc(h.id)}">
          <b>${avoid ? '⊘ ' : ''}${esc(h.nome)}</b>
          <span>${sub.join(' · ')}</span>
        </button>
        <button type="button" class="hcard-streak ${s.value ? 'hot' : ''}" data-hopen="${esc(h.id)}" aria-label="Ver detalhes">
          <b>${s.value}</b><span>${avoid ? (s.value === 1 ? 'dia limpo' : 'dias limpo') : s.unit}</span>
        </button>
      </div>
      <div class="hweek">
        ${days.map((d) => {
          const ds = dayState(h, idx, d, today);
          const label = ds === 'done' ? '✓' : ds === 'min' ? '½' : ds === 'slip' ? '✕' : fromKey(d).getDate();
          return `<button type="button" class="hday ${ds} ${d === today ? 'is-today' : ''}" data-htoggle="${esc(h.id)}" data-date="${d}"
            ${ds === 'future' || ds === 'paused' ? 'disabled' : ''} aria-label="${esc(h.nome)}, dia ${fromKey(d).getDate()}: ${ds}">
            <span>${WEEKDAY_LETTER[weekday(d)]}</span><i>${label}</i>
          </button>`;
        }).join('')}
      </div>
      ${weekly ? `<div class="hweek-foot"><div class="bar thin"><i style="width:${Math.min(100, (wc / h.recorrencia.n) * 100)}%"></i></div><span class="${wc >= h.recorrencia.n ? 'hot' : ''}">${wc}/${h.recorrencia.n} nesta semana${wc >= h.recorrencia.n ? ' ✦' : ''}</span></div>` : ''}
    </div>`;
}

/**
 * Lista interativa de hábitos para a semana que começa em `monday`.
 * Toques: [data-htoggle][data-date] · [data-hplus] (quantidade) · [data-hopen] · [data-hweek].
 */
export function habitsListHTML(monday) {
  const today = todayKey();
  if (!state.habits.length) {
    return `<div class="empty"><div class="empty-star">✦</div><h3>Página em branco</h3><p>Cria o primeiro hábito no <b>+</b>.<br>Há sugestões prontas: um toque e está feito.</p></div>`;
  }
  const days = Array.from({ length: 7 }, (_, i) => addDays(monday, i));
  const isThisWeek = monday === addDays(today, 1 - weekday(today));
  const sum = todaySummary(state.habits, state.idx, today);
  const best = bestActive(state.habits, state.idx, today);
  const pct = sum.total ? Math.round((sum.done / sum.total) * 100) : 0;
  const active = state.habits.filter((h) => !h.arquivado && !isPaused(h, today));
  const paused = state.habits.filter((h) => !h.arquivado && isPaused(h, today));
  const doList = active.filter((h) => !isAvoid(h));
  const avoidList = active.filter((h) => isAvoid(h));

  return `
    <div class="card summary habits-summary">
      <div class="ring-progress" style="--p:${pct}"><span>${sum.done}/${sum.total}</span></div>
      <div>
        <div class="caps small">Hábitos de hoje</div>
        <div class="summary-title">${sum.total && sum.done === sum.total ? 'Todos feitos ✦' : sum.total ? `${sum.total - sum.done} por fazer` : 'Hoje é folga'}</div>
        <div class="muted">${best ? `Maior sequência: ${esc(best.habit.nome)} · ${best.streak.value} ${best.streak.unit}` : 'Toca no círculo para marcar.'}</div>
      </div>
    </div>

    ${consistencyCard(today)}

    <div class="period-nav">
      <button type="button" class="strip-arrow" data-hweek="-1" aria-label="Semana anterior">‹</button>
      <button type="button" class="period-label" data-hweek="0">${isThisWeek ? 'Esta semana' : `${esc(weekLabel(monday))} <small>· voltar</small>`}</button>
      <button type="button" class="strip-arrow" data-hweek="1" ${isThisWeek ? 'disabled' : ''} aria-label="Semana seguinte">›</button>
    </div>

    ${doList.map((h) => card(h, monday, days, today)).join('')}
    ${avoidList.length ? `<div class="sec"><span class="caps">A evitar</span></div>${avoidList.map((h) => card(h, monday, days, today)).join('')}` : ''}
    ${paused.length ? `<div class="sec"><span class="caps">Em pausa</span></div>${paused.map((h) => card(h, monday, days, today)).join('')}` : ''}
    <p class="group-footer">Toca num dia para marcar (com versão mínima: feito → mínimo → por fazer). Nos hábitos com quantidade, o círculo soma. Toca no nome para ver gráficos, pausar ou reordenar.</p>`;
}
