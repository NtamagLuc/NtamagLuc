import { Router, HttpError } from '../lib/miniweb.js';
import { db } from '../db.js';
import { requireAuth, requireRole } from '../lib/auth.js';
import { simulerMiseHorsService, simulerDeplacement } from '../services/performance.js';
import { insertMouvement } from '../services/mouvements.js';
import { notifyUser, notifyRole } from '../lib/notifications.js';
import { logAudit } from '../lib/audit.js';

export const demandesRouter = new Router();

const TYPES_VALIDES = ['RETRAIT', 'DEPLACEMENT', 'REFORME'];

function simuler(type, actifId, centraleDestId) {
  if (type === 'DEPLACEMENT') return simulerDeplacement(actifId, centraleDestId);
  return simulerMiseHorsService(actifId, type);
}

function deserializeDemande(d) {
  if (!d) return d;
  return { ...d, simulation: JSON.parse(d.simulation) };
}

demandesRouter.get('/', (req, res) => {
  const user = requireAuth(req);
  const { statut, type, mine } = req.query;
  const clauses = [];
  const params = [];
  if (statut) {
    clauses.push('statut = ?');
    params.push(statut);
  }
  if (type) {
    clauses.push('type = ?');
    params.push(type);
  }
  if (mine === 'true') {
    clauses.push('demandeur_id = ?');
    params.push(user.id);
  }
  let query = 'SELECT * FROM demandes';
  if (clauses.length) query += ' WHERE ' + clauses.join(' AND ');
  query += ' ORDER BY created_at DESC';
  const rows = db.prepare(query).all(...params);
  res.json(rows.map(deserializeDemande));
});

demandesRouter.post('/preview', (req, res) => {
  requireAuth(req);
  const { type, actifId, centraleDestId } = req.body;
  if (!TYPES_VALIDES.includes(type)) {
    throw new HttpError(400, `Type de demande invalide (attendu : ${TYPES_VALIDES.join(', ')})`);
  }
  if (!actifId) throw new HttpError(400, 'actifId est requis');
  if (type === 'DEPLACEMENT' && !centraleDestId) {
    throw new HttpError(400, 'centraleDestId est requis pour une demande de déplacement');
  }
  res.json(simuler(type, actifId, centraleDestId));
});

demandesRouter.post('/', (req, res) => {
  const user = requireAuth(req);
  const { type, actifId, centraleDestId, motif } = req.body;

  if (!TYPES_VALIDES.includes(type)) {
    throw new HttpError(400, `Type de demande invalide (attendu : ${TYPES_VALIDES.join(', ')})`);
  }
  if (!actifId) throw new HttpError(400, 'actifId est requis');
  if (type === 'DEPLACEMENT' && !centraleDestId) {
    throw new HttpError(400, 'centraleDestId est requis pour une demande de déplacement');
  }

  const actif = db.prepare('SELECT * FROM actifs WHERE id = ?').get(actifId);
  if (!actif) throw new HttpError(404, 'Actif introuvable');
  if (actif.statut === 'REFORME') {
    throw new HttpError(409, 'Cet actif est réformé, aucune nouvelle demande ne peut le concerner');
  }
  if ((type === 'RETRAIT') && actif.statut === 'RETIRE') {
    throw new HttpError(409, 'Cet actif est déjà retiré');
  }

  const enCours = db
    .prepare(`SELECT COUNT(*) AS n FROM demandes WHERE actif_id = ? AND statut IN ('EN_ATTENTE', 'VALIDEE')`)
    .get(actifId).n;
  if (enCours > 0) {
    throw new HttpError(409, 'Une demande est déjà en cours (en attente ou validée) pour cet actif');
  }

  const simulation = simuler(type, actifId, centraleDestId);

  const info = db
    .prepare(
      `INSERT INTO demandes (
        type, actif_id, actif_nom, centrale_source_id, centrale_source_nom,
        centrale_dest_id, centrale_dest_nom, statut, motif, simulation,
        demandeur_id, demandeur_nom
      ) VALUES (?, ?, ?, ?, ?, ?, ?, 'EN_ATTENTE', ?, ?, ?, ?)`
    )
    .run(
      type,
      actif.id,
      actif.nom,
      simulation.centraleSource.id,
      simulation.centraleSource.nom,
      simulation.centraleDest?.id ?? null,
      simulation.centraleDest?.nom ?? null,
      motif || null,
      JSON.stringify(simulation),
      user.id,
      user.nom
    );

  const demande = deserializeDemande(db.prepare('SELECT * FROM demandes WHERE id = ?').get(info.lastInsertRowid));

  const libelle = { RETRAIT: 'retrait', DEPLACEMENT: 'déplacement', REFORME: 'réforme' }[type];
  const message = `Nouvelle demande de ${libelle} pour "${actif.nom}" (par ${user.nom}) en attente de validation.`;
  notifyRole('VALIDATEUR', 'DEMANDE_CREEE', message, `#/demandes/${demande.id}`);
  notifyRole('ADMINISTRATEUR', 'DEMANDE_CREEE', message, `#/demandes/${demande.id}`);
  logAudit({
    type: 'DEMANDE_CREEE',
    description: `Demande de ${libelle} #${demande.id} créée pour "${actif.nom}"`,
    acteur: user,
    cibleType: 'DEMANDE',
    cibleId: demande.id,
  });

  res.status(201).json(demande);
});

