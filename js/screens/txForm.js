// Bottom sheet para registar um gasto ou uma receita (rápido: valor → categoria → guardar).
import { saveTx, deleteTx } from '../state.js';
import { prefs, setPref } from '../prefs.js';
import { todayKey } from '../engine/dates.js';
import { CATEGORIES, parseAmount, fmtEUR } from '../engine/money.js';
import { esc, el } from '../ui/dom.js';
import { openSheet, actionSheet } from '../ui/sheet.js';
import { toast } from '../ui/effects.js';

export function openTxForm(existing = null, { tipo = 'despesa' } = {}) {
  const f = {
    tipo: existing?.tipo || tipo,
    categoria: existing?.categoria || null,
    data: existing?.data || todayKey(),
  };
  const amountText = existing ? (existing.valor / 100).toFixed(2).replace('.', ',') : '';

  const form = el(`
    <form class="form tx-form" novalidate autocomplete="off">
      <div class="pad">
        <div class="segmented" data-field="tipo">
          <button type="button" data-v="despesa">Despesa</button>
          <button type="button" data-v="receita">Receita</button>
        </div>
      </div>
      <label class="amount">
        <span class="amount-sign" data-sign>−</span>
        <input name="valor" type="text" inputmode="decimal" placeholder="0,00" value="${esc(amountText)}" aria-label="Valor em euros" enterkeyhint="done">
        <span class="amount-cur">€</span>
      </label>
      <div class="cat-grid" data-cats></div>
      <div class="group" style="margin-top:16px">
        <div class="cell"><input name="nota" type="text" maxlength="60" placeholder="Nota (opcional)" value="${esc(existing?.nota || '')}" aria-label="Nota" enterkeyhint="done"></div>
        <label class="cell"><span class="cell-label">Data</span><input type="date" name="data" value="${esc(f.data)}"></label>
      </div>
      <div class="form-actions">
        <button type="submit" class="btn-primary">${existing ? 'Guardar' : 'Registar'}</button>
        ${existing ? '<button type="button" class="btn-destructive" data-action="delete">Apagar movimento</button>' : ''}
      </div>
    </form>`);

  const sync = () => {
    form.querySelectorAll('[data-field=tipo] [data-v]').forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.v === f.tipo)));
    const cats = CATEGORIES[f.tipo];
    if (!cats.some((c) => c.id === f.categoria)) f.categoria = null;
    form.querySelector('[data-cats]').innerHTML = cats
      .map((c) => `<button type="button" class="cat ${c.id === f.categoria ? 'sel' : ''}" data-cat="${c.id}"><span>${c.icone}</span>${esc(c.nome)}</button>`)
      .join('');
    form.querySelector('[data-sign]').textContent = f.tipo === 'despesa' ? '−' : '+';
    form.classList.toggle('income', f.tipo === 'receita');
  };

  form.addEventListener('click', (e) => {
    const opt = e.target.closest('[data-field=tipo] [data-v]');
    if (opt) { f.tipo = opt.dataset.v; return sync(); }
    const c = e.target.closest('[data-cat]');
    if (c) { f.categoria = c.dataset.cat; sync(); }
  });

  const sheet = openSheet({ title: existing ? 'Movimento' : 'Novo movimento', body: form, size: 'large' });
  sync();

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const input = form.elements.valor;
    const cents = parseAmount(input.value);
    if (!cents || cents <= 0) {
      const a = form.querySelector('.amount');
      a.classList.remove('shake'); void a.offsetWidth; a.classList.add('shake');
      input.focus();
      return;
    }
    if (!f.categoria) {
      const g = form.querySelector('[data-cats]');
      g.classList.remove('shake'); void g.offsetWidth; g.classList.add('shake');
      return toast('Escolhe uma categoria');
    }
    await saveTx({
      ...(existing || {}),
      tipo: f.tipo,
      valor: cents,
      categoria: f.categoria,
      data: form.elements.data.value || todayKey(),
      nota: form.elements.nota.value.trim(),
    });
    sheet.close('saved');
    toast(`${f.tipo === 'despesa' ? '−' : '+'}${fmtEUR(cents)}`, { icon: '✦' });
  });

  form.querySelector('[data-action=delete]')?.addEventListener('click', async () => {
    if (await confirmDeleteTx(existing)) sheet.close('deleted');
  });
}

export async function confirmDeleteTx(tx) {
  const ok = await actionSheet({
    title: `Apagar ${fmtEUR(tx.valor)}?`,
    actions: [{ label: 'Apagar movimento', destructive: true }],
  });
  if (!ok) return false;
  await deleteTx(tx.id);
  toast('Apagado');
  return true;
}

export function openBudgetForm() {
  const form = el(`
    <form class="form" novalidate>
      <label class="amount">
        <input name="valor" type="text" inputmode="decimal" placeholder="0" value="${prefs.orcamento ? (prefs.orcamento / 100).toString().replace('.', ',') : ''}" aria-label="Orçamento mensal">
        <span class="amount-cur">€</span>
      </label>
      <p class="group-footer center">Quanto queres gastar, no máximo, por mês.<br>Deixa vazio para não usar orçamento.</p>
      <div class="form-actions"><button type="submit" class="btn-primary">Guardar orçamento</button></div>
    </form>`);
  const sheet = openSheet({ title: 'Orçamento mensal', body: form });
  form.addEventListener('submit', (e) => {
    e.preventDefault();
    const v = form.elements.valor.value.trim();
    const cents = v ? parseAmount(v) : 0;
    if (cents == null || cents < 0) return form.elements.valor.focus();
    setPref('orcamento', cents);
    sheet.close('saved');
    window.dispatchEvent(new CustomEvent('prefs-changed'));
    toast(cents ? `Orçamento: ${fmtEUR(cents, { round: true })}/mês` : 'Sem orçamento');
  });
}
