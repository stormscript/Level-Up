// Preferências simples em localStorage (os dados "a sério" vivem no IndexedDB).
const KEY = 'levelup:prefs';

const DEFAULTS = {
  nome: '', // para a saudação
  som: false,
  mostrarFrases: true,
  frases: [], // frases tuas, misturadas com as da app
  orcamento: 60000, // orçamento mensal de despesas, em cêntimos (0 = sem orçamento)
  limites: {}, // limite mensal por categoria { idCategoria: cêntimos }
  avisos: true, // avisos no topo do Hoje ao abrir a app
  avisosFechados: {}, // { idDoAviso: 'AAAA-MM-DD' } fechado nesse dia
  planeadoPara: null, // data do último "Planear amanhã"
  ultimoBackup: null, // ISO string
  bannerInstalarFechado: false,
};

function read() {
  try {
    const saved = JSON.parse(localStorage.getItem(KEY) || '{}');
    const out = { ...DEFAULTS };
    for (const k of Object.keys(DEFAULTS)) if (k in saved) out[k] = saved[k];
    return out;
  } catch {
    return { ...DEFAULTS };
  }
}

export const prefs = read();

function persist() {
  try {
    localStorage.setItem(KEY, JSON.stringify(prefs));
  } catch {
    /* modo privado: ignora */
  }
}

export function setPref(key, value) {
  prefs[key] = value;
  persist();
}

export function replacePrefs(obj) {
  Object.assign(prefs, DEFAULTS);
  for (const k of Object.keys(DEFAULTS)) if (obj && k in obj) prefs[k] = obj[k];
  persist();
}
