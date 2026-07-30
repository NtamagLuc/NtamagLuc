import { api } from '../api.js';
import { gaugeHtml } from '../components/gauge.js';
import { openCentraleFormModal } from '../components/formModal.js';
import { escapeHtml, showToast, TYPE_CENTRALE_LABELS, CENTRALE_STATUT_LABELS, CENTRALE_STATUT_CLASSES, formatNombre } from '../utils.js';
import { canManageReferentiel, canReviewExploitation, canApprouverFinal, getCurrentUser } from '../auth.js';
import { refresh } from '../router.js';

export async function renderDashboard() {
  const app = document.getElementById('app');
  const user = getCurrentUser();
  const [centrales, aVerifier, aApprouver] = await Promise.all([
    api.getCentrales(),
    canReviewExploitation() ? api.getDemandes({ statut: 'EN_ATTENTE' }) : Promise.resolve([]),
    canApprouverFinal() ? api.getDemandes({ statut: 'TRANSMISE' }) : Promise.resolve([]),
  ]);

  const enAlerte = centrales.filter((c) => c.disponibilitePct < c.seuil_alerte_pct);
  const totalActifs = centrales.reduce((sum, c) => sum + c.nbActifs, 0);

  app.innerHTML = `
    <div class="page-header">
      <div>
        <h1>Bonjour ${escapeHtml(user.nom)}</h1>
        <p class="page-subtitle">${centrales.length} centrale(s) · ${totalActifs} actif(s) en service ou en maintenance</p>
      </div>
      ${
        canManageReferentiel()
          ? `<div class="actif-actions">
               <a class="btn btn-ghost" href="${api.exportCentralesUrl()}" target="_blank" rel="noopener">Exporter centrales</a>
               <button class="btn btn-ghost" id="import-centrales-btn">Importer centrales</button>
               <a class="btn btn-ghost" href="${api.exportActifsUrl()}" target="_blank" rel="noopener">Exporter actifs</a>
               <button class="btn btn-ghost" id="import-actifs-btn">Importer actifs</button>
               <button class="btn btn-primary" id="new-centrale-btn">+ Nouvelle centrale</button>
             </div>`
          : ''
      }
    </div>
    <input type="file" id="import-centrales-file" accept=".csv" style="display:none;" />
    <input type="file" id="import-actifs-file" accept=".csv" style="display:none;" />

    ${
      canReviewExploitation() && aVerifier.length
        ? `<a class="banner banner-info" href="#/demandes?statut=EN_ATTENTE">🕑 ${aVerifier.length} demande(s) à vérifier →</a>`
        : ''
    }
    ${
      canApprouverFinal() && aApprouver.length
        ? `<a class="banner banner-info" href="#/demandes?statut=TRANSMISE">🕑 ${aApprouver.length} demande(s) transmise(s) en attente de votre approbation →</a>`
        : ''
    }
    ${
      enAlerte.length
        ? `<div class="banner banner-warning">⚠️ ${enAlerte.length} centrale(s) sous leur seuil de disponibilité recommandé : ${enAlerte
            .map((c) => escapeHtml(c.nom))
            .join(', ')}</div>`
        : ''
    }

    <div class="centrale-grid">
      ${centrales.map(renderCentraleCard).join('') || '<p class="empty-state">Aucune centrale enregistrée.</p>'}
    </div>
  `;

  document.getElementById('new-centrale-btn')?.addEventListener('click', () => {
    openCentraleFormModal({ onDone: refresh });
  });

  setupImportButton('import-centrales-btn', 'import-centrales-file', api.importCentrales);
  setupImportButton('import-actifs-btn', 'import-actifs-file', api.importActifs);
}

function setupImportButton(btnId, inputId, importFn) {
  const btn = document.getElementById(btnId);
  const input = document.getElementById(inputId);
  if (!btn || !input) return;
  btn.addEventListener('click', () => input.click());
  input.addEventListener('change', async () => {
    const file = input.files[0];
    if (!file) return;
    try {
      const csv = await file.text();
      const rapport = await importFn(csv);
      showToast(
        `Import terminé : ${rapport.crees} créé(s), ${rapport.misAJour} mis à jour${rapport.erreurs.length ? `, ${rapport.erreurs.length} erreur(s)` : ''}.`,
        rapport.erreurs.length ? 'error' : 'success'
      );
      if (rapport.erreurs.length) console.warn(`Erreurs import (${btnId}) :`, rapport.erreurs);
      refresh();
    } catch (err) {
      showToast(err.message, 'error');
    } finally {
      input.value = '';
    }
  });
}

function renderCentraleCard(c) {
  return `
    <a class="centrale-card" href="#/centrales/${c.id}">
      <div class="centrale-card-header">
        <div>
          <h2>${escapeHtml(c.nom)}</h2>
          <p class="centrale-meta">${escapeHtml(c.code)} · ${TYPE_CENTRALE_LABELS[c.type] || c.type} · ${escapeHtml(c.localisation || '—')}
            <span class="badge ${CENTRALE_STATUT_CLASSES[c.statut] || 'badge-neutral'}">${CENTRALE_STATUT_LABELS[c.statut] || c.statut}</span>
          </p>
        </div>
        ${gaugeHtml(c.disponibilitePct, { size: 72 })}
      </div>
      <div class="centrale-card-stats">
        <div><span class="stat-label">Puissance installée</span><span class="stat-value">${formatNombre(c.puissanceInstalleeMw)} MW</span></div>
        <div><span class="stat-label">Puissance disponible</span><span class="stat-value">${formatNombre(c.puissanceDisponibleMw)} MW</span></div>
        <div><span class="stat-label">Actifs</span><span class="stat-value">${c.nbActifs}</span></div>
        <div><span class="stat-label">Seuil d'alerte</span><span class="stat-value">${c.seuil_alerte_pct}%</span></div>
      </div>
    </a>
  `;
}
