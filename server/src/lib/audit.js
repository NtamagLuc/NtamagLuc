import { db } from '../db.js';

export function logAudit({ type, description, acteur, cibleType = null, cibleId = null, centraleId = null, donnees = null }) {
  db.prepare(
    `INSERT INTO audit_log (type, description, acteur_id, acteur_nom, cible_type, cible_id, centrale_id, donnees)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
  ).run(type, description, acteur?.id ?? null, acteur?.nom ?? null, cibleType, cibleId, centraleId, donnees ? JSON.stringify(donnees) : null);
}

// Calcule un diff {champ: {avant, apres}} entre deux objets pour un ensemble de clés données.
export function diffChamps(avant, apres, champs) {
  const diff = {};
  for (const champ of champs) {
    if (avant[champ] !== apres[champ]) {
      diff[champ] = { avant: avant[champ], apres: apres[champ] };
    }
  }
  return diff;
}
