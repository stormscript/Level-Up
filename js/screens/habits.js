// Metas → Hábitos: marcar hoje, marcar dias da semana (também para trás), sequências.
import { state } from '../state.js';
import { todayKey, addDays, weekday, fromKey, WEEKDAY_LETTER } from '../engine/dates.js';
import { streak, rate, frequencyLabel, dayState, weekCount, isScheduled, todaySummary, bestActive } from '../engine/habits.js';
import { weekLabel } from '../engine/goals.js';
import { esc, ICONS } from '../ui/dom.js';

/**
 * Lista interativa de hábitos para a semana que começa em `monday`.
 * Toques: [data-htoggle][data-date] marca/desmarca · [data-hopen] abre o detalhe · [data-hweek] muda de semana.
 */
export function habitsListHTML(monday) {
  const today = todayKey();
  if (!state.habits.length) {
    return `<div class="empty"><div class="empty-star">✦</div><h3>Página em branco</h3><p>Cria o primeiro hábito no <b>+</b>.<br>Começa pequeno: 2 minutos chegam.</p></div>`;
  }
  const days = Array.from({ length: 7 }, (_, i) => addDays(monday, i));
  const isThisWeek = monday === addDays(today, 1 - weekday(today));
  const sum = todaySummary(state.habits, state.idx, today);
  const best = bestActive(state.habits, state.idx, today);
  const pct = sum.total ? Math.round((sum.done / sum.total) * 100) : 0;

  const cards = state.habits.filter((h) => !h.arquivado).map((h) => {
    const s = streak(h, state.idx, today);
    const r = rate(h, state.idx, today);
    const todayState = dayState(h, state.idx, today, today);
    const doneToday = todayState === 'done';
    const scheduledToday = isScheduled(h, today);
    const weekly = h.recorrencia?.tipo === 'xPorSemana';
    const wc = weekly ? weekCount(state.idx, h, monday) : 0;
    return `
      <div class="habit-card ${doneToday ? 'done' : ''}">
        <div class="hcard-top">
          <button type="button" class="hcheck ${doneToday ? 'on' : ''} ${scheduledToday ? '' : 'rest'}" data-htoggle="${esc(h.id)}" data-date="${today}"
            aria-label="${doneToday ? 'Desmarcar' : 'Marcar'} ${esc(h.nome)} hoje" aria-pressed="${doneToday}">
            <span class="ring">${ICONS.check}</span>
          </button>
          <button type="button" class="hcard-name" data-hopen="${esc(h.id)}">
            <b>${esc(h.nome)}</b>
            <span>${scheduledToday || doneToday ? '' : 'Hoje é folga · '}${esc(frequencyLabel(h))}${r == null ? '' : ` · ${Math.round(r * 100)}%`}</span>
          </button>
          <button type="button" class="hcard-streak ${s.value ? 'hot' : ''}" data-hopen="${esc(h.id)}" aria-label="Ver detalhes">
            <b>${s.value}</b><span>${s.unit}</span>
          </button>
        </div>
        <div class="hweek">
          ${days.map((d) => {
            const st = dayState(h, state.idx, d, today);
            return `<button type="button" class="hday ${st} ${d === today ? 'is-today' : ''}" data-htoggle="${esc(h.id)}" data-date="${d}"
              ${st === 'future' ? 'disabled' : ''} aria-label="${esc(h.nome)}, dia ${fromKey(d).getDate()}: ${st === 'done' ? 'feito' : 'por marcar'}">
              <span>${WEEKDAY_LETTER[weekday(d)]}</span><i>${st === 'done' ? '✓' : fromKey(d).getDate()}</i>
            </button>`;
          }).join('')}
        </div>
        ${weekly ? `<div class="hweek-foot"><div class="bar thin"><i style="width:${Math.min(100, (wc / h.recorrencia.n) * 100)}%"></i></div><span class="${wc >= h.recorrencia.n ? 'hot' : ''}">${wc}/${h.recorrencia.n} ${isThisWeek ? 'esta semana' : 'nessa semana'}${wc >= h.recorrencia.n ? ' ✦' : ''}</span></div>` : ''}
      </div>`;
  }).join('');

  return `
    <div class="card summary habits-summary">
      <div class="ring-progress" style="--p:${pct}"><span>${sum.done}/${sum.total}</span></div>
      <div>
        <div class="caps small">Hábitos de hoje</div>
        <div class="summary-title">${sum.total && sum.done === sum.total ? 'Todos feitos ✦' : sum.total ? `${sum.total - sum.done} por fazer` : 'Hoje é folga'}</div>
        <div class="muted">${best ? `Maior sequência: ${esc(best.habit.nome)} · ${best.streak.value} ${best.streak.unit}` : 'Toca no círculo para marcar.'}</div>
      </div>
    </div>

    <div class="period-nav">
      <button type="button" class="strip-arrow" data-hweek="-1" aria-label="Semana anterior">‹</button>
      <button type="button" class="period-label" data-hweek="0">${isThisWeek ? 'Esta semana' : `${esc(weekLabel(monday))} <small>· voltar</small>`}</button>
      <button type="button" class="strip-arrow" data-hweek="1" ${isThisWeek ? 'disabled' : ''} aria-label="Semana seguinte">›</button>
    </div>

    ${cards}
    <p class="group-footer">Toca num dia para marcar ou desmarcar (também dias que já passaram). Toca no nome para ver o calendário e as estatísticas.</p>`;
}
