// Função do Netlify: guarda a cópia ENCRIPTADA dos dados (Netlify Blobs).
// O servidor nunca vê os dados em claro: só recebe texto encriptado no dispositivo.
import { getStore } from '@netlify/blobs';

const MAX = 8 * 1024 * 1024; // 8 MB
const json = (body, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json', 'cache-control': 'no-store' } });

async function sha256(text) {
  const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text));
  return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

export default async (req) => {
  try {
    return await handle(req);
  } catch (e) {
    // Mostra a causa na app (ex.: Netlify Blobs não disponível).
    return json({ ok: false, error: 'servidor', detail: String(e?.message || e).slice(0, 200) }, 500);
  }
};

async function handle(req) {
  const url = new URL(req.url);
  if (url.searchParams.has('ping')) {
    // Diagnóstico: confirma que a função e o armazenamento funcionam.
    const store = getStore({ name: 'levelup-sync', consistency: 'strong' });
    await store.get('__ping__');
    return json({ ok: true, v: 2 });
  }
  const id = url.searchParams.get('id') || '';
  const token = req.headers.get('x-sync-token') || '';
  if (!/^[A-Z2-7]{26}$/.test(id)) return json({ error: 'codigo' }, 400);
  if (!/^[A-Za-z0-9_-]{40,60}$/.test(token)) return json({ error: 'token' }, 401);

  const store = getStore({ name: 'levelup-sync', consistency: 'strong' });
  const th = await sha256(token);
  const cur = await store.get(id, { type: 'json' });
  if (cur && cur.th !== th) return json({ error: 'acesso' }, 403);

  if (req.method === 'GET') {
    if (!cur) return json({ rev: 0 });
    return json({ rev: cur.rev, payload: cur.payload });
  }

  if (req.method === 'PUT') {
    const text = await req.text();
    if (text.length > MAX) return json({ error: 'grande' }, 413);
    let body;
    try { body = JSON.parse(text); } catch { return json({ error: 'json' }, 400); }
    const rev = cur?.rev || 0;
    if (body.rev !== rev) return json({ error: 'conflito', rev }, 409);
    if (!body.payload || typeof body.payload.ct !== 'string') return json({ error: 'payload' }, 400);
    await store.setJSON(id, { th, rev: rev + 1, payload: body.payload, at: Date.now() });
    return json({ rev: rev + 1 });
  }

  return json({ error: 'metodo' }, 405);
}

export const config = { path: '/api/sync' };
