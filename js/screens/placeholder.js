// Ecrãs da Fase B (Agenda, Metas).
import { createScreen } from '../ui/screen.js';
import { esc } from '../ui/dom.js';

export function createPlaceholder(section, { title, caps, text }) {
  const scr = createScreen(section, { title });
  scr.setCaps(caps);
  scr.content.innerHTML = `
    <div class="empty">
      <div class="empty-star">✦</div>
      <h3>Em construção</h3>
      <p>${esc(text)}</p>
    </div>`;
  return { render() {}, scroller: scr.scroller };
}
