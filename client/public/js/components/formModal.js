import { api } from '../api.js';
import { openModal } from './modal.js';
import { escapeHtml, showToast, REGIONS_ELECTRIQUES } from '../utils.js';

export function openCentraleFormModal({ onDone, centrale } = {}) {
  const isEdit = !!centrale;
  const bodyHtml = `
    <form id="centrale-form">
      <label class="field">
        <span>Code (unique)</span>
        <input type="text" name="code" required placeholder="Ex : CTH-LMB" value="${isEdit ? escapeHtml(centrale.code) : ''}" ${isEdit ? 'disabled' : ''} />
      </label>
      <label class="field">
        <span>Nom</span>
        <input type="text" name="nom" required placeholder="Ex : Centrale Thermique de Limbé" value="${isEdit ? escapeHtml(centrale.nom) : ''}" />
      </label>
      <label class="field">
        <span>Type</span>
        <select name="type">
          ${['THERMIQUE', 'HYDRAULIQUE', 'NUCLEAIRE', 'SOLAIRE', 'EOLIEN']
            .map((t) => `<option value="${t}" ${isEdit && centrale.type === t ? 'selected' : ''}>${t.charAt(0) + t.slice(1).toLowerCase()}</option>`)
            .join('')}
        </select>
      </label>
      <div class="field-row">
        <label class="field">
          <span>Localisation</span>
          <input type="text" name="localisation" placeholder="Ex : Limbé" value="${isEdit ? escapeHtml(centrale.localisation || '') : ''}" />
        </label>
        <label class="field">
          <span>Région Electrique</span>
          <select name="regionElectrique">
            <option value="">— Non renseignée —</option>
            ${REGIONS_ELECTRIQUES.map(
              (r) => `<option value="${r.sigle}" ${isEdit && centrale.region_electrique === r.sigle ? 'selected' : ''}>${r.sigle} (${r.code})</option>`
            ).join('')}
          </select>
        </label>
      </div>
      <div class="field-row">
        <label class="field">
          <span>Puissance installée (MW)</span>
          <input type="number" name="capaciteNominaleMw" required min="0" step="0.1" value="${isEdit ? centrale.capacite_nominale_mw : ''}" />
        </label>
        <label class="field">
          <span>Seuil d'alerte (%)</span>
          <input type="number" name="seuilAlertePct" value="${isEdit ? centrale.seuil_alerte_pct : 70}" min="0" max="100" step="1" />
        </label>
      </div>
      ${
        isEdit
          ? `<label class="field">
               <span>Statut</span>
               <select name="statut">
                 <option value="ACTIVE" ${centrale.statut === 'ACTIVE' ? 'selected' : ''}>Active</option>
                 <option value="INACTIVE" ${centrale.statut === 'INACTIVE' ? 'selected' : ''}>Inactive</option>
               </select>
             </label>`
          : ''
      }
      <div class="modal-footer">
        <button type="button" class="btn btn-ghost" data-close>Annuler</button>
        <button type="submit" class="btn btn-primary">${isEdit ? 'Enregistrer' : 'Créer la centrale'}</button>
      </div>
    </form>
  `;

  openModal(isEdit ? `Modifier ${centrale.nom}` : 'Nouvelle centrale', bodyHtml, {
    onMount: (dialog, close) => {
      const form = dialog.querySelector('#centrale-form');
      form.addEventListener('submit', async (e) => {
        e.preventDefault();
        const fd = new FormData(form);
        try {
          const payload = {
            nom: fd.get('nom'),
            type: fd.get('type'),
            localisation: fd.get('localisation') || null,
            regionElectrique: fd.get('regionElectrique') || null,
            capaciteNominaleMw: Number(fd.get('capaciteNominaleMw')),
            seuilAlertePct: Number(fd.get('seuilAlertePct')) || 70,
          };
          if (isEdit) {
            payload.statut = fd.get('statut');
            await api.updateCentrale(centrale.id, payload);
          } else {
            payload.code = fd.get('code');
            await api.createCentrale(payload);
          }
          showToast(isEdit ? 'Centrale modifiée.' : 'Centrale créée.', 'success');
          close();
          onDone?.();
        } catch (err) {
          showToast(err.message, 'error');
        }
      });
    },
  });
}

