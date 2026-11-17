// Arranque da app: ecrãs, tab bar, service worker.
import { load, subscribe, refreshDaily, reloadFromDb } from './state.js';
import { initSync, onSyncStatus, syncStatus } from './sync.js';
import { handleLinkHash, syncLabel } from './screens/syncSheet.js';
import { todayKey } from './engine/dates.js';
import { initKeyboardHandling } from './ui/sheet.js';
import { closeOpenRow } from './ui/swipe.js';
import { ICONS, esc, appRoot } from './ui/dom.js';
import { createToday } from './screens/today.js';
import { createJournal } from './screens/journal.js';
import { createAgenda } from './screens/agenda.js';
import { createGoals } from './screens/goals.js';
import { createFinance } from './screens/finance.js';

const TABS = [
  { id: 'today', label: 'Hoje' },
  { id: 'agenda', label: 'Agenda' },
  { id: 'goals', label: 'Metas' },
  { id: 'finance', label: 'Finanças' },
  { id: 'journal', label: 'Diário' },
];

const screens = {};
let current = 'today';
let lastDay = todayKey();

// ---------- Modo computador (só ecrãs grandes com rato/trackpad: o iPhone nunca entra aqui) ----------
const desktopMQ = matchMedia('(min-width: 1024px) and (hover: hover) and (pointer: fine)');
const wideMQ = matchMedia('(min-width: 1360px) and (hover: hover) and (pointer: fine)');
let side = 'goals'; // o ecrã da coluna da direita no computador
const isDesktop = () => desktopMQ.matches;
const isWide = () => wideMQ.matches;

/** Ecrãs visíveis: no telemóvel só o atual; no computador, colunas lado a lado. */
function visibleScreens() {
  if (!isDesktop()) return [current];
  if (isWide()) return ['today', 'agenda', side === 'agenda' || side === 'today' ? 'goals' : side];
  return ['today', side === 'today' ? 'agenda' : side];
}

function layout() {
  const root = document.documentElement;
  root.classList.toggle('desktop', isDesktop());
  root.classList.toggle('wide', isDesktop() && isWide());
  const vis = visibleScreens();
  for (const t of TABS) {
    const sec = document.getElementById(`screen-${t.id}`);
    if (sec) sec.hidden = !vis.includes(t.id);
  }
  document.querySelectorAll('.tab').forEach((b) => {
    b.setAttribute('aria-selected', String(b.dataset.tab === current));
    b.classList.toggle('in-view', vis.includes(b.dataset.tab));
  });
  vis.forEach((id) => screens[id]?.render());
}

function buildShell() {
  document.getElementById('screens').innerHTML = TABS.map((t) => `<section class="screen" id="screen-${t.id}" ${t.id === current ? '' : 'hidden'}></section>`).join('');
  const bar = document.getElementById('tabbar');
  bar.innerHTML = `<div class="side-brand"><span>✦</span>LevelUp</div>` + TABS.map((t) => `
    <button class="tab" type="button" role="tab" data-tab="${t.id}" aria-selected="${t.id === current}">
      ${ICONS[t.id]}<span>${esc(t.label)}</span>
    </button>`).join('') + `<div class="side-foot"><span class="side-sync"></span><span class="side-keys">Atalhos: 1–5 ecrãs · N nova tarefa · Esc fechar</span></div>`;
  bar.addEventListener('click', (e) => {
    const tab = e.target.closest('[data-tab]');
    if (tab) show(tab.dataset.tab);
  });

  const $ = (id) => document.getElementById(`screen-${id}`);
  screens.today = createToday($('today'));
  screens.agenda = createAgenda($('agenda'));
  screens.goals = createGoals($('goals'));
  screens.finance = createFinance($('finance'));
  screens.journal = createJournal($('journal'));
}

function show(id) {
  closeOpenRow();
  if (isDesktop()) {
    // No computador, Hoje (e Agenda, em ecrã largo) estão sempre à vista: destaca a coluna; os outros vão para a direita.
    const fixed = isWide() ? ['today', 'agenda'] : ['today'];
    if (!fixed.includes(id)) side = id;
    current = id;
    layout();
    const sec = document.getElementById(`screen-${id}`);
    sec.classList.remove('flash');
    void sec.offsetWidth;
    sec.classList.add('flash');
    return;
  }
  if (id === current) {
    screens[id].scroller.scrollTo({ top: 0, behavior: 'smooth' });
    return;
  }
  document.getElementById(`screen-${current}`).hidden = true;
  const next = document.getElementById(`screen-${id}`);
  next.hidden = false;
  next.classList.remove('enter');
  void next.offsetWidth;
  next.classList.add('enter');
  document.querySelectorAll('.tab').forEach((t) => t.setAttribute('aria-selected', String(t.dataset.tab === id)));
  current = id;
  screens[id].render();
}

