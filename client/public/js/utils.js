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

export const STATUT_LABELS = {
  EN_SERVICE: 'En service',
  EN_MAINTENANCE: 'En maintenance',
  RETIRE: 'Retiré',
  REFORME: 'Réformé',
};

export const STATUT_CLASSES = {
  EN_SERVICE: 'badge-success',
  EN_MAINTENANCE: 'badge-warning',
  RETIRE: 'badge-neutral',
  REFORME: 'badge-danger',
};

export const ROLE_LABELS = {
  DEMANDEUR: 'Demandeur',
  VALIDATEUR: 'Validateur',
  ADMINISTRATEUR: 'Administrateur',
};

export const DEMANDE_TYPE_LABELS = {
  RETRAIT: 'Retrait',
  DEPLACEMENT: 'Déplacement',
  REFORME: 'Réforme',
};

export const DEMANDE_STATUT_LABELS = {
  EN_ATTENTE: 'En attente',
  VALIDEE: 'Validée',
  REJETEE: 'Rejetée',
  EXECUTEE: 'Exécutée',
  ANNULEE: 'Annulée',
};

export const DEMANDE_STATUT_CLASSES = {
  EN_ATTENTE: 'badge-warning',
  VALIDEE: 'badge-info',
  REJETEE: 'badge-danger',
  EXECUTEE: 'badge-success',
  ANNULEE: 'badge-neutral',
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
  REFORME: 'Réforme',
  REMISE_EN_SERVICE: 'Remise en service',
  MAINTENANCE_DEBUT: 'Mise en maintenance',
  MAINTENANCE_FIN: 'Fin de maintenance',
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
