// Listening & Reading: history list, record editor with three attempts, statistics.
import { h, icon, chip, clear, field, toast, confirmDialog, alertDialog, mount } from './dom.js';
import { go, goBack, replacePath } from './nav.js';
import { working, rangePicker, tile, emptyState, statsButton, deltaNode, chartCard, trendChip, targetLine, bar } from './common.js';
import { settings, activeCategories, categoryLabel } from './state.js';
import * as db from '../core/db.js';
import { SKILLS, newPractice, recordSummary, validatePractice, canMarkComplete, parseScoreInput } from '../core/model.js';
import { REVIEW_STATES } from '../core/categories.js';
import { practicePoints, inRange, practiceAggregates, partAverages, mistakeFrequency, summarise } from '../core/stats.js';
import { fmtBand, fmtDelta } from '../core/bands.js';
import { fmtDate, nowISO, debounce, clone } from '../core/util.js';

const byNewest = (a, b) => (a.date + a.createdAt < b.date + b.createdAt ? 1 : -1);
const hasContent = r => r.source || r.description || r.partTitles.some(Boolean) ||
  [1, 2, 3].some(a => r.attempts[a].scores.some(v => v != null)) || r.mistakes.some(m => m.categories.length || m.custom);

// ───────────────────────── list ─────────────────────────
export async function practiceList({ root, params: [kind], shell }) {
  const cfg = SKILLS[kind];
  shell.setHeader({ title: cfg.label, actions: [statsButton(`/${kind}/stats`)] });
  const recs = (await db.records.all(kind)).sort(byNewest);
  let q = '', filter = 'all';
  const list = h('div');
  const FILTERS = [['all', 'All'], ['todo', 'Attempt 2 needed'], ['done', 'Complete']];
  const filterBar = h('div', { class: 'seg', role: 'group', 'aria-label': 'Filter records' });
  const draw = () => {
    mount(clear(filterBar), ...FILTERS.map(([id, l]) => h('button', { 'aria-pressed': String(filter === id), onclick: () => { filter = id; draw(); } }, l)));
    const ql = q.trim().toLowerCase();
    const shown = recs.filter(r => {
      const s = recordSummary(r);
      if (filter === 'todo' && s.attempt2Done) return false;
      if (filter === 'done' && !r.completed) return false;
      return !ql || [r.source, r.description, r.date, fmtDate(r.date), ...r.partTitles].join(' ').toLowerCase().includes(ql);
    });
    clear(list);
    if (!recs.length) { mount(list, emptyState(kind === 'listening' ? 'headphones' : 'book', `No ${cfg.label} records yet`, 'Tap “New record” after your next practice test to start tracking your progress.')); return; }
    if (!shown.length) { mount(list, emptyState('search', 'Nothing matches', 'Try a different search or filter.')); return; }
    shown.forEach(r => {
      const s = recordSummary(r);
      const totals = [0, 1, 2].filter(i => s.attempts[i].total != null).map(i => h('span', { class: 's' + (i + 1) }, String(s.attempts[i].total)));
      const line = h('div', { class: 'scores' });
      totals.forEach((t, i) => { if (i) line.append(' → '); line.append(t); });
      if (!totals.length) line.append(h('span', { class: 'muted' }, 'No complete attempt yet'));
      else line.append(' / 40');
      if (s.totalImprovementFirstToFinal != null) line.append(' ', deltaNode(s.totalImprovementFirstToFinal));
      mount(list, h('a', { class: 'rec', href: `#/${kind}/${r.id}` }, h('div', { class: 'card' }, h('div', { class: 'row spread', style: { flexWrap: 'nowrap' } },
        h('div', { class: 'grow' }, h('div', { class: 't' }, r.source || 'Untitled test'), h('div', { class: 'meta' }, fmtDate(r.date)), line,
          h('div', {}, r.status === 'draft' ? chip('Draft') : null, r.completed ? chip('Complete', 'ok') : (s.attempts[0].complete && !s.attempt2Done ? chip('Attempt 2 needed', 'warn') : null), s.attempt3Done ? chip('Attempt 3', 'info') : null)),
        h('div', { class: 'bandbox', 'aria-label': 'Estimated band' }, fmtBand(s.finalBand))))));
    });
  };
  mount(root, h('div', { class: 'search' }, icon('search', 20), h('input', { type: 'search', placeholder: 'Search by source, date or description', 'aria-label': 'Search records', oninput: e => { q = e.target.value; draw(); } })), h('div', { style: { height: '10px' } }), filterBar, h('div', { style: { height: '12px' } }), list,
    h('a', { class: 'fab', href: `#/${kind}/new`, 'aria-label': `New ${cfg.label} record` }, icon('plus'), 'New record'));
  draw();
}

