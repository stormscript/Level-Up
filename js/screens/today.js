// Ecrã principal: "Hoje".
import { state, areaById, completeTask, uncompleteTask } from '../state.js';
import { prefs, setPref } from '../prefs.js';
import { buildDay } from '../engine/schedule.js';
import { levelFromXp, totalXp, xpOnDate, xpForTask } from '../engine/xp.js';
import { todayKey, formatLong, formatRelative } from '../engine/dates.js';
import { createScreen } from '../ui/screen.js';
import { esc, ICONS, fmtNum } from '../ui/dom.js';
import { attachSwipe } from '../ui/swipe.js';
import { toast, floatXp, showLevelUp, play } from '../ui/effects.js';
import { shouldShowInstallBanner } from '../ui/install.js';
import { openTaskForm, confirmDelete } from './taskForm.js';
import { openSettings } from './settings.js';

const WD = ['', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb', 'Dom'];

function recurrenceLabel(t) {
  const r = t.recorrencia || {};
  if (r.tipo === 'dias') return r.dias.map((d) => WD[d]).join(' · ');
  if (r.tipo === 'xPorSemana') return `${r.n}× por semana`;
  return 'Todos os dias';
}

export function createToday(section) {
  const scr = createScreen(section, {
    title: 'Hoje',
    trailing: `<button class="icon-btn" type="button" data-action="settings" aria-label="Definições">${ICONS.gear}</button>`,
  });
  section.insertAdjacentHTML('beforeend', `<button class="fab" type="button" data-action="new" aria-label="Nova missão">${ICONS.plus}</button>`);

  let holdRenderUntil = 0;
  let pending = null;

  section.addEventListener('click', (e) => {
    const action = e.target.closest('[data-action]')?.dataset.action;
    if (action === 'settings') return openSettings();
    if (action === 'new') return openTaskForm();
    if (action === 'dismiss-install') {
      setPref('bannerInstalarFechado', true);
      return render();
    }
    const check = e.target.closest('.check');
    if (check) return toggle(check.closest('.swipe-row'));
    const row = e.target.closest('.swipe-row');
    if (row) {
      const task = state.tasks.find((t) => t.id === row.dataset.id);
      if (task) openTaskForm(task);
    }
  });

  async function toggle(row) {
    const id = row.dataset.id;
    const date = todayKey();
    const task = state.tasks.find((t) => t.id === id);
    if (!task) return;
    holdRenderUntil = performance.now() + 650;
    if (row.classList.contains('done')) {
      row.classList.remove('done');
      play('undo');
      const res = await uncompleteTask(id, date);
      if (res) toast(`Desfeito · −${res.xp} XP`);
    } else {
      row.classList.add('done', 'pop');
      floatXp(row.querySelector('.check'), `+${xpForTask(task)} XP`);
      play('done');
      const res = await completeTask(id, date);
      if (res?.levelUp) setTimeout(() => showLevelUp(res.levelUp), 350);
      else if (res?.areaLevelUp) toast(`${res.area.nome} subiu para o nível ${res.areaLevelUp}`, { icon: res.area.icone });
    }
    scheduleRender();
  }

  function scheduleRender() {
    clearTimeout(pending);
    const wait = holdRenderUntil - performance.now();
    if (wait > 0) pending = setTimeout(render, wait);
    else render();
  }

  function taskRow(item) {
    const { task, done, overdue, week } = item;
    const area = areaById(task.areaId);
    const meta = [];
    meta.push(`<span class="dot"></span>${esc(area.nome)}`);
    if (task.tipo === 'habito') {
      meta.push(week ? `${ICONS.repeat}${week.count}/${week.n} esta semana` : `${ICONS.repeat}${esc(recurrenceLabel(task))}`);
    } else if (overdue) {
      meta.push(`<span class="overdue">${ICONS.calendar}${esc(formatRelative(task.data))}</span>`);
    }
    return `
      <div class="swipe-row ${done ? 'done' : ''}" data-id="${esc(task.id)}" style="--area:${esc(area.cor)}">
        <div class="swipe-under">${done ? 'Desfazer' : '✓ Concluir'}</div>
        <div class="swipe-actions">
          <button type="button" class="sa-edit" data-swipe="edit">Editar</button>
          <button type="button" class="sa-delete" data-swipe="delete">Apagar</button>
        </div>
        <div class="swipe-content task">
          <button type="button" class="check" aria-label="${done ? 'Desmarcar' : 'Concluir'} ${esc(task.titulo)}"><span class="ring">${ICONS.check}</span></button>
          <div class="task-body">
            <div class="task-title">${esc(task.titulo)}</div>
            <div class="task-meta">${meta.map((m) => `<span>${m}</span>`).join('')}</div>
          </div>
          <span class="xp-badge">+${xpForTask(task)}</span>
        </div>
      </div>`;
  }

  function section_(title, items, extra = '') {
    if (!items.length) return '';
    return `<div class="group-header">${title}${extra}</div><div class="group list">${items.map(taskRow).join('')}</div>`;
  }

  function render() {
    if (!state.ready) return;
    const today = todayKey();
    scr.setSubtitle(formatLong(today));
    const day = buildDay(state.tasks, state.log, today);
    const lv = levelFromXp(totalXp(state.log));
    const xpToday = xpOnDate(state.log, today);
    const pct = day.total ? Math.round((day.done / day.total) * 100) : 0;

    const installBanner = shouldShowInstallBanner(prefs.bannerInstalarFechado)
      ? `<div class="banner banner-install">
          <div class="banner-icon"><img src="icons/icon-180.png" alt=""></div>
          <div class="banner-text"><strong>Instala a LevelUp</strong>
            <span>Toca em <b>Partilhar</b> ${ICONS.share} (em iOS 26 está no menu <b>···</b>) e depois em <b>Adicionar ao ecrã principal</b>.</span></div>
          <button type="button" class="icon-btn small" data-action="dismiss-install" aria-label="Fechar">${ICONS.close}</button>
        </div>`
      : '';

    const empty = day.total === 0
      ? `<div class="empty"><div class="empty-emoji">🌱</div><h3>Dia livre!</h3><p>Ainda não tens missões para hoje.<br>Toca em <b>+</b> para criar a primeira.</p></div>`
      : '';

    const upcoming = day.upcoming.length
      ? `<div class="group-header">Próximos dias</div>
         <div class="group list">${day.upcoming.map(({ task }) => {
           const a = areaById(task.areaId);
           return `<div class="swipe-row upcoming" data-id="${esc(task.id)}" style="--area:${esc(a.cor)}">
             <div class="swipe-content task"><span class="check static"><span class="ring"></span></span>
             <div class="task-body"><div class="task-title">${esc(task.titulo)}</div>
             <div class="task-meta"><span><span class="dot"></span>${esc(a.nome)}</span><span>${ICONS.calendar}${esc(formatRelative(task.data, today))}</span></div></div>
             <span class="xp-badge">+${xpForTask(task)}</span></div></div>`;
         }).join('')}</div>`
      : '';

    scr.content.innerHTML = `
      ${installBanner}
      <div class="card level-card">
        <div class="level-badge" aria-label="Nível ${lv.level}"><span>Nv</span>${lv.level}</div>
        <div class="level-info">
          <div class="level-row"><strong>Nível ${lv.level}</strong><span class="xp-today">${xpToday ? `+${fmtNum(xpToday)} XP hoje` : 'Bora começar!'}</span></div>
          <div class="bar"><i style="width:${(lv.progress * 100).toFixed(1)}%"></i></div>
          <div class="level-sub">${fmtNum(lv.xpInLevel)} / ${fmtNum(lv.xpForNext)} XP para o nível ${lv.level + 1}</div>
        </div>
      </div>
      <div class="card day-card">
        <div class="ring-progress" style="--p:${pct}"><span>${pct}%</span></div>
        <div><strong>${day.done} de ${day.total} feitas</strong>
        <span class="muted">${day.total && day.done === day.total ? 'Dia completo! 🎉' : 'Desliza → para concluir, ← para editar'}</span></div>
      </div>
      ${empty}
      ${section_('Hábitos', day.habits)}
      ${section_('Missões', day.missions)}
      ${upcoming}`;

    scr.content.querySelectorAll('.swipe-row:not(.upcoming)').forEach((row) => {
      const task = state.tasks.find((t) => t.id === row.dataset.id);
      attachSwipe(row, {
        onRight: () => toggle(row),
        onEdit: () => openTaskForm(task),
        onDelete: () => confirmDelete(task),
      });
    });
  }

  return { render: scheduleRender, scroller: scr.scroller };
}
