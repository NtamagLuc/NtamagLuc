import { Router, HttpError } from '../lib/miniweb.js';
import { db } from '../db.js';
import { verifyPassword } from '../lib/password.js';
import { createSession, destroySession, setSessionCookie, clearSessionCookie, requireAuth } from '../lib/auth.js';

export const authRouter = new Router();

function publicUser(u) {
  return { id: u.id, nom: u.nom, email: u.email, role: u.role, centrale_id: u.centrale_id ?? null };
}

authRouter.post('/login', (req, res) => {
  const { email, password } = req.body;
  if (!email || !password) throw new HttpError(400, 'Email et mot de passe requis');

  const user = db.prepare('SELECT * FROM utilisateurs WHERE email = ?').get(email.toLowerCase().trim());
  if (!user || !user.actif || !verifyPassword(password, user.mot_de_passe_hash)) {
    throw new HttpError(401, 'Identifiants invalides');
  }

  const session = createSession(user.id);
  setSessionCookie(res, session.id, session.expiresAt);
  res.json(publicUser(user));
});

authRouter.post('/logout', (req, res) => {
  if (req.user) destroySession(req.user.sessionId);
  clearSessionCookie(res);
  res.status(204).end();
});

authRouter.get('/me', (req, res) => {
  const user = requireAuth(req);
  res.json(publicUser(user));
});
