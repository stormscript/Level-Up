// Camada fina sobre IndexedDB (sem bibliotecas).
import { migrateV1 } from './engine/habits.js';

const DB_NAME = 'levelup';
const DB_VERSION = 3;

// Stores atuais.
export const STORES = {
  habits: 'id',
  checks: 'id', // id = "habitId|AAAA-MM-DD"
  journal: 'id', // id = data "AAAA-MM-DD" (uma entrada por dia)
  events: 'id',
  goals: 'id',
  transactions: 'id',
  meta: 'id',
};

// Stores da versão 1 (gamificada), removidas na migração.
const OLD_STORES = ['areas', 'tasks', 'log', 'entries', 'dayPlans', 'reviews', 'rewards', 'achievements'];

let dbPromise;

function open() {
  dbPromise ??= new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = (event) => {
      const db = req.result;
      const tx = req.transaction;
      for (const [name, keyPath] of Object.entries(STORES)) {
        if (!db.objectStoreNames.contains(name)) db.createObjectStore(name, { keyPath });
      }
      if (event.oldVersion === 1 && db.objectStoreNames.contains('tasks')) migrateFromV1(db, tx);
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
    req.onblocked = () => reject(new Error('Fecha a app noutros separadores e tenta outra vez.'));
  });
  return dbPromise;
}

/** v1 → v2: guarda os hábitos que criaste (e as marcações); o resto sai. */
function migrateFromV1(db, tx) {
  const tasksReq = tx.objectStore('tasks').getAll();
  tasksReq.onsuccess = () => {
    const logReq = tx.objectStore('log').getAll();
    logReq.onsuccess = () => {
      const { habits, checks } = migrateV1(tasksReq.result, logReq.result);
      habits.forEach((h) => tx.objectStore('habits').put(h));
      checks.forEach((c) => tx.objectStore('checks').put(c));
      // Sem hábitos próprios → apaga o "meta" para a app recomeçar com os novos exemplos.
      if (!habits.length) tx.objectStore('meta').delete('app');
      else tx.objectStore('meta').put({ id: 'app', criadoEm: new Date().toISOString(), versaoDados: 2 });
      for (const name of OLD_STORES) if (db.objectStoreNames.contains(name)) db.deleteObjectStore(name);
    };
  };
}

const done = (tx) =>
  new Promise((resolve, reject) => {
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
    tx.onabort = () => reject(tx.error);
  });

export async function getAll(store) {
  const db = await open();
  return new Promise((resolve, reject) => {
    const req = db.transaction(store).objectStore(store).getAll();
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

export const put = (store, value) => putMany(store, [value]);

export async function putMany(store, values) {
  const db = await open();
  const tx = db.transaction(store, 'readwrite');
  const os = tx.objectStore(store);
  for (const v of values) os.put(v);
  return done(tx);
}

export async function removeMany(store, ids) {
  const db = await open();
  const tx = db.transaction(store, 'readwrite');
  const os = tx.objectStore(store);
  for (const id of ids) os.delete(id);
  return done(tx);
}

export const remove = (store, id) => removeMany(store, [id]);

export async function exportAll() {
  const out = {};
  for (const name of Object.keys(STORES)) out[name] = await getAll(name);
  return out;
}

/** Substitui TODOS os dados numa única transação (ou tudo, ou nada). */
export async function replaceAll(data) {
  const db = await open();
  const names = Object.keys(STORES);
  const tx = db.transaction(names, 'readwrite');
  for (const name of names) {
    const os = tx.objectStore(name);
    os.clear();
    for (const row of data[name] || []) os.put(row);
  }
  return done(tx);
}
