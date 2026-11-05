// Estado da app em memória + gravação no IndexedDB.
import * as db from './db.js';
import { prefs, replacePrefs, setPref } from './prefs.js';
import { buildSample, uid } from './seed.js';
import { todayKey } from './engine/dates.js';
import { checkId, makeIndex, migrateV1, streak } from './engine/habits.js';

export const state = { habits: [], checks: [], journal: [], idx: new Set(), ready: false };

const listeners = new Set();
export const subscribe = (fn) => (listeners.add(fn), () => listeners.delete(fn));
const emit = () => {
  state.idx = makeIndex(state.checks);
  listeners.forEach((fn) => fn(state));
};

const META = () => ({ id: 'app', criadoEm: new Date().toISOString(), versaoDados: 2 });

export async function load() {
  const meta = (await db.getAll('meta')).find((m) => m.id === 'app');
  if (!meta) {
    // Primeira utilização: dados de exemplo.
    const s = buildSample(todayKey());
    await db.putMany('habits', s.habits);
    await db.putMany('checks', s.checks);
    await db.putMany('journal', s.journal);
    await db.put('meta', META());
  }
  await reload();
  navigator.storage?.persist?.().catch(() => {});
}

async function reload() {
  const [habits, checks, journal] = await Promise.all([db.getAll('habits'), db.getAll('checks'), db.getAll('journal')]);
  state.habits = habits.sort((a, b) => (a.ordem ?? 0) - (b.ordem ?? 0));
  state.checks = checks;
  state.journal = journal.sort((a, b) => (a.data < b.data ? 1 : -1));
  state.ready = true;
  emit();
}

// ---------- Hábitos ----------

export async function saveHabit(habit) {
  const h = { ...habit };
  if (!h.id) {
    h.id = uid();
    h.criadaEm = todayKey();
    h.ordem = Date.now();
  }
  await db.put('habits', h);
  const i = state.habits.findIndex((x) => x.id === h.id);
  if (i >= 0) state.habits[i] = h;
  else state.habits.push(h);
  emit();
  return h;
}

/** Apaga o hábito e o respetivo histórico. */
export async function deleteHabit(id) {
  await db.remove('habits', id);
  const mine = state.checks.filter((c) => c.habitId === id).map((c) => c.id);
  await db.removeMany('checks', mine);
  state.habits = state.habits.filter((h) => h.id !== id);
  state.checks = state.checks.filter((c) => c.habitId !== id);
  emit();
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
  delete j.seed; // se editares um exemplo, passa a ser teu
  await db.put('journal', j);
  state.journal = [j, ...state.journal.filter((x) => x.id !== j.id)].sort((a, b) => (a.data < b.data ? 1 : -1));
  emit();
}

// ---------- Dados de exemplo ----------

export const hasSampleData = () =>
  state.habits.some((h) => h.seed) || state.checks.some((c) => c.seed) || state.journal.some((j) => j.seed);

export async function clearSampleData() {
  const seedHabits = new Set(state.habits.filter((h) => h.seed).map((h) => h.id));
  await db.removeMany('habits', [...seedHabits]);
  await db.removeMany('checks', state.checks.filter((c) => c.seed || seedHabits.has(c.habitId)).map((c) => c.id));
  await db.removeMany('journal', state.journal.filter((j) => j.seed).map((j) => j.id));
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
  return { app: 'LevelUp', versao: 2, exportadoEm: new Date().toISOString(), prefs: prefsToSave, dados };
}

export async function importData(json) {
  if (!json || json.app !== 'LevelUp' || typeof json.dados !== 'object') {
    throw new Error('Este ficheiro não é um backup da LevelUp.');
  }
  let dados = json.dados;
  if ((json.versao || 1) < 2) {
    // Backup antigo (versão gamificada): recupera os hábitos.
    const { habits, checks } = migrateV1(dados.tasks, dados.log);
    dados = { habits, checks, meta: [META()] };
  }
  await db.replaceAll(dados);
  if (json.prefs) replacePrefs({ ...json.prefs, ultimoBackup: prefs.ultimoBackup, bannerInstalarFechado: prefs.bannerInstalarFechado });
  setPref('ultimoBackup', new Date().toISOString());
  await reload();
}
