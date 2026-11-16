// Junção de dados entre dispositivos (funções puras, testadas em tests.html).
//
// Cada registo tem `_u` = hora (ms) da última alteração. Os apagados ficam como "lápides"
// { id: "loja|id", store, rid, _u }. Para cada registo ganha a versão mais recente;
// uma lápide mais recente do que o registo apaga-o.

const TOMB_TTL = 180 * 86400000; // as lápides com mais de 180 dias são esquecidas

const u = (x) => Number(x?._u) || 0;

/**
 * @param local  { stores: { nome: [linhas] }, tombs: [...], prefs: { _u, values } }
 * @param remote o mesmo formato (ou null se ainda não há nada no servidor)
 * @param now    hora atual (ms)
 * @returns { data, put, del, tombs, localChanged, needsPush }
 *   data   = resultado completo (para enviar)
 *   put/del = o que mudar localmente; tombs = lápides finais
 */
export function mergeSync(local, remote, now = Date.now()) {
  const R = remote || { stores: {}, tombs: [], prefs: null };
  const names = [...new Set([...Object.keys(local.stores || {}), ...Object.keys(R.stores || {})])];

  // Lápides: a mais recente por chave, sem as muito antigas.
  const tombMap = new Map();
  for (const t of [...(local.tombs || []), ...(R.tombs || [])]) {
    if (now - u(t) > TOMB_TTL) continue;
    const cur = tombMap.get(t.id);
    if (!cur || u(t) > u(cur)) tombMap.set(t.id, t);
  }

  const data = { stores: {}, tombs: [], prefs: null };
  const put = {}, del = {};
  let localChanged = false, needsPush = !remote;

  for (const name of names) {
    const L = new Map((local.stores?.[name] || []).map((r) => [r.id, r]));
    const Rm = new Map((R.stores?.[name] || []).map((r) => [r.id, r]));
    const ids = new Set([...L.keys(), ...Rm.keys()]);
    const out = [];
    for (const id of ids) {
      const l = L.get(id), r = Rm.get(id);
      let best = l && r ? (u(r) > u(l) ? r : l) : l || r;
      const tomb = tombMap.get(`${name}|${id}`);
      if (tomb && u(tomb) >= u(best)) best = null;
      if (best) {
        out.push(best);
        if (!l || u(l) !== u(best)) { (put[name] ||= []).push(best); localChanged = true; }
        if (!r || u(r) !== u(best)) needsPush = true;
      } else {
        if (l) { (del[name] ||= []).push(id); localChanged = true; }
        if (r) needsPush = true;
      }
    }
    data.stores[name] = out;
  }

  // Lápides finais (só as que ainda importam).
  data.tombs = [...tombMap.values()];
  const remoteTombs = new Map((R.tombs || []).map((t) => [t.id, u(t)]));
  for (const t of data.tombs) if (remoteTombs.get(t.id) !== u(t)) { needsPush = true; break; }
  const localTombs = new Map((local.tombs || []).map((t) => [t.id, u(t)]));
  const tombsChanged = data.tombs.length !== localTombs.size || data.tombs.some((t) => localTombs.get(t.id) !== u(t));
  if (tombsChanged) localChanged = true;

  // Preferências: ganha o bloco mais recente.
  const lp = local.prefs, rp = R.prefs;
  data.prefs = !rp || (lp && u(lp) >= u(rp)) ? lp : rp;
  const prefsChanged = !!(rp && lp && u(rp) > u(lp)) || (!lp && !!rp);
  if (data.prefs && (!rp || u(rp) !== u(data.prefs))) needsPush = true;

  return { data, put, del, tombs: tombsChanged ? data.tombs : null, prefs: prefsChanged ? data.prefs : null, localChanged: localChanged || prefsChanged, needsPush };
}

// ---------- Código de sincronização ----------

const B32 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';

/** 16 bytes aleatórios → 26 letras/números (base32). */
export function makeSyncId(bytes) {
  let bits = 0, value = 0, out = '';
  for (const b of bytes) {
    value = (value << 8) | b;
    bits += 8;
    while (bits >= 5) { out += B32[(value >>> (bits - 5)) & 31]; bits -= 5; }
  }
  if (bits > 0) out += B32[(value << (5 - bits)) & 31];
  return out;
}

/** "ABCDEFGHIJKLMNOPQRSTUVWXYZ" → "ABCDE-FGHIJ-KLMNO-PQRST-UVWXYZ" */
export const formatSyncId = (id) => id.replace(/(.{5})(.{5})(.{5})(.{5})(.+)/, '$1-$2-$3-$4-$5');

/** Aceita o código com espaços, hífenes ou minúsculas. Devolve o id (26) ou null. */
export function parseSyncId(text) {
  const id = String(text || '').toUpperCase().replace(/[^A-Z2-7]/g, '');
  return id.length === 26 ? id : null;
}
