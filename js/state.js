// Estado da app em memória + gravação no IndexedDB.
import * as db from './db.js';
import { prefs, replacePrefs, setPref } from './prefs.js';
import { buildSample, buildSampleExtras, buildSampleTodos, buildSampleObjectives, uid } from './seed.js';
import { todayKey } from './engine/dates.js';
import { checkId, makeIndex, migrateV1, streak } from './engine/habits.js';
import { nextDate } from './engine/todos.js';

export const state = {
  habits: [], checks: [], journal: [], events: [], goals: [], txs: [], todos: [], objectives: [],
  idx: new Set(), ready: false,
};

const listeners = new Set();
export const subscribe = (fn) => (listeners.add(fn), () => listeners.delete(fn));
const emit = () => {
  state.idx = makeIndex(state.checks);
  listeners.forEach((fn) => fn(state));
};

const DATA_VERSION = 5;
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
    await db.putMany('todos', s.todos);
    await db.putMany('objectives', s.objectives);
    await db.put('meta', META());
  } else if ((meta.versaoDados || 1) < DATA_VERSION) {
    // Vens de uma versão anterior: se ainda tens os exemplos, junta os exemplos novos.
    const ver = meta.versaoDados || 1;
    const habits = await db.getAll('habits');
    if (habits.some((h) => h.seed)) {
      const x = buildSampleExtras(todayKey(), habits);
      if (ver < 3) {
        await db.putMany('events', x.events);
        await db.putMany('goals', x.goals);
        await db.putMany('transactions', x.transactions);
        await db.putMany('todos', x.todos);
        await db.putMany('objectives', x.objectives);
        await db.putMany('goals', x.goals);
      } else {
        if (ver < 4) {
          await db.putMany('events', x.events.filter((e) => e.contagem));
          await db.putMany('todos', buildSampleTodos(todayKey(), await db.getAll('goals')));
        }
        const goals = await db.getAll('goals');
        const ob = buildSampleObjectives(todayKey(), goals);
        await db.putMany('objectives', ob.objectives);
        await db.putMany('goals', ob.goalLinks);
      }
    }
    await db.put('meta', { ...meta, versaoDados: DATA_VERSION });
  }
  await reload();
  navigator.storage?.persist?.().catch(() => {});
}