// ───────────────────────── editor ─────────────────────────
export async function practiceEditor({ root, params: [kind, id], shell }) {
  const cfg = SKILLS[kind], n = cfg.parts;
  let rec, restored = false, persisted = true, dirty = false, editMistakes = false, mistakesStartedEdit = false;
  if (id === 'new') { rec = newPractice(kind); persisted = false; }
  else if (working.has(id)) { rec = working.get(id); restored = true; }
  else { rec = await db.records.get(id); if (!rec || rec.type !== kind) throw new Error('Record not found. It may have been deleted.'); }
  let editing = id === 'new' || restored || rec.status === 'draft';
  if (restored) dirty = true;   // restored unsaved edits must be confirmed before they can be discarded
  const sums0 = recordSummary(rec);
  let attempt = sums0.attempts[0].complete && !sums0.attempt2Done ? 2 : 1;
  const errors = {};
  const sources = [...new Set((await db.records.all(kind)).map(r => r.source).filter(Boolean))];
  let refs = {};

  async function persist() { rec.updatedAt = nowISO(); await db.records.put(rec); if (!persisted) { persisted = true; replacePath(`/${kind}/${rec.id}`); } }
  const autosave = debounce(async () => { if (editing && rec.status === 'draft' && hasContent(rec)) await persist(); }, 700);
  const touch = () => { dirty = true; autosave(); };

  async function save() {
    const msgs = [...Object.entries(errors).filter(([, v]) => v).map(([k, v]) => { const [a, p] = k.split('-'); return `Attempt ${a}, ${cfg.partWord} ${+p + 1}: ${v}`; }), ...validatePractice(rec)];
    if (msgs.length) { refs.alert.replaceChildren(h('div', { class: 'alert bad', role: 'alert' }, 'Please fix before saving:', h('ul', {}, [...new Set(msgs)].map(m => h('li', {}, m))))); refs.alert.scrollIntoView?.({ block: 'center' }); return false; }
    refs.alert.replaceChildren();
    autosave.cancel();
    rec.status = 'saved'; await persist(); working.delete(rec.id); editing = false; dirty = false; editMistakes = false;
    const s = recordSummary(rec);
    const parts = [];
    if (s.improvements.a2vs1 != null) parts.push(`Attempt 2: ${fmtDelta(s.improvements.a2vs1)} vs Attempt 1`);
    if (s.improvements.a3vs2 != null) parts.push(`Attempt 3: ${fmtDelta(s.improvements.a3vs2)} vs Attempt 2`);
    toast('Saved' + (parts.length ? ' · ' + parts.join(' · ') : ''), 'ok');
    render(); return true;
  }
  async function cancel() {
    if (rec.status === 'saved') {
      if (dirty && !(await confirmDialog({ title: 'Discard changes?', message: 'Your edits to this record will be lost.', confirmText: 'Discard', danger: true }))) return;
      working.delete(rec.id); rec = await db.records.get(rec.id); editing = false; dirty = false; editMistakes = false; Object.keys(errors).forEach(k => delete errors[k]); render();
    } else {
      if (hasContent(rec) && !(await confirmDialog({ title: 'Discard this draft?', message: 'The draft will be deleted.', confirmText: 'Discard draft', danger: true }))) return;
      autosave.cancel(); if (persisted) await db.records.del(rec.id); editing = false; goBack(`/${kind}`);
    }
  }
  function startEdit() { rec = clone(rec); working.set(rec.id, rec); editing = true; dirty = false; render(); }
  async function remove() {
    if (!(await confirmDialog({ title: 'Delete this record?', message: `“${rec.source || 'Untitled test'}” and all three attempts will be permanently deleted. This cannot be undone.`, confirmText: 'Delete', danger: true }))) return;
    autosave.cancel(); working.delete(rec.id); editing = false; if (persisted) await db.records.del(rec.id); toast('Record deleted'); go(`/${kind}`);
  }
  async function review(p, cid, state) {
    rec.mistakes[p].review[cid] = state;
    if (editing) touch(); else await persist();
    renderMistakes();
  }
  async function complete() {
    if (editing && !(await save())) return;
    const c = canMarkComplete(rec);
    if (!c.ok) { refs.alert.replaceChildren(h('div', { class: 'alert warn', role: 'alert' }, c.message)); refs.alert.scrollIntoView?.({ block: 'center' }); return; }
    rec.completed = true; rec.status = 'saved'; await persist(); toast('Record marked complete', 'ok'); render();
  }
  async function reopen() { rec.completed = false; await persist(); render(); }

  // ----- derived refresh (no rebuild, so typing never loses focus)
  function refresh() {
    const s = recordSummary(rec);
    const a = attempt, at = s.attempts[a - 1];
    refs.partDeltas?.forEach((el, p) => { const d = a > 1 ? s.partDeltas[a][p] : null; el.replaceChildren(a > 1 ? deltaNode(d) : ''); });
    if (refs.total) {
      refs.total.textContent = at.total == null ? '—' : String(at.total);
      refs.incorrect.textContent = at.incorrect == null ? '—' : String(at.incorrect);
      refs.band.textContent = fmtBand(at.band);
      refs.note.textContent = at.complete ? '' : at.started ? `Enter all ${n} ${cfg.partWord.toLowerCase()} scores to see the total and band.` : '';
      const lines = [];
      if (a === 2) lines.push(['vs Attempt 1', s.improvements.a2vs1, s.bandImprovements.a2vs1]);
      if (a === 3) lines.push(['vs Attempt 2', s.improvements.a3vs2, s.bandImprovements.a3vs2], ['vs Attempt 1', s.improvements.a3vs1, s.bandImprovements.a3vs1]);
      refs.imp.replaceChildren(...lines.map(([l, d, b]) => h('div', { class: 'row', style: { marginTop: '6px' } }, h('b', {}, 'Improvement ' + l + ':'), d == null ? h('span', { class: 'muted' }, 'complete both attempts to compare') : [deltaNode(d, ' answers'), b != null ? h('span', { class: 'muted small' }, `(band ${fmtDelta(b, 1)})`) : null])));
    }
    refs.tabs?.forEach((btn, i) => { const x = s.attempts[i]; btn.querySelector('small').textContent = x.complete ? `${x.total}/40 · ${fmtBand(x.band)}` : x.started ? 'incomplete' : i === 1 ? 'required' : i === 2 ? 'optional' : 'not entered'; });
    if (refs.steps) {
      const step = (ok, text) => h('li', { class: ok ? 'ok' : 'no' }, icon(ok ? 'check' : 'chevron', 20), h('span', {}, text));
      refs.steps.replaceChildren(step(s.attempts[0].complete, 'Attempt 1 entered'), step(s.attempt2Done, 'Attempt 2 entered (required)'), step(s.attempt3Done, 'Attempt 3 entered (optional)'));
    }
  }

  function scorePanel() {
    const a = attempt;
    refs.partDeltas = [];
    const rows = Array.from({ length: n }, (_, p) => {
      const err = h('div', { class: 'err', role: 'alert' });
      const input = h('input', { type: 'text', inputmode: 'numeric', autocomplete: 'off', value: rec.attempts[a].scores[p] ?? '', disabled: !editing, placeholder: '0', 'aria-label': `Attempt ${a} ${cfg.partWord} ${p + 1} correct answers out of ${cfg.max[p]}`,
        oninput: e => {
          const r = parseScoreInput(kind, p, e.target.value);
          rec.attempts[a].scores[p] = r.value; errors[`${a}-${p}`] = r.error;
          err.textContent = r.error || ''; e.target.classList.toggle('invalid', !!r.error);
          refresh(); touch();
        } });
      const dl = h('div', { class: 'dl' }); refs.partDeltas.push(dl);
      return h('div', {}, h('div', { class: 'scorerow' }, h('div', { class: 'lab' }, `${cfg.partWord} ${p + 1}`, rec.partTitles[p] ? h('div', { class: 'small muted' }, rec.partTitles[p]) : null), input, h('div', { class: 'of' }, `/${cfg.max[p]}`), dl), err);
    });
    refs.total = h('div', { class: 'v' }); refs.incorrect = h('div', { class: 'v' }); refs.band = h('div', { class: 'v' }); refs.note = h('div', { class: 'small muted' }); refs.imp = h('div');
    return h('div', { class: `attempt-panel att-${a}`, role: 'tabpanel' },
      h('span', { class: 'attempt-label' }, `Attempt ${a}` + (a === 1 ? ' · first try' : a === 2 ? ' · required review' : ' · optional')),
      h('p', { class: 'small muted', style: { margin: '0 0 10px' } }, `Enter the total correct answers for each ${cfg.partWord.toLowerCase()} in this attempt, not just the new ones you found. Nothing is copied from earlier attempts.`),
      ...rows,
      h('div', { class: 'totals' }, h('div', { class: 'tile' }, refs.total, h('div', { class: 'l' }, 'Correct /40')), h('div', { class: 'tile' }, refs.incorrect, h('div', { class: 'l' }, 'Incorrect')), h('div', { class: 'tile' }, refs.band, h('div', { class: 'l' }, 'Estimated band'))),
      refs.note, refs.imp);
  }

  const mistakesHost = h('div');
  function renderMistakes() {
    clear(mistakesHost);
    const cats = activeCategories(kind);
    for (let p = 0; p < n; p++) {
      const m = rec.mistakes[p];
      const body = h('div', { style: { marginBottom: '16px' } }, h('h3', { style: { margin: '0 0 6px' } }, `${cfg.partWord} ${p + 1}`, rec.partTitles[p] ? h('span', { class: 'muted', style: { fontWeight: 600 } }, ` – ${rec.partTitles[p]}`) : null));
      if (editMistakes) {
        const shown = [...cats, ...settings.categories[kind].filter(c => c.archived && m.categories.includes(c.id))];
        mount(body, h('div', { class: 'pills' }, shown.map(c => h('button', { class: 'pill', 'aria-pressed': String(m.categories.includes(c.id)), onclick: () => {
          if (m.categories.includes(c.id)) { m.categories = m.categories.filter(x => x !== c.id); delete m.review[c.id]; } else { m.categories.push(c.id); m.review[c.id] = 'not_assessed'; }
          touch(); renderMistakes(); } }, c.label))),
        h('div', { style: { height: '8px' } }), h('input', { type: 'text', placeholder: 'Custom description (optional)', value: m.custom, 'aria-label': `Custom note for ${cfg.partWord} ${p + 1}`, oninput: e => { m.custom = e.target.value; touch(); } }));
      } else {
        mount(body, m.categories.length || m.custom ? null : h('p', { class: 'muted small' }, 'No difficulties recorded.'));
        if (m.custom) mount(body, h('p', { class: 'small' }, h('i', {}, m.custom)));
        m.categories.forEach(cid => {
          const cur = m.review[cid] || 'not_assessed';
          mount(body, h('div', {}, h('div', { style: { fontWeight: 700, fontSize: '14px' } }, categoryLabel(kind, cid)),
            h('div', { class: 'review', role: 'group', 'aria-label': `Review: ${categoryLabel(kind, cid)}` }, REVIEW_STATES.map(r => h('button', { 'data-s': r.id, 'aria-pressed': String(cur === r.id), onclick: () => review(p, cid, r.id) }, `${r.icon} ${r.label}`)))));
        });
      }
      mount(mistakesHost, body);
    }
  }

  function render() {
    clear(root);
    shell.setHeader({ title: rec.source || (persisted ? `Untitled ${cfg.label.toLowerCase()} test` : `New ${cfg.label} record`), back: true, actions: [statsButton(`/${kind}/stats`)] });
    refs = {}; refs.alert = h('div', { 'aria-live': 'assertive' });
    const s = recordSummary(rec);
    const dl = h('datalist', { id: 'src-list' }, sources.map(v => h('option', { value: v })));
    mount(root, 
      restored ? h('div', { class: 'alert info' }, 'Your unsaved changes were restored. Save or cancel when you are ready.') : null,
      h('div', { class: 'row', style: { marginBottom: '10px' } }, rec.status === 'draft' ? chip('Draft') : chip('Saved', 'ok'), rec.completed ? chip('Complete', 'ok') : chip(s.attempt2Done ? 'Attempt 2 done' : 'Attempt 2 still required', s.attempt2Done ? 'ok' : 'warn')),
      refs.alert,
      h('div', { class: 'card' },
        field('Date', h('input', { type: 'date', value: rec.date, disabled: !editing, oninput: e => { rec.date = e.target.value; touch(); } })),
        field('Source / test name', h('input', { type: 'text', value: rec.source, list: 'src-list', disabled: !editing, placeholder: 'e.g. Cambridge IELTS 18 — Test 2', oninput: e => { rec.source = e.target.value; touch(); } }), 'Any name you like: a book, mock test, teacher test or website.'), dl,
        field('Description (optional)', h('textarea', { rows: 2, disabled: !editing, value: rec.description, oninput: e => { rec.description = e.target.value; touch(); } })),
        h('details', {}, h('summary', {}, `${cfg.partWord} titles (optional)`), h('div', { style: { marginTop: '10px' } }, rec.partTitles.map((t, p) =>
          field(`${cfg.partWord} ${p + 1} title`, h('input', { type: 'text', value: t, disabled: !editing, oninput: e => { rec.partTitles[p] = e.target.value; touch(); } })))))),
      editing ? h('div', { class: 'row', style: { marginBottom: '12px' } }, h('button', { class: 'btn primary grow', onclick: save }, icon('check'), 'Save'),
        rec.status === 'draft' ? h('button', { class: 'btn', onclick: async () => { autosave.cancel(); await persist(); dirty = false; toast('Draft saved', 'ok'); } }, 'Save draft') : null,
        h('button', { class: 'btn ghost', onclick: cancel }, 'Cancel'))
        : h('div', { class: 'row', style: { marginBottom: '12px' } }, h('button', { class: 'btn primary grow', onclick: startEdit }, icon('edit'), 'Edit record')));
    const tabs = h('div', { class: 'attempts', role: 'tablist', 'aria-label': 'Attempts' });
    refs.tabs = [1, 2, 3].map(a => { const b = h('button', { role: 'tab', class: `att-${a}`, 'aria-selected': String(a === attempt), onclick: () => { attempt = a; render(); } }, `Attempt ${a}`, h('small')); tabs.append(b); return b; });
    mount(root, tabs, scorePanel());
    renderMistakes();
    mount(root, h('div', { class: 'card' }, h('div', { class: 'row spread' }, h('h2', { style: { margin: 0 } }, 'Difficulties found'),
      h('button', { class: 'btn small', onclick: async () => {
        if (editMistakes) { editMistakes = false; if (mistakesStartedEdit) { mistakesStartedEdit = false; if (!(await save())) { editMistakes = true; } else return; } render(); return; }
        editMistakes = true; if (!editing) { mistakesStartedEdit = true; startEdit(); } else render(); } }, editMistakes ? 'Done' : 'Edit mistakes')),
      h('p', { class: 'small muted' }, 'Pick the general weaknesses you noticed in Attempt 1. They stay here for Attempt 2 and 3. After reviewing, mark whether each one has improved (optional).'), mistakesHost));
    refs.steps = h('ul', { class: 'steps' });
    mount(root, h('div', { class: 'card' }, h('h2', {}, 'Progress'), refs.steps,
      h('div', { class: 'row', style: { marginTop: '10px' } }, rec.completed ? h('button', { class: 'btn', onclick: reopen }, 'Reopen record') : h('button', { class: 'btn accent', onclick: complete }, icon('check'), 'Mark as complete'),
        persisted || hasContent(rec) ? h('button', { class: 'btn ghost', onclick: remove }, icon('trash'), 'Delete') : null),
      h('p', { class: 'small muted' }, 'Bands are indicative conversions of your raw score and can vary slightly between test versions.')));
    refresh();
  }
  render();
  return () => { autosave.cancel(); if (editing && rec.status === 'draft' && hasContent(rec)) persist(); };
}

