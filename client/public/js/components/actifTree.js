import {
  escapeHtml,
  STATUT_LABELS,
  STATUT_CLASSES,
  CRITICITE_LABELS,
  CRITICITE_CLASSES,
  formatNombre,
} from '../utils.js';
import { canValidate } from '../auth.js';

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
  const estOperateur = canValidate();
  const cls = size === 'sm' ? 'btn btn-sm' : 'btn';
  const boutons = [];

  if (actif.statut === 'EN_SERVICE') {
    boutons.push(`<button class="${cls} btn-warning" data-action="demander-retrait" data-id="${actif.id}">Demander un retrait</button>`);
    boutons.push(`<button class="${cls} btn-primary" data-action="demander-deplacement" data-id="${actif.id}">Déplacer</button>`);
    if (estOperateur) {
      boutons.push(`<button class="${cls} btn-ghost" data-action="maintenance-debut" data-id="${actif.id}">Mettre en maintenance</button>`);
    }
    boutons.push(`<button class="${cls} btn-danger" data-action="demander-reforme" data-id="${actif.id}">Réformer</button>`);
  } else if (actif.statut === 'EN_MAINTENANCE') {
    if (estOperateur) {
      boutons.push(`<button class="${cls} btn-success" data-action="maintenance-fin" data-id="${actif.id}">Fin de maintenance</button>`);
    }
    boutons.push(`<button class="${cls} btn-primary" data-action="demander-deplacement" data-id="${actif.id}">Déplacer</button>`);
    boutons.push(`<button class="${cls} btn-danger" data-action="demander-reforme" data-id="${actif.id}">Réformer</button>`);
  } else if (actif.statut === 'RETIRE') {
    if (estOperateur) {
      boutons.push(`<button class="${cls} btn-success" data-action="remise" data-id="${actif.id}">Remettre en service</button>`);
    }
    boutons.push(`<button class="${cls} btn-primary" data-action="demander-deplacement" data-id="${actif.id}">Déplacer</button>`);
    boutons.push(`<button class="${cls} btn-danger" data-action="demander-reforme" data-id="${actif.id}">Réformer</button>`);
  }
  // REFORME : état terminal, aucune action.
  return boutons.join('');
}

function renderNode(actif, depth) {
  return `
    <li class="actif-node" style="--depth:${depth}">
      <div class="actif-row ${actif.statut === 'RETIRE' || actif.statut === 'REFORME' ? 'actif-row-retire' : ''}">
        <div class="actif-info">
          <span class="actif-nom">${actif.enfants.length ? '🗂️' : '🔧'} ${escapeHtml(actif.nom)}</span>
          <span class="actif-type">${escapeHtml(actif.type)}</span>
          <span class="badge ${STATUT_CLASSES[actif.statut] || 'badge-neutral'}">${STATUT_LABELS[actif.statut] || actif.statut}</span>
          <span class="badge ${CRITICITE_CLASSES[actif.criticite] || 'badge-neutral'}">${CRITICITE_LABELS[actif.criticite] || actif.criticite}</span>
          ${actif.contribution_mw ? `<span class="actif-contrib">${formatNombre(actif.contribution_mw)} MW</span>` : ''}
        </div>
        <div class="actif-actions">
          <a class="btn btn-ghost btn-sm" href="#/actifs/${actif.id}">Détail</a>
          ${renderActionButtons(actif)}
        </div>
      </div>
      ${
        actif.enfants.length
          ? `<ul class="actif-children">${actif.enfants.map((e) => renderNode(e, depth + 1)).join('')}</ul>`
          : ''
      }
    </li>
  `;
}

export function renderActifTree(actifs) {
  if (!actifs.length) {
    return '<p class="empty-state">Aucun actif enregistré pour cette centrale.</p>';
  }
  const tree = buildTree(actifs);
  return `<ul class="actif-tree">${tree.map((n) => renderNode(n, 0)).join('')}</ul>`;
}
