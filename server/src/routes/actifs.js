import { Router, HttpError } from '../lib/miniweb.js';
import { db } from '../db.js';
import { computeCentralePerformance } from '../services/performance.js';
import { insertMouvement, deserializeMouvement } from '../services/mouvements.js';
import {
  requireAuth,
  requireRole,
  ROLES_GESTION_REFERENTIEL,
  ROLES_OPERATION_DIRECTE,
  centraleScopeId,
  requireCentraleAccess,
} from '../lib/auth.js';
import { logAudit, diffChamps } from '../lib/audit.js';
import { sendCsv, parseImportRows } from '../lib/csv.js';

export const actifsRouter = new Router();

const CHAMPS_MODIFIABLES = ['nom', 'type', 'criticite', 'contribution_mw', 'fabricant', 'modele', 'numero_serie', 'date_installation', 'description'];
const CRITICITES_VALIDES = ['FAIBLE', 'MOYENNE', 'HAUTE', 'CRITIQUE'];

actifsRouter.get('/', (req, res) => {
  const user = requireAuth(req);
  const scope = centraleScopeId(user);
  const { centraleId } = req.query;
  if (scope && centraleId && Number(centraleId) !== Number(scope)) {
    throw new HttpError(403, "Vous n'avez accès qu'aux actifs de votre centrale");
  }
  const idCentrale = scope || centraleId;
  const actifs = idCentrale
    ? db.prepare('SELECT * FROM actifs WHERE centrale_id = ? ORDER BY nom').all(idCentrale)
    : db.prepare('SELECT * FROM actifs ORDER BY nom').all();
  res.json(actifs);
});

