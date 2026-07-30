import { api } from '../api.js';
import { escapeHtml, formatDate, MOUVEMENT_LABELS, NIVEAU_IMPACT_LABELS, NIVEAU_IMPACT_CLASSES, SEVERITE_CLASSES } from '../utils.js';
import { isAdmin } from '../auth.js';

export async function renderHistorique() {
  const app = document.getElementById('app');
  const peutAuditer = isAdmin();
  const [mouvements, auditLog] = await Promise.all([
    api.getMouvements(),
    peutAuditer ? api.getAuditLog() : Promise.resolve(null),
  ]);

  app.innerHTML = `
    <div class="page-header">
      <div>
        <h1>Historique des mouvements exécutés</h1>
        <p class="page-subtitle">${mouvements.length} mouvement(s) enregistré(s)</p>
      </div>
    </div>
    ${
      mouvements.length
        ? `<div class="mouvement-list">${mouvements.map(renderMouvement).join('')}</div>`
        : '<p class="empty-state">Aucun mouvement enregistré pour le moment.</p>'
    }

    ${
      peutAuditer
        ? `
      <h2 class="section-title">Journal d'audit complet</h2>
      <div class="filters-bar">
        <label class="field field-inline">
          <span>Type</span>
          <input type="text" id="audit-type" placeholder="Ex : DEMANDE_CREEE" />
        </label>
        <label class="field field-inline">
          <span>Depuis</span>
          <input type="date" id="audit-debut" />
        </label>
        <label class="field field-inline">
          <span>Jusqu'à</span>
          <input type="date" id="audit-fin" />
        </label>
        <button class="btn btn-primary btn-sm" id="audit-filtrer">Filtrer</button>
      </div>
      <div id="audit-table">${renderAuditTable(auditLog)}</div>
    `
        : ''
    }
  `;

  document.getElementById('audit-filtrer')?.addEventListener('click', async () => {
    const params = {};
    const type = document.getElementById('audit-type').value.trim();
    const dateDebut = document.getElementById('audit-debut').value;
    const dateFin = document.getElementById('audit-fin').value;
    if (type) params.type = type;
    if (dateDebut) params.dateDebut = dateDebut;
    if (dateFin) params.dateFin = dateFin;
    const table = document.getElementById('audit-table');
    table.innerHTML = '<p class="loading">Chargement…</p>';
    const rows = await api.getAuditLog(params);
    table.innerHTML = renderAuditTable(rows);
  });
}

function renderAuditTable(auditLog) {
  if (!auditLog || !auditLog.length) return '<p class="empty-state">Aucun événement ne correspond.</p>';
  return `
    <div class="table-wrapper">
      <table class="data-table">
        <thead><tr><th>Date</th><th>Type</th><th>Description</th><th>Acteur</th><th>Modifications</th></tr></thead>
        <tbody>
          ${auditLog
            .map(
              (a) => `
            <tr>
              <td>${formatDate(a.created_at)}</td>
              <td><span class="badge badge-neutral">${escapeHtml(a.type)}</span></td>
              <td>${escapeHtml(a.description)}</td>
              <td>${escapeHtml(a.acteur_nom || '—')}</td>
              <td>${a.donnees && Object.keys(a.donnees).length ? renderDiff(a.donnees) : '—'}</td>
            </tr>
          `
            )
            .join('')}
        </tbody>
      </table>
    </div>
  `;
}

function renderDiff(donnees) {
  return Object.entries(donnees)
    .map(([champ, { avant, apres }]) => `<div><strong>${escapeHtml(champ)}</strong> : ${escapeHtml(avant)} → ${escapeHtml(apres)}</div>`)
    .join('');
}

function renderMouvement(m) {
  const alertesHaute = m.alertes.filter((a) => a.severite === 'haute').length;
  return `
    <div class="mouvement-card">
      <div class="mouvement-header">
        <span class="badge badge-info">${MOUVEMENT_LABELS[m.type] || m.type}</span>
        ${m.niveau_impact ? `<span class="badge ${NIVEAU_IMPACT_CLASSES[m.niveau_impact] || 'badge-neutral'}">${NIVEAU_IMPACT_LABELS[m.niveau_impact] || m.niveau_impact}</span>` : ''}
        <span class="mouvement-actif">${escapeHtml(m.actif_nom)}</span>
        <span class="mouvement-date">${formatDate(m.date)}</span>
      </div>
      <div class="mouvement-body">
        <div class="mouvement-trajet">
          ${
            m.type === 'DEPLACEMENT'
              ? `${escapeHtml(m.centrale_source_nom)} → ${escapeHtml(m.centrale_dest_nom)}`
              : escapeHtml(m.centrale_source_nom)
          }
          ${m.nb_actifs_impactes > 1 ? `<span class="mouvement-nb">(${m.nb_actifs_impactes} actifs impactés)</span>` : ''}
        </div>
        <div class="mouvement-scores">
          <span>Source : ${m.score_source_avant}% → ${m.score_source_apres}%</span>
          ${
            m.score_dest_avant !== null
              ? `<span>Destination : ${m.score_dest_avant}% → ${m.score_dest_apres}%</span>`
              : ''
          }
          ${alertesHaute ? `<span class="badge badge-danger">${alertesHaute} alerte(s) haute(s)</span>` : ''}
        </div>
        ${m.executeur_nom ? `<p class="mouvement-commentaire">Exécuté par ${escapeHtml(m.executeur_nom)}</p>` : ''}
        ${m.commentaire ? `<p class="mouvement-commentaire">« ${escapeHtml(m.commentaire)} »</p>` : ''}
        <details class="mouvement-details">
          <summary>Voir les alertes détaillées</summary>
          <ul class="alert-list">
            ${m.alertes
              .map((a) => `<li class="alert-item ${SEVERITE_CLASSES[a.severite] || 'alert-basse'}">${escapeHtml(a.message)}</li>`)
              .join('')}
          </ul>
        </details>
      </div>
    </div>
  `;
}
