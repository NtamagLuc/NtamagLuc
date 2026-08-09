import { api } from '../api.js';
import { openModal } from './modal.js';
import { gaugeHtml, scoreDeltaHtml } from './gauge.js';
import { escapeHtml, SEVERITE_CLASSES, NIVEAU_IMPACT_LABELS, NIVEAU_IMPACT_CLASSES, showToast } from '../utils.js';

const TITRES = {
  RETRAIT: 'Demander un retrait',
  DEPLACEMENT: 'Demander un déplacement',
  DECOMMISSIONNEMENT: 'Demander un décommissionnement',
  REMISE_EN_SERVICE: 'Demander une remise en service',
};

const SUBMIT_LABELS = {
  RETRAIT: 'Soumettre la demande de retrait',
  DEPLACEMENT: 'Soumettre la demande de déplacement',
  DECOMMISSIONNEMENT: 'Soumettre la demande de décommissionnement',
  REMISE_EN_SERVICE: 'Soumettre la demande de remise en service',
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
      <div class="simulation-header">
        <span class="badge ${NIVEAU_IMPACT_CLASSES[simulation.niveauImpact] || 'badge-neutral'}">Niveau d'impact : ${NIVEAU_IMPACT_LABELS[simulation.niveauImpact] || simulation.niveauImpact}</span>
        ${simulation.niveauImpact === 'CRITIQUE' ? '<span class="badge badge-danger">Validation Administrateur requise</span>' : ''}
      </div>
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
      ${
        simulation.parcAvant !== undefined
          ? `<p class="simulation-note">Performance globale du parc : ${simulation.parcAvant}% → ${simulation.parcApres}%${simulation.parcAvant === simulation.parcApres ? ' (simple redistribution de capacité, sans effet net sur le parc)' : ''}</p>`
          : ''
      }
      <h3 class="simulation-alerts-title">Alertes</h3>
      ${renderAlertes(simulation.alertes)}
    </div>
  `;
}

export function openDemandeModal(actif, type, { onDone } = {}) {
  const aDesEnfants = true; // la case peut toujours être décochée si l'actif n'a pas d'enfants (sans effet)
  const bodyHtml = `
    <p>${TITRES[type]} pour <strong>${escapeHtml(actif.nom)}</strong> (${escapeHtml(actif.code)}).</p>
    ${
      type === 'DEPLACEMENT'
        ? `
      <label class="field">
        <span>Centrale de destination</span>
        <select id="centrale-dest"><option value="">Chargement…</option></select>
      </label>
      ${
        aDesEnfants
          ? `<label class="field field-checkbox">
               <input type="checkbox" id="avec-hierarchie" checked />
               <span>Déplacer avec toute sa hiérarchie (actifs enfants)</span>
             </label>`
          : ''
      }
    `
        : ''
    }
    ${
      type === 'DECOMMISSIONNEMENT'
        ? `
      <label class="field">
        <span>État cible</span>
        <select id="etat-cible">
          <option value="DECOMMISSIONNE">Décommissionné</option>
          <option value="REFORME">Réformé</option>
        </select>
      </label>
    `
        : ''
    }
    <div id="sim-container">${type === 'DEPLACEMENT' ? '' : '<p class="loading">Calcul de l\'impact…</p>'}</div>
    <label class="field">
      <span>Motif de la demande</span>
      <textarea id="motif" rows="3" required placeholder="Justification : usure, panne, planification de maintenance, remplacement…"></textarea>
    </label>
    <label class="field">
      <span>Date prévue (optionnel)</span>
      <input type="date" id="date-prevue" />
    </label>
    ${
      type === 'RETRAIT'
        ? `
      <h3 class="dashboard-subtitle">Détails de la coupure (pour la note d'arrêt)</h3>
      <div class="field-row">
        <label class="field">
          <span>Date début de coupure</span>
          <input type="date" id="date-debut-coupure" />
        </label>
        <label class="field">
          <span>Heure début de coupure</span>
          <input type="time" id="heure-debut-coupure" />
        </label>
      </div>
      <div class="field-row">
        <label class="field">
          <span>Date de retour en exploitation</span>
          <input type="date" id="date-retour-exploitation" />
        </label>
        <label class="field">
          <span>Heure fin de coupure</span>
          <input type="time" id="heure-fin-coupure" />
        </label>
      </div>
      <div class="field-row">
        <label class="field">
          <span>Nombre de départs sur la rame</span>
          <input type="number" id="nb-departs-rame" min="0" step="1" />
        </label>
        <label class="field">
          <span>Nombre de départs impactés par la coupure</span>
          <input type="number" id="nb-departs-impactes" min="0" step="1" />
        </label>
      </div>
      <label class="field">
        <span>Liste des départs impactés</span>
        <textarea id="liste-departs-impactes" rows="2" placeholder="Ex : Départ Bassa, Départ Bonabéri…"></textarea>
      </label>
      <label class="field">
        <span>Liste des localités impactées</span>
        <textarea id="liste-localites-impactees" rows="2" placeholder="Ex : Bonabéri, Bassa, Akwa…"></textarea>
      </label>
      <label class="field">
        <span>Entreprise désignée pour les travaux</span>
        <select id="entreprise-designee"><option value="">Chargement…</option></select>
      </label>
      <fieldset class="field field-fieldset">
        <legend>Clients industriels impactés ?</legend>
        <div class="field-row">
          <label class="field field-checkbox"><input type="radio" name="clients-industriels" id="clients-industriels-oui" value="oui" /> Oui</label>
          <label class="field field-checkbox"><input type="radio" name="clients-industriels" id="clients-industriels-non" value="non" /> Non</label>
        </div>
        <div id="liste-clients-industriels-wrapper" style="display:none;">
          <textarea id="liste-clients-industriels" rows="2" placeholder="Lister les clients industriels impactés…"></textarea>
        </div>
      </fieldset>
    `
        : ''
    }
    <div class="modal-footer">
      <button class="btn btn-ghost" data-close>Annuler</button>
      <button class="btn ${type === 'DECOMMISSIONNEMENT' ? 'btn-danger' : 'btn-primary'}" id="confirm-btn" disabled>${SUBMIT_LABELS[type]}</button>
    </div>
  `;

  openModal(TITRES[type], bodyHtml, {
    wide: true,
    onMount: async (dialog, close) => {
      const simContainer = dialog.querySelector('#sim-container');
      const confirmBtn = dialog.querySelector('#confirm-btn');
      const motifInput = dialog.querySelector('#motif');
      const datePrevueInput = dialog.querySelector('#date-prevue');
      const etatCibleSelect = dialog.querySelector('#etat-cible');
      const hierarchieCheckbox = dialog.querySelector('#avec-hierarchie');
      let centraleDestId = null;

      async function chargerSimulation() {
        if (type === 'DEPLACEMENT' && !centraleDestId) {
          simContainer.innerHTML = '';
          confirmBtn.disabled = true;
          return;
        }
        simContainer.innerHTML = '<p class="loading">Calcul de l\'impact…</p>';
        try {
          const simulation = await api.previewDemande({
            type,
            actifId: actif.id,
            centraleDestId,
            etatCible: etatCibleSelect?.value,
            avecHierarchie: hierarchieCheckbox ? hierarchieCheckbox.checked : true,
          });
          simContainer.innerHTML = renderSimulation(simulation);
          confirmBtn.disabled = false;
        } catch (err) {
          simContainer.innerHTML = `<p class="error-state">${escapeHtml(err.message)}</p>`;
          confirmBtn.disabled = true;
        }
      }

      if (type === 'DEPLACEMENT') {
        const select = dialog.querySelector('#centrale-dest');
        const centrales = await api.getCentraleDestinations();
        const autres = centrales.filter((c) => c.id !== actif.centrale_id);
        select.innerHTML = autres.length
          ? '<option value="">Sélectionner une centrale…</option>' +
            autres.map((c) => `<option value="${c.id}">${escapeHtml(c.nom)}</option>`).join('')
          : '<option value="">Aucune autre centrale active disponible</option>';
        select.addEventListener('change', () => {
          centraleDestId = select.value ? Number(select.value) : null;
          chargerSimulation();
        });
        hierarchieCheckbox?.addEventListener('change', chargerSimulation);
      } else {
        etatCibleSelect?.addEventListener('change', chargerSimulation);
        await chargerSimulation();
      }

      if (type === 'RETRAIT') {
        const entrepriseSelect = dialog.querySelector('#entreprise-designee');
        const entreprises = (await api.getEntreprises()).filter((e) => e.statut === 'ACTIVE');
        entrepriseSelect.innerHTML =
          '<option value="">— Non renseignée —</option>' +
          entreprises.map((e) => `<option value="${e.id}">${escapeHtml(e.nom)}</option>`).join('');

        const radioOui = dialog.querySelector('#clients-industriels-oui');
        const radioNon = dialog.querySelector('#clients-industriels-non');
        const listeWrapper = dialog.querySelector('#liste-clients-industriels-wrapper');
        [radioOui, radioNon].forEach((radio) =>
          radio.addEventListener('change', () => {
            listeWrapper.style.display = radioOui.checked ? '' : 'none';
          })
        );
      }

      confirmBtn.addEventListener('click', async () => {
        if (!motifInput.value.trim()) {
          motifInput.focus();
          showToast('Veuillez indiquer un motif pour cette demande.', 'error');
          return;
        }
        const radioOui = dialog.querySelector('#clients-industriels-oui');
        const radioNon = dialog.querySelector('#clients-industriels-non');
        const clientsIndustrielsImpactes = radioOui?.checked ? true : radioNon?.checked ? false : undefined;
        if (type === 'RETRAIT' && clientsIndustrielsImpactes === true && !dialog.querySelector('#liste-clients-industriels')?.value.trim()) {
          showToast('Veuillez lister les clients industriels impactés, ou sélectionner « Non ».', 'error');
          return;
        }

        confirmBtn.disabled = true;
        confirmBtn.textContent = 'Envoi…';
        try {
          await api.creerDemande({
            type,
            actifId: actif.id,
            centraleDestId,
            etatCible: etatCibleSelect?.value,
            avecHierarchie: hierarchieCheckbox ? hierarchieCheckbox.checked : true,
            motif: motifInput.value.trim(),
            datePrevue: datePrevueInput.value || null,
            dateDebutCoupure: dialog.querySelector('#date-debut-coupure')?.value || null,
            heureDebutCoupure: dialog.querySelector('#heure-debut-coupure')?.value || null,
            dateRetourExploitation: dialog.querySelector('#date-retour-exploitation')?.value || null,
            heureFinCoupure: dialog.querySelector('#heure-fin-coupure')?.value || null,
            nbDepartsRame: dialog.querySelector('#nb-departs-rame')?.value || null,
            nbDepartsImpactes: dialog.querySelector('#nb-departs-impactes')?.value || null,
            listeDepartsImpactes: dialog.querySelector('#liste-departs-impactes')?.value.trim() || null,
            listeLocalitesImpactees: dialog.querySelector('#liste-localites-impactees')?.value.trim() || null,
            entrepriseDesigneeId: dialog.querySelector('#entreprise-designee')?.value
              ? Number(dialog.querySelector('#entreprise-designee').value)
              : null,
            clientsIndustrielsImpactes,
            listeClientsIndustriels: clientsIndustrielsImpactes ? dialog.querySelector('#liste-clients-industriels')?.value.trim() || null : null,
          });
          showToast('Demande soumise, en attente de vérification par l\'Exploitation.', 'success');
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
