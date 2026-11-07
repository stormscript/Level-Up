// Finanças: detalhe de categoria (limite + movimentos) e gastos fixos.
import { state, subscribe, saveRecurring, deleteRecurring } from '../state.js';
import { prefs, setPref } from '../prefs.js';
import { todayKey, monthLabel, formatRelative } from '../engine/dates.js';
import { CATEGORIES, categoryById, fmtEUR, parseAmount, inMonth, nextRecurring, recurringDate } from '../engine/money.js';
import { esc, el } from '../ui/dom.js';
import { openSheet, actionSheet } from '../ui/sheet.js';
import { toast } from '../ui/effects.js';
import { openTxForm } from './txForm.js';

const euroInput = (cents) => (cents ? (cents / 100).toString().replace('.', ',') : '');

export function openCategorySheet(catId, month, { onFilter } = {}) {
  const cat = categoryById(catId);
  const body = el('<div class="goal-detail"></div>');
  let unsub = null;
  const sheet = openSheet({ title: cat.nome, body, leftLabel: 'Fechar', size: 'large', onClose: () => unsub?.() });

  function render() {
    const list = inMonth(state.txs, month).filter((t) => t.categoria === catId && t.tipo !== 'receita').sort((a, b) => (a.data < b.data ? 1 : -1));
    const total = list.reduce((s, t) => s + t.valor, 0);
    const limit = (prefs.limites || {})[catId] || 0;
    const pct = limit ? total / limit : null;
    body.innerHTML = `
      <div class="gd-head"><div class="caps">${esc(monthLabel(`${month}-01`))}</div><h2>${cat.icone} ${esc(cat.nome)}</h2></div>
      <div class="gd-progress">
        <div class="gd-value"><b>${esc(fmtEUR(total))}</b>${limit ? `<span>/ ${esc(fmtEUR(limit, { round: true }))}</span>` : ''}</div>
        ${limit ? `<div class="bar big ${total > limit ? 'over' : ''}"><i style="width:${Math.min(100, pct * 100).toFixed(1)}%"></i></div>
          <div class="gd-sub"><span>${Math.round(pct * 100)}% do limite</span><span>${total > limit ? `<b class="hot">${esc(fmtEUR(total - limit))} acima</b>` : `faltam ${esc(fmtEUR(limit - total))}`}</span></div>` : ''}
      </div>

      <div class="group-header">Limite mensal</div>
      <form class="add-entry" data-limit novalidate>
        <input name="valor" type="text" inputmode="decimal" placeholder="Sem limite" value="${esc(euroInput(limit))}" aria-label="Limite mensal em euros" enterkeyhint="done">
        <span class="unit">€</span>
        <button type="submit" class="btn-primary small">Guardar</button>
      </form>
      <p class="group-footer">Ex.: Saídas ≤ 60 €. Quando passares de 80% aparece "quase" e um aviso ao abrir a app.</p>

      <div class="group-header">Movimentos (${list.length})</div>
      ${list.length ? `<div class="group">${list.map((t) => `
        <button type="button" class="cell entry-row" data-tx="${esc(t.id)}">
          <span class="cell-label">${esc(t.nota || cat.nome)}<span class="muted small"> · ${esc(formatRelative(t.data))}</span></span>
          <b>−${esc(fmtEUR(t.valor))}</b>
        </button>`).join('')}</div>` : '<p class="group-footer">Nada neste mês.</p>'}
      ${list.length && onFilter ? '<div class="pad" style="margin-top:12px"><button type="button" class="btn-secondary" data-filter>Mostrar só esta categoria nos movimentos</button></div>' : ''}`;
  }

  body.addEventListener('submit', (e) => {
    e.preventDefault();
    const v = e.target.elements.valor.value.trim();
    const cents = v ? parseAmount(v) : 0;
    if (cents == null || cents < 0) return e.target.elements.valor.focus();
    const limites = { ...(prefs.limites || {}) };
    if (cents) limites[catId] = cents; else delete limites[catId];
    setPref('limites', limites);
    window.dispatchEvent(new CustomEvent('prefs-changed'));
    toast(cents ? `Limite: ${fmtEUR(cents, { round: true })}/mês` : 'Sem limite');
    render();
  });
  body.addEventListener('click', (e) => {
    const t = e.target.closest('[data-tx]');
    if (t) return openTxForm(state.txs.find((x) => x.id === t.dataset.tx));
    if (e.target.closest('[data-filter]')) { sheet.close('filter'); onFilter?.(catId); }
  });
  unsub = subscribe(render);
  render();
}

