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

// Notifie individuellement chaque Chef Centrale rattaché à une centrale donnée
// (role_cible ne suffit pas ici puisque ce rôle est cantonné à une centrale précise).
export function notifyChefsCentrale(centraleId, type, message, lien = null) {
  const chefs = db
    .prepare("SELECT id FROM utilisateurs WHERE role = 'CHEF_CENTRALE' AND centrale_id = ? AND actif = 1")
    .all(centraleId);
  for (const chef of chefs) notifyUser(chef.id, type, message, lien);
}
