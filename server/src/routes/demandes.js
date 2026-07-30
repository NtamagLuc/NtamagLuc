import { Router, HttpError } from '../lib/miniweb.js';
import { db, withTransaction } from '../db.js';
import { requireAuth, requireRole, ROLES_DEMANDEUR, ROLES_VALIDATION, ROLES_EXECUTION } from '../lib/auth.js';
import {
  simulerMiseHorsOuEnService,
  simulerDeplacement,
  getActifAvecDescendants,
  classerNiveauImpact,
  scoreFromActifs,
  getCentraleActifs,
} from '../services/performance.js';
import { insertMouvement } from '../services/mouvements.js';
import { notifyUser, notifyRole } from '../lib/notifications.js';
import { logAudit } from '../lib/audit.js';

export const demandesRouter = new Router();

const TYPES_VALIDES = ['RETRAIT', 'DEPLACEMENT', 'DECOMMISSIONNEMENT', 'REMISE_EN_SERVICE'];
const ETATS_CIBLES_VALIDES = ['DECOMMISSIONNE', 'REFORME'];
const LIBELLES = {
  RETRAIT: 'retrait',
  DEPLACEMENT: 'déplacement',
  DECOMMISSIONNEMENT: 'décommissionnement',
  REMISE_EN_SERVICE: 'remise en service',
};
const EPSILON = 0.01;

function round2(n) {
  return Math.round(n * 100) / 100;
}

function simuler(type, actifId, { centraleDestId, etatCible, avecHierarchie } = {}) {
  if (type === 'DEPLACEMENT') return simulerDeplacement(actifId, centraleDestId, { avecHierarchie });
  return simulerMiseHorsOuEnService(actifId, type, { etatCible });
}

function deserializeDemande(d) {
  if (!d) return d;
  return { ...d, simulation: JSON.parse(d.simulation), deplacer_hierarchie: !!d.deplacer_hierarchie };
}

function verifierEligibilite(type, actif) {
  if (type === 'RETRAIT' && !['EN_SERVICE', 'EN_MAINTENANCE', 'EN_REPARATION'].includes(actif.statut)) {
    throw new HttpError(409, `"${actif.nom}" n'est pas actuellement en service, il ne peut pas faire l'objet d'un retrait.`);
  }
  if (type === 'DECOMMISSIONNEMENT' && ['DECOMMISSIONNE', 'REFORME'].includes(actif.statut)) {
    throw new HttpError(409, `"${actif.nom}" est déjà décommissionné/réformé.`);
  }
  if (type === 'REMISE_EN_SERVICE' && actif.statut !== 'HORS_SERVICE') {
    throw new HttpError(409, `Seul un actif hors service peut faire l'objet d'une remise en service (statut actuel : ${actif.statut}).`);
  }
  if (type === 'DEPLACEMENT' && ['DECOMMISSIONNE', 'REFORME', 'EN_TRANSFERT'].includes(actif.statut)) {
    throw new HttpError(409, `"${actif.nom}" ne peut pas être déplacé dans son état actuel (${actif.statut}).`);
  }
}

demandesRouter.get('/', (req, res) => {
  const user = requireAuth(req);
  const { statut, type, mine, actifId, centraleId } = req.query;
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
  if (actifId) {
    clauses.push('actif_id = ?');
    params.push(actifId);
  }
  if (centraleId) {
    clauses.push('(centrale_source_id = ? OR centrale_dest_id = ?)');
    params.push(centraleId, centraleId);
  }
  let query = 'SELECT * FROM demandes';
  if (clauses.length) query += ' WHERE ' + clauses.join(' AND ');
  query += ' ORDER BY created_at DESC';
  const rows = db.prepare(query).all(...params);
  res.json(rows.map(deserializeDemande));
});

demandesRouter.post('/preview', (req, res) => {
  requireAuth(req);
  const { type, actifId, centraleDestId, etatCible, avecHierarchie } = req.body;
  if (!TYPES_VALIDES.includes(type)) {
    throw new HttpError(400, `Type de demande invalide (attendu : ${TYPES_VALIDES.join(', ')})`);
  }
  if (!actifId) throw new HttpError(400, 'actifId est requis');
  if (type === 'DEPLACEMENT' && !centraleDestId) {
    throw new HttpError(400, 'centraleDestId est requis pour une demande de déplacement');
  }
  if (type === 'DECOMMISSIONNEMENT' && etatCible && !ETATS_CIBLES_VALIDES.includes(etatCible)) {
    throw new HttpError(400, `etatCible invalide (attendu : ${ETATS_CIBLES_VALIDES.join(', ')})`);
  }
  res.json(simuler(type, actifId, { centraleDestId, etatCible, avecHierarchie: avecHierarchie !== false }));
});

