import { Router } from '../lib/miniweb.js';
import { db } from '../db.js';

export const mouvementsRouter = new Router();

mouvementsRouter.get('/', (req, res) => {
  const { type, actifId } = req.query;
  let query = 'SELECT * FROM mouvements';
  const clauses = [];
  const params = [];
  if (type) {
    clauses.push('type = ?');
    params.push(type);
  }
  if (actifId) {
    clauses.push('actif_id = ?');
    params.push(actifId);
  }
  if (clauses.length) query += ' WHERE ' + clauses.join(' AND ');
  query += ' ORDER BY date DESC, id DESC';

  const rows = db.prepare(query).all(...params);
  res.json(rows.map((m) => ({ ...m, alertes: JSON.parse(m.alertes) })));
});