demandesRouter.get('/:id', (req, res) => {
  requireAuth(req);
  const demande = deserializeDemande(db.prepare('SELECT * FROM demandes WHERE id = ?').get(req.params.id));
  if (!demande) return res.status(404).json({ error: 'Demande introuvable' });

  let simulationActuelle = null;
  try {
    simulationActuelle = simuler(demande.type, demande.actif_id, demande.centrale_dest_id);
  } catch {
    simulationActuelle = null; // l'actif ou la centrale cible n'existe plus / n'est plus éligible
  }

  const mouvement = db.prepare('SELECT * FROM mouvements WHERE demande_id = ?').get(demande.id);

  res.json({
    ...demande,
    simulationActuelle,
    mouvement: mouvement ? { ...mouvement, alertes: JSON.parse(mouvement.alertes) } : null,
  });
});

demandesRouter.post('/:id/annuler', (req, res) => {
  const user = requireAuth(req);
  const demande = db.prepare('SELECT * FROM demandes WHERE id = ?').get(req.params.id);
  if (!demande) throw new HttpError(404, 'Demande introuvable');
  if (demande.demandeur_id !== user.id && user.role !== 'ADMINISTRATEUR') {
    throw new HttpError(403, "Seul l'auteur de la demande (ou un administrateur) peut l'annuler");
  }
  if (demande.statut !== 'EN_ATTENTE') {
    throw new HttpError(400, 'Seule une demande en attente peut être annulée');
  }

  db.prepare("UPDATE demandes SET statut = 'ANNULEE', updated_at = datetime('now') WHERE id = ?").run(demande.id);
  logAudit({
    type: 'DEMANDE_ANNULEE',
    description: `Demande #${demande.id} (${demande.type}) annulée`,
    acteur: user,
    cibleType: 'DEMANDE',
    cibleId: demande.id,
  });
  res.json(deserializeDemande(db.prepare('SELECT * FROM demandes WHERE id = ?').get(demande.id)));
});

demandesRouter.post('/:id/valider', (req, res) => {
  const user = requireRole(req, ['VALIDATEUR', 'ADMINISTRATEUR']);
  const demande = db.prepare('SELECT * FROM demandes WHERE id = ?').get(req.params.id);
  if (!demande) throw new HttpError(404, 'Demande introuvable');
  if (demande.statut !== 'EN_ATTENTE') {
    throw new HttpError(400, 'Seule une demande en attente peut être validée');
  }

  db.prepare(
    `UPDATE demandes SET statut = 'VALIDEE', validateur_id = ?, validateur_nom = ?, commentaire_validation = ?, date_validation = datetime('now'), updated_at = datetime('now') WHERE id = ?`
  ).run(user.id, user.nom, req.body?.commentaire || null, demande.id);

  notifyUser(
    demande.demandeur_id,
    'DEMANDE_VALIDEE',
    `Votre demande de ${demande.type.toLowerCase()} pour "${demande.actif_nom}" a été validée par ${user.nom}. Elle est prête à être exécutée.`,
    `#/demandes/${demande.id}`
  );
  logAudit({
    type: 'DEMANDE_VALIDEE',
    description: `Demande #${demande.id} (${demande.type}) validée`,
    acteur: user,
    cibleType: 'DEMANDE',
    cibleId: demande.id,
  });

  res.json(deserializeDemande(db.prepare('SELECT * FROM demandes WHERE id = ?').get(demande.id)));
});

