import { db } from '../db.js';

export function notifyUser(userId, type, message, lien = null) {
  db.prepare(
    `INSERT INTO notifications (utilisateur_id, role_cible, type, message, lien) VALUES (?, NULL, ?, ?, ?)`
  ).run(userId, type, message, lien);
}

export function notifyRole(role, type, message, lien = null) {
  db.prepare(
    `INSERT INTO notifications (utilisateur_id, role_cible, type, message, lien) VALUES (NULL, ?, ?, ?, ?)`
  ).run(role, type, message, lien);
}

// Notifie individuellement chaque utilisateur d'un rôle cantonné à une centrale donnée
// (role_cible seul ne suffit pas ici puisque ces rôles sont rattachés à une centrale précise :
// CHEF_CENTRALE, RESPONSABLE_MECANIQUE, RESPONSABLE_EXPLOITATION).
export function notifyRoleCentrale(role, centraleId, type, message, lien = null) {
  const utilisateurs = db
    .prepare('SELECT id FROM utilisateurs WHERE role = ? AND centrale_id = ? AND actif = 1')
    .all(role, centraleId);
  for (const u of utilisateurs) notifyUser(u.id, type, message, lien);
}
