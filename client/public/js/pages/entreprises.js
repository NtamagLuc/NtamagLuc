import { api } from '../api.js';
import { openModal } from '../components/modal.js';
import { escapeHtml, formatDate, showToast } from '../utils.js';
import { refresh } from '../router.js';

export async function renderEntreprises() {
  const app = document.getElementById('app');
  const entreprises = await api.getEntreprises();

  app.innerHTML = `
    <div class="page-header">
      <div>
        <h1>Entreprises</h1>
        <p class="page-subtitle">${entreprises.length} entreprise(s) — référentiel des entreprises désignables pour les travaux de retrait</p>
      </div>
      <div class="actif-actions">
        <button class="btn btn-primary" id="new-entreprise-btn">+ Nouvelle entreprise</button>
      </div>
    </div>

    <div class="table-wrapper">
      <table class="data-table">
        <thead>
          <tr><th>Nom</th><th>Statut</th><th>Créée le</th><th></th></tr>
        </thead>
        <tbody>
          ${entreprises.map(renderRow).join('') || '<tr><td colspan="4" class="empty-state">Aucune entreprise enregistrée.</td></tr>'}
        </tbody>
      </table>
    </div>
  `;

  document.getElementById('new-entreprise-btn').addEventListener('click', () => openEntrepriseFormModal());

  document.querySelectorAll('[data-edit-entreprise]').forEach((btn) => {
    btn.addEventListener('click', () => {
      const entreprise = entreprises.find((e) => e.id === Number(btn.dataset.editEntreprise));
      openEntrepriseFormModal(entreprise);
    });
  });

  document.querySelectorAll('[data-delete-entreprise]').forEach((btn) => {
    btn.addEventListener('click', async () => {
      const entreprise = entreprises.find((e) => e.id === Number(btn.dataset.deleteEntreprise));
      if (!confirm(`Supprimer définitivement l'entreprise "${entreprise.nom}" ?`)) return;
      try {
        await api.deleteEntreprise(entreprise.id);
        showToast('Entreprise supprimée.', 'success');
        refresh();
      } catch (err) {
        showToast(err.message, 'error');
      }
    });
  });
}

function renderRow(e) {
  return `
    <tr>
      <td>${escapeHtml(e.nom)}</td>
      <td><span class="badge ${e.statut === 'ACTIVE' ? 'badge-success' : 'badge-neutral'}">${e.statut === 'ACTIVE' ? 'Active' : 'Inactive'}</span></td>
      <td>${formatDate(e.created_at)}</td>
      <td>
        <button class="btn btn-sm btn-ghost" data-edit-entreprise="${e.id}">Modifier</button>
        <button class="btn btn-sm btn-danger" data-delete-entreprise="${e.id}">Supprimer</button>
      </td>
    </tr>
  `;
}

function openEntrepriseFormModal(entreprise) {
  const isEdit = !!entreprise;
  const bodyHtml = `
    <form id="entreprise-form">
      <label class="field">
        <span>Nom de l'entreprise</span>
        <input type="text" name="nom" required placeholder="Ex : Entreprise Générale des Travaux Électriques" value="${isEdit ? escapeHtml(entreprise.nom) : ''}" />
      </label>
      ${
        isEdit
          ? `<label class="field">
               <span>Statut</span>
               <select name="statut">
                 <option value="ACTIVE" ${entreprise.statut === 'ACTIVE' ? 'selected' : ''}>Active</option>
                 <option value="INACTIVE" ${entreprise.statut === 'INACTIVE' ? 'selected' : ''}>Inactive</option>
               </select>
             </label>`
          : ''
      }
      <div class="modal-footer">
        <button type="button" class="btn btn-ghost" data-close>Annuler</button>
        <button type="submit" class="btn btn-primary">${isEdit ? 'Enregistrer' : "Créer l'entreprise"}</button>
      </div>
    </form>
  `;

  openModal(isEdit ? `Modifier ${entreprise.nom}` : 'Nouvelle entreprise', bodyHtml, {
    onMount: (dialog, close) => {
      dialog.querySelector('#entreprise-form').addEventListener('submit', async (e) => {
        e.preventDefault();
        const fd = new FormData(e.target);
        try {
          if (isEdit) {
            await api.updateEntreprise(entreprise.id, { nom: fd.get('nom'), statut: fd.get('statut') });
          } else {
            await api.createEntreprise({ nom: fd.get('nom') });
          }
          showToast(isEdit ? 'Entreprise modifiée.' : 'Entreprise créée.', 'success');
          close();
          refresh();
        } catch (err) {
          showToast(err.message, 'error');
        }
      });
    },
  });
}
