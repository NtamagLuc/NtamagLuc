import { Router } from '../lib/miniweb.js';
import { db } from '../db.js';
import { computeCentralePerformance } from '../services/performance.js';
import { requireAuth, requireRole } from '../lib/auth.js';
import { logAudit } from '../lib/audit.js';

export const centralesRouter = new Router();

centralesRouter.get('/', (req, res) => {
  requireAuth(req);
  const centrales = db.prepare('SELECT * FROM centrales ORDER BY nom').all();
  const result = centrales.map((c) => {
    const { centrale, ...perf } = computeCentralePerformance(c.id);
    const nbActifs = db
      .prepare("SELECT COUNT(*) AS n FROM actifs WHERE centrale_id = ? AND statut NOT IN ('RETIRE', 'REFORME')")
      .get(c.id).n;
    return { ...c, ...perf, nbActifs };
  });
  res.json(result);
});

centralesRouter.post('/', (req, res) => {
  const user = requireRole(req, ['ADMINISTRATEUR']);
  const { nom, type, localisation, capaciteNominaleMw, seuilAlertePct } = req.body;
  if (!nom || !capaciteNominaleMw) {
    return res.status(400).json({ error: 'nom et capaciteNominaleMw sont requis' });
  }
  const info = db
    .prepare(
      `INSERT INTO centrales (nom, type, localisation, capacite_nominale_mw, seuil_alerte_pct)
       VALUES (?, ?, ?, ?, ?)`
    )
    .run(nom, type || 'THERMIQUE', localisation || null, capaciteNominaleMw, seuilAlertePct || 70);
  const centrale = db.prepare('SELECT * FROM centrales WHERE id = ?').get(info.lastInsertRowid);
  logAudit({ type: 'CENTRALE_CREE', description: `Centrale "${centrale.nom}" créée`, acteur: user, cibleType: 'CENTRALE', cibleId: centrale.id });
  res.status(201).json(centrale);
});

centralesRouter.get('/:id', (req, res) => {
  requireAuth(req);
  const centrale = db.prepare('SELECT * FROM centrales WHERE id = ?').get(req.params.id);
  if (!centrale) return res.status(404).json({ error: 'Centrale introuvable' });
  const { centrale: _c, ...perf } = computeCentralePerformance(centrale.id);
  const actifs = db
    .prepare('SELECT * FROM actifs WHERE centrale_id = ? ORDER BY parent_id IS NOT NULL, nom')
    .all(centrale.id);
  res.json({ ...centrale, ...perf, actifs });
});

centralesRouter.put('/:id', (req, res) => {
  const user = requireRole(req, ['ADMINISTRATEUR']);
  const centrale = db.prepare('SELECT * FROM centrales WHERE id = ?').get(req.params.id);
  if (!centrale) return res.status(404).json({ error: 'Centrale introuvable' });
  const { nom, type, localisation, capaciteNominaleMw, seuilAlertePct } = req.body;
  db.prepare(
    `UPDATE centrales SET nom = ?, type = ?, localisation = ?, capacite_nominale_mw = ?, seuil_alerte_pct = ?
     WHERE id = ?`
  ).run(
    nom ?? centrale.nom,
    type ?? centrale.type,
    localisation ?? centrale.localisation,
    capaciteNominaleMw ?? centrale.capacite_nominale_mw,
    seuilAlertePct ?? centrale.seuil_alerte_pct,
    centrale.id
  );
  logAudit({ type: 'CENTRALE_MODIFIEE', description: `Centrale "${centrale.nom}" modifiée`, acteur: user, cibleType: 'CENTRALE', cibleId: centrale.id });
  res.json(db.prepare('SELECT * FROM centrales WHERE id = ?').get(centrale.id));
});

centralesRouter.delete('/:id', (req, res) => {
  const user = requireRole(req, ['ADMINISTRATEUR']);
  const centrale = db.prepare('SELECT * FROM centrales WHERE id = ?').get(req.params.id);
  if (!centrale) return res.status(404).json({ error: 'Centrale introuvable' });
  const nbActifs = db.prepare('SELECT COUNT(*) AS n FROM actifs WHERE centrale_id = ?').get(centrale.id).n;
  if (nbActifs > 0) {
    return res.status(400).json({ error: 'Impossible de supprimer une centrale qui contient des actifs' });
  }
  db.prepare('DELETE FROM centrales WHERE id = ?').run(centrale.id);
  logAudit({ type: 'CENTRALE_SUPPRIMEE', description: `Centrale "${centrale.nom}" supprimée`, acteur: user, cibleType: 'CENTRALE', cibleId: centrale.id });
  res.status(204).end();
});
