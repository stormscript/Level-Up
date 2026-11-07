// Detalhe de um objetivo: progresso, gráfico do ritmo, "precisas de", marcos, registos e metas ligadas.
import { state, subscribe, goalCtx, saveGoal, addObjectiveEntry, removeObjectiveEntry, toggleObjectiveStep, saveObjective } from '../state.js';
import { todayKey, daysBetween, addDays, formatRelative, fromKey, monthLabel, shortDate, longDate } from '../engine/dates.js';
import { objProgress, pace, series, milestones, direction } from '../engine/objectives.js';
import { progress, fmtValue, weekLabel, currentPeriod } from '../engine/goals.js';
import { lineChart } from '../ui/charts.js';
import { esc, el } from '../ui/dom.js';
import { openSheet } from '../ui/sheet.js';
import { toast, glow, play } from '../ui/effects.js';
import { openObjectiveForm } from './objectiveForm.js';
import { openGoalSheet } from './goalSheet.js';

const fmtDate = (key) => longDate(key);
const fmtShort = (key) => shortDate(key);
const monthYear = (key) => new Intl.DateTimeFormat('pt-PT', { month: 'long', year: 'numeric' }).format(fromKey(key));
const monthShort = (key) => new Intl.DateTimeFormat('pt-PT', { month: 'short' }).format(fromKey(key)).replace('.', '');

export function chartFor(o, today = todayKey()) {
  const ctx = goalCtx();
  const s = series(o, ctx, today);
  const p = pace(o, ctx, today);
  const xMax = Math.max(1, daysBetween(o.inicio, o.prazo));
  const points = s.map((pt) => ({ x: daysBetween(o.inicio, pt.d), y: pt.v }));
  const ideal = [{ x: 0, y: p.start }, { x: xMax, y: p.target }];
  const xToday = Math.min(xMax, daysBetween(o.inicio, today));
  let projection = null;
  if (p.forecast && points.length) {
    const fx = daysBetween(o.inicio, p.forecast);
    if (fx <= xMax) projection = [{ x: xToday, y: p.value }, { x: fx, y: p.target }];
    else projection = [{ x: xToday, y: p.value }, { x: xMax, y: p.value + ((p.target - p.value) * (xMax - xToday)) / Math.max(1, fx - xToday) }];
  }
  const mid = addDays(o.inicio, Math.round(xMax / 2));
  const labels = [{ x: 0, text: monthShort(o.inicio) }, { x: xMax / 2, text: monthShort(mid) }, { x: xMax, text: monthShort(o.prazo) }];
  const marks = milestones(o, ctx, today).map((m) => ({ y: m.valor, reached: m.reached }));
  return lineChart({ points, ideal, projection, xMax, target: p.target, labels, marks, stepped: o.tipo === 'medicao' });
}

