// Ficha de um hábito: controlo de hoje, estatísticas, mapa do ano, dias da semana, meses e calendário.
import { state, subscribe, toggleCheck, addQty, setMin, setPaused, moveHabit } from '../state.js';
import { todayKey, weekday, weekStart, addDays, fromKey, pad, monthLabel, WEEKDAY_LETTER, WEEKDAY_SHORT, shortDate, MONTH_SHORT } from '../engine/dates.js';
import {
  streak, bestStreak, rate, totalDone, frequencyLabel, dayState, isQty, isAvoid, qtyOn, atRisk, isPaused,
  weekdayRates, weakestDay, monthRates, lastSlip, MOMENTOS,
} from '../engine/habits.js';
import { lastDayOfMonth } from '../engine/money.js';
import { heatmap, heatFill, barChart, lineChart } from '../ui/charts.js';
import { esc, el } from '../ui/dom.js';
import { openSheet } from '../ui/sheet.js';
import { play, toast, glow } from '../ui/effects.js';
import { openHabitForm, confirmDeleteHabit } from './habitForm.js';

const fmtN = (n) => new Intl.NumberFormat('pt-PT', { maximumFractionDigits: 2 }).format(n);

/** Cor de um dia no mapa. */
export function habitFill(h, st, idx, date) {
  switch (st) {
    case 'done': return heatFill(1);
    case 'min': return heatFill(0.45);
    case 'partial': return heatFill(Math.max(0.12, (qtyOn(idx, h, date) / Number(h.quantidade.alvo)) * 0.7));
    case 'miss': case 'pending': return heatFill(0);
    case 'clean': return 'rgba(255,42,61,.5)';
    case 'slip': return '#ffffff';
    case 'paused': return 'rgba(255,255,255,.08)';
    default: return heatFill(null);
  }
}

export function yearMap(h, today) {
  const start = addDays(weekStart(today), -52 * 7);
  const days = [];
  for (let d = start, i = 0; i < 53 * 7; i++, d = addDays(d, 1)) {
    days.push({ date: d, fill: d > today ? null : habitFill(h, dayState(h, state.idx, d, today), state.idx, d) });
  }
  return heatmap(days);
}

