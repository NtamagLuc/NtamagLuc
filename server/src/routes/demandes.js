import { Router, HttpError } from '../lib/miniweb.js';
import { db, withTransaction } from '../db.js';
import {
  requireAuth,
  requireRole,
  ROLES_DEMANDEUR,
  ROLES_EXPLOITATION,
  ROLES_APPROBATION_FINALE,
  centraleScopeId,
  requireCentraleAccess,
} from '../lib/auth.js';
import { simulerMiseHorsOuEnService, simulerDeplacement } from '../services/performance.js';
import { insertMouvement } from '../services/mouvements.js';
import { notifyUser, notifyRole, notifyRoleCentrale } from '../lib/notifications.js';
import { logAudit } from '../lib/audit.js';
import { REGIONS_ELECTRIQUES } from '../lib/regions.js';

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
  if (type === 'DEPLACEMENT' && ['DECOMMISSIONNE', 'REFORME'].includes(actif.statut)) {
    throw new HttpError(409, `"${actif.nom}" ne peut pas être déplacé dans son état actuel (${actif.statut}).`);
  }
}

function estSimulationObsolete(demande, simulationActuelle) {
  const stockee = demande.simulation;
  if (Math.abs(stockee.scoreSourceAvant - simulationActuelle.scoreSourceAvant) > EPSILON) return true;
  if (demande.type === 'DEPLACEMENT' && Math.abs((stockee.scoreDestAvant ?? 0) - (simulationActuelle.scoreDestAvant ?? 0)) > EPSILON) {
    return true;
  }
  return false;
}

// Code de référence officiel d'une DDR (Demande De Retrait), au format
// DDR_AA/JJ/MM/YY/ZZ-nom de la centrale : AA = code de la région électrique de la
// centrale, JJ/MM/YY = date de validation (transmission) par le chargé d'exploitation,
// ZZ = numéro d'ordre dans le mois pour cette région (repart de 1 à chaque nouveau mois).
// Généré une seule fois, au moment de la transmission, puis figé sur la demande.
function genererCodeReferenceDDR(centraleId, centraleNom) {
  const centrale = db.prepare('SELECT region_electrique FROM centrales WHERE id = ?').get(centraleId);
  const regionInfo = REGIONS_ELECTRIQUES.find((r) => r.sigle === centrale?.region_electrique);
  const aa = regionInfo ? regionInfo.code : 'XX';

  const maintenant = new Date();
  const jj = String(maintenant.getUTCDate()).padStart(2, '0');
  const mm = String(maintenant.getUTCMonth() + 1).padStart(2, '0');
  const yy = String(maintenant.getUTCFullYear()).slice(-2);
  const debutMois = `${maintenant.getUTCFullYear()}-${mm}-01`;
  const moisSuivant = maintenant.getUTCMonth() === 11 ? 1 : maintenant.getUTCMonth() + 2;
  const anneeMoisSuivant = maintenant.getUTCMonth() === 11 ? maintenant.getUTCFullYear() + 1 : maintenant.getUTCFullYear();
  const finMois = `${anneeMoisSuivant}-${String(moisSuivant).padStart(2, '0')}-01`;

  const { n } = db
    .prepare(
      `SELECT COUNT(*) AS n FROM demandes d
       JOIN centrales c ON c.id = d.centrale_source_id
       WHERE d.type = 'RETRAIT' AND d.code_reference IS NOT NULL
         AND c.region_electrique = ?
         AND d.date_exploitation >= ? AND d.date_exploitation < ?`
    )
    .get(centrale?.region_electrique ?? '__aucune__', debutMois, finMois);
  const zz = String(n + 1).padStart(2, '0');

  return `DDR_${aa}/${jj}/${mm}/${yy}/${zz}-${centraleNom}`;
}

