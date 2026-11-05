// Ecrã "Finanças": resumo do mês, orçamento, categorias e movimentos.
import { state } from '../state.js';
import { prefs } from '../prefs.js';
import { todayKey, monthKey, monthLabel, formatRelative, pad } from '../engine/dates.js';
import { inMonth, summary, budgetPace, groupByDay, categoryById, fmtEUR } from '../engine/money.js';
import { createScreen } from '../ui/screen.js';
import { esc, ICONS } from '../ui/dom.js';
import { attachSwipe } from '../ui/swipe.js';
import { whisper } from '../ui/phrase.js';
import { openTxForm, openBudgetForm, confirmDeleteTx } from './txForm.js';

export function createFinance(section) {
  const scr = createScreen(section, { title: 'Finanças' });
  section.insertAdjacentHTML('beforeend', `<button class="fab" type="button" data-action="new" aria-label="Novo gasto">${ICONS.plus}</button>`);

  let month = monthKey(todayKey());
  let showAll = false;

  section.addEventListener('click', (e) => {
    const t = e.target.closest('[data-action],[data-tx]');
    if (!t) return;
    if (t.dataset.tx) {
      const tx = state.txs.find((x) => x.id === t.dataset.tx);
      if (tx) openTxForm(tx);
      return;
    }
    const a = t.dataset.action;
    if (a === 'new') return openTxForm();
    if (a === 'income') return openTxForm(null, { tipo: 'receita' });
    if (a === 'budget') return openBudgetForm();
    if (a === 'more') { showAll = true; return render(); }
    if (a === 'prev' || a === 'next' || a === 'now') {
      if (a === 'now') month = monthKey(todayKey());
      else {
        const [y, m] = month.split('-').map(Number);
        const d = new Date(y, m - 1 + (a === 'next' ? 1 : -1), 1);
        month = `${d.getFullYear()}-${pad(d.getMonth() + 1)}`;
      }
      showAll = false;
      return render();
    }
  });

  function render() {
    if (!state.ready) return;
    const today = todayKey();
    const isCurrent = month === monthKey(today);
    const txs = inMonth(state.txs, month);
    const s = summary(txs);
    const budget = prefs.orcamento || 0;
    const pace = budget && isCurrent ? budgetPace(s.despesas, budget, today) : null;
    scr.setCaps(isCurrent ? `${monthLabel(`${month}-01`)}` : monthLabel(`${month}-01`));

    const budgetBlock = budget
      ? `<div class="bar ${s.despesas > budget ? 'over' : ''}"><i style="width:${Math.min(100, (s.despesas / budget) * 100).toFixed(1)}%"></i></div>
         <div class="fin-budget">
           <span>de ${esc(fmtEUR(budget, { round: true }))}</span>
           <span>${pace
             ? pace.over ? `<b class="hot">${esc(fmtEUR(-pace.left))} acima</b>` : `<b>${esc(fmtEUR(pace.perDay))}</b>/dia · ${pace.daysLeft} ${pace.daysLeft === 1 ? 'dia' : 'dias'}`
             : s.despesas > budget ? `<b class="hot">${esc(fmtEUR(s.despesas - budget))} acima</b>` : `sobraram ${esc(fmtEUR(budget - s.despesas))}`}</span>
         </div>`
      : `<button type="button" class="link-btn" data-action="budget">Definir orçamento mensal ›</button>`;

    const max = s.cats[0]?.total || 1;
    const cats = s.cats.map((c) => {
      const cat = categoryById(c.id);
      return `<div class="cat-row">
        <span class="cat-ico">${cat.icone}</span>
        <div class="cat-body"><div class="cat-line"><span>${esc(cat.nome)}</span><b>${esc(fmtEUR(c.total))}</b></div>
          <div class="bar thin"><i style="width:${((c.total / max) * 100).toFixed(1)}%"></i></div></div>
      </div>`;
    }).join('');

    const days = groupByDay(txs);
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
        <div class="fin-split">
          <div><span class="caps small">Entrou</span><b>${esc(fmtEUR(s.receitas))}</b></div>
          <div><span class="caps small">Saldo</span><b class="${s.saldo >= 0 ? 'hot' : ''}">${esc(fmtEUR(s.saldo, { sign: true }))}</b></div>
        </div>
      </div>

      <div class="fin-actions">
        <button type="button" class="btn-secondary" data-action="new">− Gasto</button>
        <button type="button" class="btn-secondary" data-action="income">+ Receita</button>
      </div>

      ${cats ? `<div class="sec"><span class="caps">Para onde foi</span></div><div class="card cats-card">${cats}</div>` : ''}

      <div class="sec"><span class="caps">Movimentos</span></div>
      ${visibleDays.length ? visibleDays.map(([date, list]) => `
        <div class="day-head"><span>${esc(formatRelative(date, today))}</span><span>${esc(fmtEUR(-list.filter((t) => t.tipo !== 'receita').reduce((a, t) => a + t.valor, 0)))}</span></div>
        <div class="group list">${list.map((t) => {
          const cat = categoryById(t.categoria);
          return `<div class="swipe-row tx-row" data-id="${esc(t.id)}">
            <div class="swipe-actions"><button type="button" class="sa-edit" data-swipe="edit">Editar</button><button type="button" class="sa-delete" data-swipe="delete">Apagar</button></div>
            <div class="swipe-content task" data-tx="${esc(t.id)}">
              <span class="cat-ico">${cat.icone}</span>
              <div class="task-body"><div class="task-title">${esc(t.nota || cat.nome)}</div>${t.nota ? `<div class="task-meta">${esc(cat.nome)}</div>` : ''}</div>
              <span class="tx-amount ${t.tipo === 'receita' ? 'in' : ''}">${t.tipo === 'receita' ? '+' : '−'}${esc(fmtEUR(t.valor))}</span>
            </div></div>`;
        }).join('')}</div>`).join('')
        : '<div class="empty small"><p>Sem movimentos neste mês.<br>Toca em <b>+</b> para registar um gasto.</p></div>'}
      ${!showAll && days.length > 7 ? '<div class="pad"><button type="button" class="btn-secondary" data-action="more">Ver todos os movimentos</button></div>' : ''}
      ${whisper('financas-fim')}`;

    scr.content.querySelectorAll('.tx-row').forEach((row) => {
      const tx = state.txs.find((x) => x.id === row.dataset.id);
      attachSwipe(row, { onEdit: () => openTxForm(tx), onDelete: () => confirmDeleteTx(tx) });
    });
  }

  return { render, scroller: scr.scroller };
}
