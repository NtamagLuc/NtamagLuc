import { Router } from '../lib/miniweb.js';
import { db } from '../db.js';
import { requireAuth, centraleScopeId } from '../lib/auth.js';

export const mouvementsRouter = new Router();

mouvementsRouter.get('/', (req, res) => {
  const user = requireAuth(req);
  const scope = centraleScopeId(user);
  const { type, actifId } = req.query;
  let query = 'SELECT * FROM mouvements';
  const clauses = [];
  const params = [];
  if (scope) {
    clauses.push('(centrale_source_id = ? OR centrale_dest_id = ?)');
    params.push(scope, scope);
  }
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
