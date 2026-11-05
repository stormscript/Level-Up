// Estado da app em memória + gravação no IndexedDB.
// O histórico (log) é a fonte de verdade: XP e níveis são sempre calculados a partir dele.
import * as db from './db.js';
import { prefs, replacePrefs, setPref } from './prefs.js';
import { DEFAULT_AREAS, buildSample, uid } from './seed.js';
import { todayKey } from './engine/dates.js';
import { xpForTask, coinsForXp, levelFromXp, totalXp, xpByArea } from './engine/xp.js';

export const state = { areas: [], tasks: [], log: [], ready: false };

const listeners = new Set();
export const subscribe = (fn) => (listeners.add(fn), () => listeners.delete(fn));
const emit = () => listeners.forEach((fn) => fn(state));

export const areaById = (id) => state.areas.find((a) => a.id === id) || { id, nome: '—', cor: '#8E8E93', icone: '•' };

export async function load() {
  const meta = (await db.getAll('meta')).find((m) => m.id === 'app');
  if (!meta) {
    // Primeira utilização: áreas por omissão + dados de exemplo.
    const sample = buildSample(todayKey());
    await db.putMany('areas', DEFAULT_AREAS);
    await db.putMany('tasks', sample.tasks);
    await db.putMany('log', sample.log);
    await db.put('meta', { id: 'app', criadoEm: new Date().toISOString(), versaoDados: 1 });
  }
  await reload();
  navigator.storage?.persist?.().catch(() => {});
}

async function reload() {
  const [areas, tasks, log] = await Promise.all([db.getAll('areas'), db.getAll('tasks'), db.getAll('log')]);
  state.areas = areas.sort((a, b) => a.ordem - b.ordem);
  state.tasks = tasks.sort((a, b) => (a.ordem ?? 0) - (b.ordem ?? 0));
  state.log = log.sort((a, b) => a.ts - b.ts);
  state.ready = true;
  emit();
}

// ---------- Missões / hábitos ----------

export async function saveTask(task) {
  const t = { ...task };
  if (!t.id) {
    t.id = uid();
    t.criadaEm = todayKey();
    t.ordem = Date.now();
  }
  await db.put('tasks', t);
  const i = state.tasks.findIndex((x) => x.id === t.id);
  if (i >= 0) state.tasks[i] = t;
  else state.tasks.push(t);
  emit();
  return t;
}

/** Apaga a missão. O XP já ganho com ela fica no histórico (nunca se perde). */
export async function deleteTask(id) {
  await db.remove('tasks', id);
  state.tasks = state.tasks.filter((t) => t.id !== id);
  emit();
}

// ---------- Conclusões ----------

function snapshot(areaId) {
  return {
    level: levelFromXp(totalXp(state.log)).level,
    areaLevel: levelFromXp(xpByArea(state.log)[areaId] || 0).level,
  };
}

export async function completeTask(taskId, date = todayKey()) {
  const task = state.tasks.find((t) => t.id === taskId);
  if (!task) return null;
  const before = snapshot(task.areaId);
  const xp = xpForTask(task);
  const ev = {
    id: uid(), tipo: 'concluir', taskId, titulo: task.titulo, areaId: task.areaId,
    data: date, ts: Date.now(), xp, moedas: coinsForXp(xp),
  };
  await db.put('log', ev);
  state.log.push(ev);
  const after = snapshot(task.areaId);
  emit();
  return {
    xp,
    levelUp: after.level > before.level ? after.level : null,
    areaLevelUp: after.areaLevel > before.areaLevel ? after.areaLevel : null,
    area: areaById(task.areaId),
  };
}

/** Desfaz uma conclusão feita por engano (remove o evento e o respetivo XP). */
export async function uncompleteTask(taskId, date = todayKey()) {
  const task = state.tasks.find((t) => t.id === taskId);
  const matches = state.log.filter((e) => e.tipo === 'concluir' && e.taskId === taskId && (task?.tipo === 'pontual' || e.data === date));
  const ev = matches[matches.length - 1];
  if (!ev) return null;
  await db.remove('log', ev.id);
  state.log = state.log.filter((e) => e.id !== ev.id);
  emit();
  return { xp: ev.xp };
}

// ---------- Dados de exemplo ----------

export const hasSampleData = () => state.tasks.some((t) => t.seed) || state.log.some((e) => e.seed);

export async function clearSampleData() {
  const seedTaskIds = new Set(state.tasks.filter((t) => t.seed).map((t) => t.id));
  await db.removeMany('tasks', [...seedTaskIds]);
  // Remove também o XP ganho ao concluir missões de exemplo: começas do zero.
  await db.removeMany('log', state.log.filter((e) => e.seed || seedTaskIds.has(e.taskId)).map((e) => e.id));
  await reload();
}

export async function resetAll() {
  await db.replaceAll({ areas: DEFAULT_AREAS, meta: [{ id: 'app', criadoEm: new Date().toISOString(), versaoDados: 1 }] });
  await reload();
}

// ---------- Backup ----------

export async function exportData() {
  const dados = await db.exportAll();
  const { ultimoBackup, bannerInstalarFechado, ...prefsToSave } = prefs;
  return { app: 'LevelUp', versao: 1, exportadoEm: new Date().toISOString(), prefs: prefsToSave, dados };
}

export async function importData(json) {
  if (!json || json.app !== 'LevelUp' || typeof json.dados !== 'object') {
    throw new Error('Este ficheiro não é um backup da LevelUp.');
  }
  await db.replaceAll(json.dados);
  if (json.prefs) replacePrefs({ ...json.prefs, ultimoBackup: prefs.ultimoBackup, bannerInstalarFechado: prefs.bannerInstalarFechado });
  setPref('ultimoBackup', new Date().toISOString());
  await reload();
}
