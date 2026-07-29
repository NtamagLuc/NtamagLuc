import {
  escapeHtml,
  STATUT_LABELS,
  STATUT_CLASSES,
  CRITICITE_LABELS,
  CRITICITE_CLASSES,
  formatNombre,
} from '../utils.js';

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

function renderNode(actif, depth) {
  const isRetire = actif.statut === 'RETIRE';
  return `
    <li class="actif-node" style="--depth:${depth}">
      <div class="actif-row ${isRetire ? 'actif-row-retire' : ''}">
        <div class="actif-info">
          <span class="actif-nom">${actif.enfants.length ? '🗂️' : '🔧'} ${escapeHtml(actif.nom)}</span>
          <span class="actif-type">${escapeHtml(actif.type)}</span>
          <span class="badge ${STATUT_CLASSES[actif.statut] || 'badge-neutral'}">${STATUT_LABELS[actif.statut] || actif.statut}</span>
          <span class="badge ${CRITICITE_CLASSES[actif.criticite] || 'badge-neutral'}">${CRITICITE_LABELS[actif.criticite] || actif.criticite}</span>
          ${actif.contribution_mw ? `<span class="actif-contrib">${formatNombre(actif.contribution_mw)} MW</span>` : ''}
        </div>
        <div class="actif-actions">
          <a class="btn btn-ghost btn-sm" href="#/actifs/${actif.id}">Détail</a>
          ${
            isRetire
              ? `<button class="btn btn-sm btn-success" data-action="remise" data-id="${actif.id}">Remettre en service</button>`
              : `
                <button class="btn btn-sm btn-warning" data-action="retirer" data-id="${actif.id}">Retirer</button>
                <button class="btn btn-sm btn-primary" data-action="deplacer" data-id="${actif.id}">Déplacer</button>
              `
          }
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
