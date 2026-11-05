// Áreas por omissão + dados de exemplo (marcados com seed: true para se poderem apagar).
import { addDays } from './engine/dates.js';
import { isHabitScheduled, weekCount } from './engine/schedule.js';
import { xpForTask, coinsForXp } from './engine/xp.js';

export const DEFAULT_AREAS = [
  { id: 'saude', nome: 'Saúde', cor: '#30B651', icone: '💪', ordem: 0 },
  { id: 'mente', nome: 'Mente', cor: '#AF52DE', icone: '🧠', ordem: 1 },
  { id: 'carreira', nome: 'Carreira', cor: '#007AFF', icone: '💼', ordem: 2 },
  { id: 'financas', nome: 'Finanças', cor: '#D99A00', icone: '💰', ordem: 3 },
  { id: 'relacoes', nome: 'Relações', cor: '#FF2D55', icone: '❤️', ordem: 4 },
  { id: 'lazer', nome: 'Lazer', cor: '#FF9500', icone: '🎮', ordem: 5 },
];

export const uid = () =>
  crypto.randomUUID?.() ?? `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;

// Gerador pseudo-aleatório determinístico (os exemplos são sempre iguais).
function rng(seed) {
  return () => {
    seed |= 0;
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function buildSample(today) {
  const d = (n) => addDays(today, n);
  let ordem = 0;
  const habit = (titulo, areaId, dificuldade, recorrencia) => ({
    id: uid(), titulo, areaId, dificuldade, tipo: 'habito', recorrencia,
    criadaEm: d(-21), ordem: ordem++, seed: true,
  });
  const mission = (titulo, areaId, dificuldade, data) => ({
    id: uid(), titulo, areaId, dificuldade, tipo: 'pontual', data,
    criadaEm: d(-2), ordem: ordem++, seed: true,
  });

  const tasks = [
    habit('Dar 10 000 passos', 'saude', 'media', { tipo: 'diario' }),
    habit('30 min de leitura', 'mente', 'media', { tipo: 'diario' }),
    habit('Sem doces', 'saude', 'facil', { tipo: 'diario' }),
    habit('Treino de ginásio', 'saude', 'dificil', { tipo: 'xPorSemana', n: 4 }),
    habit('Meditar 10 min', 'mente', 'facil', { tipo: 'dias', dias: [2, 4, 6] }),
    habit('Registar despesas', 'financas', 'facil', { tipo: 'dias', dias: [1, 4] }),
    mission('Preparar apresentação', 'carreira', 'dificil', d(-1)),
    mission('Ligar à avó', 'relacoes', 'facil', d(0)),
    mission('Atualizar o CV', 'carreira', 'epica', d(0)),
    mission('Noite de jogos com amigos', 'lazer', 'media', d(2)),
  ];

  // Histórico das últimas 2 semanas (~70% dos hábitos cumpridos).
  const rand = rng(42);
  const log = [];
  for (let i = 14; i >= 1; i--) {
    const day = d(-i);
    for (const t of tasks) {
      if (t.tipo !== 'habito' || !isHabitScheduled(t, day)) continue;
      if (t.recorrencia.tipo === 'xPorSemana' && weekCount(log, t.id, day) >= t.recorrencia.n) continue;
      if (rand() > 0.72) continue;
      const xp = xpForTask(t);
      log.push({
        id: uid(), tipo: 'concluir', taskId: t.id, titulo: t.titulo, areaId: t.areaId,
        data: day, ts: Date.now() - i * 86400000, xp, moedas: coinsForXp(xp), seed: true,
      });
    }
  }
  return { tasks, log };
}