export function openHabitSheet(habitId) {
  const body = el('<div class="habit-detail"></div>');
  let month = todayKey().slice(0, 7);
  let unsub = null;
  const sheet = openSheet({ title: 'Hábito', body, leftLabel: 'Fechar', size: 'large', onClose: () => unsub?.() });

  function todayControl(h, today) {
    const st = dayState(h, state.idx, today, today);
    if (isAvoid(h)) {
      const slipped = st === 'slip';
      return `
        <div class="today-ctl">
          <button type="button" class="btn-secondary ${slipped ? 'warn' : ''}" data-act="toggle">${slipped ? 'Desfazer deslize de hoje' : 'Escorreguei hoje'}</button>
        </div>`;
    }
    if (isQty(h)) {
      const v = qtyOn(state.idx, h, today);
      const alvo = Number(h.quantidade.alvo);
      const step = Number(h.quantidade.passo) || 1;
      const pct = Math.min(1, v / alvo);
      return `
        <div class="qty-card ${st === 'done' ? 'done' : ''}">
          <div class="qty-top"><span class="caps small">Hoje</span>${st === 'min' ? '<span class="pill-min">mínimo ✦</span>' : ''}</div>
          <div class="qty-value"><b>${fmtN(v)}</b><span>/ ${fmtN(alvo)} ${esc(h.quantidade.unidade || '')}</span></div>
          <div class="bar big"><i style="width:${(pct * 100).toFixed(1)}%"></i></div>
          <div class="qty-btns">
            <button type="button" class="qty-btn" data-act="minus" aria-label="Menos ${step}">−${fmtN(step)}</button>
            <button type="button" class="qty-btn plus" data-act="plus" aria-label="Mais ${step}">+${fmtN(step)}</button>
          </div>
          ${h.minimo ? `<button type="button" class="link-btn" data-act="min">${st === 'min' ? 'Tirar "mínimo"' : `Dia difícil? Fiz o mínimo: ${esc(h.minimo)}`}</button>` : ''}
        </div>`;
    }
    const isDone = st === 'done' || st === 'min';
    return `
      <div class="today-ctl">
        <button type="button" class="big-toggle ${isDone ? 'on' : ''}" data-act="${isDone ? 'clear' : 'full'}">
          <span class="ring">${isDone ? '✓' : ''}</span>${st === 'done' ? 'Feito hoje ✦' : st === 'min' ? 'Fiz o mínimo hoje' : 'Marcar como feito hoje'}</button>
        ${h.minimo && !isDone ? `<button type="button" class="link-btn" data-act="min">Dia difícil? Fiz o mínimo: ${esc(h.minimo)}</button>` : ''}
        ${st === 'done' && h.minimo ? `<button type="button" class="link-btn" data-act="min">Afinal foi só o mínimo</button>` : ''}
      </div>`;
  }

  function render() {
    const h = state.habits.find((x) => x.id === habitId);
    if (!h) return sheet.close('gone');
    const today = todayKey();
    const idx = state.idx;
    const s = streak(h, idx, today);
    const best = bestStreak(h, idx, today);
    const r = rate(h, idx, today);
    const avoid = isAvoid(h);
    const paused = isPaused(h, today);
    const risk = atRisk(h, idx, today);
    const unit = avoid ? 'dias limpo' : s.unit;

    // Dias da semana
    const wr = weekdayRates(h, idx, today);
    const weak = weakestDay(wr);
    const wItems = wr.map((x) => ({
      label: WEEKDAY_LETTER[x.weekday], pct: x.pct, text: x.pct == null ? '—' : `${Math.round(x.pct * 100)}`,
      color: weak && x.weekday === weak.weekday ? '#ffffff' : null, labelColor: weak && x.weekday === weak.weekday ? '#ffffff' : null,
    }));
    // Meses
    const mr = monthRates(h, idx, today);
    const mItems = mr.map((x, i) => ({ label: MONTH_SHORT[Number(x.month.slice(5)) - 1], pct: x.pct, text: x.pct == null ? '—' : `${Math.round(x.pct * 100)}%`, current: i === mr.length - 1 }));
    // Quantidade: últimos 30 dias
    let qtyChart = '';
    if (isQty(h)) {
      const pts = Array.from({ length: 30 }, (_, i) => ({ x: i, y: qtyOn(idx, h, addDays(today, i - 29)) }));
      qtyChart = `
        <div class="sec"><span class="caps">Últimos 30 dias</span></div>
        <div class="card chart-card">${lineChart({ points: pts, xMax: 29, target: Number(h.quantidade.alvo), labels: [{ x: 0, text: shortDate(addDays(today, -29), today) }, { x: 29, text: 'hoje' }], stepped: true, height: 130 })}
          <p class="muted small">Linha vermelha fina: o alvo (${fmtN(h.quantidade.alvo)} ${esc(h.quantidade.unidade || '')}).</p></div>`;
    }

    // Calendário do mês
    const total = lastDayOfMonth(month);
    const offset = weekday(`${month}-01`) - 1;
    const days = Array.from({ length: total }, (_, i) => `${month}-${pad(i + 1)}`);
    const goodInMonth = days.filter((d) => ['done', 'min', 'clean'].includes(dayState(h, idx, d, today))).length;
    const isCurrent = month === today.slice(0, 7);
    const slip = avoid ? lastSlip(h, state.checks) : null;

    body.innerHTML = `
      <div class="gd-head">
        <div class="caps">${esc(frequencyLabel(h))}${h.momento ? ` · ${esc(MOMENTOS[h.momento])}` : ''}</div>
        <h2>${esc(h.nome)}</h2>
        ${h.minimo && !avoid ? `<p class="muted small">Versão mínima: ${esc(h.minimo)}</p>` : ''}
        ${paused ? '<span class="pace-pill">Em pausa · não conta nem quebra a sequência</span>' : ''}
        ${risk ? '<span class="pace-pill ahead">Falhaste o último dia. Hoje não pode falhar.</span>' : ''}
      </div>

      ${paused ? '' : todayControl(h, today)}

      <div class="stats-row four">
        <div><b>${s.value}</b><span>${esc(unit)}</span></div>
        <div><b>${best}</b><span>recorde</span></div>
        <div><b>${r == null ? '—' : `${Math.round(r * 100)}%`}</b><span>${avoid ? 'dias limpos' : '30 dias'}</span></div>
        <div><b>${totalDone(h, state.checks)}</b><span>${avoid ? 'deslizes' : 'total'}</span></div>
      </div>
      ${avoid && slip ? `<p class="group-footer">Último deslize: ${esc(shortDate(slip, today))}. Cada dia limpo conta.</p>` : ''}

      <div class="sec"><span class="caps">Mapa do ano</span></div>
      <div class="card chart-card">${yearMap(h, today)}
        <p class="muted small">${avoid ? '<span class="lg clean"></span>limpo <span class="lg slip"></span>deslize' : `<span class="lg done"></span>feito ${h.minimo ? '<span class="lg min"></span>mínimo ' : ''}<span class="lg miss"></span>falhado`}</p></div>

      <div class="sec"><span class="caps">Por dia da semana</span><span class="muted small">últimas 12 semanas</span></div>
      <div class="card chart-card">${barChart(wItems, { height: 110 })}
        <p class="muted small">${weak ? `O teu dia mais difícil é <b class="white">${esc(WEEKDAY_SHORT[weak.weekday].toLowerCase())}</b> (${Math.round(weak.pct * 100)}%). Prepara-o na véspera.` : 'Sem um dia claramente mais fraco. Bom sinal.'}</p></div>

      <div class="sec"><span class="caps">Evolução</span><span class="muted small">últimos 6 meses</span></div>
      <div class="card chart-card">${barChart(mItems, { height: 110 })}</div>

      ${qtyChart}

      <div class="month-nav">
        <button type="button" class="strip-arrow" data-m="-1" aria-label="Mês anterior">‹</button>
        <strong>${esc(monthLabel(`${month}-01`))} <small class="muted">· ${goodInMonth}${avoid ? ' limpos' : '×'}</small></strong>
        <button type="button" class="strip-arrow" data-m="1" ${isCurrent ? 'disabled' : ''} aria-label="Mês seguinte">›</button>
      </div>
      <div class="month-grid habit-cal">
        ${[1, 2, 3, 4, 5, 6, 7].map((w) => `<span class="mg-head">${WEEKDAY_LETTER[w]}</span>`).join('')}
        ${'<span></span>'.repeat(offset)}
        ${days.map((d) => {
          const st = dayState(h, idx, d, today);
          return `<button type="button" class="hc-day ${st} ${d === today ? 'is-today' : ''}" data-day="${d}" ${st === 'future' ? 'disabled' : ''}
            aria-label="Dia ${fromKey(d).getDate()}: ${st}">${fromKey(d).getDate()}</button>`;
        }).join('')}
      </div>
      <p class="group-footer">Toca num dia para ${avoid ? 'marcar ou tirar um deslize' : h.minimo ? 'alternar: feito → mínimo → por fazer' : 'marcar ou desmarcar'}.</p>

      <div class="form-actions">
        <div class="row-btns">
          <button type="button" class="btn-secondary" data-act="up" aria-label="Subir na lista">↑ Subir</button>
          <button type="button" class="btn-secondary" data-act="down" aria-label="Descer na lista">↓ Descer</button>
        </div>
        <button type="button" class="btn-secondary" data-act="pause">${paused ? 'Retomar hábito' : 'Pausar (férias, lesão, exames…)'}</button>
        <button type="button" class="btn-secondary" data-act="edit">Editar hábito</button>
        <button type="button" class="btn-destructive" data-act="delete">Apagar hábito</button>
      </div>`;
  }

  body.addEventListener('click', async (e) => {
    const h = state.habits.find((x) => x.id === habitId);
    if (!h) return;
    const today = todayKey();
    const day = e.target.closest('[data-day]');
    if (day && !day.disabled) {
      const res = await toggleCheck(habitId, day.dataset.day);
      play(res.done || res.state === 'slip' ? 'check' : 'undo');
      return;
    }
    const m = e.target.closest('[data-m]');
    if (m && !m.disabled) {
      const [y, mo] = month.split('-').map(Number);
      const d = new Date(y, mo - 1 + Number(m.dataset.m), 1);
      month = `${d.getFullYear()}-${pad(d.getMonth() + 1)}`;
      return render();
    }
    const a = e.target.closest('[data-act]')?.dataset.act;
    if (!a) return;
    const before = dayState(h, state.idx, today, today);
    if (a === 'plus' || a === 'minus') {
      const step = Number(h.quantidade.passo) || 1;
      const res = await addQty(habitId, today, a === 'plus' ? step : -step);
      if (res.done && before !== 'done') { glow(); play('closed'); toast('Alvo atingido ✦'); } else play(a === 'plus' ? 'check' : 'undo');
    }
    if (a === 'min') { await setMin(habitId, today, before !== 'min'); if (before !== 'min') toast('O mínimo conta. Amanhã é dia de fazer tudo.', { icon: '✦' }); }
    if (a === 'full') { await toggleCheck(habitId, today); play('check'); }
    if (a === 'clear') { await setMin(habitId, today, false); play('undo'); }
    if (a === 'toggle') { const res = await toggleCheck(habitId, today); if (res.state === 'slip') toast('Acontece. Recomeça agora: o dia de amanhã ainda é limpo.'); }
    if (a === 'pause') { await setPaused(habitId, !isPaused(h, today)); toast(isPaused(h, today) ? 'Hábito retomado' : 'Em pausa. A sequência fica guardada.'); }
    if (a === 'up' || a === 'down') await moveHabit(habitId, a === 'up' ? -1 : 1);
    if (a === 'edit') openHabitForm(h);
    if (a === 'delete' && (await confirmDeleteHabit(h))) sheet.close('deleted');
  });

  unsub = subscribe(render);
  render();
}
