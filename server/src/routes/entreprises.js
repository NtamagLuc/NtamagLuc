import { Router, HttpError } from '../lib/miniweb.js';
import { db } from '../db.js';
import { requireAuth, requireRole, ROLES_GESTION_REFERENTIEL } from '../lib/auth.js';
import { logAudit } from '../lib/audit.js';

export const entreprisesRouter = new Router();

entreprisesRouter.get('/', (req, res) => {
  requireAuth(req);
  const entreprises = db.prepare('SELECT * FROM entreprises ORDER BY nom').all();
  res.json(entreprises);
});

entreprisesRouter.post('/', (req, res) => {
  const user = requireRole(req, ROLES_GESTION_REFERENTIEL);
  const nom = req.body.nom?.trim();
  if (!nom) throw new HttpError(400, 'nom est requis');

  const existante = db.prepare('SELECT id FROM entreprises WHERE nom = ?').get(nom);
  if (existante) throw new HttpError(409, `Une entreprise nommée "${nom}" existe déjà`);

  const info = db.prepare("INSERT INTO entreprises (nom, statut) VALUES (?, 'ACTIVE')").run(nom);
  const entreprise = db.prepare('SELECT * FROM entreprises WHERE id = ?').get(info.lastInsertRowid);
  logAudit({
    type: 'ENTREPRISE_CREEE',
    description: `Entreprise "${entreprise.nom}" créée`,
    acteur: user,
    cibleType: 'ENTREPRISE',
    cibleId: entreprise.id,
  });
  res.status(201).json(entreprise);
});

entreprisesRouter.put('/:id', (req, res) => {
  const user = requireRole(req, ROLES_GESTION_REFERENTIEL);
  const entreprise = db.prepare('SELECT * FROM entreprises WHERE id = ?').get(req.params.id);
  if (!entreprise) throw new HttpError(404, 'Entreprise introuvable');

  const nom = req.body.nom !== undefined ? req.body.nom?.trim() : entreprise.nom;
  if (!nom) throw new HttpError(400, 'nom est requis');
  const statut = req.body.statut === 'INACTIVE' ? 'INACTIVE' : 'ACTIVE';

  const doublon = db.prepare('SELECT id FROM entreprises WHERE nom = ? AND id != ?').get(nom, entreprise.id);
  if (doublon) throw new HttpError(409, `Une entreprise nommée "${nom}" existe déjà`);

  db.prepare('UPDATE entreprises SET nom = ?, statut = ? WHERE id = ?').run(nom, statut, entreprise.id);
  db.prepare('UPDATE demandes SET entreprise_designee_nom = ? WHERE entreprise_designee_id = ?').run(nom, entreprise.id);
  logAudit({
    type: 'ENTREPRISE_MODIFIEE',
    description: `Entreprise "${entreprise.nom}" modifiée`,
    acteur: user,
    cibleType: 'ENTREPRISE',
    cibleId: entreprise.id,
  });
  res.json(db.prepare('SELECT * FROM entreprises WHERE id = ?').get(entreprise.id));
});

entreprisesRouter.delete('/:id', (req, res) => {
  const user = requireRole(req, ROLES_GESTION_REFERENTIEL);
  const entreprise = db.prepare('SELECT * FROM entreprises WHERE id = ?').get(req.params.id);
  if (!entreprise) throw new HttpError(404, 'Entreprise introuvable');
  const nbDemandes = db.prepare('SELECT COUNT(*) AS n FROM demandes WHERE entreprise_designee_id = ?').get(entreprise.id).n;
  if (nbDemandes > 0) {
    throw new HttpError(400, 'Impossible de supprimer une entreprise déjà désignée sur une demande. Désactivez-la plutôt.');
  }
  db.prepare('DELETE FROM entreprises WHERE id = ?').run(entreprise.id);
  logAudit({ type: 'ENTREPRISE_SUPPRIMEE', description: `Entreprise "${entreprise.nom}" supprimée`, acteur: user, cibleType: 'ENTREPRISE', cibleId: entreprise.id });
  res.status(204).end();
});
