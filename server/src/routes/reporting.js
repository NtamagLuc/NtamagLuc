import { Router, HttpError } from '../lib/miniweb.js';
import { db } from '../db.js';
import { requireAuth } from '../lib/auth.js';
import { computeCentralePerformance } from '../services/performance.js';
import { sendCsv } from '../lib/csv.js';

export const reportingRouter = new Router();

reportingRouter.get('/summary', (req, res) => {
  requireAuth(req);

  const centrales = db.prepare('SELECT * FROM centrales ORDER BY nom').all();
  const centralesPerf = centrales.map((c) => {
    const { centrale, ...perf } = computeCentralePerformance(c.id);
    return { ...centrale, ...perf };
  });

  const puissanceNominaleTotale = centralesPerf.reduce((s, c) => s + c.capacite_nominale_mw, 0);
  const puissanceEffectiveTotale = centralesPerf.reduce((s, c) => s + c.puissanceEffectiveMw, 0);
  const performanceMoyenne =
    puissanceNominaleTotale > 0 ? Math.round((puissanceEffectiveTotale / puissanceNominaleTotale) * 10000) / 100 : 0;

  const actifsParStatut = db
    .prepare('SELECT statut, COUNT(*) AS n FROM actifs GROUP BY statut')
    .all()
    .reduce((acc, r) => ({ ...acc, [r.statut]: r.n }), {});

  const actifsParCriticite = db
    .prepare('SELECT criticite, COUNT(*) AS n FROM actifs GROUP BY criticite')
    .all()
    .reduce((acc, r) => ({ ...acc, [r.criticite]: r.n }), {});

  const demandesParStatut = db
    .prepare('SELECT statut, COUNT(*) AS n FROM demandes GROUP BY statut')
    .all()
    .reduce((acc, r) => ({ ...acc, [r.statut]: r.n }), {});

  const demandesParType = db
    .prepare('SELECT type, COUNT(*) AS n FROM demandes GROUP BY type')
    .all()
    .reduce((acc, r) => ({ ...acc, [r.type]: r.n }), {});

  const mouvementsParType = db
    .prepare('SELECT type, COUNT(*) AS n FROM mouvements GROUP BY type')
    .all()
    .reduce((acc, r) => ({ ...acc, [r.type]: r.n }), {});

  const demandesParNiveauImpact = db
    .prepare("SELECT niveau_impact, COUNT(*) AS n FROM demandes WHERE niveau_impact IS NOT NULL GROUP BY niveau_impact")
    .all()
    .reduce((acc, r) => ({ ...acc, [r.niveau_impact]: r.n }), {});

  const actifsCritiquesEnService = db
    .prepare("SELECT * FROM actifs WHERE criticite = 'CRITIQUE' AND statut = 'EN_SERVICE' ORDER BY nom")
    .all();

  const centralesEnAlerte = centralesPerf.filter((c) => c.performancePct < c.seuil_alerte_pct);

  res.json({
    centrales: centralesPerf.map((c) => ({
      id: c.id,
      nom: c.nom,
      type: c.type,
      performancePct: c.performancePct,
      puissanceEffectiveMw: c.puissanceEffectiveMw,
      capaciteNominaleMw: c.capacite_nominale_mw,
      seuilAlertePct: c.seuil_alerte_pct,
    })),
    totaux: {
      nbCentrales: centrales.length,
      nbActifs: Object.values(actifsParStatut).reduce((s, n) => s + n, 0),
      puissanceNominaleTotale: round2(puissanceNominaleTotale),
      puissanceEffectiveTotale: round2(puissanceEffectiveTotale),
      performanceMoyenne,
      nbCentralesEnAlerte: centralesEnAlerte.length,
    },
    actifsParStatut,
    actifsParCriticite,
    demandesParStatut,
    demandesParType,
    demandesParNiveauImpact,
    mouvementsParType,
    actifsCritiquesEnService,
    centralesEnAlerte: centralesEnAlerte.map((c) => ({ id: c.id, nom: c.nom, performancePct: c.performancePct, seuilAlertePct: c.seuil_alerte_pct })),
  });
});

