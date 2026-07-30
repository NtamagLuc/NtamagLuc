export function escapeHtml(str) {
  return String(str ?? '').replace(/[&<>"']/g, (c) => ({
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#39;',
  }[c]));
}

export const TYPE_CENTRALE_LABELS = {
  THERMIQUE: 'Thermique',
  HYDRAULIQUE: 'Hydraulique',
  NUCLEAIRE: 'Nucléaire',
  SOLAIRE: 'Solaire',
  EOLIEN: 'Éolien',
};

export const CENTRALE_STATUT_LABELS = {
  ACTIVE: 'Active',
  INACTIVE: 'Inactive',
};

export const CENTRALE_STATUT_CLASSES = {
  ACTIVE: 'badge-success',
  INACTIVE: 'badge-neutral',
};

export const STATUT_LABELS = {
  EN_SERVICE: 'En service',
  EN_MAINTENANCE: 'En maintenance',
  EN_REPARATION: 'En réparation',
  EN_TRANSFERT: 'En transfert',
  HORS_SERVICE: 'Hors service',
  DECOMMISSIONNE: 'Décommissionné',
  REFORME: 'Réformé',
};

export const STATUT_CLASSES = {
  EN_SERVICE: 'badge-success',
  EN_MAINTENANCE: 'badge-warning',
  EN_REPARATION: 'badge-warning',
  EN_TRANSFERT: 'badge-info',
  HORS_SERVICE: 'badge-neutral',
  DECOMMISSIONNE: 'badge-danger',
  REFORME: 'badge-danger',
};

export const ROLE_LABELS = {
  ADMINISTRATEUR: 'Administrateur',
  RESPONSABLE_MECANIQUE: 'Responsable Mécanique',
  RESPONSABLE_EXPLOITATION: 'Responsable Exploitation',
  CHEF_CENTRALE: 'Chef Centrale',
};

export const DEMANDE_TYPE_LABELS = {
  RETRAIT: 'Retrait',
  DEPLACEMENT: 'Déplacement',
  DECOMMISSIONNEMENT: 'Décommissionnement',
  REMISE_EN_SERVICE: 'Remise en service',
};

export const DEMANDE_STATUT_LABELS = {
  EN_ATTENTE: 'En attente (Exploitation)',
  TRANSMISE: 'Transmise (Chef Centrale)',
  REJETEE: 'Rejetée',
  EXECUTEE: 'Exécutée',
  ANNULEE: 'Annulée',
};

export const DEMANDE_STATUT_CLASSES = {
  EN_ATTENTE: 'badge-warning',
  TRANSMISE: 'badge-info',
  REJETEE: 'badge-danger',
  EXECUTEE: 'badge-success',
  ANNULEE: 'badge-neutral',
};

export const NIVEAU_IMPACT_LABELS = {
  FAIBLE: 'Faible',
  MOYEN: 'Moyen',
  IMPORTANT: 'Important',
  CRITIQUE: 'Critique',
};

export const NIVEAU_IMPACT_CLASSES = {
  FAIBLE: 'badge-neutral',
  MOYEN: 'badge-info',
  IMPORTANT: 'badge-warning',
  CRITIQUE: 'badge-danger',
};

export const CRITICITE_LABELS = {
  FAIBLE: 'Faible',
  MOYENNE: 'Moyenne',
  HAUTE: 'Haute',
  CRITIQUE: 'Critique',
};

export const CRITICITE_CLASSES = {
  FAIBLE: 'badge-neutral',
  MOYENNE: 'badge-info',
  HAUTE: 'badge-warning',
  CRITIQUE: 'badge-danger',
};

export const SEVERITE_CLASSES = {
  basse: 'alert-basse',
  moyenne: 'alert-moyenne',
  haute: 'alert-haute',
};

export const MOUVEMENT_LABELS = {
  DEPLACEMENT: 'Déplacement',
  RETRAIT: 'Retrait',
  DECOMMISSIONNEMENT: 'Décommissionnement',
  REMISE_EN_SERVICE: 'Remise en service',
  MAINTENANCE_DEBUT: 'Mise en maintenance',
  MAINTENANCE_FIN: 'Fin de maintenance',
  REPARATION_DEBUT: 'Mise en réparation',
  REPARATION_FIN: 'Fin de réparation',
};

export function formatNombre(n) {
  if (n === null || n === undefined) return '—';
  return new Intl.NumberFormat('fr-FR', { maximumFractionDigits: 2 }).format(n);
}

export function formatDate(iso) {
  if (!iso) return '—';
  const d = new Date(iso.replace(' ', 'T') + 'Z');
  if (Number.isNaN(d.getTime())) return iso;
  return new Intl.DateTimeFormat('fr-FR', {
    dateStyle: 'medium',
    timeStyle: 'short',
  }).format(d);
}

export function performanceLevel(pct) {
  if (pct >= 80) return 'good';
  if (pct >= 50) return 'warn';
  return 'bad';
}

export function showToast(message, type = 'info') {
  const root = document.getElementById('toast-root');
  const toast = document.createElement('div');
  toast.className = `toast toast-${type}`;
  toast.textContent = message;
  root.appendChild(toast);
  requestAnimationFrame(() => toast.classList.add('visible'));
  setTimeout(() => {
    toast.classList.remove('visible');
    setTimeout(() => toast.remove(), 300);
  }, 4000);
}