actifsRouter.post('/', (req, res) => {
  const user = requireRole(req, ROLES_GESTION_REFERENTIEL);
  const {
    code,
    nom,
    type,
    centraleId,
    parentId,
    statut,
    criticite,
    contributionMw,
    fabricant,
    modele,
    numeroSerie,
    dateInstallation,
    description,
  } = req.body;

  if (!code || !nom || !centraleId) {
    return res.status(400).json({ error: 'code, nom et centraleId sont requis' });
  }

  const centrale = db.prepare('SELECT * FROM centrales WHERE id = ?').get(centraleId);
  if (!centrale) return res.status(400).json({ error: 'Centrale introuvable' });
  if (centrale.statut !== 'ACTIVE') {
    return res.status(409).json({ error: "Impossible de rattacher un actif à une centrale inactive" });
  }

  if (parentId) {
    const parent = db.prepare('SELECT * FROM actifs WHERE id = ?').get(parentId);
    if (!parent) return res.status(400).json({ error: 'Actif parent introuvable' });
    if (parent.centrale_id !== Number(centraleId)) {
      return res.status(400).json({ error: "L'actif enfant doit appartenir à la même centrale que son actif mère" });
    }
  }

  const codeExistant = db.prepare('SELECT id FROM actifs WHERE code = ?').get(code);
  if (codeExistant) return res.status(409).json({ error: `Le code "${code}" est déjà utilisé par un autre actif` });

  const info = db
    .prepare(
      `INSERT INTO actifs (code, nom, type, centrale_id, parent_id, statut, criticite, contribution_mw, fabricant, modele, numero_serie, date_installation, description)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    )
    .run(
      code,
      nom,
      type || 'EQUIPEMENT',
      centraleId,
      parentId || null,
      statut || 'EN_SERVICE',
      criticite || 'MOYENNE',
      contributionMw || 0,
      fabricant || null,
      modele || null,
      numeroSerie || null,
      dateInstallation || null,
      description || null
    );
  const actif = db.prepare('SELECT * FROM actifs WHERE id = ?').get(info.lastInsertRowid);
  logAudit({
    type: 'ACTIF_CREE',
    description: `Actif "${actif.nom}" (${actif.code}) créé`,
    acteur: user,
    cibleType: 'ACTIF',
    cibleId: actif.id,
    centraleId: actif.centrale_id,
  });
  res.status(201).json(actif);
});

const EXPORT_COLUMNS = [
  { key: 'code', label: 'code' },
  { key: 'nom', label: 'nom' },
  { key: 'type', label: 'type' },
  { key: 'centrale_code', label: 'centrale_code' },
  { key: 'parent_code', label: 'parent_code' },
  { key: 'statut', label: 'statut' },
  { key: 'criticite', label: 'criticite' },
  { key: 'contribution_mw', label: 'contribution_mw' },
  { key: 'fabricant', label: 'fabricant' },
  { key: 'modele', label: 'modele' },
  { key: 'numero_serie', label: 'numero_serie' },
  { key: 'date_installation', label: 'date_installation' },
  { key: 'description', label: 'description' },
];

actifsRouter.get('/export', (req, res) => {
  requireRole(req, ROLES_GESTION_REFERENTIEL);
  const rows = db
    .prepare(
      `SELECT a.*, c.code AS centrale_code, p.code AS parent_code
       FROM actifs a
       JOIN centrales c ON c.id = a.centrale_id
       LEFT JOIN actifs p ON p.id = a.parent_id
       ORDER BY a.code`
    )
    .all();
  sendCsv(res, 'actifs.csv', rows, EXPORT_COLUMNS);
});

actifsRouter.post('/import', (req, res) => {
  const user = requireRole(req, ROLES_GESTION_REFERENTIEL);
  const rows = parseImportRows(req.body);
  if (!rows.length) throw new HttpError(400, 'Fichier vide ou illisible (CSV ou Excel .xlsx attendu)');

  const codesDuFichier = new Set(rows.map((r) => r.code?.trim()).filter(Boolean));
  let crees = 0;
  let misAJour = 0;
  const erreurs = [];

  // Passe 1 : créer/mettre à jour chaque actif sans résoudre son actif mère.
  rows.forEach((row, idx) => {
    const ligne = idx + 2;
    const code = row.code?.trim();
    const nom = row.nom?.trim();
    const centraleCode = row.centrale_code?.trim();
    if (!code || !nom || !centraleCode) {
      erreurs.push(`Ligne ${ligne} : code, nom et centrale_code sont requis`);
      return;
    }
    const centrale = db.prepare('SELECT id FROM centrales WHERE code = ?').get(centraleCode);
    if (!centrale) {
      erreurs.push(`Ligne ${ligne} (${code}) : centrale_code "${centraleCode}" introuvable`);
      return;
    }
    const criticite = CRITICITES_VALIDES.includes(row.criticite) ? row.criticite : 'MOYENNE';
    const contribution = Number(row.contribution_mw) || 0;

    const existant = db.prepare('SELECT id FROM actifs WHERE code = ?').get(code);
    if (existant) {
      db.prepare(
        `UPDATE actifs SET nom = ?, type = ?, centrale_id = ?, criticite = ?, contribution_mw = ?, fabricant = ?, modele = ?, numero_serie = ?, date_installation = ?, description = ?, updated_at = datetime('now') WHERE id = ?`
      ).run(
        nom,
        row.type || 'EQUIPEMENT',
        centrale.id,
        criticite,
        contribution,
        row.fabricant || null,
        row.modele || null,
        row.numero_serie || null,
        row.date_installation || null,
        row.description || null,
        existant.id
      );
      misAJour++;
    } else {
      db.prepare(
        `INSERT INTO actifs (code, nom, type, centrale_id, statut, criticite, contribution_mw, fabricant, modele, numero_serie, date_installation, description)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
      ).run(
        code,
        nom,
        row.type || 'EQUIPEMENT',
        centrale.id,
        ['EN_SERVICE', 'EN_MAINTENANCE', 'EN_REPARATION', 'HORS_SERVICE'].includes(row.statut) ? row.statut : 'EN_SERVICE',
        criticite,
        contribution,
        row.fabricant || null,
        row.modele || null,
        row.numero_serie || null,
        row.date_installation || null,
        row.description || null
      );
      crees++;
    }
  });

  // Passe 2 : résoudre les actifs mères (parent_code), une fois tous les actifs du fichier créés.
  rows.forEach((row, idx) => {
    const ligne = idx + 2;
    const code = row.code?.trim();
    const parentCode = row.parent_code?.trim();
    if (!code || !parentCode) return;
    const actif = db.prepare('SELECT id, centrale_id FROM actifs WHERE code = ?').get(code);
    if (!actif) return; // erreur déjà signalée en passe 1
    if (parentCode === code) {
      erreurs.push(`Ligne ${ligne} (${code}) : un actif ne peut pas être son propre actif mère`);
      return;
    }
    const parent = db.prepare('SELECT id, centrale_id FROM actifs WHERE code = ?').get(parentCode);
    if (!parent) {
      erreurs.push(`Ligne ${ligne} (${code}) : parent_code "${parentCode}" introuvable`);
      return;
    }
    if (parent.centrale_id !== actif.centrale_id) {
      erreurs.push(`Ligne ${ligne} (${code}) : l'actif mère "${parentCode}" doit appartenir à la même centrale`);
      return;
    }
    if (creeUneBoucle(actif.id, parent.id)) {
      erreurs.push(`Ligne ${ligne} (${code}) : relation ignorée, elle créerait une boucle hiérarchique`);
      return;
    }
    db.prepare("UPDATE actifs SET parent_id = ?, updated_at = datetime('now') WHERE id = ?").run(parent.id, actif.id);
  });

  logAudit({
    type: 'ACTIFS_IMPORTES',
    description: `Import CSV actifs : ${crees} créé(s), ${misAJour} mis à jour, ${erreurs.length} erreur(s)`,
    acteur: user,
  });

  res.json({ crees, misAJour, erreurs, codes: [...codesDuFichier] });
});

