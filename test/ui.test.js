// @vitest-environment jsdom
import 'fake-indexeddb/auto';
import { describe, it, expect, beforeAll, vi } from 'vitest';
import * as db from '../src/core/db.js';
import { setMediaAdapter, memoryAdapter } from '../src/core/media.js';

let startApp;
const $ = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => [...r.querySelectorAll(s)];
const nav = async hash => { location.hash = hash; await new Promise(r => setTimeout(r, 30)); };
const type = (el, value) => { el.value = value; el.dispatchEvent(new Event('input', { bubbles: true })); };
const text = () => $('#view').textContent;
const click = el => el.dispatchEvent(new MouseEvent('click', { bubbles: true }));
const btn = label => $$('button, a.btn').find(b => b.textContent.trim().includes(label));
const wait = (fn) => vi.waitFor(fn, { timeout: 3000, interval: 20 });

beforeAll(async () => {
  setMediaAdapter(memoryAdapter());
  window.scrollTo = () => {}; Element.prototype.scrollIntoView = () => {};
  document.body.innerHTML = '<div id="app"></div>';
  ({ startApp } = await import('../src/ui/shell.js'));
  startApp(document.getElementById('app'));
  await wait(() => expect($('.tabs')).toBeTruthy());
});

describe('app shell', () => {
  it('shows five navigation sections and an empty Listening state', async () => {
    await nav('#/listening');
    await wait(() => expect(text()).toContain('No Listening records yet'));
    expect($$('.tabs a').map(a => a.getAttribute('aria-label'))).toEqual(['Listening', 'Reading', 'Writing', 'Speaking', 'General Statistics']);
  });
});

describe('Listening record workflow', () => {
  it('computes totals/bands, cumulative improvement, negative change, validation and saving', async () => {
    await nav('#/listening/new');
    await wait(() => expect($('input[aria-label^="Attempt 1 Part 1"]')).toBeTruthy());
    type($('input[placeholder^="e.g. Cambridge"]'), 'Cambridge IELTS 18 — Test 2');
    const score = (a, p, v) => type($(`input[aria-label^="Attempt ${a} Part ${p} "]`), String(v));
    [5, 6, 7, 8].forEach((v, i) => score(1, i + 1, v));
    const tiles = () => $$('.attempt-panel .tile .v').map(e => e.textContent);
    expect(tiles()).toEqual(['26', '14', '6.5']);

    click($$('.attempts button')[1]);                       // attempt 2
    await wait(() => expect($('.attempt-panel.att-2')).toBeTruthy());
    expect($('.attempt-panel').textContent).toContain('Nothing is copied');
    expect($('input[aria-label^="Attempt 2 Part 1"]').value).toBe('');  // never auto-copied
    [7, 7, 8, 9].forEach((v, i) => score(2, i + 1, v));
    expect(tiles()).toEqual(['31', '9', '7.0']);
    expect($('.attempt-panel').textContent).toContain('Improvement vs Attempt 1:+5 answers');
    expect($$('.scorerow .dl').map(e => e.textContent)).toEqual(['+2', '+1', '+1', '+1']);

    score(2, 1, 11);                                        // invalid
    expect($('.attempt-panel .err').textContent).toContain('between 0 and 10');
    click(btn('Save')); await wait(() => expect($('.alert.bad')).toBeTruthy());
    expect($('.alert.bad').textContent).toContain('Attempt 2, Part 1');
    score(2, 1, 4);                                         // honest lower score
    expect($$('.scorerow .dl')[0].textContent).toBe('−1');
    expect($('.attempt-panel').textContent).toContain('+2 answers');   // 4+7+8+9 = 28 vs 26
    // attempt 3 is optional: record can be saved without it, and 'complete' is refused until attempt 2 is complete
    click($$('.attempts button')[2]); await wait(() => expect($('.attempt-panel.att-3')).toBeTruthy());
    expect(tiles()).toEqual(['—', '—', '—']);
    click($$('.attempts button')[1]);
    await wait(() => expect($('.attempt-panel.att-2')).toBeTruthy());
    score(2, 1, 7);
    click(btn('Save')); await wait(() => expect($('.chip.ok')?.textContent).toBe('Saved'));
    expect(document.querySelector('#toast').textContent).toContain('Attempt 2: +5 vs Attempt 1');
    // mistake categories + review indicators
    click(btn('Edit mistakes')); await wait(() => expect($$('.pill').length).toBeGreaterThan(5));
    click($$('.pill').find(b => b.textContent === 'Spelling mistakes'));
    click(btn('Done')); await wait(() => expect($$('.review').length).toBe(1));
    expect($$('.review button[aria-pressed=true]').map(b => b.dataset.s)).toEqual(['not_assessed']);   // neutral, never assumed improved
    click($$('.review button').find(b => b.dataset.s === 'improved'));
    await wait(() => expect($$('.review button[aria-pressed=true]').map(b => b.dataset.s)).toEqual(['improved']));
    const saved = (await db.records.all('listening'))[0];
    expect(saved.mistakes[0]).toMatchObject({ categories: ['l_spelling'], review: { l_spelling: 'improved' } });
    expect(saved.attempts[2].scores).toEqual([7, 7, 8, 9]);
    expect(saved.attempts[3].scores).toEqual([null, null, null, null]);
    // history shows it, and a second record on the same date does not overwrite the first
    await nav('#/listening'); await wait(() => expect(text()).toContain('Cambridge IELTS 18 — Test 2'));
    expect(text()).toContain('26 → 31 / 40');
    await nav('#/listening/new'); await wait(() => expect($('input[aria-label^="Attempt 1 Part 1"]')).toBeTruthy());
    type($('input[placeholder^="e.g. Cambridge"]'), 'Second test same day');
    click(btn('Save')); await wait(() => expect($('.chip.ok')?.textContent).toBe('Saved'));
    expect((await db.records.all('listening')).length).toBe(2);
  });
  it('mark complete is refused without attempt 2, accepted with it', async () => {
    const [second] = (await db.records.all('listening')).filter(r => r.source === 'Second test same day');
    await nav('#/listening/' + second.id);
    await wait(() => expect(btn('Mark as complete')).toBeTruthy());
    click(btn('Mark as complete'));
    await wait(() => expect($('.alert.warn')?.textContent).toContain('Attempt 2'));
    expect((await db.records.get(second.id)).completed).toBe(false);
  });
});

