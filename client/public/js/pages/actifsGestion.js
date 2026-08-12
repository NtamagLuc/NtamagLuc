import { api } from '../api.js';
import { openActifFormModal } from '../components/formModal.js';
import { setupImportButton } from '../components/importButton.js';
import { escapeHtml, showToast, STATUT_LABELS, STATUT_CLASSES, CRITICITE_LABELS, CRITICITE_CLASSES, formatNombre } from '../utils.js';
import { refresh } from '../router.js';

export async function renderActifsGestion() {
  const app = document.getElementById('app');
  const centrales = await api.getCentrales();
  const params = new URLSearchParams(location.hash.split('?')[1] || '');
  const centraleId = params.get('centraleId') ? Number(params.get('centraleId')) : centrales[0]?.id ?? null;

  app.innerHTML = `
    <div class="page-header">
      <div>
        <h1>Actifs</h1>
        <p class="page-subtitle">Création, modification, suppression des actifs par centrale</p>
      </div>
      <div class="actif-actions">
        <a class="btn btn-ghost" href="${api.exportActifsUrl()}" target="_blank" rel="noopener">Exporter CSV</a>
        <button class="btn btn-ghost" id="import-actifs-btn">Importer (CSV/Excel)</button>
        <button class="btn btn-primary" id="new-actif-btn" ${centraleId ? '' : 'disabled'}>+ Nouvel actif</button>
      </div>
    </div>
    <input type="file" id="import-actifs-file" accept=".csv,.xlsx,.xls" style="display:none;" />

    <label class="field field-inline" style="max-width:360px;">
      <span>Centrale</span>
      <select id="centrale-select">
        ${
          centrales.length
            ? centrales.map((c) => `<option value="${c.id}" ${c.id === centraleId ? 'selected' : ''}>${escapeHtml(c.nom)} (${escapeHtml(c.code)})</option>`).join('')
            : '<option value="">Aucune centrale</option>'
        }
      </select>
    </label>

    <div id="actifs-table-container"></div>
  `;

  document.getElementById('centrale-select').addEventListener('change', (e) => {
    location.hash = `#/actifs?centraleId=${e.target.value}`;
    refresh();
  });

  document.getElementById('new-actif-btn')?.addEventListener('click', async () => {
    const actifsCentrale = await api.getActifs(centraleId);
    openActifFormModal({ centraleId, actifsCentrale, onDone: refresh });
  });

  setupImportButton('import-actifs-btn', 'import-actifs-file', api.importActifs);

  if (centraleId) {
    await renderActifsTable(centraleId);
  } else {
    document.getElementById('actifs-table-container').innerHTML = '<p class="empty-state">Créez d\'abord une centrale.</p>';
  }
}

async function renderActifsTable(centraleId) {
  const container = document.getElementById('actifs-table-container');
  const actifs = await api.getActifs(centraleId);
  const nomParId = new Map(actifs.map((a) => [a.id, a.nom]));

  container.innerHTML = `
    <div class="table-wrapper">
      <table class="data-table">
        <thead>
          <tr><th>Code</th><th>Nom</th><th>Type</th><th>Actif mère</th><th>Statut</th><th>Criticité</th><th>Contribution</th><th></th></tr>
        </thead>
        <tbody>
          ${actifs.map((a) => renderRow(a, nomParId)).join('') || '<tr><td colspan="8" class="empty-state">Aucun actif pour cette centrale.</td></tr>'}
        </tbody>
      </table>
    </div>
  `;

  container.querySelectorAll('[data-edit-actif]').forEach((btn) => {
    btn.addEventListener('click', () => {
      const actif = actifs.find((a) => a.id === Number(btn.dataset.editActif));
      openActifFormModal({ centraleId, actifsCentrale: actifs, actif, onDone: refresh });
    });
  });

  container.querySelectorAll('[data-delete-actif]').forEach((btn) => {
    btn.addEventListener('click', async () => {
      const actif = actifs.find((a) => a.id === Number(btn.dataset.deleteActif));
      if (!confirm(`Supprimer définitivement l'actif "${actif.nom}" ?`)) return;
      try {
        await api.deleteActif(actif.id);
        showToast('Actif supprimé.', 'success');
        refresh();
      } catch (err) {
        showToast(err.message, 'error');
      }
    });
  });
}

function renderRow(a, nomParId) {
  return `
    <tr>
      <td>${escapeHtml(a.code)}</td>
      <td><a href="#/actifs/${a.id}">${escapeHtml(a.nom)}</a></td>
      <td>${escapeHtml(a.type)}</td>
      <td>${a.parent_id ? escapeHtml(nomParId.get(a.parent_id) || '—') : '—'}</td>
      <td><span class="badge ${STATUT_CLASSES[a.statut] || 'badge-neutral'}">${STATUT_LABELS[a.statut] || a.statut}</span></td>
      <td><span class="badge ${CRITICITE_CLASSES[a.criticite] || 'badge-neutral'}">${CRITICITE_LABELS[a.criticite] || a.criticite}</span></td>
      <td>${a.contribution_mw ? `${formatNombre(a.contribution_mw)} MW` : '—'}</td>
      <td>
        <button class="btn btn-sm btn-ghost" data-edit-actif="${a.id}">Modifier</button>
        <button class="btn btn-sm btn-danger" data-delete-actif="${a.id}">Supprimer</button>
      </td>
    </tr>
  `;
}
