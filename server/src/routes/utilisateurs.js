import { Router, HttpError } from '../lib/miniweb.js';
import { db } from '../db.js';
import { requireRole } from '../lib/auth.js';
import { hashPassword } from '../lib/password.js';
import { ROLES } from '../lib/auth.js';
import { logAudit } from '../lib/audit.js';

export const utilisateursRouter = new Router();

function publicUser(u) {
  return { id: u.id, nom: u.nom, email: u.email, role: u.role, actif: !!u.actif, created_at: u.created_at };
}

utilisateursRouter.get('/', (req, res) => {
  requireRole(req, ['ADMINISTRATEUR']);
  const rows = db.prepare('SELECT * FROM utilisateurs ORDER BY nom').all();
  res.json(rows.map(publicUser));
});

utilisateursRouter.post('/', (req, res) => {
  const acteur = requireRole(req, ['ADMINISTRATEUR']);
  const { nom, email, password, role } = req.body;
  if (!nom || !email || !password) throw new HttpError(400, 'nom, email et password sont requis');
  if (!ROLES.includes(role)) throw new HttpError(400, `role invalide (attendu : ${ROLES.join(', ')})`);

  const existant = db.prepare('SELECT id FROM utilisateurs WHERE email = ?').get(email.toLowerCase().trim());
  if (existant) throw new HttpError(409, 'Un utilisateur avec cet email existe déjà');

  const info = db
    .prepare('INSERT INTO utilisateurs (nom, email, mot_de_passe_hash, role) VALUES (?, ?, ?, ?)')
    .run(nom, email.toLowerCase().trim(), hashPassword(password), role);
  const user = db.prepare('SELECT * FROM utilisateurs WHERE id = ?').get(info.lastInsertRowid);
  logAudit({ type: 'UTILISATEUR_CREE', description: `Utilisateur "${user.nom}" (${user.role}) créé`, acteur, cibleType: 'UTILISATEUR', cibleId: user.id });
  res.status(201).json(publicUser(user));
});

utilisateursRouter.put('/:id', (req, res) => {
  const acteur = requireRole(req, ['ADMINISTRATEUR']);
  const user = db.prepare('SELECT * FROM utilisateurs WHERE id = ?').get(req.params.id);
  if (!user) throw new HttpError(404, 'Utilisateur introuvable');
  const { nom, role, actif, password } = req.body;

  if (role && !ROLES.includes(role)) throw new HttpError(400, `role invalide (attendu : ${ROLES.join(', ')})`);

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
    `UPDATE utilisateurs SET nom = ?, role = ?, actif = ?, mot_de_passe_hash = ? WHERE id = ?`
  ).run(
    nom ?? user.nom,
    role ?? user.role,
    actif === undefined ? user.actif : actif ? 1 : 0,
    password ? hashPassword(password) : user.mot_de_passe_hash,
    user.id
  );
  logAudit({ type: 'UTILISATEUR_MODIFIE', description: `Utilisateur "${user.nom}" modifié`, acteur, cibleType: 'UTILISATEUR', cibleId: user.id });
  res.json(publicUser(db.prepare('SELECT * FROM utilisateurs WHERE id = ?').get(user.id)));
});
