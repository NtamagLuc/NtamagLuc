import path from 'node:path';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
import './db.js';
import { createApp } from './lib/miniweb.js';
import { centralesRouter } from './routes/centrales.js';
import { actifsRouter } from './routes/actifs.js';
import { mouvementsRouter } from './routes/mouvements.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PORT = process.env.PORT || 4000;

const app = createApp();

app.use('/api/centrales', centralesRouter);
app.use('/api/actifs', actifsRouter);
app.use('/api/mouvements', mouvementsRouter);

app.get('/api/health', (req, res) => res.json({ ok: true }));

const MIME_TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
};

const clientDir = path.join(__dirname, '..', '..', 'client', 'public');

app.setNotFoundFallback((req, res) => {
  if (req.path.startsWith('/api')) {
    return res.status(404).json({ error: 'Route API introuvable' });
  }
  const requestedPath = path.normalize(path.join(clientDir, req.path));
  const candidate = req.path === '/' || !requestedPath.startsWith(clientDir)
    ? path.join(clientDir, 'index.html')
    : requestedPath;
  const filePath = fs.existsSync(candidate) && fs.statSync(candidate).isFile()
    ? candidate
    : path.join(clientDir, 'index.html');

  const ext = path.extname(filePath);
  res.setHeader('Content-Type', MIME_TYPES[ext] || 'application/octet-stream');
  fs.createReadStream(filePath).pipe(res);
});

app.setErrorHandler((err, req, res) => {
  const status = err.status || 500;
  if (status >= 500) console.error(err);
  res.status(status).json({ error: err.message || 'Erreur interne du serveur' });
});

app.listen(PORT, () => {
  console.log(`Application "gestion de retrait des actifs" démarrée sur http://localhost:${PORT}`);
});