demandesRouter.post('/', (req, res) => {
  const user = requireRole(req, ROLES_DEMANDEUR);
  const { type, actifId, centraleDestId, etatCible, avecHierarchie, motif, datePrevue } = req.body;

  if (!TYPES_VALIDES.includes(type)) {
    throw new HttpError(400, `Type de demande invalide (attendu : ${TYPES_VALIDES.join(', ')})`);
  }
  if (!actifId) throw new HttpError(400, 'actifId est requis');
  if (!motif) throw new HttpError(400, 'Le motif de la demande est requis');
  if (type === 'DEPLACEMENT' && !centraleDestId) {
    throw new HttpError(400, 'centraleDestId est requis pour une demande de déplacement');
  }
  if (type === 'DECOMMISSIONNEMENT' && etatCible && !ETATS_CIBLES_VALIDES.includes(etatCible)) {
    throw new HttpError(400, `etatCible invalide (attendu : ${ETATS_CIBLES_VALIDES.join(', ')})`);
  }

  const actif = db.prepare('SELECT * FROM actifs WHERE id = ?').get(actifId);
  if (!actif) throw new HttpError(404, 'Actif introuvable');
  verifierEligibilite(type, actif);

  const enCours = db
    .prepare(`SELECT COUNT(*) AS n FROM demandes WHERE actif_id = ? AND statut IN ('EN_ATTENTE', 'APPROUVEE')`)
    .get(actifId).n;
  if (enCours > 0) {
    throw new HttpError(409, 'Une demande est déjà en cours (en attente ou approuvée) pour cet actif');
  }

  const hierarchie = avecHierarchie !== false;
  const etatCibleFinal = type === 'DECOMMISSIONNEMENT' ? etatCible || 'DECOMMISSIONNE' : null;
  const simulation = simuler(type, actifId, { centraleDestId, etatCible: etatCibleFinal, avecHierarchie: hierarchie });

  const info = db
    .prepare(
      `INSERT INTO demandes (
        type, etat_cible, deplacer_hierarchie, actif_id, actif_nom, centrale_source_id, centrale_source_nom,
        centrale_dest_id, centrale_dest_nom, statut, motif, date_prevue, simulation, niveau_impact,
        demandeur_id, demandeur_nom
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'EN_ATTENTE', ?, ?, ?, ?, ?, ?)`
    )
    .run(
      type,
      etatCibleFinal,
      hierarchie ? 1 : 0,
      actif.id,
      actif.nom,
      simulation.centraleSource.id,
      simulation.centraleSource.nom,
      simulation.centraleDest?.id ?? null,
      simulation.centraleDest?.nom ?? null,
      motif,
      datePrevue || null,
      JSON.stringify(simulation),
      simulation.niveauImpact,
      user.id,
      user.nom
    );

  const demande = deserializeDemande(db.prepare('SELECT * FROM demandes WHERE id = ?').get(info.lastInsertRowid));

  const libelle = LIBELLES[type];
  const suffixe = simulation.niveauImpact === 'CRITIQUE' ? ' [IMPACT CRITIQUE — validation Administrateur requise]' : '';
  const message = `Nouvelle demande de ${libelle} pour "${actif.nom}" (par ${user.nom}) en attente de validation.${suffixe}`;
  notifyRole('VALIDATEUR', 'DEMANDE_CREEE', message, `#/demandes/${demande.id}`);
  notifyRole('ADMINISTRATEUR', 'DEMANDE_CREEE', message, `#/demandes/${demande.id}`);
  logAudit({
    type: 'DEMANDE_CREEE',
    description: `Demande de ${libelle} #${demande.id} créée pour "${actif.nom}" (impact estimé : ${simulation.niveauImpact})`,
    acteur: user,
    cibleType: 'DEMANDE',
    cibleId: demande.id,
    centraleId: actif.centrale_id,
  });

  res.status(201).json(demande);
});

