// Bottom sheet para criar/editar uma meta (mensal ou semanal).
import { state, saveGoal, deleteGoal } from '../state.js';
import { todayKey, monthLabel, addDays } from '../engine/dates.js';
import { currentPeriod, shiftPeriod, goalsFor, weekLabel } from '../engine/goals.js';
import { esc, el } from '../ui/dom.js';
import { openSheet, actionSheet } from '../ui/sheet.js';
import { toast } from '../ui/effects.js';

const periodName = (tipo, p) => (tipo === 'mes' ? monthLabel(`${p}-01`) : weekLabel(p));

export function openGoalForm(existing = null, { tipo = 'mes', periodo = null, paiId = null, onSaved } = {}) {
  const today = todayKey();
  const f = {
    tipo: existing?.tipo || tipo,
    periodo: existing?.periodo || periodo || currentPeriod(tipo, today),
    titulo: existing?.titulo || '',
    medida: existing?.medida || 'numero',
    alvo: existing?.alvo ?? '',
    unidade: existing?.unidade || '',
    modo: existing?.modo || 'manual',
    habitId: existing?.habitId || state.habits[0]?.id || '',
    paiId: existing?.paiId ?? paiId ?? '',
  };

  const form = el(`
    <form class="form" novalidate autocomplete="off">
      ${existing ? '' : `
      <div class="pad">
        <div class="segmented" data-field="tipo">
          <button type="button" data-v="mes">Meta do mês</button>
          <button type="button" data-v="semana">Meta da semana</button>
        </div>
      </div>`}
      <div class="group" style="margin-top:14px">
        <div class="cell"><input name="titulo" type="text" maxlength="70" enterkeyhint="done" placeholder="Ex.: Poupar 300 €" value="${esc(f.titulo)}" aria-label="Título"></div>
      </div>

      <div class="group-header">Período</div>
      <div class="pad"><div class="segmented" data-period></div></div>

      <div class="group-header">Como se mede</div>
      <div class="pad">
        <div class="segmented" data-field="medida">
          <button type="button" data-v="numero">Número</button>
          <button type="button" data-v="feito">Sim / Não</button>
        </div>
      </div>

      <div data-show-medida="numero">
        <div class="group" style="margin-top:12px">
          <label class="cell"><span class="cell-label">Objetivo</span>
            <input name="alvo" type="text" inputmode="decimal" class="input-right" placeholder="Ex.: 300" value="${esc(f.alvo)}"></label>
          <label class="cell" data-unit><span class="cell-label">Unidade</span>
            <input name="unidade" type="text" class="input-right" maxlength="14" placeholder="€, páginas, vezes…" value="${esc(f.unidade)}"></label>
        </div>

        <div class="group-header">Progresso</div>
        <div class="pad">
          <div class="segmented" data-field="modo">
            <button type="button" data-v="manual">À mão</button>
            <button type="button" data-v="habito">De um hábito</button>
            <button type="button" data-v="poupanca">Poupança</button>
          </div>
        </div>
        <p class="group-footer" data-mode-help></p>
        <div class="group" data-show-modo="habito" style="margin-top:10px">
          <label class="cell"><span class="cell-label">Hábito</span>
            <select name="habitId" class="select-right">
              ${state.habits.length ? state.habits.map((h) => `<option value="${esc(h.id)}" ${h.id === f.habitId ? 'selected' : ''}>${esc(h.nome)}</option>`).join('') : '<option value="">Cria primeiro um hábito</option>'}
            </select></label>
        </div>
      </div>

      <div data-show-tipo="semana">
        <div class="group-header">Faz parte de</div>
        <div class="group">
          <label class="cell"><span class="cell-label">Meta do mês</span>
            <select name="paiId" class="select-right"></select></label>
        </div>
        <p class="group-footer">Ligar ajuda a ver como a semana contribui para o mês.</p>
      </div>

      <div class="form-actions">
        <button type="submit" class="btn-primary">${existing ? 'Guardar' : 'Criar meta'}</button>
        ${existing ? '<button type="button" class="btn-destructive" data-action="delete">Apagar meta</button>' : ''}
      </div>
    </form>`);

  const HELP = {
    manual: 'Vais registando o progresso (ex.: +40 páginas).',
    habito: 'Conta sozinho as vezes que marcas o hábito neste período.',
    poupanca: 'Conta sozinho: receitas − despesas das Finanças neste período (€).',
  };

  const sync = () => {
    form.querySelectorAll('[data-field]').forEach((g) => g.querySelectorAll('[data-v]').forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.v === f[g.dataset.field]))));
    // Período: este / próximo
    const cur = currentPeriod(f.tipo, today);
    if (!existing && f.periodo !== cur && f.periodo !== shiftPeriod(f.tipo, cur, 1)) f.periodo = cur;
    const opts = existing ? [f.periodo] : [cur, shiftPeriod(f.tipo, cur, 1)];
    form.querySelector('[data-period]').innerHTML = opts
      .map((p, i) => `<button type="button" data-p="${p}" aria-pressed="${p === f.periodo}">${existing ? esc(periodName(f.tipo, p)) : i === 0 ? (f.tipo === 'mes' ? 'Este mês' : 'Esta semana') : (f.tipo === 'mes' ? 'Próximo mês' : 'Próxima semana')}</button>`)
      .join('');
    form.querySelectorAll('[data-show-medida]').forEach((s) => (s.hidden = s.dataset.showMedida !== f.medida));
    form.querySelectorAll('[data-show-modo]').forEach((s) => (s.hidden = s.dataset.showModo !== f.modo));
    form.querySelectorAll('[data-show-tipo]').forEach((s) => (s.hidden = s.dataset.showTipo !== f.tipo));
    form.querySelector('[data-mode-help]').textContent = HELP[f.modo];
    form.querySelector('[data-unit]').hidden = f.modo === 'poupanca';
    // Metas do mês onde cai a semana
    if (f.tipo === 'semana') {
      // Uma semana pode atravessar dois meses.
      const months = [f.periodo.slice(0, 7), addDays(f.periodo, 6).slice(0, 7)];
      const parents = state.goals.filter((g) => g.tipo === 'mes' && months.includes(g.periodo));
      form.elements.paiId.innerHTML = `<option value="">Nenhuma</option>${parents.map((g) => `<option value="${esc(g.id)}" ${g.id === f.paiId ? 'selected' : ''}>${esc(g.titulo)}</option>`).join('')}`;
    }
  };

  form.addEventListener('click', (e) => {
    const opt = e.target.closest('[data-field] [data-v]');
    if (opt) {
      const field = opt.closest('[data-field]').dataset.field;
      f[field] = opt.dataset.v;
      if (field === 'tipo') f.periodo = currentPeriod(f.tipo, today);
      if (field === 'modo' && f.modo === 'poupanca') form.elements.unidade.value = '€';
      return sync();
    }
    const p = e.target.closest('[data-p]');
    if (p) { f.periodo = p.dataset.p; sync(); }
  });
  form.elements.paiId.addEventListener('change', (e) => (f.paiId = e.target.value));
  form.elements.habitId.addEventListener('change', (e) => (f.habitId = e.target.value));

  const sheet = openSheet({ title: existing ? 'Editar meta' : 'Nova meta', body: form, size: 'large' });
  sync();

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const titulo = form.elements.titulo.value.trim();
    const shake = (input) => { const g = input.closest('.group'); g.classList.remove('shake'); void g.offsetWidth; g.classList.add('shake'); input.focus(); };
    if (!titulo) return shake(form.elements.titulo);
    const alvo = parseFloat(String(form.elements.alvo.value).replace(',', '.'));
    if (f.medida === 'numero' && !(alvo > 0)) return shake(form.elements.alvo);
    if (f.medida === 'numero' && f.modo === 'habito' && !f.habitId) return toast('Cria primeiro um hábito');
    const g = {
      ...(existing || { registos: [] }),
      tipo: f.tipo,
      periodo: f.periodo,
      titulo,
      medida: f.medida,
      alvo: f.medida === 'numero' ? alvo : 1,
      unidade: f.medida === 'numero' ? (f.modo === 'poupanca' ? '€' : form.elements.unidade.value.trim()) : '',
      modo: f.medida === 'numero' ? f.modo : 'manual',
      habitId: f.modo === 'habito' ? f.habitId : null,
      paiId: f.tipo === 'semana' ? f.paiId || null : null,
    };
    delete g.seed;
    const saved = await saveGoal(g);
    sheet.close('saved');
    toast(existing ? 'Guardado' : 'Meta criada', { icon: '✦' });
    onSaved?.(saved);
  });

  form.querySelector('[data-action=delete]')?.addEventListener('click', async () => {
    if (await confirmDeleteGoal(existing)) sheet.close('deleted');
  });
}

export async function confirmDeleteGoal(goal) {
  const ok = await actionSheet({
    title: `Apagar "${goal.titulo}"?`,
    message: goal.tipo === 'mes' ? 'As metas semanais ligadas a esta ficam soltas.' : '',
    actions: [{ label: 'Apagar meta', destructive: true }],
  });
  if (!ok) return false;
  await deleteGoal(goal.id);
  toast('Apagada');
  return true;
}

export { goalsFor };
