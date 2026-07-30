import { Router, HttpError } from '../lib/miniweb.js';
import { db } from '../db.js';
import { requireAuth, requireRole, ROLES, ROLE_CENTRALE_SCOPE } from '../lib/auth.js';
import { hashPassword } from '../lib/password.js';
import { logAudit } from '../lib/audit.js';
import { sendCsv, parseCsv } from '../lib/csv.js';

export const utilisateursRouter = new Router();

function publicUser(u) {
  return {
    id: u.id,
    nom: u.nom,
    email: u.email,
    role: u.role,
    centrale_id: u.centrale_id,
    centrale_nom: u.centrale_nom,
    actif: !!u.actif,
    created_at: u.created_at,
  };
}

function withCentraleNom(rows) {
  return rows.map((u) => {
    if (!u.centrale_id) return u;
    const c = db.prepare('SELECT nom FROM centrales WHERE id = ?').get(u.centrale_id);
    return { ...u, centrale_nom: c?.nom ?? null };
  });
}

utilisateursRouter.get('/', (req, res) => {
  requireRole(req, ['ADMINISTRATEUR']);
  const rows = db.prepare('SELECT * FROM utilisateurs ORDER BY nom').all();
  res.json(withCentraleNom(rows).map(publicUser));
});

utilisateursRouter.post('/', (req, res) => {
  const acteur = requireRole(req, ['ADMINISTRATEUR']);
  const { nom, email, password, role, centraleId } = req.body;
  if (!nom || !email || !password) throw new HttpError(400, 'nom, email et password sont requis');
  if (!ROLES.includes(role)) throw new HttpError(400, `role invalide (attendu : ${ROLES.join(', ')})`);
  if (role === ROLE_CENTRALE_SCOPE && !centraleId) {
    throw new HttpError(400, 'Un Chef Centrale doit être rattaché à une centrale');
  }

  const existant = db.prepare('SELECT id FROM utilisateurs WHERE email = ?').get(email.toLowerCase().trim());
  if (existant) throw new HttpError(409, 'Un utilisateur avec cet email existe déjà');

  const info = db
    .prepare('INSERT INTO utilisateurs (nom, email, mot_de_passe_hash, role, centrale_id) VALUES (?, ?, ?, ?, ?)')
    .run(nom, email.toLowerCase().trim(), hashPassword(password), role, role === ROLE_CENTRALE_SCOPE ? centraleId : null);
  const user = db.prepare('SELECT * FROM utilisateurs WHERE id = ?').get(info.lastInsertRowid);
  logAudit({ type: 'UTILISATEUR_CREE', description: `Utilisateur "${user.nom}" (${user.role}) créé`, acteur, cibleType: 'UTILISATEUR', cibleId: user.id });
  res.status(201).json(publicUser(withCentraleNom([user])[0]));
});

const EXPORT_COLUMNS = [
  { key: 'nom', label: 'nom' },
  { key: 'email', label: 'email' },
  { key: 'role', label: 'role' },
  { key: 'centrale_code', label: 'centrale_code' },
  { key: 'actif', label: 'actif' },
];

utilisateursRouter.get('/export', (req, res) => {
  requireRole(req, ['ADMINISTRATEUR']);
  const rows = db
    .prepare(
      `SELECT u.nom, u.email, u.role, u.actif, c.code AS centrale_code
       FROM utilisateurs u
       LEFT JOIN centrales c ON c.id = u.centrale_id
       ORDER BY u.nom`
    )
    .all()
    .map((u) => ({ ...u, actif: u.actif ? 'oui' : 'non' }));
  sendCsv(res, 'utilisateurs.csv', rows, EXPORT_COLUMNS);
});

utilisateursRouter.post('/import', (req, res) => {
  const acteur = requireRole(req, ['ADMINISTRATEUR']);
  const rows = parseCsv(req.body?.csv);
  if (!rows.length) throw new HttpError(400, 'Fichier CSV vide ou illisible');

  let crees = 0;
  let misAJour = 0;
  const erreurs = [];

  rows.forEach((row, idx) => {
    const ligne = idx + 2;
    const nom = row.nom?.trim();
    const email = row.email?.trim().toLowerCase();
    const role = row.role?.trim();
    if (!nom || !email || !role) {
      erreurs.push(`Ligne ${ligne} : nom, email et role sont requis`);
      return;
    }
    if (!ROLES.includes(role)) {
      erreurs.push(`Ligne ${ligne} (${email}) : role "${role}" invalide`);
      return;
    }
    let centraleId = null;
    if (role === ROLE_CENTRALE_SCOPE) {
      const centraleCode = row.centrale_code?.trim();
      if (!centraleCode) {
        erreurs.push(`Ligne ${ligne} (${email}) : centrale_code requis pour le rôle ${ROLE_CENTRALE_SCOPE}`);
        return;
      }
      const centrale = db.prepare('SELECT id FROM centrales WHERE code = ?').get(centraleCode);
      if (!centrale) {
        erreurs.push(`Ligne ${ligne} (${email}) : centrale_code "${centraleCode}" introuvable`);
        return;
      }
      centraleId = centrale.id;
    }
    const actif = row.actif ? /^(oui|true|1)$/i.test(row.actif.trim()) : true;

    const existant = db.prepare('SELECT id FROM utilisateurs WHERE email = ?').get(email);
    if (existant) {
      db.prepare('UPDATE utilisateurs SET nom = ?, role = ?, centrale_id = ?, actif = ? WHERE id = ?').run(
        nom,
        role,
        centraleId,
        actif ? 1 : 0,
        existant.id
      );
      if (row.password) {
        db.prepare('UPDATE utilisateurs SET mot_de_passe_hash = ? WHERE id = ?').run(hashPassword(row.password), existant.id);
      }
      misAJour++;
    } else {
      if (!row.password) {
        erreurs.push(`Ligne ${ligne} (${email}) : password requis pour la création d'un nouvel utilisateur`);
        return;
      }
      db.prepare(
        'INSERT INTO utilisateurs (nom, email, mot_de_passe_hash, role, centrale_id, actif) VALUES (?, ?, ?, ?, ?, ?)'
      ).run(nom, email, hashPassword(row.password), role, centraleId, actif ? 1 : 0);
      crees++;
    }
  });

  logAudit({
    type: 'UTILISATEURS_IMPORTES',
    description: `Import CSV utilisateurs : ${crees} créé(s), ${misAJour} mis à jour, ${erreurs.length} erreur(s)`,
    acteur,
  });

  res.json({ crees, misAJour, erreurs });
});