const renderAll = () => Object.values(screens).forEach((s) => s.render());

async function registerServiceWorker() {
  if (!('serviceWorker' in navigator)) return;
  try {
    const reg = await navigator.serviceWorker.register('./service-worker.js');
    const offerUpdate = (worker) => showUpdateBanner(() => worker.postMessage('SKIP_WAITING'));
    if (reg.waiting && navigator.serviceWorker.controller) offerUpdate(reg.waiting);
    reg.addEventListener('updatefound', () => {
      const nw = reg.installing;
      nw?.addEventListener('statechange', () => {
        if (nw.state === 'installed' && navigator.serviceWorker.controller) offerUpdate(nw);
      });
    });
    // Só recarrega quando é uma atualização (já havia um service worker a controlar a página).
    // Na primeira visita, o service worker novo toma conta da página sem a recarregar.
    const hadController = !!navigator.serviceWorker.controller;
    let reloading = false;
    navigator.serviceWorker.addEventListener('controllerchange', () => {
      if (reloading || !hadController) return;
      reloading = true;
      location.reload();
    });
    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'visible') reg.update().catch(() => {});
    });
  } catch (err) {
    console.warn('Service worker não registado:', err);
  }
}

function showUpdateBanner(onUpdate) {
  if (document.querySelector('.update-pill')) return;
  const b = document.createElement('button');
  b.type = 'button';
  b.className = 'update-pill';
  b.innerHTML = '✦ Nova versão · <b>Atualizar</b>';
  b.addEventListener('click', () => { b.disabled = true; onUpdate(); });
  appRoot().append(b);
}

/** Atalhos de teclado (úteis no computador; no iPhone não fazem nada). */
function initKeys() {
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
      const btns = document.querySelectorAll('.sheet-left');
      if (btns.length) { btns[btns.length - 1].click(); e.preventDefault(); }
      else document.querySelector('.action-sheet .as-cancel')?.click();
      return;
    }
    if (e.metaKey || e.ctrlKey || e.altKey) return;
    if (e.target.closest?.('input, textarea, select, [contenteditable]')) return;
    if (document.querySelector('.sheet, .action-sheet')) return;
    const n = Number(e.key);
    if (n >= 1 && n <= TABS.length) { show(TABS[n - 1].id); e.preventDefault(); return; }
    if (e.key === 'n' || e.key === 'N') {
      const input = document.querySelector('#screen-today .quick-add input');
      if (input && !document.getElementById('screen-today').hidden) { input.focus(); e.preventDefault(); }
    }
  });
}

async function start() {
  initKeyboardHandling();
  document.addEventListener('gesturestart', (e) => e.preventDefault());
  buildShell();
  try {
    await load();
  } catch (err) {
    console.error(err);
    document.getElementById('screens').innerHTML = `<div class="empty fatal"><div class="empty-star">✦</div><h3>Não foi possível abrir os dados</h3><p>${esc(err.message || err)}</p><p>Se estás em navegação privada, abre numa janela normal.</p></div>`;
    return;
  }
  subscribe(() => visibleScreens().forEach((id) => screens[id].render()));
  layout();
  desktopMQ.addEventListener?.('change', layout);
  wideMQ.addEventListener?.('change', layout);
  initKeys();
  window.addEventListener('prefs-changed', renderAll);
  window.addEventListener('goto-tab', (e) => show(e.detail));
  renderAll();
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') {
      // Mudou o dia (ou a parte do dia) enquanto a app estava fechada.
      if (todayKey() !== lastDay) lastDay = todayKey();
      refreshDaily().catch(() => {});
      renderAll();
    }
  });
  registerServiceWorker();
  initSync({ reload: reloadFromDb });
  setTimeout(handleLinkHash, 600);
  // Estado da sincronização na barra lateral (computador).
  const updSide = () => { const el = document.querySelector('.side-sync'); if (el) el.textContent = syncStatus().enabled ? `⇅ ${syncLabel()}` : ''; };
  onSyncStatus(updSide); setInterval(updSide, 30000); updSide();
  window.addEventListener('hashchange', handleLinkHash);
}

start();
