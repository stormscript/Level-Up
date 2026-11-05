// Detalhe de uma meta: progresso, registar, histórico, metas semanais.
import { state, goalCtx, saveGoal, addGoalEntry, removeGoalEntry, subscribe } from '../state.js';
import { todayKey, formatRelative, monthLabel } from '../engine/dates.js';
import { progress, childrenOf, weekLabel, fmtValue } from '../engine/goals.js';
import { esc, el } from '../ui/dom.js';
import { openSheet } from '../ui/sheet.js';
import { toast, glow, play } from '../ui/effects.js';
import { openGoalForm, confirmDeleteGoal } from './goalForm.js';

const MODE_TEXT = {
  manual: 'Progresso registado à mão.',
  habito: 'Conta sozinho a partir do hábito',
  poupanca: 'Conta sozinho: receitas − despesas das Finanças.',
};

export function openGoalSheet(goalId) {
  const body = el('<div class="goal-detail"></div>');
  let unsub = null;
  const sheet = openSheet({ title: 'Meta', body, leftLabel: 'Fechar', size: 'large', onClose: () => unsub?.() });

  function render() {
    const g = state.goals.find((x) => x.id === goalId);
    if (!g) return sheet.close('gone');
    const p = progress(g, goalCtx());
    const habit = g.modo === 'habito' ? state.habits.find((h) => h.id === g.habitId) : null;
    const period = g.tipo === 'mes' ? monthLabel(`${g.periodo}-01`) : weekLabel(g.periodo);
    const kids = g.tipo === 'mes' ? childrenOf(state.goals, g) : [];
    const parent = g.paiId ? state.goals.find((x) => x.id === g.paiId) : null;
    const manual = g.medida !== 'feito' && (g.modo || 'manual') === 'manual';

    body.innerHTML = `
      <div class="gd-head">
        <div class="caps">${g.tipo === 'mes' ? 'Meta do mês' : 'Meta da semana'} · ${esc(period)}</div>
        <h2>${esc(g.titulo)}</h2>
        ${parent ? `<p class="muted small">Faz parte de: ${esc(parent.titulo)}</p>` : ''}
      </div>

      ${g.medida === 'feito'
        ? `<button type="button" class="big-toggle ${g.feito ? 'on' : ''}" data-action="toggle">
             <span class="ring">${g.feito ? '✓' : ''}</span>${g.feito ? 'Feito ✦' : 'Marcar como feito'}</button>`
        : `<div class="gd-progress">
             <div class="gd-value"><b>${esc(fmtValue(p.value))}</b><span>/ ${esc(fmtValue(p.target, g.unidade))}</span></div>
             <div class="bar big"><i style="width:${(p.pct * 100).toFixed(1)}%"></i></div>
             <div class="gd-sub"><span>${Math.round(p.pct * 100)}%</span><span>${p.done ? 'Cumprida ✦' : `faltam ${esc(fmtValue(Math.max(0, p.target - p.value), g.unidade))}`}</span></div>
           </div>
           <p class="group-footer">${esc(MODE_TEXT[g.modo || 'manual'])}${habit ? ` "${esc(habit.nome)}".` : ''}</p>`}

      ${manual ? `
        <div class="group-header">Registar</div>
        <form class="add-entry" novalidate>
          <input name="valor" type="text" inputmode="decimal" placeholder="${g.unidade === '€' ? 'Ex.: 20' : 'Ex.: 1'}" aria-label="Valor a somar" enterkeyhint="done">
          ${g.unidade ? `<span class="unit">${esc(g.unidade)}</span>` : ''}
          <button type="submit" class="btn-primary small">Somar</button>
        </form>
        ${(g.registos || []).length ? `
          <div class="group" style="margin-top:12px">
            ${[...g.registos].reverse().map((r) => `
              <div class="cell entry-row">
                <span class="cell-label">${esc(formatRelative(r.data))}</span>
                <b>${r.valor > 0 ? '+' : ''}${esc(fmtValue(r.valor, g.unidade))}</b>
                <button type="button" class="icon-btn small" data-remove="${esc(r.id)}" aria-label="Apagar registo">×</button>
              </div>`).join('')}
          </div>` : ''}` : ''}

      ${g.tipo === 'mes' ? `
        <div class="group-header">Metas da semana</div>
        ${kids.length ? `<div class="group">${kids.map((k) => {
          const kp = progress(k, goalCtx());
          return `<button type="button" class="cell child-goal" data-open="${esc(k.id)}">
            <div class="cg-body"><div>${esc(k.titulo)}</div><div class="muted small">${esc(weekLabel(k.periodo))}</div></div>
            <span class="${kp.done ? 'hot' : 'muted'} small">${k.medida === 'feito' ? (kp.done ? 'Feito ✦' : 'Por fazer') : `${esc(fmtValue(kp.value))} / ${esc(fmtValue(kp.target, k.unidade))}`}</span>
          </button>`;
        }).join('')}</div>` : '<p class="group-footer">Ainda sem metas semanais ligadas a esta.</p>'}
        <div class="pad" style="margin-top:10px"><button type="button" class="btn-secondary" data-action="add-week">+ Meta desta semana para isto</button></div>` : ''}

      <div class="form-actions">
        <button type="button" class="btn-secondary" data-action="edit">Editar</button>
        <button type="button" class="btn-destructive" data-action="delete">Apagar meta</button>
      </div>`;
  }

  body.addEventListener('click', async (e) => {
    const g = state.goals.find((x) => x.id === goalId);
    if (!g) return;
    const t = e.target.closest('[data-action],[data-remove],[data-open]');
    if (!t) return;
    if (t.dataset.remove) return removeGoalEntry(g, t.dataset.remove);
    if (t.dataset.open) return openGoalSheet(t.dataset.open);
    const a = t.dataset.action;
    if (a === 'toggle') {
      await saveGoal({ ...g, feito: !g.feito });
      if (!g.feito) { glow(); play('closed'); toast('Meta cumprida.', { icon: '✦' }); }
    }
    if (a === 'edit') openGoalForm(g);
    if (a === 'delete' && (await confirmDeleteGoal(g))) sheet.close('deleted');
    if (a === 'add-week') openGoalForm(null, { tipo: 'semana', paiId: g.id });
  });

  body.addEventListener('submit', async (e) => {
    e.preventDefault();
    const g = state.goals.find((x) => x.id === goalId);
    const input = e.target.elements.valor;
    const v = parseFloat(String(input.value).replace(/\s/g, '').replace(',', '.'));
    if (!Number.isFinite(v) || v === 0) { input.focus(); return; }
    const before = progress(g, goalCtx()).done;
    await addGoalEntry(g, v, todayKey());
    input.value = '';
    const after = progress(state.goals.find((x) => x.id === goalId), goalCtx()).done;
    if (!before && after) { glow(); play('closed'); toast('Meta cumprida.', { icon: '✦' }); }
    else toast(`${v > 0 ? '+' : ''}${fmtValue(v, g.unidade)}`);
  });

  unsub = subscribe(render);
  render();
}
