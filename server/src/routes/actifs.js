import { Router, HttpError } from '../lib/miniweb.js';
import { db } from '../db.js';
import { computeCentralePerformance } from '../services/performance.js';
import { insertMouvement, deserializeMouvement } from '../services/mouvements.js';
import { requireAuth, requireRole } from '../lib/auth.js';
import { logAudit } from '../lib/audit.js';

export const actifsRouter = new Router();

actifsRouter.get('/', (req, res) => {
  requireAuth(req);
  const { centraleId } = req.query;
  const actifs = centraleId
    ? db.prepare('SELECT * FROM actifs WHERE centrale_id = ? ORDER BY nom').all(centraleId)
    : db.prepare('SELECT * FROM actifs ORDER BY nom').all();
  res.json(actifs);
});

actifsRouter.post('/', (req, res) => {
  const user = requireRole(req, ['ADMINISTRATEUR']);
  const {
    nom,
    type,
    centraleId,
    parentId,
    statut,
    criticite,
    contributionMw,
    dateInstallation,
    description,
  } = req.body;

  if (!nom || !centraleId) {
    return res.status(400).json({ error: 'nom et centraleId sont requis' });
  }

  if (parentId) {
    const parent = db.prepare('SELECT * FROM actifs WHERE id = ?').get(parentId);
    if (!parent) return res.status(400).json({ error: 'Actif parent introuvable' });
    if (parent.centrale_id !== Number(centraleId)) {
      return res.status(400).json({ error: "L'actif enfant doit appartenir à la même centrale que son actif mère" });
    }
  }

  const info = db
    .prepare(
      `INSERT INTO actifs (nom, type, centrale_id, parent_id, statut, criticite, contribution_mw, date_installation, description)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`
    )
    .run(
      nom,
      type || 'EQUIPEMENT',
      centraleId,
      parentId || null,
      statut || 'EN_SERVICE',
      criticite || 'MOYENNE',
      contributionMw || 0,
      dateInstallation || null,
      description || null
    );
  const actif = db.prepare('SELECT * FROM actifs WHERE id = ?').get(info.lastInsertRowid);
  logAudit({ type: 'ACTIF_CREE', description: `Actif "${actif.nom}" créé`, acteur: user, cibleType: 'ACTIF', cibleId: actif.id });
  res.status(201).json(actif);
});

actifsRouter.get('/:id', (req, res) => {
  requireAuth(req);
  const actif = db.prepare('SELECT * FROM actifs WHERE id = ?').get(req.params.id);
  if (!actif) return res.status(404).json({ error: 'Actif introuvable' });
  const enfants = db.prepare('SELECT * FROM actifs WHERE parent_id = ?').all(actif.id);
  const parent = actif.parent_id
    ? db.prepare('SELECT * FROM actifs WHERE id = ?').get(actif.parent_id)
    : null;
  const historique = db
    .prepare('SELECT * FROM mouvements WHERE actif_id = ? ORDER BY date DESC')
    .all(actif.id)
    .map(deserializeMouvement);
  const demandes = db
    .prepare('SELECT * FROM demandes WHERE actif_id = ? ORDER BY created_at DESC')
    .all(actif.id)
    .map(deserializeDemande);
  res.json({ ...actif, enfants, parent, historique, demandes });
});

actifsRouter.put('/:id', (req, res) => {
  const user = requireRole(req, ['ADMINISTRATEUR']);
  const actif = db.prepare('SELECT * FROM actifs WHERE id = ?').get(req.params.id);
  if (!actif) return res.status(404).json({ error: 'Actif introuvable' });
  const { nom, type, criticite, contributionMw, dateInstallation, description } = req.body;
  db.prepare(
    `UPDATE actifs SET nom = ?, type = ?, criticite = ?, contribution_mw = ?, date_installation = ?, description = ?, updated_at = datetime('now')
     WHERE id = ?`
  ).run(
    nom ?? actif.nom,
    type ?? actif.type,
    criticite ?? actif.criticite,
    contributionMw ?? actif.contribution_mw,
    dateInstallation ?? actif.date_installation,
    description ?? actif.description,
    actif.id
  );
  logAudit({ type: 'ACTIF_MODIFIE', description: `Actif "${actif.nom}" modifié`, acteur: user, cibleType: 'ACTIF', cibleId: actif.id });
  res.json(db.prepare('SELECT * FROM actifs WHERE id = ?').get(actif.id));
});

