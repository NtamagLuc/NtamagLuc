// Régions électriques SOCAD'EL (référentiel fourni par l'utilisateur).
export const REGIONS_ELECTRIQUES = [
  { code: '01', sigle: 'DRD' },
  { code: '02', sigle: 'DRY' },
  { code: '03', sigle: 'DRNEA' },
  { code: '04', sigle: 'DRONO' },
  { code: '05', sigle: 'DRSOM' },
  { code: '06', sigle: 'DRC' },
  { code: '07', sigle: 'DRE' },
  { code: '08', sigle: 'DRSANO' },
  { code: '09', sigle: 'DRSM' },
];

export const SIGLES_REGIONS_VALIDES = REGIONS_ELECTRIQUES.map((r) => r.sigle);
