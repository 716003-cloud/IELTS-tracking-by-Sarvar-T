// Writing: Task 1 / Task 2 lists, essay editor (view/edit), statistics.
import { h, icon, chip, clear, field, toast, confirmDialog, bandSelect, mount } from './dom.js';
import { go, goBack, replacePath } from './nav.js';
import { working, rangePicker, tile, emptyState, statsButton, chartCard, trendChip, targetLine } from './common.js';
import { settings } from './state.js';
import * as db from '../core/db.js';
import { newWriting, validateWriting, assessmentStatus, WRITING_CRITERIA } from '../core/model.js';
import { WRITING_SCORING, calcWritingTaskBand, writingScore } from '../core/scoring.js';
import { writingPoints, writingOverallPoints, inRange, summarise } from '../core/stats.js';
import { fmtBand } from '../core/bands.js';
import { fmtDate, nowISO, debounce, clone } from '../core/util.js';

const byNewest = (a, b) => (a.date + a.createdAt < b.date + b.createdAt ? 1 : -1);
const words = s => (s.trim() ? s.trim().split(/\s+/).length : 0);
const hasContent = r => r.title || r.prompt || r.essay || r.feedback || Object.values(r.criteria).some(v => v != null) || r.teacherOverall != null;
let homeTask = 1;

export async function writingHome({ root, shell }) {
  shell.setHeader({ title: 'Writing', actions: [statsButton('/writing/stats')] });
  const [t1, t2] = await Promise.all([db.records.all('writing1'), db.records.all('writing2')]);
  let q = '';
  const list = h('div'), segHost = h('div', { class: 'seg', role: 'group', 'aria-label': 'Writing task' }), fab = h('a', { class: 'fab' });
  const draw = () => {
    mount(clear(segHost), ...[1, 2].map(t => h('button', { 'aria-pressed': String(homeTask === t), onclick: () => { homeTask = t; draw(); } }, `Task ${t} (${(t === 1 ? t1 : t2).length})`)));
    fab.href = `#/writing/${homeTask}/new`; fab.setAttribute('aria-label', `New Task ${homeTask} essay`); mount(clear(fab), icon('plus'), `New Task ${homeTask}`);
    const recs = (homeTask === 1 ? t1 : t2).slice().sort(byNewest);
    const ql = q.trim().toLowerCase();
    const shown = recs.filter(r => !ql || [r.title, r.prompt, r.date, fmtDate(r.date)].join(' ').toLowerCase().includes(ql));
    clear(list);
    if (!recs.length) { mount(list, emptyState('pen', `No Task ${homeTask} essays yet`, 'Paste an essay and your teacher’s feedback to track your progress.')); return; }
    if (!shown.length) { mount(list, emptyState('search', 'Nothing matches', 'Try a different search.')); return; }
    shown.forEach(r => {
      const sc = writingScore(r), st = assessmentStatus(r, 'writing');
      mount(list, h('a', { class: 'rec', href: `#/writing/${homeTask}/${r.id}` }, h('div', { class: 'card' }, h('div', { class: 'row spread', style: { flexWrap: 'nowrap' } },
        h('div', { class: 'grow' }, h('div', { class: 't' }, r.title || 'Untitled essay'), h('div', { class: 'meta' }, `${fmtDate(r.date)} · ${words(r.essay)} words`),
          h('div', {}, r.status === 'draft' ? chip('Draft') : null, chip(st.label, st.key === 'assessed' ? 'ok' : st.key === 'partial' ? 'warn' : ''), sc?.provisional ? chip('Provisional band', 'info') : null)),
        h('div', { class: 'bandbox' }, sc ? fmtBand(sc.value) : '—')))));
    });
  };
  mount(root, h('button', { class: 'btn block', style: { marginBottom: '12px' }, onclick: () => go('/writing/stats') }, icon('chart'), 'Writing statistics'), segHost, h('div', { style: { height: '10px' } }),
    h('div', { class: 'search' }, icon('search', 20), h('input', { type: 'search', placeholder: 'Search title, question or date', 'aria-label': 'Search essays', oninput: e => { q = e.target.value; draw(); } })), h('div', { style: { height: '12px' } }), list, fab);
  draw();
}

