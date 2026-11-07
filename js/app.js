// Arranque da app: ecrãs, tab bar, service worker.
import { load, subscribe, refreshDaily } from './state.js';
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

function buildShell() {
  document.getElementById('screens').innerHTML = TABS.map((t) => `<section class="screen" id="screen-${t.id}" ${t.id === current ? '' : 'hidden'}></section>`).join('');
  const bar = document.getElementById('tabbar');
  bar.innerHTML = TABS.map((t) => `
    <button class="tab" type="button" role="tab" data-tab="${t.id}" aria-selected="${t.id === current}">
      ${ICONS[t.id]}<span>${esc(t.label)}</span>
    </button>`).join('');
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
    let reloading = false;
    navigator.serviceWorker.addEventListener('controllerchange', () => {
      if (reloading) return;
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
  subscribe(() => screens[current].render());
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
}

start();