demandesRouter.post('/:id/rejeter', (req, res) => {
  const user = requireRole(req, ['VALIDATEUR', 'ADMINISTRATEUR']);
  const demande = db.prepare('SELECT * FROM demandes WHERE id = ?').get(req.params.id);
  if (!demande) throw new HttpError(404, 'Demande introuvable');
  if (demande.statut !== 'EN_ATTENTE') {
    throw new HttpError(400, 'Seule une demande en attente peut être rejetée');
  }
  if (!req.body?.commentaire) {
    throw new HttpError(400, 'Un motif de rejet est requis');
  }

  db.prepare(
    `UPDATE demandes SET statut = 'REJETEE', validateur_id = ?, validateur_nom = ?, commentaire_validation = ?, date_validation = datetime('now'), updated_at = datetime('now') WHERE id = ?`
  ).run(user.id, user.nom, req.body.commentaire, demande.id);

  notifyUser(
    demande.demandeur_id,
    'DEMANDE_REJETEE',
    `Votre demande de ${demande.type.toLowerCase()} pour "${demande.actif_nom}" a été rejetée par ${user.nom} : ${req.body.commentaire}`,
    `#/demandes/${demande.id}`
  );
  logAudit({
    type: 'DEMANDE_REJETEE',
    description: `Demande #${demande.id} (${demande.type}) rejetée : ${req.body.commentaire}`,
    acteur: user,
    cibleType: 'DEMANDE',
    cibleId: demande.id,
  });

  res.json(deserializeDemande(db.prepare('SELECT * FROM demandes WHERE id = ?').get(demande.id)));
});

demandesRouter.post('/:id/executer', (req, res) => {
  const user = requireRole(req, ['VALIDATEUR', 'ADMINISTRATEUR']);
  const demande = db.prepare('SELECT * FROM demandes WHERE id = ?').get(req.params.id);
  if (!demande) throw new HttpError(404, 'Demande introuvable');
  if (demande.statut !== 'VALIDEE') {
    throw new HttpError(400, 'Seule une demande validée peut être exécutée');
  }

  const actif = db.prepare('SELECT * FROM actifs WHERE id = ?').get(demande.actif_id);
  if (!actif) throw new HttpError(404, "L'actif de cette demande n'existe plus");
  if (actif.statut === 'REFORME') throw new HttpError(409, 'Cet actif est déjà réformé');
  if (demande.type === 'RETRAIT' && actif.statut === 'RETIRE') {
    throw new HttpError(409, 'Cet actif est déjà retiré');
  }
  if (demande.type === 'DEPLACEMENT' && actif.centrale_id === demande.centrale_dest_id) {
    throw new HttpError(409, "L'actif se trouve déjà dans la centrale de destination");
  }

  const simulation = simuler(demande.type, demande.actif_id, demande.centrale_dest_id);
  const descendantIds = simulation.descendants.map((d) => d.id);
  const placeholders = descendantIds.map(() => '?').join(',');

  if (demande.type === 'DEPLACEMENT') {
    db.prepare(
      `UPDATE actifs SET centrale_id = ?, updated_at = datetime('now') WHERE id IN (${placeholders})`
    ).run(demande.centrale_dest_id, ...descendantIds);
  } else {
    const statutCible = demande.type === 'REFORME' ? 'REFORME' : 'RETIRE';
    db.prepare(
      `UPDATE actifs SET statut = ?, updated_at = datetime('now') WHERE id IN (${placeholders})`
    ).run(statutCible, ...descendantIds);
  }

  const mouvement = insertMouvement({
    demandeId: demande.id,
    actifId: simulation.actif.id,
    actifNom: simulation.actif.nom,
    type: demande.type,
    centraleSource: simulation.centraleSource,
    centraleDest: simulation.centraleDest,
    scoreSourceAvant: simulation.scoreSourceAvant,
    scoreSourceApres: simulation.scoreSourceApres,
    scoreDestAvant: simulation.scoreDestAvant,
    scoreDestApres: simulation.scoreDestApres,
    nbActifsImpactes: simulation.descendants.length,
    alertes: simulation.alertes,
    commentaire: demande.motif,
    executeur: user,
  });

  db.prepare(
    `UPDATE demandes SET statut = 'EXECUTEE', date_execution = datetime('now'), updated_at = datetime('now') WHERE id = ?`
  ).run(demande.id);

  notifyUser(
    demande.demandeur_id,
    'DEMANDE_EXECUTEE',
    `Votre demande de ${demande.type.toLowerCase()} pour "${demande.actif_nom}" a été exécutée par ${user.nom}.`,
    `#/demandes/${demande.id}`
  );
  logAudit({
    type: 'DEMANDE_EXECUTEE',
    description: `Demande #${demande.id} (${demande.type}) exécutée`,
    acteur: user,
    cibleType: 'DEMANDE',
    cibleId: demande.id,
  });

  res.json({ demande: deserializeDemande(db.prepare('SELECT * FROM demandes WHERE id = ?').get(demande.id)), mouvement });
});