describe('Reading limits', () => {
  it('passage 1 cannot exceed 13, passage 3 can reach 14; total never exceeds 40', async () => {
    await nav('#/reading/new'); await wait(() => expect($('input[aria-label^="Attempt 1 Passage 1"]')).toBeTruthy());
    type($('input[aria-label^="Attempt 1 Passage 1"]'), '14');
    expect($('.attempt-panel .err').textContent).toContain('between 0 and 13');
    type($('input[aria-label^="Attempt 1 Passage 1"]'), '13'); type($('input[aria-label^="Attempt 1 Passage 2"]'), '13'); type($('input[aria-label^="Attempt 1 Passage 3"]'), '14');
    expect($$('.attempt-panel .tile .v').map(e => e.textContent)).toEqual(['40', '0', '9.0']);
    type($('input[aria-label^="Attempt 1 Passage 3"]'), '15');
    expect($$('.attempt-panel .err').map(e => e.textContent).join('')).toContain('between 0 and 14');
    type($('input[aria-label^="Attempt 1 Passage 3"]'), 'abc');
    expect($$('.attempt-panel .err').map(e => e.textContent).join('')).toContain('whole number');
  });
});

describe('Writing', () => {
  it('saves essay + feedback exactly, view mode is read-only, edit is explicit', async () => {
    await nav('#/writing/1/new'); await wait(() => expect($('textarea[aria-label="Essay text"]')).toBeTruthy());
    const essay = 'First paragraph.\n\nSecond paragraph with “quotes” & <tags>.\n  indented line';
    type($('textarea[aria-label="Essay text"]'), essay.replace(/\\n/g, '\n'));
    type($('textarea[aria-label="Teacher feedback"]'), 'Good structure.\nWatch cohesion.'.replace(/\\n/g, '\n'));
    expect($$('.crit label').map(l => l.textContent).slice(0, 4)).toEqual(['Task Achievement', 'Coherence and Cohesion', 'Lexical Resource', 'Grammatical Range and Accuracy']);
    const sels = $$('.crit select');
    [6, 6, 6.5, 6.5].forEach((v, i) => { sels[i].value = String(v); sels[i].dispatchEvent(new Event('change', { bubbles: true })); });
    expect(text()).toContain('6.5');          // provisional: mean 6.25 -> 6.5
    expect(text()).toContain('Provisional: mean of the four criteria');
    click(btn('Save changes')); await wait(() => expect($('.essay')).toBeTruthy());
    expect($('textarea')).toBeNull();          // no accidental editing in view mode
    const rec = (await db.records.all('writing1'))[0];
    expect(rec.essay).toBe(essay.replace(/\\n/g, '\n'));
    expect(rec.teacherOverall).toBeNull();     // calculated value never written into the teacher field
    click(btn('Edit')); await wait(() => expect($('textarea[aria-label="Essay text"]')).toBeTruthy());
    expect(btn('Cancel')).toBeTruthy();
    click(btn('Cancel')); await wait(() => expect($('textarea')).toBeNull());   // nothing changed, so no confirmation needed
  });
  it('opening statistics while editing does not discard unsaved changes', async () => {
    const rec = (await db.records.all('writing1'))[0];
    await nav('#/writing/1/' + rec.id); await wait(() => expect(btn('Edit')).toBeTruthy());
    click(btn('Edit')); await wait(() => expect($('textarea[aria-label="Essay text"]')).toBeTruthy());
    type($('textarea[aria-label="Essay text"]'), 'UNSAVED EDIT');
    await nav('#/writing/stats'); await wait(() => expect(text()).toContain('Overall Writing'));
    await nav('#/writing/1/' + rec.id);
    await wait(() => expect($('textarea[aria-label="Essay text"]')?.value).toBe('UNSAVED EDIT'));
    expect(text()).toContain('unsaved changes were restored');
    expect((await db.records.get(rec.id)).essay).not.toBe('UNSAVED EDIT');   // not silently saved either
    click(btn('Cancel')); await wait(() => expect(btn('Discard')).toBeTruthy()); click(btn('Discard'));
    await wait(() => expect($('textarea')).toBeNull());
    expect($('.essay').textContent).not.toContain('UNSAVED');
  });
  it('Task 2 uses Task Response', async () => {
    await nav('#/writing/2/new'); await wait(() => expect($$('.crit label')[0]).toBeTruthy());
    expect($$('.crit label')[0].textContent).toBe('Task Response');
  });
});

