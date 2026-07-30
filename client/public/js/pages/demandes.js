import { api } from '../api.js';
import {
  escapeHtml,
  formatDate,
  DEMANDE_TYPE_LABELS,
  DEMANDE_STATUT_LABELS,
  DEMANDE_STATUT_CLASSES,
  NIVEAU_IMPACT_LABELS,
  NIVEAU_IMPACT_CLASSES,
} from '../utils.js';

function readQueryParams() {
  const [, query] = location.hash.split('?');
  return new URLSearchParams(query || '');
}

export async function renderDemandes() {
  const app = document.getElementById('app');
  const initialParams = readQueryParams();

  const statut = initialParams.get('statut') || '';
  const type = initialParams.get('type') || '';
  const mine = initialParams.get('mine') === 'true';

  app.innerHTML = `
    <div class="page-header">
      <div>
        <h1>Demandes de retrait, déplacement, décommissionnement et remise en service</h1>
        <p class="page-subtitle">Suivi du circuit demande → vérification Exploitation → approbation Chef Centrale → exécution</p>
      </div>
    </div>

    <div class="filters-bar">
      <label class="field field-inline">
        <span>Statut</span>
        <select id="filtre-statut">
          <option value="">Tous</option>
          ${Object.entries(DEMANDE_STATUT_LABELS)
            .map(([v, l]) => `<option value="${v}" ${v === statut ? 'selected' : ''}>${l}</option>`)
            .join('')}
        </select>
      </label>
      <label class="field field-inline">
        <span>Type</span>
        <select id="filtre-type">
          <option value="">Tous</option>
          ${Object.entries(DEMANDE_TYPE_LABELS)
            .map(([v, l]) => `<option value="${v}" ${v === type ? 'selected' : ''}>${l}</option>`)
            .join('')}
        </select>
      </label>
      <label class="field field-inline field-checkbox">
        <input type="checkbox" id="filtre-mine" ${mine ? 'checked' : ''} />
        <span>Uniquement mes demandes</span>
      </label>
    </div>

    <div id="demandes-list"><p class="loading">Chargement…</p></div>
  `;

  async function charger() {
    const params = {};
    const s = document.getElementById('filtre-statut').value;
    const t = document.getElementById('filtre-type').value;
    const m = document.getElementById('filtre-mine').checked;
    if (s) params.statut = s;
    if (t) params.type = t;
    if (m) params.mine = 'true';

    const list = document.getElementById('demandes-list');
    list.innerHTML = '<p class="loading">Chargement…</p>';
    const demandes = await api.getDemandes(params);
    list.innerHTML = demandes.length
      ? `<div class="mouvement-list">${demandes.map(renderDemandeCard).join('')}</div>`
      : '<p class="empty-state">Aucune demande ne correspond à ces filtres.</p>';
  }

  document.getElementById('filtre-statut').addEventListener('change', charger);
  document.getElementById('filtre-type').addEventListener('change', charger);
  document.getElementById('filtre-mine').addEventListener('change', charger);

  await charger();
}

function renderDemandeCard(d) {
  return `
    <a class="mouvement-card demande-card-link" href="#/demandes/${d.id}">
      <div class="mouvement-header">
        <span class="badge badge-info">${DEMANDE_TYPE_LABELS[d.type] || d.type}</span>
        <span class="badge ${DEMANDE_STATUT_CLASSES[d.statut] || 'badge-neutral'}">${DEMANDE_STATUT_LABELS[d.statut] || d.statut}</span>
        ${d.niveau_impact ? `<span class="badge ${NIVEAU_IMPACT_CLASSES[d.niveau_impact] || 'badge-neutral'}">${NIVEAU_IMPACT_LABELS[d.niveau_impact] || d.niveau_impact}</span>` : ''}
        <span class="mouvement-actif">${escapeHtml(d.actif_nom)}</span>
        <span class="mouvement-date">${formatDate(d.created_at)}</span>
      </div>
      <div class="mouvement-body">
        <div class="mouvement-trajet">
          ${
            d.type === 'DEPLACEMENT'
              ? `${escapeHtml(d.centrale_source_nom)} → ${escapeHtml(d.centrale_dest_nom)}`
              : escapeHtml(d.centrale_source_nom)
          }
        </div>
        <p class="mouvement-commentaire">Demandeur : ${escapeHtml(d.demandeur_nom)}${d.exploitation_nom ? ` · Exploitation : ${escapeHtml(d.exploitation_nom)}` : ''}${d.approbateur_nom ? ` · Chef Centrale : ${escapeHtml(d.approbateur_nom)}` : ''}</p>
        ${d.motif ? `<p class="mouvement-commentaire">« ${escapeHtml(d.motif)} »</p>` : ''}
      </div>
    </a>
  `;
}
