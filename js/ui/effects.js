// Efeitos discretos: toast, brilho vermelho e som opcional.
import { appRoot, esc, reducedMotion } from './dom.js';
import { prefs } from '../prefs.js';

let toastTimer;
export function toast(text, { icon = '', long = false } = {}) {
  let t = document.querySelector('.toast');
  if (!t) {
    t = document.createElement('div');
    t.className = 'toast';
    t.setAttribute('role', 'status');
    appRoot().append(t);
  }
  t.innerHTML = `${icon ? `<span class="toast-icon">${icon}</span>` : ''}<span>${esc(text)}</span>`;
  requestAnimationFrame(() => t.classList.add('show'));
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => t.classList.remove('show'), long ? 3200 : 2200);
}

/** Brilho vermelho a partir do topo (ex.: dia fechado). */
export function glow() {
  if (reducedMotion()) return;
  const g = document.createElement('div');
  g.className = 'glow-pulse';
  appRoot().append(g);
  setTimeout(() => g.remove(), 1600);
}

let audioCtx;
export function play(kind) {
  if (!prefs.som) return;
  try {
    audioCtx ??= new (window.AudioContext || window.webkitAudioContext)();
    if (audioCtx.state === 'suspended') audioCtx.resume();
    const notes = kind === 'closed' ? [392, 494, 587] : kind === 'undo' ? [520, 390] : [660, 990];
    notes.forEach((f, i) => {
      const o = audioCtx.createOscillator();
      const g = audioCtx.createGain();
      o.type = 'sine';
      o.frequency.value = f;
      const t = audioCtx.currentTime + i * 0.07;
      g.gain.setValueAtTime(0.0001, t);
      g.gain.exponentialRampToValueAtTime(0.12, t + 0.01);
      g.gain.exponentialRampToValueAtTime(0.0001, t + 0.3);
      o.connect(g).connect(audioCtx.destination);
      o.start(t);
      o.stop(t + 0.32);
    });
  } catch {
    /* sem áudio */
  }
}
