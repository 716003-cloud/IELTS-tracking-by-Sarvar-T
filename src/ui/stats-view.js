// General Statistics: combines all four skills.
import { h, icon, chip, clear, mount } from './dom.js';
import { go } from './nav.js';
import { rangePicker, tile, emptyState, chartCard, trendChip, targetLine } from './common.js';
import { settings } from './state.js';
import * as db from '../core/db.js';
import { dashboard, targetStatus } from '../core/stats.js';
import { SKILLS } from '../core/model.js';
import { WRITING_SCORING } from '../core/scoring.js';
import { fmtBand } from '../core/bands.js';
import { fmtDate } from '../core/util.js';

const SK = ['listening', 'reading', 'writing', 'speaking'];
const PATH = { listening: '/listening/stats', reading: '/reading/stats', writing: '/writing/stats', speaking: '/speaking/stats' };
const label = k => k[0].toUpperCase() + k.slice(1);
let showTargets = true;

export async function statsView({ root, shell }) {
  shell.setHeader({ title: 'General Statistics' });
  const data = {};
  for (const t of ['listening', 'reading', 'writing1', 'writing2', 'speaking']) data[t] = await db.records.all(t);
  let range = 'all'; const host = h('div');
  const draw = () => {
    clear(host);
    const d = dashboard(data, settings.targets, range);
    const total = Object.values(d.counts).reduce((a, b) => a + b, 0);
    mount(host, rangePicker(range, r => { range = r; draw(); }), h('div', { style: { height: '12px' } }));
    if (!total) {
      mount(host, emptyState('chart', 'No practice recorded yet', 'Add a Listening, Reading, Writing or Speaking record and your overall progress will show up here.',
        h('div', { class: 'row', style: { justifyContent: 'center' } }, h('a', { class: 'btn primary', href: '#/listening/new' }, 'Add Listening'), h('a', { class: 'btn', href: '#/settings/targets' }, 'Set targets'))));
      return;
    }
    // overall
    const o = d.overall;
    mount(host, h('div', { class: 'card' }, h('div', { class: 'row spread', style: { flexWrap: 'nowrap' } },
      h('div', {}, h('div', { class: 'muted small', style: { fontWeight: 800 } }, 'OVERALL BAND'), h('div', { class: 'small' }, o.value == null ? 'Needs at least one scored skill' : o.complete ? 'Mean of all four skills, IELTS rounding' : `Incomplete estimate – only ${o.count} of 4 skills have a score`)),
      h('div', { class: 'bandbox', style: { fontSize: '52px' } }, fmtBand(o.value))),
      h('div', { class: 'row', style: { marginTop: '8px' } }, settings.targets.overall ? chip(`Target ${fmtBand(settings.targets.overall)}`, 'info') : h('a', { class: 'chip info', href: '#/settings/targets' }, 'Set a target'), settings.targets.overall ? targetLine(d.overallTarget) : null),
      o.estimate && o.value != null ? h('p', { class: 'small muted', style: { margin: '6px 0 0' } }, 'Missing skills are not counted as zero. Record a scored result for every skill to get the full overall band.') : null));
    // chart
    const cols = { listening: 'var(--c-listening)', reading: 'var(--c-reading)', writing: 'var(--c-writing)', speaking: 'var(--c-speaking)' };
    mount(host, h('div', { class: 'row spread', style: { margin: '4px 2px' } }, h('h2', { class: 'section', style: { margin: 0 } }, 'Progress over time'),
      h('button', { class: 'pill', 'aria-pressed': String(showTargets), onclick: () => { showTargets = !showTargets; draw(); } }, 'Show targets')),
      chartCard(SK.map(k => ({ name: label(k), color: cols[k], points: d.skills[k].points })),
        showTargets ? SK.filter(k => settings.targets[k]).map(k => ({ value: settings.targets[k], color: cols[k], label: label(k)[0] })) : [], 'Progress of all skills over time', 'No scored records in this period.'));
    // skill tiles
    mount(host, h('h2', { class: 'section' }, 'Skills'));
    mount(host, h('div', { class: 'grid2' }, SK.map(k => {
      const s = d.skills[k].summary;
      return h('a', { class: 'card skilltile', href: '#' + PATH[k], style: { margin: 0 } }, h('div', { class: 'row spread' }, h('b', {}, label(k)), icon('chevron', 18)),
        h('div', { class: 'big', style: { color: cols[k] } }, fmtBand(s.latest)), h('div', { class: 'small muted' }, `${s.count} scored · best ${fmtBand(s.best)}${s.provisional ? ' · provisional' : ''}`),
        h('div', { style: { margin: '4px 0' } }, trendChip(s.trend)),
        h('div', { class: 'small', style: { color: s.target.key === 'reached' ? 'var(--good)' : s.target.key === 'below' ? 'var(--warn)' : 'var(--muted)', fontWeight: 700 } }, s.target.key === 'no-target' ? 'No target set' : s.target.label));
    })));
    if (d.skills.writing.basis !== 'combined' && d.skills.writing.basis !== 'none') mount(host, h('p', { class: 'small muted' }, `Writing currently uses ${d.skills.writing.basis === 'task1' ? 'Task 1' : 'Task 2'} only; the combined figure needs both tasks.`));
    // focus
    const groups = { improving: [], declining: [], stable: [], insufficient: [] };
    SK.forEach(k => groups[d.skills[k].summary.trend.key].push(label(k)));
    const below = SK.filter(k => d.skills[k].summary.target.key === 'below').sort((a, b) => d.skills[b].summary.target.gap - d.skills[a].summary.target.gap);
    const reached = SK.filter(k => d.skills[k].summary.target.key === 'reached');
    mount(host, h('div', { class: 'card' }, h('h3', {}, 'At a glance'),
      [['Improving', groups.improving, 'ok'], ['Declining', groups.declining, 'bad'], ['Stable', groups.stable, ''], ['Not enough data', groups.insufficient, '']].filter(([, l]) => l.length).map(([t, l, c]) => h('div', { class: 'row', style: { marginBottom: '4px' } }, h('b', { class: 'small' }, t + ':'), l.map(x => chip(x, c)))),
      below.length ? h('div', { style: { marginTop: '6px' } }, h('b', { class: 'small' }, 'Furthest below target → closest: '), below.map(k => chip(`${label(k)} −${d.skills[k].summary.target.gap.toFixed(1)}`, 'warn'))) : null,
      reached.length ? h('div', { style: { marginTop: '6px' } }, h('b', { class: 'small' }, 'Target reached: '), reached.map(k => chip(label(k), 'ok'))) : null,
      !Object.keys(settings.targets).length ? h('p', { class: 'small muted' }, 'Set your target bands in Settings to see how far each skill is from its goal.') : null));
    // counts
    mount(host, h('div', { class: 'card' }, h('h3', {}, 'Records'), h('div', { class: 'grid-auto' },
      tile('Listening', String(d.counts.listening)), tile('Reading', String(d.counts.reading)), tile('Writing Task 1', String(d.counts.writing1)), tile('Writing Task 2', String(d.counts.writing2)), tile('Speaking sessions', String(d.counts.speaking)))));
    // attempts
    mount(host, h('div', { class: 'card' }, h('h3', {}, 'Listening & Reading attempts'), ['listening', 'reading'].map(k => {
      const a = d.attempts[k]; return h('div', { class: 'row spread', style: { marginBottom: '6px' } }, h('b', {}, SKILLS[k].label),
        h('span', { class: 'small' }, `${a.records} records · `, h('span', { class: 's2' }, `Attempt 2: ${a.attempt2Done}`), ' · ', h('span', { class: 's3' }, `Attempt 3: ${a.attempt3Done}`), a.pendingAttempt2 ? h('span', { class: 'chip warn', style: { marginLeft: '6px' } }, `${a.pendingAttempt2} awaiting Attempt 2`) : null));
    })));
    // recent
    const recent = Object.values(data).flat().sort((a, b) => (a.updatedAt < b.updatedAt ? 1 : -1)).slice(0, 8);
    const route = r => r.type === 'listening' || r.type === 'reading' ? `/${r.type}/${r.id}` : r.type === 'speaking' ? `/speaking/${r.id}` : `/writing/${r.type === 'writing1' ? 1 : 2}/${r.id}`;
    const nm = r => ({ listening: 'Listening', reading: 'Reading', writing1: 'Writing Task 1', writing2: 'Writing Task 2', speaking: 'Speaking' }[r.type]);
    mount(host, h('h2', { class: 'section' }, 'Recent activity'), recent.map(r => h('a', { class: 'list-btn', href: '#' + route(r) }, h('div', { class: 'grow' }, h('b', {}, r.source || r.title || 'Untitled'), h('span', { class: 'small muted' }, `${nm(r)} · ${fmtDate(r.date)}`)), icon('chevron', 18))));
    mount(host, h('p', { class: 'small muted' }, `Listening and Reading bands are indicative conversions. Writing: ${WRITING_SCORING.label.toLowerCase()}.`));
  };
  mount(root, host); draw();
}
