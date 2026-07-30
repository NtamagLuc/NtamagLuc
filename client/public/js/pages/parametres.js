import { api } from '../api.js';
import { showToast } from '../utils.js';
import { isAdmin } from '../auth.js';

export async function renderParametres() {
  const app = document.getElementById('app');

  if (!isAdmin()) {
    app.innerHTML = '<p class="page-error">Accès réservé aux administrateurs.</p>';
    return;
  }

  const seuils = await api.getParametresImpact();

  app.innerHTML = `
    <div class="page-header">
      <div>
        <h1>Paramètres</h1>
        <p class="page-subtitle">Seuils de classification du niveau d'impact des opérations</p>
      </div>
    </div>

    <div class="reporting-panel" style="max-width:520px;">
      <p class="page-subtitle">
        Le niveau d'impact d'une simulation est déterminé par la variation de performance
        (en points) qu'elle entraîne sur la ou les centrales concernées. Une opération dont
        l'impact est jugé <strong>critique</strong> nécessite la validation d'un Administrateur
        (au lieu d'un Validateur).
      </p>
      <form id="parametres-form">
        <label class="field">
          <span>Seuil « Moyen » (points de performance)</span>
          <input type="number" name="seuilMoyenPts" min="0" step="0.5" value="${seuils.seuil_moyen_pts}" required />
        </label>
        <label class="field">
          <span>Seuil « Important » (points de performance)</span>
          <input type="number" name="seuilImportantPts" min="0" step="0.5" value="${seuils.seuil_important_pts}" required />
        </label>
        <label class="field">
          <span>Seuil « Critique » (points de performance)</span>
          <input type="number" name="seuilCritiquePts" min="0" step="0.5" value="${seuils.seuil_critique_pts}" required />
        </label>
        <button type="submit" class="btn btn-primary">Enregistrer</button>
      </form>
    </div>
  `;

  document.getElementById('parametres-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    const fd = new FormData(e.target);
    try {
      await api.updateParametresImpact({
        seuilMoyenPts: Number(fd.get('seuilMoyenPts')),
        seuilImportantPts: Number(fd.get('seuilImportantPts')),
        seuilCritiquePts: Number(fd.get('seuilCritiquePts')),
      });
      showToast('Seuils mis à jour.', 'success');
    } catch (err) {
      showToast(err.message, 'error');
    }
  });
}