async function reload() {
  const [habits, checks, journal, events, goals, txs, todos] = await Promise.all(
    ['habits', 'checks', 'journal', 'events', 'goals', 'transactions', 'todos'].map((s) => db.getAll(s)),
  );
  state.todos = todos;
  state.objectives = await db.getAll('objectives');
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
    // Marcar um dia antes da criação do hábito: o hábito passa a "começar" nesse dia.
    const hb = state.habits.find((x) => x.id === habitId);
    if (hb && hb.criadaEm && date < hb.criadaEm) {
      const nh = { ...hb, criadaEm: date };
      await db.put('habits', nh);
      Object.assign(hb, nh);
    }
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

// ---------- Tarefas ----------

export function saveTodo(todo) {
  const t = stamp({ hora: '', prioridade: false, nota: '', passos: [], feito: false, repetir: 'nunca', ...todo });
  delete t.criadoEm;
  return upsert('todos', 'todos', t);
}

export async function deleteTodo(id) {
  const t = state.todos.find((x) => x.id === id);
  if (t?.goalEntryId) await unlinkGoalEntry(t);
  await removeFrom('todos', 'todos', id);
}

async function unlinkGoalEntry(t) {
  const g = state.goals.find((x) => x.id === t.goalId);
  if (g) await removeGoalEntry(g, t.goalEntryId);
}

/**
 * Concluir / desfazer uma tarefa.
 * - Se se repete, cria a próxima ao concluir (e apaga-a se desfizeres).
 * - Se está ligada a uma meta "à mão", soma +1 (e tira se desfizeres).
 */
export async function toggleTodo(id, today = todayKey()) {
  const t = state.todos.find((x) => x.id === id);
  if (!t) return null;
  const next = { ...t };
  delete next.seed;
  if (!t.feito) {
    next.feito = true;
    next.feitoEm = today;
    const nd = t.repetir && t.repetir !== 'nunca' ? nextDate(t.data, t.repetir) : null;
    if (nd && !t.proximaId) {
      const copy = await saveTodo({ ...t, id: null, data: nd, feito: false, feitoEm: null, proximaId: null, goalEntryId: null, seed: undefined,
        passos: (t.passos || []).map((p) => ({ ...p, feito: false })) });
      next.proximaId = copy.id;
    }
    const g = t.goalId && state.goals.find((x) => x.id === t.goalId);
    if (g && g.medida !== 'feito' && (g.modo || 'manual') === 'manual') {
      const entryId = uid();
      await saveGoal({ ...g, registos: [...(g.registos || []), { id: entryId, data: today, valor: 1, tarefa: t.id }] });
      next.goalEntryId = entryId;
    }
  } else {
    next.feito = false;
    next.feitoEm = null;
    if (t.proximaId) {
      const copy = state.todos.find((x) => x.id === t.proximaId);
      if (copy && !copy.feito) await removeFrom('todos', 'todos', copy.id);
      next.proximaId = null;
    }
    if (t.goalEntryId) {
      await unlinkGoalEntry(t);
      next.goalEntryId = null;
    }
  }
  await upsert('todos', 'todos', next);
  return { done: next.feito };
}

/** Muda a tarefa de dia (null = sem data). */
export function moveTodo(id, data) {
  const t = state.todos.find((x) => x.id === id);
  return t ? upsert('todos', 'todos', { ...t, data }) : null;
}

export function toggleStep(id, stepId) {
  const t = state.todos.find((x) => x.id === id);
  if (!t) return null;
  return upsert('todos', 'todos', { ...t, passos: (t.passos || []).map((p) => (p.id === stepId ? { ...p, feito: !p.feito } : p)) });
}

/** "Planear amanhã": marca até 3 tarefas como prioridade e guarda que já planeaste. */
export async function setPriorities(date, ids) {
  for (const t of state.todos.filter((x) => x.data === date)) {
    const want = ids.includes(t.id);
    if (!!t.prioridade !== want) await upsert('todos', 'todos', { ...t, prioridade: want });
  }
  setPref('planeadoPara', date);
  emit();
}

// ---------- Objetivos ----------

export function saveObjective(o) {
  const x = stamp({ registos: [], marcos: [], ...o });
  if (!x.inicio) x.inicio = todayKey();
  delete x.criadoEm;
  delete x.seed;
  return upsert('objectives', 'objectives', x);
}

/** Apaga o objetivo (as metas ligadas ficam soltas). */
export async function deleteObjective(id) {
  for (const g of state.goals.filter((x) => x.objetivoId === id)) {
    const ng = { ...g, objetivoId: null };
    await db.put('goals', ng);
    Object.assign(g, ng);
  }
  await removeFrom('objectives', 'objectives', id);
}

export function addObjectiveEntry(o, valor, data = todayKey()) {
  return saveObjective({ ...o, registos: [...(o.registos || []), { id: uid(), data, valor }] });
}
export function removeObjectiveEntry(o, entryId) {
  return saveObjective({ ...o, registos: (o.registos || []).filter((r) => r.id !== entryId) });
}
export function toggleObjectiveStep(o, stepId) {
  const today = todayKey();
  return saveObjective({ ...o, marcos: (o.marcos || []).map((m) => (m.id === stepId ? { ...m, feito: !m.feito, feitoEm: m.feito ? null : today } : m)) });
}

// ---------- Dados de exemplo ----------

export const hasSampleData = () =>
  ['habits', 'checks', 'journal', 'events', 'goals', 'txs', 'todos', 'objectives'].some((k) => state[k].some((x) => x.seed));

export async function clearSampleData() {
  const seedHabits = new Set(state.habits.filter((h) => h.seed).map((h) => h.id));
  await db.removeMany('habits', [...seedHabits]);
  await db.removeMany('checks', state.checks.filter((c) => c.seed || seedHabits.has(c.habitId)).map((c) => c.id));
  for (const [store, key] of [['journal', 'journal'], ['events', 'events'], ['goals', 'goals'], ['transactions', 'txs'], ['todos', 'todos'], ['objectives', 'objectives']]) {
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
