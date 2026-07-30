// Mini framework HTTP "façon Express", sans aucune dépendance externe
// (l'environnement d'exécution n'a pas accès au registre npm).
import http from 'node:http';
import { URL } from 'node:url';

function pathToRegex(path) {
  if (path instanceof RegExp) return { regex: path, keys: [] };
  const keys = [];
  const escaped = path
    .split('/')
    .map((segment) => {
      if (segment.startsWith(':')) {
        keys.push(segment.slice(1));
        return '([^/]+)';
      }
      return segment.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    })
    .join('/');
  return { regex: new RegExp(`^${escaped}/?$`), keys };
}

export class Router {
  constructor() {
    this.stack = [];
  }
  _add(method, path, handler) {
    const { regex, keys } = pathToRegex(path);
    this.stack.push({ method, regex, keys, handler });
  }
  get(path, handler) {
    this._add('GET', path, handler);
  }
  post(path, handler) {
    this._add('POST', path, handler);
  }
  put(path, handler) {
    this._add('PUT', path, handler);
  }
  delete(path, handler) {
    this._add('DELETE', path, handler);
  }
}

export class HttpError extends Error {
  constructor(status, message) {
    super(message);
    this.status = status;
  }
}

export function createApp() {
  const routers = []; // { prefix, router }
  const routes = []; // { method, regex, keys, handler }
  let errorHandler = null;
  let notFoundFallback = null;
  let authResolver = null;

  const app = {
    use(prefix, router) {
      routers.push({ prefix, router });
    },
    get(path, handler) {
      const { regex, keys } = pathToRegex(path);
      routes.push({ method: 'GET', regex, keys, handler });
    },
    setErrorHandler(fn) {
      errorHandler = fn;
    },
    setNotFoundFallback(fn) {
      notFoundFallback = fn;
    },
    setAuthResolver(fn) {
      authResolver = fn;
    },
    listen(port, cb) {
      const server = http.createServer((req, res) => handleRequest(req, res));
      return server.listen(port, cb);
    },
  };

  async function handleRequest(req, res) {
    const u = new URL(req.url, 'http://localhost');
    req.path = decodeURIComponent(u.pathname);
    req.query = Object.fromEntries(u.searchParams.entries());

    res.status = (code) => {
      res.statusCode = code;
      return res;
    };
    res.json = (data) => {
      const body = JSON.stringify(data);
      res.setHeader('Content-Type', 'application/json; charset=utf-8');
      res.end(body);
    };

    // CORS
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET,POST,PUT,DELETE,OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
    if (req.method === 'OPTIONS') {
      res.statusCode = 204;
      return res.end();
    }

    try {
      req.body = await parseJsonBody(req);
      req.user = authResolver ? authResolver(req) : null;

      for (const { prefix, router } of routers) {
        if (req.path === prefix || req.path.startsWith(prefix + '/')) {
          const subPath = req.path.slice(prefix.length) || '/';
          for (const r of router.stack) {
            if (r.method !== req.method) continue;
            const m = r.regex.exec(subPath);
            if (!m) continue;
            req.params = {};
            r.keys.forEach((k, i) => (req.params[k] = m[i + 1]));
            await r.handler(req, res);
            return;
          }
        }
      }

      for (const r of routes) {
        if (r.method !== req.method) continue;
        const m = r.regex.exec(req.path);
        if (!m) continue;
        req.params = {};
        r.keys.forEach((k, i) => (req.params[k] = m[i + 1]));
        await r.handler(req, res);
        return;
      }

      if (notFoundFallback && req.method === 'GET') {
        return notFoundFallback(req, res);
      }

      res.status(404).json({ error: 'Route introuvable' });
    } catch (err) {
      if (errorHandler) return errorHandler(err, req, res);
      const status = err.status || 500;
      if (status >= 500) console.error(err);
      res.status(status).json({ error: err.message || 'Erreur interne du serveur' });
    }
  }

  return app;
}

function parseJsonBody(req) {
  if (!['POST', 'PUT', 'PATCH', 'DELETE'].includes(req.method)) return Promise.resolve({});
  const contentType = req.headers['content-type'] || '';
  if (!contentType.includes('application/json')) return Promise.resolve({});
  return new Promise((resolve, reject) => {
    let raw = '';
    req.on('data', (chunk) => (raw += chunk));
    req.on('end', () => {
      if (!raw) return resolve({});
      try {
        resolve(JSON.parse(raw));
      } catch {
        reject(new HttpError(400, 'Corps de requête JSON invalide'));
      }
    });
    req.on('error', reject);
  });
}