export function openActifFormModal({ centraleId, actifsCentrale = [], onDone } = {}) {
  const parentOptions = actifsCentrale
    .filter((a) => !['DECOMMISSIONNE', 'REFORME'].includes(a.statut))
    .map((a) => `<option value="${a.id}">${escapeHtml(a.nom)}</option>`)
    .join('');

  const bodyHtml = `
    <form id="actif-form">
      <div class="field-row">
        <label class="field">
          <span>Code (unique)</span>
          <input type="text" name="code" required placeholder="Ex : CTH-DLA-TG03" />
        </label>
        <label class="field">
          <span>Nom</span>
          <input type="text" name="nom" required placeholder="Ex : Turbine à gaz TG-03" />
        </label>
      </div>
      <label class="field">
        <span>Type</span>
        <input type="text" name="type" placeholder="Ex : UNITE_PRODUCTION, GROUPE_PRODUCTION, TURBINE, GENERATEUR…" />
      </label>
      <label class="field">
        <span>Actif mère (optionnel)</span>
        <select name="parentId">
          <option value="">— Aucun (actif de premier niveau) —</option>
          ${parentOptions}
        </select>
      </label>
      <div class="field-row">
        <label class="field">
          <span>Criticité</span>
          <select name="criticite">
            <option value="FAIBLE">Faible</option>
            <option value="MOYENNE" selected>Moyenne</option>
            <option value="HAUTE">Haute</option>
            <option value="CRITIQUE">Critique</option>
          </select>
        </label>
        <label class="field">
          <span>Contribution (MW)</span>
          <input type="number" name="contributionMw" value="0" min="0" step="0.1" />
        </label>
      </div>
      <div class="field-row">
        <label class="field">
          <span>Fabricant</span>
          <input type="text" name="fabricant" />
        </label>
        <label class="field">
          <span>Modèle</span>
          <input type="text" name="modele" />
        </label>
      </div>
      <div class="field-row">
        <label class="field">
          <span>Numéro de série</span>
          <input type="text" name="numeroSerie" />
        </label>
        <label class="field">
          <span>Date de mise en service</span>
          <input type="date" name="dateInstallation" />
        </label>
      </div>
      <label class="field">
        <span>Description</span>
        <textarea name="description" rows="2"></textarea>
      </label>
      <div class="modal-footer">
        <button type="button" class="btn btn-ghost" data-close>Annuler</button>
        <button type="submit" class="btn btn-primary">Créer l'actif</button>
      </div>
    </form>
  `;

  openModal('Nouvel actif', bodyHtml, {
    onMount: (dialog, close) => {
      const form = dialog.querySelector('#actif-form');
      form.addEventListener('submit', async (e) => {
        e.preventDefault();
        const fd = new FormData(form);
        try {
          await api.createActif({
            code: fd.get('code'),
            nom: fd.get('nom'),
            type: fd.get('type') || 'EQUIPEMENT',
            centraleId,
            parentId: fd.get('parentId') ? Number(fd.get('parentId')) : null,
            criticite: fd.get('criticite'),
            contributionMw: Number(fd.get('contributionMw')) || 0,
            fabricant: fd.get('fabricant') || null,
            modele: fd.get('modele') || null,
            numeroSerie: fd.get('numeroSerie') || null,
            dateInstallation: fd.get('dateInstallation') || null,
            description: fd.get('description') || null,
          });
          showToast('Actif créé.', 'success');
          close();
          onDone?.();
        } catch (err) {
          showToast(err.message, 'error');
        }
      });
    },
  });
}
