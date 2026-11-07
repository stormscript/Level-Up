// Estado da app em memória + gravação no IndexedDB.
import * as db from './db.js';
import { prefs, replacePrefs, setPref } from './prefs.js';
import { uid } from './seed.js';
import { todayKey, addDays } from './engine/dates.js';
import { checkId, makeIndex, migrateV1, streak, dayState, isAvoid, isQty } from './engine/habits.js';
import { nextDate } from './engine/todos.js';
import { dueRecurring, recurringDate } from './engine/money.js';

export const state = {
  habits: [], checks: [], journal: [], events: [], goals: [], txs: [], todos: [], objectives: [], recurring: [],
  idx: new Set(), ready: false,
};

const listeners = new Set();
export const subscribe = (fn) => (listeners.add(fn), () => listeners.delete(fn));
const emit = () => {
  state.idx = makeIndex(state.checks);
  listeners.forEach((fn) => fn(state));
};

const DATA_VERSION = 7;
const META = () => ({ id: 'app', criadoEm: new Date().toISOString(), versaoDados: DATA_VERSION });

/** Contexto para calcular o progresso das metas. */
export const goalCtx = () => ({ goals: state.goals, checks: state.checks, txs: state.txs });

export async function load() {
  const meta = (await db.getAll('meta')).find((m) => m.id === 'app');
  if (!meta) {
    // Primeira utilização: começa vazia.
    await db.put('meta', META());
  } else if ((meta.versaoDados || 1) < DATA_VERSION) {
    // Versão 7: a app deixa de ter exemplos. Apaga os que ainda existam; o que criaste fica.
    await removeSampleData();
    await db.put('meta', { ...meta, versaoDados: DATA_VERSION });
  }
  await reload();
  navigator.storage?.persist?.().catch(() => {});
}

/** Apaga tudo o que foi criado como exemplo (marcado com `seed`), em todas as listas. */
async function removeSampleData() {
  const seedHabits = new Set((await db.getAll('habits')).filter((h) => h.seed).map((h) => h.id));
  for (const store of Object.keys(db.STORES)) {
    if (store === 'meta') continue;
    const rows = await db.getAll(store);
    const ids = rows.filter((r) => r.seed || (store === 'checks' && seedHabits.has(r.habitId))).map((r) => r.id);
    if (ids.length) await db.removeMany(store, ids);
  }
}

