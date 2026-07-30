import { Router } from '../lib/miniweb.js';
import { db } from '../db.js';
import { requireAuth } from '../lib/auth.js';

export const notificationsRouter = new Router();

notificationsRouter.get('/', (req, res) => {
  const user = requireAuth(req);
  const rows = db
    .prepare(
      `SELECT * FROM notifications
       WHERE utilisateur_id = ? OR role_cible = ?
       ORDER BY created_at DESC
       LIMIT 100`
    )
    .all(user.id, user.role);
  res.json(rows.map((n) => ({ ...n, lu: !!n.lu })));
});

notificationsRouter.post('/:id/lu', (req, res) => {
  const user = requireAuth(req);
  const notif = db.prepare('SELECT * FROM notifications WHERE id = ?').get(req.params.id);
  if (!notif) return res.status(404).json({ error: 'Notification introuvable' });
  if (notif.utilisateur_id !== user.id && notif.role_cible !== user.role) {
    return res.status(403).json({ error: 'Notification non accessible' });
  }
  db.prepare('UPDATE notifications SET lu = 1 WHERE id = ?').run(notif.id);
  res.status(204).end();
});

notificationsRouter.post('/lu-tout', (req, res) => {
  const user = requireAuth(req);
  db.prepare('UPDATE notifications SET lu = 1 WHERE utilisateur_id = ? OR role_cible = ?').run(user.id, user.role);
  res.status(204).end();
});
