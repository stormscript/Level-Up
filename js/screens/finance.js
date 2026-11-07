// Ecrã "Finanças": resumo, ritmo do mês, categorias (donut + limites), fixos, 6 meses e movimentos.
import { state } from '../state.js';
import { prefs } from '../prefs.js';
import { todayKey, monthKey, monthLabel, formatRelative, pad, MONTH_SHORT } from '../engine/dates.js';
import {
  inMonth, summary, budgetPace, groupByDay, categoryById, fmtEUR, lastDayOfMonth, cumulativeByDay, projectMonth,
  monthsSeries, prevMonth, vsPrevMonth, categoryStatus, frequentTxs, nextRecurring, recurringTotal,
} from '../engine/money.js';
import { createScreen } from '../ui/screen.js';
import { esc, ICONS } from '../ui/dom.js';
import { attachSwipe } from '../ui/swipe.js';
import { whisper } from '../ui/phrase.js';
import { lineChart, donut, groupedBars, CAT_COLORS } from '../ui/charts.js';
import { openTxForm, openBudgetForm, confirmDeleteTx } from './txForm.js';
import { openCategorySheet, openRecurringForm } from './finSheets.js';

const eur0 = (c) => fmtEUR(c, { round: true });

export function createFinance(section) {
  const scr = createScreen(section, { title: 'Finanças' });
  section.insertAdjacentHTML('beforeend', `<button class="fab" type="button" data-action="new" aria-label="Novo gasto">${ICONS.plus}</button>`);

  let month = monthKey(todayKey());
  let showAll = false;
  let filterCat = null;

  section.addEventListener('click', (e) => {
    const t = e.target.closest('[data-action],[data-tx],[data-cat-open],[data-freq],[data-rec]');
    if (!t) return;
    if (t.dataset.tx) {
      const tx = state.txs.find((x) => x.id === t.dataset.tx);
      if (tx) openTxForm(tx);
      return;
    }
    if (t.dataset.catOpen) return openCategorySheet(t.dataset.catOpen, month, { onFilter: (id) => { filterCat = id; showAll = true; render(); scrollToMoves(); } });
    if (t.dataset.freq) {
      const f = frequentTxs(state.txs, todayKey())[+t.dataset.freq];
      if (f) openTxForm(null, { prefill: f });
      return;
    }
    if (t.dataset.rec) return openRecurringForm(state.recurring.find((r) => r.id === t.dataset.rec));
    const a = t.dataset.action;
    if (a === 'new') return openTxForm();
    if (a === 'income') return openTxForm(null, { tipo: 'receita' });
    if (a === 'budget') return openBudgetForm();
    if (a === 'new-rec') return openRecurringForm();
    if (a === 'more') { showAll = true; return render(); }
    if (a === 'clear-filter') { filterCat = null; return render(); }
    if (a === 'prev' || a === 'next' || a === 'now') {
      if (a === 'now') month = monthKey(todayKey());
      else {
        const [y, m] = month.split('-').map(Number);
        const d = new Date(y, m - 1 + (a === 'next' ? 1 : -1), 1);
        month = `${d.getFullYear()}-${pad(d.getMonth() + 1)}`;
      }
      showAll = false;
      filterCat = null;
      return render();
    }
  });

  const scrollToMoves = () => requestAnimationFrame(() => scr.content.querySelector('[data-moves]')?.scrollIntoView({ behavior: 'smooth', block: 'start' }));

  function paceChart(today, budget) {
    const pts = cumulativeByDay(state.txs, month, today);
    if (!pts.length || !pts[pts.length - 1].v) return '';
    const last = lastDayOfMonth(month);
    const proj = projectMonth(state.txs, month, today);
    const lastPt = pts[pts.length - 1];
    const chart = lineChart({
      points: pts.map((p) => ({ x: p.day - 1, y: p.v / 100 })),
      ideal: budget ? [{ x: 0, y: 0 }, { x: last - 1, y: budget / 100 }] : [],
      projection: proj && lastPt.day < last ? [{ x: lastPt.day - 1, y: lastPt.v / 100 }, { x: last - 1, y: proj / 100 }] : null,
      xMax: last - 1,
      target: budget ? budget / 100 : null,
      labels: [{ x: 0, text: '1' }, { x: (last - 1) / 2, text: String(Math.round(last / 2)) }, { x: last - 1, text: String(last) }],
      height: 150,
    });
    let note = '';
    if (proj != null) {
      if (budget) {
        const diff = proj - budget;
        note = diff > 0
          ? `Ao ritmo atual: <b>~${esc(eur0(proj))}</b> no fim do mês, <b class="hot">${esc(eur0(diff))} acima</b> do orçamento.`
          : `Ao ritmo atual: <b>~${esc(eur0(proj))}</b> no fim do mês. Sobram ~${esc(eur0(-diff))} ✦`;
      } else note = `Ao ritmo atual: <b>~${esc(eur0(proj))}</b> no fim do mês.`;
    }
    return `
      <div class="sec"><span class="caps">Ritmo do mês</span></div>
      <div class="card chart-card">${chart}
        <div class="chart-legend"><span><i class="real"></i>gasto acumulado</span>${budget ? '<span><i class="ideal"></i>orçamento</span>' : ''}</div>
        ${note ? `<p class="fin-note">${note}</p>` : ''}
      </div>`;
  }

  function categoriesBlock(today) {
    const list = categoryStatus(state.txs, month, prefs.limites || {});
    if (!list.length) return '';
    const spent = list.reduce((s, c) => s + c.total, 0);
    const top = list.filter((c) => c.total > 0).slice(0, 6);
    const rest = list.filter((c) => c.total > 0).slice(6).reduce((s, c) => s + c.total, 0);
    const colorOf = new Map(top.map((c, i) => [c.id, CAT_COLORS[i]]));
    const items = [...top.map((c) => ({ value: c.total, color: colorOf.get(c.id) })), ...(rest ? [{ value: rest, color: '#3a3a3c' }] : [])];
    const max = Math.max(1, ...list.map((c) => c.total));
    return `
      <div class="sec"><span class="caps">Para onde foi</span></div>
      <div class="card cats-card">
        ${spent ? `<div class="donut-wrap">${donut(items, { center: { big: eur0(spent), small: 'gasto' } })}
          <div class="donut-legend">${top.map((c) => `<span><i style="background:${colorOf.get(c.id)}"></i>${esc(categoryById(c.id).nome)} <b>${Math.round((c.total / spent) * 100)}%</b></span>`).join('')}${rest ? `<span><i style="background:#3a3a3c"></i>Outras <b>${Math.round((rest / spent) * 100)}%</b></span>` : ''}</div></div>` : ''}
        ${list.map((c) => {
          const cat = categoryById(c.id);
          const w = c.limit ? Math.min(100, (c.total / c.limit) * 100) : (c.total / max) * 100;
          return `<button type="button" class="cat-row" data-cat-open="${esc(c.id)}">
            <span class="cat-ico">${cat.icone}</span>
            <div class="cat-body"><div class="cat-line"><span>${esc(cat.nome)}${c.over ? ' <em class="over-tag">passou</em>' : c.pct != null && c.pct >= 0.8 ? ' <em class="near-tag">quase</em>' : ''}</span>
              <b>${esc(fmtEUR(c.total))}${c.limit ? `<small> / ${esc(eur0(c.limit))}</small>` : ''}</b></div>
              <div class="bar thin ${c.over ? 'over' : ''}"><i style="width:${w.toFixed(1)}%;${colorOf.get(c.id) && !c.limit ? `background:${colorOf.get(c.id)};box-shadow:none` : ''}"></i></div></div>
          </button>`;
        }).join('')}
        <p class="muted small">Toca numa categoria para definir um limite mensal ou ver os movimentos.</p>
      </div>`;
  }

  function recurringBlock(today) {
    const list = [...state.recurring].sort((a, b) => (Number(a.dia) || 0) - (Number(b.dia) || 0));
    return `
      <div class="sec"><span class="caps">Fixos todos os meses</span><button type="button" class="sec-link" data-action="new-rec">+ Fixo</button></div>
      ${list.length ? `<div class="group">${list.map((r) => {
        const cat = categoryById(r.categoria);
        const nx = nextRecurring(r, today);
        return `<button type="button" class="cell rec-row ${r.ativo === false ? 'off' : ''}" data-rec="${esc(r.id)}">
          <span class="cat-ico">${cat.icone}</span>
          <div class="rec-body"><b>${esc(r.nota || cat.nome)}</b><span class="muted small">${r.ativo === false ? 'Parado' : `Dia ${r.dia} · próximo: ${esc(formatRelative(nx, today))}`}</span></div>
          <span class="tx-amount ${r.tipo === 'receita' ? 'in' : ''}">${r.tipo === 'receita' ? '+' : '−'}${esc(fmtEUR(r.valor))}</span>
        </button>`;
      }).join('')}</div>
      <p class="group-footer">Fixos: ${esc(fmtEUR(recurringTotal(list)))}/mês. São lançados sozinhos no dia certo.</p>`
        : '<p class="group-footer">Ginásio, Spotify, renda, passe… Regista uma vez e a app lança todos os meses.</p>'}`;
  }

  function sixMonths(today) {
    const months = Array.from({ length: 6 }, (_, i) => prevMonth(month, 5 - i));
    const series = monthsSeries(state.txs, months);
    if (!series.some((s) => s.despesas || s.receitas)) return '';
    const groups = series.map((s) => ({ label: MONTH_SHORT[Number(s.month.slice(5)) - 1], a: s.despesas / 100, b: s.receitas / 100, current: s.month === month }));
    const withData = series.filter((s) => s.despesas);
    const avg = withData.length ? withData.reduce((x, s) => x + s.despesas, 0) / withData.length : 0;
    return `
      <div class="sec"><span class="caps">Últimos 6 meses</span></div>
      <div class="card chart-card">${groupedBars(groups, { fmt: (v) => (v >= 1000 ? `${(v / 1000).toFixed(1)}k` : String(Math.round(v))) })}
        <div class="chart-legend"><span><i class="bar-red"></i>gasto</span><span><i class="bar-white"></i>entrou</span><span class="fc">média: ${esc(eur0(avg))}/mês</span></div>
      </div>`;
  }

  function render() {
    if (!state.ready) return;
    const today = todayKey();
    const isCurrent = month === monthKey(today);
    const txs = inMonth(state.txs, month);
    const s = summary(txs);
    const budget = prefs.orcamento || 0;
    const pace = budget && isCurrent ? budgetPace(s.despesas, budget, today) : null;
    const vs = vsPrevMonth(state.txs, month, today);
    scr.setCaps(monthLabel(`${month}-01`));

    const budgetBlock = budget
      ? `<div class="bar ${s.despesas > budget ? 'over' : ''}"><i style="width:${Math.min(100, (s.despesas / budget) * 100).toFixed(1)}%"></i></div>
         <div class="fin-budget">
           <span>de ${esc(eur0(budget))}</span>
           <span>${pace
             ? pace.over ? `<b class="hot">${esc(fmtEUR(-pace.left))} acima</b>` : `podes gastar <b>${esc(fmtEUR(pace.perDay))}</b>/dia`
             : s.despesas > budget ? `<b class="hot">${esc(fmtEUR(s.despesas - budget))} acima</b>` : `sobraram ${esc(fmtEUR(budget - s.despesas))}`}</span>
         </div>`
      : `<button type="button" class="link-btn" data-action="budget">Definir orçamento mensal ›</button>`;

    const freq = isCurrent ? frequentTxs(state.txs, today) : [];
    const days = groupByDay(txs.filter((t) => !filterCat || t.categoria === filterCat));
    const visibleDays = showAll ? days : days.slice(0, 7);

    scr.content.innerHTML = `
      <div class="period-nav">
        <button type="button" class="strip-arrow" data-action="prev" aria-label="Mês anterior">‹</button>
        <button type="button" class="period-label" data-action="now">${esc(monthLabel(`${month}-01`))}${isCurrent ? '' : ' <small>· voltar</small>'}</button>
        <button type="button" class="strip-arrow" data-action="next" aria-label="Mês seguinte">›</button>
      </div>

      <div class="card fin-hero">
        <div class="fin-top">
          <div><div class="caps small">Gasto ${isCurrent ? 'este mês' : 'no mês'}</div><div class="fin-big">${esc(fmtEUR(s.despesas))}</div></div>
          <button type="button" class="icon-btn small" data-action="budget" aria-label="Orçamento">${ICONS.gear}</button>
        </div>
        ${budgetBlock}
        ${vs ? `<p class="fin-vs ${vs.pct > 0 ? 'up' : 'down'}">${vs.pct > 0 ? '▲' : '▼'} ${Math.abs(Math.round(vs.pct * 100))}% ${vs.pct > 0 ? 'mais' : 'menos'} do que em ${esc(monthLabel(`${vs.prev}-01`).split(' ')[0].toLowerCase())}${isCurrent ? ' até este dia' : ''}</p>` : ''}
        <div class="fin-split">
          <div><span class="caps small">Entrou</span><b>${esc(fmtEUR(s.receitas))}</b></div>
          <div><span class="caps small">Saldo</span><b class="${s.saldo >= 0 ? 'hot' : ''}">${esc(fmtEUR(s.saldo, { sign: true }))}</b></div>
        </div>
      </div>

      <div class="fin-actions">
        <button type="button" class="btn-secondary" data-action="new">− Gasto</button>
        <button type="button" class="btn-secondary" data-action="income">+ Receita</button>
      </div>
      ${freq.length ? `<div class="freq-row"><span class="muted small">Repetir:</span>${freq.map((f, i) => `
        <button type="button" class="freq-chip" data-freq="${i}">${categoryById(f.categoria).icone} ${esc(f.nota || categoryById(f.categoria).nome)} <b>${esc(fmtEUR(f.valor))}</b></button>`).join('')}</div>` : ''}

      ${paceChart(today, budget)}
      ${categoriesBlock(today)}
      ${recurringBlock(today)}
      ${sixMonths(today)}

      <div class="sec" data-moves><span class="caps">Movimentos</span>${filterCat ? `<button type="button" class="filter-chip" data-action="clear-filter">${categoryById(filterCat).icone} ${esc(categoryById(filterCat).nome)} ✕</button>` : ''}</div>
      ${visibleDays.length ? visibleDays.map(([date, list]) => `
        <div class="day-head"><span>${esc(formatRelative(date, today))}</span><span>${esc(fmtEUR(-list.filter((t) => t.tipo !== 'receita').reduce((a, t) => a + t.valor, 0)))}</span></div>
        <div class="group list">${list.map((t) => {
          const cat = categoryById(t.categoria);
          return `<div class="swipe-row tx-row" data-id="${esc(t.id)}">
            <div class="swipe-actions"><button type="button" class="sa-edit" data-swipe="edit">Editar</button><button type="button" class="sa-delete" data-swipe="delete">Apagar</button></div>
            <div class="swipe-content task" data-tx="${esc(t.id)}">
              <span class="cat-ico">${cat.icone}</span>
              <div class="task-body"><div class="task-title">${esc(t.nota || cat.nome)}</div><div class="task-meta">${esc(cat.nome)}${t.fixoId ? ' · fixo ↻' : ''}</div></div>
              <span class="tx-amount ${t.tipo === 'receita' ? 'in' : ''}">${t.tipo === 'receita' ? '+' : '−'}${esc(fmtEUR(t.valor))}</span>
            </div></div>`;
        }).join('')}</div>`).join('')
        : `<div class="empty small"><p>${filterCat ? 'Sem movimentos nesta categoria.' : 'Sem movimentos neste mês.<br>Toca em <b>+</b> para registar um gasto.'}</p></div>`}
      ${!showAll && days.length > 7 ? '<div class="pad"><button type="button" class="btn-secondary" data-action="more">Ver todos os movimentos</button></div>' : ''}
      ${whisper('financas-fim')}`;

    scr.content.querySelectorAll('.tx-row').forEach((row) => {
      const tx = state.txs.find((x) => x.id === row.dataset.id);
      attachSwipe(row, { onEdit: () => openTxForm(tx), onDelete: () => confirmDeleteTx(tx) });
    });
  }

  return { render, scroller: scr.scroller };
}
