async function request(method, path, body) {
  const res = await fetch(path, {
    method,
    credentials: 'same-origin',
    headers: body !== undefined ? { 'Content-Type': 'application/json' } : undefined,
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });
  if (res.status === 204) return null;
  const data = await res.json().catch(() => null);
  if (!res.ok) {
    const err = new Error(data?.error || `Erreur ${res.status}`);
    err.status = res.status;
    throw err;
  }
  return data;
}

export const api = {
  // Authentification
  login: (email, password) => request('POST', '/api/auth/login', { email, password }),
  logout: () => request('POST', '/api/auth/logout'),
  me: () => request('GET', '/api/auth/me'),

  // Utilisateurs (admin)
  getUtilisateurs: () => request('GET', '/api/utilisateurs'),
  createUtilisateur: (payload) => request('POST', '/api/utilisateurs', payload),
  updateUtilisateur: (id, payload) => request('PUT', `/api/utilisateurs/${id}`, payload),
  deleteUtilisateur: (id) => request('DELETE', `/api/utilisateurs/${id}`),
  importUtilisateurs: (csv) => request('POST', '/api/utilisateurs/import', { csv }),
  exportUtilisateursUrl: () => '/api/utilisateurs/export',

  // Centrales
  getCentrales: () => request('GET', '/api/centrales'),
  getCentrale: (id) => request('GET', `/api/centrales/${id}`),
  getCentraleDashboard: (id, periode) => request('GET', `/api/centrales/${id}/dashboard${periode ? `?periode=${periode}` : ''}`),
  createCentrale: (payload) => request('POST', '/api/centrales', payload),
  updateCentrale: (id, payload) => request('PUT', `/api/centrales/${id}`, payload),
  deleteCentrale: (id) => request('DELETE', `/api/centrales/${id}`),
  importCentrales: (csv) => request('POST', '/api/centrales/import', { csv }),
  exportCentralesUrl: () => '/api/centrales/export',

  // Actifs
  getActifs: (centraleId) =>
    request('GET', centraleId ? `/api/actifs?centraleId=${centraleId}` : '/api/actifs'),
  getActif: (id) => request('GET', `/api/actifs/${id}`),
  createActif: (payload) => request('POST', '/api/actifs', payload),
  updateActif: (id, payload) => request('PUT', `/api/actifs/${id}`, payload),
  deleteActif: (id) => request('DELETE', `/api/actifs/${id}`),
  importActifs: (csv) => request('POST', '/api/actifs/import', { csv }),
  exportActifsUrl: () => '/api/actifs/export',
  mettreEnMaintenance: (id, commentaire) => request('POST', `/api/actifs/${id}/mettre-en-maintenance`, { commentaire }),
  finMaintenance: (id, commentaire) => request('POST', `/api/actifs/${id}/fin-maintenance`, { commentaire }),
  mettreEnReparation: (id, commentaire) => request('POST', `/api/actifs/${id}/mettre-en-reparation`, { commentaire }),
  finReparation: (id, commentaire) => request('POST', `/api/actifs/${id}/fin-reparation`, { commentaire }),

  // Demandes (retrait / déplacement / décommissionnement / remise en service)
  getDemandes: (params = {}) => {
    const qs = new URLSearchParams(params).toString();
    return request('GET', `/api/demandes${qs ? `?${qs}` : ''}`);
  },
  getDemande: (id) => request('GET', `/api/demandes/${id}`),
  previewDemande: (payload) => request('POST', '/api/demandes/preview', payload),
  creerDemande: (payload) => request('POST', '/api/demandes', payload),
  annulerDemande: (id, motif) => request('POST', `/api/demandes/${id}/annuler`, { motif }),
  relancerSimulation: (id) => request('POST', `/api/demandes/${id}/relancer-simulation`),
  transmettreDemande: (id, commentaire) => request('POST', `/api/demandes/${id}/transmettre`, { commentaire }),
  rejeterExploitationDemande: (id, commentaire) => request('POST', `/api/demandes/${id}/rejeter-exploitation`, { commentaire }),
  approuverDemande: (id, commentaire) => request('POST', `/api/demandes/${id}/approuver`, { commentaire }),
  rejeterDemande: (id, commentaire) => request('POST', `/api/demandes/${id}/rejeter`, { commentaire }),

  // Mouvements & audit
  getMouvements: () => request('GET', '/api/mouvements'),
  getAuditLog: (params = {}) => {
    const qs = new URLSearchParams(params).toString();
    return request('GET', `/api/audit-log${qs ? `?${qs}` : ''}`);
  },

  // Notifications
  getNotifications: () => request('GET', '/api/notifications'),
  marquerNotificationLue: (id) => request('POST', `/api/notifications/${id}/lu`),
  marquerToutesNotificationsLues: () => request('POST', '/api/notifications/lu-tout'),

  // Paramètres d'impact (admin)
  getParametresImpact: () => request('GET', '/api/parametres/impact'),
  updateParametresImpact: (payload) => request('PUT', '/api/parametres/impact', payload),

  // Reporting
  getReportingSummary: () => request('GET', '/api/reporting/summary'),
  exportUrl: (entity) => `/api/reporting/export/${entity}`,
};
