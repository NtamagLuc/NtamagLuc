import { api } from '../api.js';
import { openModal } from '../components/modal.js';
import { escapeHtml, formatDate, showToast, ROLE_LABELS } from '../utils.js';
import { refresh } from '../router.js';

export async function renderUtilisateurs() {
  const app = document.getElementById('app');
  const utilisateurs = await api.getUtilisateurs();

  app.innerHTML = `
    <div class="page-header">
      <div>
        <h1>Utilisateurs</h1>
        <p class="page-subtitle">${utilisateurs.length} utilisateur(s)</p>
      </div>
      <button class="btn btn-primary" id="new-user-btn">+ Nouvel utilisateur</button>
    </div>

    <div class="table-wrapper">
      <table class="data-table">
        <thead>
          <tr><th>Nom</th><th>Email</th><th>Rôle</th><th>Statut</th><th>Créé le</th><th></th></tr>
        </thead>
        <tbody>
          ${utilisateurs.map(renderRow).join('')}
        </tbody>
      </table>
    </div>
  `;

  document.getElementById('new-user-btn').addEventListener('click', () => openUserFormModal());

  document.querySelectorAll('[data-edit-user]').forEach((btn) => {
    btn.addEventListener('click', () => {
      const user = utilisateurs.find((u) => u.id === Number(btn.dataset.editUser));
      openUserFormModal(user);
    });
  });
}

function renderRow(u) {
  return `
    <tr>
      <td>${escapeHtml(u.nom)}</td>
      <td>${escapeHtml(u.email)}</td>
      <td><span class="badge badge-neutral">${ROLE_LABELS[u.role] || u.role}</span></td>
      <td><span class="badge ${u.actif ? 'badge-success' : 'badge-danger'}">${u.actif ? 'Actif' : 'Désactivé'}</span></td>
      <td>${formatDate(u.created_at)}</td>
      <td><button class="btn btn-sm btn-ghost" data-edit-user="${u.id}">Modifier</button></td>
    </tr>
  `;
}

function openUserFormModal(user) {
  const isEdit = !!user;
  const bodyHtml = `
    <form id="user-form">
      <label class="field">
        <span>Nom</span>
        <input type="text" name="nom" required value="${isEdit ? escapeHtml(user.nom) : ''}" />
      </label>
      <label class="field">
        <span>Email</span>
        <input type="email" name="email" required value="${isEdit ? escapeHtml(user.email) : ''}" ${isEdit ? 'disabled' : ''} />
      </label>
      <label class="field">
        <span>Rôle</span>
        <select name="role">
          ${Object.entries(ROLE_LABELS)
            .map(([v, l]) => `<option value="${v}" ${isEdit && user.role === v ? 'selected' : ''}>${l}</option>`)
            .join('')}
        </select>
      </label>
      <label class="field">
        <span>${isEdit ? 'Nouveau mot de passe (laisser vide pour ne pas changer)' : 'Mot de passe'}</span>
        <input type="password" name="password" ${isEdit ? '' : 'required'} />
      </label>
      ${
        isEdit
          ? `
        <label class="field field-checkbox">
          <input type="checkbox" name="actif" ${user.actif ? 'checked' : ''} />
          <span>Compte actif</span>
        </label>
      `
          : ''
      }
      <div class="modal-footer">
        <button type="button" class="btn btn-ghost" data-close>Annuler</button>
        <button type="submit" class="btn btn-primary">${isEdit ? 'Enregistrer' : 'Créer l\'utilisateur'}</button>
      </div>
    </form>
  `;

  openModal(isEdit ? `Modifier ${user.nom}` : 'Nouvel utilisateur', bodyHtml, {
    onMount: (dialog, close) => {
      dialog.querySelector('#user-form').addEventListener('submit', async (e) => {
        e.preventDefault();
        const fd = new FormData(e.target);
        try {
          if (isEdit) {
            await api.updateUtilisateur(user.id, {
              nom: fd.get('nom'),
              role: fd.get('role'),
              actif: fd.get('actif') === 'on',
              password: fd.get('password') || undefined,
            });
          } else {
            await api.createUtilisateur({
              nom: fd.get('nom'),
              email: fd.get('email'),
              role: fd.get('role'),
              password: fd.get('password'),
            });
          }
          showToast(isEdit ? 'Utilisateur modifié.' : 'Utilisateur créé.', 'success');
          close();
          refresh();
        } catch (err) {
          showToast(err.message, 'error');
        }
      });
    },
  });
}
