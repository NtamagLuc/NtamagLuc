import { api } from '../api.js';
import { gaugeHtml } from '../components/gauge.js';
import { renderActifTree } from '../components/actifTree.js';
import { attachActifActionHandlers } from '../components/actifActions.js';
import { openActifFormModal, openCentraleFormModal } from '../components/formModal.js';
import { escapeHtml, TYPE_CENTRALE_LABELS, CENTRALE_STATUT_LABELS, CENTRALE_STATUT_CLASSES, formatNombre } from '../utils.js';
import { canManageReferentiel } from '../auth.js';
import { refresh } from '../router.js';

export async function renderCentraleDetail({ id }) {
  const app = document.getElementById('app');
  const centrale = await api.getCentrale(id);

  app.innerHTML = `
    <a class="back-link" href="#/">← Retour au tableau de bord</a>
    <div class="page-header">
      <div>
        <h1>${escapeHtml(centrale.nom)} <span class="badge ${CENTRALE_STATUT_CLASSES[centrale.statut] || 'badge-neutral'}">${CENTRALE_STATUT_LABELS[centrale.statut] || centrale.statut}</span></h1>
        <p class="page-subtitle">${escapeHtml(centrale.code)} · ${TYPE_CENTRALE_LABELS[centrale.type] || centrale.type} · ${escapeHtml(centrale.localisation || '—')}</p>
      </div>
      ${
        canManageReferentiel()
          ? `<div class="actif-actions">
               <button class="btn btn-ghost" id="edit-centrale-btn">Modifier</button>
               <button class="btn btn-primary" id="new-actif-btn">+ Nouvel actif</button>
             </div>`
          : ''
      }
    </div>

    <div class="centrale-summary">
      ${gaugeHtml(centrale.performancePct, { size: 100 })}
      <div class="centrale-summary-stats">
        <div><span class="stat-label">Puissance effective</span><span class="stat-value">${formatNombre(centrale.puissanceEffectiveMw)} / ${formatNombre(centrale.capacite_nominale_mw)} MW</span></div>
        <div><span class="stat-label">Actifs enregistrés</span><span class="stat-value">${centrale.actifs.length}</span></div>
        <div><span class="stat-label">Seuil d'alerte</span><span class="stat-value">${centrale.seuil_alerte_pct}%</span></div>
      </div>
    </div>

    <h2 class="section-title">Hiérarchie des actifs (${centrale.actifs.length})</h2>
    <div id="actif-tree-container">${renderActifTree(centrale.actifs)}</div>
  `;

  document.getElementById('new-actif-btn')?.addEventListener('click', () => {
    openActifFormModal({ centraleId: centrale.id, actifsCentrale: centrale.actifs, onDone: refresh });
  });
  document.getElementById('edit-centrale-btn')?.addEventListener('click', () => {
    openCentraleFormModal({ centrale, onDone: refresh });
  });

  attachActifActionHandlers(
    document.getElementById('actif-tree-container'),
    (actifId) => centrale.actifs.find((a) => a.id === actifId),
    refresh
  );
}
