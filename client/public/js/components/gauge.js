import { performanceLevel } from '../utils.js';

export function gaugeHtml(pct, { size = 88 } = {}) {
  const clamped = Math.max(0, Math.min(100, pct ?? 0));
  const radius = 40;
  const circumference = 2 * Math.PI * radius;
  const offset = circumference * (1 - clamped / 100);
  const level = performanceLevel(clamped);
  return `
    <div class="gauge gauge-${level}" style="width:${size}px;height:${size}px;">
      <svg viewBox="0 0 100 100">
        <circle class="gauge-track" cx="50" cy="50" r="${radius}"></circle>
        <circle class="gauge-value" cx="50" cy="50" r="${radius}"
          stroke-dasharray="${circumference}" stroke-dashoffset="${offset}"></circle>
      </svg>
      <div class="gauge-label">${clamped}%</div>
    </div>
  `;
}

export function scoreDeltaHtml(avant, apres) {
  if (avant === null || avant === undefined || apres === null || apres === undefined) return '';
  const delta = Math.round((apres - avant) * 100) / 100;
  const sign = delta > 0 ? '+' : '';
  const cls = delta > 0 ? 'delta-up' : delta < 0 ? 'delta-down' : 'delta-flat';
  return `
    <div class="score-transition">
      <span class="score-before">${avant}%</span>
      <span class="score-arrow">→</span>
      <span class="score-after">${apres}%</span>
      <span class="score-delta ${cls}">(${sign}${delta} pts)</span>
    </div>
  `;
}