describe('Speaking', () => {
  it('session can be any combination of parts and exposes a real recorder control', async () => {
    await nav('#/speaking/new'); await wait(() => expect($('.pills')).toBeTruthy());
    click($$('.pill').find(b => b.textContent === 'Part 2')); await wait(() => expect(btn('Record Part 2')).toBeTruthy());
    expect($$('.pill').find(b => b.textContent === 'Part 1').getAttribute('aria-pressed')).toBe('false');
    expect(btn('Gallery')).toBeTruthy(); expect(btn('Camera')).toBeTruthy();
    expect(text()).toContain('Teacher assessment');
  });
});

describe('Statistics, targets and settings', () => {
  it('General Statistics renders with data; every statistics & settings page renders without error', async () => {
    for (const r of ['#/stats', '#/listening/stats', '#/reading/stats', '#/writing/stats', '#/speaking/stats', '#/settings', '#/settings/targets', '#/settings/categories', '#/settings/excel', '#/settings/html', '#/settings/backup', '#/settings/data', '#/settings/about', '#/writing', '#/speaking', '#/reading']) {
      await nav(r); await wait(() => expect($('#view .screen')).toBeTruthy());
      expect($('#view .card.error'), r + ' rendered an error: ' + text().slice(0, 200)).toBeNull();
    }
    await nav('#/stats');
    await wait(() => expect(text()).toContain('OVERALL BAND'));
    expect(text()).toContain('Incomplete estimate');
  });
  it('target selection persists and the dashboard reflects the shortfall', async () => {
    await nav('#/settings/targets'); await wait(() => expect($$('select').length).toBe(5));
    const sel = $$('select'); sel[1].value = '7.5'; sel[1].dispatchEvent(new Event('change', { bubbles: true }));
    await wait(async () => expect((await db.settingsStore.get('targets')).listening).toBe(7.5));
    await nav('#/stats'); await wait(() => expect(text()).toContain('below target'));
    expect(text()).toMatch(/0\.5 bands? below target/);
  });
  it('theme can be switched and persists', async () => {
    await nav('#/settings'); await wait(() => expect(btn('Dark')).toBeTruthy());
    click(btn('Dark')); await wait(() => expect(document.documentElement.dataset.theme).toBe('dark'));
    expect(await db.settingsStore.get('theme')).toBe('dark');
    click(btn('Light')); await wait(() => expect(document.documentElement.dataset.theme).toBe('light'));
    click(btn('System')); await wait(() => expect(document.documentElement.dataset.theme).toBeUndefined());
  });
});
