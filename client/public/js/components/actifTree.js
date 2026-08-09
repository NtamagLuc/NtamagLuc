import {
  escapeHtml,
  STATUT_LABELS,
  STATUT_CLASSES,
  CRITICITE_LABELS,
  CRITICITE_CLASSES,
  formatNombre,
} from '../utils.js';
import { canCreateDemande, canOperateDirect } from '../auth.js';

const ETATS_TERMINAUX_OU_TRANSITOIRES = ['DECOMMISSIONNE', 'REFORME', 'EN_TRANSFERT'];

function buildTree(actifs) {
  const byId = new Map(actifs.map((a) => [a.id, { ...a, enfants: [] }]));
  const roots = [];
  for (const actif of byId.values()) {
    if (actif.parent_id && byId.has(actif.parent_id)) {
      byId.get(actif.parent_id).enfants.push(actif);
    } else {
      roots.push(actif);
    }
  }
  return roots;
}

export function renderActionButtons(actif, { size = 'sm' } = {}) {
  const peutDemander = canCreateDemande();
  const peutOperer = canOperateDirect();
  const cls = size === 'sm' ? 'btn btn-sm' : 'btn';
  const boutons = [];
  const statut = actif.statut;

  if (ETATS_TERMINAUX_OU_TRANSITOIRES.includes(statut)) {
    return '';
  }

  if (statut === 'HORS_SERVICE') {
    if (peutDemander) {
      boutons.push(`<button class="${cls} btn-success" data-action="demander-remise" data-id="${actif.id}">Demander une remise en service</button>`);
    }
  } else {
    if (peutDemander) {
      boutons.push(`<button class="${cls} btn-warning" data-action="demander-retrait" data-id="${actif.id}">Demander un retrait</button>`);
    }
    if (statut === 'EN_SERVICE' && peutOperer) {
      boutons.push(`<button class="${cls} btn-ghost" data-action="maintenance-debut" data-id="${actif.id}">Mettre en maintenance</button>`);
      boutons.push(`<button class="${cls} btn-ghost" data-action="reparation-debut" data-id="${actif.id}">Mettre en réparation</button>`);
    }
    if (statut === 'EN_MAINTENANCE' && peutOperer) {
      boutons.push(`<button class="${cls} btn-success" data-action="maintenance-fin" data-id="${actif.id}">Fin de maintenance</button>`);
    }
    if (statut === 'EN_REPARATION' && peutOperer) {
      boutons.push(`<button class="${cls} btn-success" data-action="reparation-fin" data-id="${actif.id}">Fin de réparation</button>`);
    }
  }

  if (peutDemander) {
    boutons.push(`<button class="${cls} btn-primary" data-action="demander-deplacement" data-id="${actif.id}">Demander un déplacement</button>`);
    boutons.push(`<button class="${cls} btn-danger" data-action="demander-decommissionnement" data-id="${actif.id}">Décommissionner</button>`);
  }

  return boutons.join('');
}

// N'affiche que les actifs de premier niveau (actifs mères) : les actifs enfants ne sont
// visibles qu'en ouvrant le détail de leur actif mère (page actif.js), pas ici en ligne.
function renderNode(actif) {
  const inactif = ['HORS_SERVICE', 'DECOMMISSIONNE', 'REFORME', 'EN_TRANSFERT'].includes(actif.statut);
  return `
    <li class="actif-node">
      <div class="actif-row ${inactif ? 'actif-row-retire' : ''}">
        <div class="actif-info">
          <span class="actif-nom">${actif.enfants.length ? '🗂️' : '🔧'} ${escapeHtml(actif.nom)}</span>
          <span class="actif-code">${escapeHtml(actif.code)}</span>
          <span class="actif-type">${escapeHtml(actif.type)}</span>
          <span class="badge ${STATUT_CLASSES[actif.statut] || 'badge-neutral'}">${STATUT_LABELS[actif.statut] || actif.statut}</span>
          <span class="badge ${CRITICITE_CLASSES[actif.criticite] || 'badge-neutral'}">${CRITICITE_LABELS[actif.criticite] || actif.criticite}</span>
          ${actif.contribution_mw ? `<span class="actif-contrib">${formatNombre(actif.contribution_mw)} MW</span>` : ''}
          ${actif.enfants.length ? `<span class="badge badge-neutral">${actif.enfants.length} sous-actif(s)</span>` : ''}
        </div>
        <div class="actif-actions">
          <a class="btn btn-ghost btn-sm" href="#/actifs/${actif.id}">${actif.enfants.length ? 'Voir les sous-actifs' : 'Détail'}</a>
          ${renderActionButtons(actif)}
        </div>
      </div>
    </li>
  `;
}

export function renderActifTree(actifs) {
  if (!actifs.length) {
    return '<p class="empty-state">Aucun actif enregistré pour cette centrale.</p>';
  }
  const racines = buildTree(actifs);
  return `<ul class="actif-tree">${racines.map(renderNode).join('')}</ul>`;
}
