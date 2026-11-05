// Deslizar linhas: para a direita = concluir (ou desfazer), para a esquerda = mostrar Editar/Apagar.
// Usa pointer events + `touch-action: pan-y`: o scroll vertical continua nativo.

const ACTIONS_W = 152;
let openRow = null;

export function closeOpenRow() {
  openRow?.close();
  openRow = null;
}

document.addEventListener('pointerdown', (e) => {
  if (openRow && !openRow.row.contains(e.target)) closeOpenRow();
}, true);

export function attachSwipe(row, { onRight, onEdit, onDelete }) {
  const content = row.querySelector('.swipe-content');
  let x0 = null, y0 = 0, dx = 0, base = 0, mode = null, pid = null, width = 0, suppress = false;

  const setX = (x, animate) => {
    content.style.transition = animate ? 'transform .32s cubic-bezier(.2,.8,.2,1)' : 'none';
    content.style.transform = x ? `translateX(${x}px)` : '';
    row.dataset.dir = x > 0 ? 'right' : x < 0 ? 'left' : '';
  };
  const api = {
    row,
    close() { base = 0; setX(0, true); },
  };

  content.addEventListener('pointerdown', (e) => {
    if (e.button > 0) return;
    x0 = e.clientX; y0 = e.clientY; dx = base; mode = null; pid = e.pointerId; width = row.offsetWidth;
  });

  content.addEventListener('pointermove', (e) => {
    if (e.pointerId !== pid || x0 == null) return;
    const mx = e.clientX - x0, my = e.clientY - y0;
    if (!mode) {
      if (Math.abs(mx) > 10 && Math.abs(mx) > Math.abs(my) * 1.2) {
        mode = 'h';
        try { content.setPointerCapture(pid); } catch {}
        if (openRow && openRow !== api) closeOpenRow();
      } else if (Math.abs(my) > 10) {
        x0 = null;
        return;
      } else return;
    }
    let x = base + mx;
    if (x < -ACTIONS_W) x = -ACTIONS_W + (x + ACTIONS_W) * 0.3; // resistência
    if (x > 0) x = Math.min(x, width * 0.85);
    dx = x;
    setX(x, false);
    row.classList.toggle('armed', x > width * 0.3);
  });

  const end = (e, cancelled) => {
    if (e.pointerId !== pid) return;
    pid = null;
    if (mode !== 'h') { x0 = null; return; }
    suppress = true;
    setTimeout(() => (suppress = false), 60);
    const armed = !cancelled && dx > width * 0.3;
    row.classList.remove('armed');
    if (armed) {
      base = 0;
      setX(0, true);
      onRight?.();
    } else if (!cancelled && dx < -ACTIONS_W / 2) {
      base = -ACTIONS_W;
      setX(base, true);
      openRow = api;
    } else {
      base = 0;
      setX(0, true);
      if (openRow === api) openRow = null;
    }
    mode = null;
    x0 = null;
  };
  content.addEventListener('pointerup', (e) => end(e, false));
  content.addEventListener('pointercancel', (e) => end(e, true));

  // Depois de arrastar não abre o detalhe; com a linha aberta, um toque fecha-a.
  row.addEventListener('click', (e) => {
    if (e.target.closest('.swipe-actions')) return;
    if (suppress) {
      // Click "fantasma" que o browser envia no fim do arrasto: ignora.
      e.stopPropagation();
      e.preventDefault();
    } else if (base !== 0) {
      e.stopPropagation();
      e.preventDefault();
      closeOpenRow();
    }
  }, true);

  row.querySelector('[data-swipe=edit]')?.addEventListener('click', () => { closeOpenRow(); onEdit?.(); });
  row.querySelector('[data-swipe=delete]')?.addEventListener('click', () => { closeOpenRow(); onDelete?.(); });
}
