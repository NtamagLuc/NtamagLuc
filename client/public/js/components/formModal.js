import { api } from '../api.js';
import { openModal } from './modal.js';
import { escapeHtml, showToast } from '../utils.js';

export function openCentraleFormModal({ onDone } = {}) {
  const bodyHtml = `
    <form id="centrale-form">
      <label class="field">
        <span>Nom</span>
        <input type="text" name="nom" required placeholder="Ex : Centrale Thermique de Limbé" />
      </label>
      <label class="field">
        <span>Type</span>
        <select name="type">
          <option value="THERMIQUE">Thermique</option>
          <option value="HYDRAULIQUE">Hydraulique</option>
          <option value="NUCLEAIRE">Nucléaire</option>
          <option value="SOLAIRE">Solaire</option>
          <option value="EOLIEN">Éolien</option>
        </select>
      </label>
      <label class="field">
        <span>Localisation</span>
        <input type="text" name="localisation" placeholder="Ex : Limbé" />
      </label>
      <label class="field">
        <span>Capacité nominale (MW)</span>
        <input type="number" name="capaciteNominaleMw" required min="0" step="0.1" />
      </label>
      <label class="field">
        <span>Seuil d'alerte de performance (%)</span>
        <input type="number" name="seuilAlertePct" value="70" min="0" max="100" step="1" />
      </label>
      <div class="modal-footer">
        <button type="button" class="btn btn-ghost" data-close>Annuler</button>
        <button type="submit" class="btn btn-primary">Créer la centrale</button>
      </div>
    </form>
  `;

  openModal('Nouvelle centrale', bodyHtml, {
    onMount: (dialog, close) => {
      const form = dialog.querySelector('#centrale-form');
      form.addEventListener('submit', async (e) => {
        e.preventDefault();
        const fd = new FormData(form);
        try {
          await api.createCentrale({
            nom: fd.get('nom'),
            type: fd.get('type'),
            localisation: fd.get('localisation') || null,
            capaciteNominaleMw: Number(fd.get('capaciteNominaleMw')),
            seuilAlertePct: Number(fd.get('seuilAlertePct')) || 70,
          });
          showToast('Centrale créée.', 'success');
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
    .filter((a) => a.statut !== 'RETIRE')
    .map((a) => `<option value="${a.id}">${escapeHtml(a.nom)}</option>`)
    .join('');

  const bodyHtml = `
    <form id="actif-form">
      <label class="field">
        <span>Nom</span>
        <input type="text" name="nom" required placeholder="Ex : Turbine à gaz TG-03" />
      </label>
      <label class="field">
        <span>Type</span>
        <input type="text" name="type" placeholder="Ex : TURBINE, GENERATEUR, CAPTEUR…" />
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
      <label class="field">
        <span>Date d'installation</span>
        <input type="date" name="dateInstallation" />
      </label>
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
            nom: fd.get('nom'),
            type: fd.get('type') || 'EQUIPEMENT',
            centraleId,
            parentId: fd.get('parentId') ? Number(fd.get('parentId')) : null,
            criticite: fd.get('criticite'),
            contributionMw: Number(fd.get('contributionMw')) || 0,
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
