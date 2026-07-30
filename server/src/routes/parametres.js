import { Router, HttpError } from '../lib/miniweb.js';
import { db } from '../db.js';
import { requireAuth, requireRole } from '../lib/auth.js';
import { logAudit } from '../lib/audit.js';

export const parametresRouter = new Router();

parametresRouter.get('/impact', (req, res) => {
  requireAuth(req);
  res.json(db.prepare('SELECT * FROM parametres_impact WHERE id = 1').get());
});

parametresRouter.put('/impact', (req, res) => {
  const user = requireRole(req, ['ADMINISTRATEUR']);
  const { seuilMoyenPts, seuilImportantPts, seuilCritiquePts } = req.body;
  const s1 = Number(seuilMoyenPts);
  const s2 = Number(seuilImportantPts);
  const s3 = Number(seuilCritiquePts);
  if (![s1, s2, s3].every((n) => Number.isFinite(n) && n >= 0)) {
    throw new HttpError(400, 'Les trois seuils doivent être des nombres positifs');
  }
  if (!(s1 < s2 && s2 < s3)) {
    throw new HttpError(400, 'Les seuils doivent être strictement croissants : moyen < important < critique');
  }

  db.prepare(
    'UPDATE parametres_impact SET seuil_moyen_pts = ?, seuil_important_pts = ?, seuil_critique_pts = ? WHERE id = 1'
  ).run(s1, s2, s3);

  logAudit({
    type: 'PARAMETRES_IMPACT_MODIFIES',
    description: `Seuils d'impact modifiés : moyen ≥ ${s1} pts, important ≥ ${s2} pts, critique ≥ ${s3} pts`,
    acteur: user,
  });

  res.json(db.prepare('SELECT * FROM parametres_impact WHERE id = 1').get());
});
