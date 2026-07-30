import { api } from '../api.js';
import { openDemandeModal } from './demandeFormModal.js';
import { showToast } from '../utils.js';

const DEMANDE_ACTIONS = {
  'demander-retrait': 'RETRAIT',
  'demander-deplacement': 'DEPLACEMENT',
  'demander-decommissionnement': 'DECOMMISSIONNEMENT',
  'demander-remise': 'REMISE_EN_SERVICE',
};

export function attachActifActionHandlers(container, findActif, onDone) {
  container.addEventListener('click', async (e) => {
    const btn = e.target.closest('[data-action]');
    if (!btn) return;
    const actifId = Number(btn.dataset.id);
    const actif = findActif(actifId);
    if (!actif) return;
    const action = btn.dataset.action;

    if (DEMANDE_ACTIONS[action]) {
      openDemandeModal(actif, DEMANDE_ACTIONS[action], { onDone });
      return;
    }

    if (action === 'maintenance-debut') {
      if (!confirm(`Mettre "${actif.nom}" en maintenance ?`)) return;
      await runDirectAction(() => api.mettreEnMaintenance(actif.id), actif.nom, 'mis en maintenance', onDone);
    } else if (action === 'maintenance-fin') {
      if (!confirm(`Terminer la maintenance de "${actif.nom}" ?`)) return;
      await runDirectAction(() => api.finMaintenance(actif.id), actif.nom, 'remis en service après maintenance', onDone);
    } else if (action === 'reparation-debut') {
      if (!confirm(`Mettre "${actif.nom}" en réparation ?`)) return;
      await runDirectAction(() => api.mettreEnReparation(actif.id), actif.nom, 'mis en réparation', onDone);
    } else if (action === 'reparation-fin') {
      if (!confirm(`Terminer la réparation de "${actif.nom}" ?`)) return;
      await runDirectAction(() => api.finReparation(actif.id), actif.nom, 'remis en service après réparation', onDone);
    }
  });
}

async function runDirectAction(fn, nom, participe, onDone) {
  try {
    await fn();
    showToast(`"${nom}" ${participe}.`, 'success');
    onDone?.();
  } catch (err) {
    showToast(err.message, 'error');
  }
}
