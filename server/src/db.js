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

db.exec(`
  PRAGMA foreign_keys = ON;

  CREATE TABLE IF NOT EXISTS centrales (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    nom TEXT NOT NULL,
    type TEXT NOT NULL DEFAULT 'THERMIQUE',
    localisation TEXT,
    capacite_nominale_mw REAL NOT NULL DEFAULT 0,
    seuil_alerte_pct REAL NOT NULL DEFAULT 70,
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS actifs (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    nom TEXT NOT NULL,
    type TEXT NOT NULL DEFAULT 'EQUIPEMENT',
    centrale_id INTEGER NOT NULL REFERENCES centrales(id) ON DELETE CASCADE,
    parent_id INTEGER REFERENCES actifs(id) ON DELETE CASCADE,
    statut TEXT NOT NULL DEFAULT 'EN_SERVICE',
    criticite TEXT NOT NULL DEFAULT 'MOYENNE',
    contribution_mw REAL NOT NULL DEFAULT 0,
    date_installation TEXT,
    description TEXT,
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
    role TEXT NOT NULL DEFAULT 'DEMANDEUR',
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
    actif_id INTEGER NOT NULL,
    actif_nom TEXT NOT NULL,
    centrale_source_id INTEGER NOT NULL,
    centrale_source_nom TEXT NOT NULL,
    centrale_dest_id INTEGER,
    centrale_dest_nom TEXT,
    statut TEXT NOT NULL DEFAULT 'EN_ATTENTE',
    motif TEXT,
    simulation TEXT NOT NULL DEFAULT '{}',
    demandeur_id INTEGER NOT NULL REFERENCES utilisateurs(id),
    demandeur_nom TEXT NOT NULL,
    validateur_id INTEGER REFERENCES utilisateurs(id),
    validateur_nom TEXT,
    commentaire_validation TEXT,
    date_validation TEXT,
    date_execution TEXT,
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
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
  );

  CREATE INDEX IF NOT EXISTS idx_actifs_centrale ON actifs(centrale_id);
  CREATE INDEX IF NOT EXISTS idx_actifs_parent ON actifs(parent_id);
  CREATE INDEX IF NOT EXISTS idx_mouvements_actif ON mouvements(actif_id);
  CREATE INDEX IF NOT EXISTS idx_demandes_statut ON demandes(statut);
  CREATE INDEX IF NOT EXISTS idx_demandes_actif ON demandes(actif_id);
  CREATE INDEX IF NOT EXISTS idx_sessions_utilisateur ON sessions(utilisateur_id);
  CREATE INDEX IF NOT EXISTS idx_notifications_utilisateur ON notifications(utilisateur_id);
  CREATE INDEX IF NOT EXISTS idx_audit_log_cible ON audit_log(cible_type, cible_id);
`);

function seedIfEmpty() {
  const { count } = db.prepare('SELECT COUNT(*) AS count FROM centrales').get();
  if (count === 0) {
    const insertCentrale = db.prepare(`
      INSERT INTO centrales (nom, type, localisation, capacite_nominale_mw, seuil_alerte_pct)
      VALUES (?, ?, ?, ?, ?)
    `);
    const c1 = insertCentrale.run('Centrale Thermique de Douala', 'THERMIQUE', 'Douala', 250, 70).lastInsertRowid;
    const c2 = insertCentrale.run('Barrage Hydroélectrique de Song Loulou', 'HYDRAULIQUE', 'Song Loulou', 400, 70).lastInsertRowid;
    const c3 = insertCentrale.run('Centrale Solaire de Maroua', 'SOLAIRE', 'Maroua', 100, 65).lastInsertRowid;

    const insertActif = db.prepare(`
      INSERT INTO actifs (nom, type, centrale_id, parent_id, statut, criticite, contribution_mw, date_installation, description)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);

    const turbine1 = insertActif.run('Turbine à gaz TG-01', 'TURBINE', c1, null, 'EN_SERVICE', 'CRITIQUE', 80, '2015-03-10', 'Turbine principale du groupe 1').lastInsertRowid;
    insertActif.run('Générateur GEN-01', 'GENERATEUR', c1, turbine1, 'EN_SERVICE', 'HAUTE', 0, '2015-03-10', 'Générateur associé à TG-01');
    insertActif.run('Capteur de vibration CV-01', 'CAPTEUR', c1, turbine1, 'EN_SERVICE', 'FAIBLE', 0, '2015-03-10', 'Capteur de surveillance');

    const turbine2 = insertActif.run('Turbine à gaz TG-02', 'TURBINE', c1, null, 'EN_SERVICE', 'HAUTE', 70, '2016-06-20', 'Turbine du groupe 2').lastInsertRowid;
    insertActif.run('Générateur GEN-02', 'GENERATEUR', c1, turbine2, 'EN_MAINTENANCE', 'MOYENNE', 0, '2016-06-20', 'En maintenance planifiée');

    insertActif.run('Transformateur TR-01', 'TRANSFORMATEUR', c1, null, 'EN_SERVICE', 'HAUTE', 40, '2015-03-10', 'Transformateur élévateur');

    const turbine3 = insertActif.run('Turbine hydraulique TH-01', 'TURBINE', c2, null, 'EN_SERVICE', 'CRITIQUE', 150, '2000-01-15', 'Turbine Kaplan groupe 1').lastInsertRowid;
    insertActif.run('Alternateur ALT-01', 'ALTERNATEUR', c2, turbine3, 'EN_SERVICE', 'HAUTE', 0, '2000-01-15', null);
    insertActif.run('Vanne de garde VG-01', 'VANNE', c2, turbine3, 'EN_SERVICE', 'MOYENNE', 0, '2000-01-15', null);

    insertActif.run('Turbine hydraulique TH-02', 'TURBINE', c2, null, 'EN_SERVICE', 'HAUTE', 140, '2001-05-02', null);
    insertActif.run('Pompe de refroidissement PC-01', 'POMPE', c2, null, 'EN_SERVICE', 'MOYENNE', 0, '2001-05-02', null);

    insertActif.run('Champ photovoltaïque A', 'PANNEAU_SOLAIRE', c3, null, 'EN_SERVICE', 'MOYENNE', 45, '2020-11-01', 'Bloc A de 45 MWc');
    insertActif.run('Onduleur OND-01', 'ONDULEUR', c3, null, 'EN_SERVICE', 'HAUTE', 30, '2020-11-01', null);
  }

  const { count: nbUsers } = db.prepare('SELECT COUNT(*) AS count FROM utilisateurs').get();
  if (nbUsers === 0) {
    const insertUser = db.prepare(`
      INSERT INTO utilisateurs (nom, email, mot_de_passe_hash, role)
      VALUES (?, ?, ?, ?)
    `);
    insertUser.run('Administrateur', 'admin@centrale.local', hashPassword('admin123'), 'ADMINISTRATEUR');
    insertUser.run('Responsable Validation', 'validateur@centrale.local', hashPassword('validateur123'), 'VALIDATEUR');
    insertUser.run('Agent Technique', 'demandeur@centrale.local', hashPassword('demandeur123'), 'DEMANDEUR');
  }
}

seedIfEmpty();
