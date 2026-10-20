// Dependency-free SVG line chart. Returns an SVG string so it works in the app AND in the self-contained HTML report.
// Colours come from CSS variables (--c-listening etc.) so both light/dark themes and the report can restyle it.
import { esc } from '../core/util.js';

export const SKILL_VARS = { listening: 'var(--c-listening)', reading: 'var(--c-reading)', writing: 'var(--c-writing)', speaking: 'var(--c-speaking)', overall: 'var(--c-overall)' };

const t = iso => Date.parse(iso + 'T00:00:00Z');
const shortDate = iso => new Date(t(iso)).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', timeZone: 'UTC' });

/**
 * series: [{ name, color, points:[{date, value, provisional?}], dashed? }]
 * targets: [{ value, color, label }]
 */
export function lineChartSvg({ series, targets = [], width = 340, height = 200, label = 'Score chart' }) {
  const pts = series.flatMap(s => s.points);
  if (!pts.length) return '';
  const vals = [...pts.map(p => p.value), ...targets.map(x => x.value)];
  let lo = Math.floor(Math.min(...vals) - 0.5), hi = Math.ceil(Math.max(...vals) + 0.5);
  lo = Math.max(0, lo); hi = Math.min(9, hi);
  if (hi - lo < 2) { hi = Math.min(9, lo + 2); lo = Math.max(0, hi - 2); }
  const m = { l: 30, r: 12, t: 12, b: 26 };
  const W = width - m.l - m.r, H = height - m.t - m.b;
  const times = pts.map(p => t(p.date));
  const t0 = Math.min(...times), t1 = Math.max(...times);
  const X = d => m.l + (t1 === t0 ? W / 2 : ((t(d) - t0) / (t1 - t0)) * W);
  const Y = v => m.t + H - ((v - lo) / (hi - lo)) * H;
  let g = '';
  for (let v = lo; v <= hi; v++) {
    g += `<line x1="${m.l}" x2="${m.l + W}" y1="${Y(v)}" y2="${Y(v)}" stroke="var(--grid)" stroke-width="1"/><text x="${m.l - 6}" y="${Y(v) + 3.5}" text-anchor="end" font-size="10" fill="var(--muted)">${v}</text>`;
  }
  const uniq = [...new Set(pts.map(p => p.date))].sort();
  const ticks = uniq.length <= 3 ? uniq : [uniq[0], uniq[Math.floor((uniq.length - 1) / 2)], uniq[uniq.length - 1]];
  const anchor = d => (t1 === t0 ? 'middle' : d === uniq[0] ? 'start' : d === uniq[uniq.length - 1] ? 'end' : 'middle');
  ticks.forEach(d => { g += `<text x="${X(d)}" y="${height - 8}" text-anchor="${anchor(d)}" font-size="10" fill="var(--muted)">${esc(shortDate(d))}</text>`; });
  targets.forEach(tg => {
    if (tg.value < lo || tg.value > hi) return;
    g += `<line x1="${m.l}" x2="${m.l + W}" y1="${Y(tg.value)}" y2="${Y(tg.value)}" stroke="${tg.color}" stroke-width="1.5" stroke-dasharray="5 4" opacity=".85"/>` +
      `<text x="${m.l + W}" y="${Y(tg.value) - 4}" text-anchor="end" font-size="10" font-weight="700" fill="${tg.color}">${esc(tg.label)} ${tg.value.toFixed(1)}</text>`;
  });
  const desc = [];
  series.forEach(s => {
    if (!s.points.length) return;
    const xy = s.points.map(p => `${X(p.date).toFixed(1)},${Y(p.value).toFixed(1)}`);
    if (s.points.length > 1) g += `<polyline points="${xy.join(' ')}" fill="none" stroke="${s.color}" stroke-width="2.5" stroke-linejoin="round" stroke-linecap="round"${s.dashed ? ' stroke-dasharray="2 5"' : ''}/>`;
    s.points.forEach(p => {
      g += `<circle cx="${X(p.date).toFixed(1)}" cy="${Y(p.value).toFixed(1)}" r="4.5" fill="${p.provisional ? 'var(--surface)' : s.color}" stroke="${s.color}" stroke-width="2"><title>${esc(s.name)} ${esc(shortDate(p.date))}: ${p.value.toFixed(1)}${p.provisional ? ' (provisional)' : ''}</title></circle>`;
    });
    const last = s.points[s.points.length - 1];
    desc.push(`${s.name}: ${s.points.length} points, latest ${last.value.toFixed(1)}`);
  });
  return `<svg class="chart" viewBox="0 0 ${width} ${height}" width="100%" role="img" aria-label="${esc(label + '. ' + desc.join('; '))}" xmlns="http://www.w3.org/2000/svg" style="max-width:100%;height:auto;display:block">${g}</svg>`;
}

export const legendHtml = series =>
  `<div class="legend">${series.filter(s => s.points.length).map(s => `<span class="lg"><i style="background:${s.color}${s.dashed ? ';opacity:.6' : ''}"></i>${esc(s.name)}</span>`).join('')}</div>`;
