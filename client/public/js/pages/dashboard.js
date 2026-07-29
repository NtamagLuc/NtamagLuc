import { api } from '../api.js';
import { gaugeHtml } from '../components/gauge.js';
import { openCentraleFormModal } from '../components/formModal.js';
import { escapeHtml, TYPE_CENTRALE_LABELS, formatNombre } from '../utils.js';
import { refresh } from '../router.js';

export async function renderDashboard() {
  const app = document.getElementById('app');
  const centrales = await api.getCentrales();

  const enAlerte = centrales.filter((c) => c.performancePct < c.seuil_alerte_pct);
  const totalActifs = centrales.reduce((sum, c) => sum + c.nbActifs, 0);

  app.innerHTML = `
    <div class="page-header">
      <div>
        <h1>Tableau de bord des centrales</h1>
        <p class="page-subtitle">${centrales.length} centrale(s) · ${totalActifs} actif(s) en service ou en maintenance</p>
      </div>
      <button class="btn btn-primary" id="new-centrale-btn">+ Nouvelle centrale</button>
    </div>

    ${
      enAlerte.length
        ? `<div class="banner banner-warning">⚠️ ${enAlerte.length} centrale(s) sous leur seuil de performance recommandé : ${enAlerte
            .map((c) => escapeHtml(c.nom))
            .join(', ')}</div>`
        : ''
    }

    <div class="centrale-grid">
      ${centrales.map(renderCentraleCard).join('') || '<p class="empty-state">Aucune centrale enregistrée.</p>'}
    </div>
  `;

  document.getElementById('new-centrale-btn').addEventListener('click', () => {
    openCentraleFormModal({ onDone: refresh });
  });
}

function renderCentraleCard(c) {
  return `
    <a class="centrale-card" href="#/centrales/${c.id}">
      <div class="centrale-card-header">
        <div>
          <h2>${escapeHtml(c.nom)}</h2>
          <p class="centrale-meta">${TYPE_CENTRALE_LABELS[c.type] || c.type} · ${escapeHtml(c.localisation || '—')}</p>
        </div>
        ${gaugeHtml(c.performancePct, { size: 72 })}
      </div>
      <div class="centrale-card-stats">
        <div><span class="stat-label">Puissance effective</span><span class="stat-value">${formatNombre(c.puissanceEffectiveMw)} / ${formatNombre(c.capacite_nominale_mw)} MW</span></div>
        <div><span class="stat-label">Actifs</span><span class="stat-value">${c.nbActifs}</span></div>
        <div><span class="stat-label">Seuil d'alerte</span><span class="stat-value">${c.seuil_alerte_pct}%</span></div>
      </div>
    </a>
  `;
}
