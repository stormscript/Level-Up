// Arranque da app: ecrãs, tab bar, service worker.
import { load, subscribe } from './state.js';
import { todayKey } from './engine/dates.js';
import { applyTheme } from './ui/theme.js';
import { initKeyboardHandling } from './ui/sheet.js';
import { closeOpenRow } from './ui/swipe.js';
import { ICONS, esc, appRoot } from './ui/dom.js';
import { createToday } from './screens/today.js';
import { createCharacter } from './screens/character.js';
import { createPlaceholder } from './screens/placeholder.js';

const TABS = [
  { id: 'today', label: 'Hoje' },
  { id: 'goals', label: 'Objetivos' },
  { id: 'character', label: 'Personagem' },
  { id: 'shop', label: 'Loja' },
  { id: 'stats', label: 'Estatísticas' },
];

const screens = {};
let current = 'today';
let lastDay = todayKey();

function buildShell() {
  document.getElementById('screens').innerHTML = TABS.map((t) => `<section class="screen" id="screen-${t.id}" data-screen="${t.id}" ${t.id === current ? '' : 'hidden'}></section>`).join('');
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
  screens.goals = createPlaceholder($('goals'), { title: 'Objetivos', emoji: '🎯', phase: 2, text: 'Objetivos do mês e da semana, com bosses que perdem vida à medida que avanças.' });
  screens.character = createCharacter($('character'));
  screens.shop = createPlaceholder($('shop'), { title: 'Loja', emoji: '🛍️', phase: 3, text: 'Gasta as moedas que ganhas em recompensas que tu escolhes.' });
  screens.stats = createPlaceholder($('stats'), { title: 'Estatísticas', emoji: '📊', phase: 5, text: 'Taxas de conclusão, heatmap de atividade e evolução do XP.' });
}

function show(id) {
  closeOpenRow();
  if (id === current) {
    // Tocar no separador ativo volta ao topo (como no iOS).
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

function renderAll() {
  Object.values(screens).forEach((s) => s.render());
}

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
    // Procura versões novas sempre que a app volta ao primeiro plano.
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
  b.innerHTML = '✨ Nova versão disponível · <b>Atualizar</b>';
  b.addEventListener('click', () => { b.disabled = true; onUpdate(); });
  appRoot().append(b);
}

async function start() {
  applyTheme();
  initKeyboardHandling();
  // Evita o zoom por gesto de pinça na app instalada.
  document.addEventListener('gesturestart', (e) => e.preventDefault());
  buildShell();
  try {
    await load();
  } catch (err) {
    console.error(err);
    document.getElementById('screens').innerHTML = `<div class="empty fatal"><div class="empty-emoji">⚠️</div><h3>Não foi possível abrir os dados</h3><p>${esc(err.message || err)}</p><p>Se estás em navegação privada, abre a app numa janela normal.</p></div>`;
    return;
  }
  subscribe(() => screens[current].render());
  renderAll();
  document.addEventListener('visibilitychange', () => {
    // Mudou o dia enquanto a app estava em segundo plano.
    if (document.visibilityState === 'visible' && todayKey() !== lastDay) {
      lastDay = todayKey();
      renderAll();
    }
  });
  registerServiceWorker();
}

start();
