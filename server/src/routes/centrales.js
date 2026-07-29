import { Router } from '../lib/miniweb.js';
import { db } from '../db.js';
import { computeCentralePerformance } from '../services/performance.js';

export const centralesRouter = new Router();

centralesRouter.get('/', (req, res) => {
  const centrales = db.prepare('SELECT * FROM centrales ORDER BY nom').all();
  const result = centrales.map((c) => {
    const { centrale, ...perf } = computeCentralePerformance(c.id);
    const nbActifs = db
      .prepare("SELECT COUNT(*) AS n FROM actifs WHERE centrale_id = ? AND statut != 'RETIRE'")
      .get(c.id).n;
    return { ...c, ...perf, nbActifs };
  });
  res.json(result);
});

centralesRouter.post('/', (req, res) => {
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
  res.status(201).json(centrale);
});

centralesRouter.get('/:id', (req, res) => {
  const centrale = db.prepare('SELECT * FROM centrales WHERE id = ?').get(req.params.id);
  if (!centrale) return res.status(404).json({ error: 'Centrale introuvable' });
  const { centrale: _c, ...perf } = computeCentralePerformance(centrale.id);
  const actifs = db
    .prepare('SELECT * FROM actifs WHERE centrale_id = ? ORDER BY parent_id IS NOT NULL, nom')
    .all(centrale.id);
  res.json({ ...centrale, ...perf, actifs });
});

centralesRouter.put('/:id', (req, res) => {
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
  res.json(db.prepare('SELECT * FROM centrales WHERE id = ?').get(centrale.id));
});

centralesRouter.delete('/:id', (req, res) => {
  const centrale = db.prepare('SELECT * FROM centrales WHERE id = ?').get(req.params.id);
  if (!centrale) return res.status(404).json({ error: 'Centrale introuvable' });
  const nbActifs = db.prepare('SELECT COUNT(*) AS n FROM actifs WHERE centrale_id = ?').get(centrale.id).n;
  if (nbActifs > 0) {
    return res.status(400).json({ error: 'Impossible de supprimer une centrale qui contient des actifs' });
  }
  db.prepare('DELETE FROM centrales WHERE id = ?').run(centrale.id);
  res.status(204).end();
});
