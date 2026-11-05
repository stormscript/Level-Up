// Pequenos utilitários de DOM + ícones SVG (estilo SF Symbols simplificado).

export function esc(s) {
  return String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
}

export function el(html) {
  const t = document.createElement('template');
  t.innerHTML = html.trim();
  return t.content.firstElementChild;
}

export const appRoot = () => document.getElementById('app');
export const overlayRoot = () => document.getElementById('overlays');

export const reducedMotion = () => matchMedia('(prefers-reduced-motion: reduce)').matches;

export const fmtNum = (n) => new Intl.NumberFormat('pt-PT').format(n);

const svg = (body, extra = '') =>
  `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" ${extra}>${body}</svg>`;

export const ICONS = {
  today: svg('<path d="M12 2.8l2.6 6.4 6.9.5-5.3 4.4 1.7 6.7L12 17.1l-5.9 3.7 1.7-6.7-5.3-4.4 6.9-.5z"/>', 'stroke-width="1.8"'),
  agenda: svg('<rect x="3.5" y="5" width="17" height="15.5" rx="3"/><path d="M3.5 10h17M8 3v4M16 3v4"/>', 'stroke-width="1.8"'),
  goals: svg('<circle cx="12" cy="12" r="8.5"/><circle cx="12" cy="12" r="4.2"/><circle cx="12" cy="12" r=".8" fill="currentColor"/>', 'stroke-width="1.8"'),
  habits: svg('<path d="M4 12.5l5 5L20 6.5"/>', 'stroke-width="2"'),
  journal: svg('<path d="M6 3.5h10.5a2 2 0 0 1 2 2v13a2 2 0 0 1-2 2H6z"/><path d="M6 3.5v17M9.5 8h5.5M9.5 11.5h5.5"/>', 'stroke-width="1.8"'),
  gear: svg('<circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1Z"/>', 'stroke-width="1.7"'),
  plus: svg('<path d="M12 5v14M5 12h14"/>', 'stroke-width="2.2"'),
  check: svg('<path class="ck" d="M6 12.5l4 4 8-9"/>', 'stroke-width="3"'),
  close: svg('<path d="M6 6l12 12M18 6 6 18"/>'),
  share: svg('<path d="M12 3v12M8 7l4-4 4 4"/><path d="M6 11H5v10h14V11h-1"/>'),
  chevron: svg('<path d="M9 5l7 7-7 7"/>', 'stroke-width="2.2"'),
  pen: svg('<path d="M4 20h4L19 9l-4-4L4 16z"/><path d="M13.5 6.5l4 4"/>', 'stroke-width="1.8"'),
};

export const STAR = '✦';
