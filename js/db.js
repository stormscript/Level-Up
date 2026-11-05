// Camada fina sobre IndexedDB (sem bibliotecas).
const DB_NAME = 'levelup';
const DB_VERSION = 1;

// Todas as stores das 5 fases já criadas agora, para evitar migrações mais tarde.
export const STORES = {
  areas: 'id',
  goals: 'id',
  tasks: 'id',
  log: 'id',
  entries: 'id',
  dayPlans: 'data',
  reviews: 'id',
  rewards: 'id',
  achievements: 'id',
  meta: 'id',
};

let dbPromise;

function open() {
  dbPromise ??= new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      for (const [name, keyPath] of Object.entries(STORES)) {
        if (!db.objectStoreNames.contains(name)) db.createObjectStore(name, { keyPath });
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
    req.onblocked = () => reject(new Error('Base de dados bloqueada por outro separador.'));
  });
  return dbPromise;
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

export async function put(store, value) {
  return putMany(store, [value]);
}

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
