import { DatabaseSync } from 'node:sqlite';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import fs from 'node:fs';
import { hashPassword } from './lib/password.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const dataDir = path.join(__dirname, '..', 'data');
if (!fs.existsSync(dataDir)) fs.mkdirSync(dataDir, { recursive: true });
const dbPath = path.join(dataDir, 'retrait-actifs.sqlite');

export const db = new DatabaseSync(dbPath);

export function withTransaction(fn) {
  db.exec('BEGIN');
  try {
    const result = fn();
    db.exec('COMMIT');
    return result;
  } catch (err) {
    db.exec('ROLLBACK');
    throw err;
  }
}

db.exec(`
  PRAGMA foreign_keys = ON;

  CREATE TABLE IF NOT EXISTS centrales (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    code TEXT NOT NULL UNIQUE,
    nom TEXT NOT NULL,
    type TEXT NOT NULL DEFAULT 'THERMIQUE',
    localisation TEXT,
    region_electrique TEXT,
    capacite_nominale_mw REAL NOT NULL DEFAULT 0,
    seuil_alerte_pct REAL NOT NULL DEFAULT 70,
    statut TEXT NOT NULL DEFAULT 'ACTIVE',
    cree_par_id INTEGER,
    cree_par_nom TEXT,
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS actifs (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    code TEXT NOT NULL UNIQUE,
    nom TEXT NOT NULL,
    type TEXT NOT NULL DEFAULT 'EQUIPEMENT',
    centrale_id INTEGER NOT NULL REFERENCES centrales(id) ON DELETE CASCADE,
    parent_id INTEGER REFERENCES actifs(id) ON DELETE CASCADE,
    statut TEXT NOT NULL DEFAULT 'EN_SERVICE',
    criticite TEXT NOT NULL DEFAULT 'MOYENNE',
    contribution_mw REAL NOT NULL DEFAULT 0,
    fabricant TEXT,
    modele TEXT,
    numero_serie TEXT,
    date_installation TEXT,
    description TEXT,
    etat_avant_transfert TEXT,
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at TEXT NOT NULL DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS mouvements (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    demande_id INTEGER,
    actif_id INTEGER NOT NULL,
    actif_nom TEXT NOT NULL,
    type TEXT NOT NULL,
    centrale_source_id INTEGER,
    centrale_source_nom TEXT,
    centrale_dest_id INTEGER,
    centrale_dest_nom TEXT,
    score_source_avant REAL,
    score_source_apres REAL,
    score_dest_avant REAL,
    score_dest_apres REAL,
    nb_actifs_impactes INTEGER NOT NULL DEFAULT 1,
    niveau_impact TEXT,
    alertes TEXT NOT NULL DEFAULT '[]',
    commentaire TEXT,
    executeur_id INTEGER,
    executeur_nom TEXT,
    date TEXT NOT NULL DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS utilisateurs (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    nom TEXT NOT NULL,
    email TEXT NOT NULL UNIQUE,
    mot_de_passe_hash TEXT NOT NULL,
    role TEXT NOT NULL DEFAULT 'RESPONSABLE_MECANIQUE',
    centrale_id INTEGER REFERENCES centrales(id),
    actif INTEGER NOT NULL DEFAULT 1,
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS sessions (
    id TEXT PRIMARY KEY,
    utilisateur_id INTEGER NOT NULL REFERENCES utilisateurs(id) ON DELETE CASCADE,
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    expires_at TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS demandes (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    type TEXT NOT NULL,
    etat_cible TEXT,
    deplacer_hierarchie INTEGER NOT NULL DEFAULT 1,
    actif_id INTEGER NOT NULL,
    actif_nom TEXT NOT NULL,
    centrale_source_id INTEGER NOT NULL,
    centrale_source_nom TEXT NOT NULL,
    centrale_dest_id INTEGER,
    centrale_dest_nom TEXT,
    statut TEXT NOT NULL DEFAULT 'EN_ATTENTE',
    motif TEXT,
    date_prevue TEXT,
    simulation TEXT NOT NULL DEFAULT '{}',
    niveau_impact TEXT,
    simulation_obsolete INTEGER NOT NULL DEFAULT 0,
    demandeur_id INTEGER NOT NULL REFERENCES utilisateurs(id),
    demandeur_nom TEXT NOT NULL,
    exploitation_id INTEGER REFERENCES utilisateurs(id),
    exploitation_nom TEXT,
    commentaire_exploitation TEXT,
    date_exploitation TEXT,
    approbateur_id INTEGER REFERENCES utilisateurs(id),
    approbateur_nom TEXT,
    commentaire_approbation TEXT,
    date_approbation TEXT,
    rejete_par TEXT,
    date_execution TEXT,
    date_debut_coupure TEXT,
    heure_debut_coupure TEXT,
    date_retour_exploitation TEXT,
    heure_fin_coupure TEXT,
    nb_departs_rame INTEGER,
    nb_departs_impactes INTEGER,
    liste_departs_impactes TEXT,
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at TEXT NOT NULL DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS notifications (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    utilisateur_id INTEGER REFERENCES utilisateurs(id) ON DELETE CASCADE,
    role_cible TEXT,
    type TEXT NOT NULL,
    message TEXT NOT NULL,
    lien TEXT,
    lu INTEGER NOT NULL DEFAULT 0,
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS audit_log (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    type TEXT NOT NULL,
    description TEXT NOT NULL,
    acteur_id INTEGER,
    acteur_nom TEXT,
    cible_type TEXT,
    cible_id INTEGER,
    centrale_id INTEGER,
    donnees TEXT,
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS parametres_impact (
    id INTEGER PRIMARY KEY CHECK (id = 1),
    seuil_moyen_pts REAL NOT NULL DEFAULT 5,
    seuil_important_pts REAL NOT NULL DEFAULT 15,
    seuil_critique_pts REAL NOT NULL DEFAULT 30
  );

  CREATE INDEX IF NOT EXISTS idx_actifs_centrale ON actifs(centrale_id);
  CREATE INDEX IF NOT EXISTS idx_actifs_parent ON actifs(parent_id);
  CREATE INDEX IF NOT EXISTS idx_mouvements_actif ON mouvements(actif_id);
  CREATE INDEX IF NOT EXISTS idx_demandes_statut ON demandes(statut);
  CREATE INDEX IF NOT EXISTS idx_demandes_actif ON demandes(actif_id);
  CREATE INDEX IF NOT EXISTS idx_sessions_utilisateur ON sessions(utilisateur_id);
  CREATE INDEX IF NOT EXISTS idx_notifications_utilisateur ON notifications(utilisateur_id);
  CREATE INDEX IF NOT EXISTS idx_audit_log_cible ON audit_log(cible_type, cible_id);
  CREATE INDEX IF NOT EXISTS idx_audit_log_centrale ON audit_log(centrale_id);
  CREATE INDEX IF NOT EXISTS idx_utilisateurs_centrale ON utilisateurs(centrale_id);
`);

