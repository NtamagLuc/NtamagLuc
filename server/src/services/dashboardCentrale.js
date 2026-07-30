import { db } from '../db.js';
import { getCentrale, getCentraleActifs, scoreFromActifs, computeCentralePerformance, computeParcPerformance } from './performance.js';

const STATUTS_ACTIFS = ['EN_SERVICE', 'EN_MAINTENANCE', 'EN_REPARATION', 'EN_TRANSFERT', 'HORS_SERVICE', 'DECOMMISSIONNE', 'REFORME'];

const CAUSE_LABELS = {
  EN_MAINTENANCE: 'Maintenance',
  EN_REPARATION: 'Réparation',
  HORS_SERVICE: 'Retrait de service',
  EN_TRANSFERT: 'Transfert en cours',
  DECOMMISSIONNE: 'Décommissionnement',
  REFORME: 'Réforme',
};

const PERIODES_JOURS = {
  jour: 1,
  semaine: 7,
  mois: 30,
  trimestre: 90,
  annee: 365,
};

const DEMANDES_NON_TERMINALES = ['EN_ATTENTE', 'TRANSMISE'];

function round2(n) {
  return Math.round(n * 100) / 100;
}

function sommeContribution(actifs) {
  return round2(actifs.reduce((s, a) => s + (a.contribution_mw || 0), 0));
}

function buildEnfantsIndex(actifs) {
  const parEnfantDe = new Map();
  for (const a of actifs) {
    const liste = parEnfantDe.get(a.parent_id) || [];
    liste.push(a);
    parEnfantDe.set(a.parent_id, liste);
  }
  return parEnfantDe;
}

function getSousArbre(racine, index) {
  const all = [];
  const stack = [racine];
  while (stack.length) {
    const a = stack.pop();
    all.push(a);
    for (const enfant of index.get(a.id) || []) stack.push(enfant);
  }
  return all;
}

function trouverUniteRacine(actif, byId) {
  let courant = actif;
  while (courant.parent_id && byId.has(courant.parent_id)) {
    courant = byId.get(courant.parent_id);
  }
  return courant;
}

function lienPourAudit(entree) {
  switch (entree.cible_type) {
    case 'ACTIF':
      return `#/actifs/${entree.cible_id}`;
    case 'DEMANDE':
      return `#/demandes/${entree.cible_id}`;
    case 'CENTRALE':
      return `#/centrales/${entree.cible_id}`;
    default:
      return null;
  }
}

// Reconstruit, à partir des mouvements réellement enregistrés pour cette centrale,
// la valeur de disponibilité en vigueur à une date donnée (fonction en escalier).
function construireSerieDisponibilite(centraleId, depuisIso, dispoActuelle) {
  const evenements = db
    .prepare(
      `SELECT date, centrale_source_id, centrale_dest_id, score_source_apres, score_dest_apres
       FROM mouvements
       WHERE centrale_source_id = ? OR centrale_dest_id = ?
       ORDER BY date ASC, id ASC`
    )
    .all(centraleId, centraleId)
    .map((m) => ({
      date: m.date,
      valeur: m.centrale_source_id === centraleId ? m.score_source_apres : m.score_dest_apres,
    }))
    .filter((e) => e.valeur !== null && e.valeur !== undefined);

  // Valeur en vigueur juste avant la fenêtre observée : le dernier événement antérieur,
  // ou (à défaut d'historique) la valeur actuelle extrapolée en arrière.
  const avantFenetre = evenements.filter((e) => e.date < depuisIso);
  const valeurInitiale = avantFenetre.length ? avantFenetre[avantFenetre.length - 1].valeur : dispoActuelle;
  const dansFenetre = evenements.filter((e) => e.date >= depuisIso);

  return { valeurInitiale, evenements: dansFenetre, aHistorique: evenements.length > 0 };
}

function valeurAuMoment(dateIso, valeurInitiale, evenements) {
  let valeur = valeurInitiale;
  for (const e of evenements) {
    if (e.date > dateIso) break;
    valeur = e.valeur;
  }
  return valeur;
}

