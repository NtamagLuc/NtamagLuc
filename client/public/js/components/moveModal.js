import { api } from '../api.js';
import { openModal } from './modal.js';
import { gaugeHtml, scoreDeltaHtml } from './gauge.js';
import { escapeHtml, SEVERITE_CLASSES, showToast } from '../utils.js';

function renderAlertes(alertes) {
  return `
    <ul class="alert-list">
      ${alertes
        .map(
          (a) => `<li class="alert-item ${SEVERITE_CLASSES[a.severite] || 'alert-basse'}">${escapeHtml(a.message)}</li>`
        )
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

function renderSimulation(simulation) {
  const descendants = simulation.descendants.filter((d) => d.id !== simulation.actif.id);
  return `
    <div class="simulation-result">
      ${
        descendants.length
          ? `<p class="simulation-note">Actif(s) enfant(s) impacté(s) : ${descendants
              .map((d) => escapeHtml(d.nom))
              .join(', ')}</p>`
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

export function openRetraitModal(actif, { onDone } = {}) {
  const bodyHtml = `
    <p>Retrait de <strong>${escapeHtml(actif.nom)}</strong> de sa centrale.</p>
    <div id="sim-container"><p class="loading">Calcul de l'impact…</p></div>
    <label class="field">
      <span>Commentaire (optionnel)</span>
      <textarea id="commentaire" rows="2" placeholder="Raison du retrait, contexte de maintenance…"></textarea>
    </label>
    <div class="modal-footer">
      <button class="btn btn-ghost" data-close>Annuler</button>
      <button class="btn btn-danger" id="confirm-btn" disabled>Confirmer le retrait</button>
    </div>
  `;

  const close = openModal('Retirer un actif', bodyHtml, {
    wide: true,
    onMount: async (dialog) => {
      const simContainer = dialog.querySelector('#sim-container');
      const confirmBtn = dialog.querySelector('#confirm-btn');
      let simulation;
      try {
        simulation = await api.previewRetrait(actif.id);
        simContainer.innerHTML = renderSimulation(simulation);
        confirmBtn.disabled = false;
      } catch (err) {
        simContainer.innerHTML = `<p class="error-state">${escapeHtml(err.message)}</p>`;
        return;
      }

      confirmBtn.addEventListener('click', async () => {
        confirmBtn.disabled = true;
        confirmBtn.textContent = 'Traitement…';
        try {
          const commentaire = dialog.querySelector('#commentaire').value;
          await api.retrait(actif.id, commentaire);
          showToast(`"${actif.nom}" a été retiré.`, 'success');
          close();
          onDone?.();
        } catch (err) {
          showToast(err.message, 'error');
          confirmBtn.disabled = false;
          confirmBtn.textContent = 'Confirmer le retrait';
        }
      });
    },
  });
}

export async function openDeplacementModal(actif, { onDone } = {}) {
  const bodyHtml = `
    <p>Déplacement de <strong>${escapeHtml(actif.nom)}</strong> vers une autre centrale.</p>
    <label class="field">
      <span>Centrale de destination</span>
      <select id="centrale-dest"><option value="">Chargement…</option></select>
    </label>
    <div id="sim-container"></div>
    <label class="field">
      <span>Commentaire (optionnel)</span>
      <textarea id="commentaire" rows="2" placeholder="Raison du déplacement…"></textarea>
    </label>
    <div class="modal-footer">
      <button class="btn btn-ghost" data-close>Annuler</button>
      <button class="btn btn-primary" id="confirm-btn" disabled>Confirmer le déplacement</button>
    </div>
  `;

  openModal('Déplacer un actif', bodyHtml, {
    wide: true,
    onMount: async (dialog, close) => {
      const select = dialog.querySelector('#centrale-dest');
      const simContainer = dialog.querySelector('#sim-container');
      const confirmBtn = dialog.querySelector('#confirm-btn');

      const centrales = await api.getCentrales();
      const autres = centrales.filter((c) => c.id !== actif.centrale_id);
      if (!autres.length) {
        select.innerHTML = '<option value="">Aucune autre centrale disponible</option>';
        return;
      }
      select.innerHTML =
        '<option value="">Sélectionner une centrale…</option>' +
        autres.map((c) => `<option value="${c.id}">${escapeHtml(c.nom)} (${c.performancePct}%)</option>`).join('');

      let currentSimulation = null;

      select.addEventListener('change', async () => {
        confirmBtn.disabled = true;
        currentSimulation = null;
        if (!select.value) {
          simContainer.innerHTML = '';
          return;
        }
        simContainer.innerHTML = '<p class="loading">Calcul de l\'impact…</p>';
        try {
          currentSimulation = await api.previewDeplacement(actif.id, Number(select.value));
          simContainer.innerHTML = renderSimulation(currentSimulation);
          confirmBtn.disabled = false;
        } catch (err) {
          simContainer.innerHTML = `<p class="error-state">${escapeHtml(err.message)}</p>`;
        }
      });

      confirmBtn.addEventListener('click', async () => {
        if (!select.value) return;
        confirmBtn.disabled = true;
        confirmBtn.textContent = 'Traitement…';
        try {
          const commentaire = dialog.querySelector('#commentaire').value;
          await api.deplacement(actif.id, Number(select.value), commentaire);
          showToast(`"${actif.nom}" a été déplacé.`, 'success');
          close();
          onDone?.();
        } catch (err) {
          showToast(err.message, 'error');
          confirmBtn.disabled = false;
          confirmBtn.textContent = 'Confirmer le déplacement';
        }
      });
    },
  });
}
