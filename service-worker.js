// Service worker da LevelUp: faz a app funcionar offline.
//
// ⚠️ SEMPRE QUE ALTERARES QUALQUER FICHEIRO DA APP, MUDA ESTE NÚMERO (ex.: v0.1.0 → v0.1.1).
// É isso que avisa o iPhone de que há uma versão nova.
const CACHE_VERSION = 'levelup-v0.4.0';

// Todos os ficheiros da app. Se criares um ficheiro novo, acrescenta-o aqui.
const ASSETS = [
  './',
  './index.html',
  './manifest.json',
  './css/base.css',
  './css/components.css',
  './css/screens.css',
  './js/app.js',
  './js/db.js',
  './js/engine/agenda.js',
  './js/engine/dates.js',
  './js/engine/goals.js',
  './js/engine/habits.js',
  './js/engine/money.js',
  './js/engine/nudges.js',
  './js/engine/parse.js',
  './js/engine/phrases.js',
  './js/engine/todos.js',
  './js/prefs.js',
  './js/screens/agenda.js',
  './js/screens/eventForm.js',
  './js/screens/finance.js',
  './js/screens/goalForm.js',
  './js/screens/goalSheet.js',
  './js/screens/goals.js',
  './js/screens/habitForm.js',
  './js/screens/habits.js',
  './js/screens/journal.js',
  './js/screens/journalForm.js',
  './js/screens/planner.js',
  './js/screens/settings.js',
  './js/screens/today.js',
  './js/screens/todoUI.js',
  './js/screens/txForm.js',
  './js/seed.js',
  './js/state.js',
  './js/ui/dom.js',
  './js/ui/effects.js',
  './js/ui/install.js',
  './js/ui/phrase.js',
  './js/ui/screen.js',
  './js/ui/sheet.js',
  './js/ui/swipe.js',
  './icons/icon-180.png',
  './icons/icon-192.png',
  './icons/icon-512.png',
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_VERSION).then((cache) => cache.addAll(ASSETS.map((url) => new Request(url, { cache: 'reload' })))),
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((k) => k.startsWith('levelup-') && k !== CACHE_VERSION).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  );
});

// A app pede para ativar a versão nova quando tocas em "Atualizar".
self.addEventListener('message', (event) => {
  if (event.data === 'SKIP_WAITING') self.skipWaiting();
});

// Cache primeiro (rápido e offline); se não estiver em cache, vai à rede.
self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return;

  if (req.mode === 'navigate') {
    event.respondWith(caches.match('./index.html').then((res) => res || fetch(req)));
    return;
  }

  event.respondWith(
    caches.match(req, { ignoreSearch: true }).then(
      (cached) =>
        cached ||
        fetch(req).then((res) => {
          if (res.ok && res.type === 'basic') {
            const copy = res.clone();
            caches.open(CACHE_VERSION).then((c) => c.put(req, copy));
          }
          return res;
        }),
    ),
  );
});
