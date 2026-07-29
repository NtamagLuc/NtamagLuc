import { api } from '../api.js';
import { openRetraitModal, openDeplacementModal } from '../components/moveModal.js';
import {
  escapeHtml,
  STATUT_LABELS,
  STATUT_CLASSES,
  CRITICITE_LABELS,
  CRITICITE_CLASSES,
  MOUVEMENT_LABELS,
  SEVERITE_CLASSES,
  formatNombre,
  formatDate,
  showToast,
} from '../utils.js';
import { refresh } from '../router.js';

export async function renderActifDetail({ id }) {
  const app = document.getElementById('app');
  const actif = await api.getActif(id);
  const centrale = await api.getCentrale(actif.centrale_id);

  const isRetire = actif.statut === 'RETIRE';

  app.innerHTML = `
    <a class="back-link" href="#/centrales/${actif.centrale_id}">← Retour à ${escapeHtml(centrale.nom)}</a>
    <div class="page-header">
      <div>
        <h1>${escapeHtml(actif.nom)}</h1>
        <p class="page-subtitle">${escapeHtml(actif.type)} · ${escapeHtml(centrale.nom)}${actif.parent ? ` · sous-actif de ${escapeHtml(actif.parent.nom)}` : ''}</p>
      </div>
      <div class="actif-actions">
        ${
          isRetire
            ? `<button class="btn btn-success" id="remise-btn">Remettre en service</button>`
            : `
              <button class="btn btn-warning" id="retirer-btn">Retirer</button>
              <button class="btn btn-primary" id="deplacer-btn">Déplacer</button>
            `
        }
      </div>
    </div>

    <div class="actif-badges">
      <span class="badge ${STATUT_CLASSES[actif.statut] || 'badge-neutral'}">${STATUT_LABELS[actif.statut] || actif.statut}</span>
      <span class="badge ${CRITICITE_CLASSES[actif.criticite] || 'badge-neutral'}">Criticité : ${CRITICITE_LABELS[actif.criticite] || actif.criticite}</span>
      ${actif.contribution_mw ? `<span class="badge badge-neutral">${formatNombre(actif.contribution_mw)} MW</span>` : ''}
    </div>

    ${actif.description ? `<p class="actif-description">${escapeHtml(actif.description)}</p>` : ''}
    <p class="actif-meta">Installé le ${actif.date_installation ? escapeHtml(actif.date_installation) : '—'}</p>

    ${
      actif.enfants.length
        ? `
      <h2 class="section-title">Actifs enfants (${actif.enfants.length})</h2>
      <ul class="actif-children-list">
        ${actif.enfants
          .map(
            (e) => `<li><a href="#/actifs/${e.id}">${escapeHtml(e.nom)}</a> <span class="badge ${STATUT_CLASSES[e.statut] || 'badge-neutral'}">${STATUT_LABELS[e.statut] || e.statut}</span></li>`
          )
          .join('')}
      </ul>
    `
        : ''
    }

    <h2 class="section-title">Historique de cet actif</h2>
    ${
      actif.historique.length
        ? `<div class="mouvement-list">${actif.historique.map(renderHistoriqueItem).join('')}</div>`
        : '<p class="empty-state">Aucun mouvement enregistré pour cet actif.</p>'
    }
  `;

  document.getElementById('retirer-btn')?.addEventListener('click', () => {
    openRetraitModal(actif, { onDone: refresh });
  });
  document.getElementById('deplacer-btn')?.addEventListener('click', () => {
    openDeplacementModal(actif, { onDone: refresh });
  });
  document.getElementById('remise-btn')?.addEventListener('click', async () => {
    if (!confirm(`Remettre "${actif.nom}" en service ?`)) return;
    try {
      await api.remiseEnService(actif.id);
      showToast(`"${actif.nom}" remis en service.`, 'success');
      refresh();
    } catch (err) {
      showToast(err.message, 'error');
    }
  });
}

function renderHistoriqueItem(m) {
  return `
    <div class="mouvement-card">
      <div class="mouvement-header">
        <span class="badge badge-info">${MOUVEMENT_LABELS[m.type] || m.type}</span>
        <span class="mouvement-date">${formatDate(m.date)}</span>
      </div>
      <div class="mouvement-body">
        <div class="mouvement-scores">
          <span>Source : ${m.score_source_avant}% → ${m.score_source_apres}%</span>
          ${m.score_dest_avant !== null ? `<span>Destination : ${m.score_dest_avant}% → ${m.score_dest_apres}%</span>` : ''}
        </div>
        <ul class="alert-list">
          ${m.alertes.map((a) => `<li class="alert-item ${SEVERITE_CLASSES[a.severite] || 'alert-basse'}">${escapeHtml(a.message)}</li>`).join('')}
        </ul>
      </div>
    </div>
  `;
}
