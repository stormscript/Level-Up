// Bottom sheet para criar/editar um objetivo de longo prazo.
import { saveObjective, deleteObjective } from '../state.js';
import { todayKey, addDays } from '../engine/dates.js';
import { suggestMilestones, OBJ_TYPES } from '../engine/objectives.js';
import { fmtValue } from '../engine/goals.js';
import { esc, el } from '../ui/dom.js';
import { openSheet, actionSheet } from '../ui/sheet.js';
import { toast } from '../ui/effects.js';
import { uid } from '../seed.js';

const EMOJIS = ['🎯', '💰', '🚗', '🏠', '✈️', '⚖️', '🏃', '💪', '🎓', '📚', '💼', '🧠', '🎸', '❤️', '🌍', '⭐'];
const num = (v) => {
  const n = parseFloat(String(v ?? '').replace(/\s/g, '').replace(',', '.'));
  return Number.isFinite(n) ? n : null;
};

export function openObjectiveForm(existing = null, { onSaved } = {}) {
  const f = {
    emoji: existing?.emoji || '🎯',
    tipo: existing?.tipo || 'poupanca',
    marcos: (existing?.marcos || []).map((m) => ({ ...m })),
  };

  const form = el(`
    <form class="form" novalidate autocomplete="off">
      <div class="emoji-row" role="radiogroup" aria-label="Ícone">
        ${EMOJIS.map((e) => `<button type="button" class="emoji-opt" data-emoji="${e}">${e}</button>`).join('')}
      </div>
      <div class="group" style="margin-top:12px">
        <div class="cell"><input name="titulo" type="text" maxlength="70" placeholder="Ex.: Juntar 3 000 € para o carro" value="${esc(existing?.titulo || '')}" aria-label="Objetivo" enterkeyhint="next"></div>
      </div>
      <div class="group-header">Porquê <span class="muted">(vais ler isto nos dias maus)</span></div>
      <div class="group"><textarea name="porque" class="notes" rows="2" maxlength="160" placeholder="Ex.: Para não depender de ninguém.">${esc(existing?.porque || '')}</textarea></div>

      <div class="group-header">Tipo</div>
      <div class="pad">
        <div class="segmented" data-field="tipo">
          ${Object.entries(OBJ_TYPES).map(([k, v]) => `<button type="button" data-v="${k}">${v}</button>`).join('')}
        </div>
      </div>
      <p class="group-footer" data-help></p>

      <div class="group" style="margin-top:12px" data-numeric>
        <label class="cell" data-if="inicial"><span class="cell-label" data-inicial-label>Valor atual</span>
          <input name="inicial" type="text" inputmode="decimal" class="input-right" placeholder="0" value="${esc(existing?.inicial ?? '')}"></label>
        <label class="cell"><span class="cell-label">Objetivo</span>
          <input name="alvo" type="text" inputmode="decimal" class="input-right" placeholder="Ex.: 3000" value="${esc(existing?.alvo ?? '')}"></label>
        <label class="cell" data-if="unidade"><span class="cell-label">Unidade</span>
          <input name="unidade" type="text" maxlength="12" class="input-right" placeholder="kg, min, livros…" value="${esc(existing?.tipo === 'poupanca' ? '' : existing?.unidade || '')}"></label>
      </div>

      <div class="group-header">Prazo</div>
      <div class="group">
        <label class="cell"><span class="cell-label">Até</span><input type="date" name="prazo" value="${esc(existing?.prazo || addDays(todayKey(), 90))}"></label>
      </div>

      <div class="group-header" data-marcos-title>Marcos</div>
      <div class="group" data-marcos-list></div>
      <div class="marco-add">
        <input type="text" name="marco" placeholder="+ Adicionar marco" enterkeyhint="done" aria-label="Novo marco">
        <button type="button" class="pill-btn" data-action="suggest">Sugerir</button>
      </div>

      <div class="form-actions">
        <button type="submit" class="btn-primary">${existing ? 'Guardar' : 'Criar objetivo'}</button>
        ${existing ? '<button type="button" class="btn-destructive" data-action="delete">Apagar objetivo</button>' : ''}
      </div>
    </form>`);

  const HELP = {
    acumular: 'Vais somando (ex.: livros lidos, horas de estudo). As metas do mês com a mesma unidade também contam.',
    poupanca: 'Conta sozinho com as Finanças: o que já tens + receitas − despesas desde hoje.',
    medicao: 'Registas o valor de vez em quando (peso, tempo, média). Pode ser para subir ou descer.',
    feito: 'Um objetivo de sim ou não, dividido em passos (os marcos).',
  };

  const unit = () => (f.tipo === 'poupanca' ? '€' : form.elements.unidade.value.trim());
  const renderMarcos = () => {
    const list = form.querySelector('[data-marcos-list]');
    const numeric = f.tipo !== 'feito';
    const items = numeric ? [...f.marcos].sort((a, b) => a.valor - b.valor) : f.marcos;
    list.hidden = !items.length;
    list.innerHTML = items.map((m) => `
      <div class="cell">
        <span class="cell-label">${numeric ? esc(fmtValue(m.valor, unit())) : esc(m.titulo)}${numeric && m.titulo ? ` · ${esc(m.titulo)}` : ''}</span>
        <button type="button" class="icon-btn small" data-del="${esc(m.id)}" aria-label="Apagar marco">×</button>
      </div>`).join('');
    form.querySelector('[data-action=suggest]').hidden = !numeric;
    form.elements.marco.setAttribute('inputmode', numeric ? 'decimal' : 'text');
    form.elements.marco.placeholder = numeric ? '+ Marco (valor)' : '+ Passo (ex.: Exame de código)';
    form.querySelector('[data-marcos-title]').textContent = numeric ? 'Marcos' : 'Passos';
  };
  const sync = () => {
    form.querySelectorAll('[data-emoji]').forEach((b) => b.setAttribute('aria-checked', String(b.dataset.emoji === f.emoji)));
    form.querySelectorAll('[data-field=tipo] [data-v]').forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.v === f.tipo)));
    form.querySelector('[data-help]').textContent = HELP[f.tipo];
    form.querySelector('[data-numeric]').hidden = f.tipo === 'feito';
    form.querySelector('[data-if=inicial]').hidden = f.tipo === 'acumular';
    form.querySelector('[data-if=unidade]').hidden = f.tipo === 'poupanca';
    form.querySelector('[data-inicial-label]').textContent = f.tipo === 'poupanca' ? 'Já tens poupado (€)' : 'Valor atual';
    form.elements.alvo.placeholder = f.tipo === 'poupanca' ? 'Ex.: 3000' : f.tipo === 'medicao' ? 'Ex.: 75' : 'Ex.: 12';
    renderMarcos();
  };

  const addMarco = () => {
    const v = form.elements.marco.value.trim();
    if (!v) return;
    if (f.tipo === 'feito') f.marcos.push({ id: uid(), titulo: v, feito: false });
    else {
      const n = num(v);
      if (n == null) return toast('Escreve um número');
      f.marcos.push({ id: uid(), valor: n });
    }
    form.elements.marco.value = '';
    renderMarcos();
  };

  form.addEventListener('click', (e) => {
    const em = e.target.closest('[data-emoji]');
    if (em) { f.emoji = em.dataset.emoji; return sync(); }
    const opt = e.target.closest('[data-field=tipo] [data-v]');
    if (opt) {
      if (opt.dataset.v !== f.tipo && (opt.dataset.v === 'feito') !== (f.tipo === 'feito')) f.marcos = [];
      f.tipo = opt.dataset.v;
      return sync();
    }
    const del = e.target.closest('[data-del]');
    if (del) { f.marcos = f.marcos.filter((m) => m.id !== del.dataset.del); return renderMarcos(); }
    if (e.target.closest('[data-action=suggest]')) {
      const alvo = num(form.elements.alvo.value);
      if (alvo == null) return toast('Escreve primeiro o objetivo');
      const vals = suggestMilestones({ tipo: f.tipo, alvo, inicial: num(form.elements.inicial.value) || 0 });
      f.marcos = [...vals, alvo].filter((v, i, a) => a.indexOf(v) === i).map((valor) => ({ id: uid(), valor }));
      return renderMarcos();
    }
  });
  form.elements.marco.addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); addMarco(); } });
  form.elements.unidade.addEventListener('input', renderMarcos);

  const sheet = openSheet({ title: existing ? 'Editar objetivo' : 'Novo objetivo', body: form, size: 'large' });
  sync();

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const shake = (input) => { const g = input.closest('.group'); g.classList.remove('shake'); void g.offsetWidth; g.classList.add('shake'); input.focus(); };
    const titulo = form.elements.titulo.value.trim();
    if (!titulo) return shake(form.elements.titulo);
    if (form.elements.marco.value.trim()) addMarco();
    const alvo = num(form.elements.alvo.value);
    const inicial = num(form.elements.inicial.value) ?? 0;
    if (f.tipo !== 'feito') {
      if (alvo == null) return shake(form.elements.alvo);
      if (f.tipo !== 'medicao' && alvo <= inicial) return toast('O objetivo tem de ser maior do que o ponto de partida');
      if (f.tipo === 'medicao' && alvo === inicial) return toast('O objetivo tem de ser diferente do valor atual');
    }
    const prazo = form.elements.prazo.value;
    if (!prazo || prazo <= todayKey()) return toast('Escolhe um prazo no futuro');
    const saved = await saveObjective({
      ...(existing || {}),
      emoji: f.emoji,
      titulo,
      porque: form.elements.porque.value.trim(),
      tipo: f.tipo,
      alvo: f.tipo === 'feito' ? 1 : alvo,
      inicial: f.tipo === 'acumular' || f.tipo === 'feito' ? 0 : inicial,
      unidade: unit(),
      prazo,
      marcos: f.marcos,
    });
    sheet.close('saved');
    toast(existing ? 'Guardado' : 'Objetivo criado. Vamos a isso.', { icon: '✦' });
    onSaved?.(saved);
  });

  form.querySelector('[data-action=delete]')?.addEventListener('click', async () => {
    const ok = await actionSheet({
      title: `Apagar "${existing.titulo}"?`,
      message: 'As metas ligadas a este objetivo ficam soltas (não são apagadas).',
      actions: [{ label: 'Apagar objetivo', destructive: true }],
    });
    if (!ok) return;
    await deleteObjective(existing.id);
    sheet.close('deleted');
    toast('Apagado');
  });
}