// Migration additive : ajoute les colonnes manquantes sur une base déjà déployée (ex. Render)
// où la table existait avant l'ajout de nouveaux champs — CREATE TABLE IF NOT EXISTS ne modifie
// pas une table déjà créée.
function migrerColonnesManquantes(table, colonnesAAjouter) {
  const colonnesExistantes = new Set(db.prepare(`PRAGMA table_info(${table})`).all().map((c) => c.name));
  for (const [colonne, type] of Object.entries(colonnesAAjouter)) {
    if (!colonnesExistantes.has(colonne)) {
      db.exec(`ALTER TABLE ${table} ADD COLUMN ${colonne} ${type}`);
    }
  }
}
migrerColonnesManquantes('demandes', {
  date_debut_coupure: 'TEXT',
  heure_debut_coupure: 'TEXT',
  date_retour_exploitation: 'TEXT',
  heure_fin_coupure: 'TEXT',
  nb_departs_rame: 'INTEGER',
  nb_departs_impactes: 'INTEGER',
  liste_departs_impactes: 'TEXT',
});
migrerColonnesManquantes('centrales', {
  region_electrique: 'TEXT',
});

function seedIfEmpty() {
  const { count } = db.prepare('SELECT COUNT(*) AS count FROM parametres_impact').get();
  if (count === 0) {
    db.prepare(
      'INSERT INTO parametres_impact (id, seuil_moyen_pts, seuil_important_pts, seuil_critique_pts) VALUES (1, 5, 15, 30)'
    ).run();
  }

  let c1, c2, c3;
  const { count: nbCentrales } = db.prepare('SELECT COUNT(*) AS count FROM centrales').get();
  if (nbCentrales === 0) {
    const insertCentrale = db.prepare(`
      INSERT INTO centrales (code, nom, type, localisation, capacite_nominale_mw, seuil_alerte_pct, statut)
      VALUES (?, ?, ?, ?, ?, ?, 'ACTIVE')
    `);
    c1 = insertCentrale.run('CTH-DLA', 'Centrale Thermique de Douala', 'THERMIQUE', 'Douala', 250, 70).lastInsertRowid;
    c2 = insertCentrale.run('CHY-SGL', 'Barrage Hydroélectrique de Song Loulou', 'HYDRAULIQUE', 'Song Loulou', 400, 70).lastInsertRowid;
    c3 = insertCentrale.run('CSO-MRA', 'Centrale Solaire de Maroua', 'SOLAIRE', 'Maroua', 100, 65).lastInsertRowid;

    const insertActif = db.prepare(`
      INSERT INTO actifs (code, nom, type, centrale_id, parent_id, statut, criticite, contribution_mw, fabricant, modele, numero_serie, date_installation, description)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);

    // Centrale 1 : unité de production > groupe > équipements
    const u1 = insertActif.run('CTH-DLA-U1', 'Unité de production 1', 'UNITE_PRODUCTION', c1, null, 'EN_SERVICE', 'HAUTE', 0, null, null, null, '2015-01-01', 'Unité regroupant les groupes 1 et 2').lastInsertRowid;
    const g1 = insertActif.run('CTH-DLA-U1-G1', 'Groupe de production G1', 'GROUPE_PRODUCTION', c1, u1, 'EN_SERVICE', 'HAUTE', 0, null, null, null, '2015-03-10', null).lastInsertRowid;
    const turbine1 = insertActif.run('CTH-DLA-U1-G1-TB', 'Turbine à gaz TG-01', 'TURBINE', c1, g1, 'EN_SERVICE', 'CRITIQUE', 80, 'GE', 'LM6000', 'SN-4471', '2015-03-10', 'Turbine principale du groupe 1').lastInsertRowid;
    insertActif.run('CTH-DLA-U1-G1-GE', 'Générateur GEN-01', 'GENERATEUR', c1, turbine1, 'EN_SERVICE', 'HAUTE', 0, 'GE', 'GE-6FA', 'SN-4472', '2015-03-10', 'Générateur associé à TG-01');
    insertActif.run('CTH-DLA-U1-G1-CV', 'Capteur de vibration CV-01', 'CAPTEUR', c1, turbine1, 'EN_SERVICE', 'FAIBLE', 0, 'Bently Nevada', '3500', 'SN-9001', '2015-03-10', 'Capteur de surveillance');

    const g2 = insertActif.run('CTH-DLA-U1-G2', 'Groupe de production G2', 'GROUPE_PRODUCTION', c1, u1, 'EN_SERVICE', 'HAUTE', 0, null, null, null, '2016-06-20', null).lastInsertRowid;
    const turbine2 = insertActif.run('CTH-DLA-U1-G2-TB', 'Turbine à gaz TG-02', 'TURBINE', c1, g2, 'EN_SERVICE', 'HAUTE', 70, 'GE', 'LM6000', 'SN-4480', '2016-06-20', 'Turbine du groupe 2').lastInsertRowid;
    insertActif.run('CTH-DLA-U1-G2-GE', 'Générateur GEN-02', 'GENERATEUR', c1, turbine2, 'EN_MAINTENANCE', 'MOYENNE', 0, 'GE', 'GE-6FA', 'SN-4481', '2016-06-20', 'En maintenance planifiée');

    insertActif.run('CTH-DLA-TR01', 'Transformateur TR-01', 'TRANSFORMATEUR', c1, null, 'EN_SERVICE', 'HAUTE', 40, 'Schneider', 'TRIHAL', 'SN-1001', '2015-03-10', 'Transformateur élévateur');

    // Centrale 2 : unité > groupe > équipements
    const u2 = insertActif.run('CHY-SGL-U1', 'Unité de production 1', 'UNITE_PRODUCTION', c2, null, 'EN_SERVICE', 'HAUTE', 0, null, null, null, '2000-01-01', null).lastInsertRowid;
    const g3 = insertActif.run('CHY-SGL-U1-G1', 'Groupe de production G1', 'GROUPE_PRODUCTION', c2, u2, 'EN_SERVICE', 'HAUTE', 0, null, null, null, '2000-01-15', null).lastInsertRowid;
    const turbine3 = insertActif.run('CHY-SGL-U1-G1-TB', 'Turbine hydraulique TH-01', 'TURBINE', c2, g3, 'EN_SERVICE', 'CRITIQUE', 150, 'Alstom', 'Kaplan-K4', 'SN-7001', '2000-01-15', 'Turbine Kaplan groupe 1').lastInsertRowid;
    insertActif.run('CHY-SGL-U1-G1-AL', 'Alternateur ALT-01', 'ALTERNATEUR', c2, turbine3, 'EN_SERVICE', 'HAUTE', 0, 'Alstom', 'AL-900', 'SN-7002', '2000-01-15', null);
    insertActif.run('CHY-SGL-U1-G1-VG', 'Vanne de garde VG-01', 'VANNE', c2, turbine3, 'EN_SERVICE', 'MOYENNE', 0, 'Voith', 'VG-200', 'SN-7003', '2000-01-15', null);

    insertActif.run('CHY-SGL-U1-G2-TB', 'Turbine hydraulique TH-02', 'TURBINE', c2, null, 'EN_SERVICE', 'HAUTE', 140, 'Alstom', 'Kaplan-K4', 'SN-7010', '2001-05-02', null);
    insertActif.run('CHY-SGL-PC01', 'Pompe de refroidissement PC-01', 'POMPE', c2, null, 'EN_SERVICE', 'MOYENNE', 0, 'Grundfos', 'NB-150', 'SN-3001', '2001-05-02', null);

    // Centrale 3 : équipements de premier niveau
    insertActif.run('CSO-MRA-CH-A', 'Champ photovoltaïque A', 'PANNEAU_SOLAIRE', c3, null, 'EN_SERVICE', 'MOYENNE', 45, 'Jinko Solar', 'Tiger Pro', 'SN-5001', '2020-11-01', 'Bloc A de 45 MWc');
    insertActif.run('CSO-MRA-OND01', 'Onduleur OND-01', 'ONDULEUR', c3, null, 'EN_SERVICE', 'HAUTE', 30, 'SMA', 'Sunny Central', 'SN-5010', '2020-11-01', null);
  } else {
    const rows = db.prepare('SELECT id, code FROM centrales').all();
    c1 = rows.find((r) => r.code === 'CTH-DLA')?.id;
    c2 = rows.find((r) => r.code === 'CHY-SGL')?.id;
    c3 = rows.find((r) => r.code === 'CSO-MRA')?.id;
  }

  const { count: nbUsers } = db.prepare('SELECT COUNT(*) AS count FROM utilisateurs').get();
  if (nbUsers === 0) {
    const insertUser = db.prepare(`
      INSERT INTO utilisateurs (nom, email, mot_de_passe_hash, role, centrale_id)
      VALUES (?, ?, ?, ?, ?)
    `);
    insertUser.run('Alice Administrateur', 'admin@centrale.local', hashPassword('admin123'), 'ADMINISTRATEUR', null);
    insertUser.run('Marc Mécanique (Douala)', 'mecanique.douala@centrale.local', hashPassword('mecanique123'), 'RESPONSABLE_MECANIQUE', c1);
    insertUser.run('Élise Exploitation (Douala)', 'exploitation.douala@centrale.local', hashPassword('exploitation123'), 'RESPONSABLE_EXPLOITATION', c1);
    insertUser.run('Chef Centrale Douala', 'chef.douala@centrale.local', hashPassword('chefcentrale123'), 'CHEF_CENTRALE', c1);
    insertUser.run('Paul Mécanique (Song Loulou)', 'mecanique.songloulou@centrale.local', hashPassword('mecanique123'), 'RESPONSABLE_MECANIQUE', c2);
    insertUser.run('Nadège Exploitation (Song Loulou)', 'exploitation.songloulou@centrale.local', hashPassword('exploitation123'), 'RESPONSABLE_EXPLOITATION', c2);
    insertUser.run('Chef Centrale Song Loulou', 'chef.songloulou@centrale.local', hashPassword('chefcentrale123'), 'CHEF_CENTRALE', c2);
  }
}

seedIfEmpty();
