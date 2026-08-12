import { api } from '../api.js';
import { barListHtml, lineChartSvg } from '../components/charts.js';
import { renderActifTree } from '../components/actifTree.js';
import { attachActifActionHandlers } from '../components/actifActions.js';
import { renderSimulation } from '../components/demandeFormModal.js';
import {
  escapeHtml,
  formatNombre,
  formatDate,
  TYPE_CENTRALE_LABELS,
  CENTRALE_STATUT_LABELS,
  CENTRALE_STATUT_CLASSES,
  STATUT_LABELS,
  STATUT_CLASSES,
  DEMANDE_TYPE_LABELS,
  DEMANDE_STATUT_LABELS,
  DEMANDE_STATUT_CLASSES,
  NIVEAU_IMPACT_LABELS,
  NIVEAU_IMPACT_CLASSES,
} from '../utils.js';
import { refresh } from '../router.js';

const STATUT_COLORS = {
  EN_SERVICE: '#16a34a',
  EN_MAINTENANCE: '#d97706',
  EN_REPARATION: '#d97706',
  EN_TRANSFERT: '#0891b2',
  HORS_SERVICE: '#6b7280',
  DECOMMISSIONNE: '#dc2626',
  REFORME: '#dc2626',
};

const CAUSE_COLORS = {
  EN_MAINTENANCE: '#d97706',
  EN_REPARATION: '#ea9a3c',
  HORS_SERVICE: '#6b7280',
  EN_TRANSFERT: '#0891b2',
  DECOMMISSIONNE: '#dc2626',
  REFORME: '#b91c1c',
  NON_AFFECTEE: '#9ca3af',
};

const UNITE_STATUT_LABELS = { EN_SERVICE: 'En service', PARTIEL: 'Partiellement disponible', HORS_SERVICE: 'Hors service' };
const UNITE_STATUT_CLASSES = { EN_SERVICE: 'badge-success', PARTIEL: 'badge-warning', HORS_SERVICE: 'badge-neutral' };

const PERIODE_LABELS = { jour: 'Jour', semaine: 'Semaine', mois: 'Mois', trimestre: 'Trimestre', annee: 'Année' };

const TIMELINE_ICONS = {
  DEMANDE: '📋',
  ACTIF: '🔧',
  CENTRALE: '⚡',
  MAINTENANCE: '🛠️',
  REPARATION: '🛠️',
  SIMULATION: '🔁',
};

function timelineIcon(type) {
  const prefixe = Object.keys(TIMELINE_ICONS).find((p) => type.startsWith(p));
  return TIMELINE_ICONS[prefixe] || '📌';
}