function creeUneBoucle(actifId, nouveauParentId) {
  let courant = db.prepare('SELECT parent_id FROM actifs WHERE id = ?').get(nouveauParentId);
  const visites = new Set([actifId]);
  while (courant?.parent_id) {
    if (visites.has(courant.parent_id)) return true;
    visites.add(courant.parent_id);
    courant = db.prepare('SELECT parent_id FROM actifs WHERE id = ?').get(courant.parent_id);
  }
  return nouveauParentId === actifId;
}

actifsRouter.get('/:id', (req, res) => {
  const user = requireAuth(req);
  const actif = db.prepare('SELECT * FROM actifs WHERE id = ?').get(req.params.id);
  if (!actif) return res.status(404).json({ error: 'Actif introuvable' });
  requireCentraleAccess(user, actif.centrale_id);
  const enfants = db.prepare('SELECT * FROM actifs WHERE parent_id = ?').all(actif.id);
  const parent = actif.parent_id
    ? db.prepare('SELECT * FROM actifs WHERE id = ?').get(actif.parent_id)
    : null;
  const centrale = db.prepare('SELECT * FROM centrales WHERE id = ?').get(actif.centrale_id);
  const fil = filAriane(actif);
  const historique = db
    .prepare('SELECT * FROM mouvements WHERE actif_id = ? ORDER BY date DESC')
    .all(actif.id)
    .map(deserializeMouvement);
  const demandes = db
    .prepare('SELECT * FROM demandes WHERE actif_id = ? ORDER BY created_at DESC')
    .all(actif.id)
    .map(deserializeDemande);
  res.json({ ...actif, enfants, parent, centrale, filAriane: fil, historique, demandes });
});

function filAriane(actif) {
  const chemin = [];
  let courant = actif;
  while (courant?.parent_id) {
    courant = db.prepare('SELECT * FROM actifs WHERE id = ?').get(courant.parent_id);
    if (courant) chemin.unshift({ id: courant.id, nom: courant.nom, type: courant.type });
  }
  return chemin;
}

actifsRouter.put('/:id', (req, res) => {
  const user = requireRole(req, ROLES_GESTION_REFERENTIEL);
  const actif = db.prepare('SELECT * FROM actifs WHERE id = ?').get(req.params.id);
  if (!actif) return res.status(404).json({ error: 'Actif introuvable' });

  const nouvelles = {
    nom: req.body.nom ?? actif.nom,
    type: req.body.type ?? actif.type,
    criticite: req.body.criticite ?? actif.criticite,
    contribution_mw: req.body.contributionMw ?? actif.contribution_mw,
    fabricant: req.body.fabricant ?? actif.fabricant,
    modele: req.body.modele ?? actif.modele,
    numero_serie: req.body.numeroSerie ?? actif.numero_serie,
    date_installation: req.body.dateInstallation ?? actif.date_installation,
    description: req.body.description ?? actif.description,
  };

  db.prepare(
    `UPDATE actifs SET nom = ?, type = ?, criticite = ?, contribution_mw = ?, fabricant = ?, modele = ?, numero_serie = ?, date_installation = ?, description = ?, updated_at = datetime('now')
     WHERE id = ?`
  ).run(
    nouvelles.nom,
    nouvelles.type,
    nouvelles.criticite,
    nouvelles.contribution_mw,
    nouvelles.fabricant,
    nouvelles.modele,
    nouvelles.numero_serie,
    nouvelles.date_installation,
    nouvelles.description,
    actif.id
  );

  const diff = diffChamps(actif, nouvelles, CHAMPS_MODIFIABLES);
  const modifieCapacite = 'contribution_mw' in diff;
  logAudit({
    type: 'ACTIF_MODIFIE',
    description: `Actif "${actif.nom}" modifié${modifieCapacite ? ' (impact potentiel sur la performance : contribution MW modifiée)' : ''}`,
    acteur: user,
    cibleType: 'ACTIF',
    cibleId: actif.id,
    centraleId: actif.centrale_id,
    donnees: diff,
  });
  res.json(db.prepare('SELECT * FROM actifs WHERE id = ?').get(actif.id));
});

