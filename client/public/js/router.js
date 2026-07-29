const routes = [];
const appRoot = () => document.getElementById('app');

export function route(pattern, handler) {
  const keys = [];
  const regex = new RegExp(
    '^' +
      pattern
        .split('/')
        .map((seg) => {
          if (seg.startsWith(':')) {
            keys.push(seg.slice(1));
            return '([^/]+)';
          }
          return seg;
        })
        .join('/') +
      '$'
  );
  routes.push({ regex, keys, handler });
}

async function render() {
  const hash = location.hash.slice(1) || '/';
  const path = hash.split('?')[0];

  for (const r of routes) {
    const m = r.regex.exec(path);
    if (!m) continue;
    const params = {};
    r.keys.forEach((k, i) => (params[k] = m[i + 1]));
    appRoot().innerHTML = '<div class="page-loading">Chargement…</div>';
    try {
      await r.handler(params);
    } catch (err) {
      appRoot().innerHTML = `<div class="page-error">Erreur : ${err.message}</div>`;
    }
    return;
  }
  appRoot().innerHTML = '<div class="page-error">Page introuvable.</div>';
}

export function startRouter() {
  window.addEventListener('hashchange', render);
  render();
}

export function refresh() {
  render();
}