export function openRecurringForm(existing = null) {
  const f = { tipo: existing?.tipo || 'despesa', categoria: existing?.categoria || null };
  const today = todayKey();
  const form = el(`
    <form class="form tx-form" novalidate autocomplete="off">
      <div class="pad">
        <div class="segmented" data-field="tipo">
          <button type="button" data-v="despesa">Despesa fixa</button>
          <button type="button" data-v="receita">Receita fixa</button>
        </div>
      </div>
      <label class="amount">
        <span class="amount-sign" data-sign>−</span>
        <input name="valor" type="text" inputmode="decimal" placeholder="0,00" value="${esc(existing ? (existing.valor / 100).toFixed(2).replace('.', ',') : '')}" aria-label="Valor por mês">
        <span class="amount-cur">€</span>
      </label>
      <div class="cat-grid" data-cats></div>
      <div class="group" style="margin-top:16px">
        <div class="cell"><input name="nota" type="text" maxlength="40" placeholder="Nome (ex.: Spotify, Ginásio, Renda)" value="${esc(existing?.nota || '')}" aria-label="Nome"></div>
        <label class="cell"><span class="cell-label">Dia do mês</span><input name="dia" type="text" inputmode="numeric" class="input-right" placeholder="1" value="${esc(existing?.dia || '')}"></label>
        ${existing ? `<label class="cell"><span class="cell-label">Ativo</span><input type="checkbox" class="switch" name="ativo" ${existing.ativo === false ? '' : 'checked'}></label>` : `
        <label class="cell" data-launch><span class="cell-label">Registar já o deste mês</span><input type="checkbox" class="switch" name="launch"></label>`}
      </div>
      <p class="group-footer" data-help>É lançado sozinho todos os meses nesse dia. Se o dia não existir (ex.: 31), usa o último dia do mês.</p>
      <div class="form-actions">
        <button type="submit" class="btn-primary">${existing ? 'Guardar' : 'Criar fixo'}</button>
        ${existing ? '<button type="button" class="btn-destructive" data-action="delete">Apagar fixo</button>' : ''}
      </div>
    </form>`);

  const sync = () => {
    form.querySelectorAll('[data-field=tipo] [data-v]').forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.v === f.tipo)));
    const cats = CATEGORIES[f.tipo];
    if (!cats.some((c) => c.id === f.categoria)) f.categoria = null;
    form.querySelector('[data-cats]').innerHTML = cats.map((c) => `<button type="button" class="cat ${c.id === f.categoria ? 'sel' : ''}" data-cat="${c.id}"><span>${c.icone}</span>${esc(c.nome)}</button>`).join('');
    form.querySelector('[data-sign]').textContent = f.tipo === 'despesa' ? '−' : '+';
    form.classList.toggle('income', f.tipo === 'receita');
    const launch = form.querySelector('[data-launch]');
    if (launch) {
      const dia = parseInt(form.elements.dia.value, 10);
      launch.hidden = !(dia >= 1 && dia <= 31 && recurringDate({ dia }, today.slice(0, 7)) <= today);
    }
  };
  form.addEventListener('click', (e) => {
    const opt = e.target.closest('[data-field=tipo] [data-v]');
    if (opt) { f.tipo = opt.dataset.v; return sync(); }
    const c = e.target.closest('[data-cat]');
    if (c) { f.categoria = c.dataset.cat; sync(); }
  });
  form.elements.dia.addEventListener('input', sync);

  const sheet = openSheet({ title: existing ? 'Fixo' : 'Novo fixo', body: form, size: 'large' });
  sync();

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const cents = parseAmount(form.elements.valor.value);
    if (!cents || cents <= 0) { form.elements.valor.focus(); return toast('Escreve o valor'); }
    if (!f.categoria) return toast('Escolhe uma categoria');
    const dia = parseInt(form.elements.dia.value, 10);
    if (!(dia >= 1 && dia <= 31)) { form.elements.dia.focus(); return toast('Dia entre 1 e 31'); }
    const r = await saveRecurring({
      ...(existing || {}),
      tipo: f.tipo, valor: cents, categoria: f.categoria, nota: form.elements.nota.value.trim(), dia,
      ativo: existing ? form.elements.ativo.checked : true,
    }, { launchThisMonth: !existing && !!form.elements.launch?.checked && !form.querySelector('[data-launch]').hidden });
    sheet.close('saved');
    const nx = nextRecurring(r, today);
    toast(existing ? 'Guardado' : `Fixo criado · próximo: ${formatRelative(nx, today)}`, { icon: '↻' });
  });

  form.querySelector('[data-action=delete]')?.addEventListener('click', async () => {
    const ok = await actionSheet({
      title: `Apagar "${existing.nota || categoryById(existing.categoria).nome}"?`,
      message: 'Deixa de ser lançado. Os movimentos já lançados ficam.',
      actions: [{ label: 'Apagar fixo', destructive: true }],
    });
    if (!ok) return;
    await deleteRecurring(existing.id);
    sheet.close('deleted');
    toast('Apagado');
  });
}
