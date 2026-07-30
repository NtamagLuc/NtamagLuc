import { api } from '../api.js';
import { renderActionButtons } from '../components/actifTree.js';
import { attachActifActionHandlers } from '../components/actifActions.js';
import {
  escapeHtml,
  STATUT_LABELS,
  STATUT_CLASSES,
  CRITICITE_LABELS,
  CRITICITE_CLASSES,
  MOUVEMENT_LABELS,
  DEMANDE_TYPE_LABELS,
  DEMANDE_STATUT_LABELS,
  DEMANDE_STATUT_CLASSES,
  NIVEAU_IMPACT_LABELS,
  NIVEAU_IMPACT_CLASSES,
  SEVERITE_CLASSES,
  formatNombre,
  formatDate,
} from '../utils.js';
import { refresh } from '../router.js';

export async function renderActifDetail({ id }) {
  const app = document.getElementById('app');
  const actif = await api.getActif(id);

  const filAriane = [
    { label: '⚡ Parc', href: '#/' },
    { label: actif.centrale.nom, href: `#/centrales/${actif.centrale.id}` },
    ...actif.filAriane.map((a) => ({ label: a.nom, href: `#/actifs/${a.id}` })),
  ];

  app.innerHTML = `
    <nav class="fil-ariane">
      ${filAriane.map((f) => `<a href="${f.href}">${escapeHtml(f.label)}</a>`).join('<span class="fil-ariane-sep">›</span>')}
      <span class="fil-ariane-sep">›</span>
      <span class="fil-ariane-current">${escapeHtml(actif.nom)}</span>
    </nav>
    <div class="page-header">
      <div>
        <h1>${escapeHtml(actif.nom)}</h1>
        <p class="page-subtitle">${escapeHtml(actif.code)} · ${escapeHtml(actif.type)} · ${escapeHtml(actif.centrale.nom)}${actif.parent ? ` · sous-actif de ${escapeHtml(actif.parent.nom)}` : ''}</p>
      </div>
      <div class="actif-actions" id="actif-actions">
        ${renderActionButtons(actif, { size: 'md' })}
      </div>
    </div>

    <div class="actif-badges">
      <span class="badge ${STATUT_CLASSES[actif.statut] || 'badge-neutral'}">${STATUT_LABELS[actif.statut] || actif.statut}</span>
      <span class="badge ${CRITICITE_CLASSES[actif.criticite] || 'badge-neutral'}">Criticité : ${CRITICITE_LABELS[actif.criticite] || actif.criticite}</span>
      ${actif.contribution_mw ? `<span class="badge badge-neutral">${formatNombre(actif.contribution_mw)} MW</span>` : ''}
    </div>

    <div class="actif-fiche">
      ${actif.fabricant ? `<div><span class="stat-label">Fabricant</span><span class="stat-value">${escapeHtml(actif.fabricant)}</span></div>` : ''}
      ${actif.modele ? `<div><span class="stat-label">Modèle</span><span class="stat-value">${escapeHtml(actif.modele)}</span></div>` : ''}
      ${actif.numero_serie ? `<div><span class="stat-label">Numéro de série</span><span class="stat-value">${escapeHtml(actif.numero_serie)}</span></div>` : ''}
      <div><span class="stat-label">Mise en service</span><span class="stat-value">${actif.date_installation ? escapeHtml(actif.date_installation) : '—'}</span></div>
    </div>

    ${actif.description ? `<p class="actif-description">${escapeHtml(actif.description)}</p>` : ''}

    ${
      actif.enfants.length
        ? `
      <h2 class="section-title">Actifs enfants (${actif.enfants.length})</h2>
      <ul class="actif-children-list">
        ${actif.enfants
          .map(
            (e) => `<li><a href="#/actifs/${e.id}">${escapeHtml(e.nom)}</a> <span class="badge ${STATUT_CLASSES[e.statut] || 'badge-neutral'}">${STATUT_LABELS[e.statut] || e.statut}</span></li>`
          )
          .join('')}
      </ul>
    `
        : ''
    }

    ${
      actif.demandes?.length
        ? `
      <h2 class="section-title">Demandes liées à cet actif</h2>
      <div class="mouvement-list">${actif.demandes.map(renderDemandeItem).join('')}</div>
    `
        : ''
    }

    <h2 class="section-title">Historique des mouvements exécutés</h2>
    ${
      actif.historique.length
        ? `<div class="mouvement-list">${actif.historique.map(renderHistoriqueItem).join('')}</div>`
        : '<p class="empty-state">Aucun mouvement enregistré pour cet actif.</p>'
    }
  `;

  attachActifActionHandlers(document.getElementById('actif-actions'), () => actif, refresh);
}

function renderDemandeItem(d) {
  return `
    <a class="mouvement-card demande-card-link" href="#/demandes/${d.id}">
      <div class="mouvement-header">
        <span class="badge badge-info">${DEMANDE_TYPE_LABELS[d.type] || d.type}</span>
        <span class="badge ${DEMANDE_STATUT_CLASSES[d.statut] || 'badge-neutral'}">${DEMANDE_STATUT_LABELS[d.statut] || d.statut}</span>
        ${d.niveau_impact ? `<span class="badge ${NIVEAU_IMPACT_CLASSES[d.niveau_impact] || 'badge-neutral'}">${NIVEAU_IMPACT_LABELS[d.niveau_impact] || d.niveau_impact}</span>` : ''}
        <span class="mouvement-date">${formatDate(d.created_at)}</span>
      </div>
      <div class="mouvement-body">
        <p class="mouvement-commentaire">Demandeur : ${escapeHtml(d.demandeur_nom)}${d.motif ? ` — « ${escapeHtml(d.motif)} »` : ''}</p>
      </div>
    </a>
  `;
}

function renderHistoriqueItem(m) {
  return `
    <div class="mouvement-card">
      <div class="mouvement-header">
        <span class="badge badge-info">${MOUVEMENT_LABELS[m.type] || m.type}</span>
        ${m.niveau_impact ? `<span class="badge ${NIVEAU_IMPACT_CLASSES[m.niveau_impact] || 'badge-neutral'}">${NIVEAU_IMPACT_LABELS[m.niveau_impact] || m.niveau_impact}</span>` : ''}
        <span class="mouvement-date">${formatDate(m.date)}</span>
      </div>
      <div class="mouvement-body">
        <div class="mouvement-scores">
          <span>Source : ${m.score_source_avant}% → ${m.score_source_apres}%</span>
          ${m.score_dest_avant !== null ? `<span>Destination : ${m.score_dest_avant}% → ${m.score_dest_apres}%</span>` : ''}
        </div>
        ${m.executeur_nom ? `<p class="mouvement-commentaire">Exécuté par ${escapeHtml(m.executeur_nom)}</p>` : ''}
        <ul class="alert-list">
          ${m.alertes.map((a) => `<li class="alert-item ${SEVERITE_CLASSES[a.severite] || 'alert-basse'}">${escapeHtml(a.message)}</li>`).join('')}
        </ul>
      </div>
    </div>
  `;
}
