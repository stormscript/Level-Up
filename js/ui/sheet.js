// Bottom sheets (deslizam de baixo, fecham ao arrastar para baixo) e action sheets.
import { esc, overlayRoot } from './dom.js';

let z = 100;

export function openSheet({ title, body, leftLabel = 'Cancelar', size = 'auto', onClose }) {
  const backdrop = document.createElement('div');
  backdrop.className = 'sheet-backdrop';
  backdrop.style.zIndex = ++z;

  const sheet = document.createElement('div');
  sheet.className = `sheet sheet-${size}`;
  sheet.style.zIndex = ++z;
  sheet.setAttribute('role', 'dialog');
  sheet.setAttribute('aria-modal', 'true');
  sheet.setAttribute('aria-label', title);
  sheet.innerHTML = `
    <div class="sheet-grab-area">
      <div class="sheet-grabber"></div>
      <header class="sheet-header">
        <button class="sheet-btn sheet-left" type="button">${esc(leftLabel)}</button>
        <h2>${esc(title)}</h2>
        <span></span>
      </header>
    </div>
    <div class="sheet-body"></div>`;
  const bodyEl = sheet.querySelector('.sheet-body');
  if (typeof body === 'string') bodyEl.innerHTML = body;
  else if (body) bodyEl.append(body);

  overlayRoot().append(backdrop, sheet);
  // Duplo rAF para garantir que a transição arranca.
  requestAnimationFrame(() => requestAnimationFrame(() => {
    backdrop.classList.add('open');
    sheet.classList.add('open');
  }));

  let closed = false;
  function close(reason) {
    if (closed) return;
    closed = true;
    if (sheet.contains(document.activeElement)) document.activeElement.blur();
    backdrop.classList.remove('open');
    sheet.classList.remove('open', 'dragging');
    sheet.style.transform = '';
    setTimeout(() => {
      backdrop.remove();
      sheet.remove();
      onClose?.(reason);
    }, 420);
  }

  backdrop.addEventListener('click', () => close('backdrop'));
  sheet.querySelector('.sheet-left').addEventListener('click', () => close('cancel'));
  enableDragToClose(sheet, close);

  return { sheet, body: bodyEl, close };
}

function enableDragToClose(sheet, close) {
  const body = sheet.querySelector('.sheet-body');
  const grab = sheet.querySelector('.sheet-grab-area');
  let y0 = null, x0 = 0, dy = 0, t0 = 0, dragging = false;

  const start = (x, y, target) => {
    const inBody = body.contains(target);
    if (inBody && body.scrollTop > 0) return (y0 = null);
    y0 = y; x0 = x; dy = 0; t0 = performance.now(); dragging = false;
  };
  const move = (x, y) => {
    if (y0 == null) return false;
    const d = y - y0;
    if (!dragging) {
      if (d > 8 && Math.abs(d) > Math.abs(x - x0) && body.scrollTop <= 0) {
        dragging = true;
        sheet.classList.add('dragging');
      } else if (d < -6 || Math.abs(x - x0) > 12) {
        y0 = null;
        return false;
      } else return false;
    }
    dy = Math.max(0, d);
    sheet.style.transform = `translateY(${dy}px)`;
    return true;
  };
  const end = () => {
    if (!dragging) return (y0 = null);
    sheet.classList.remove('dragging');
    const velocity = dy / Math.max(1, performance.now() - t0);
    if (dy > sheet.offsetHeight * 0.25 || velocity > 0.6) close('drag');
    else sheet.style.transform = '';
    y0 = null;
    dragging = false;
  };

  // Toque (iPhone)
  sheet.addEventListener('touchstart', (e) => e.touches.length === 1 && start(e.touches[0].clientX, e.touches[0].clientY, e.target), { passive: true });
  sheet.addEventListener('touchmove', (e) => { if (move(e.touches[0].clientX, e.touches[0].clientY)) e.preventDefault(); }, { passive: false });
  sheet.addEventListener('touchend', end);
  sheet.addEventListener('touchcancel', end);

  // Rato (computador): arrastar pela pega
  grab.addEventListener('pointerdown', (e) => {
    if (e.pointerType !== 'mouse') return;
    start(e.clientX, e.clientY, e.target);
    const mm = (ev) => move(ev.clientX, ev.clientY);
    const mu = () => { end(); window.removeEventListener('pointermove', mm); window.removeEventListener('pointerup', mu); };
    window.addEventListener('pointermove', mm);
    window.addEventListener('pointerup', mu);
  });
}

/** Action sheet ao estilo iOS. Resolve com o `value` da ação escolhida ou null. */
export function actionSheet({ title, message, actions }) {
  return new Promise((resolve) => {
    const backdrop = document.createElement('div');
    backdrop.className = 'sheet-backdrop';
    backdrop.style.zIndex = ++z;
    const wrap = document.createElement('div');
    wrap.className = 'action-sheet';
    wrap.style.zIndex = ++z;
    wrap.setAttribute('role', 'dialog');
    wrap.innerHTML = `
      <div class="as-group">
        ${title || message ? `<div class="as-head">${title ? `<strong>${esc(title)}</strong>` : ''}${message ? `<p>${esc(message)}</p>` : ''}</div>` : ''}
        ${actions.map((a, i) => `<button type="button" class="as-btn ${a.destructive ? 'destructive' : ''}" data-i="${i}">${esc(a.label)}</button>`).join('')}
      </div>
      <div class="as-group"><button type="button" class="as-btn as-cancel">Cancelar</button></div>`;
    overlayRoot().append(backdrop, wrap);
    requestAnimationFrame(() => requestAnimationFrame(() => {
      backdrop.classList.add('open');
      wrap.classList.add('open');
    }));
    const finish = (value) => {
      backdrop.classList.remove('open');
      wrap.classList.remove('open');
      setTimeout(() => { backdrop.remove(); wrap.remove(); }, 350);
      resolve(value);
    };
    backdrop.addEventListener('click', () => finish(null));
    wrap.querySelector('.as-cancel').addEventListener('click', () => finish(null));
    wrap.querySelectorAll('[data-i]').forEach((b) => b.addEventListener('click', () => finish(actions[+b.dataset.i].value ?? true)));
  });
}

/** Mantém o campo ativo visível acima do teclado do iOS. */
export function initKeyboardHandling() {
  const vv = window.visualViewport;
  if (vv) {
    const update = () => {
      const kb = Math.max(0, window.innerHeight - vv.height - vv.offsetTop);
      document.documentElement.style.setProperty('--kb', `${Math.round(kb)}px`);
    };
    vv.addEventListener('resize', update);
    vv.addEventListener('scroll', update);
  }
  document.addEventListener('focusin', (e) => {
    if (!e.target.matches('input, textarea, select')) return;
    setTimeout(() => e.target.scrollIntoView({ block: 'center', behavior: 'smooth' }), 320);
  });
  document.addEventListener('focusout', () => {
    // Corrige o "ecrã deslocado" que o iOS por vezes deixa ao fechar o teclado.
    setTimeout(() => {
      if (!document.activeElement?.matches?.('input, textarea, select')) window.scrollTo(0, 0);
    }, 100);
  });
}
