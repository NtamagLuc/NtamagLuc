import { db } from '../db.js';

export function insertMouvement({
  demandeId = null,
  actifId,
  actifNom,
  type,
  centraleSource,
  centraleDest,
  scoreSourceAvant,
  scoreSourceApres,
  scoreDestAvant = null,
  scoreDestApres = null,
  nbActifsImpactes,
  alertes,
  commentaire = null,
  executeur,
}) {
  const info = db
    .prepare(
      `INSERT INTO mouvements (
        demande_id, actif_id, actif_nom, type,
        centrale_source_id, centrale_source_nom,
        centrale_dest_id, centrale_dest_nom,
        score_source_avant, score_source_apres,
        score_dest_avant, score_dest_apres,
        nb_actifs_impactes, alertes, commentaire,
        executeur_id, executeur_nom
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    )
    .run(
      demandeId,
      actifId,
      actifNom,
      type,
      centraleSource?.id ?? null,
      centraleSource?.nom ?? null,
      centraleDest?.id ?? null,
      centraleDest?.nom ?? null,
      scoreSourceAvant,
      scoreSourceApres,
      scoreDestAvant,
      scoreDestApres,
      nbActifsImpactes,
      JSON.stringify(alertes),
      commentaire,
      executeur?.id ?? null,
      executeur?.nom ?? null
    );
  return deserializeMouvement(db.prepare('SELECT * FROM mouvements WHERE id = ?').get(info.lastInsertRowid));
}

export function deserializeMouvement(m) {
  if (!m) return m;
  return { ...m, alertes: JSON.parse(m.alertes) };
}
