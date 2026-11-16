// Sincronização entre dispositivos, encriptada de ponta a ponta.
//
// - A frase-passe nunca sai do dispositivo. Dela derivam (PBKDF2) uma chave AES-GCM e um token de acesso.
// - O servidor (/api/sync, função do Netlify) só guarda texto encriptado.
// - Cada sincronização: descarrega → desencripta → junta (mergeSync) → aplica localmente → envia o resultado.
import * as db from './db.js';
import { prefs, replacePrefs, SYNC_PREF_KEYS } from './prefs.js';
import { mergeSync, makeSyncId } from './engine/sync.js';

const KEY = 'levelup:sync';
const API = 'api/sync';
const ITER = 250000;

const b64 = (bytes) => btoa(String.fromCharCode(...new Uint8Array(bytes)));
const unb64 = (s) => Uint8Array.from(atob(s), (c) => c.charCodeAt(0));
const b64url = (bytes) => b64(bytes).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');

let cfg = read();
let aesKey = null;
let running = null;
let again = false;
let timer = null;
let reloadState = async () => {};

const status = { state: cfg ? 'idle' : 'off', message: '', lastSync: cfg?.lastSync || null };
const listeners = new Set();
export const onSyncStatus = (fn) => (listeners.add(fn), () => listeners.delete(fn));
const setStatus = (state, message = '') => {
  Object.assign(status, { state, message, lastSync: cfg?.lastSync || null });
  listeners.forEach((fn) => fn({ ...status }));
};
export const syncStatus = () => ({ ...status, enabled: !!cfg, id: cfg?.id || null });

function read() {
  try { return JSON.parse(localStorage.getItem(KEY) || 'null'); } catch { return null; }
}
function write() {
  try { cfg ? localStorage.setItem(KEY, JSON.stringify(cfg)) : localStorage.removeItem(KEY); } catch {}
}

// ---------- Criptografia ----------

/** Frase-passe + código → { key (bytes AES), token }. */
export async function deriveKeys(passphrase, syncId) {
  const base = await crypto.subtle.importKey('raw', new TextEncoder().encode(passphrase.normalize('NFC')), 'PBKDF2', false, ['deriveBits']);
  const bits = new Uint8Array(await crypto.subtle.deriveBits(
    { name: 'PBKDF2', salt: new TextEncoder().encode(`levelup-sync|${syncId}`), iterations: ITER, hash: 'SHA-256' }, base, 512));
  return { key: bits.slice(0, 32), token: b64url(bits.slice(32, 64)) };
}

async function getAes() {
  aesKey ??= await crypto.subtle.importKey('raw', unb64(cfg.k), 'AES-GCM', false, ['encrypt', 'decrypt']);
  return aesKey;
}

async function gzip(text) {
  if (!('CompressionStream' in window)) return { bytes: new TextEncoder().encode(text), z: false };
  const stream = new Blob([text]).stream().pipeThrough(new CompressionStream('gzip'));
  return { bytes: new Uint8Array(await new Response(stream).arrayBuffer()), z: true };
}
async function gunzip(bytes, z) {
  if (!z) return new TextDecoder().decode(bytes);
  const stream = new Blob([bytes]).stream().pipeThrough(new DecompressionStream('gzip'));
  return new Response(stream).text();
}

export async function encryptJSON(obj, key) {
  const { bytes, z } = await gzip(JSON.stringify(obj));
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const ct = await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, key, bytes);
  return { v: 1, z, iv: b64(iv), ct: b64(ct) };
}

export async function decryptJSON(payload, key) {
  try {
    const plain = await crypto.subtle.decrypt({ name: 'AES-GCM', iv: unb64(payload.iv) }, key, unb64(payload.ct));
    return JSON.parse(await gunzip(new Uint8Array(plain), payload.z));
  } catch {
    throw new SyncError('pass', 'Não foi possível abrir os dados: frase-passe errada?');
  }
}

class SyncError extends Error {
  constructor(code, message) { super(message); this.code = code; }
}

// ---------- Servidor ----------

async function api(method, body) {
  let res;
  try {
    res = await fetch(`${API}?id=${cfg.id}`, {
      method,
      headers: { 'x-sync-token': cfg.t, ...(body ? { 'content-type': 'application/json' } : {}) },
      body: body ? JSON.stringify(body) : undefined,
      cache: 'no-store',
    });
  } catch {
    throw new SyncError('offline', 'Sem internet. Sincroniza quando voltar.');
  }
  if (res.status === 403) throw new SyncError('pass', 'Código ou frase-passe errados.');
  if (res.status === 409) throw new SyncError('conflict', 'Conflito');
  if (res.status === 404 || res.status === 405) throw new SyncError('noserver', 'A sincronização só funciona no endereço do Netlify (com a função /api/sync).');
  if (res.status === 413) throw new SyncError('big', 'Dados demasiado grandes para sincronizar.');
  if (!res.ok) throw new SyncError('server', `Erro do servidor (${res.status}).`);
  const type = res.headers.get('content-type') || '';
  if (!type.includes('json')) throw new SyncError('noserver', 'A sincronização só funciona no endereço do Netlify (com a função /api/sync).');
  return res.json();
}