export async function writingEditor({ root, params: [taskStr, id], shell }) {
  const task = Number(taskStr), type = task === 2 ? 'writing2' : 'writing1', crit = WRITING_CRITERIA(task);
  let rec, restored = false, persisted = true, dirty = false;
  if (id === 'new') { rec = newWriting(task); persisted = false; }
  else if (working.has(id)) { rec = working.get(id); restored = true; }
  else { rec = await db.records.get(id); if (!rec || rec.type !== type) throw new Error('Essay not found. It may have been deleted.'); }
  let editing = id === 'new' || restored || rec.status === 'draft';
  if (restored) dirty = true;   // restored unsaved edits must be confirmed before they can be discarded
  const refs = {};
  async function persist() { rec.updatedAt = nowISO(); await db.records.put(rec); if (!persisted) { persisted = true; replacePath(`/writing/${task}/${rec.id}`); } }
  const autosave = debounce(async () => { if (editing && rec.status === 'draft' && hasContent(rec)) await persist(); }, 700);
  const touch = () => { dirty = true; autosave(); };

  async function save() {
    const errs = validateWriting(rec);
    if (errs.length) { refs.alert.replaceChildren(h('div', { class: 'alert bad', role: 'alert' }, errs.join(' '))); return; }
    autosave.cancel(); rec.status = 'saved'; await persist(); working.delete(rec.id); editing = false; dirty = false; toast('Essay saved', 'ok'); render();
  }
  async function cancel() {
    if (rec.status === 'saved') {
      if (dirty && !(await confirmDialog({ title: 'Discard changes?', message: 'Your edits to this essay will be lost.', confirmText: 'Discard', danger: true }))) return;
      working.delete(rec.id); rec = await db.records.get(rec.id); editing = false; dirty = false; render();
    } else {
      if (hasContent(rec) && !(await confirmDialog({ title: 'Discard this draft?', message: 'The draft essay will be deleted.', confirmText: 'Discard draft', danger: true }))) return;
      autosave.cancel(); if (persisted) await db.records.del(rec.id); editing = false; goBack('/writing');
    }
  }
  function startEdit() { rec = clone(rec); working.set(rec.id, rec); editing = true; dirty = false; render(); }
  async function remove() {
    if (!(await confirmDialog({ title: 'Delete this essay?', message: `“${rec.title || 'Untitled essay'}” and its feedback will be permanently deleted.`, confirmText: 'Delete', danger: true }))) return;
    autosave.cancel(); working.delete(rec.id); editing = false; if (persisted) await db.records.del(rec.id); toast('Essay deleted'); go('/writing');
  }
  function refresh() {
    const prov = calcWritingTaskBand(rec.criteria);
    refs.prov.textContent = prov == null ? 'Enter all four criteria' : fmtBand(prov);
    refs.words.textContent = `${words(rec.essay)} words`;
    const st = assessmentStatus(rec, 'writing'); refs.status.textContent = st.label; refs.status.className = 'chip ' + (st.key === 'assessed' ? 'ok' : st.key === 'partial' ? 'warn' : '');
  }
  function render() {
    clear(root);
    shell.setHeader({ title: rec.title || (persisted ? 'Essay' : `New Task ${task} essay`), back: true, actions: [statsButton('/writing/stats')] });
    refs.alert = h('div', { 'aria-live': 'assertive' });
    refs.prov = h('b'); refs.words = h('span', { class: 'muted small' }); refs.status = h('span', { class: 'chip' });
    const ta = (key, rows, cls, label, ph) => editing
      ? h('textarea', { rows, class: cls || '', value: rec[key], placeholder: ph || '', 'aria-label': label, oninput: e => { rec[key] = e.target.value; if (key === 'essay') refresh(); touch(); } })
      : h('div', { class: 'essay', role: 'region', 'aria-label': label }, rec[key] || h('span', { class: 'muted' }, 'Nothing entered.'));
    mount(root, 
      restored ? h('div', { class: 'alert info' }, 'Your unsaved changes were restored. Save or cancel when you are ready.') : null, refs.alert,
      h('div', { class: 'row', style: { marginBottom: '10px' } }, chip(`Task ${task}`, 'info'), rec.status === 'draft' ? chip('Draft') : chip('Saved', 'ok'), refs.status),
      editing ? h('div', { class: 'row', style: { marginBottom: '12px' } }, h('button', { class: 'btn primary grow', onclick: save }, icon('check'), 'Save changes'),
        rec.status === 'draft' ? h('button', { class: 'btn', onclick: async () => { autosave.cancel(); await persist(); dirty = false; toast('Draft saved', 'ok'); } }, 'Save draft') : null, h('button', { class: 'btn ghost', onclick: cancel }, 'Cancel'))
        : h('div', { class: 'row', style: { marginBottom: '12px' } }, h('button', { class: 'btn primary grow', onclick: startEdit }, icon('edit'), 'Edit'), h('button', { class: 'btn ghost', onclick: remove }, icon('trash'), 'Delete')),
      h('div', { class: 'card' },
        field('Date', h('input', { type: 'date', value: rec.date, disabled: !editing, oninput: e => { rec.date = e.target.value; touch(); } })),
        field('Source / task title (optional)', h('input', { type: 'text', value: rec.title, disabled: !editing, placeholder: 'e.g. Cambridge 17 Test 3 – Task 2', oninput: e => { rec.title = e.target.value; touch(); } })),
        field('Question / prompt (optional)', ta('prompt', 3, '', 'Question or prompt'))),
      h('div', { class: 'card' }, h('div', { class: 'row spread' }, h('h2', { style: { margin: 0 } }, 'Essay'), refs.words), h('div', { style: { height: '8px' } }), ta('essay', 14, 'big', 'Essay text', 'Paste or type your essay here')),
      h('div', { class: 'card' }, h('h2', {}, 'Teacher feedback'), ta('feedback', 8, '', 'Teacher feedback', 'Paste your teacher’s comments, strengths and suggestions')),
      h('div', { class: 'card' }, h('h2', {}, 'Scores'),
        h('p', { class: 'small muted' }, 'Enter the band scores your teacher gave for each criterion (half bands allowed).'),
        crit.map(c => h('div', { class: 'crit' }, h('label', {}, c.label), bandSelect(rec.criteria[c.key], v => { rec.criteria[c.key] = v; refresh(); touch(); }, { disabled: !editing, label: c.label }))),
        h('hr', { style: { border: 0, borderTop: '1px solid var(--line)', margin: '12px 0' } }),
        h('div', { class: 'crit' }, h('label', {}, 'Teacher-assessed overall band'), bandSelect(rec.teacherOverall, v => { rec.teacherOverall = v; touch(); }, { disabled: !editing, label: 'Teacher-assessed overall band' })),
        h('div', { class: 'card', style: { background: 'var(--surface-2)', boxShadow: 'none', margin: '8px 0 0' } }, h('div', { class: 'row spread' }, h('span', {}, 'Provisional calculated band'), refs.prov),
          h('p', { class: 'small muted', style: { margin: '6px 0 0' } }, WRITING_SCORING.label + '. ', 'Your teacher’s overall band above is stored separately and never replaced by this figure.'))),
      persisted || hasContent(rec) ? null : null);
    refresh();
  }
  render();
  return () => { autosave.cancel(); if (editing && rec.status === 'draft' && hasContent(rec)) persist(); };
}

