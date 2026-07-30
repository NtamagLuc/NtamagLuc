import { api } from '../api.js';
import { openModal } from './modal.js';
import { gaugeHtml, scoreDeltaHtml } from './gauge.js';
import { escapeHtml, SEVERITE_CLASSES, showToast } from '../utils.js';

const TITRES = {
  RETRAIT: 'Demander un retrait',
  DEPLACEMENT: 'Demander un déplacement',
  REFORME: 'Demander une réforme (décommissionnement)',
};

const SUBMIT_LABELS = {
  RETRAIT: 'Soumettre la demande de retrait',
  DEPLACEMENT: 'Soumettre la demande de déplacement',
  REFORME: 'Soumettre la demande de réforme',
};

function renderAlertes(alertes) {
  return `
    <ul class="alert-list">
      ${alertes
        .map((a) => `<li class="alert-item ${SEVERITE_CLASSES[a.severite] || 'alert-basse'}">${escapeHtml(a.message)}</li>`)
        .join('')}
    </ul>
  `;
}

function renderImpactBlock(nomCentrale, avant, apres) {
  return `
    <div class="impact-block">
      <div class="impact-centrale-nom">${escapeHtml(nomCentrale)}</div>
      <div class="impact-gauges">
        ${gaugeHtml(avant, { size: 64 })}
        <span class="impact-arrow">→</span>
        ${gaugeHtml(apres, { size: 64 })}
      </div>
      ${scoreDeltaHtml(avant, apres)}
    </div>
  `;
}

export function renderSimulation(simulation) {
  const descendants = simulation.descendants.filter((d) => d.id !== simulation.actif.id);
  return `
    <div class="simulation-result">
      ${
        descendants.length
          ? `<p class="simulation-note">Actif(s) enfant(s) impacté(s) : ${descendants.map((d) => escapeHtml(d.nom)).join(', ')}</p>`
          : ''
      }
      <div class="impact-blocks">
        ${renderImpactBlock(simulation.centraleSource.nom, simulation.scoreSourceAvant, simulation.scoreSourceApres)}
        ${
          simulation.centraleDest
            ? renderImpactBlock(simulation.centraleDest.nom, simulation.scoreDestAvant, simulation.scoreDestApres)
            : ''
        }
      </div>
      <h3 class="simulation-alerts-title">Impact estimé</h3>
      ${renderAlertes(simulation.alertes)}
    </div>
  `;
}

export function openDemandeModal(actif, type, { onDone } = {}) {
  const bodyHtml = `
    <p>${TITRES[type]} pour <strong>${escapeHtml(actif.nom)}</strong>.</p>
    ${
      type === 'DEPLACEMENT'
        ? `
      <label class="field">
        <span>Centrale de destination</span>
        <select id="centrale-dest"><option value="">Chargement…</option></select>
      </label>
    `
        : ''
    }
    <div id="sim-container">${type === 'DEPLACEMENT' ? '' : '<p class="loading">Calcul de l\'impact…</p>'}</div>
    <label class="field">
      <span>Motif de la demande</span>
      <textarea id="motif" rows="3" required placeholder="Justification : usure, panne, planification de maintenance, remplacement…"></textarea>
    </label>
    <div class="modal-footer">
      <button class="btn btn-ghost" data-close>Annuler</button>
      <button class="btn ${type === 'REFORME' ? 'btn-danger' : 'btn-primary'}" id="confirm-btn" disabled>${SUBMIT_LABELS[type]}</button>
    </div>
  `;

  openModal(TITRES[type], bodyHtml, {
    wide: true,
    onMount: async (dialog, close) => {
      const simContainer = dialog.querySelector('#sim-container');
      const confirmBtn = dialog.querySelector('#confirm-btn');
      const motifInput = dialog.querySelector('#motif');
      let centraleDestId = null;

      async function chargerSimulation() {
        if (type === 'DEPLACEMENT' && !centraleDestId) {
          simContainer.innerHTML = '';
          confirmBtn.disabled = true;
          return;
        }
        simContainer.innerHTML = '<p class="loading">Calcul de l\'impact…</p>';
        try {
          const simulation = await api.previewDemande({ type, actifId: actif.id, centraleDestId });
          simContainer.innerHTML = renderSimulation(simulation);
          confirmBtn.disabled = false;
        } catch (err) {
          simContainer.innerHTML = `<p class="error-state">${escapeHtml(err.message)}</p>`;
          confirmBtn.disabled = true;
        }
      }

      if (type === 'DEPLACEMENT') {
        const select = dialog.querySelector('#centrale-dest');
        const centrales = await api.getCentrales();
        const autres = centrales.filter((c) => c.id !== actif.centrale_id);
        select.innerHTML = autres.length
          ? '<option value="">Sélectionner une centrale…</option>' +
            autres.map((c) => `<option value="${c.id}">${escapeHtml(c.nom)} (${c.performancePct}%)</option>`).join('')
          : '<option value="">Aucune autre centrale disponible</option>';
        select.addEventListener('change', () => {
          centraleDestId = select.value ? Number(select.value) : null;
          chargerSimulation();
        });
      } else {
        await chargerSimulation();
      }

      confirmBtn.addEventListener('click', async () => {
        if (!motifInput.value.trim()) {
          motifInput.focus();
          showToast('Veuillez indiquer un motif pour cette demande.', 'error');
          return;
        }
        confirmBtn.disabled = true;
        confirmBtn.textContent = 'Envoi…';
        try {
          await api.creerDemande({ type, actifId: actif.id, centraleDestId, motif: motifInput.value.trim() });
          showToast('Demande soumise, en attente de validation.', 'success');
          close();
          onDone?.();
        } catch (err) {
          showToast(err.message, 'error');
          confirmBtn.disabled = false;
          confirmBtn.textContent = SUBMIT_LABELS[type];
        }
      });
    },
  });
}
