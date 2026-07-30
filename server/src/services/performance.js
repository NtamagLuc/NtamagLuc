import { db } from '../db.js';
import { HttpError } from '../lib/miniweb.js';

const STATUT_WEIGHT = {
  EN_SERVICE: 1,
  EN_MAINTENANCE: 0.5,
  EN_REPARATION: 0.5,
  EN_TRANSFERT: 0,
  HORS_SERVICE: 0,
  DECOMMISSIONNE: 0,
  REFORME: 0,
};

const ACTION_LABELS = {
  RETRAIT: { verbe: 'retrait', participe: 'retirés', statutCible: 'HORS_SERVICE' },
  DECOMMISSIONNEMENT: { verbe: 'décommissionnement', participe: 'décommissionnés', statutCible: null },
  REMISE_EN_SERVICE: { verbe: 'remise en service', participe: 'remis en service', statutCible: 'EN_SERVICE' },
  DEPLACEMENT: { verbe: 'déplacement', participe: 'déplacés', statutCible: null },
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

export function computeParcPerformance() {
  const centrales = db.prepare('SELECT * FROM centrales').all();
  let nominale = 0;
  let effective = 0;
  for (const c of centrales) {
    const perf = computeCentralePerformance(c.id);
    nominale += c.capacite_nominale_mw;
    effective += perf.puissanceEffectiveMw;
  }
  const pct = nominale > 0 ? (effective / nominale) * 100 : 0;
  return {
    puissanceNominaleMw: round2(nominale),
    puissanceEffectiveMw: round2(effective),
    performancePct: round2(Math.min(100, Math.max(0, pct))),
  };
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

export function getParametresImpact() {
  return db.prepare('SELECT * FROM parametres_impact WHERE id = 1').get();
}

// Classe un delta de performance (en points) selon les seuils configurables.
export function classerNiveauImpact(deltaAbsPts) {
  const seuils = getParametresImpact();
  if (deltaAbsPts >= seuils.seuil_critique_pts) return 'CRITIQUE';
  if (deltaAbsPts >= seuils.seuil_important_pts) return 'IMPORTANT';
  if (deltaAbsPts >= seuils.seuil_moyen_pts) return 'MOYEN';
  return 'FAIBLE';
}

/**
 * Simule le retrait, le décommissionnement ou la remise en service d'un actif
 * (et de ses descendants pour retrait/décommissionnement) sur la performance
 * de sa centrale, sans rien persister.
 */
export function simulerMiseHorsOuEnService(actifId, action, { etatCible } = {}) {
  const racine = db.prepare('SELECT * FROM actifs WHERE id = ?').get(actifId);
  if (!racine) throw new HttpError(404, 'Actif introuvable');

  const descendants = action === 'REMISE_EN_SERVICE' ? [racine] : getActifAvecDescendants(actifId);
  const descendantIds = new Set(descendants.map((a) => a.id));

  const centrale = getCentrale(racine.centrale_id);
  const actifsCentrale = getCentraleActifs(racine.centrale_id);
  const statutCible = action === 'DECOMMISSIONNEMENT' ? etatCible || 'DECOMMISSIONNE' : ACTION_LABELS[action].statutCible;

  const avant = scoreFromActifs(actifsCentrale, centrale.capacite_nominale_mw);
  const actifsApres = actifsCentrale.map((a) =>
    descendantIds.has(a.id) ? { ...a, statut: statutCible } : a
  );
  const apres = scoreFromActifs(actifsApres, centrale.capacite_nominale_mw);

  const niveauImpact = classerNiveauImpact(Math.abs(round2(avant.performancePct - apres.performancePct)));

  const alertes = genererAlertes({
    action,
    racine,
    descendants,
    centraleSource: centrale,
    scoreSourceAvant: avant.performancePct,
    scoreSourceApres: apres.performancePct,
    niveauImpact,
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
    niveauImpact,
    alertes,
  };
}

/**
 * Simule le déplacement d'un actif (et éventuellement de ses descendants) d'une
 * centrale vers une autre, sans rien persister. Calcule aussi l'impact consolidé
 * sur l'ensemble du parc (redistribution vs. variation globale).
 */
export function simulerDeplacement(actifId, centraleDestId, { avecHierarchie = true } = {}) {
  const racine = db.prepare('SELECT * FROM actifs WHERE id = ?').get(actifId);
  if (!racine) throw new HttpError(404, 'Actif introuvable');

  const centraleDest = getCentrale(centraleDestId);
  if (!centraleDest) throw new HttpError(404, 'Centrale de destination introuvable');
  if (centraleDest.statut !== 'ACTIVE') {
    throw new HttpError(409, `La centrale de destination "${centraleDest.nom}" n'est pas active`);
  }
  if (centraleDest.id === racine.centrale_id) {
    throw new HttpError(400, "L'actif se trouve déjà dans cette centrale");
  }

  const descendants = avecHierarchie ? getActifAvecDescendants(actifId) : [racine];
  const descendantIds = new Set(descendants.map((a) => a.id));

  const centraleSource = getCentrale(racine.centrale_id);
  const actifsSource = getCentraleActifs(racine.centrale_id);
  const actifsDest = getCentraleActifs(centraleDestId);

  const parcAvant = computeParcPerformance();

  const sourceAvant = scoreFromActifs(actifsSource, centraleSource.capacite_nominale_mw);
  const destAvant = scoreFromActifs(actifsDest, centraleDest.capacite_nominale_mw);

  const sourceActifsApres = actifsSource.filter((a) => !descendantIds.has(a.id));
  const destActifsApres = [...actifsDest, ...descendants];

  const sourceApres = scoreFromActifs(sourceActifsApres, centraleSource.capacite_nominale_mw);
  const destApres = scoreFromActifs(destActifsApres, centraleDest.capacite_nominale_mw);

  const parcApres = {
    puissanceNominaleMw: parcAvant.puissanceNominaleMw,
    puissanceEffectiveMw: round2(
      parcAvant.puissanceEffectiveMw - sourceAvant.puissanceEffectiveMw + sourceApres.puissanceEffectiveMw
        - destAvant.puissanceEffectiveMw + destApres.puissanceEffectiveMw
    ),
  };
  parcApres.performancePct =
    parcApres.puissanceNominaleMw > 0
      ? round2(Math.min(100, (parcApres.puissanceEffectiveMw / parcApres.puissanceNominaleMw) * 100))
      : 0;

  const niveauImpact = classerNiveauImpact(
    Math.max(
      Math.abs(round2(sourceAvant.performancePct - sourceApres.performancePct)),
      Math.abs(round2(destAvant.performancePct - destApres.performancePct))
    )
  );

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
    niveauImpact,
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
    parcAvant: parcAvant.performancePct,
    parcApres: parcApres.performancePct,
    niveauImpact,
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
  niveauImpact,
}) {
  const alertes = [];
  const baisse = round2(scoreSourceAvant - scoreSourceApres);
  const enfants = descendants.filter((d) => d.id !== racine.id);
  const { verbe, participe } = ACTION_LABELS[action];

  if (action === 'DECOMMISSIONNEMENT') {
    alertes.push({
      severite: 'haute',
      message: `Le décommissionnement est définitif : "${racine.nom}"${enfants.length ? ' et ses actifs enfants' : ''} ne pourront plus être remis en service ensuite.`,
    });
  }

  if (racine.criticite === 'CRITIQUE') {
    alertes.push({
      severite: 'haute',
      message: `"${racine.nom}" est un actif critique : son ${verbe} peut affecter la sûreté ou la continuité de production de ${centraleSource.nom}.`,
    });
  }

  if (enfants.length > 0) {
    alertes.push({
      severite: 'moyenne',
      message: `Cet actif possède ${enfants.length} actif(s) enfant(s) (${enfants
        .map((e) => e.nom)
        .join(', ')}) qui seront ${participe} avec lui.`,
    });
  }

  if (action !== 'REMISE_EN_SERVICE') {
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
  } else if (baisse < 0) {
    alertes.push({
      severite: 'basse',
      message: `Amélioration de la performance de ${centraleSource.nom} : +${Math.abs(baisse)} points (${scoreSourceAvant}% → ${scoreSourceApres}%).`,
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

  if (niveauImpact === 'CRITIQUE') {
    alertes.push({
      severite: 'haute',
      message: `Niveau d'impact CRITIQUE : cette opération nécessite la validation d'un Administrateur.`,
    });
  } else if (niveauImpact === 'IMPORTANT') {
    alertes.push({ severite: 'moyenne', message: `Niveau d'impact IMPORTANT.` });
  }

  if (alertes.length === 0) {
    alertes.push({ severite: 'basse', message: 'Aucun impact significatif détecté.' });
  }

  return alertes;
}