actifsRouter.delete('/:id', (req, res) => {
  const user = requireRole(req, ROLES_GESTION_REFERENTIEL);
  const actif = db.prepare('SELECT * FROM actifs WHERE id = ?').get(req.params.id);
  if (!actif) return res.status(404).json({ error: 'Actif introuvable' });
  const nbEnfants = db.prepare('SELECT COUNT(*) AS n FROM actifs WHERE parent_id = ?').get(actif.id).n;
  if (nbEnfants > 0) {
    return res.status(400).json({ error: "Impossible de supprimer un actif qui possède des actifs enfants" });
  }
  const nbHistorique = db.prepare('SELECT COUNT(*) AS n FROM mouvements WHERE actif_id = ?').get(actif.id).n;
  if (nbHistorique > 0) {
    return res.status(400).json({ error: "Cet actif possède un historique de mouvements : il doit être décommissionné, pas supprimé, afin de garantir la traçabilité" });
  }
  db.prepare('DELETE FROM actifs WHERE id = ?').run(actif.id);
  logAudit({ type: 'ACTIF_SUPPRIME', description: `Actif "${actif.nom}" supprimé`, acteur: user, cibleType: 'ACTIF', cibleId: actif.id, centraleId: actif.centrale_id });
  res.status(204).end();
});

// --- Actions opérationnelles directes (hors circuit de demande) ---

actifsRouter.post('/:id/mettre-en-maintenance', (req, res) => {
  const user = requireRole(req, ROLES_OPERATION_DIRECTE);
  const actif = db.prepare('SELECT * FROM actifs WHERE id = ?').get(req.params.id);
  if (!actif) throw new HttpError(404, 'Actif introuvable');
  requireCentraleAccess(user, actif.centrale_id);
  if (actif.statut !== 'EN_SERVICE') {
    throw new HttpError(409, 'Seul un actif en service peut être mis en maintenance');
  }
  res.status(201).json(basculerStatut(actif, 'EN_MAINTENANCE', 'MAINTENANCE_DEBUT', user, req.body?.commentaire));
});

actifsRouter.post('/:id/fin-maintenance', (req, res) => {
  const user = requireRole(req, ROLES_OPERATION_DIRECTE);
  const actif = db.prepare('SELECT * FROM actifs WHERE id = ?').get(req.params.id);
  if (!actif) throw new HttpError(404, 'Actif introuvable');
  requireCentraleAccess(user, actif.centrale_id);
  if (actif.statut !== 'EN_MAINTENANCE') {
    throw new HttpError(409, "Cet actif n'est pas en maintenance");
  }
  res.status(201).json(basculerStatut(actif, 'EN_SERVICE', 'MAINTENANCE_FIN', user, req.body?.commentaire));
});

actifsRouter.post('/:id/mettre-en-reparation', (req, res) => {
  const user = requireRole(req, ROLES_OPERATION_DIRECTE);
  const actif = db.prepare('SELECT * FROM actifs WHERE id = ?').get(req.params.id);
  if (!actif) throw new HttpError(404, 'Actif introuvable');
  requireCentraleAccess(user, actif.centrale_id);
  if (!['EN_SERVICE', 'EN_MAINTENANCE'].includes(actif.statut)) {
    throw new HttpError(409, 'Seul un actif en service ou en maintenance peut être mis en réparation');
  }
  res.status(201).json(basculerStatut(actif, 'EN_REPARATION', 'REPARATION_DEBUT', user, req.body?.commentaire));
});

actifsRouter.post('/:id/fin-reparation', (req, res) => {
  const user = requireRole(req, ROLES_OPERATION_DIRECTE);
  const actif = db.prepare('SELECT * FROM actifs WHERE id = ?').get(req.params.id);
  if (!actif) throw new HttpError(404, 'Actif introuvable');
  requireCentraleAccess(user, actif.centrale_id);
  if (actif.statut !== 'EN_REPARATION') {
    throw new HttpError(409, "Cet actif n'est pas en réparation");
  }
  res.status(201).json(basculerStatut(actif, 'EN_SERVICE', 'REPARATION_FIN', user, req.body?.commentaire));
});

function basculerStatut(actif, nouveauStatut, typeMouvement, user, commentaire) {
  const avant = computeCentralePerformance(actif.centrale_id);
  db.prepare("UPDATE actifs SET statut = ?, updated_at = datetime('now') WHERE id = ?").run(nouveauStatut, actif.id);
  const apres = computeCentralePerformance(actif.centrale_id);

  const alertes = [
    {
      severite: 'basse',
      message: `"${actif.nom}" : ${actif.statut} → ${nouveauStatut}. Disponibilité de ${avant.centrale.nom} : ${avant.disponibilitePct}% → ${apres.disponibilitePct}%.`,
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
    centraleId: actif.centrale_id,
  });

  return { actif: db.prepare('SELECT * FROM actifs WHERE id = ?').get(actif.id), mouvement };
}

function deserializeDemande(d) {
  return { ...d, simulation: JSON.parse(d.simulation) };
}
