import { api } from '../api.js';
import { openModal } from '../components/modal.js';
import { escapeHtml, formatDate, showToast, ROLE_LABELS } from '../utils.js';
import { getCurrentUser } from '../auth.js';
import { refresh } from '../router.js';

const ROLES_CENTRALE_SCOPE = ['CHEF_CENTRALE', 'RESPONSABLE_MECANIQUE', 'RESPONSABLE_EXPLOITATION'];

export async function renderUtilisateurs() {
  const app = document.getElementById('app');
  const [utilisateurs, centrales] = await Promise.all([api.getUtilisateurs(), api.getCentrales()]);
  const moi = getCurrentUser();

  app.innerHTML = `
    <div class="page-header">
      <div>
        <h1>Utilisateurs</h1>
        <p class="page-subtitle">${utilisateurs.length} utilisateur(s)</p>
      </div>
      <div class="actif-actions">
        <a class="btn btn-ghost" href="${api.exportUtilisateursUrl()}" target="_blank" rel="noopener">Exporter CSV</a>
        <button class="btn btn-ghost" id="import-user-btn">Importer CSV / Excel</button>
        <button class="btn btn-primary" id="new-user-btn">+ Nouvel utilisateur</button>
      </div>
    </div>
    <input type="file" id="import-user-file" accept=".csv,.xlsx,.xls" style="display:none;" />

    <div class="table-wrapper">
      <table class="data-table">
        <thead>
          <tr><th>Nom</th><th>Email</th><th>Rôle</th><th>Centrale</th><th>Statut</th><th>Créé le</th><th></th></tr>
        </thead>
        <tbody>
          ${utilisateurs.map((u) => renderRow(u, moi)).join('')}
        </tbody>
      </table>
    </div>
  `;

  document.getElementById('new-user-btn').addEventListener('click', () => openUserFormModal(undefined, centrales));

  document.querySelectorAll('[data-edit-user]').forEach((btn) => {
    btn.addEventListener('click', () => {
      const user = utilisateurs.find((u) => u.id === Number(btn.dataset.editUser));
      openUserFormModal(user, centrales);
    });
  });

  document.querySelectorAll('[data-delete-user]').forEach((btn) => {
    btn.addEventListener('click', async () => {
      const user = utilisateurs.find((u) => u.id === Number(btn.dataset.deleteUser));
      if (!confirm(`Supprimer définitivement l'utilisateur "${user.nom}" ?`)) return;
      try {
        await api.deleteUtilisateur(user.id);
        showToast('Utilisateur supprimé.', 'success');
        refresh();
      } catch (err) {
        showToast(err.message, 'error');
      }
    });
  });

  const importInput = document.getElementById('import-user-file');
  document.getElementById('import-user-btn').addEventListener('click', () => importInput.click());
  importInput.addEventListener('change', async () => {
    const file = importInput.files[0];
    if (!file) return;
    try {
      const rapport = await api.importUtilisateurs(file);
      showToast(
        `Import terminé : ${rapport.crees} créé(s), ${rapport.misAJour} mis à jour${rapport.erreurs.length ? `, ${rapport.erreurs.length} erreur(s)` : ''}.`,
        rapport.erreurs.length ? 'error' : 'success'
      );
      if (rapport.erreurs.length) console.warn('Erreurs import utilisateurs :', rapport.erreurs);
      refresh();
    } catch (err) {
      showToast(err.message, 'error');
    } finally {
      importInput.value = '';
    }
  });
}

function renderRow(u, moi) {
  return `
    <tr>
      <td>${escapeHtml(u.nom)}</td>
      <td>${escapeHtml(u.email)}</td>
      <td><span class="badge badge-neutral">${ROLE_LABELS[u.role] || u.role}</span></td>
      <td>${u.centrale_nom ? escapeHtml(u.centrale_nom) : '—'}</td>
      <td><span class="badge ${u.actif ? 'badge-success' : 'badge-danger'}">${u.actif ? 'Actif' : 'Désactivé'}</span></td>
      <td>${formatDate(u.created_at)}</td>
      <td>
        <button class="btn btn-sm btn-ghost" data-edit-user="${u.id}">Modifier</button>
        ${u.id !== moi.id ? `<button class="btn btn-sm btn-danger" data-delete-user="${u.id}">Supprimer</button>` : ''}
      </td>
    </tr>
  `;
}

function openUserFormModal(user, centrales) {
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
        <select name="role" id="user-role-select">
          ${Object.entries(ROLE_LABELS)
            .map(([v, l]) => `<option value="${v}" ${isEdit && user.role === v ? 'selected' : ''}>${l}</option>`)
            .join('')}
        </select>
      </label>
      <label class="field" id="user-centrale-field" style="display:${ROLES_CENTRALE_SCOPE.includes(isEdit ? user.role : Object.keys(ROLE_LABELS)[0]) ? '' : 'none'};">
        <span>Centrale</span>
        <select name="centraleId">
          <option value="">— Sélectionner —</option>
          ${centrales
            .map((c) => `<option value="${c.id}" ${isEdit && user.centrale_id === c.id ? 'selected' : ''}>${escapeHtml(c.nom)}</option>`)
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
      const roleSelect = dialog.querySelector('#user-role-select');
      const centraleField = dialog.querySelector('#user-centrale-field');
      roleSelect.addEventListener('change', () => {
        centraleField.style.display = ROLES_CENTRALE_SCOPE.includes(roleSelect.value) ? '' : 'none';
      });

      dialog.querySelector('#user-form').addEventListener('submit', async (e) => {
        e.preventDefault();
        const fd = new FormData(e.target);
        const role = fd.get('role');
        const centraleId = fd.get('centraleId') ? Number(fd.get('centraleId')) : null;
        if (ROLES_CENTRALE_SCOPE.includes(role) && !centraleId) {
          showToast('Sélectionnez une centrale pour ce rôle.', 'error');
          return;
        }
        try {
          if (isEdit) {
            await api.updateUtilisateur(user.id, {
              nom: fd.get('nom'),
              role,
              centraleId: ROLES_CENTRALE_SCOPE.includes(role) ? centraleId : null,
              actif: fd.get('actif') === 'on',
              password: fd.get('password') || undefined,
            });
          } else {
            await api.createUtilisateur({
              nom: fd.get('nom'),
              email: fd.get('email'),
              role,
              centraleId: ROLES_CENTRALE_SCOPE.includes(role) ? centraleId : null,
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