actifsRouter.delete('/:id', (req, res) => {
  const user = requireRole(req, ['ADMINISTRATEUR']);
  const actif = db.prepare('SELECT * FROM actifs WHERE id = ?').get(req.params.id);
  if (!actif) return res.status(404).json({ error: 'Actif introuvable' });
  const nbEnfants = db.prepare('SELECT COUNT(*) AS n FROM actifs WHERE parent_id = ?').get(actif.id).n;
  if (nbEnfants > 0) {
    return res.status(400).json({ error: "Impossible de supprimer un actif qui possède des actifs enfants" });
  }
  db.prepare('DELETE FROM actifs WHERE id = ?').run(actif.id);
  logAudit({ type: 'ACTIF_SUPPRIME', description: `Actif "${actif.nom}" supprimé`, acteur: user, cibleType: 'ACTIF', cibleId: actif.id });
  res.status(204).end();
});

// --- Actions opérationnelles directes (hors circuit de demande) ---

actifsRouter.post('/:id/mettre-en-maintenance', (req, res) => {
  const user = requireRole(req, ['VALIDATEUR', 'ADMINISTRATEUR']);
  const actif = db.prepare('SELECT * FROM actifs WHERE id = ?').get(req.params.id);
  if (!actif) throw new HttpError(404, 'Actif introuvable');
  if (actif.statut !== 'EN_SERVICE') {
    throw new HttpError(400, 'Seul un actif en service peut être mis en maintenance');
  }
  res.status(201).json(basculerStatut(actif, 'EN_MAINTENANCE', 'MAINTENANCE_DEBUT', user, req.body?.commentaire));
});

actifsRouter.post('/:id/fin-maintenance', (req, res) => {
  const user = requireRole(req, ['VALIDATEUR', 'ADMINISTRATEUR']);
  const actif = db.prepare('SELECT * FROM actifs WHERE id = ?').get(req.params.id);
  if (!actif) throw new HttpError(404, 'Actif introuvable');
  if (actif.statut !== 'EN_MAINTENANCE') {
    throw new HttpError(400, "Cet actif n'est pas en maintenance");
  }
  res.status(201).json(basculerStatut(actif, 'EN_SERVICE', 'MAINTENANCE_FIN', user, req.body?.commentaire));
});

actifsRouter.post('/:id/remise-en-service', (req, res) => {
  const user = requireRole(req, ['VALIDATEUR', 'ADMINISTRATEUR']);
  const actif = db.prepare('SELECT * FROM actifs WHERE id = ?').get(req.params.id);
  if (!actif) throw new HttpError(404, 'Actif introuvable');
  if (actif.statut !== 'RETIRE') {
    throw new HttpError(400, "Cet actif n'est pas retiré (ou a été réformé définitivement)");
  }
  res.status(201).json(basculerStatut(actif, 'EN_SERVICE', 'REMISE_EN_SERVICE', user, req.body?.commentaire));
});

function basculerStatut(actif, nouveauStatut, typeMouvement, user, commentaire) {
  const avant = computeCentralePerformance(actif.centrale_id);
  db.prepare("UPDATE actifs SET statut = ?, updated_at = datetime('now') WHERE id = ?").run(nouveauStatut, actif.id);
  const apres = computeCentralePerformance(actif.centrale_id);

  const alertes = [
    {
      severite: 'basse',
      message: `"${actif.nom}" : ${actif.statut} → ${nouveauStatut}. Performance de ${avant.centrale.nom} : ${avant.performancePct}% → ${apres.performancePct}%.`,
    },
  ];

  const mouvement = insertMouvement({
    actifId: actif.id,
    actifNom: actif.nom,
    type: typeMouvement,
    centraleSource: avant.centrale,
    centraleDest: null,
    scoreSourceAvant: avant.performancePct,
    scoreSourceApres: apres.performancePct,
    nbActifsImpactes: 1,
    alertes,
    commentaire: commentaire || null,
    executeur: user,
  });

  logAudit({
    type: typeMouvement,
    description: `"${actif.nom}" : ${actif.statut} → ${nouveauStatut}`,
    acteur: user,
    cibleType: 'ACTIF',
    cibleId: actif.id,
  });

  return { actif: db.prepare('SELECT * FROM actifs WHERE id = ?').get(actif.id), mouvement };
}

function deserializeDemande(d) {
  return { ...d, simulation: JSON.parse(d.simulation) };
}
