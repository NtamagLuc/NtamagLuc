import { db } from '../db.js';

export function logAudit({ type, description, acteur, cibleType = null, cibleId = null }) {
  db.prepare(
    `INSERT INTO audit_log (type, description, acteur_id, acteur_nom, cible_type, cible_id)
     VALUES (?, ?, ?, ?, ?, ?)`
  ).run(type, description, acteur?.id ?? null, acteur?.nom ?? null, cibleType, cibleId);
}