demandesRouter.get('/:id', (req, res) => {
  requireAuth(req);
  const demande = deserializeDemande(db.prepare('SELECT * FROM demandes WHERE id = ?').get(req.params.id));
  if (!demande) return res.status(404).json({ error: 'Demande introuvable' });

  let simulationActuelle = null;
  let estObsolete = false;
  try {
    simulationActuelle = simuler(demande.type, demande.actif_id, {
      centraleDestId: demande.centrale_dest_id,
      etatCible: demande.etat_cible,
      avecHierarchie: demande.deplacer_hierarchie,
    });
    estObsolete =
      ['EN_ATTENTE', 'APPROUVEE'].includes(demande.statut) &&
      estSimulationObsolete(demande, simulationActuelle, demande.statut === 'APPROUVEE' ? 'execution' : 'validation');
  } catch {
    simulationActuelle = null;
    estObsolete = ['EN_ATTENTE', 'APPROUVEE'].includes(demande.statut);
  }

  const mouvement = db.prepare('SELECT * FROM mouvements WHERE demande_id = ?').get(demande.id);

  res.json({
    ...demande,
    simulationActuelle,
    estObsolete,
    mouvement: mouvement ? { ...mouvement, alertes: JSON.parse(mouvement.alertes) } : null,
  });
});

// Détecte si la situation a changé depuis le calcul de la simulation stockée sur la demande.
//
// Cas particulier du déplacement : l'approbation fait passer l'actif à l'état EN_TRANSFERT
// (poids de performance nul), ce qui modifierait artificiellement la "situation avant" côté
// source si on la recomparait telle quelle. Au stade "execution", on ne compare donc que la
// situation de la centrale de destination (non touchée par notre propre mutation d'état).
function estSimulationObsolete(demande, simulationActuelle, stade = 'validation') {
  const stockee = demande.simulation;

  if (demande.type === 'DEPLACEMENT' && stade === 'execution') {
    return Math.abs((stockee.scoreDestAvant ?? 0) - (simulationActuelle.scoreDestAvant ?? 0)) > EPSILON;
  }

  if (Math.abs(stockee.scoreSourceAvant - simulationActuelle.scoreSourceAvant) > EPSILON) return true;
  if (demande.type === 'DEPLACEMENT' && Math.abs((stockee.scoreDestAvant ?? 0) - (simulationActuelle.scoreDestAvant ?? 0)) > EPSILON) {
    return true;
  }
  return false;
}

demandesRouter.post('/:id/annuler', (req, res) => {
  const user = requireAuth(req);
  const demande = db.prepare('SELECT * FROM demandes WHERE id = ?').get(req.params.id);
  if (!demande) throw new HttpError(404, 'Demande introuvable');
  if (demande.demandeur_id !== user.id && user.role !== 'ADMINISTRATEUR') {
    throw new HttpError(403, "Seul l'auteur de la demande (ou un administrateur) peut l'annuler");
  }
  if (!['EN_ATTENTE', 'APPROUVEE'].includes(demande.statut)) {
    throw new HttpError(400, 'Cette demande a déjà été exécutée, rejetée ou annulée');
  }
  if (!req.body?.motif) throw new HttpError(400, "Le motif de l'annulation est requis");

  withTransaction(() => {
    if (demande.statut === 'APPROUVEE' && demande.type === 'DEPLACEMENT') {
      restaurerEtatAvantTransfert(demande);
    }
    db.prepare("UPDATE demandes SET statut = 'ANNULEE', updated_at = datetime('now') WHERE id = ?").run(demande.id);
  });

  logAudit({
    type: 'DEMANDE_ANNULEE',
    description: `Demande #${demande.id} (${demande.type}) annulée : ${req.body.motif}`,
    acteur: user,
    cibleType: 'DEMANDE',
    cibleId: demande.id,
    centraleId: demande.centrale_source_id,
  });
  res.json(deserializeDemande(db.prepare('SELECT * FROM demandes WHERE id = ?').get(demande.id)));
});

