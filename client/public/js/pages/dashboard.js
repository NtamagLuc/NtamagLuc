import { api } from '../api.js';
import { gaugeHtml } from '../components/gauge.js';
import { escapeHtml, TYPE_CENTRALE_LABELS, CENTRALE_STATUT_LABELS, CENTRALE_STATUT_CLASSES, formatNombre } from '../utils.js';
import { canReviewExploitation, canApprouverFinal, getCurrentUser } from '../auth.js';

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
    </div>

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
