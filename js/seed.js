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

  return { habits, checks, journal, ...buildSampleExtras(today, habits) };
}

/** Exemplos da Fase B: agenda, metas e finanças. */
export function buildSampleExtras(today, habits = []) {
  const d = (n) => addDays(today, n);
  const month = today.slice(0, 7);
  const monday = addDays(today, 1 - weekdayOf(today));
  const gym = habits.find((h) => h.nome === 'Ginásio');

  const ev = (titulo, data, inicio, fim, extra = {}) => ({ id: uid(), titulo, data, inicio, fim, repetir: 'nunca', seed: true, ...extra });
  const events = [
    ev('Aula · Marketing Digital', addDays(monday, 0), '10:00', '11:30', { local: 'Sala 2.14', repetir: 'semanal' }),
    ev('Aula · Finanças Empresariais', addDays(monday, 2), '14:00', '15:30', { local: 'Anfiteatro B', repetir: 'semanal' }),
    ev('Ginásio — Push day', d(0), '18:30', '19:45'),
    ev('Almoço com a Inês', d(0), '13:00', '14:00', { local: 'Time Out Market' }),
    ev('Jantar de aniversário do Rui', d(1), '21:00', '23:30', { local: 'Bairro Alto' }),
    ev('Entrega do trabalho de grupo', d(3), '', '', {}),
    ev('Corte de cabelo', d(2), '17:00', '17:45'),
  ];

  let ordem = 0;
  const goal = (g) => ({ id: uid(), ordem: ordem++, registos: [], seed: true, medida: 'numero', modo: 'manual', unidade: '', ...g });
  const save = goal({ tipo: 'mes', periodo: month, titulo: 'Poupar 300 €', alvo: 300, unidade: '€', modo: 'poupanca' });
  const books = goal({ tipo: 'mes', periodo: month, titulo: 'Ler 2 livros', alvo: 2, unidade: 'livros', registos: [{ id: uid(), data: d(-3), valor: 1 }] });
  const train = goal({ tipo: 'mes', periodo: month, titulo: 'Treinar 16 vezes', alvo: 16, unidade: 'treinos', modo: gym ? 'habito' : 'manual', habitId: gym?.id });
  const goals = [
    save, books, train,
    goal({ tipo: 'mes', periodo: month, titulo: 'Tirar a carta de condução', medida: 'feito', feito: false }),
    goal({ tipo: 'semana', periodo: monday, titulo: 'Treinar 4x', alvo: 4, unidade: 'treinos', modo: gym ? 'habito' : 'manual', habitId: gym?.id, paiId: train.id }),
    goal({ tipo: 'semana', periodo: monday, titulo: 'Ler 100 páginas', alvo: 100, unidade: 'páginas', paiId: books.id, registos: [{ id: uid(), data: d(-1), valor: 40 }, { id: uid(), data: d(0), valor: 22 }] }),
    goal({ tipo: 'semana', periodo: monday, titulo: 'Poupar 75 €', alvo: 75, unidade: '€', modo: 'poupanca', paiId: save.id }),
    goal({ tipo: 'semana', periodo: monday, titulo: 'Acabar o trabalho de grupo', medida: 'feito', feito: false }),
  ];

  const tx = (tipo, valor, categoria, daysAgo, nota = '') => {
    const data = d(-daysAgo);
    return data.slice(0, 7) === month || daysAgo === 0
      ? { id: uid(), tipo, valor, categoria, data, nota, ts: Date.now() - daysAgo * 86400000, seed: true }
      : null;
  };
  const transactions = [
    tx('receita', 45000, 'mesada', Number(today.slice(8)) - 1, 'Mesada'),
    tx('receita', 12000, 'extra', 6, 'Explicações'),
    tx('despesa', 4280, 'super', 6, 'Continente'),
    tx('despesa', 1250, 'comida', 5, 'Almoço na faculdade'),
    tx('despesa', 2200, 'saidas', 4, 'Sexta à noite'),
    tx('despesa', 3000, 'ginasio', Number(today.slice(8)) - 1, 'Mensalidade ginásio'),
    tx('despesa', 1199, 'subs', 3, 'Spotify + iCloud'),
    tx('despesa', 4000, 'transporte', 3, 'Passe'),
    tx('despesa', 890, 'comida', 2, 'Café + pastel'),
    tx('despesa', 3499, 'compras', 1, 'T-shirt'),
    tx('despesa', 1450, 'comida', 0, 'Almoço com a Inês'),
  ].filter(Boolean);

  return { events, goals, transactions };
}

function weekdayOf(key) {
  const w = new Date(`${key}T12:00:00`).getDay();
  return w === 0 ? 7 : w;
}