demandesRouter.post('/:id/relancer-simulation', (req, res) => {
  const user = requireAuth(req);
  const demande = db.prepare('SELECT * FROM demandes WHERE id = ?').get(req.params.id);
  if (!demande) throw new HttpError(404, 'Demande introuvable');
  if (demande.demandeur_id !== user.id && !ROLES_VALIDATION.includes(user.role)) {
    throw new HttpError(403, "Seul l'auteur de la demande ou un validateur peut relancer la simulation");
  }
  if (!['EN_ATTENTE', 'APPROUVEE'].includes(demande.statut)) {
    throw new HttpError(400, 'Cette demande ne peut plus être resimulée (déjà exécutée, rejetée ou annulée)');
  }

  withTransaction(() => {
    if (demande.statut === 'APPROUVEE' && demande.type === 'DEPLACEMENT') {
      restaurerEtatAvantTransfert(demande);
    }
  });

  const simulation = simuler(demande.type, demande.actif_id, {
    centraleDestId: demande.centrale_dest_id,
    etatCible: demande.etat_cible,
    avecHierarchie: demande.deplacer_hierarchie,
  });

  db.prepare(
    `UPDATE demandes SET statut = 'EN_ATTENTE', simulation = ?, niveau_impact = ?, simulation_obsolete = 0,
     validateur_id = NULL, validateur_nom = NULL, commentaire_validation = NULL, date_validation = NULL,
     updated_at = datetime('now') WHERE id = ?`
  ).run(JSON.stringify(simulation), simulation.niveauImpact, demande.id);

  notifyRole('VALIDATEUR', 'SIMULATION_RELANCEE', `La simulation de la demande #${demande.id} (${LIBELLES[demande.type]} — "${demande.actif_nom}") a été actualisée et nécessite une nouvelle validation.`, `#/demandes/${demande.id}`);
  logAudit({
    type: 'SIMULATION_RELANCEE',
    description: `Simulation de la demande #${demande.id} relancée, retour au statut EN_ATTENTE`,
    acteur: user,
    cibleType: 'DEMANDE',
    cibleId: demande.id,
    centraleId: demande.centrale_source_id,
  });

  res.json(deserializeDemande(db.prepare('SELECT * FROM demandes WHERE id = ?').get(demande.id)));
});

demandesRouter.post('/:id/valider', (req, res) => {
  const user = requireRole(req, ROLES_VALIDATION);
  const demande = db.prepare('SELECT * FROM demandes WHERE id = ?').get(req.params.id);
  if (!demande) throw new HttpError(404, 'Demande introuvable');
  if (demande.statut !== 'EN_ATTENTE') {
    throw new HttpError(400, 'Seule une demande en attente peut être approuvée');
  }
  if (demande.demandeur_id === user.id) {
    throw new HttpError(403, 'Vous ne pouvez pas valider votre propre demande');
  }
  if (demande.niveau_impact === 'CRITIQUE' && user.role !== 'ADMINISTRATEUR') {
    throw new HttpError(403, "Cette demande a un niveau d'impact critique : seul un Administrateur peut l'approuver");
  }

  const simulationActuelle = simuler(demande.type, demande.actif_id, {
    centraleDestId: demande.centrale_dest_id,
    etatCible: demande.etat_cible,
    avecHierarchie: demande.deplacer_hierarchie,
  });
  if (estSimulationObsolete(deserializeDemande(demande), simulationActuelle)) {
    db.prepare('UPDATE demandes SET simulation_obsolete = 1 WHERE id = ?').run(demande.id);
    throw new HttpError(409, "La situation a changé depuis la création de la demande : la simulation est obsolète. Relancez la simulation avant de valider.");
  }

  withTransaction(() => {
    db.prepare(
      `UPDATE demandes SET statut = 'APPROUVEE', validateur_id = ?, validateur_nom = ?, commentaire_validation = ?, date_validation = datetime('now'), updated_at = datetime('now') WHERE id = ?`
    ).run(user.id, user.nom, req.body?.commentaire || null, demande.id);

    if (demande.type === 'DEPLACEMENT') {
      const descendants = deserializeDemande(demande).deplacer_hierarchie
        ? simulationActuelle.descendants
        : [simulationActuelle.actif];
      for (const a of descendants) {
        db.prepare("UPDATE actifs SET etat_avant_transfert = ?, statut = 'EN_TRANSFERT', updated_at = datetime('now') WHERE id = ?").run(a.statut, a.id);
      }
    }
  });

  notifyUser(
    demande.demandeur_id,
    'DEMANDE_APPROUVEE',
    `Votre demande de ${LIBELLES[demande.type]} pour "${demande.actif_nom}" a été approuvée par ${user.nom}. Elle est prête à être exécutée.`,
    `#/demandes/${demande.id}`
  );
  logAudit({
    type: 'DEMANDE_APPROUVEE',
    description: `Demande #${demande.id} (${demande.type}) approuvée`,
    acteur: user,
    cibleType: 'DEMANDE',
    cibleId: demande.id,
    centraleId: demande.centrale_source_id,
  });

  res.json(deserializeDemande(db.prepare('SELECT * FROM demandes WHERE id = ?').get(demande.id)));
});