export function computeCentraleDashboard(centraleIdRaw, { periode = 'mois' } = {}) {
  const centraleId = Number(centraleIdRaw);
  const centrale = getCentrale(centraleId);
  if (!centrale) return null;

  const actifs = getCentraleActifs(centraleId);
  const byId = new Map(actifs.map((a) => [a.id, a]));
  const enfantsIndex = buildEnfantsIndex(actifs);
  const perf = computeCentralePerformance(centraleId);
  const parc = computeParcPerformance();
  const nbJours = PERIODES_JOURS[periode] ?? PERIODES_JOURS.mois;
  const maintenant = new Date();
  const depuis = new Date(maintenant.getTime() - nbJours * 86400000);
  const depuisIso = depuis.toISOString().slice(0, 19).replace('T', ' ');
  const aujourdHuiIso = maintenant.toISOString().slice(0, 10);

  // --- Identité ---
  const racines = actifs.filter((a) => !a.parent_id);
  const nbUnites = racines.filter((a) => a.type === 'UNITE_PRODUCTION').length || racines.length;

  // --- Actifs par statut ---
  const actifsParStatut = {};
  for (const s of STATUTS_ACTIFS) {
    actifsParStatut[s] = actifs.filter((a) => a.statut === s).length;
  }

  // --- Actifs critiques ---
  const actifsCritiques = actifs
    .filter((a) => a.criticite === 'CRITIQUE')
    .map((a) => ({
      id: a.id,
      code: a.code,
      nom: a.nom,
      type: a.type,
      statut: a.statut,
      criticite: a.criticite,
      uniteNom: trouverUniteRacine(a, byId).nom,
      contributionMw: a.contribution_mw,
      impactPctCapacite: centrale.capacite_nominale_mw > 0 ? round2((a.contribution_mw / centrale.capacite_nominale_mw) * 100) : 0,
      operationnel: a.statut === 'EN_SERVICE',
    }))
    .sort((a, b) => Number(a.operationnel) - Number(b.operationnel));

  // --- Unités de production (chaque actif de premier niveau : unité typée ou équipement autonome) ---
  const unites = racines.map((u) => {
    const sousArbre = getSousArbre(u, enfantsIndex);
    const puissanceInstalleeMw = sommeContribution(sousArbre);
    const scoreUnite = scoreFromActifs(sousArbre, puissanceInstalleeMw);
    const nbActifsUnite = sousArbre.length;
    const nbEnService = sousArbre.filter((a) => a.statut === 'EN_SERVICE').length;
    // Le statut affiché reflète la disponibilité en puissance (MW), pas le simple décompte
    // d'actifs, pour rester cohérent avec la colonne "Disponibilité" à côté de laquelle il s'affiche.
    let statutUnite = 'EN_SERVICE';
    if (scoreUnite.disponibilitePct <= 0) statutUnite = 'HORS_SERVICE';
    else if (scoreUnite.disponibilitePct < 100) statutUnite = 'PARTIEL';
    return {
      id: u.id,
      code: u.code,
      nom: u.nom,
      type: u.type,
      puissanceInstalleeMw,
      puissanceDisponibleMw: scoreUnite.puissanceDisponibleMw,
      puissanceIndisponibleMw: round2(puissanceInstalleeMw - scoreUnite.puissanceDisponibleMw),
      disponibilitePct: scoreUnite.disponibilitePct,
      statut: statutUnite,
      nbActifs: nbActifsUnite,
      nbActifsEnService: nbEnService,
    };
  });

  // --- Indisponibilités par cause ---
  const capaciteInstalleeMw = perf.puissanceInstalleeMw;
  const capaciteDisponibleMw = perf.puissanceDisponibleMw;
  const capaciteIndisponibleMw = round2(capaciteInstalleeMw - capaciteDisponibleMw);
  const causesPresentes = STATUTS_ACTIFS.filter((s) => s !== 'EN_SERVICE');
  const parCause = causesPresentes
    .map((statut) => {
      const concernes = actifs.filter((a) => a.statut === statut);
      const mw = sommeContribution(concernes);
      return {
        cause: statut,
        label: CAUSE_LABELS[statut],
        mw,
        pct: capaciteInstalleeMw > 0 ? round2((mw / capaciteInstalleeMw) * 100) : 0,
        nbActifs: concernes.length,
      };
    })
    .filter((c) => c.nbActifs > 0)
    .sort((a, b) => b.mw - a.mw);
  // La puissance installée de la centrale (nominale, déclarée) peut dépasser la somme des
  // contributions de ses actifs enregistrés : cet écart n'est imputable à aucune cause
  // opérationnelle et est affiché séparément pour que les totaux restent cohérents.
  const ecartNonAffecte = round2(capaciteIndisponibleMw - parCause.reduce((s, c) => s + c.mw, 0));
  if (ecartNonAffecte > 0.01) {
    parCause.push({
      cause: 'NON_AFFECTEE',
      label: 'Écart capacité nominale',
      mw: ecartNonAffecte,
      pct: capaciteInstalleeMw > 0 ? round2((ecartNonAffecte / capaciteInstalleeMw) * 100) : 0,
      nbActifs: 0,
    });
  }

  // --- Maintenance ---
  const demandesCentrale = db
    .prepare('SELECT * FROM demandes WHERE centrale_source_id = ? OR centrale_dest_id = ? ORDER BY created_at DESC')
    .all(centraleId, centraleId);

  const interventionsEnCours = actifs
    .filter((a) => ['EN_MAINTENANCE', 'EN_REPARATION'].includes(a.statut))
    .map((a) => ({
      id: a.id,
      code: a.code,
      nom: a.nom,
      statut: a.statut,
      criticite: a.criticite,
      depuis: a.updated_at,
      impactImportant: ['HAUTE', 'CRITIQUE'].includes(a.criticite),
    }));

  const planifiees = demandesCentrale
    .filter((d) => DEMANDES_NON_TERMINALES.includes(d.statut) && d.date_prevue && d.date_prevue >= aujourdHuiIso)
    .map((d) => ({ id: d.id, type: d.type, actifNom: d.actif_nom, datePrevue: d.date_prevue, statut: d.statut }));

  const enRetard = demandesCentrale
    .filter((d) => DEMANDES_NON_TERMINALES.includes(d.statut) && d.date_prevue && d.date_prevue < aujourdHuiIso)
    .map((d) => ({ id: d.id, type: d.type, actifNom: d.actif_nom, datePrevue: d.date_prevue, statut: d.statut, niveauImpact: d.niveau_impact }));

  const necessitantIntervention = actifs
    .filter((a) => ['HORS_SERVICE', 'EN_REPARATION'].includes(a.statut) && ['HAUTE', 'CRITIQUE'].includes(a.criticite))
    .map((a) => ({ id: a.id, code: a.code, nom: a.nom, statut: a.statut, criticite: a.criticite }));

  // --- Opérations en cours ---
  const operationsParStatut = {};
  const operationsParType = {};
  for (const d of demandesCentrale) {
    operationsParStatut[d.statut] = (operationsParStatut[d.statut] || 0) + 1;
    operationsParType[d.type] = (operationsParType[d.type] || 0) + 1;
  }
  const operationsEnCours = demandesCentrale
    .filter((d) => DEMANDES_NON_TERMINALES.includes(d.statut))
    .map((d) => ({
      id: d.id,
      type: d.type,
      statut: d.statut,
      actifNom: d.actif_nom,
      niveauImpact: d.niveau_impact,
      simulationObsolete: !!d.simulation_obsolete,
      createdAt: d.created_at,
    }));
  const operationsBloquees = operationsEnCours.filter((d) => d.simulationObsolete);

  // --- Historique / production estimée ---
  const { valeurInitiale, evenements, aHistorique } = construireSerieDisponibilite(centraleId, depuisIso, perf.disponibilitePct);
  const nbPoints = Math.min(Math.max(nbJours, 6), 60);
  const points = [];
  for (let i = 0; i <= nbPoints; i++) {
    const t = new Date(depuis.getTime() + (i * nbJours * 86400000) / nbPoints);
    const tIso = t.toISOString().slice(0, 19).replace('T', ' ');
    const dispo = i === nbPoints ? perf.disponibilitePct : valeurAuMoment(tIso, valeurInitiale, evenements);
    points.push({
      date: t.toISOString().slice(0, 10),
      disponibilitePct: dispo,
      puissanceDisponibleMw: round2((dispo / 100) * capaciteInstalleeMw),
    });
  }
  // Production estimée = intégrale de la puissance disponible sur la période (méthode des rectangles).
  let productionReelleEstimeeMwh = 0;
  for (let i = 0; i < points.length - 1; i++) {
    const dureeH = (nbJours * 24) / nbPoints;
    productionReelleEstimeeMwh += points[i].puissanceDisponibleMw * dureeH;
  }
  productionReelleEstimeeMwh = round2(productionReelleEstimeeMwh);
  const productionPrevueMwh = round2(capaciteInstalleeMw * (nbJours * 24) * (centrale.seuil_alerte_pct / 100));
  const ecartProductionMwh = round2(productionReelleEstimeeMwh - productionPrevueMwh);
  const ecartProductionPct = productionPrevueMwh > 0 ? round2((ecartProductionMwh / productionPrevueMwh) * 100) : 0;

  // --- Alertes ---
  const alertes = [];
  for (const a of actifsCritiques) {
    if (!a.operationnel) {
      alertes.push({
        severite: 'haute',
        categorie: 'ACTIF_CRITIQUE_HORS_SERVICE',
        message: `Actif critique indisponible : "${a.nom}" (${a.code}) est ${CAUSE_LABELS[a.statut] || a.statut.toLowerCase()}.`,
        lien: `#/actifs/${a.id}`,
      });
    }
  }
  if (capaciteInstalleeMw > 0 && capaciteIndisponibleMw / capaciteInstalleeMw >= 0.3) {
    alertes.push({
      severite: 'haute',
      categorie: 'PERTE_CAPACITE_IMPORTANTE',
      message: `Perte de capacité importante : ${capaciteIndisponibleMw} MW indisponibles sur ${capaciteInstalleeMw} MW installés (${round2((capaciteIndisponibleMw / capaciteInstalleeMw) * 100)}%).`,
      lien: `#/centrales/${centraleId}`,
    });
  } else if (capaciteInstalleeMw > 0 && capaciteIndisponibleMw / capaciteInstalleeMw >= 0.15) {
    alertes.push({
      severite: 'moyenne',
      categorie: 'PERTE_CAPACITE_MODEREE',
      message: `Perte de capacité modérée : ${capaciteIndisponibleMw} MW indisponibles sur ${capaciteInstalleeMw} MW installés.`,
      lien: `#/centrales/${centraleId}`,
    });
  }
  if (perf.disponibilitePct < centrale.seuil_alerte_pct) {
    alertes.push({
      severite: 'haute',
      categorie: 'DISPONIBILITE_FAIBLE',
      message: `Disponibilité (${perf.disponibilitePct}%) sous le seuil recommandé de ${centrale.seuil_alerte_pct}%.`,
      lien: `#/centrales/${centraleId}`,
    });
  }
  for (const d of enRetard) {
    const severite = d.niveauImpact === 'CRITIQUE' || d.niveauImpact === 'IMPORTANT' ? 'haute' : 'moyenne';
    alertes.push({
      severite,
      categorie: 'MAINTENANCE_EN_RETARD',
      message: `Demande de ${d.type.toLowerCase()} en retard pour "${d.actifNom}" (date prévue : ${d.datePrevue}).`,
      lien: `#/demandes/${d.id}`,
    });
  }
  for (const d of operationsBloquees) {
    alertes.push({
      severite: 'moyenne',
      categorie: 'SIMULATION_OBSOLETE',
      message: `Simulation obsolète sur la demande #${d.id} (${d.type.toLowerCase()}) pour "${d.actifNom}" — à relancer.`,
      lien: `#/demandes/${d.id}`,
    });
  }
  const troisJours = new Date(maintenant.getTime() - 3 * 86400000).toISOString();
  for (const d of operationsEnCours) {
    if (!d.simulationObsolete && d.createdAt < troisJours) {
      alertes.push({
        severite: 'moyenne',
        categorie: 'VALIDATION_EN_ATTENTE',
        message: `Demande #${d.id} (${d.type.toLowerCase()}) en attente de décision depuis plus de 3 jours.`,
        lien: `#/demandes/${d.id}`,
      });
    }
  }
  const ordreSeverite = { haute: 0, moyenne: 1, basse: 2 };
  alertes.sort((a, b) => ordreSeverite[a.severite] - ordreSeverite[b.severite]);

  // --- Timeline ---
  const timeline = db
    .prepare('SELECT * FROM audit_log WHERE centrale_id = ? ORDER BY created_at DESC, id DESC LIMIT 60')
    .all(centraleId)
    .map((e) => ({
      id: e.id,
      type: e.type,
      description: e.description,
      date: e.created_at,
      acteurNom: e.acteur_nom,
      lien: lienPourAudit(e),
    }));

  // --- Contribution au parc ---
  const contributionParc = {
    puissanceInstalleeMw: capaciteInstalleeMw,
    puissanceDisponibleMw: capaciteDisponibleMw,
    parcPuissanceInstalleeMw: parc.puissanceInstalleeMw,
    parcPuissanceDisponibleMw: parc.puissanceDisponibleMw,
    pctCapaciteParc: parc.puissanceInstalleeMw > 0 ? round2((capaciteInstalleeMw / parc.puissanceInstalleeMw) * 100) : 0,
    pctProductionParc: parc.puissanceDisponibleMw > 0 ? round2((capaciteDisponibleMw / parc.puissanceDisponibleMw) * 100) : 0,
  };

  const nbActifsNonTerminaux = actifs.filter((a) => !['DECOMMISSIONNE', 'REFORME'].includes(a.statut)).length;
  const tauxUtilisationPct = nbActifsNonTerminaux > 0 ? round2((actifsParStatut.EN_SERVICE / nbActifsNonTerminaux) * 100) : 0;

  return {
    identite: {
      id: centrale.id,
      code: centrale.code,
      nom: centrale.nom,
      type: centrale.type,
      localisation: centrale.localisation,
      statut: centrale.statut,
      puissanceInstalleeMw: capaciteInstalleeMw,
      nbUnites,
      nbActifsTotal: actifs.length,
      derniereActualisation: new Date().toISOString(),
    },
    kpis: {
      puissanceInstalleeMw: capaciteInstalleeMw,
      puissanceDisponibleMw: capaciteDisponibleMw,
      puissanceIndisponibleMw: capaciteIndisponibleMw,
      disponibilitePct: perf.disponibilitePct,
      seuilAlertePct: centrale.seuil_alerte_pct,
      tauxUtilisationPct,
      rendementPct: null,
      productionReelleEstimeeMwh,
      productionPrevueMwh,
      ecartProductionMwh,
      ecartProductionPct,
    },
    actifsParStatut,
    actifsCritiques,
    unites,
    indisponibilites: { capaciteInstalleeMw, capaciteDisponibleMw, capaciteIndisponibleMw, parCause },
    maintenance: { interventionsEnCours, planifiees, enRetard, necessitantIntervention },
    operations: { parStatut: operationsParStatut, parType: operationsParType, enCours: operationsEnCours, bloquees: operationsBloquees },
    alertes,
    historique: { periode, aHistorique, points },
    timeline,
    contributionParc,
  };
}
