import { api } from '../api.js';
import { gaugeHtml } from '../components/gauge.js';
import {
  escapeHtml,
  formatNombre,
  STATUT_LABELS,
  DEMANDE_STATUT_LABELS,
  DEMANDE_TYPE_LABELS,
} from '../utils.js';

const COLORS = {
  EN_SERVICE: '#16a34a',
  EN_MAINTENANCE: '#d97706',
  RETIRE: '#6b7280',
  REFORME: '#dc2626',
  EN_ATTENTE: '#d97706',
  VALIDEE: '#0891b2',
  REJETEE: '#dc2626',
  EXECUTEE: '#16a34a',
  ANNULEE: '#6b7280',
  RETRAIT: '#d97706',
  DEPLACEMENT: '#2563eb',
  REFORME_TYPE: '#dc2626',
};

function barChart(data, labels) {
  const entries = Object.entries(data).filter(([, v]) => v > 0);
  if (!entries.length) return '<p class="empty-state">Aucune donnée.</p>';
  const max = Math.max(...entries.map(([, v]) => v));
  return `
    <div class="bar-chart">
      ${entries
        .map(([key, value]) => {
          const pct = max > 0 ? Math.round((value / max) * 100) : 0;
          const color = COLORS[key] || '#6b7280';
          return `
          <div class="bar-row">
            <span class="bar-label">${escapeHtml(labels[key] || key)}</span>
            <div class="bar-track"><div class="bar-fill" style="width:${pct}%; background:${color};"></div></div>
            <span class="bar-value">${value}</span>
          </div>
        `;
        })
        .join('')}
    </div>
  `;
}

export async function renderReporting() {
  const app = document.getElementById('app');
  const summary = await api.getReportingSummary();

  app.innerHTML = `
    <div class="page-header">
      <div>
        <h1>Reporting &amp; performance du parc</h1>
        <p class="page-subtitle">Vue d'ensemble analytique — exportable vers Power BI</p>
      </div>
    </div>

    <div class="stat-tiles">
      <div class="stat-tile">
        <span class="stat-tile-value">${summary.totaux.nbCentrales}</span>
        <span class="stat-tile-label">Centrales</span>
      </div>
      <div class="stat-tile">
        <span class="stat-tile-value">${summary.totaux.nbActifs}</span>
        <span class="stat-tile-label">Actifs</span>
      </div>
      <div class="stat-tile">
        <span class="stat-tile-value">${summary.totaux.performanceMoyenne}%</span>
        <span class="stat-tile-label">Performance moyenne du parc</span>
      </div>
      <div class="stat-tile">
        <span class="stat-tile-value">${formatNombre(summary.totaux.puissanceEffectiveTotale)} / ${formatNombre(summary.totaux.puissanceNominaleTotale)} MW</span>
        <span class="stat-tile-label">Puissance effective / nominale</span>
      </div>
      <div class="stat-tile ${summary.totaux.nbCentralesEnAlerte ? 'stat-tile-alert' : ''}">
        <span class="stat-tile-value">${summary.totaux.nbCentralesEnAlerte}</span>
        <span class="stat-tile-label">Centrale(s) sous seuil d'alerte</span>
      </div>
    </div>

    <div class="reporting-grid">
      <div class="reporting-panel">
        <h2 class="section-title">Performance par centrale</h2>
        <div class="centrale-perf-list">
          ${summary.centrales
            .map(
              (c) => `
            <div class="centrale-perf-row">
              ${gaugeHtml(c.performancePct, { size: 56 })}
              <div class="centrale-perf-info">
                <span class="centrale-perf-nom">${escapeHtml(c.nom)}</span>
                <span class="centrale-perf-detail">${formatNombre(c.puissanceEffectiveMw)} / ${formatNombre(c.capaciteNominaleMw)} MW · seuil ${c.seuilAlertePct}%</span>
              </div>
            </div>
          `
            )
            .join('')}
        </div>
      </div>

      <div class="reporting-panel">
        <h2 class="section-title">Actifs par statut</h2>
        ${barChart(summary.actifsParStatut, STATUT_LABELS)}
      </div>

      <div class="reporting-panel">
        <h2 class="section-title">Demandes par statut</h2>
        ${barChart(summary.demandesParStatut, DEMANDE_STATUT_LABELS)}
      </div>

      <div class="reporting-panel">
        <h2 class="section-title">Demandes par type</h2>
        ${barChart(summary.demandesParType, DEMANDE_TYPE_LABELS)}
      </div>

      <div class="reporting-panel">
        <h2 class="section-title">Actifs critiques en service</h2>
        ${
          summary.actifsCritiquesEnService.length
            ? `<ul class="actif-children-list">${summary.actifsCritiquesEnService
                .map((a) => `<li><a href="#/actifs/${a.id}">${escapeHtml(a.nom)}</a></li>`)
                .join('')}</ul>`
            : '<p class="empty-state">Aucun actif critique en service actuellement.</p>'
        }
      </div>

      <div class="reporting-panel">
        <h2 class="section-title">Export pour Power BI / Excel</h2>
        <p class="page-subtitle">Fichiers CSV (encodage UTF-8) importables via Power BI Desktop (Obtenir des données → Texte/CSV) ou Excel.</p>
        <div class="export-buttons">
          <a class="btn btn-ghost" href="${api.exportUrl('centrales')}" download>⬇ Centrales</a>
          <a class="btn btn-ghost" href="${api.exportUrl('actifs')}" download>⬇ Actifs</a>
          <a class="btn btn-ghost" href="${api.exportUrl('mouvements')}" download>⬇ Mouvements</a>
          <a class="btn btn-ghost" href="${api.exportUrl('demandes')}" download>⬇ Demandes</a>
        </div>
      </div>
    </div>
  `;
}
