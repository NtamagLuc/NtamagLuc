import { Router, HttpError } from '../lib/miniweb.js';
import { db } from '../db.js';
import { computeCentralePerformance } from '../services/performance.js';
import { computeCentraleDashboard } from '../services/dashboardCentrale.js';
import { requireAuth, requireRole, ROLES_GESTION_REFERENTIEL, centraleScopeId, requireCentraleAccess } from '../lib/auth.js';
import { logAudit, diffChamps } from '../lib/audit.js';
import { sendCsv, parseCsv } from '../lib/csv.js';

const PERIODES_VALIDES = ['jour', 'semaine', 'mois', 'trimestre', 'annee'];

export const centralesRouter = new Router();

const CHAMPS_MODIFIABLES = ['nom', 'type', 'localisation', 'capacite_nominale_mw', 'seuil_alerte_pct', 'statut'];
const TYPES_VALIDES = ['THERMIQUE', 'HYDRAULIQUE', 'NUCLEAIRE', 'SOLAIRE', 'EOLIEN'];

centralesRouter.get('/', (req, res) => {
  const user = requireAuth(req);
  const scope = centraleScopeId(user);
  const centrales = scope
    ? db.prepare('SELECT * FROM centrales WHERE id = ? ORDER BY nom').all(scope)
    : db.prepare('SELECT * FROM centrales ORDER BY nom').all();
  const result = centrales.map((c) => {
    const { centrale, ...perf } = computeCentralePerformance(c.id);
    const nbActifs = db
      .prepare("SELECT COUNT(*) AS n FROM actifs WHERE centrale_id = ? AND statut NOT IN ('HORS_SERVICE', 'DECOMMISSIONNE', 'REFORME')")
      .get(c.id).n;
    return { ...c, ...perf, nbActifs };
  });
  res.json(result);
});

centralesRouter.post('/', (req, res) => {
  const user = requireRole(req, ROLES_GESTION_REFERENTIEL);
  const { code, nom, type, localisation, capaciteNominaleMw, seuilAlertePct } = req.body;
  if (!code || !nom || !capaciteNominaleMw) {
    return res.status(400).json({ error: 'code, nom et capaciteNominaleMw sont requis' });
  }
  const codeExistant = db.prepare('SELECT id FROM centrales WHERE code = ?').get(code);
  if (codeExistant) return res.status(409).json({ error: `Le code "${code}" est déjà utilisé par une autre centrale` });

  const info = db
    .prepare(
      `INSERT INTO centrales (code, nom, type, localisation, capacite_nominale_mw, seuil_alerte_pct, statut, cree_par_id, cree_par_nom)
       VALUES (?, ?, ?, ?, ?, ?, 'ACTIVE', ?, ?)`
    )
    .run(code, nom, type || 'THERMIQUE', localisation || null, capaciteNominaleMw, seuilAlertePct || 70, user.id, user.nom);
  const centrale = db.prepare('SELECT * FROM centrales WHERE id = ?').get(info.lastInsertRowid);
  logAudit({
    type: 'CENTRALE_CREE',
    description: `Centrale "${centrale.nom}" (${centrale.code}) créée`,
    acteur: user,
    cibleType: 'CENTRALE',
    cibleId: centrale.id,
    centraleId: centrale.id,
  });
  res.status(201).json(centrale);
});

const EXPORT_COLUMNS = [
  { key: 'code', label: 'code' },
  { key: 'nom', label: 'nom' },
  { key: 'type', label: 'type' },
  { key: 'localisation', label: 'localisation' },
  { key: 'capacite_nominale_mw', label: 'puissance_installee_mw' },
  { key: 'seuil_alerte_pct', label: 'seuil_alerte_pct' },
  { key: 'statut', label: 'statut' },
];

centralesRouter.get('/export', (req, res) => {
  requireRole(req, ROLES_GESTION_REFERENTIEL);
  const centrales = db.prepare('SELECT * FROM centrales ORDER BY code').all();
  sendCsv(res, 'centrales.csv', centrales, EXPORT_COLUMNS);
});

