// Camada fina sobre IndexedDB (sem bibliotecas).
import { migrateV1 } from './engine/habits.js';

const DB_NAME = 'levelup';
const DB_VERSION = 7;

// Stores atuais.
export const STORES = {
  habits: 'id',
  checks: 'id', // id = "habitId|AAAA-MM-DD"
  journal: 'id', // id = data "AAAA-MM-DD" (uma entrada por dia)
  events: 'id',
  goals: 'id',
  transactions: 'id',
  todos: 'id', // tarefas ("tasks" era o nome de uma store antiga)
  objectives: 'id', // objetivos de longo prazo
  recurring: 'id', // gastos e receitas fixos (lançados todos os meses)
  meta: 'id',
  tombstones: 'id', // registos apagados ("loja|id"), para a sincronização
};

// Stores que sincronizam entre dispositivos (cada registo leva `_u` = hora da última alteração).
export const SYNC_STORES = ['habits', 'checks', 'journal', 'events', 'goals', 'transactions', 'todos', 'objectives', 'recurring'];
const isSynced = (store) => SYNC_STORES.includes(store);

// Avisos de alterações locais (a sincronização ouve isto para enviar).
const writeListeners = new Set();
export const onLocalWrite = (fn) => (writeListeners.add(fn), () => writeListeners.delete(fn));
const notify = (store) => { if (isSynced(store)) writeListeners.forEach((fn) => fn(store)); };

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
  if (!values.length) return;
  const db = await open();
  const tx = db.transaction(store, 'readwrite');
  const os = tx.objectStore(store);
  const now = Date.now();
  for (const v of values) os.put(isSynced(store) ? { ...v, _u: now } : v);
  await done(tx);
  notify(store);
}

/** Apaga registos. Nas stores sincronizadas deixa uma "lápide" para o apagar chegar aos outros dispositivos. */
export async function removeMany(store, ids) {
  if (!ids.length) return;
  const db = await open();
  const synced = isSynced(store);
  const tx = db.transaction(synced ? [store, 'tombstones'] : store, 'readwrite');
  const os = tx.objectStore(store);
  const ts = synced ? tx.objectStore('tombstones') : null;
  const now = Date.now();
  for (const id of ids) {
    os.delete(id);
    ts?.put({ id: `${store}|${id}`, store, rid: id, _u: now });
  }
  await done(tx);
  notify(store);
}

export const remove = (store, id) => removeMany(store, [id]);

// ---------- Sincronização: leitura e escrita "em bruto" (sem marcar alterações) ----------

/** Tudo o que sincroniza: { stores: { nome: [linhas] }, tombs: [lápides] }. */
export async function syncSnapshot() {
  const stores = {};
  for (const name of SYNC_STORES) stores[name] = await getAll(name);
  return { stores, tombs: await getAll('tombstones') };
}

/** Aplica o resultado de uma junção: grava/apaga linhas e substitui as lápides, sem gerar novas alterações. */
export async function applySync({ put: puts = {}, del = {}, tombs = null }) {
  const db = await open();
  const names = [...SYNC_STORES, 'tombstones'];
  const tx = db.transaction(names, 'readwrite');
  for (const [name, rows] of Object.entries(puts)) for (const r of rows) tx.objectStore(name).put(r);
  for (const [name, ids] of Object.entries(del)) for (const id of ids) tx.objectStore(name).delete(id);
  if (tombs) {
    const os = tx.objectStore('tombstones');
    os.clear();
    for (const t of tombs) os.put(t);
  }
  return done(tx);
}

export async function exportAll() {
  const out = {};
  for (const name of Object.keys(STORES)) if (name !== 'tombstones') out[name] = await getAll(name);
  return out;
}

/** Substitui TODOS os dados numa única transação (ou tudo, ou nada). O que desaparece fica marcado como apagado. */
export async function replaceAll(data) {
  const db = await open();
  const before = {};
  for (const name of SYNC_STORES) before[name] = (await getAll(name)).map((r) => r.id);
  const names = Object.keys(STORES);
  const tx = db.transaction(names, 'readwrite');
  const now = Date.now();
  const tombs = tx.objectStore('tombstones');
  for (const name of names) {
    if (name === 'tombstones') continue;
    const os = tx.objectStore(name);
    os.clear();
    const rows = data[name] || [];
    for (const row of rows) os.put(isSynced(name) ? { ...row, _u: now } : row);
    if (isSynced(name)) {
      const keep = new Set(rows.map((r) => r.id));
      for (const id of before[name]) if (!keep.has(id)) tombs.put({ id: `${name}|${id}`, store: name, rid: id, _u: now });
    }
  }
  await done(tx);
  notify(SYNC_STORES[0]);
}