async function reload() {
  const [habits, checks, journal, events, goals, txs, todos] = await Promise.all(
    ['habits', 'checks', 'journal', 'events', 'goals', 'transactions', 'todos'].map((s) => db.getAll(s)),
  );
  state.todos = todos;
  state.objectives = await db.getAll('objectives');
  state.recurring = await db.getAll('recurring');
  state.habits = habits.sort((a, b) => (a.ordem ?? 0) - (b.ordem ?? 0));
  state.checks = checks;
  state.journal = journal.sort((a, b) => (a.data < b.data ? 1 : -1));
  state.events = events;
  state.goals = goals;
  state.txs = txs;
  // Lança os fixos em falta depois de todas as listas estarem carregadas.
  await launchRecurring();
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

/** Guarda (ou apaga, com `data = null`) a marcação de um hábito num dia. */
async function writeCheck(habitId, date, data) {
  const id = checkId(habitId, date);
  state.checks = state.checks.filter((c) => c.id !== id);
  if (!data) {
    await db.remove('checks', id);
  } else {
    const c = { id, habitId, data: date, ts: Date.now(), ...data };
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
}

const result = (habitId, date) => {
  const h = state.habits.find((x) => x.id === habitId);
  const st = h ? dayState(h, state.idx, date, date) : null;
  return { done: st === 'done' || st === 'min', state: st, streak: h ? streak(h, state.idx, date) : null };
};

/**
 * Toque normal num hábito, num dia:
 * - normal: feito ↔ por fazer (com versão mínima: por fazer → feito → mínimo → por fazer)
 * - com quantidade: por fazer/parcial → alvo atingido → por fazer
 * - a evitar: limpo ↔ deslize
 */
export async function toggleCheck(habitId, date = todayKey()) {
  const h = state.habits.find((x) => x.id === habitId);
  if (!h) return null;
  const c = state.checks.find((x) => x.id === checkId(habitId, date));
  if (isAvoid(h)) await writeCheck(habitId, date, c ? null : { deslize: true });
  else if (isQty(h)) {
    const full = c && !c.min && (Number(c.valor) || 0) >= Number(h.quantidade.alvo);
    if (full && h.minimo) await writeCheck(habitId, date, { min: true, valor: Number(c.valor) || 0 });
    else if (full || c?.min) await writeCheck(habitId, date, null);
    else await writeCheck(habitId, date, { valor: Number(h.quantidade.alvo) });
  } else if (!c) await writeCheck(habitId, date, {});
  else if (!c.min && h.minimo) await writeCheck(habitId, date, { min: true });
  else await writeCheck(habitId, date, null);
  return result(habitId, date);
}

/** Soma (ou tira) uma quantidade num dia. */
export async function addQty(habitId, date, delta) {
  const h = state.habits.find((x) => x.id === habitId);
  if (!h) return null;
  const c = state.checks.find((x) => x.id === checkId(habitId, date));
  const valor = Math.max(0, Math.round(((Number(c?.valor) || 0) + delta) * 100) / 100);
  await writeCheck(habitId, date, valor > 0 ? { valor } : null);
  return result(habitId, date);
}

/** Define a quantidade de um dia (0 apaga). */
export async function setQty(habitId, date, valor) {
  await writeCheck(habitId, date, valor > 0 ? { valor } : null);
  return result(habitId, date);
}

/** Marca "fiz o mínimo" (ou desmarca). */
export async function setMin(habitId, date, on) {
  const c = state.checks.find((x) => x.id === checkId(habitId, date));
  await writeCheck(habitId, date, on ? { ...(c ? { valor: c.valor } : {}), min: true } : null);
  return result(habitId, date);
}

/** Pausar / retomar um hábito (os dias em pausa não contam nem quebram a sequência). */
export async function setPaused(habitId, on, today = todayKey()) {
  const h = state.habits.find((x) => x.id === habitId);
  if (!h) return;
  const pausas = [...(h.pausas || [])];
  const open = pausas.find((p) => !p.ate);
  if (on && !open) pausas.push({ de: today, ate: null });
  if (!on && open) {
    if (open.de >= today) pausas.splice(pausas.indexOf(open), 1);
    else open.ate = addDays(today, -1);
  }
  await saveHabit({ ...h, pausas });
}

/** Muda a ordem de um hábito (−1 sobe, +1 desce). */
export async function moveHabit(habitId, dir) {
  const list = [...state.habits];
  const i = list.findIndex((h) => h.id === habitId);
  const j = i + dir;
  if (i < 0 || j < 0 || j >= list.length) return;
  [list[i], list[j]] = [list[j], list[i]];
  const updated = list.map((h, k) => ({ ...h, ordem: k }));
  await db.putMany('habits', updated);
  state.habits = updated;
  emit();
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

// ---------- Fixos (lançados sozinhos todos os meses) ----------

/** Lança os movimentos fixos em falta até hoje. Chamado ao abrir a app. */
export async function launchRecurring(today = todayKey()) {
  let created = 0;
  for (const r of state.recurring) {
    const due = dueRecurring(r, today);
    if (!due.length) continue;
    const txs = due.map(({ month, data }) => ({
      id: `${r.id}|${month}`, tipo: r.tipo || 'despesa', valor: r.valor, categoria: r.categoria,
      nota: r.nota, data, ts: Date.now(), fixoId: r.id,
    }));
    await db.putMany('transactions', txs);
    for (const t of txs) if (!state.txs.some((x) => x.id === t.id)) state.txs.push(t);
    r.ultimoMes = due[due.length - 1].month;
    await db.put('recurring', r);
    created += txs.length;
  }
  return created;
}

/** Ao voltar à app (pode ter mudado o dia): lança os fixos em falta e atualiza os ecrãs. */
export async function refreshDaily() {
  const n = await launchRecurring();
  if (n) emit();
  return n;
}

export async function saveRecurring(r, { launchThisMonth = false } = {}) {
  const isNew = !r.id;
  const x = stamp({ tipo: 'despesa', ativo: true, ...r });
  delete x.criadoEm;
  const today = todayKey();
  if (!x.inicio) x.inicio = today.slice(0, 7);
  // Ao criar: se o dia deste mês já passou, só lança este mês se pedires (evita duplicar o que já registaste).
  if (isNew && !launchThisMonth && recurringDate(x, today.slice(0, 7)) <= today) x.ultimoMes = today.slice(0, 7);
  await upsert('recurring', 'recurring', x);
  await launchRecurring();
  emit();
  return x;
}

/** Apaga o fixo. Os movimentos já lançados ficam (são história). */
export const deleteRecurring = (id) => removeFrom('recurring', 'recurring', id);

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
  await removeSampleData();
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
