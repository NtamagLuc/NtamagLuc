import { Router } from '../lib/miniweb.js';
import { db } from '../db.js';
import { requireRole } from '../lib/auth.js';

export const auditRouter = new Router();

auditRouter.get('/', (req, res) => {
  requireRole(req, ['VALIDATEUR', 'ADMINISTRATEUR']);
  const { cibleType, cibleId } = req.query;
  let query = 'SELECT * FROM audit_log';
  const clauses = [];
  const params = [];
  if (cibleType) {
    clauses.push('cible_type = ?');
    params.push(cibleType);
  }
  if (cibleId) {
    clauses.push('cible_id = ?');
    params.push(cibleId);
  }
  if (clauses.length) query += ' WHERE ' + clauses.join(' AND ');
  query += ' ORDER BY created_at DESC, id DESC LIMIT 300';
  res.json(db.prepare(query).all(...params));
});
