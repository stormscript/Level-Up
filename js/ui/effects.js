// Efeitos: toast, "+XP" a flutuar, confetti, ecrã de subida de nível e som.
import { appRoot, esc, reducedMotion } from './dom.js';
import { prefs } from '../prefs.js';

// ---------- Toast ----------
let toastTimer;
export function toast(text, { icon = '' } = {}) {
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
  toastTimer = setTimeout(() => t.classList.remove('show'), 2200);
}

// ---------- +XP a flutuar ----------
export function floatXp(fromEl, text) {
  const app = appRoot();
  const r = fromEl.getBoundingClientRect();
  const a = app.getBoundingClientRect();
  const f = document.createElement('div');
  f.className = 'xp-float';
  f.textContent = text;
  f.style.left = `${r.left - a.left + r.width / 2}px`;
  f.style.top = `${r.top - a.top}px`;
  app.append(f);
  setTimeout(() => f.remove(), 1000);
}

// ---------- Confetti ----------
export function confetti({ colors = ['#5E5CE6', '#FF9500', '#30B651', '#FF2D55', '#FFCC00', '#AF52DE'], count = 140 } = {}) {
  if (reducedMotion()) return;
  const app = appRoot();
  const canvas = document.createElement('canvas');
  canvas.className = 'confetti';
  const dpr = Math.min(2, window.devicePixelRatio || 1);
  const w = app.clientWidth, h = app.clientHeight;
  canvas.width = w * dpr;
  canvas.height = h * dpr;
  app.append(canvas);
  const ctx = canvas.getContext('2d');
  ctx.scale(dpr, dpr);
  const parts = Array.from({ length: count }, () => ({
    x: w / 2 + (Math.random() - 0.5) * 80,
    y: h * 0.38,
    vx: (Math.random() - 0.5) * 13,
    vy: -Math.random() * 15 - 5,
    s: 5 + Math.random() * 6,
    r: Math.random() * Math.PI,
    vr: (Math.random() - 0.5) * 0.35,
    c: colors[(Math.random() * colors.length) | 0],
  }));
  const t0 = performance.now();
  (function frame(t) {
    const elapsed = t - t0;
    ctx.clearRect(0, 0, w, h);
    for (const p of parts) {
      p.vy += 0.42;
      p.vx *= 0.99;
      p.x += p.vx;
      p.y += p.vy;
      p.r += p.vr;
      ctx.save();
      ctx.globalAlpha = Math.max(0, 1 - elapsed / 2600);
      ctx.translate(p.x, p.y);
      ctx.rotate(p.r);
      ctx.fillStyle = p.c;
      ctx.fillRect(-p.s / 2, -p.s / 4, p.s, p.s / 2);
      ctx.restore();
    }
    if (elapsed < 2600) requestAnimationFrame(frame);
    else canvas.remove();
  })(t0);
}

// ---------- Subida de nível ----------
export function showLevelUp(level) {
  play('levelup');
  confetti();
  const o = document.createElement('div');
  o.className = 'levelup';
  o.innerHTML = `
    <div class="levelup-card">
      <div class="levelup-badge">${level}</div>
      <h2>Subiste de nível!</h2>
      <p>Chegaste ao nível ${level}. Continua assim! 🚀</p>
      <button type="button" class="btn-primary">Boa!</button>
    </div>`;
  appRoot().append(o);
  requestAnimationFrame(() => o.classList.add('show'));
  const close = () => { o.classList.remove('show'); setTimeout(() => o.remove(), 300); };
  o.addEventListener('click', close);
  setTimeout(close, 4500);
}

// ---------- Som (Web Audio, sem ficheiros) ----------
let audioCtx;
export function play(kind) {
  if (!prefs.som) return;
  try {
    audioCtx ??= new (window.AudioContext || window.webkitAudioContext)();
    if (audioCtx.state === 'suspended') audioCtx.resume();
    const notes = kind === 'levelup' ? [523, 659, 784, 1047] : kind === 'undo' ? [660, 440] : [880, 1320];
    notes.forEach((f, i) => {
      const o = audioCtx.createOscillator();
      const g = audioCtx.createGain();
      o.type = 'sine';
      o.frequency.value = f;
      const t = audioCtx.currentTime + i * 0.08;
      g.gain.setValueAtTime(0.0001, t);
      g.gain.exponentialRampToValueAtTime(0.18, t + 0.012);
      g.gain.exponentialRampToValueAtTime(0.0001, t + 0.28);
      o.connect(g).connect(audioCtx.destination);
      o.start(t);
      o.stop(t + 0.3);
    });
  } catch {
    /* sem áudio: ignora */
  }
}
