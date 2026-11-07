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
          ${it.pct == null ? '' : `<rect x="${x.toFixed(1)}" y="${y.toFixed(1)}" width="${bw.toFixed(1)}" height="${h.toFixed(1)}" rx="6" fill="${it.color || (it.current ? '#FF2A3D' : 'rgba(255,42,61,.55)')}"/>`}
          <text x="${(x + bw / 2).toFixed(1)}" y="${(it.pct == null ? H - bottom - 6 : y - 4).toFixed(1)}" text-anchor="middle" font-size="10" fill="${it.pct == null ? 'rgba(255,255,255,.3)' : '#fff'}" font-weight="600">${esc(it.text)}</text>
          <text x="${(x + bw / 2).toFixed(1)}" y="${H - 4}" text-anchor="middle" font-size="10" fill="${it.labelColor || (it.current ? '#FF2A3D' : 'rgba(255,255,255,.45)')}">${esc(it.label)}</text>`;
      }).join('')}
    </svg>`;
}

const MONTHS = ['jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'out', 'nov', 'dez'];

/**
 * Mapa de calor ao estilo GitHub: colunas = semanas (segunda a domingo), linhas = dias.
 * @param days  lista de { date: 'AAAA-MM-DD', fill } a começar numa segunda-feira (fill = cor ou null)
 */
export function heatmap(days, { cell = 5.4, gap = 1 } = {}) {
  const weeks = Math.ceil(days.length / 7);
  const step = cell + gap;
  const top = 12;
  const width = weeks * step;
  const H = top + 7 * step;
  let labels = '';
  let lastMonth = -1;
  const rects = days.map((d, i) => {
    const col = Math.floor(i / 7), row = i % 7;
    const m = Number(d.date.slice(5, 7)) - 1;
    if (row === 0 && m !== lastMonth && Number(d.date.slice(8)) <= 7) {
      labels += `<text x="${(col * step).toFixed(1)}" y="8" font-size="8" fill="rgba(255,255,255,.4)">${MONTHS[m]}</text>`;
      lastMonth = m;
    }
    return d.fill ? `<rect x="${(col * step).toFixed(1)}" y="${(top + row * step).toFixed(1)}" width="${cell}" height="${cell}" rx="1.4" fill="${d.fill}"/>` : '';
  }).join('');
  return `<svg class="chart heatmap" viewBox="0 0 ${width.toFixed(1)} ${H.toFixed(1)}" width="100%" role="img" aria-label="Mapa do ano">${labels}${rects}</svg>`;
}

/** Cor do mapa para um nível 0–1 (null = vazio). */
export function heatFill(v) {
  if (v == null) return 'rgba(255,255,255,.035)';
  if (v <= 0) return '#1d1d20';
  return `rgba(255,42,61,${(0.28 + 0.72 * Math.min(1, v)).toFixed(2)})`;
}

/** Paleta para categorias (vermelhos, brancos e cinzentos, no estilo da app). */
export const CAT_COLORS = ['#FF2A3D', '#FFFFFF', '#FF7A86', '#9E1B29', '#B9B9BE', '#FFB3BA', '#6E6E73', '#D4384A', '#48484A', '#FFD9DC', '#5A0F17', '#8E8E93'];

/**
 * Donut. items: [{ value, color, label }]. center: { big, small }.
 */
export function donut(items, { size = 150, thick = 20, center = {} } = {}) {
  const total = items.reduce((s, i) => s + i.value, 0);
  const r = (size - thick) / 2;
  const c = size / 2;
  const circ = 2 * Math.PI * r;
  let offset = 0;
  const gap = items.length > 1 ? 2 : 0;
  const arcs = total ? items.map((it) => {
    const len = (it.value / total) * circ;
    const dash = Math.max(0, len - gap);
    const el = `<circle cx="${c}" cy="${c}" r="${r.toFixed(2)}" fill="none" stroke="${it.color}" stroke-width="${thick}"
      stroke-dasharray="${dash.toFixed(2)} ${(circ - dash).toFixed(2)}" stroke-dashoffset="${(-offset).toFixed(2)}" transform="rotate(-90 ${c} ${c})"/>`;
    offset += len;
    return el;
  }).join('') : `<circle cx="${c}" cy="${c}" r="${r}" fill="none" stroke="rgba(255,255,255,.06)" stroke-width="${thick}"/>`;
  return `
    <svg class="chart donut" viewBox="0 0 ${size} ${size}" width="${size}" height="${size}" role="img" aria-label="Gastos por categoria">
      ${arcs}
      <text x="${c}" y="${c - 2}" text-anchor="middle" font-size="18" font-weight="800" fill="#fff" font-family="-apple-system, system-ui, sans-serif">${esc(center.big || '')}</text>
      <text x="${c}" y="${c + 16}" text-anchor="middle" font-size="10" fill="rgba(255,255,255,.5)" font-family="-apple-system, system-ui, sans-serif">${esc(center.small || '')}</text>
    </svg>`;
}

/**
 * Barras agrupadas (ex.: entrou vs. saiu por mês).
 * groups: [{ label, a, b, current }] com a = vermelho, b = branco (valores já em unidades a mostrar).
 */
export function groupedBars(groups, { height = 140, fmt = (v) => String(v) } = {}) {
  const H = height, top = 14, bottom = 18;
  const n = groups.length || 1;
  const gap = 12;
  const gw = (W - gap * (n - 1)) / n;
  const bw = (gw - 4) / 2;
  const max = Math.max(1, ...groups.flatMap((g) => [g.a, g.b]));
  const hOf = (v) => (v / max) * (H - top - bottom);
  return `
    <svg class="chart" viewBox="0 0 ${W} ${H}" width="100%" role="img" aria-label="Entradas e saídas por mês">
      <g stroke="rgba(255,255,255,.06)"><line x1="0" x2="${W}" y1="${H - bottom}" y2="${H - bottom}"/></g>
      ${groups.map((g, i) => {
        const x = i * (gw + gap);
        const ha = hOf(g.a), hb = hOf(g.b);
        return `
          <rect x="${x.toFixed(1)}" y="${(H - bottom - ha).toFixed(1)}" width="${bw.toFixed(1)}" height="${ha.toFixed(1)}" rx="4" fill="${g.current ? '#FF2A3D' : 'rgba(255,42,61,.6)'}"/>
          <rect x="${(x + bw + 4).toFixed(1)}" y="${(H - bottom - hb).toFixed(1)}" width="${bw.toFixed(1)}" height="${hb.toFixed(1)}" rx="4" fill="${g.current ? '#ffffff' : 'rgba(255,255,255,.45)'}"/>
          ${g.a ? `<text x="${(x + bw / 2).toFixed(1)}" y="${(H - bottom - ha - 3).toFixed(1)}" text-anchor="middle" font-size="8.5" fill="rgba(255,255,255,.75)">${esc(fmt(g.a))}</text>` : ''}
          <text x="${(x + gw / 2).toFixed(1)}" y="${H - 4}" text-anchor="middle" font-size="10" fill="${g.current ? '#FF2A3D' : 'rgba(255,255,255,.45)'}">${esc(g.label)}</text>`;
      }).join('')}
    </svg>`;
}
