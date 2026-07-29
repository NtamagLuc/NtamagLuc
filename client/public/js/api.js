async function request(method, path, body) {
  const res = await fetch(path, {
    method,
    headers: body !== undefined ? { 'Content-Type': 'application/json' } : undefined,
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });
  if (res.status === 204) return null;
  const data = await res.json().catch(() => null);
  if (!res.ok) {
    const message = data?.error || `Erreur ${res.status}`;
    throw new Error(message);
  }
  return data;
}

export const api = {
  getCentrales: () => request('GET', '/api/centrales'),
  getCentrale: (id) => request('GET', `/api/centrales/${id}`),
  createCentrale: (payload) => request('POST', '/api/centrales', payload),
  updateCentrale: (id, payload) => request('PUT', `/api/centrales/${id}`, payload),
  deleteCentrale: (id) => request('DELETE', `/api/centrales/${id}`),

  getActifs: (centraleId) =>
    request('GET', centraleId ? `/api/actifs?centraleId=${centraleId}` : '/api/actifs'),
  getActif: (id) => request('GET', `/api/actifs/${id}`),
  createActif: (payload) => request('POST', '/api/actifs', payload),
  updateActif: (id, payload) => request('PUT', `/api/actifs/${id}`, payload),
  deleteActif: (id) => request('DELETE', `/api/actifs/${id}`),

  previewRetrait: (id) => request('POST', `/api/actifs/${id}/preview-retrait`),
  retrait: (id, commentaire) => request('POST', `/api/actifs/${id}/retrait`, { commentaire }),
  remiseEnService: (id, commentaire) =>
    request('POST', `/api/actifs/${id}/remise-en-service`, { commentaire }),

  previewDeplacement: (id, centraleDestId) =>
    request('POST', `/api/actifs/${id}/preview-deplacement`, { centraleDestId }),
  deplacement: (id, centraleDestId, commentaire) =>
    request('POST', `/api/actifs/${id}/deplacement`, { centraleDestId, commentaire }),

  getMouvements: () => request('GET', '/api/mouvements'),
};
