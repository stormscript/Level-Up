// Identificadores únicos. (Os dados de exemplo foram removidos: a app começa vazia.)
export const uid = () =>
  crypto.randomUUID?.() ?? `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
