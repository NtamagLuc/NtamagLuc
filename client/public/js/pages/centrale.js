import { api } from '../api.js';
import { gaugeHtml } from '../components/gauge.js';
import { renderActifTree } from '../components/actifTree.js';
import { openRetraitModal, openDeplacementModal } from '../components/moveModal.js';
import { openActifFormModal } from '../components/formModal.js';
import { escapeHtml, TYPE_CENTRALE_LABELS, formatNombre, showToast } from '../utils.js';
import { refresh } from '../router.js';

export async function renderCentraleDetail({ id }) {
  const app = document.getElementById('app');
  const centrale = await api.getCentrale(id);

  app.innerHTML = `
    <a class="back-link" href="#/">← Retour au tableau de bord</a>
    <div class="page-header">
      <div>
        <h1>${escapeHtml(centrale.nom)}</h1>
        <p class="page-subtitle">${TYPE_CENTRALE_LABELS[centrale.type] || centrale.type} · ${escapeHtml(centrale.localisation || '—')}</p>
      </div>
      <button class="btn btn-primary" id="new-actif-btn">+ Nouvel actif</button>
    </div>

    <div class="centrale-summary">
      ${gaugeHtml(centrale.performancePct, { size: 100 })}
      <div class="centrale-summary-stats">
        <div><span class="stat-label">Puissance effective</span><span class="stat-value">${formatNombre(centrale.puissanceEffectiveMw)} / ${formatNombre(centrale.capacite_nominale_mw)} MW</span></div>
        <div><span class="stat-label">Actifs enregistrés</span><span class="stat-value">${centrale.actifs.length}</span></div>
        <div><span class="stat-label">Seuil d'alerte</span><span class="stat-value">${centrale.seuil_alerte_pct}%</span></div>
      </div>
    </div>

    <h2 class="section-title">Actifs (${centrale.actifs.length})</h2>
    <div id="actif-tree-container">${renderActifTree(centrale.actifs)}</div>
  `;

  document.getElementById('new-actif-btn').addEventListener('click', () => {
    openActifFormModal({ centraleId: centrale.id, actifsCentrale: centrale.actifs, onDone: refresh });
  });

  document.getElementById('actif-tree-container').addEventListener('click', async (e) => {
    const btn = e.target.closest('[data-action]');
    if (!btn) return;
    const actifId = Number(btn.dataset.id);
    const actif = centrale.actifs.find((a) => a.id === actifId);
    if (!actif) return;

    if (btn.dataset.action === 'retirer') {
      openRetraitModal(actif, { onDone: refresh });
    } else if (btn.dataset.action === 'deplacer') {
      openDeplacementModal(actif, { onDone: refresh });
    } else if (btn.dataset.action === 'remise') {
      if (!confirm(`Remettre "${actif.nom}" en service ?`)) return;
      try {
        await api.remiseEnService(actif.id);
        showToast(`"${actif.nom}" remis en service.`, 'success');
        refresh();
      } catch (err) {
        showToast(err.message, 'error');
      }
    }
  });
}