demandesRouter.get('/', (req, res) => {
  const user = requireAuth(req);
  const scope = centraleScopeId(user);
  const { statut, type, mine, actifId, centraleId } = req.query;
  const clauses = [];
  const params = [];
  if (scope) {
    clauses.push('centrale_source_id = ?');
    params.push(scope);
  }
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
  if (centraleId && !scope) {
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
  const {
    type,
    actifId,
    centraleDestId,
    etatCible,
    avecHierarchie,
    motif,
    datePrevue,
    dateDebutCoupure,
    heureDebutCoupure,
    dateRetourExploitation,
    heureFinCoupure,
    nbDepartsRame,
    nbDepartsImpactes,
    listeDepartsImpactes,
    entrepriseDesigneeId,
    clientsIndustrielsImpactes,
    listeClientsIndustriels,
    listeLocalitesImpactees,
  } = req.body;

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
  const nbDepartsRameFinal = nbDepartsRame !== undefined && nbDepartsRame !== '' ? Number(nbDepartsRame) : null;
  const nbDepartsImpactesFinal = nbDepartsImpactes !== undefined && nbDepartsImpactes !== '' ? Number(nbDepartsImpactes) : null;
  if (nbDepartsRameFinal !== null && (!Number.isInteger(nbDepartsRameFinal) || nbDepartsRameFinal < 0)) {
    throw new HttpError(400, 'nbDepartsRame doit être un entier positif');
  }
  if (nbDepartsImpactesFinal !== null && (!Number.isInteger(nbDepartsImpactesFinal) || nbDepartsImpactesFinal < 0)) {
    throw new HttpError(400, 'nbDepartsImpactes doit être un entier positif');
  }
  const clientsIndustrielsImpactesFinal = typeof clientsIndustrielsImpactes === 'boolean' ? (clientsIndustrielsImpactes ? 1 : 0) : null;
  let entreprise = null;
  if (entrepriseDesigneeId) {
    entreprise = db.prepare("SELECT * FROM entreprises WHERE id = ? AND statut = 'ACTIVE'").get(entrepriseDesigneeId);
    if (!entreprise) throw new HttpError(400, 'entrepriseDesigneeId invalide (entreprise introuvable ou inactive)');
  }

  const actif = db.prepare('SELECT * FROM actifs WHERE id = ?').get(actifId);
  if (!actif) throw new HttpError(404, 'Actif introuvable');
  requireCentraleAccess(user, actif.centrale_id);
  verifierEligibilite(type, actif);

  const enCours = db
    .prepare(`SELECT COUNT(*) AS n FROM demandes WHERE actif_id = ? AND statut IN ('EN_ATTENTE', 'TRANSMISE')`)
    .get(actifId).n;
  if (enCours > 0) {
    throw new HttpError(409, 'Une demande est déjà en cours (en attente ou transmise) pour cet actif');
  }

  const hierarchie = avecHierarchie !== false;
  const etatCibleFinal = type === 'DECOMMISSIONNEMENT' ? etatCible || 'DECOMMISSIONNE' : null;
  const simulation = simuler(type, actifId, { centraleDestId, etatCible: etatCibleFinal, avecHierarchie: hierarchie });

  const info = db
    .prepare(
      `INSERT INTO demandes (
        type, etat_cible, deplacer_hierarchie, actif_id, actif_nom, centrale_source_id, centrale_source_nom,
        centrale_dest_id, centrale_dest_nom, statut, motif, date_prevue, simulation, niveau_impact,
        demandeur_id, demandeur_nom,
        date_debut_coupure, heure_debut_coupure, date_retour_exploitation, heure_fin_coupure,
        nb_departs_rame, nb_departs_impactes, liste_departs_impactes,
        entreprise_designee_id, entreprise_designee_nom, clients_industriels_impactes,
        liste_clients_industriels, liste_localites_impactees
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'EN_ATTENTE', ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
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
      user.nom,
      type === 'RETRAIT' ? dateDebutCoupure || null : null,
      type === 'RETRAIT' ? heureDebutCoupure || null : null,
      type === 'RETRAIT' ? dateRetourExploitation || null : null,
      type === 'RETRAIT' ? heureFinCoupure || null : null,
      type === 'RETRAIT' ? nbDepartsRameFinal : null,
      type === 'RETRAIT' ? nbDepartsImpactesFinal : null,
      type === 'RETRAIT' ? listeDepartsImpactes || null : null,
      type === 'RETRAIT' ? entreprise?.id ?? null : null,
      type === 'RETRAIT' ? entreprise?.nom ?? null : null,
      type === 'RETRAIT' ? clientsIndustrielsImpactesFinal : null,
      type === 'RETRAIT' ? listeClientsIndustriels || null : null,
      type === 'RETRAIT' ? listeLocalitesImpactees || null : null
    );

  const demande = deserializeDemande(db.prepare('SELECT * FROM demandes WHERE id = ?').get(info.lastInsertRowid));

  const libelle = LIBELLES[type];
  const suffixe = simulation.niveauImpact === 'CRITIQUE' ? ' [IMPACT CRITIQUE]' : '';
  notifyRoleCentrale(
    'RESPONSABLE_EXPLOITATION',
    actif.centrale_id,
    'DEMANDE_CREEE',
    `Nouvelle demande de ${libelle} pour "${actif.nom}" (par ${user.nom}) à vérifier.${suffixe}`,
    `#/demandes/${demande.id}`
  );
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
  const user = requireAuth(req);
  const demande = deserializeDemande(db.prepare('SELECT * FROM demandes WHERE id = ?').get(req.params.id));
  if (!demande) return res.status(404).json({ error: 'Demande introuvable' });
  requireCentraleAccess(user, demande.centrale_source_id);

  let simulationActuelle = null;
  let estObsolete = false;
  try {
    simulationActuelle = simuler(demande.type, demande.actif_id, {
      centraleDestId: demande.centrale_dest_id,
      etatCible: demande.etat_cible,
      avecHierarchie: demande.deplacer_hierarchie,
    });
    estObsolete = ['EN_ATTENTE', 'TRANSMISE'].includes(demande.statut) && estSimulationObsolete(demande, simulationActuelle);
  } catch {
    simulationActuelle = null;
    estObsolete = ['EN_ATTENTE', 'TRANSMISE'].includes(demande.statut);
  }

  const mouvement = db.prepare('SELECT * FROM mouvements WHERE demande_id = ?').get(demande.id);

  res.json({
    ...demande,
    simulationActuelle,
    estObsolete,
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
  if (!['EN_ATTENTE', 'TRANSMISE'].includes(demande.statut)) {
    throw new HttpError(400, 'Cette demande a déjà été exécutée, rejetée ou annulée');
  }
  if (!req.body?.motif) throw new HttpError(400, "Le motif de l'annulation est requis");

  db.prepare("UPDATE demandes SET statut = 'ANNULEE', updated_at = datetime('now') WHERE id = ?").run(demande.id);
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
  requireCentraleAccess(user, demande.centrale_source_id);
  if (!['EN_ATTENTE', 'TRANSMISE'].includes(demande.statut)) {
    throw new HttpError(400, 'Cette demande ne peut plus être resimulée (déjà exécutée, rejetée ou annulée)');
  }

  const simulation = simuler(demande.type, demande.actif_id, {
    centraleDestId: demande.centrale_dest_id,
    etatCible: demande.etat_cible,
    avecHierarchie: demande.deplacer_hierarchie,
  });

  db.prepare(
    `UPDATE demandes SET statut = 'EN_ATTENTE', simulation = ?, niveau_impact = ?, simulation_obsolete = 0,
     exploitation_id = NULL, exploitation_nom = NULL, commentaire_exploitation = NULL, date_exploitation = NULL,
     code_reference = NULL, updated_at = datetime('now') WHERE id = ?`
  ).run(JSON.stringify(simulation), simulation.niveauImpact, demande.id);

  notifyRoleCentrale(
    'RESPONSABLE_EXPLOITATION',
    demande.centrale_source_id,
    'SIMULATION_RELANCEE',
    `La simulation de la demande #${demande.id} (${LIBELLES[demande.type]} — "${demande.actif_nom}") a été actualisée et doit être revérifiée.`,
    `#/demandes/${demande.id}`
  );
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

// --- Étape 2 : Responsable Exploitation vérifie la pertinence ---

demandesRouter.post('/:id/transmettre', (req, res) => {
  const user = requireRole(req, ROLES_EXPLOITATION);
  const demande = db.prepare('SELECT * FROM demandes WHERE id = ?').get(req.params.id);
  if (!demande) throw new HttpError(404, 'Demande introuvable');
  requireCentraleAccess(user, demande.centrale_source_id);
  if (demande.statut !== 'EN_ATTENTE') {
    throw new HttpError(400, 'Seule une demande en attente peut être transmise');
  }
  if (!req.body?.commentaire) throw new HttpError(400, 'Un motif / commentaire est requis');

  const simulationActuelle = simuler(demande.type, demande.actif_id, {
    centraleDestId: demande.centrale_dest_id,
    etatCible: demande.etat_cible,
    avecHierarchie: demande.deplacer_hierarchie,
  });
  if (estSimulationObsolete(deserializeDemande(demande), simulationActuelle)) {
    db.prepare('UPDATE demandes SET simulation_obsolete = 1 WHERE id = ?').run(demande.id);
    throw new HttpError(409, "La situation a changé depuis la création de la demande : la simulation est obsolète. Relancez la simulation avant de transmettre.");
  }

  const codeReference = demande.type === 'RETRAIT' ? genererCodeReferenceDDR(demande.centrale_source_id, demande.centrale_source_nom) : null;
  db.prepare(
    `UPDATE demandes SET statut = 'TRANSMISE', exploitation_id = ?, exploitation_nom = ?, commentaire_exploitation = ?, date_exploitation = datetime('now'), code_reference = ?, updated_at = datetime('now') WHERE id = ?`
  ).run(user.id, user.nom, req.body?.commentaire || null, codeReference, demande.id);

  const libelle = LIBELLES[demande.type];
  const suffixe = demande.niveau_impact === 'CRITIQUE' ? ' [IMPACT CRITIQUE — approbation Administrateur requise]' : '';
  const message = `Demande de ${libelle} pour "${demande.actif_nom}" transmise par ${user.nom}, en attente de votre approbation.${suffixe}`;
  notifyRoleCentrale('CHEF_CENTRALE', demande.centrale_source_id, 'DEMANDE_TRANSMISE', message, `#/demandes/${demande.id}`);
  notifyRole('ADMINISTRATEUR', 'DEMANDE_TRANSMISE', message, `#/demandes/${demande.id}`);
  notifyUser(demande.demandeur_id, 'DEMANDE_TRANSMISE', `Votre demande de ${libelle} pour "${demande.actif_nom}" a été transmise au Chef Centrale par ${user.nom}.`, `#/demandes/${demande.id}`);
  logAudit({
    type: 'DEMANDE_TRANSMISE',
    description: `Demande #${demande.id} (${demande.type}) transmise au Chef Centrale par ${user.nom}`,
    acteur: user,
    cibleType: 'DEMANDE',
    cibleId: demande.id,
    centraleId: demande.centrale_source_id,
  });

  res.json(deserializeDemande(db.prepare('SELECT * FROM demandes WHERE id = ?').get(demande.id)));
});

demandesRouter.post('/:id/rejeter-exploitation', (req, res) => {
  const user = requireRole(req, ROLES_EXPLOITATION);
  const demande = db.prepare('SELECT * FROM demandes WHERE id = ?').get(req.params.id);
  if (!demande) throw new HttpError(404, 'Demande introuvable');
  requireCentraleAccess(user, demande.centrale_source_id);
  if (demande.statut !== 'EN_ATTENTE') {
    throw new HttpError(400, 'Seule une demande en attente peut être rejetée à ce stade');
  }
  if (!req.body?.commentaire) throw new HttpError(400, 'Un motif de rejet est requis');

  db.prepare(
    `UPDATE demandes SET statut = 'REJETEE', rejete_par = 'EXPLOITATION', exploitation_id = ?, exploitation_nom = ?, commentaire_exploitation = ?, date_exploitation = datetime('now'), updated_at = datetime('now') WHERE id = ?`
  ).run(user.id, user.nom, req.body.commentaire, demande.id);

  notifyUser(
    demande.demandeur_id,
    'DEMANDE_REJETEE',
    `Votre demande de ${LIBELLES[demande.type]} pour "${demande.actif_nom}" a été rejetée par ${user.nom} (Exploitation) : ${req.body.commentaire}`,
    `#/demandes/${demande.id}`
  );
  logAudit({
    type: 'DEMANDE_REJETEE',
    description: `Demande #${demande.id} (${demande.type}) rejetée par l'Exploitation : ${req.body.commentaire}`,
    acteur: user,
    cibleType: 'DEMANDE',
    cibleId: demande.id,
    centraleId: demande.centrale_source_id,
  });

  res.json(deserializeDemande(db.prepare('SELECT * FROM demandes WHERE id = ?').get(demande.id)));
});

// --- Étape 3 : Chef Centrale approuve (= exécution immédiate) ou rejette ---

demandesRouter.post('/:id/approuver', (req, res) => {
  const user = requireRole(req, ROLES_APPROBATION_FINALE);
  const demandeRaw = db.prepare('SELECT * FROM demandes WHERE id = ?').get(req.params.id);
  if (!demandeRaw) throw new HttpError(404, 'Demande introuvable');
  const demande = deserializeDemande(demandeRaw);
  if (demande.statut !== 'TRANSMISE') {
    throw new HttpError(400, 'Seule une demande transmise par l\'Exploitation peut être approuvée');
  }
  requireCentraleAccess(user, demande.centrale_source_id);
  if (demande.niveau_impact === 'CRITIQUE' && user.role !== 'ADMINISTRATEUR') {
    throw new HttpError(403, "Cette demande a un niveau d'impact critique : seul un Administrateur peut l'approuver");
  }
  if (!req.body?.commentaire) throw new HttpError(400, 'Un motif / commentaire est requis');

  const actif = db.prepare('SELECT * FROM actifs WHERE id = ?').get(demande.actif_id);
  if (!actif) throw new HttpError(404, "L'actif de cette demande n'existe plus");

  const simulationActuelle = simuler(demande.type, demande.actif_id, {
    centraleDestId: demande.centrale_dest_id,
    etatCible: demande.etat_cible,
    avecHierarchie: demande.deplacer_hierarchie,
  });
  if (estSimulationObsolete(demande, simulationActuelle)) {
    db.prepare('UPDATE demandes SET simulation_obsolete = 1 WHERE id = ?').run(demande.id);
    throw new HttpError(409, "La situation a changé depuis la transmission : la simulation est obsolète. Relancez la simulation avant d'approuver.");
  }

  const descendants = demande.deplacer_hierarchie || demande.type !== 'DEPLACEMENT'
    ? simulationActuelle.descendants
    : [simulationActuelle.actif];
  const descendantIds = descendants.map((d) => d.id);
  const placeholders = descendantIds.map(() => '?').join(',');

  const mouvement = withTransaction(() => {
    if (demande.type === 'DEPLACEMENT') {
      db.prepare(
        `UPDATE actifs SET centrale_id = ?, updated_at = datetime('now') WHERE id IN (${placeholders})`
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
      scoreSourceAvant: simulationActuelle.scoreSourceAvant,
      scoreSourceApres: simulationActuelle.scoreSourceApres,
      scoreDestAvant: simulationActuelle.scoreDestAvant,
      scoreDestApres: simulationActuelle.scoreDestApres,
      nbActifsImpactes: descendants.length,
      niveauImpact: simulationActuelle.niveauImpact,
      alertes: simulationActuelle.alertes,
      commentaire: demande.motif,
      executeur: user,
    });

    db.prepare(
      `UPDATE demandes SET statut = 'EXECUTEE', approbateur_id = ?, approbateur_nom = ?, commentaire_approbation = ?, date_approbation = datetime('now'), date_execution = datetime('now'), updated_at = datetime('now') WHERE id = ?`
    ).run(user.id, user.nom, req.body?.commentaire || null, demande.id);

    return m;
  });

  notifyUser(
    demande.demandeur_id,
    'DEMANDE_EXECUTEE',
    `Votre demande de ${LIBELLES[demande.type]} pour "${demande.actif_nom}" a été approuvée et exécutée par ${user.nom}.`,
    `#/demandes/${demande.id}`
  );
  if (demande.exploitation_id) {
    notifyUser(
      demande.exploitation_id,
      'DEMANDE_EXECUTEE',
      `La demande #${demande.id} (${LIBELLES[demande.type]} — "${demande.actif_nom}") que vous avez transmise a été approuvée et exécutée par ${user.nom}.`,
      `#/demandes/${demande.id}`
    );
  }
  logAudit({
    type: 'DEMANDE_EXECUTEE',
    description: `Demande #${demande.id} (${demande.type}) approuvée et exécutée par ${user.nom}`,
    acteur: user,
    cibleType: 'DEMANDE',
    cibleId: demande.id,
    centraleId: demande.centrale_source_id,
  });

  res.json({ demande: deserializeDemande(db.prepare('SELECT * FROM demandes WHERE id = ?').get(demande.id)), mouvement });
});

demandesRouter.post('/:id/rejeter', (req, res) => {
  const user = requireRole(req, ROLES_APPROBATION_FINALE);
  const demande = db.prepare('SELECT * FROM demandes WHERE id = ?').get(req.params.id);
  if (!demande) throw new HttpError(404, 'Demande introuvable');
  if (demande.statut !== 'TRANSMISE') {
    throw new HttpError(400, 'Seule une demande transmise peut être rejetée à ce stade');
  }
  requireCentraleAccess(user, demande.centrale_source_id);
  if (!req.body?.commentaire) throw new HttpError(400, 'Un motif de rejet est requis');

  db.prepare(
    `UPDATE demandes SET statut = 'REJETEE', rejete_par = 'CENTRALE', approbateur_id = ?, approbateur_nom = ?, commentaire_approbation = ?, date_approbation = datetime('now'), updated_at = datetime('now') WHERE id = ?`
  ).run(user.id, user.nom, req.body.commentaire, demande.id);

  notifyUser(
    demande.demandeur_id,
    'DEMANDE_REJETEE',
    `Votre demande de ${LIBELLES[demande.type]} pour "${demande.actif_nom}" a été rejetée par ${user.nom} (Chef Centrale) : ${req.body.commentaire}`,
    `#/demandes/${demande.id}`
  );
  if (demande.exploitation_id) {
    notifyUser(
      demande.exploitation_id,
      'DEMANDE_REJETEE',
      `La demande #${demande.id} que vous avez transmise a été rejetée par ${user.nom} (Chef Centrale) : ${req.body.commentaire}`,
      `#/demandes/${demande.id}`
    );
  }
  logAudit({
    type: 'DEMANDE_REJETEE',
    description: `Demande #${demande.id} (${demande.type}) rejetée par le Chef Centrale : ${req.body.commentaire}`,
    acteur: user,
    cibleType: 'DEMANDE',
    cibleId: demande.id,
    centraleId: demande.centrale_source_id,
  });

  res.json(deserializeDemande(db.prepare('SELECT * FROM demandes WHERE id = ?').get(demande.id)));
});
