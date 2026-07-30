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
