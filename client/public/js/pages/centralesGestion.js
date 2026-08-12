import { api } from '../api.js';
import { openCentraleFormModal } from '../components/formModal.js';
import { setupImportButton } from '../components/importButton.js';
import { escapeHtml, showToast, TYPE_CENTRALE_LABELS, CENTRALE_STATUT_LABELS, CENTRALE_STATUT_CLASSES, formatNombre } from '../utils.js';
import { refresh } from '../router.js';

export async function renderCentralesGestion() {
  const app = document.getElementById('app');
  const centrales = await api.getCentrales();

  app.innerHTML = `
    <div class="page-header">
      <div>
        <h1>Centrales</h1>
        <p class="page-subtitle">${centrales.length} centrale(s) — création, modification, suppression</p>
      </div>
      <div class="actif-actions">
        <a class="btn btn-ghost" href="${api.exportCentralesUrl()}" target="_blank" rel="noopener">Exporter CSV</a>
        <button class="btn btn-ghost" id="import-centrales-btn">Importer (CSV/Excel)</button>
        <button class="btn btn-primary" id="new-centrale-btn">+ Nouvelle centrale</button>
      </div>
    </div>
    <input type="file" id="import-centrales-file" accept=".csv,.xlsx,.xls" style="display:none;" />

    <div class="table-wrapper">
      <table class="data-table">
        <thead>
          <tr><th>Code</th><th>Nom</th><th>Type</th><th>Localisation</th><th>Région</th><th>Puissance installée</th><th>Statut</th><th></th></tr>
        </thead>
        <tbody>
          ${centrales.map(renderRow).join('') || '<tr><td colspan="8" class="empty-state">Aucune centrale enregistrée.</td></tr>'}
        </tbody>
      </table>
    </div>
  `;

  document.getElementById('new-centrale-btn').addEventListener('click', () => openCentraleFormModal({ onDone: refresh }));

  document.querySelectorAll('[data-edit-centrale]').forEach((btn) => {
    btn.addEventListener('click', () => {
      const centrale = centrales.find((c) => c.id === Number(btn.dataset.editCentrale));
      openCentraleFormModal({ centrale, onDone: refresh });
    });
  });

  document.querySelectorAll('[data-delete-centrale]').forEach((btn) => {
    btn.addEventListener('click', async () => {
      const centrale = centrales.find((c) => c.id === Number(btn.dataset.deleteCentrale));
      if (!confirm(`Supprimer définitivement la centrale "${centrale.nom}" ?`)) return;
      try {
        await api.deleteCentrale(centrale.id);
        showToast('Centrale supprimée.', 'success');
        refresh();
      } catch (err) {
        showToast(err.message, 'error');
      }
    });
  });

  setupImportButton('import-centrales-btn', 'import-centrales-file', api.importCentrales);
}

function renderRow(c) {
  return `
    <tr>
      <td>${escapeHtml(c.code)}</td>
      <td><a href="#/centrales/${c.id}">${escapeHtml(c.nom)}</a></td>
      <td>${TYPE_CENTRALE_LABELS[c.type] || c.type}</td>
      <td>${escapeHtml(c.localisation || '—')}</td>
      <td>${escapeHtml(c.region_electrique || '—')}</td>
      <td>${formatNombre(c.capacite_nominale_mw)} MW</td>
      <td><span class="badge ${CENTRALE_STATUT_CLASSES[c.statut] || 'badge-neutral'}">${CENTRALE_STATUT_LABELS[c.statut] || c.statut}</span></td>
      <td>
        <button class="btn btn-sm btn-ghost" data-edit-centrale="${c.id}">Modifier</button>
        <button class="btn btn-sm btn-danger" data-delete-centrale="${c.id}">Supprimer</button>
      </td>
    </tr>
  `;
}
