import { Router } from '../lib/miniweb.js';
import { db } from '../db.js';
import { requireRole, ROLES_VALIDATION } from '../lib/auth.js';

export const auditRouter = new Router();

// L'administrateur et le validateur jouent ici le rôle d'auditeur.
auditRouter.get('/', (req, res) => {
  requireRole(req, ROLES_VALIDATION);
  const { cibleType, cibleId, centraleId, acteurId, type, dateDebut, dateFin } = req.query;
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
  if (centraleId) {
    clauses.push('centrale_id = ?');
    params.push(centraleId);
  }
  if (acteurId) {
    clauses.push('acteur_id = ?');
    params.push(acteurId);
  }
  if (type) {
    clauses.push('type = ?');
    params.push(type);
  }
  if (dateDebut) {
    clauses.push('created_at >= ?');
    params.push(dateDebut);
  }
  if (dateFin) {
    clauses.push('created_at <= ?');
    params.push(dateFin);
  }
  if (clauses.length) query += ' WHERE ' + clauses.join(' AND ');
  query += ' ORDER BY created_at DESC, id DESC LIMIT 500';
  const rows = db.prepare(query).all(...params);
  res.json(rows.map((a) => ({ ...a, donnees: a.donnees ? JSON.parse(a.donnees) : null })));
});
