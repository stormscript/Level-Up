// Ecrãs das fases seguintes (Objetivos, Loja, Estatísticas).
import { createScreen } from '../ui/screen.js';
import { esc } from '../ui/dom.js';

export function createPlaceholder(section, { title, emoji, phase, text }) {
  const scr = createScreen(section, { title });
  scr.content.innerHTML = `
    <div class="empty">
      <div class="empty-emoji">${emoji}</div>
      <h3>Chega na Fase ${phase}</h3>
      <p>${esc(text)}</p>
    </div>`;
  return { render() {}, scroller: scr.scroller };
}
