import { randomBytes } from 'node:crypto';
import { db } from '../db.js';
import { HttpError } from './miniweb.js';

const SESSION_COOKIE = 'sid';
const SESSION_DURATION_MS = 7 * 24 * 60 * 60 * 1000; // 7 jours

export const ROLES = ['ADMINISTRATEUR', 'RESPONSABLE_MECANIQUE', 'RESPONSABLE_EXPLOITATION', 'CHEF_CENTRALE'];

// Peut créer/modifier/supprimer des centrales et des actifs (référentiel), gérer les utilisateurs.
export const ROLES_GESTION_REFERENTIEL = ['ADMINISTRATEUR'];

// Peut créer des demandes de retrait / déplacement / décommissionnement / remise en service.
export const ROLES_DEMANDEUR = ['ADMINISTRATEUR', 'RESPONSABLE_MECANIQUE'];

// Peut vérifier la pertinence d'une demande (2e étape) : rejeter ou transmettre au Chef Centrale.
export const ROLES_EXPLOITATION = ['ADMINISTRATEUR', 'RESPONSABLE_EXPLOITATION'];

// Peut donner l'approbation finale (= exécution immédiate) d'une demande transmise, pour sa centrale.
export const ROLES_APPROBATION_FINALE = ['ADMINISTRATEUR', 'CHEF_CENTRALE'];

// Peut réaliser les actions opérationnelles directes (maintenance/réparation), sur sa centrale pour le Chef Centrale.
export const ROLES_OPERATION_DIRECTE = ['ADMINISTRATEUR', 'CHEF_CENTRALE'];

// Rôle dont la visibilité est cantonnée à une seule centrale (via utilisateurs.centrale_id).
export const ROLE_CENTRALE_SCOPE = 'CHEF_CENTRALE';

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
    .prepare('SELECT id, nom, email, role, centrale_id, actif FROM utilisateurs WHERE id = ?')
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

// Retourne l'id de centrale auquel restreindre la visibilité de l'utilisateur, ou null si vue globale.
export function centraleScopeId(user) {
  return user.role === ROLE_CENTRALE_SCOPE ? user.centrale_id : null;
}

export function requireCentraleAccess(user, centraleId) {
  const scope = centraleScopeId(user);
  if (scope && Number(scope) !== Number(centraleId)) {
    throw new HttpError(403, "Vous n'avez accès qu'aux informations de votre centrale");
  }
}
