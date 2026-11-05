// Dados de exemplo (marcados com seed: true para se poderem apagar).
import { addDays } from './engine/dates.js';
import { checkId, isScheduled, weekCount, makeIndex } from './engine/habits.js';

export const uid = () =>
  crypto.randomUUID?.() ?? `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;

// Pseudo-aleatório determinístico: os exemplos são sempre iguais.
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
  const habit = (nome, recorrencia, prob) => ({
    id: uid(), nome, recorrencia, criadaEm: d(-27), ordem: ordem++, seed: true, _p: prob,
  });
  const habits = [
    habit('10 000 passos', { tipo: 'diario' }, 0.85),
    habit('Ler 20 páginas', { tipo: 'diario' }, 0.7),
    habit('Sem açúcar', { tipo: 'diario' }, 0.65),
    habit('Ginásio', { tipo: 'xPorSemana', n: 4 }, 0.62),
    habit('Meditar 10 min', { tipo: 'dias', dias: [2, 4, 6] }, 0.8),
  ];

  const rand = rng(21);
  const checks = [];
  for (let i = 27; i >= 1; i--) {
    const day = d(-i);
    const idx = makeIndex(checks);
    for (const h of habits) {
      if (!isScheduled(h, day)) continue;
      if (h.recorrencia.tipo === 'xPorSemana' && weekCount(idx, h, day) >= h.recorrencia.n) continue;
      // Os últimos dias quase todos cumpridos, para se verem sequências.
      if (rand() > (i <= 6 ? 0.95 : h._p)) continue;
      checks.push({ id: checkId(h.id, day), habitId: h.id, data: day, ts: Date.now() - i * 86400000, seed: true });
    }
  }
  habits.forEach((h) => delete h._p);

  const journal = [
    {
      id: d(-1), data: d(-1), humor: 4, seed: true, atualizadoEm: Date.now() - 86400000,
      pergunta: 'Uma vitória de hoje, por pequena que seja.',
      texto: 'Fui ao ginásio mesmo sem vontade nenhuma. Os primeiros 10 minutos custaram, depois foi o melhor treino da semana.\n\nAmanhã: deitar antes da meia-noite.',
    },
    {
      id: d(-2), data: d(-2), humor: 2, seed: true, atualizadoEm: Date.now() - 2 * 86400000,
      pergunta: 'Onde é que hoje escolheste o conforto?',
      texto: 'Passei demasiado tempo no telemóvel à noite. Sei exatamente quando acontece: depois do jantar. Vou deixar o telemóvel a carregar fora do quarto.',
    },
    {
      id: d(-4), data: d(-4), humor: 5, seed: true, atualizadoEm: Date.now() - 4 * 86400000,
      pergunta: 'O que aprendeste hoje?',
      texto: 'Que fazer as coisas difíceis de manhã muda o dia todo. Apresentação feita, sem stress.',
    },
  ];

  return { habits, checks, journal };
}
