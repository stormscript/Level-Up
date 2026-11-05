// Estado da app em memória + gravação no IndexedDB.
import * as db from './db.js';
import { prefs, replacePrefs, setPref } from './prefs.js';
import { buildSample, buildSampleExtras, uid } from './seed.js';
import { todayKey } from './engine/dates.js';
import { checkId, makeIndex, migrateV1, streak } from './engine/habits.js';

export const state = {
  habits: [], checks: [], journal: [], events: [], goals: [], txs: [],
  idx: new Set(), ready: false,
};

const listeners = new Set();
export const subscribe = (fn) => (listeners.add(fn), () => listeners.delete(fn));
const emit = () => {
  state.idx = makeIndex(state.checks);
  listeners.forEach((fn) => fn(state));
};

const DATA_VERSION = 3;
const META = () => ({ id: 'app', criadoEm: new Date().toISOString(), versaoDados: DATA_VERSION });

/** Contexto para calcular o progresso das metas. */
export const goalCtx = () => ({ goals: state.goals, checks: state.checks, txs: state.txs });

export async function load() {
  const meta = (await db.getAll('meta')).find((m) => m.id === 'app');
  if (!meta) {
    // Primeira utilização: dados de exemplo.
    const s = buildSample(todayKey());
    await db.putMany('habits', s.habits);
    await db.putMany('checks', s.checks);
    await db.putMany('journal', s.journal);
    await db.putMany('events', s.events);
    await db.putMany('goals', s.goals);
    await db.putMany('transactions', s.transactions);
    await db.put('meta', META());
  } else if ((meta.versaoDados || 1) < DATA_VERSION) {
    // Vinhas da Fase A: se ainda tens os exemplos, junta exemplos de agenda, metas e finanças.
    const habits = await db.getAll('habits');
    if (habits.some((h) => h.seed)) {
      const x = buildSampleExtras(todayKey(), habits);
      await db.putMany('events', x.events);
      await db.putMany('goals', x.goals);
      await db.putMany('transactions', x.transactions);
    }
    await db.put('meta', { ...meta, versaoDados: DATA_VERSION });
  }
  await reload();
  navigator.storage?.persist?.().catch(() => {});
}

async function reload() {
  const [habits, checks, journal, events, goals, txs] = await Promise.all(
    ['habits', 'checks', 'journal', 'events', 'goals', 'transactions'].map((s) => db.getAll(s)),
  );
  state.habits = habits.sort((a, b) => (a.ordem ?? 0) - (b.ordem ?? 0));
  state.checks = checks;
  state.journal = journal.sort((a, b) => (a.data < b.data ? 1 : -1));
  state.events = events;
  state.goals = goals;
  state.txs = txs;
  state.ready = true;
  emit();
}

// Guardar/apagar genérico numa lista do estado.
async function upsert(store, key, item) {
  await db.put(store, item);
  const list = state[key];
  const i = list.findIndex((x) => x.id === item.id);
  if (i >= 0) list[i] = item;
  else list.push(item);
  emit();
  return item;
}
async function removeFrom(store, key, id) {
  await db.remove(store, id);
  state[key] = state[key].filter((x) => x.id !== id);
  emit();
}
const stamp = (item) => (item.id ? { ...item } : { ...item, id: uid(), ordem: Date.now(), criadoEm: todayKey() });

// ---------- Hábitos ----------

export function saveHabit(habit) {
  const h = stamp(habit);
  if (!h.criadaEm) h.criadaEm = todayKey();
  delete h.criadoEm;
  return upsert('habits', 'habits', h);
}

/** Apaga o hábito e o respetivo histórico. As metas ligadas a ele passam a manuais. */
export async function deleteHabit(id) {
  await db.removeMany('checks', state.checks.filter((c) => c.habitId === id).map((c) => c.id));
  state.checks = state.checks.filter((c) => c.habitId !== id);
  for (const g of state.goals.filter((g) => g.habitId === id)) {
    const ng = { ...g, modo: 'manual', habitId: null };
    await db.put('goals', ng);
    Object.assign(g, ng);
  }
  await removeFrom('habits', 'habits', id);
}

/** Marca/desmarca um hábito num dia. Devolve { done, streak }. */
export async function toggleCheck(habitId, date = todayKey()) {
  const id = checkId(habitId, date);
  const exists = state.checks.some((c) => c.id === id);
  if (exists) {
    await db.remove('checks', id);
    state.checks = state.checks.filter((c) => c.id !== id);
  } else {
    const c = { id, habitId, data: date, ts: Date.now() };
    await db.put('checks', c);
    state.checks.push(c);
  }
  emit();
  const h = state.habits.find((x) => x.id === habitId);
  return { done: !exists, streak: h ? streak(h, state.idx, date) : null };
}

