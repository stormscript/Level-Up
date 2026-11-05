// Tema claro/escuro: 'auto' segue o iPhone (prefers-color-scheme).
import { prefs } from '../prefs.js';

const mq = matchMedia('(prefers-color-scheme: dark)');

export function applyTheme() {
  const dark = prefs.tema === 'dark' || (prefs.tema === 'auto' && mq.matches);
  document.documentElement.dataset.scheme = dark ? 'dark' : 'light';
  const color = dark ? '#000000' : '#F2F2F7';
  document.querySelectorAll('meta[name="theme-color"]').forEach((m) => m.setAttribute('content', color));
}

mq.addEventListener?.('change', applyTheme);
