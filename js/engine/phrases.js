// Frases-gatilho: curtas, discretas, em minúsculas. Escolhidas pela data (não mudam a cada toque).
// Podes acrescentar as tuas em Definições → Frases.

export const TRIGGERS = {
  geral: [
    'ninguém vem salvar-te. ainda bem.',
    'o teu eu de daqui a um ano está a ver.',
    'faz em silêncio.',
    'eles estão a dormir.',
    'conforto também se paga.',
    'não negocies contigo.',
    'um dia ou dia um.',
    'hoje conta.',
    'menos conversa.',
    'a sorte gosta de quem aparece.',
    'ninguém te deve nada. vai buscar.',
    'cumpre o que prometeste a ti.',
    'calma por fora. fome por dentro.',
    'o telemóvel pode esperar.',
    'ninguém vê o treino. todos veem o resultado.',
    'mais um. sempre mais um.',
    'é isto que separa.',
    'foco é saber dizer não.',
    'a média está confortável.',
    'sem plateia. sem pressa. sem parar.',
    'lembra-te porque começaste.',
    'a concorrência és tu, ontem.',
    'ninguém fica a saber. tu ficas.',
    'pequeno, mas todos os dias.',
    'a desculpa também cansa.',
    'devagar também chega. parado não.',
    'quem tu és é o que repetes.',
    'a vida que queres não acontece por acaso.',
    'menos scroll. mais vida.',
    'ainda não acabaste.',
  ],
  manha: [
    'acorda antes da desculpa.',
    'o dia ainda é todo teu.',
    'primeiro o mais difícil.',
    'a cama não te leva a lado nenhum.',
    'começa antes de estares pronto.',
  ],
  noite: [
    'fecha o dia como deve ser.',
    'amanhã começa agora.',
    'o que fizeste hoje fica.',
    'dorme a saber que deste tudo.',
    'ecrã desligado. cabeça limpa.',
  ],
  fechado: [
    'dia fechado. ✦',
    'foi isto que prometeste.',
    'assim é que é.',
    'mais um tijolo.',
    'silêncio. trabalho feito.',
  ],
};

export const JOURNAL_PROMPTS = [
  'O que fizeste hoje que o teu eu de há um ano não faria?',
  'Onde é que hoje escolheste o conforto?',
  'Uma vitória de hoje, por pequena que seja.',
  'O que é que te está a travar esta semana?',
  'Se amanhã fosse perfeito, como seria?',
  'Pelo que estás grato hoje?',
  'O que aprendeste hoje?',
  'Que conversa andas a adiar?',
  'O que fizeste hoje só por ti?',
  'De 1 a 10, quanto deste hoje? Porquê?',
  'O que te deu energia hoje? E o que ta tirou?',
  'Que hábito te está a custar mais? Porquê?',
  'Quem queres ser daqui a 5 anos? Hoje aproximaste-te?',
  'O que farias se não tivesses medo de falhar?',
];

/** Hash simples e estável de uma string → inteiro. */
export function hash(str) {
  let h = 2166136261;
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

export const pick = (list, seed) => (list.length ? list[hash(seed) % list.length] : '');

/** Frase do momento: muda com o dia, a parte do dia e o sítio (`slot`). */
export function trigger(date, { hour = new Date().getHours(), slot = '', custom = [] } = {}) {
  const part = hour >= 5 && hour < 12 ? 'manha' : hour >= 20 || hour < 5 ? 'noite' : '';
  const pool = [...TRIGGERS.geral, ...(part ? TRIGGERS[part] : []), ...custom.filter(Boolean)];
  return pick(pool, `${date}|${part}|${slot}`);
}

export const closingLine = (date) => pick(TRIGGERS.fechado, date);

export const journalPrompt = (date) => pick(JOURNAL_PROMPTS, `${date}|diario`);