export async function writingStats({ root, shell }) {
  shell.setHeader({ title: 'Writing statistics', back: true });
  const [r1, r2] = await Promise.all([db.records.all('writing1'), db.records.all('writing2')]);
  let range = 'all'; const host = h('div');
  const target = settings.targets.writing;
  const critChart = (recs, task) => {
    const crit = WRITING_CRITERIA(task), cols = ['var(--c-listening)', 'var(--c-reading)', 'var(--c-writing)', 'var(--c-speaking)'];
    const sorted = recs.slice().sort((a, b) => (a.date < b.date ? -1 : 1));
    return chartCard(crit.map((c, i) => ({ name: c.label, color: cols[i], points: inRange(sorted.filter(r => r.criteria[c.key] != null).map(r => ({ date: r.date, value: r.criteria[c.key] })), range) })), [], `Task ${task} criterion scores`, 'Enter criterion scores to see them here.');
  };
  const section = (task, recs) => {
    const pts = writingPoints(recs), shown = inRange(pts, range), sm = summarise(pts, target);
    const recent = recs.slice().sort(byNewest).slice(0, 5);
    const crit = WRITING_CRITERIA(task);
    return h('div', {}, h('h2', { class: 'section' }, `Task ${task}`),
      !recs.length ? emptyState('pen', `No Task ${task} essays`, 'Your Task ' + task + ' statistics will appear after you save an essay with scores.') : [
        chartCard([{ name: `Task ${task} band`, color: 'var(--c-writing)', points: shown }], target ? [{ value: target, color: 'var(--accent)', label: 'Target' }] : [], `Task ${task} band over time`, 'No scored essays in this period. Hollow dots would mark provisional bands.'),
        h('div', { class: 'card' }, h('div', { class: 'row spread' }, h('h3', { style: { margin: 0 } }, 'Summary'), trendChip(sm.trend)), h('div', { style: { height: '8px' } }),
          h('div', { class: 'grid-auto' }, tile('Essays', String(recs.length)), tile('Most recent', fmtBand(sm.latest)), tile('Best', fmtBand(sm.best)), tile('Target', target ? fmtBand(target) : '—')),
          h('div', { style: { marginTop: '10px' } }, targetLine(sm.target)), sm.provisional ? h('p', { class: 'small muted' }, 'The most recent figure is provisional (calculated from criteria; no teacher overall entered).') : null),
        critChart(recs, task),
        h('div', { class: 'card', style: { overflowX: 'auto' } }, h('h3', {}, 'Recent essays'), h('table', { style: { width: '100%', borderCollapse: 'collapse', fontSize: '13px' } },
          h('thead', {}, h('tr', {}, h('th', { style: { textAlign: 'left' } }, 'Date'), crit.map(c => h('th', { title: c.label }, c.label.split(' ').map(w => w[0]).join('')) ), h('th', {}, 'Band'))),
          h('tbody', {}, recent.map(r => h('tr', {}, h('td', {}, fmtDate(r.date)), ['ta', 'cc', 'lr', 'gra'].map(k => h('td', { style: { textAlign: 'center' } }, fmtBand(r.criteria[k]))), h('td', { style: { textAlign: 'center', fontWeight: 800 } }, fmtBand(writingScore(r)?.value)))))))]);
  };
  const draw = () => {
    clear(host);
    const p1 = writingPoints(r1), p2 = writingPoints(r2), ov = writingOverallPoints(p1, p2), sm = summarise(ov, target);
    mount(host, rangePicker(range, r => { range = r; draw(); }), h('div', { style: { height: '12px' } }),
      h('h2', { class: 'section', style: { marginTop: 0 } }, 'Overall Writing'),
      ov.length ? [chartCard([{ name: 'Overall Writing', color: 'var(--c-writing)', points: inRange(ov, range) }], target ? [{ value: target, color: 'var(--accent)', label: 'Target' }] : [], 'Overall Writing over time'),
        h('div', { class: 'card' }, h('div', { class: 'row spread' }, h('h3', { style: { margin: 0 } }, `Latest overall ${fmtBand(sm.latest)}`), trendChip(sm.trend)), h('div', { style: { marginTop: '8px' } }, targetLine(sm.target)))]
        : h('div', { class: 'card' }, h('p', { class: 'muted', style: { margin: 0 } }, 'An overall Writing figure needs at least one scored Task 1 and one scored Task 2 essay. Until then, see each task below.')),
      h('p', { class: 'small muted' }, `How it is combined: ${WRITING_SCORING.combine.label}. ${WRITING_SCORING.provisional ? 'Task bands without a teacher overall use the provisional calculation. ' : ''}This method is configurable in the app’s scoring file.`),
      section(1, r1), section(2, r2));
  };
  mount(root, host); draw();
}