// ---------- Diário ----------

export const journalOn = (date) => state.journal.find((j) => j.id === date) || null;

/** Guarda a entrada do dia. Sem texto e sem humor → apaga. */
export async function saveJournal(entry) {
  const empty = !entry.texto?.trim() && !entry.humor;
  if (empty) {
    if (journalOn(entry.data)) {
      await db.remove('journal', entry.data);
      state.journal = state.journal.filter((j) => j.id !== entry.data);
      emit();
    }
    return;
  }
  const j = { ...entry, id: entry.data, atualizadoEm: Date.now() };
  delete j.seed;
  await db.put('journal', j);
  state.journal = [j, ...state.journal.filter((x) => x.id !== j.id)].sort((a, b) => (a.data < b.data ? 1 : -1));
  emit();
}

// ---------- Agenda ----------

export const saveEvent = (ev) => upsert('events', 'events', stamp(ev));
export const deleteEvent = (id) => removeFrom('events', 'events', id);
/** Apaga só uma ocorrência de um evento que se repete. */
export function skipOccurrence(ev, date) {
  return upsert('events', 'events', { ...ev, excecoes: [...(ev.excecoes || []), date] });
}

// ---------- Metas ----------

export const saveGoal = (g) => upsert('goals', 'goals', stamp(g));

/** Apaga a meta (as metas semanais ligadas a ela ficam soltas). */
export async function deleteGoal(id) {
  for (const c of state.goals.filter((g) => g.paiId === id)) {
    const nc = { ...c, paiId: null };
    await db.put('goals', nc);
    Object.assign(c, nc);
  }
  await removeFrom('goals', 'goals', id);
}

export function addGoalEntry(goal, valor, data = todayKey()) {
  return saveGoal({ ...goal, registos: [...(goal.registos || []), { id: uid(), data, valor }] });
}
export function removeGoalEntry(goal, entryId) {
  return saveGoal({ ...goal, registos: (goal.registos || []).filter((r) => r.id !== entryId) });
}

// ---------- Finanças ----------

export function saveTx(tx) {
  const t = stamp(tx);
  t.ts ??= Date.now();
  delete t.ordem;
  delete t.criadoEm;
  delete t.seed;
  return upsert('transactions', 'txs', t);
}
export const deleteTx = (id) => removeFrom('transactions', 'txs', id);

// ---------- Dados de exemplo ----------

export const hasSampleData = () =>
  ['habits', 'checks', 'journal', 'events', 'goals', 'txs'].some((k) => state[k].some((x) => x.seed));

export async function clearSampleData() {
  const seedHabits = new Set(state.habits.filter((h) => h.seed).map((h) => h.id));
  await db.removeMany('habits', [...seedHabits]);
  await db.removeMany('checks', state.checks.filter((c) => c.seed || seedHabits.has(c.habitId)).map((c) => c.id));
  for (const [store, key] of [['journal', 'journal'], ['events', 'events'], ['goals', 'goals'], ['transactions', 'txs']]) {
    await db.removeMany(store, state[key].filter((x) => x.seed).map((x) => x.id));
  }
  await reload();
}

export async function resetAll() {
  await db.replaceAll({ meta: [META()] });
  await reload();
}

// ---------- Backup ----------

export async function exportData() {
  const dados = await db.exportAll();
  const { ultimoBackup, bannerInstalarFechado, ...prefsToSave } = prefs;
  return { app: 'LevelUp', versao: DATA_VERSION, exportadoEm: new Date().toISOString(), prefs: prefsToSave, dados };
}

export async function importData(json) {
  if (!json || json.app !== 'LevelUp' || typeof json.dados !== 'object') {
    throw new Error('Este ficheiro não é um backup da LevelUp.');
  }
  let dados = json.dados;
  if ((json.versao || 1) < 2) {
    const { habits, checks } = migrateV1(dados.tasks, dados.log);
    dados = { habits, checks };
  }
  dados = { ...dados, meta: [META()] };
  await db.replaceAll(dados);
  if (json.prefs) replacePrefs({ ...json.prefs, ultimoBackup: prefs.ultimoBackup, bannerInstalarFechado: prefs.bannerInstalarFechado });
  setPref('ultimoBackup', new Date().toISOString());
  await reload();
}
