import { randomBytes } from 'node:crypto';
import { db } from '../db.js';
import { HttpError } from './miniweb.js';

const SESSION_COOKIE = 'sid';
const SESSION_DURATION_MS = 7 * 24 * 60 * 60 * 1000; // 7 jours

export const ROLES = [
  'ADMINISTRATEUR',
  'GESTIONNAIRE_ACTIFS',
  'RESPONSABLE_CENTRALE',
  'RESPONSABLE_PRODUCTION',
  'VALIDATEUR',
  'UTILISATEUR_CONSULTATION',
];

// Peut créer/modifier/supprimer des centrales et des actifs (référentiel).
export const ROLES_GESTION_REFERENTIEL = ['ADMINISTRATEUR', 'GESTIONNAIRE_ACTIFS'];

// Peut créer des demandes de retrait / déplacement / décommissionnement / remise en service.
export const ROLES_DEMANDEUR = [
  'ADMINISTRATEUR',
  'GESTIONNAIRE_ACTIFS',
  'RESPONSABLE_CENTRALE',
  'RESPONSABLE_PRODUCTION',
  'VALIDATEUR',
];

// Peut approuver/rejeter une demande.
export const ROLES_VALIDATION = ['ADMINISTRATEUR', 'VALIDATEUR'];

// Peut exécuter une demande approuvée.
export const ROLES_EXECUTION = ['ADMINISTRATEUR', 'VALIDATEUR', 'GESTIONNAIRE_ACTIFS'];

// Peut réaliser les actions opérationnelles directes (maintenance/réparation).
export const ROLES_OPERATION_DIRECTE = ['ADMINISTRATEUR', 'GESTIONNAIRE_ACTIFS', 'RESPONSABLE_CENTRALE'];

export function createSession(userId) {
  const id = randomBytes(32).toString('hex');
  const expiresAt = new Date(Date.now() + SESSION_DURATION_MS).toISOString();
  db.prepare('INSERT INTO sessions (id, utilisateur_id, expires_at) VALUES (?, ?, ?)').run(id, userId, expiresAt);
  return { id, expiresAt };
}

export function destroySession(sessionId) {
  if (!sessionId) return;
  db.prepare('DELETE FROM sessions WHERE id = ?').run(sessionId);
}

export function parseCookies(req) {
  const header = req.headers.cookie;
  const cookies = {};
  if (!header) return cookies;
  for (const part of header.split(';')) {
    const idx = part.indexOf('=');
    if (idx === -1) continue;
    const key = part.slice(0, idx).trim();
    const value = part.slice(idx + 1).trim();
    cookies[key] = decodeURIComponent(value);
  }
  return cookies;
}

export function setSessionCookie(res, sessionId, expiresAt) {
  const expires = new Date(expiresAt).toUTCString();
  res.setHeader('Set-Cookie', `${SESSION_COOKIE}=${sessionId}; Path=/; HttpOnly; SameSite=Lax; Expires=${expires}`);
}

export function clearSessionCookie(res) {
  res.setHeader('Set-Cookie', `${SESSION_COOKIE}=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0`);
}

export function resolveUser(req) {
  const cookies = parseCookies(req);
  const sessionId = cookies[SESSION_COOKIE];
  if (!sessionId) return null;

  const session = db.prepare('SELECT * FROM sessions WHERE id = ?').get(sessionId);
  if (!session) return null;
  if (new Date(session.expires_at) < new Date()) {
    db.prepare('DELETE FROM sessions WHERE id = ?').run(sessionId);
    return null;
  }

  const user = db
    .prepare('SELECT id, nom, email, role, actif FROM utilisateurs WHERE id = ?')
    .get(session.utilisateur_id);
  if (!user || !user.actif) return null;
  return { ...user, sessionId };
}

export function requireAuth(req) {
  if (!req.user) throw new HttpError(401, 'Authentification requise');
  return req.user;
}

export function requireRole(req, roles) {
  const user = requireAuth(req);
  if (!roles.includes(user.role)) {
    throw new HttpError(403, "Vous n'avez pas les droits nécessaires pour cette action");
  }
  return user;
}