// ───────────────────────── statistics ─────────────────────────
export async function practiceStats({ root, params: [kind], shell }) {
  const cfg = SKILLS[kind];
  shell.setHeader({ title: `${cfg.label} statistics`, back: true });
  const recs = await db.records.all(kind);
  let range = 'all';
  const host = h('div');
  const draw = () => {
    clear(host);
    const all = practicePoints(recs), pts = inRange(all, range);
    const target = settings.targets[kind];
    const ag = practiceAggregates(recs), sm = summarise(all, target);
    mount(host, rangePicker(range, r => { range = r; draw(); }), h('div', { style: { height: '12px' } }));
    if (!recs.length) { mount(host, emptyState(kind === 'listening' ? 'headphones' : 'book', 'No statistics yet', `Record a ${cfg.label} practice test and your progress will appear here.`)); return; }
    mount(host, chartCard([
      { name: 'Final attempt', color: `var(--c-${kind})`, points: pts },
      { name: 'First attempt', color: 'var(--muted)', dashed: true, points: pts.map(p => ({ date: p.date, value: p.first })) }],
      target ? [{ value: target, color: 'var(--accent)', label: 'Target' }] : [], `${cfg.label} band over time`, 'No complete attempts in this period.'));
    mount(host, h('div', { class: 'card' }, h('div', { class: 'row spread' }, h('h3', { style: { margin: 0 } }, 'Progress'), trendChip(sm.trend)), h('div', { style: { height: '8px' } }),
      h('div', { class: 'grid-auto' }, tile('Latest band', fmtBand(sm.latest)), tile('Best band', fmtBand(sm.best)), tile('Target', target ? fmtBand(target) : '—'), tile('Records', String(ag.records))),
      h('div', { style: { marginTop: '10px' } }, targetLine(sm.target)), sm.trend.key === 'insufficient' ? h('p', { class: 'small muted' }, 'Record at least two scored tests to see a trend.') : null));
    mount(host, h('div', { class: 'card' }, h('h3', {}, 'Attempts'),
      h('div', { class: 'small' }, `Attempt 2 completed: ${ag.attempt2Done} of ${ag.records}`), bar(ag.records ? (ag.attempt2Done / ag.records) * 100 : 0, 'var(--a2)'),
      h('div', { class: 'small' }, `Attempt 3 completed: ${ag.attempt3Done} of ${ag.records}`), bar(ag.records ? (ag.attempt3Done / ag.records) * 100 : 0, 'var(--a3)'),
      h('div', { class: 'grid-auto' }, tile('Awaiting Attempt 2', String(ag.pendingAttempt2)), tile('Avg first total', ag.avgFirstTotal == null ? '—' : ag.avgFirstTotal.toFixed(1)),
        tile('Avg gain A1→A2', ag.avgImprovement12 == null ? '—' : fmtDelta(ag.avgImprovement12, 1)), tile('Avg gain A1→final', ag.avgImprovementFinal == null ? '—' : fmtDelta(ag.avgImprovementFinal, 1)))));
    const pa = partAverages(recs, cfg.parts);
    if (pa.some(v => v != null)) {
      const weakest = pa.map((v, i) => [v == null ? 2 : v / cfg.max[i], i]).sort((a, b) => a[0] - b[0])[0][1];
      mount(host, h('div', { class: 'card' }, h('h3', {}, `Average first-attempt score by ${cfg.partWord.toLowerCase()}`),
        pa.map((v, i) => h('div', {}, h('div', { class: 'row spread small' }, h('span', {}, `${cfg.partWord} ${i + 1}${i === weakest ? ' · weakest' : ''}`), h('b', {}, v == null ? '—' : `${v.toFixed(1)}/${cfg.max[i]}`)), bar(v == null ? 0 : (v / cfg.max[i]) * 100, i === weakest ? 'var(--a2)' : 'var(--c-' + kind + ')')))));
    }
    const freq = mistakeFrequency(recs).slice(0, 8);
    mount(host, h('div', { class: 'card' }, h('h3', {}, 'Most common difficulties'), freq.length ? freq.map(f => h('div', { style: { marginBottom: '8px' } }, h('div', { class: 'small' }, h('b', {}, categoryLabel(kind, f.id))),
      h('div', { class: 'small muted' }, `${f.count}× · ✓ ${f.improved} improved · ✗ ${f.notImproved} not improved · ○ ${f.notAssessed} not assessed`))) : h('p', { class: 'muted small' }, 'Select difficulties on your records to see which ones come up most often.')));
  };
  mount(root, host); draw();
}
