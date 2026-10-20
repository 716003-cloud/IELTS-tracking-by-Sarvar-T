// Shared UI pieces.
import { h, icon } from './dom.js';
import { go } from './nav.js';
import { RANGES } from '../core/stats.js';
import { lineChartSvg, legendHtml, SKILL_VARS } from './chart.js';
import { fmtDelta } from '../core/bands.js';

/** Unsaved working copies of saved records being edited – survive navigating to statistics and back. */
export const working = new Map();

export const rangePicker = (cur, onChange) => h('div', { class: 'seg', role: 'group', 'aria-label': 'Date range' },
  RANGES.map(r => h('button', { 'aria-pressed': String(cur === r.id), onclick: () => onChange(r.id) }, r.label)));
export const tile = (label, value, sub) => h('div', { class: 'tile' }, h('div', { class: 'v' }, value), h('div', { class: 'l' }, label), sub ? h('div', { class: 'small muted' }, sub) : null);
export const emptyState = (ic, title, text, action) => h('div', { class: 'empty' }, icon(ic, 44), h('h3', {}, title), h('p', {}, text), action || null);
export const statsButton = path => h('button', { class: 'icon-btn', 'aria-label': 'Statistics', onclick: () => go(path) }, icon('chart'));
export const deltaNode = (d, suffix = '') => h('span', { class: 'delta ' + (d == null ? 'flat' : d > 0 ? 'up' : d < 0 ? 'down' : 'flat') }, d == null ? '—' : fmtDelta(d, Number.isInteger(d) ? 0 : 1) + suffix);

export function chartCard(series, targets, label, emptyText = 'No scored records in this period yet.') {
  const has = series.some(s => s.points.length);
  const el = h('div', { class: 'card chart-card' });
  if (!has) { el.append(h('p', { class: 'muted', style: { textAlign: 'center', margin: '16px 0' } }, emptyText)); return el; }
  el.innerHTML = lineChartSvg({ series, targets, label }) + legendHtml(series);
  return el;
}
export const trendChip = t => h('span', { class: 'trend ' + t.key }, h('b', {}, (t.key === 'improving' ? '▲ ' : t.key === 'declining' ? '▼ ' : t.key === 'stable' ? '● ' : '○ ') + t.label));
export const skillColor = k => SKILL_VARS[k];

export function targetLine(summary) {
  const cls = summary.key === 'reached' ? 'ok' : summary.key === 'below' ? 'warn' : '';
  return h('span', { class: 'chip ' + cls }, summary.label);
}
export const bar = (pct, color) => h('div', { class: 'bar', role: 'presentation' }, h('i', { style: { width: Math.max(2, Math.min(100, pct)) + '%', background: color || '' } }));