demandesRouter.post('/:id/rejeter', (req, res) => {
  const user = requireRole(req, ROLES_VALIDATION);
  const demande = db.prepare('SELECT * FROM demandes WHERE id = ?').get(req.params.id);
  if (!demande) throw new HttpError(404, 'Demande introuvable');
  if (demande.statut !== 'EN_ATTENTE') {
    throw new HttpError(400, 'Seule une demande en attente peut être rejetée');
  }
  if (demande.demandeur_id === user.id) {
    throw new HttpError(403, 'Vous ne pouvez pas rejeter votre propre demande');
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
    `Votre demande de ${LIBELLES[demande.type]} pour "${demande.actif_nom}" a été rejetée par ${user.nom} : ${req.body.commentaire}`,
    `#/demandes/${demande.id}`
  );
  logAudit({
    type: 'DEMANDE_REJETEE',
    description: `Demande #${demande.id} (${demande.type}) rejetée : ${req.body.commentaire}`,
    acteur: user,
    cibleType: 'DEMANDE',
    cibleId: demande.id,
    centraleId: demande.centrale_source_id,
  });

  res.json(deserializeDemande(db.prepare('SELECT * FROM demandes WHERE id = ?').get(demande.id)));
});

demandesRouter.post('/:id/executer', (req, res) => {
  const user = requireRole(req, ROLES_EXECUTION);
  const demandeRaw = db.prepare('SELECT * FROM demandes WHERE id = ?').get(req.params.id);
  if (!demandeRaw) throw new HttpError(404, 'Demande introuvable');
  const demande = deserializeDemande(demandeRaw);
  if (demande.statut !== 'APPROUVEE') {
    throw new HttpError(400, 'Seule une demande approuvée peut être exécutée');
  }

  const actif = db.prepare('SELECT * FROM actifs WHERE id = ?').get(demande.actif_id);
  if (!actif) throw new HttpError(404, "L'actif de cette demande n'existe plus");

  const simulationActuelle = simuler(demande.type, demande.actif_id, {
    centraleDestId: demande.centrale_dest_id,
    etatCible: demande.etat_cible,
    avecHierarchie: demande.deplacer_hierarchie,
  });
  if (estSimulationObsolete(demande, simulationActuelle, 'execution')) {
    db.prepare('UPDATE demandes SET simulation_obsolete = 1 WHERE id = ?').run(demande.id);
    throw new HttpError(409, "La situation a changé depuis la validation : la simulation est obsolète. Relancez la simulation (ce qui annulera l'approbation en cours et nécessitera une nouvelle validation) avant de réexécuter.");
  }

  const descendants = demande.deplacer_hierarchie || demande.type !== 'DEPLACEMENT'
    ? simulationActuelle.descendants
    : [simulationActuelle.actif];
  const descendantIds = descendants.map((d) => d.id);
  const placeholders = descendantIds.map(() => '?').join(',');

  // Pour un déplacement, l'actif a été placé en EN_TRANSFERT (poids de performance nul) dès
  // l'approbation. Un recalcul en direct à ce stade sous-évaluerait donc à la fois la situation
  // "avant" côté source (l'actif y apparaît déjà à poids nul) et la situation "après" côté
  // destination (les descendants transférés y apparaissent aussi à poids nul). On réutilise le
  // score source de la simulation d'origine (toujours valide, vérifié ci-dessus au stade
  // execution), et on recalcule le score destination "après" en substituant à chaque actif
  // transféré son état d'avant transfert.
  let scoreSourceAvant = simulationActuelle.scoreSourceAvant;
  let scoreSourceApres = simulationActuelle.scoreSourceApres;
  let scoreDestApres = simulationActuelle.scoreDestApres;
  let niveauImpact = simulationActuelle.niveauImpact;

  if (demande.type === 'DEPLACEMENT') {
    scoreSourceAvant = demande.simulation.scoreSourceAvant;
    scoreSourceApres = demande.simulation.scoreSourceApres;

    const actifsDestActuels = getCentraleActifs(simulationActuelle.centraleDest.id);
    const descendantsEtatRestaure = descendants.map((d) => ({ ...d, statut: d.etat_avant_transfert || 'EN_SERVICE' }));
    scoreDestApres = scoreFromActifs(
      [...actifsDestActuels, ...descendantsEtatRestaure],
      simulationActuelle.centraleDest.capacite_nominale_mw
    ).performancePct;

    niveauImpact = classerNiveauImpact(
      Math.max(
        Math.abs(round2(scoreSourceAvant - scoreSourceApres)),
        Math.abs(round2(simulationActuelle.scoreDestAvant - scoreDestApres))
      )
    );
  }

  const mouvement = withTransaction(() => {
    if (demande.type === 'DEPLACEMENT') {
      db.prepare(
        `UPDATE actifs SET centrale_id = ?, statut = COALESCE(etat_avant_transfert, 'EN_SERVICE'), etat_avant_transfert = NULL, updated_at = datetime('now') WHERE id IN (${placeholders})`
      ).run(demande.centrale_dest_id, ...descendantIds);
    } else if (demande.type === 'REMISE_EN_SERVICE') {
      db.prepare("UPDATE actifs SET statut = 'EN_SERVICE', updated_at = datetime('now') WHERE id = ?").run(actif.id);
    } else {
      const statutCible = demande.type === 'DECOMMISSIONNEMENT' ? demande.etat_cible || 'DECOMMISSIONNE' : 'HORS_SERVICE';
      db.prepare(
        `UPDATE actifs SET statut = ?, updated_at = datetime('now') WHERE id IN (${placeholders})`
      ).run(statutCible, ...descendantIds);
    }

    const m = insertMouvement({
      demandeId: demande.id,
      actifId: simulationActuelle.actif.id,
      actifNom: simulationActuelle.actif.nom,
      type: demande.type,
      centraleSource: simulationActuelle.centraleSource,
      centraleDest: simulationActuelle.centraleDest,
      scoreSourceAvant,
      scoreSourceApres,
      scoreDestAvant: simulationActuelle.scoreDestAvant,
      scoreDestApres,
      nbActifsImpactes: descendants.length,
      niveauImpact,
      alertes: simulationActuelle.alertes,
      commentaire: demande.motif,
      executeur: user,
    });

    db.prepare(
      `UPDATE demandes SET statut = 'EXECUTEE', date_execution = datetime('now'), updated_at = datetime('now') WHERE id = ?`
    ).run(demande.id);

    return m;
  });

  notifyUser(
    demande.demandeur_id,
    'DEMANDE_EXECUTEE',
    `Votre demande de ${LIBELLES[demande.type]} pour "${demande.actif_nom}" a été exécutée par ${user.nom}. Performances recalculées.`,
    `#/demandes/${demande.id}`
  );
  logAudit({
    type: 'DEMANDE_EXECUTEE',
    description: `Demande #${demande.id} (${demande.type}) exécutée`,
    acteur: user,
    cibleType: 'DEMANDE',
    cibleId: demande.id,
    centraleId: demande.centrale_source_id,
  });

  res.json({ demande: deserializeDemande(db.prepare('SELECT * FROM demandes WHERE id = ?').get(demande.id)), mouvement });
});

function restaurerEtatAvantTransfert(demande) {
  const descendants = getActifAvecDescendants(demande.actif_id);
  for (const a of descendants) {
    if (a.statut === 'EN_TRANSFERT' && a.etat_avant_transfert) {
      db.prepare("UPDATE actifs SET statut = ?, etat_avant_transfert = NULL, updated_at = datetime('now') WHERE id = ?").run(a.etat_avant_transfert, a.id);
    }
  }
}