utilisateursRouter.put('/:id', (req, res) => {
  const acteur = requireRole(req, ['ADMINISTRATEUR']);
  const user = db.prepare('SELECT * FROM utilisateurs WHERE id = ?').get(req.params.id);
  if (!user) throw new HttpError(404, 'Utilisateur introuvable');
  const { nom, role, actif, password, centraleId } = req.body;

  if (role && !ROLES.includes(role)) throw new HttpError(400, `role invalide (attendu : ${ROLES.join(', ')})`);
  const roleFinal = role ?? user.role;
  if (roleFinal === ROLE_CENTRALE_SCOPE && !(centraleId ?? user.centrale_id)) {
    throw new HttpError(400, 'Un Chef Centrale doit être rattaché à une centrale');
  }

  const perdLeRoleAdmin = user.role === 'ADMINISTRATEUR' && ((role && role !== 'ADMINISTRATEUR') || actif === false);
  if (perdLeRoleAdmin) {
    const nbAdminsActifs = db
      .prepare("SELECT COUNT(*) AS n FROM utilisateurs WHERE role = 'ADMINISTRATEUR' AND actif = 1 AND id != ?")
      .get(user.id).n;
    if (nbAdminsActifs === 0) {
      throw new HttpError(400, 'Impossible de retirer le dernier administrateur actif');
    }
  }

  db.prepare(
    `UPDATE utilisateurs SET nom = ?, role = ?, centrale_id = ?, actif = ?, mot_de_passe_hash = ? WHERE id = ?`
  ).run(
    nom ?? user.nom,
    roleFinal,
    roleFinal === ROLE_CENTRALE_SCOPE ? centraleId ?? user.centrale_id : null,
    actif === undefined ? user.actif : actif ? 1 : 0,
    password ? hashPassword(password) : user.mot_de_passe_hash,
    user.id
  );
  logAudit({ type: 'UTILISATEUR_MODIFIE', description: `Utilisateur "${user.nom}" modifié`, acteur, cibleType: 'UTILISATEUR', cibleId: user.id });
  res.json(publicUser(withCentraleNom([db.prepare('SELECT * FROM utilisateurs WHERE id = ?').get(user.id)])[0]));
});

utilisateursRouter.delete('/:id', (req, res) => {
  const acteur = requireAuth(req);
  requireRole(req, ['ADMINISTRATEUR']);
  const user = db.prepare('SELECT * FROM utilisateurs WHERE id = ?').get(req.params.id);
  if (!user) throw new HttpError(404, 'Utilisateur introuvable');
  if (user.id === acteur.id) throw new HttpError(400, 'Vous ne pouvez pas supprimer votre propre compte');
  if (user.role === 'ADMINISTRATEUR') {
    const nbAdminsActifs = db
      .prepare("SELECT COUNT(*) AS n FROM utilisateurs WHERE role = 'ADMINISTRATEUR' AND actif = 1 AND id != ?")
      .get(user.id).n;
    if (nbAdminsActifs === 0) throw new HttpError(400, 'Impossible de supprimer le dernier administrateur');
  }
  try {
    db.prepare('DELETE FROM utilisateurs WHERE id = ?').run(user.id);
  } catch (err) {
    if (/FOREIGN KEY/i.test(err.message)) {
      throw new HttpError(400, "Impossible de supprimer cet utilisateur : il est référencé dans l'historique des demandes. Désactivez-le plutôt.");
    }
    throw err;
  }
  logAudit({ type: 'UTILISATEUR_SUPPRIME', description: `Utilisateur "${user.nom}" (${user.email}) supprimé`, acteur, cibleType: 'UTILISATEUR', cibleId: user.id });
  res.status(204).end();
});
