import { escapeHtml, formatNombre } from '../utils.js';

// Liste de barres horizontales — réutilise les classes .bar-chart/.bar-row déjà
// définies dans styles.css (reporting), généralisées pour n'importe quel jeu de données.
export function barListHtml(items, { formatValue = (v) => formatNombre(v), emptyLabel = 'Aucune donnée.' } = {}) {
  const filtres = items.filter((it) => it.value > 0);
  if (!filtres.length) return `<p class="empty-state">${escapeHtml(emptyLabel)}</p>`;
  const max = Math.max(...filtres.map((it) => it.value));
  return `
    <div class="bar-chart">
      ${filtres
        .map((it) => {
          const pct = max > 0 ? Math.round((it.value / max) * 100) : 0;
          const attrs = it.href ? `href="${it.href}"` : '';
          const tag = it.href ? 'a' : 'div';
          const clickable = it.href || it.dataAttrs;
          return `
          <${tag} class="bar-row ${clickable ? 'bar-row-link' : ''}" ${attrs} ${it.dataAttrs || ''}>
            <span class="bar-label">${escapeHtml(it.label)}</span>
            <div class="bar-track"><div class="bar-fill" style="width:${pct}%; background:${it.color || 'var(--color-primary)'};"></div></div>
            <span class="bar-value">${formatValue(it.value)}</span>
          </${tag}>
        `;
        })
        .join('')}
    </div>
  `;
}

// Courbe d'évolution (série unique) en SVG pur, sans dépendance.
// points: [{ date: 'YYYY-MM-DD', value: number }]
export function lineChartSvg(points, { width = 640, height = 180, seuil = null, unite = '%', color = '#2563eb' } = {}) {
  if (!points || points.length < 2) return '<p class="empty-state">Données insuffisantes pour tracer une courbe.</p>';
  const padL = 34;
  const padR = 12;
  const padT = 14;
  const padB = 24;
  const innerW = width - padL - padR;
  const innerH = height - padT - padB;
  const values = points.map((p) => p.value);
  const min = Math.min(0, ...values);
  const max = Math.max(100, ...values, seuil ?? 0);
  const scaleX = (i) => padL + (i / (points.length - 1)) * innerW;
  const scaleY = (v) => padT + innerH - ((v - min) / (max - min || 1)) * innerH;

  const linePoints = points.map((p, i) => `${scaleX(i).toFixed(1)},${scaleY(p.value).toFixed(1)}`).join(' ');
  const areaPoints = `${scaleX(0).toFixed(1)},${scaleY(min).toFixed(1)} ${linePoints} ${scaleX(points.length - 1).toFixed(1)},${scaleY(min).toFixed(1)}`;

  const seuilY = seuil !== null ? scaleY(seuil) : null;

  const idxLabels = [0, Math.floor((points.length - 1) / 2), points.length - 1];
  const xLabels = idxLabels
    .map((i) => `<text x="${scaleX(i).toFixed(1)}" y="${height - 6}" class="chart-axis-label" text-anchor="${i === 0 ? 'start' : i === points.length - 1 ? 'end' : 'middle'}">${escapeHtml(points[i].date)}</text>`)
    .join('');

  const yTicks = [min, (min + max) / 2, max].map(
    (v) => `<text x="${padL - 6}" y="${(scaleY(v) + 3).toFixed(1)}" class="chart-axis-label" text-anchor="end">${Math.round(v)}${unite}</text>`
  ).join('');

  const dots = points
    .map((p, i) => `<circle cx="${scaleX(i).toFixed(1)}" cy="${scaleY(p.value).toFixed(1)}" r="2.5" fill="${color}"><title>${escapeHtml(p.date)} : ${p.value}${unite}</title></circle>`)
    .join('');

  return `
    <svg class="chart-line" viewBox="0 0 ${width} ${height}" role="img" aria-label="Évolution dans le temps">
      ${seuilY !== null ? `<line x1="${padL}" y1="${seuilY.toFixed(1)}" x2="${width - padR}" y2="${seuilY.toFixed(1)}" class="chart-threshold-line" />
      <text x="${width - padR}" y="${seuilY.toFixed(1) - 4}" class="chart-axis-label" text-anchor="end">Seuil ${seuil}${unite}</text>` : ''}
      <polygon points="${areaPoints}" fill="${color}" opacity="0.12" stroke="none" />
      <polyline points="${linePoints}" fill="none" stroke="${color}" stroke-width="2" stroke-linejoin="round" stroke-linecap="round" />
      ${dots}
      ${yTicks}
      ${xLabels}
    </svg>
  `;
}
