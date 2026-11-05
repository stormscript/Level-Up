// Ecrã "Personagem": nível global e atributos (áreas).
import { state } from '../state.js';
import { levelFromXp, totalXp, xpByArea } from '../engine/xp.js';
import { createScreen } from '../ui/screen.js';
import { esc, fmtNum } from '../ui/dom.js';

export function createCharacter(section) {
  const scr = createScreen(section, { title: 'Personagem' });

  function render() {
    if (!state.ready) return;
    const total = totalXp(state.log);
    const lv = levelFromXp(total);
    const byArea = xpByArea(state.log);
    const completions = state.log.filter((e) => e.tipo === 'concluir').length;

    scr.content.innerHTML = `
      <div class="card hero">
        <div class="avatar">🧙<span class="avatar-level">${lv.level}</span></div>
        <h2>Herói · Nível ${lv.level}</h2>
        <p class="muted">${fmtNum(total)} XP total · ${fmtNum(completions)} missões concluídas</p>
        <div class="bar big"><i style="width:${(lv.progress * 100).toFixed(1)}%"></i></div>
        <p class="muted small">${fmtNum(lv.xpForNext - lv.xpInLevel)} XP para o nível ${lv.level + 1}</p>
      </div>

      <div class="group-header">Atributos</div>
      <div class="group">
        ${state.areas.map((a) => {
          const xp = byArea[a.id] || 0;
          const al = levelFromXp(xp);
          return `<div class="cell attr" style="--area:${esc(a.cor)}">
            <span class="area-icon">${esc(a.icone)}</span>
            <div class="attr-body">
              <div class="attr-row"><span>${esc(a.nome)}</span><span class="muted">Nv ${al.level} · ${fmtNum(xp)} XP</span></div>
              <div class="bar thin area"><i style="width:${(al.progress * 100).toFixed(1)}%"></i></div>
            </div>
          </div>`;
        }).join('')}
      </div>

      <div class="card soon">
        <div class="soon-emoji">🕸️</div>
        <div><strong>Gráfico radar</strong><span class="muted">Chega na Fase 2, com os objetivos e os bosses.</span></div>
      </div>`;
  }

  return { render, scroller: scr.scroller };
}