centralesRouter.post('/import', (req, res) => {
  const user = requireRole(req, ROLES_GESTION_REFERENTIEL);
  const rows = parseCsv(req.body?.csv);
  if (!rows.length) throw new HttpError(400, 'Fichier CSV vide ou illisible');

  let crees = 0;
  let misAJour = 0;
  const erreurs = [];

  rows.forEach((row, idx) => {
    const ligne = idx + 2; // +1 en-tête, +1 index 0-based
    const code = row.code?.trim();
    const nom = row.nom?.trim();
    if (!code || !nom) {
      erreurs.push(`Ligne ${ligne} : code et nom sont requis`);
      return;
    }
    const type = TYPES_VALIDES.includes(row.type) ? row.type : 'THERMIQUE';
    const puissance = Number(row.puissance_installee_mw ?? row.capacite_nominale_mw);
    if (!Number.isFinite(puissance) || puissance < 0) {
      erreurs.push(`Ligne ${ligne} (${code}) : puissance_installee_mw invalide`);
      return;
    }
    const seuil = Number(row.seuil_alerte_pct);
    const statut = row.statut === 'INACTIVE' ? 'INACTIVE' : 'ACTIVE';

    const existante = db.prepare('SELECT id FROM centrales WHERE code = ?').get(code);
    if (existante) {
      db.prepare(
        `UPDATE centrales SET nom = ?, type = ?, localisation = ?, capacite_nominale_mw = ?, seuil_alerte_pct = ?, statut = ? WHERE id = ?`
      ).run(nom, type, row.localisation || null, puissance, Number.isFinite(seuil) ? seuil : 70, statut, existante.id);
      misAJour++;
    } else {
      db.prepare(
        `INSERT INTO centrales (code, nom, type, localisation, capacite_nominale_mw, seuil_alerte_pct, statut, cree_par_id, cree_par_nom)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`
      ).run(code, nom, type, row.localisation || null, puissance, Number.isFinite(seuil) ? seuil : 70, statut, user.id, user.nom);
      crees++;
    }
  });

  logAudit({
    type: 'CENTRALES_IMPORTEES',
    description: `Import CSV centrales : ${crees} créée(s), ${misAJour} mise(s) à jour, ${erreurs.length} erreur(s)`,
    acteur: user,
  });

  res.json({ crees, misAJour, erreurs });
});

centralesRouter.get('/:id', (req, res) => {
  const user = requireAuth(req);
  requireCentraleAccess(user, req.params.id);
  const centrale = db.prepare('SELECT * FROM centrales WHERE id = ?').get(req.params.id);
  if (!centrale) return res.status(404).json({ error: 'Centrale introuvable' });
  const { centrale: _c, ...perf } = computeCentralePerformance(centrale.id);
  const actifs = db
    .prepare('SELECT * FROM actifs WHERE centrale_id = ? ORDER BY parent_id IS NOT NULL, nom')
    .all(centrale.id);
  res.json({ ...centrale, ...perf, actifs });
});

centralesRouter.get('/:id/dashboard', (req, res) => {
  const user = requireAuth(req);
  requireCentraleAccess(user, req.params.id);
  const periode = PERIODES_VALIDES.includes(req.query.periode) ? req.query.periode : 'mois';
  const dashboard = computeCentraleDashboard(req.params.id, { periode });
  if (!dashboard) return res.status(404).json({ error: 'Centrale introuvable' });
  res.json(dashboard);
});

centralesRouter.put('/:id', (req, res) => {
  const user = requireRole(req, ROLES_GESTION_REFERENTIEL);
  const centrale = db.prepare('SELECT * FROM centrales WHERE id = ?').get(req.params.id);
  if (!centrale) return res.status(404).json({ error: 'Centrale introuvable' });

  const nouvelles = {
    nom: req.body.nom ?? centrale.nom,
    type: req.body.type ?? centrale.type,
    localisation: req.body.localisation ?? centrale.localisation,
    capacite_nominale_mw: req.body.capaciteNominaleMw ?? centrale.capacite_nominale_mw,
    seuil_alerte_pct: req.body.seuilAlertePct ?? centrale.seuil_alerte_pct,
    statut: req.body.statut ?? centrale.statut,
  };

  db.prepare(
    `UPDATE centrales SET nom = ?, type = ?, localisation = ?, capacite_nominale_mw = ?, seuil_alerte_pct = ?, statut = ?
     WHERE id = ?`
  ).run(
    nouvelles.nom,
    nouvelles.type,
    nouvelles.localisation,
    nouvelles.capacite_nominale_mw,
    nouvelles.seuil_alerte_pct,
    nouvelles.statut,
    centrale.id
  );

  const diff = diffChamps(centrale, nouvelles, CHAMPS_MODIFIABLES);
  const impactPerf = 'capacite_nominale_mw' in diff || 'statut' in diff;
  logAudit({
    type: 'CENTRALE_MODIFIEE',
    description: `Centrale "${centrale.nom}" modifiée${impactPerf ? ' (impact potentiel sur la performance)' : ''}`,
    acteur: user,
    cibleType: 'CENTRALE',
    cibleId: centrale.id,
    centraleId: centrale.id,
    donnees: diff,
  });
  res.json(db.prepare('SELECT * FROM centrales WHERE id = ?').get(centrale.id));
});

centralesRouter.delete('/:id', (req, res) => {
  const user = requireRole(req, ROLES_GESTION_REFERENTIEL);
  const centrale = db.prepare('SELECT * FROM centrales WHERE id = ?').get(req.params.id);
  if (!centrale) return res.status(404).json({ error: 'Centrale introuvable' });
  const nbActifs = db.prepare('SELECT COUNT(*) AS n FROM actifs WHERE centrale_id = ?').get(centrale.id).n;
  if (nbActifs > 0) {
    return res.status(400).json({ error: 'Impossible de supprimer une centrale qui contient des actifs' });
  }
  db.prepare('DELETE FROM centrales WHERE id = ?').run(centrale.id);
  logAudit({ type: 'CENTRALE_SUPPRIMEE', description: `Centrale "${centrale.nom}" supprimée`, acteur: user, cibleType: 'CENTRALE', cibleId: centrale.id });
  res.status(204).end();
});
