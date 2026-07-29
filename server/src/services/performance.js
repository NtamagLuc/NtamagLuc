import { db } from '../db.js';

const STATUT_WEIGHT = {
  EN_SERVICE: 1,
  EN_MAINTENANCE: 0.5,
  RETIRE: 0,
};

export function scoreFromActifs(actifs, capaciteNominaleMw) {
  const puissanceEffective = actifs.reduce(
    (sum, a) => sum + a.contribution_mw * (STATUT_WEIGHT[a.statut] ?? 0),
    0
  );
  const pct = capaciteNominaleMw > 0 ? (puissanceEffective / capaciteNominaleMw) * 100 : 0;
  return {
    puissanceEffectiveMw: round2(puissanceEffective),
    performancePct: round2(Math.min(100, Math.max(0, pct))),
    surcapacite: pct > 100,
  };
}

export function getCentraleActifs(centraleId) {
  return db.prepare('SELECT * FROM actifs WHERE centrale_id = ?').all(centraleId);
}

export function getCentrale(centraleId) {
  return db.prepare('SELECT * FROM centrales WHERE id = ?').get(centraleId);
}

export function computeCentralePerformance(centraleId) {
  const centrale = getCentrale(centraleId);
  if (!centrale) return null;
  const actifs = getCentraleActifs(centraleId);
  return { centrale, ...scoreFromActifs(actifs, centrale.capacite_nominale_mw) };
}

// Retourne l'actif + tous ses descendants (récursif), actif mère inclus en premier.
export function getActifAvecDescendants(actifId) {
  const all = [];
  const stack = [actifId];
  while (stack.length) {
    const id = stack.pop();
    const actif = db.prepare('SELECT * FROM actifs WHERE id = ?').get(id);
    if (!actif) continue;
    all.push(actif);
    const enfants = db.prepare('SELECT id FROM actifs WHERE parent_id = ?').all(id);
    for (const e of enfants) stack.push(e.id);
  }
  return all;
}

function round2(n) {
  return Math.round(n * 100) / 100;
}

/**
 * Simule le retrait (mise hors service) d'un actif et de ses descendants
 * sur la performance de sa centrale, sans rien persister.
 */
export function simulerRetrait(actifId) {
  const racine = db.prepare('SELECT * FROM actifs WHERE id = ?').get(actifId);
  if (!racine) throw new HttpError(404, 'Actif introuvable');

  const descendants = getActifAvecDescendants(actifId);
  const descendantIds = new Set(descendants.map((a) => a.id));

  const centrale = getCentrale(racine.centrale_id);
  const actifsCentrale = getCentraleActifs(racine.centrale_id);

  const avant = scoreFromActifs(actifsCentrale, centrale.capacite_nominale_mw);
  const actifsApres = actifsCentrale.map((a) =>
    descendantIds.has(a.id) ? { ...a, statut: 'RETIRE' } : a
  );
  const apres = scoreFromActifs(actifsApres, centrale.capacite_nominale_mw);

  const alertes = genererAlertes({
    action: 'RETRAIT',
    racine,
    descendants,
    centraleSource: centrale,
    scoreSourceAvant: avant.performancePct,
    scoreSourceApres: apres.performancePct,
  });

  return {
    actif: racine,
    descendants,
    centraleSource: centrale,
    centraleDest: null,
    scoreSourceAvant: avant.performancePct,
    scoreSourceApres: apres.performancePct,
    scoreDestAvant: null,
    scoreDestApres: null,
    alertes,
  };
}

/**
 * Simule le déplacement d'un actif (et ses descendants) d'une centrale vers une autre,
 * sans rien persister.
 */
