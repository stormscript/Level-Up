// Gráficos em SVG, feitos à mão (sem bibliotecas), no estilo da app.
import { esc } from './dom.js';

const W = 330;

/**
 * Gráfico de linha do progresso.
 * @param o.points     [{x, y}] valores reais (x = dia desde o início)
 * @param o.ideal      [{x, y}, {x, y}] linha do ritmo ideal
 * @param o.projection [{x, y}, {x, y}] | null projeção a partir de hoje
 * @param o.xMax       último dia (prazo)
 * @param o.target     valor objetivo (linha horizontal)
 * @param o.labels     [{x, text}] rótulos do eixo X
 * @param o.marks      [{y, reached}] marcos (traços à direita)
 * @param o.stepped    true = só pontos de medição (com círculos)
 */
export function lineChart({ points = [], ideal = [], projection = null, xMax = 1, target = null, labels = [], marks = [], stepped = false, height = 160 }) {
  const H = height;
  const top = 12, bottom = 20, left = 0, right = 8;
  const ys = [...points.map((p) => p.y), ...ideal.map((p) => p.y), ...(projection || []).map((p) => p.y), ...(target != null ? [target] : [])];
  let yMin = Math.min(...ys), yMax = Math.max(...ys);
  if (!isFinite(yMin)) { yMin = 0; yMax = 1; }
  if (yMin === yMax) { yMin -= 1; yMax += 1; }
  const pad = (yMax - yMin) * 0.08;
  yMin -= pad; yMax += pad;
  const sx = (x) => left + (Math.max(0, Math.min(xMax, x)) / Math.max(1, xMax)) * (W - left - right);
  const sy = (y) => top + (1 - (y - yMin) / (yMax - yMin)) * (H - top - bottom);
  const path = (pts) => pts.map((p, i) => `${i ? 'L' : 'M'}${sx(p.x).toFixed(1)} ${sy(p.y).toFixed(1)}`).join(' ');

  const grid = [0.25, 0.5, 0.75].map((f) => `<line x1="0" x2="${W}" y1="${(top + f * (H - top - bottom)).toFixed(1)}" y2="${(top + f * (H - top - bottom)).toFixed(1)}"/>`).join('');
  const last = points[points.length - 1];
  const area = points.length > 1
    ? `<path d="${path(points)} L${sx(last.x).toFixed(1)} ${H - bottom} L${sx(points[0].x).toFixed(1)} ${H - bottom}Z" fill="url(#lc-fill)"/>`
    : '';
  return `
    <svg class="chart" viewBox="0 0 ${W} ${H}" width="100%" role="img" aria-label="Gráfico de progresso">
      <defs>
        <linearGradient id="lc-fill" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#FF2A3D" stop-opacity=".32"/><stop offset="1" stop-color="#FF2A3D" stop-opacity="0"/></linearGradient>
        <filter id="lc-glow" x="-10%" y="-10%" width="120%" height="120%"><feGaussianBlur stdDeviation="2.5" result="b"/><feMerge><feMergeNode in="b"/><feMergeNode in="SourceGraphic"/></feMerge></filter>
      </defs>
      <g stroke="rgba(255,255,255,.06)">${grid}</g>
      ${target != null ? `<line x1="0" x2="${W}" y1="${sy(target).toFixed(1)}" y2="${sy(target).toFixed(1)}" stroke="rgba(255,42,61,.35)" stroke-width="1"/>` : ''}
      ${marks.map((m) => `<line x1="${W - right - 6}" x2="${W}" y1="${sy(m.y).toFixed(1)}" y2="${sy(m.y).toFixed(1)}" stroke="${m.reached ? '#FF2A3D' : 'rgba(255,255,255,.35)'}" stroke-width="2"/>`).join('')}
      ${ideal.length === 2 ? `<path d="${path(ideal)}" fill="none" stroke="rgba(255,255,255,.38)" stroke-width="1.5" stroke-dasharray="4 5"/>` : ''}
      ${area}
      ${projection ? `<path d="${path(projection)}" fill="none" stroke="#FF2A3D" stroke-width="1.5" stroke-dasharray="2 5" opacity=".7"/>` : ''}
      ${points.length > 1 ? `<path d="${path(points)}" fill="none" stroke="#FF2A3D" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round" filter="url(#lc-glow)"/>` : ''}
      ${stepped ? points.map((p) => `<circle cx="${sx(p.x).toFixed(1)}" cy="${sy(p.y).toFixed(1)}" r="2.6" fill="#FF2A3D"/>`).join('') : ''}
      ${last ? `<circle cx="${sx(last.x).toFixed(1)}" cy="${sy(last.y).toFixed(1)}" r="4.5" fill="#fff"/>` : ''}
      <g fill="rgba(255,255,255,.4)" font-size="10" font-family="-apple-system, system-ui, sans-serif">
        ${labels.map((l, i) => `<text x="${sx(l.x).toFixed(1)}" y="${H - 5}" text-anchor="${i === 0 ? 'start' : i === labels.length - 1 ? 'end' : 'middle'}">${esc(l.text)}</text>`).join('')}
      </g>
    </svg>`;
}

/**
 * Gráfico de barras simples (histórico).
 * @param items [{ label, pct (0–1 ou null), text, current }]
 */
export function barChart(items, { height = 120 } = {}) {
  const H = height, top = 16, bottom = 18;
  const n = items.length || 1;
  const gap = 10;
  const bw = (W - gap * (n - 1)) / n;
  return `
    <svg class="chart" viewBox="0 0 ${W} ${H}" width="100%" role="img" aria-label="Histórico">
      ${items.map((it, i) => {
        const x = i * (bw + gap);
        const h = it.pct == null ? 0 : Math.max(3, it.pct * (H - top - bottom));
        const y = H - bottom - h;
        return `
          <rect x="${x.toFixed(1)}" y="${top}" width="${bw.toFixed(1)}" height="${H - top - bottom}" rx="6" fill="rgba(255,255,255,.04)"/>
          ${it.pct == null ? '' : `<rect x="${x.toFixed(1)}" y="${y.toFixed(1)}" width="${bw.toFixed(1)}" height="${h.toFixed(1)}" rx="6" fill="${it.current ? '#FF2A3D' : 'rgba(255,42,61,.55)'}"/>`}
          <text x="${(x + bw / 2).toFixed(1)}" y="${(it.pct == null ? H - bottom - 6 : y - 4).toFixed(1)}" text-anchor="middle" font-size="10" fill="${it.pct == null ? 'rgba(255,255,255,.3)' : '#fff'}" font-weight="600">${esc(it.text)}</text>
          <text x="${(x + bw / 2).toFixed(1)}" y="${H - 4}" text-anchor="middle" font-size="10" fill="${it.current ? '#FF2A3D' : 'rgba(255,255,255,.45)'}">${esc(it.label)}</text>`;
      }).join('')}
    </svg>`;
}