// ---------- Ciclo ----------

function localPrefs() {
  const values = {};
  for (const k of SYNC_PREF_KEYS) values[k] = prefs[k];
  return { _u: prefs.prefsU || 0, values };
}

async function cycle() {
  for (let attempt = 0; attempt < 4; attempt++) {
    const remoteRes = await api('GET');
    const remote = remoteRes.payload ? await decryptJSON(remoteRes.payload, await getAes()) : null;
    const local = { ...(await db.syncSnapshot()), prefs: localPrefs() };
    const m = mergeSync(local, remote, Date.now());
    if (m.localChanged) {
      await db.applySync({ put: m.put, del: m.del, tombs: m.tombs });
      if (m.prefs) replacePrefs({ ...prefs, ...m.prefs.values, prefsU: m.prefs._u });
      await reloadState();
    }
    if (m.needsPush) {
      try {
        const r = await api('PUT', { rev: remoteRes.rev, payload: await encryptJSON(m.data, await getAes()) });
        cfg.rev = r.rev;
      } catch (e) {
        if (e.code === 'conflict') continue; // outro dispositivo enviou entretanto: repete
        throw e;
      }
    }
    cfg.lastSync = Date.now();
    write();
    return m;
  }
  throw new SyncError('server', 'Não foi possível sincronizar (muitas alterações ao mesmo tempo).');
}

/** Sincroniza agora (se já houver uma em curso, repete no fim). */
export async function syncNow() {
  if (!cfg) return null;
  if (running) { again = true; return running; }
  running = (async () => {
    setStatus('syncing');
    try {
      const m = await cycle();
      setStatus('ok');
      return m;
    } catch (e) {
      setStatus(e.code === 'offline' ? 'offline' : 'error', e.message);
      if (e.code === 'pass') return null;
      return null;
    } finally {
      running = null;
      if (again) { again = false; setTimeout(syncNow, 500); }
    }
  })();
  return running;
}

/** Agenda uma sincronização uns segundos depois da última alteração. */
function schedule(ms = 3000) {
  if (!cfg) return;
  clearTimeout(timer);
  timer = setTimeout(syncNow, ms);
}

// ---------- Ativar / ligar / desligar ----------

/** Cria uma nova sincronização (primeiro dispositivo). Devolve o código. */
export async function enableNew(passphrase) {
  const id = makeSyncId(crypto.getRandomValues(new Uint8Array(16)));
  const { key, token } = await deriveKeys(passphrase, id);
  cfg = { id, k: b64(key), t: token, rev: 0, lastSync: null };
  aesKey = null;
  const probe = await api('GET').catch((e) => { cfg = null; aesKey = null; throw e; });
  if (probe.payload) { cfg = null; throw new SyncError('server', 'Código já usado. Tenta outra vez.'); }
  write();
  await syncNow();
  if (status.state === 'error') { const msg = status.message; cfg = null; aesKey = null; write(); throw new SyncError('server', msg); }
  return id;
}

/** Liga este dispositivo a uma sincronização existente (código + frase-passe). Junta os dados dos dois. */
export async function linkExisting(syncId, passphrase) {
  const { key, token } = await deriveKeys(passphrase, syncId);
  const prev = cfg;
  cfg = { id: syncId, k: b64(key), t: token, rev: 0, lastSync: null };
  aesKey = null;
  try {
    const res = await api('GET');
    if (!res.payload) throw new SyncError('pass', 'Não existe nenhuma sincronização com esse código.');
    await decryptJSON(res.payload, await getAes()); // confirma a frase-passe antes de mexer em dados
  } catch (e) {
    cfg = prev; aesKey = null;
    throw e;
  }
  write();
  await syncNow();
  return syncId;
}

/** Desliga a sincronização neste dispositivo (os dados ficam; o servidor não é apagado). */
export function disable() {
  cfg = null;
  aesKey = null;
  clearTimeout(timer);
  write();
  setStatus('off');
}

/** Liga os gatilhos automáticos. `reload` recarrega o estado da app depois de receber dados. */
export function initSync({ reload }) {
  reloadState = reload;
  db.onLocalWrite(() => schedule(3000));
  window.addEventListener('levelup-prefs-sync', () => schedule(3000));
  document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible') schedule(300); });
  window.addEventListener('online', () => schedule(500));
  setInterval(() => { if (document.visibilityState === 'visible') syncNow(); }, 120000);
  if (cfg) schedule(800);
}
