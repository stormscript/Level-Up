// Bottom sheet para criar/editar um hábito.
import { saveHabit, deleteHabit, state } from '../state.js';
import { HABIT_TEMPLATES, MOMENTOS } from '../engine/habits.js';
import { esc, el } from '../ui/dom.js';
import { openSheet, actionSheet } from '../ui/sheet.js';
import { toast } from '../ui/effects.js';

const WEEKDAYS = ['Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb', 'Dom'];
const num = (v) => {
  const n = parseFloat(String(v ?? '').replace(/\s/g, '').replace(',', '.'));
  return Number.isFinite(n) ? n : null;
};

export function openHabitForm(existing = null) {
  const r = existing?.recorrencia || {};
  const f = {
    tipo: existing?.tipo || 'fazer',
    freq: r.tipo || 'diario',
    dias: r.dias ? [...r.dias] : [1, 2, 3, 4, 5],
    n: r.n || 3,
    momento: existing?.momento ?? '',
    qty: !!existing?.quantidade,
    tolerancia: existing ? !!existing.tolerancia : true,
  };

  const templates = existing ? '' : `
    <div class="group-header">Sugestões <span class="muted">(um toque preenche tudo)</span></div>
    <div class="tpl-row">${HABIT_TEMPLATES.filter((t) => !state.habits.some((h) => h.nome === t.nome))
      .map((t, i) => `<button type="button" class="tpl" data-tpl="${HABIT_TEMPLATES.indexOf(t)}">${t.tipo === 'evitar' ? '⊘ ' : ''}${esc(t.nome)}</button>`).join('')}</div>`;

  const form = el(`
    <form class="form" novalidate autocomplete="off">
      ${templates}
      <div class="group" style="margin-top:12px">
        <div class="cell"><input name="nome" type="text" maxlength="60" enterkeyhint="done"
          placeholder="Ex.: Ler 20 páginas" value="${esc(existing?.nome || '')}" aria-label="Nome do hábito"></div>
      </div>

      <div class="group-header">Tipo</div>
      <div class="pad">
        <div class="segmented" data-field="tipo">
          <button type="button" data-v="fazer">Criar um hábito</button>
          <button type="button" data-v="evitar">Deixar um hábito</button>
        </div>
      </div>
      <p class="group-footer" data-tipo-help></p>

      <div data-if="fazer">
        <div class="group-header">Frequência</div>
        <div class="pad">
          <div class="segmented" data-field="freq">
            <button type="button" data-v="diario">Todos os dias</button>
            <button type="button" data-v="dias">Dias</button>
            <button type="button" data-v="xPorSemana">X / semana</button>
          </div>
        </div>
        <div class="pad weekdays" data-show-freq="dias">
          ${WEEKDAYS.map((d, i) => `<button type="button" class="wd" data-d="${i + 1}" aria-label="${d}">${d}</button>`).join('')}
        </div>
        <div class="group stepper-group" data-show-freq="xPorSemana">
          <div class="cell">
            <span class="cell-label"><b class="n-val">${f.n}</b> vezes por semana</span>
            <div class="stepper">
              <button type="button" data-step="-1" aria-label="Menos">−</button>
              <button type="button" data-step="1" aria-label="Mais">+</button>
            </div>
          </div>
        </div>

        <div class="group-header">Momento do dia</div>
        <div class="pad">
          <div class="segmented" data-field="momento">
            ${Object.entries(MOMENTOS).map(([k, v]) => `<button type="button" data-v="${k}">${k ? v : 'Qualquer'}</button>`).join('')}
          </div>
        </div>

        <div class="group" style="margin-top:14px">
          <label class="cell"><span class="cell-label">Com quantidade <span class="muted small">(copos, páginas…)</span></span><input type="checkbox" class="switch" name="qty" ${f.qty ? 'checked' : ''}></label>
          <label class="cell" data-if-qty><span class="cell-label">Alvo por dia</span><input name="alvo" type="text" inputmode="decimal" class="input-right" placeholder="8" value="${esc(existing?.quantidade?.alvo ?? '')}"></label>
          <label class="cell" data-if-qty><span class="cell-label">Unidade</span><input name="unidade" type="text" maxlength="12" class="input-right" placeholder="copos" value="${esc(existing?.quantidade?.unidade ?? '')}"></label>
          <label class="cell" data-if-qty><span class="cell-label">Cada toque soma</span><input name="passo" type="text" inputmode="decimal" class="input-right" placeholder="1" value="${esc(existing?.quantidade?.passo ?? '')}"></label>
        </div>

        <div class="group-header">Versão mínima <span class="muted">(para os dias maus)</span></div>
        <div class="group"><div class="cell"><input name="minimo" type="text" maxlength="50" placeholder="Ex.: Ler 1 página · 10 flexões" value="${esc(existing?.minimo || '')}" aria-label="Versão mínima"></div></div>
        <p class="group-footer">Num dia difícil marcas "fiz o mínimo": conta para a sequência. O importante é nunca ficar a zero.</p>

        <div class="group" style="margin-top:10px">
          <label class="cell"><span class="cell-label">Nunca falhar duas vezes</span><input type="checkbox" class="switch" name="tolerancia" ${f.tolerancia ? 'checked' : ''}></label>
        </div>
        <p class="group-footer">Uma falha isolada não apaga a sequência. Duas seguidas, sim.</p>
      </div>

      <div class="form-actions">
        <button type="submit" class="btn-primary">${existing ? 'Guardar' : 'Criar hábito'}</button>
        ${existing ? '<button type="button" class="btn-destructive" data-action="delete">Apagar hábito</button>' : ''}
      </div>
    </form>`);

  const sync = () => {
    form.querySelectorAll('[data-field]').forEach((g) => g.querySelectorAll('[data-v]').forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.v === f[g.dataset.field]))));
    form.querySelectorAll('[data-show-freq]').forEach((s) => (s.hidden = s.dataset.showFreq !== f.freq));
    form.querySelectorAll('.wd').forEach((b) => b.setAttribute('aria-pressed', String(f.dias.includes(+b.dataset.d))));
    form.querySelector('.n-val').textContent = f.n;
    form.querySelector('[data-if=fazer]').hidden = f.tipo !== 'fazer';
    form.querySelectorAll('[data-if-qty]').forEach((c) => (c.hidden = !f.qty));
    form.querySelector('[data-tipo-help]').textContent = f.tipo === 'evitar'
      ? 'Todos os dias contam como "limpos" até marcares um deslize. Vês os dias seguidos sem ele.'
      : 'Algo que queres fazer com regularidade.';
  };

  form.addEventListener('click', (e) => {
    const tpl = e.target.closest('[data-tpl]');
    if (tpl) {
      const t = HABIT_TEMPLATES[+tpl.dataset.tpl];
      form.elements.nome.value = t.nome;
      f.tipo = t.tipo || 'fazer';
      f.freq = t.recorrencia?.tipo || 'diario';
      if (t.recorrencia?.n) f.n = t.recorrencia.n;
      f.momento = t.momento || '';
      f.qty = !!t.quantidade;
      form.elements.qty.checked = f.qty;
      form.elements.alvo.value = t.quantidade?.alvo ?? '';
      form.elements.unidade.value = t.quantidade?.unidade ?? '';
      form.elements.passo.value = t.quantidade?.passo ?? '';
      form.elements.minimo.value = t.minimo || '';
      form.querySelectorAll('[data-tpl]').forEach((b) => b.classList.toggle('on', b === tpl));
      return sync();
    }
    const opt = e.target.closest('[data-field] [data-v]');
    if (opt) { f[opt.closest('[data-field]').dataset.field] = opt.dataset.v; return sync(); }
    const wd = e.target.closest('.wd');
    if (wd) {
      const d = +wd.dataset.d;
      f.dias = f.dias.includes(d) ? f.dias.filter((x) => x !== d) : [...f.dias, d].sort();
      return sync();
    }
    const st = e.target.closest('[data-step]');
    if (st) { f.n = Math.min(7, Math.max(1, f.n + +st.dataset.step)); return sync(); }
  });
  form.elements.qty.addEventListener('change', (e) => { f.qty = e.target.checked; sync(); });

  const sheet = openSheet({ title: existing ? 'Editar hábito' : 'Novo hábito', body: form, size: 'large' });
  sync();

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const shake = (input) => { const g = input.closest('.group'); g.classList.remove('shake'); void g.offsetWidth; g.classList.add('shake'); input.focus(); };
    const nome = form.elements.nome.value.trim();
    if (!nome) return shake(form.elements.nome);
    const h = { ...(existing || {}), nome, tipo: f.tipo };
    if (f.tipo === 'evitar') {
      h.recorrencia = { tipo: 'diario' };
      delete h.quantidade; delete h.minimo; delete h.momento;
      h.tolerancia = false;
    } else {
      if (f.freq === 'dias' && f.dias.length === 0) return toast('Escolhe pelo menos um dia');
      h.recorrencia = f.freq === 'dias' ? { tipo: 'dias', dias: f.dias } : f.freq === 'xPorSemana' ? { tipo: 'xPorSemana', n: f.n } : { tipo: 'diario' };
      h.momento = f.momento;
      h.minimo = form.elements.minimo.value.trim();
      h.tolerancia = form.elements.tolerancia.checked;
      if (f.qty) {
        const alvo = num(form.elements.alvo.value);
        if (!(alvo > 0)) return shake(form.elements.alvo);
        h.quantidade = { alvo, unidade: form.elements.unidade.value.trim(), passo: num(form.elements.passo.value) || 1 };
      } else delete h.quantidade;
    }
    delete h.seed;
    await saveHabit(h);
    sheet.close('saved');
    toast(existing ? 'Guardado' : f.tipo === 'evitar' ? 'Contador de dias limpos a correr ✦' : 'Hábito criado', { icon: '✦' });
  });

  form.querySelector('[data-action=delete]')?.addEventListener('click', async () => {
    if (await confirmDeleteHabit(existing)) sheet.close('deleted');
  });
}

export async function confirmDeleteHabit(habit) {
  const ok = await actionSheet({
    title: `Apagar "${habit.nome}"?`,
    message: 'O histórico deste hábito também é apagado. Se for só uma fase, usa "Pausar".',
    actions: [{ label: 'Apagar hábito', destructive: true }],
  });
  if (!ok) return false;
  await deleteHabit(habit.id);
  toast('Apagado');
  return true;
}
