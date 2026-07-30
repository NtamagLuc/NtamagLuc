import { api } from '../api.js';
import { renderSimulation } from '../components/demandeFormModal.js';
import {
  escapeHtml,
  formatDate,
  showToast,
  DEMANDE_TYPE_LABELS,
  DEMANDE_STATUT_LABELS,
  DEMANDE_STATUT_CLASSES,
  MOUVEMENT_LABELS,
  SEVERITE_CLASSES,
} from '../utils.js';
import { getCurrentUser, canValidate } from '../auth.js';
import { refresh } from '../router.js';

export async function renderDemandeDetail({ id }) {
  const app = document.getElementById('app');
  const demande = await api.getDemande(id);
  const user = getCurrentUser();
  const estAuteur = demande.demandeur_id === user.id;

  app.innerHTML = `
    <a class="back-link" href="#/demandes">← Retour aux demandes</a>
    <div class="page-header">
      <div>
        <h1>${DEMANDE_TYPE_LABELS[demande.type] || demande.type} — ${escapeHtml(demande.actif_nom)}</h1>
        <p class="page-subtitle">Demande #${demande.id} créée le ${formatDate(demande.created_at)} par ${escapeHtml(demande.demandeur_nom)}</p>
      </div>
      <span class="badge ${DEMANDE_STATUT_CLASSES[demande.statut] || 'badge-neutral'}" style="font-size:0.9rem;">${DEMANDE_STATUT_LABELS[demande.statut] || demande.statut}</span>
    </div>

    <div class="demande-trajet-box">
      ${
        demande.type === 'DEPLACEMENT'
          ? `<strong>${escapeHtml(demande.centrale_source_nom)}</strong> → <strong>${escapeHtml(demande.centrale_dest_nom)}</strong>`
          : `Centrale : <strong>${escapeHtml(demande.centrale_source_nom)}</strong>`
      }
    </div>

    ${demande.motif ? `<p class="mouvement-commentaire">Motif : « ${escapeHtml(demande.motif)} »</p>` : ''}

    ${
      demande.validateur_nom
        ? `<p class="mouvement-commentaire">${demande.statut === 'REJETEE' ? 'Rejetée' : 'Validée'} par ${escapeHtml(demande.validateur_nom)} le ${formatDate(demande.date_validation)}${demande.commentaire_validation ? ` : « ${escapeHtml(demande.commentaire_validation)} »` : ''}</p>`
        : ''
    }

    <h2 class="section-title">Impact actuel estimé</h2>
    ${
      demande.simulationActuelle
        ? renderSimulation(demande.simulationActuelle)
        : '<p class="empty-state">Simulation indisponible (actif ou centrale peut-être modifié depuis la demande).</p>'
    }

    <div id="demande-actions" class="modal-footer" style="justify-content:flex-start; margin-top:20px;"></div>

    ${
      demande.mouvement
        ? `
      <h2 class="section-title">Mouvement exécuté</h2>
      <div class="mouvement-card">
        <div class="mouvement-header">
          <span class="badge badge-info">${MOUVEMENT_LABELS[demande.mouvement.type] || demande.mouvement.type}</span>
          <span class="mouvement-date">${formatDate(demande.mouvement.date)}</span>
        </div>
        <div class="mouvement-body">
          <div class="mouvement-scores">
            <span>Source : ${demande.mouvement.score_source_avant}% → ${demande.mouvement.score_source_apres}%</span>
            ${demande.mouvement.score_dest_avant !== null ? `<span>Destination : ${demande.mouvement.score_dest_avant}% → ${demande.mouvement.score_dest_apres}%</span>` : ''}
          </div>
          ${demande.mouvement.executeur_nom ? `<p class="mouvement-commentaire">Exécuté par ${escapeHtml(demande.mouvement.executeur_nom)}</p>` : ''}
          <ul class="alert-list">
            ${demande.mouvement.alertes.map((a) => `<li class="alert-item ${SEVERITE_CLASSES[a.severite] || 'alert-basse'}">${escapeHtml(a.message)}</li>`).join('')}
          </ul>
        </div>
      </div>
    `
        : ''
    }
  `;

  const actionsBox = document.getElementById('demande-actions');
  const boutons = [];

  if (demande.statut === 'EN_ATTENTE') {
    if (canValidate()) {
      boutons.push('<button class="btn btn-success" id="valider-btn">Valider</button>');
      boutons.push('<button class="btn btn-danger" id="rejeter-btn">Rejeter</button>');
    }
    if (estAuteur || user.role === 'ADMINISTRATEUR') {
      boutons.push('<button class="btn btn-ghost" id="annuler-btn">Annuler la demande</button>');
    }
  } else if (demande.statut === 'VALIDEE' && canValidate()) {
    boutons.push('<button class="btn btn-primary" id="executer-btn">Exécuter maintenant</button>');
  }

  actionsBox.innerHTML = boutons.join('');

  document.getElementById('valider-btn')?.addEventListener('click', async () => {
    const commentaire = window.prompt('Commentaire de validation (optionnel) :', '') || '';
    try {
      await api.validerDemande(demande.id, commentaire);
      showToast('Demande validée.', 'success');
      refresh();
    } catch (err) {
      showToast(err.message, 'error');
    }
  });

  document.getElementById('rejeter-btn')?.addEventListener('click', async () => {
    const commentaire = window.prompt('Motif du rejet (obligatoire) :', '');
    if (!commentaire) return;
    try {
      await api.rejeterDemande(demande.id, commentaire);
      showToast('Demande rejetée.', 'success');
      refresh();
    } catch (err) {
      showToast(err.message, 'error');
    }
  });

  document.getElementById('annuler-btn')?.addEventListener('click', async () => {
    if (!confirm('Annuler cette demande ?')) return;
    try {
      await api.annulerDemande(demande.id);
      showToast('Demande annulée.', 'success');
      refresh();
    } catch (err) {
      showToast(err.message, 'error');
    }
  });

  document.getElementById('executer-btn')?.addEventListener('click', async () => {
    if (!confirm('Exécuter cette demande maintenant ? Cette action modifiera immédiatement les actifs concernés.')) return;
    try {
      await api.executerDemande(demande.id);
      showToast('Demande exécutée.', 'success');
      refresh();
    } catch (err) {
      showToast(err.message, 'error');
    }
  });
}