export function openObjectiveSheet(id) {
  const body = el('<div class="goal-detail obj-detail"></div>');
  let unsub = null;
  const sheet = openSheet({ title: 'Objetivo', body, leftLabel: 'Fechar', size: 'large', onClose: () => unsub?.() });

  function render() {
    const o = state.objectives.find((x) => x.id === id);
    if (!o) return sheet.close('gone');
    const today = todayKey();
    const ctx = goalCtx();
    const p = o.tipo === 'feito' ? objProgress(o, ctx, today) : pace(o, ctx, today);
    const ms = milestones(o, ctx, today);
    const u = o.unidade || '';
    const linked = state.goals.filter((g) => g.objetivoId === o.id).sort((a, b) => (a.periodo < b.periodo ? 1 : -1));
    const daysLeft = daysBetween(today, o.prazo);
    const dir = direction(o);
    const monthGoal = state.goals.find((g) => g.objetivoId === o.id && g.tipo === 'mes' && g.periodo === currentPeriod('mes', today));

    let main = '';
    if (o.tipo === 'feito') {
      main = `
        <div class="gd-progress">
          <div class="gd-value"><b>${Math.round(p.pct * 100)}%</b><span>${ms.filter((m) => m.reached).length} de ${ms.length} passos</span></div>
          <div class="bar big"><i style="width:${(p.pct * 100).toFixed(1)}%"></i></div>
        </div>
        <div class="group-header">Passos</div>
        <div class="group">${ms.map((m) => `
          <button type="button" class="cell step-row ${m.reached ? 'done' : ''}" data-step="${esc(m.id)}">
            <span class="step-check">${m.reached ? '✓' : ''}</span><span class="cell-label">${esc(m.titulo)}</span>
            <span class="muted small">${m.date ? esc(fmtShort(m.date)) : ''}</span>
          </button>`).join('') || '<p class="group-footer">Sem passos. Edita o objetivo para os acrescentar.</p>'}</div>
        <div class="pad" style="margin-top:12px">
          <button type="button" class="big-toggle ${o.feito ? 'on' : ''}" data-action="toggle-done"><span class="ring">${o.feito ? '✓' : ''}</span>${o.feito ? 'Objetivo cumprido ✦' : 'Marcar objetivo como cumprido'}</button>
        </div>`;
    } else {
      const paceText = p.done ? 'Objetivo cumprido ✦'
        : p.late ? 'O prazo passou. Ajusta o prazo ou continua.'
        : p.elapsed < 1 ? 'Começou hoje.'
        : p.ahead ? `✦ À frente do ritmo: ${dir > 0 ? '+' : '−'}${fmtValue(Math.abs(p.diff), u)}`
        : `Atrás do ritmo: ${fmtValue(Math.abs(p.diff), u)}`;
      main = `
        <div class="gd-progress">
          <div class="gd-value"><b>${esc(fmtValue(p.value))}</b><span>${esc(u)} → ${esc(fmtValue(p.target, u))}</span></div>
          <span class="pace-pill ${p.ahead || p.done ? 'ahead' : 'behind'}">${esc(paceText)}</span>
          <div class="chart-wrap">${chartFor(o, today)}</div>
          <div class="chart-legend"><span><i class="real"></i>real</span><span><i class="ideal"></i>ritmo ideal</span>
            <span class="fc ${p.forecast && p.forecast > o.prazo ? 'late' : ''}">${p.done ? '' : p.forecast ? (p.forecast > o.prazo ? `a este ritmo, só em ${esc(monthYear(p.forecast))}` : `previsão: ${esc(fmtDate(p.forecast))}`) : p.elapsed < 7 ? 'previsão após 1 semana' : 'sem previsão ainda'}</span></div>
        </div>

        ${!p.done && daysLeft > 0 ? `
          <div class="card need-card">
            <div class="caps small">Para chegar a tempo, precisas de</div>
            <div class="need-row">
              <div><b>${esc(fmtValue(p.perMonth, u))}</b><span>por mês</span></div>
              <div><b>${esc(fmtValue(p.perWeek, u))}</b><span>por semana</span></div>
              <div><b>${esc(fmtValue(p.perDay, u))}</b><span>por dia</span></div>
            </div>
            ${o.tipo !== 'medicao' ? (monthGoal
              ? `<button type="button" class="btn-secondary" data-action="month-goal">Ver a meta deste mês: ${esc(monthGoal.titulo)}</button>`
              : `<button type="button" class="btn-secondary" data-action="month-goal">+ Criar a meta deste mês (${esc(fmtValue(Math.ceil(p.perMonth), u))})</button>`) : ''}
          </div>` : ''}

        ${o.tipo === 'acumular' || o.tipo === 'medicao' ? `
          <div class="group-header">${o.tipo === 'medicao' ? 'Registar valor de hoje' : 'Somar progresso'}</div>
          <form class="add-entry" novalidate>
            <input name="valor" type="text" inputmode="decimal" placeholder="${o.tipo === 'medicao' ? `Ex.: ${fmtValue(p.value)}` : 'Ex.: 1'}" aria-label="Valor" enterkeyhint="done">
            ${u ? `<span class="unit">${esc(u)}</span>` : ''}
            <button type="submit" class="btn-primary small">${o.tipo === 'medicao' ? 'Registar' : 'Somar'}</button>
          </form>` : '<p class="group-footer">Conta sozinho com o que registas nas Finanças (receitas − despesas).</p>'}

        ${ms.length ? `
          <div class="group-header">Marcos</div>
          <div class="group">${ms.map((m) => `
            <div class="cell ms-row ${m.reached ? 'done' : ''}">
              <span class="step-check">${m.reached ? '✓' : ''}</span>
              <span class="cell-label">${esc(fmtValue(m.valor, u))}${m.titulo ? ` · ${esc(m.titulo)}` : ''}</span>
              <span class="muted small">${m.date ? esc(fmtShort(m.date)) : ''}</span>
            </div>`).join('')}</div>` : ''}

        ${(o.registos || []).length ? `
          <div class="group-header">${o.tipo === 'medicao' ? 'Medições' : 'Registos'}</div>
          <div class="group">${[...o.registos].sort((a, b) => (a.data < b.data ? 1 : -1)).slice(0, 8).map((r) => `
            <div class="cell entry-row"><span class="cell-label">${esc(formatRelative(r.data))}</span>
              <b>${o.tipo === 'acumular' && r.valor > 0 ? '+' : ''}${esc(fmtValue(r.valor, u))}</b>
              <button type="button" class="icon-btn small" data-remove="${esc(r.id)}" aria-label="Apagar registo">×</button></div>`).join('')}</div>` : ''}`;
    }

    body.innerHTML = `
      <div class="gd-head">
        <div class="caps">${p.done || o.feito ? 'Cumprido' : daysLeft >= 0 ? `Até ${esc(fmtDate(o.prazo))} · ${daysLeft === 0 ? 'último dia' : `faltam ${daysLeft} dias`}` : `Prazo: ${esc(fmtDate(o.prazo))}`}</div>
        <h2><span class="obj-emoji">${esc(o.emoji || '🎯')}</span> ${esc(o.titulo)}</h2>
        ${o.porque ? `<p class="why">“${esc(o.porque)}”</p>` : ''}
      </div>
      ${main}

      <div class="group-header">Metas ligadas</div>
      ${linked.length ? `<div class="group">${linked.map((g) => {
        const gp = progress(g, ctx);
        return `<button type="button" class="cell child-goal" data-goal="${esc(g.id)}">
          <div class="cg-body"><div>${esc(g.titulo)}</div><div class="muted small">${esc(g.tipo === 'mes' ? monthLabel(`${g.periodo}-01`) : weekLabel(g.periodo))}</div></div>
          <span class="${gp.done ? 'hot' : 'muted'} small">${g.medida === 'feito' ? (gp.done ? 'Feito ✦' : 'Por fazer') : `${esc(fmtValue(gp.value))} / ${esc(fmtValue(gp.target, g.unidade))}`}</span>
        </button>`;
      }).join('')}</div>` : '<p class="group-footer">Nenhuma ainda. Liga metas do mês a este objetivo ao criá-las ("Faz parte do objetivo").</p>'}

      <div class="form-actions">
        <button type="button" class="btn-secondary" data-action="edit">Editar objetivo</button>
      </div>`;
  }

  body.addEventListener('click', async (e) => {
    const o = state.objectives.find((x) => x.id === id);
    if (!o) return;
    const t = e.target.closest('[data-action],[data-remove],[data-step],[data-goal]');
    if (!t) return;
    if (t.dataset.remove) return removeObjectiveEntry(o, t.dataset.remove);
    if (t.dataset.goal) return openGoalSheet(t.dataset.goal);
    if (t.dataset.step) {
      const before = objProgress(o, goalCtx(), todayKey()).pct;
      await toggleObjectiveStep(o, t.dataset.step);
      const after = objProgress(state.objectives.find((x) => x.id === id), goalCtx(), todayKey()).pct;
      if (after > before) play('check');
      return;
    }
    const a = t.dataset.action;
    if (a === 'edit') return openObjectiveForm(o);
    if (a === 'toggle-done') {
      await saveObjective({ ...o, feito: !o.feito, concluidoEm: o.feito ? null : todayKey() });
      if (!o.feito) { glow(); play('closed'); toast('Objetivo cumprido. Lembra-te deste dia.', { icon: '✦', long: true }); }
      return;
    }
    if (a === 'month-goal') {
      const p = pace(o, goalCtx(), todayKey());
      const month = currentPeriod('mes', todayKey());
      const exists = state.goals.find((g) => g.objetivoId === o.id && g.tipo === 'mes' && g.periodo === month);
      if (exists) return openGoalSheet(exists.id);
      const alvo = Math.ceil(p.perMonth);
      const g = await saveGoal({
        tipo: 'mes', periodo: month, objetivoId: o.id, medida: 'numero', registos: [],
        titulo: o.tipo === 'poupanca' ? `Poupar ${alvo} €` : `${o.titulo} · ${fmtValue(alvo, o.unidade)}`,
        alvo, unidade: o.unidade || '', modo: o.tipo === 'poupanca' ? 'poupanca' : 'manual',
      });
      toast(`Meta do mês criada: ${g.titulo}`, { icon: '✦' });
    }
  });

  body.addEventListener('submit', async (e) => {
    e.preventDefault();
    const o = state.objectives.find((x) => x.id === id);
    const input = e.target.elements.valor;
    const v = parseFloat(String(input.value).replace(/\s/g, '').replace(',', '.'));
    if (!Number.isFinite(v) || (o.tipo === 'acumular' && v === 0)) return input.focus();
    const before = objProgress(o, goalCtx(), todayKey());
    const msBefore = milestones(o, goalCtx(), todayKey()).filter((m) => m.reached).length;
    // Medição: um valor por dia (substitui o de hoje, se já existir).
    const base = o.tipo === 'medicao' ? { ...o, registos: (o.registos || []).filter((r) => r.data !== todayKey()) } : o;
    await addObjectiveEntry(base, v, todayKey());
    input.value = '';
    const now = state.objectives.find((x) => x.id === id);
    const after = objProgress(now, goalCtx(), todayKey());
    const msAfter = milestones(now, goalCtx(), todayKey()).filter((m) => m.reached).length;
    if (!before.done && after.done) { glow(); play('closed'); toast('Objetivo cumprido. ✦', { long: true }); }
    else if (msAfter > msBefore) { glow(); play('check'); toast('Marco atingido ✦'); }
    else toast(o.tipo === 'medicao' ? `Registado: ${fmtValue(v, o.unidade)}` : `+${fmtValue(v, o.unidade)}`);
  });

  unsub = subscribe(render);
  render();
}
