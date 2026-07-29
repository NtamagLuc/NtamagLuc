import { Router, HttpError } from '../lib/miniweb.js';
import { db } from '../db.js';
import {
  simulerRetrait,
  simulerDeplacement,
  computeCentralePerformance,
} from '../services/performance.js';

export const actifsRouter = new Router();

actifsRouter.get('/', (req, res) => {
  const { centraleId } = req.query;
  const actifs = centraleId
    ? db.prepare('SELECT * FROM actifs WHERE centrale_id = ? ORDER BY nom').all(centraleId)
    : db.prepare('SELECT * FROM actifs ORDER BY nom').all();
  res.json(actifs);
});

actifsRouter.post('/', (req, res) => {
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
  res.status(201).json(actif);
});

actifsRouter.get('/:id', (req, res) => {
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
  res.json({ ...actif, enfants, parent, historique });
});

actifsRouter.put('/:id', (req, res) => {
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
  res.json(db.prepare('SELECT * FROM actifs WHERE id = ?').get(actif.id));
});

actifsRouter.delete('/:id', (req, res) => {
  const actif = db.prepare('SELECT * FROM actifs WHERE id = ?').get(req.params.id);
  if (!actif) return res.status(404).json({ error: 'Actif introuvable' });
  const nbEnfants = db.prepare('SELECT COUNT(*) AS n FROM actifs WHERE parent_id = ?').get(actif.id).n;
  if (nbEnfants > 0) {
    return res.status(400).json({ error: "Impossible de supprimer un actif qui possède des actifs enfants" });
  }
  db.prepare('DELETE FROM actifs WHERE id = ?').run(actif.id);
  res.status(204).end();
});

// --- Simulation & exécution du retrait ---

actifsRouter.post('/:id/preview-retrait', (req, res) => {
  res.json(simulerRetrait(req.params.id));
});

actifsRouter.post('/:id/retrait', (req, res) => {
  const simulation = simulerRetrait(req.params.id);
  const descendantIds = simulation.descendants.map((d) => d.id);
  const placeholders = descendantIds.map(() => '?').join(',');
  db.prepare(`UPDATE actifs SET statut = 'RETIRE', updated_at = datetime('now') WHERE id IN (${placeholders})`).run(
    ...descendantIds
  );

  const mouvement = insertMouvement({
    actifId: simulation.actif.id,
    actifNom: simulation.actif.nom,
    type: 'RETRAIT',
    centraleSource: simulation.centraleSource,
    centraleDest: null,
    scoreSourceAvant: simulation.scoreSourceAvant,
    scoreSourceApres: simulation.scoreSourceApres,
    scoreDestAvant: null,
    scoreDestApres: null,
    nbActifsImpactes: simulation.descendants.length,
    alertes: simulation.alertes,
    commentaire: req.body?.commentaire || null,
  });

  res.status(201).json({ ...simulation, mouvement });
});

actifsRouter.post('/:id/remise-en-service', (req, res) => {
  const actif = db.prepare('SELECT * FROM actifs WHERE id = ?').get(req.params.id);
  if (!actif) throw new HttpError(404, 'Actif introuvable');
  if (actif.statut !== 'RETIRE') {
    throw new HttpError(400, "Cet actif n'est pas retiré");
  }

  const avant = computeCentralePerformance(actif.centrale_id);
  db.prepare("UPDATE actifs SET statut = 'EN_SERVICE', updated_at = datetime('now') WHERE id = ?").run(actif.id);
  const apres = computeCentralePerformance(actif.centrale_id);

  const alertes = [
    {
      severite: 'basse',
      message: `"${actif.nom}" remis en service. Performance de ${avant.centrale.nom} : ${avant.performancePct}% → ${apres.performancePct}%.`,
    },
  ];

  const mouvement = insertMouvement({
    actifId: actif.id,
    actifNom: actif.nom,
    type: 'REMISE_EN_SERVICE',
    centraleSource: avant.centrale,
    centraleDest: null,
    scoreSourceAvant: avant.performancePct,
    scoreSourceApres: apres.performancePct,
    scoreDestAvant: null,
    scoreDestApres: null,
    nbActifsImpactes: 1,
    alertes,
    commentaire: req.body?.commentaire || null,
  });

  res.status(201).json({ actif: db.prepare('SELECT * FROM actifs WHERE id = ?').get(actif.id), mouvement });
});

// --- Simulation & exécution du déplacement ---

actifsRouter.post('/:id/preview-deplacement', (req, res) => {
  const { centraleDestId } = req.body;
  if (!centraleDestId) return res.status(400).json({ error: 'centraleDestId est requis' });
  res.json(simulerDeplacement(req.params.id, centraleDestId));
});

actifsRouter.post('/:id/deplacement', (req, res) => {
  const { centraleDestId, commentaire } = req.body;
  if (!centraleDestId) return res.status(400).json({ error: 'centraleDestId est requis' });

  const simulation = simulerDeplacement(req.params.id, centraleDestId);
  const descendantIds = simulation.descendants.map((d) => d.id);
  const placeholders = descendantIds.map(() => '?').join(',');
  db.prepare(
    `UPDATE actifs SET centrale_id = ?, updated_at = datetime('now') WHERE id IN (${placeholders})`
  ).run(centraleDestId, ...descendantIds);

  const mouvement = insertMouvement({
    actifId: simulation.actif.id,
    actifNom: simulation.actif.nom,
    type: 'DEPLACEMENT',
    centraleSource: simulation.centraleSource,
    centraleDest: simulation.centraleDest,
    scoreSourceAvant: simulation.scoreSourceAvant,
    scoreSourceApres: simulation.scoreSourceApres,
    scoreDestAvant: simulation.scoreDestAvant,
    scoreDestApres: simulation.scoreDestApres,
    nbActifsImpactes: simulation.descendants.length,
    alertes: simulation.alertes,
    commentaire: commentaire || null,
  });

  res.status(201).json({ ...simulation, mouvement });
});

function insertMouvement({
  actifId,
  actifNom,
  type,
  centraleSource,
  centraleDest,
  scoreSourceAvant,
  scoreSourceApres,
  scoreDestAvant,
  scoreDestApres,
  nbActifsImpactes,
  alertes,
  commentaire,
}) {
  const info = db
    .prepare(
      `INSERT INTO mouvements (
        actif_id, actif_nom, type,
        centrale_source_id, centrale_source_nom,
        centrale_dest_id, centrale_dest_nom,
        score_source_avant, score_source_apres,
        score_dest_avant, score_dest_apres,
        nb_actifs_impactes, alertes, commentaire
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    )
    .run(
      actifId,
      actifNom,
      type,
      centraleSource?.id ?? null,
      centraleSource?.nom ?? null,
      centraleDest?.id ?? null,
      centraleDest?.nom ?? null,
      scoreSourceAvant,
      scoreSourceApres,
      scoreDestAvant,
      scoreDestApres,
      nbActifsImpactes,
      JSON.stringify(alertes),
      commentaire
    );
  return deserializeMouvement(
    db.prepare('SELECT * FROM mouvements WHERE id = ?').get(info.lastInsertRowid)
  );
}

function deserializeMouvement(m) {
  if (!m) return m;
  return { ...m, alertes: JSON.parse(m.alertes) };
}