const EXPORTS = {
  centrales: {
    filename: 'centrales.csv',
    columns: [
      { key: 'id', label: 'ID' },
      { key: 'code', label: 'Code' },
      { key: 'nom', label: 'Nom' },
      { key: 'type', label: 'Type' },
      { key: 'statut', label: 'Statut' },
      { key: 'localisation', label: 'Localisation' },
      { key: 'capacite_nominale_mw', label: 'Capacité nominale (MW)' },
      { key: 'seuil_alerte_pct', label: "Seuil d'alerte (%)" },
      { key: 'performancePct', label: 'Performance actuelle (%)' },
      { key: 'puissanceEffectiveMw', label: 'Puissance effective (MW)' },
    ],
    rows: () =>
      db
        .prepare('SELECT * FROM centrales ORDER BY nom')
        .all()
        .map((c) => {
          const { centrale, ...perf } = computeCentralePerformance(c.id);
          return { ...c, ...perf };
        }),
  },
  actifs: {
    filename: 'actifs.csv',
    columns: [
      { key: 'id', label: 'ID' },
      { key: 'code', label: 'Code' },
      { key: 'nom', label: 'Nom' },
      { key: 'type', label: 'Type' },
      { key: 'centrale_nom', label: 'Centrale' },
      { key: 'parent_nom', label: 'Actif mère' },
      { key: 'statut', label: 'Statut' },
      { key: 'criticite', label: 'Criticité' },
      { key: 'contribution_mw', label: 'Contribution (MW)' },
      { key: 'fabricant', label: 'Fabricant' },
      { key: 'modele', label: 'Modèle' },
      { key: 'numero_serie', label: 'Numéro de série' },
      { key: 'date_installation', label: "Date d'installation" },
    ],
    rows: () =>
      db
        .prepare(
          `SELECT a.*, c.nom AS centrale_nom, p.nom AS parent_nom
           FROM actifs a
           JOIN centrales c ON c.id = a.centrale_id
           LEFT JOIN actifs p ON p.id = a.parent_id
           ORDER BY a.nom`
        )
        .all(),
  },
  mouvements: {
    filename: 'mouvements.csv',
    columns: [
      { key: 'id', label: 'ID' },
      { key: 'date', label: 'Date' },
      { key: 'type', label: 'Type' },
      { key: 'actif_nom', label: 'Actif' },
      { key: 'centrale_source_nom', label: 'Centrale source' },
      { key: 'centrale_dest_nom', label: 'Centrale destination' },
      { key: 'score_source_avant', label: 'Score source avant (%)' },
      { key: 'score_source_apres', label: 'Score source après (%)' },
      { key: 'score_dest_avant', label: 'Score destination avant (%)' },
      { key: 'score_dest_apres', label: 'Score destination après (%)' },
      { key: 'nb_actifs_impactes', label: "Nb actifs impactés" },
      { key: 'niveau_impact', label: "Niveau d'impact" },
      { key: 'executeur_nom', label: 'Exécuté par' },
      { key: 'commentaire', label: 'Commentaire' },
    ],
    rows: () => db.prepare('SELECT * FROM mouvements ORDER BY date DESC').all(),
  },
  demandes: {
    filename: 'demandes.csv',
    columns: [
      { key: 'id', label: 'ID' },
      { key: 'created_at', label: 'Créée le' },
      { key: 'type', label: 'Type' },
      { key: 'statut', label: 'Statut' },
      { key: 'actif_nom', label: 'Actif' },
      { key: 'centrale_source_nom', label: 'Centrale source' },
      { key: 'centrale_dest_nom', label: 'Centrale destination' },
      { key: 'niveau_impact', label: "Niveau d'impact" },
      { key: 'demandeur_nom', label: 'Demandeur' },
      { key: 'validateur_nom', label: 'Validateur' },
      { key: 'motif', label: 'Motif' },
      { key: 'commentaire_validation', label: 'Commentaire de validation' },
      { key: 'date_validation', label: 'Date de validation' },
      { key: 'date_execution', label: "Date d'exécution" },
    ],
    rows: () => db.prepare('SELECT * FROM demandes ORDER BY created_at DESC').all(),
  },
};

reportingRouter.get('/export/:entity', (req, res) => {
  requireAuth(req);
  const config = EXPORTS[req.params.entity];
  if (!config) throw new HttpError(404, `Export inconnu (attendu : ${Object.keys(EXPORTS).join(', ')})`);
  sendCsv(res, config.filename, config.rows(), config.columns);
});

function round2(n) {
  return Math.round(n * 100) / 100;
}
