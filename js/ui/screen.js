// Ecrã com "Large Title" ao estilo iOS: o título grande desaparece no scroll
// e aparece o título pequeno na barra de navegação (com vidro desfocado).
import { esc } from './dom.js';

export function createScreen(section, { title, trailing = '' }) {
  section.innerHTML = `
    <header class="navbar">
      <div class="navbar-title">${esc(title)}</div>
      <div class="navbar-trailing">${trailing}</div>
    </header>
    <div class="scroller">
      <div class="large-title">
        <h1>${esc(title)}</h1>
        <p class="subtitle"></p>
      </div>
      <div class="content"></div>
    </div>`;

  const navbar = section.querySelector('.navbar');
  const scroller = section.querySelector('.scroller');
  const large = section.querySelector('.large-title');
  const subtitle = section.querySelector('.subtitle');

  let ticking = false;
  scroller.addEventListener(
    'scroll',
    () => {
      if (ticking) return;
      ticking = true;
      requestAnimationFrame(() => {
        ticking = false;
        const y = scroller.scrollTop;
        navbar.classList.toggle('scrolled', y > large.offsetHeight - 8);
        if (y < 0) {
          // Puxar para baixo: o título cresce ligeiramente, como no iOS.
          large.style.transform = `scale(${Math.min(1.1, 1 - y / 700)})`;
          large.style.opacity = '';
        } else {
          large.style.transform = '';
          large.style.opacity = String(Math.max(0, 1 - y / (large.offsetHeight * 0.9)));
        }
      });
    },
    { passive: true },
  );

  return {
    section,
    scroller,
    content: section.querySelector('.content'),
    navbar,
    setSubtitle(text) {
      subtitle.textContent = text || '';
      subtitle.hidden = !text;
    },
  };
}
