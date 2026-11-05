// Preferências simples em localStorage (os dados "a sério" vivem no IndexedDB).
const KEY = 'levelup:prefs';

const DEFAULTS = {
  tema: 'auto', // 'auto' | 'light' | 'dark'
  som: false,
  ultimoBackup: null, // ISO string
  bannerInstalarFechado: false,
};

function read() {
  try {
    return { ...DEFAULTS, ...JSON.parse(localStorage.getItem(KEY) || '{}') };
  } catch {
    return { ...DEFAULTS };
  }
}

export const prefs = read();

export function setPref(key, value) {
  prefs[key] = value;
  try {
    localStorage.setItem(KEY, JSON.stringify(prefs));
  } catch {
    /* modo privado: ignora */
  }
}

export function replacePrefs(obj) {
  Object.assign(prefs, DEFAULTS, obj || {});
  try {
    localStorage.setItem(KEY, JSON.stringify(prefs));
  } catch {}
}