export async function renderCentraleDetail({ id }) {
  const app = document.getElementById('app');
  app.innerHTML = '<p class="loading">Chargement du tableau de bord…</p>';

  const [centrale, dashboard] = await Promise.all([api.getCentrale(id), api.getCentraleDashboard(id, 'mois')]);

  let periodeActuelle = 'mois';

  app.innerHTML = `
    <a class="back-link" href="#/">← Retour au tableau de bord</a>

    <div id="centrale-header"></div>
    <div class="filters-bar" id="centrale-filters"></div>
    <div id="centrale-kpis"></div>
    <div id="centrale-filtre-resultat"></div>

    <div class="dashboard-grid-2">
      <section class="reporting-panel">
        <h2 class="section-title">Actifs par statut</h2>
        <div id="section-actifs-statut"></div>
      </section>
      <section class="reporting-panel">
        <h2 class="section-title">Indisponibilités et pertes de capacité</h2>
        <div id="section-indisponibilites"></div>
      </section>
    </div>

    <section class="reporting-panel">
      <h2 class="section-title">Actifs critiques</h2>
      <div id="section-actifs-critiques"></div>
    </section>

    <section class="reporting-panel">
      <h2 class="section-title">Unités de production</h2>
      <div id="section-unites"></div>
    </section>

    <div class="dashboard-grid-2">
      <section class="reporting-panel">
        <h2 class="section-title">Résumé de la maintenance</h2>
        <div id="section-maintenance"></div>
      </section>
      <section class="reporting-panel">
        <h2 class="section-title">Opérations en cours</h2>
        <div id="section-operations"></div>
      </section>
    </div>

    <section class="reporting-panel">
      <h2 class="section-title">Simulation d'impact</h2>
      <div id="section-simulation"></div>
    </section>

    <section class="reporting-panel">
      <h2 class="section-title">Alertes</h2>
      <div id="section-alertes"></div>
    </section>

    <div class="dashboard-grid-2">
      <section class="reporting-panel">
        <h2 class="section-title">Évolution — disponibilité</h2>
        <div id="section-historique"></div>
      </section>
      <section class="reporting-panel">
        <h2 class="section-title">Événements récents</h2>
        <div id="section-timeline"></div>
      </section>
    </div>

    <section class="reporting-panel">
      <h2 class="section-title">Contribution au parc</h2>
      <div id="section-contribution"></div>
    </section>

    <h2 class="section-title">Équipements (${centrale.actifs.length})</h2>
    <p class="page-subtitle">Actifs de premier niveau — ouvrez le détail d'un actif pour voir ses sous-actifs.</p>
    <div id="actif-tree-container">${renderActifTree(centrale.actifs)}</div>
  `;

  function renderHeader() {
    document.getElementById('centrale-header').innerHTML = `
      <div class="page-header">
        <div>
          <h1>${escapeHtml(centrale.nom)} <span class="badge ${CENTRALE_STATUT_CLASSES[centrale.statut] || 'badge-neutral'}">${CENTRALE_STATUT_LABELS[centrale.statut] || centrale.statut}</span></h1>
          <p class="page-subtitle">
            ${escapeHtml(centrale.code)} · ${TYPE_CENTRALE_LABELS[centrale.type] || centrale.type} · ${escapeHtml(centrale.localisation || '—')}
            · ${formatNombre(dashboard.identite.puissanceInstalleeMw)} MW installés · ${dashboard.identite.nbUnites} unité(s) · ${dashboard.identite.nbActifsTotal} actif(s)
          </p>
          <p class="dashboard-updated">Dernière actualisation : ${formatDate(dashboard.identite.derniereActualisation)}</p>
        </div>
      </div>
    `;
  }

  function renderFilters() {
    document.getElementById('centrale-filters').innerHTML = `
      <label class="field field-inline">
        <span>Période</span>
        <select id="filtre-periode">
          ${Object.entries(PERIODE_LABELS).map(([v, l]) => `<option value="${v}" ${v === periodeActuelle ? 'selected' : ''}>${l}</option>`).join('')}
        </select>
      </label>
    `;
    document.getElementById('filtre-periode').addEventListener('change', async (e) => {
      periodeActuelle = e.target.value;
      const fresh = await api.getCentraleDashboard(id, periodeActuelle);
      Object.assign(dashboard, fresh);
      renderKpis();
      renderHistoriqueSection();
    });
  }

  function kpiTile(label, value, { sub = '', alert = false } = {}) {
    return `<div class="stat-tile ${alert ? 'stat-tile-alert' : ''}"><span class="stat-tile-value">${value}</span><span class="stat-tile-label">${escapeHtml(label)}</span>${sub ? `<span class="stat-tile-sub">${sub}</span>` : ''}</div>`;
  }

  function renderKpis() {
    const k = dashboard.kpis;
    const ecartCls = k.ecartProductionMwh >= 0 ? 'delta-up' : 'delta-down';
    document.getElementById('centrale-kpis').innerHTML = `
      <div class="stat-tiles">
        ${kpiTile('Puissance installée', `${formatNombre(k.puissanceInstalleeMw)} MW`)}
        ${kpiTile('Puissance disponible', `${formatNombre(k.puissanceDisponibleMw)} MW`)}
        ${kpiTile('Puissance indisponible', `${formatNombre(k.puissanceIndisponibleMw)} MW`, { alert: k.puissanceIndisponibleMw > 0 })}
        ${kpiTile('Disponibilité', `${k.disponibilitePct}%`, { alert: k.disponibilitePct < k.seuilAlertePct, sub: `Seuil : ${k.seuilAlertePct}%` })}
        ${kpiTile("Taux d'utilisation", `${k.tauxUtilisationPct}%`, { sub: 'Actifs en service / total' })}
        ${kpiTile('Rendement', k.rendementPct === null ? 'N/A' : `${k.rendementPct}%`, { sub: k.rendementPct === null ? 'Non mesuré dans ce périmètre' : '' })}
        ${kpiTile('Production estimée (réelle)', `${formatNombre(k.productionReelleEstimeeMwh)} MWh`, { sub: `Sur la période sélectionnée (${PERIODE_LABELS[periodeActuelle].toLowerCase()})` })}
        ${kpiTile('Production prévue', `${formatNombre(k.productionPrevueMwh)} MWh`, { sub: `Basée sur le seuil cible (${k.seuilAlertePct}%)` })}
        ${kpiTile('Écart production', `<span class="${ecartCls}">${k.ecartProductionMwh >= 0 ? '+' : ''}${formatNombre(k.ecartProductionMwh)} MWh</span>`, { sub: `${k.ecartProductionPct >= 0 ? '+' : ''}${k.ecartProductionPct}%` })}
      </div>
      <p class="dashboard-note">Les valeurs de production sont des estimations calculées à partir de la puissance disponible enregistrée dans le temps (pas de télérelève de production intégrée à ce périmètre).</p>
    `;
  }

  function afficherFiltreResultat(label, actifsFiltres) {
    const box = document.getElementById('centrale-filtre-resultat');
    if (!actifsFiltres.length) {
      box.innerHTML = `<div class="banner banner-info">Aucun actif "${escapeHtml(label)}". <button class="btn btn-sm btn-ghost" id="fermer-filtre">Fermer</button></div>`;
    } else {
      box.innerHTML = `
        <div class="filtre-resultat-panel">
          <div class="filtre-resultat-header">
            <strong>${actifsFiltres.length} actif(s) — ${escapeHtml(label)}</strong>
            <button class="btn btn-sm btn-ghost" id="fermer-filtre">Fermer</button>
          </div>
          <ul class="actif-children-list">
            ${actifsFiltres
              .map((a) => `<li><a href="#/actifs/${a.id}">${escapeHtml(a.nom)}</a> <span class="actif-code">${escapeHtml(a.code)}</span> <span class="badge ${STATUT_CLASSES[a.statut] || 'badge-neutral'}">${STATUT_LABELS[a.statut] || a.statut}</span></li>`)
              .join('')}
          </ul>
        </div>
      `;
    }
    document.getElementById('fermer-filtre').addEventListener('click', () => {
      box.innerHTML = '';
    });
    box.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
  }

  function renderActifsParStatutSection() {
    const items = Object.entries(dashboard.actifsParStatut)
      .filter(([, n]) => n > 0)
      .map(([statut, n]) => ({
        label: STATUT_LABELS[statut] || statut,
        value: n,
        color: STATUT_COLORS[statut],
        dataAttrs: `data-statut-filtre="${statut}"`,
      }));
    document.getElementById('section-actifs-statut').innerHTML =
      barListHtml(items, { formatValue: (v) => `${v}`, emptyLabel: 'Aucun actif enregistré.' }) +
      `<p class="dashboard-note">${centrale.actifs.length} actif(s) au total. Cliquer sur une ligne pour voir la liste correspondante.</p>`;

    document.querySelectorAll('#section-actifs-statut [data-statut-filtre]').forEach((row) => {
      row.style.cursor = 'pointer';
      row.addEventListener('click', () => {
        const statut = row.dataset.statutFiltre;
        afficherFiltreResultat(STATUT_LABELS[statut] || statut, centrale.actifs.filter((a) => a.statut === statut));
      });
    });
  }

  function renderActifsCritiquesSection() {
    const list = dashboard.actifsCritiques;
    if (!list.length) {
      document.getElementById('section-actifs-critiques').innerHTML = '<p class="empty-state">Aucun actif critique enregistré pour cette centrale.</p>';
      return;
    }
    document.getElementById('section-actifs-critiques').innerHTML = `
      <div class="table-wrapper">
        <table class="data-table">
          <thead><tr><th>Code</th><th>Actif</th><th>Type</th><th>État</th><th>Unité</th><th>Impact potentiel</th></tr></thead>
          <tbody>
            ${list
              .map(
                (a) => `
              <tr class="table-row-link" data-href="#/actifs/${a.id}">
                <td>${escapeHtml(a.code)}</td>
                <td>${escapeHtml(a.nom)}</td>
                <td>${escapeHtml(a.type)}</td>
                <td><span class="badge ${STATUT_CLASSES[a.statut] || 'badge-neutral'}">${STATUT_LABELS[a.statut] || a.statut}</span></td>
                <td>${escapeHtml(a.uniteNom)}</td>
                <td>${a.contributionMw ? `${formatNombre(a.contributionMw)} MW (${a.impactPctCapacite}% de la capacité)` : '—'}</td>
              </tr>
            `
              )
              .join('')}
          </tbody>
        </table>
      </div>
    `;
    attachRowLinks('section-actifs-critiques');
  }

  function renderUnitesSection() {
    const list = dashboard.unites;
    if (!list.length) {
      document.getElementById('section-unites').innerHTML = '<p class="empty-state">Aucune unité enregistrée.</p>';
      return;
    }
    document.getElementById('section-unites').innerHTML = `
      <div class="table-wrapper">
        <table class="data-table">
          <thead><tr><th>Unité</th><th>Installée</th><th>Disponible</th><th>Indisponible</th><th>Disponibilité</th><th>Statut</th></tr></thead>
          <tbody>
            ${list
              .map(
                (u) => `
              <tr class="table-row-link" data-href="#/actifs/${u.id}">
                <td>${escapeHtml(u.nom)}<br><span class="actif-code">${escapeHtml(u.code)}</span></td>
                <td>${formatNombre(u.puissanceInstalleeMw)} MW</td>
                <td>${formatNombre(u.puissanceDisponibleMw)} MW</td>
                <td>${formatNombre(u.puissanceIndisponibleMw)} MW</td>
                <td>${u.disponibilitePct}%</td>
                <td><span class="badge ${UNITE_STATUT_CLASSES[u.statut]}">${UNITE_STATUT_LABELS[u.statut]}</span></td>
              </tr>
            `
              )
              .join('')}
          </tbody>
        </table>
      </div>
    `;
    attachRowLinks('section-unites');
  }

  function renderIndisponibilitesSection() {
    const d = dashboard.indisponibilites;
    const items = d.parCause.map((c) => ({
      label: c.label,
      value: c.mw,
      color: CAUSE_COLORS[c.cause],
      dataAttrs: c.nbActifs > 0 ? `data-statut-filtre="${c.cause}"` : '',
    }));
    document.getElementById('section-indisponibilites').innerHTML = `
      <div class="stat-tiles stat-tiles-compact">
        ${kpiTile('Capacité installée', `${formatNombre(d.capaciteInstalleeMw)} MW`)}
        ${kpiTile('Capacité disponible', `${formatNombre(d.capaciteDisponibleMw)} MW`)}
        ${kpiTile('Capacité indisponible', `${formatNombre(d.capaciteIndisponibleMw)} MW`, { alert: d.capaciteIndisponibleMw > 0 })}
      </div>
      <h3 class="dashboard-subtitle">Répartition par cause</h3>
      ${barListHtml(items, { formatValue: (v) => `${formatNombre(v)} MW`, emptyLabel: 'Aucune indisponibilité actuellement.' })}
      ${
        d.parCause.some((c) => c.cause === 'NON_AFFECTEE')
          ? '<p class="dashboard-note">« Écart capacité nominale » : part de la puissance installée déclarée pour la centrale qui ne correspond à aucun actif enregistré dans le référentiel.</p>'
          : ''
      }
    `;
    document.querySelectorAll('#section-indisponibilites [data-statut-filtre]').forEach((row) => {
      row.style.cursor = 'pointer';
      row.addEventListener('click', () => {
        const statut = row.dataset.statutFiltre;
        afficherFiltreResultat(STATUT_LABELS[statut] || statut, centrale.actifs.filter((a) => a.statut === statut));
      });
    });
  }

  function renderMaintenanceSection() {
    const m = dashboard.maintenance;
    document.getElementById('section-maintenance').innerHTML = `
      <div class="maintenance-summary-grid">
        <div><span class="stat-label">En cours</span><span class="stat-value">${m.interventionsEnCours.length}</span></div>
        <div><span class="stat-label">Planifiées</span><span class="stat-value">${m.planifiees.length}</span></div>
        <div><span class="stat-label">En retard</span><span class="stat-value ${m.enRetard.length ? 'stat-value-alert' : ''}">${m.enRetard.length}</span></div>
        <div><span class="stat-label">Nécessitant une intervention</span><span class="stat-value ${m.necessitantIntervention.length ? 'stat-value-alert' : ''}">${m.necessitantIntervention.length}</span></div>
      </div>
      ${
        m.interventionsEnCours.length
          ? `<ul class="mini-list">
              ${m.interventionsEnCours
                .map(
                  (a) => `<li><a href="#/actifs/${a.id}">${escapeHtml(a.nom)}</a> <span class="badge ${STATUT_CLASSES[a.statut]}">${STATUT_LABELS[a.statut]}</span>${a.impactImportant ? ' <span class="badge badge-danger">Impact important</span>' : ''} <span class="mini-list-meta">depuis le ${formatDate(a.depuis)}</span></li>`
                )
                .join('')}
            </ul>`
          : ''
      }
      ${
        m.enRetard.length
          ? `<h3 class="dashboard-subtitle">En retard</h3>
             <ul class="mini-list">
              ${m.enRetard.map((d) => `<li><a href="#/demandes/${d.id}">${DEMANDE_TYPE_LABELS[d.type]} — ${escapeHtml(d.actifNom)}</a> <span class="mini-list-meta">prévue le ${escapeHtml(d.datePrevue)}</span></li>`).join('')}
             </ul>`
          : ''
      }
    `;
  }

  function renderOperationsSection() {
    const o = dashboard.operations;
    const items = o.enCours;
    document.getElementById('section-operations').innerHTML = `
      <div class="maintenance-summary-grid">
        <div><span class="stat-label">En attente (Exploitation)</span><span class="stat-value">${o.parStatut.EN_ATTENTE || 0}</span></div>
        <div><span class="stat-label">Transmises (Chef Centrale)</span><span class="stat-value">${o.parStatut.TRANSMISE || 0}</span></div>
        <div><span class="stat-label">Bloquées</span><span class="stat-value ${o.bloquees.length ? 'stat-value-alert' : ''}">${o.bloquees.length}</span></div>
      </div>
      ${
        items.length
          ? `<ul class="mini-list">
              ${items
                .map(
                  (d) => `<li><a href="#/demandes/${d.id}">${DEMANDE_TYPE_LABELS[d.type]} — ${escapeHtml(d.actifNom)}</a>
                <span class="badge ${DEMANDE_STATUT_CLASSES[d.statut]}">${DEMANDE_STATUT_LABELS[d.statut]}</span>
                ${d.niveauImpact ? `<span class="badge ${NIVEAU_IMPACT_CLASSES[d.niveauImpact]}">${NIVEAU_IMPACT_LABELS[d.niveauImpact]}</span>` : ''}
                ${d.simulationObsolete ? '<span class="badge badge-danger">Simulation obsolète</span>' : ''}</li>`
                )
                .join('')}
            </ul>`
          : '<p class="empty-state">Aucune opération en cours pour cette centrale.</p>'
      }
    `;
  }

  function renderAlertesSection() {
    const list = dashboard.alertes;
    if (!list.length) {
      document.getElementById('section-alertes').innerHTML = '<p class="empty-state">Aucune alerte active pour cette centrale.</p>';
      return;
    }
    document.getElementById('section-alertes').innerHTML = `
      <ul class="alert-list">
        ${list
          .map(
            (a) => `<li class="alert-item alert-clickable ${a.severite === 'haute' ? 'alert-haute' : a.severite === 'moyenne' ? 'alert-moyenne' : 'alert-basse'}" data-lien="${a.lien || ''}">${escapeHtml(a.message)}</li>`
          )
          .join('')}
      </ul>
    `;
    document.querySelectorAll('#section-alertes .alert-clickable').forEach((li) => {
      if (!li.dataset.lien) return;
      li.style.cursor = 'pointer';
      li.addEventListener('click', () => {
        location.hash = li.dataset.lien;
      });
    });
  }

  function renderHistoriqueSection() {
    const h = dashboard.historique;
    const points = h.points.map((p) => ({ date: p.date, value: p.disponibilitePct }));
    document.getElementById('section-historique').innerHTML = `
      ${!h.aHistorique ? `<p class="dashboard-note">Aucun mouvement enregistré sur cette centrale : la valeur courante est reportée sur toute la période.</p>` : ''}
      ${lineChartSvg(points, { seuil: dashboard.kpis.seuilAlertePct })}
    `;
  }

  function renderTimelineSection() {
    const list = dashboard.timeline;
    if (!list.length) {
      document.getElementById('section-timeline').innerHTML = '<p class="empty-state">Aucun événement enregistré pour cette centrale.</p>';
      return;
    }
    document.getElementById('section-timeline').innerHTML = `
      <ul class="timeline-list">
        ${list
          .map(
            (e) => `
          <li class="timeline-item ${e.lien ? 'timeline-item-link' : ''}" ${e.lien ? `data-href="${e.lien}"` : ''}>
            <span class="timeline-icon">${timelineIcon(e.type)}</span>
            <div class="timeline-body">
              <p class="timeline-desc">${escapeHtml(e.description)}</p>
              <p class="timeline-meta">${formatDate(e.date)}${e.acteurNom ? ` · ${escapeHtml(e.acteurNom)}` : ''}</p>
            </div>
          </li>
        `
          )
          .join('')}
      </ul>
    `;
    attachRowLinks('section-timeline', '.timeline-item-link');
  }

  function renderContributionSection() {
    const c = dashboard.contributionParc;
    document.getElementById('section-contribution').innerHTML = `
      <div class="stat-tiles">
        ${kpiTile('Puissance installée', `${formatNombre(c.puissanceInstalleeMw)} MW`)}
        ${kpiTile('Puissance disponible', `${formatNombre(c.puissanceDisponibleMw)} MW`)}
        ${kpiTile('Part de la capacité du parc', `${c.pctCapaciteParc}%`, { sub: `${formatNombre(c.parcPuissanceInstalleeMw)} MW installés sur tout le parc` })}
        ${kpiTile('Part de la production du parc', `${c.pctProductionParc}%`, { sub: `${formatNombre(c.parcPuissanceDisponibleMw)} MW disponibles sur tout le parc` })}
      </div>
    `;
  }

  function attachRowLinks(containerId, selector = '.table-row-link') {
    document.getElementById(containerId).querySelectorAll(selector).forEach((row) => {
      row.style.cursor = 'pointer';
      row.addEventListener('click', () => {
        location.hash = row.dataset.href;
      });
    });
  }

  function renderSimulationSection() {
    const actifsSimulables = centrale.actifs.filter((a) => !['DECOMMISSIONNE', 'REFORME'].includes(a.statut));
    document.getElementById('section-simulation').innerHTML = `
      <p class="dashboard-note">Simulation virtuelle de l'impact d'un retrait, sans impact réel : rien n'est modifié tant qu'une demande n'a pas suivi le circuit complet de validation.</p>
      <div class="filters-bar">
        <label class="field field-inline">
          <span>Actif</span>
          <select id="sim-actif">
            ${actifsSimulables.map((a) => `<option value="${a.id}">${escapeHtml(a.nom)} (${escapeHtml(a.code)})</option>`).join('')}
          </select>
        </label>
        <button class="btn btn-primary btn-sm" id="sim-lancer-btn">Simuler l'impact</button>
      </div>
      <div id="sim-resultat"></div>
    `;

    document.getElementById('sim-lancer-btn').addEventListener('click', async () => {
      const actifId = Number(document.getElementById('sim-actif').value);
      const resultBox = document.getElementById('sim-resultat');
      resultBox.innerHTML = '<p class="loading">Calcul de l\'impact…</p>';
      try {
        const simulation = await api.previewDemande({ type: 'RETRAIT', actifId, avecHierarchie: true });
        resultBox.innerHTML = renderSimulation(simulation);
      } catch (err) {
        resultBox.innerHTML = `<p class="error-state">${escapeHtml(err.message)}</p>`;
      }
    });
  }

  renderHeader();
  renderFilters();
  renderKpis();
  renderActifsParStatutSection();
  renderActifsCritiquesSection();
  renderUnitesSection();
  renderIndisponibilitesSection();
  renderMaintenanceSection();
  renderOperationsSection();
  renderSimulationSection();
  renderAlertesSection();
  renderHistoriqueSection();
  renderTimelineSection();
  renderContributionSection();

  attachActifActionHandlers(
    document.getElementById('actif-tree-container'),
    (actifId) => centrale.actifs.find((a) => a.id === actifId),
    refresh
  );
}