export function simulerDeplacement(actifId, centraleDestId) {
  const racine = db.prepare('SELECT * FROM actifs WHERE id = ?').get(actifId);
  if (!racine) throw new HttpError(404, 'Actif introuvable');

  const centraleDest = getCentrale(centraleDestId);
  if (!centraleDest) throw new HttpError(404, 'Centrale de destination introuvable');
  if (centraleDest.id === racine.centrale_id) {
    throw new HttpError(400, "L'actif se trouve déjà dans cette centrale");
  }

  const descendants = getActifAvecDescendants(actifId);
  const descendantIds = new Set(descendants.map((a) => a.id));

  const centraleSource = getCentrale(racine.centrale_id);
  const actifsSource = getCentraleActifs(racine.centrale_id);
  const actifsDest = getCentraleActifs(centraleDestId);

  const sourceAvant = scoreFromActifs(actifsSource, centraleSource.capacite_nominale_mw);
  const destAvant = scoreFromActifs(actifsDest, centraleDest.capacite_nominale_mw);

  const sourceActifsApres = actifsSource.filter((a) => !descendantIds.has(a.id));
  const destActifsApres = [...actifsDest, ...descendants];

  const sourceApres = scoreFromActifs(sourceActifsApres, centraleSource.capacite_nominale_mw);
  const destApres = scoreFromActifs(destActifsApres, centraleDest.capacite_nominale_mw);

  const alertes = genererAlertes({
    action: 'DEPLACEMENT',
    racine,
    descendants,
    centraleSource,
    centraleDest,
    scoreSourceAvant: sourceAvant.performancePct,
    scoreSourceApres: sourceApres.performancePct,
    scoreDestAvant: destAvant.performancePct,
    scoreDestApres: destApres.performancePct,
  });

  return {
    actif: racine,
    descendants,
    centraleSource,
    centraleDest,
    scoreSourceAvant: sourceAvant.performancePct,
    scoreSourceApres: sourceApres.performancePct,
    scoreDestAvant: destAvant.performancePct,
    scoreDestApres: destApres.performancePct,
    alertes,
  };
}

function genererAlertes({
  action,
  racine,
  descendants,
  centraleSource,
  centraleDest,
  scoreSourceAvant,
  scoreSourceApres,
  scoreDestAvant,
  scoreDestApres,
}) {
  const alertes = [];
  const baisse = round2(scoreSourceAvant - scoreSourceApres);
  const enfants = descendants.filter((d) => d.id !== racine.id);

  if (racine.criticite === 'CRITIQUE') {
    alertes.push({
      severite: 'haute',
      message: `"${racine.nom}" est un actif critique : son ${
        action === 'RETRAIT' ? 'retrait' : 'déplacement'
      } peut affecter la sûreté ou la continuité de production de ${centraleSource.nom}.`,
    });
  }

  if (enfants.length > 0) {
    alertes.push({
      severite: 'moyenne',
      message: `Cet actif possède ${enfants.length} actif(s) enfant(s) (${enfants
        .map((e) => e.nom)
        .join(', ')}) qui seront ${action === 'RETRAIT' ? 'retirés' : 'déplacés'} avec lui.`,
    });
  }

  if (baisse >= 15) {
    alertes.push({
      severite: 'haute',
      message: `Baisse significative de performance de ${centraleSource.nom} : -${baisse} points (${scoreSourceAvant}% → ${scoreSourceApres}%).`,
    });
  } else if (baisse >= 5) {
    alertes.push({
      severite: 'moyenne',
      message: `Baisse modérée de performance de ${centraleSource.nom} : -${baisse} points (${scoreSourceAvant}% → ${scoreSourceApres}%).`,
    });
  }

  if (scoreSourceApres < centraleSource.seuil_alerte_pct) {
    alertes.push({
      severite: 'haute',
      message: `${centraleSource.nom} passerait sous son seuil de performance recommandé (${centraleSource.seuil_alerte_pct}%) avec un score de ${scoreSourceApres}%.`,
    });
  }

  if (action === 'DEPLACEMENT' && centraleDest) {
    const hausse = round2(scoreDestApres - scoreDestAvant);
    if (scoreDestApres >= 100) {
      alertes.push({
        severite: 'haute',
        message: `Risque de surcharge : la capacité nominale de ${centraleDest.nom} serait atteinte ou dépassée (${scoreDestApres}%).`,
      });
    } else if (hausse > 0) {
      alertes.push({
        severite: 'basse',
        message: `Amélioration de la performance de ${centraleDest.nom} : +${hausse} points (${scoreDestAvant}% → ${scoreDestApres}%).`,
      });
    }
  }

  if (alertes.length === 0) {
    alertes.push({ severite: 'basse', message: 'Aucun impact significatif détecté.' });
  }

  return alertes;
}

export class HttpError extends Error {
  constructor(status, message) {
    super(message);
    this.status = status;
  }
}
