// Settings: appearance, targets, categories, exports, backup/restore, data management, about.
import { h, icon, chip, clear, field, toast, confirmDialog, alertDialog, promptTyped, modal, mount } from './dom.js';
import { go } from './nav.js';
import { settings, saveSetting, loadSettings } from './state.js';
import { pickFiles, deliverFile } from './files.js';
import { blobToDataUri, downscaleImage } from './imageutil.js';
import * as db from '../core/db.js';
import { getMediaAdapter, mediaBlob, removeMedia, verifyMedia } from '../core/media.js';
import { createBackup, validateBackup, restoreBackup, analyseConflicts, STRATEGIES, APP_VERSION } from '../core/backup.js';
import { buildWorkbook, workbookToBlob, xlsxFileName } from '../core/export-xlsx.js';
import { buildHtmlReport, htmlFileName } from '../core/export-html.js';
import { WRITING_SCORING } from '../core/scoring.js';
import { fmtBytes, fmtDate } from '../core/util.js';
import { seedCategories } from '../core/categories.js';

const TITLES = { appearance: 'Appearance', targets: 'Target bands', categories: 'Mistake categories', excel: 'Export to Excel', html: 'Export to HTML', backup: 'Backup & Restore', data: 'Data management', about: 'About & privacy' };
const progressUI = () => {
  const bar = h('i'), txt = h('div', { class: 'small muted', role: 'status', 'aria-live': 'polite' }), wrap = h('div', { style: { margin: '12px 0' } }, h('div', { class: 'progress' }, bar), txt);
  return { wrap, set: ({ stage, percent }) => { bar.style.width = Math.round(percent) + '%'; txt.textContent = `${stage}… ${Math.round(percent)}%`; } };
};
async function loadAll() {
  const d = {};
  for (const t of ['listening', 'reading', 'writing1', 'writing2', 'speaking']) d[t] = await db.records.all(t);
  d.media = await db.mediaMeta.all(); d.settings = await db.settingsStore.all();
  if (!d.settings.categories) d.settings.categories = settings.categories;
  return d;
}
const bandOptions = (from = 4) => Array.from({ length: (9 - from) * 2 + 1 }, (_, i) => from + i / 2);

export async function settingsView({ root, params: [page], shell }) {
  if (!page) return menu(root, shell);
  if (!TITLES[page]) throw new Error('Unknown settings page');
  shell.setHeader({ title: TITLES[page], back: true, settingsBtn: false });
  return ({ appearance, targets, categories, excel: excelPage, html: htmlPage, backup, data, about })[page](root, shell);
}

function menu(root, shell) {
  shell.setHeader({ title: 'Settings', back: true, settingsBtn: false });
  const item = (ic, page, title, sub) => h('a', { class: 'list-btn', href: '#/settings/' + page }, icon(ic, 24), h('div', { class: 'grow' }, h('b', {}, title), h('span', { class: 'small muted' }, sub)), icon('chevron', 18));
  mount(root, 
    h('h2', { class: 'section', style: { marginTop: 0 } }, 'Theme'),
    h('div', { class: 'seg', role: 'group', 'aria-label': 'Theme' }, [['light', 'Light'], ['dark', 'Dark'], ['system', 'System']].map(([id, l]) => h('button', { 'aria-pressed': String(settings.theme === id), onclick: async e => { await saveSetting('theme', id); e.target.parentElement.querySelectorAll('button').forEach(b => b.setAttribute('aria-pressed', String(b === e.target))); } }, l))),
    h('h2', { class: 'section' }, 'Goals'), item('target', 'targets', 'Target bands', 'Overall and per skill'), item('check', 'categories', 'Mistake categories', 'Add or hide suggestions'),
    h('h2', { class: 'section' }, 'Your data'), item('download', 'excel', 'Export to Excel', 'A formatted .xlsx workbook for reading and sharing'), item('download', 'html', 'Export to HTML', 'A report you can open in any browser, offline'),
    item('upload', 'backup', 'Backup & Restore', 'Complete ZIP for moving to a new phone'), item('gear', 'data', 'Data management', 'Storage, checks and deleting data'), item('info', 'about', 'About & privacy', `Version ${APP_VERSION}`));
}

function appearance(root) { return menu(root, { setHeader() {} }); }

function targets(root) {
  const t = { ...settings.targets };
  const sel = (key, lab) => field(lab, h('select', { onchange: async e => { if (e.target.value === '') delete t[key]; else t[key] = Number(e.target.value); await saveSetting('targets', { ...t }); toast('Target saved', 'ok'); } },
    h('option', { value: '' }, 'Not set'), ...bandOptions().map(v => h('option', { value: String(v), selected: t[key] === v }, v.toFixed(1)))));
  mount(root, h('div', { class: 'card' }, h('p', { class: 'muted' }, 'Targets are shown as dashed lines on charts and used to calculate how far you are from your goal. Half bands are supported (4.0 – 9.0).'),
    sel('overall', 'Target overall band'), sel('listening', 'Listening'), sel('reading', 'Reading'), sel('writing', 'Writing'), sel('speaking', 'Speaking')));
}

function categories(root) {
  const host = h('div');
  const draw = () => {
    clear(host);
    for (const kind of ['listening', 'reading']) {
      const input = h('input', { type: 'text', placeholder: 'New category…', 'aria-label': `New ${kind} category` });
      mount(host, h('div', { class: 'card' }, h('h2', {}, kind === 'listening' ? 'Listening' : 'Reading'),
        settings.categories[kind].map(c => h('div', { class: 'row spread', style: { flexWrap: 'nowrap', minHeight: '44px' } }, h('span', { style: { opacity: c.archived ? .5 : 1, textDecoration: c.archived ? 'line-through' : '' } }, c.label),
          h('button', { class: 'btn small ghost', onclick: async () => { c.archived = !c.archived; await saveSetting('categories', settings.categories); draw(); } }, c.archived ? 'Show' : 'Hide'))),
        h('div', { class: 'row', style: { marginTop: '10px' } }, h('div', { class: 'grow' }, input), h('button', { class: 'btn small primary', onclick: async () => {
          const label = input.value.trim(); if (!label) return;
          settings.categories[kind].push({ id: `${kind[0]}_c${Date.now().toString(36)}`, label, archived: false }); await saveSetting('categories', settings.categories); draw(); } }, 'Add'))));
    }
    mount(host, h('p', { class: 'small muted' }, 'Hidden categories disappear from the picker but stay visible on records that already use them. Nothing is deleted.'),
      h('button', { class: 'btn ghost', onclick: async () => { if (await confirmDialog({ title: 'Restore default list?', message: 'Custom categories are removed from the picker (records that use them keep their labels only if you add the same name again). Defaults are restored.', confirmText: 'Restore defaults' })) { const seed = seedCategories(); for (const k of ['listening', 'reading']) { const custom = settings.categories[k].filter(c => !seed[k].some(s => s.id === c.id)); seed[k].push(...custom.map(c => ({ ...c, archived: true }))); } await saveSetting('categories', seed); draw(); } } }, 'Restore default categories'));
  };
  mount(root, host); draw();
}

function exportPage(kind) {
  return root => {
    const isX = kind === 'excel';
    const opts = { images: true, audio: false };
    let busy = false;
    const prog = progressUI(); prog.wrap.hidden = true;
    const btn = h('button', { class: 'btn primary block', onclick: run }, icon('download'), isX ? 'Create Excel file' : 'Create HTML report');
    const box = (key, text) => h('label', { class: 'row', style: { minHeight: '44px' } }, h('input', { type: 'checkbox', checked: opts[key], onchange: e => { opts[key] = e.target.checked; } }), text);
    mount(root, h('div', { class: 'card' }, h('p', {}, isX ? 'Creates a real .xlsx workbook with one sheet per area (statistics, Listening, Reading, Writing Task 1 and 2, Speaking, mistakes, attachments, goals).' : 'Creates one self-contained .html report with dashboard, charts, essays, feedback and (optionally) images and audio. It opens in any browser without internet.'),
      box('images', isX ? 'Embed question images (downsized copies)' : 'Include question images (downsized copies)'), isX ? h('p', { class: 'small muted' }, 'Audio cannot be embedded in Excel; recordings are listed by file name and are included in the complete backup. Excel charts are not generated in this version.') : box('audio', 'Include audio recordings (can make the file large)'),
      h('p', { class: 'small muted' }, 'Exporting never changes your records. This is not a backup: use Backup & Restore to move to another phone.'), btn, prog.wrap));
    async function run() {
      if (busy) return; busy = true; btn.disabled = true; prog.wrap.hidden = false;
      try {
        prog.set({ stage: 'Reading records', percent: 5 });
        const data = await loadAll();
        let blob, name;
        if (isX) {
          prog.set({ stage: 'Building workbook', percent: 30 });
          const wb = await buildWorkbook(data, { imageProvider: opts.images ? async m => { const r = await downscaleImage(await mediaBlob(m), { max: 900, quality: .75 }); return r ? { buffer: await r.blob.arrayBuffer(), extension: 'jpeg', width: r.width, height: r.height } : null; } : undefined });
          prog.set({ stage: 'Writing file', percent: 80 }); blob = await workbookToBlob(wb); name = xlsxFileName();
        } else {
          let audioBytes = 0; const CAP = 60 * 1024 * 1024;
          prog.set({ stage: 'Building report', percent: 30 });
          const { html, notes } = await buildHtmlReport(data, { mediaProvider: async m => {
            if (m.kind === 'image' && opts.images) { const r = await downscaleImage(await mediaBlob(m), { max: 1000, quality: .75 }); return r ? blobToDataUri(r.blob) : null; }
            if (m.kind === 'audio' && opts.audio) { if (audioBytes + m.size > CAP) return null; audioBytes += m.size; return blobToDataUri(await mediaBlob(m)); }
            return null; } });
          blob = new Blob([html], { type: 'text/html' }); name = htmlFileName();
          if (notes.some(n => n.startsWith('Audio'))) toast('Some audio was left out to keep the file a sensible size. The complete backup contains all audio.');
        }
        prog.set({ stage: 'Done', percent: 100 });
        await deliverFile(blob, name, { dialogTitle: 'Save or share' }); toast(`${name} created (${fmtBytes(blob.size)})`, 'ok');
      } catch (e) { console.error(e); toast('Export failed: ' + e.message, 'error'); }
      finally { busy = false; btn.disabled = false; setTimeout(() => { prog.wrap.hidden = true; }, 1500); }
    }
  };
}

function backup(root) {
  const lastP = h('p', { class: 'small muted' }); db.settingsStore.get('lastBackupAt').then(v => { lastP.textContent = v ? `Last backup created: ${new Date(v).toLocaleString()}` : 'You have not created a backup yet.'; });
  const bprog = progressUI(); bprog.wrap.hidden = true;
  const bbtn = h('button', { class: 'btn primary block', onclick: makeBackup }, icon('download'), 'Create complete backup');
  async function makeBackup() {
    bbtn.disabled = true; bprog.wrap.hidden = false;
    try {
      const { blob, filename } = await createBackup({ onProgress: bprog.set });
      await deliverFile(blob, filename, { dialogTitle: 'Save your backup somewhere safe' });
      toast(`Backup created (${fmtBytes(blob.size)}). Keep it somewhere safe, e.g. Google Drive.`, 'ok');
      lastP.textContent = `Last backup created: ${new Date().toLocaleString()}`;
    } catch (e) { console.error(e); toast(e.message, 'error'); }
    finally { bbtn.disabled = false; setTimeout(() => { bprog.wrap.hidden = true; }, 1500); }
  }
  const restoreHost = h('div');
  const rbtn = h('button', { class: 'btn block', onclick: chooseRestore }, icon('upload'), 'Restore from backup…');
  async function chooseRestore() {
    const [file] = await pickFiles('.zip,application/zip,application/x-zip-compressed');
    if (!file) return;
    mount(clear(restoreHost), h('div', { class: 'card' }, h('p', {}, 'Checking the backup…')));
    let rep;
    try { rep = await validateBackup(file); } catch (e) { rep = { ok: false, errors: [e.message], warnings: [] }; }
    if (!rep.ok) { mount(clear(restoreHost), h('div', { class: 'alert bad', role: 'alert' }, h('b', {}, 'This backup cannot be restored.'), h('ul', {}, rep.errors.map(e => h('li', {}, e))), h('p', { class: 'small' }, 'Nothing on this phone was changed.'))); return; }
    const c = await analyseConflicts(rep), s = rep.summary;
    let strategy = c.existingTotal ? 'merge-keep' : 'replace';
    const rprog = progressUI(); rprog.wrap.hidden = true;
    const stratBox = h('div');
    const drawStrat = () => { mount(clear(stratBox), ...STRATEGIES.map(st => h('label', { class: 'row', style: { alignItems: 'flex-start', minHeight: '48px', marginBottom: '6px' } }, h('input', { type: 'radio', name: 'strat', checked: strategy === st.id, onchange: () => { strategy = st.id; } }), h('span', {}, st.label)))); };
    drawStrat();
    const go1 = h('button', { class: 'btn primary block', onclick: async () => {
      if (strategy === 'replace' && c.existingTotal && !(await confirmDialog({ title: 'Replace all current data?', message: `All ${c.existingTotal} records currently on this phone and their recordings and images will be deleted and replaced by the backup. Create a backup of the current data first if you might need it.`, confirmText: 'Replace everything', danger: true }))) return;
      go1.disabled = true; rprog.wrap.hidden = false;
      try {
        const r = await restoreBackup(rep, { strategy, onProgress: rprog.set }); await loadSettings();
        mount(clear(restoreHost), h('div', { class: 'alert info', role: 'status' }, h('b', {}, 'Restore complete.'), h('p', {}, `${r.added} added, ${r.updated} updated, ${r.skipped} kept as they were. ${r.mediaRestored} attachment(s) restored.`),
          r.warnings.length ? h('ul', {}, r.warnings.slice(0, 8).map(w => h('li', {}, w))) : null));
        toast('Backup restored', 'ok');
      } catch (e) { console.error(e); go1.disabled = false; rprog.wrap.hidden = true; toast(e.message, 'error'); }
    } }, 'Restore now');
    mount(clear(restoreHost), h('div', { class: 'card' }, h('h3', {}, 'This backup contains'),
      h('p', { class: 'small' }, `Created ${new Date(s.createdAt).toLocaleString()} · app ${s.appVersion}`),
      h('div', { class: 'row' }, chip(`${s.listening} Listening`), chip(`${s.reading} Reading`), chip(`${s.writing1} Writing T1`), chip(`${s.writing2} Writing T2`), chip(`${s.speaking} Speaking`), chip(`${s.audio} audio`), chip(`${s.images} images`), chip(fmtBytes(s.mediaBytes))),
      c.existingTotal ? h('p', { class: 'small' }, `This phone already has ${c.existingTotal} record(s). ${c.same} of the backup’s records exist here already (${c.backupNewer} newer in the backup, ${c.backupOlder} older); ${c.fresh} are new.`) : h('p', { class: 'small' }, 'This phone has no records yet.'),
      rep.warnings.length ? h('div', { class: 'alert warn' }, h('b', {}, `${rep.warnings.length} warning(s)`), h('ul', {}, rep.warnings.slice(0, 6).map(w => h('li', {}, w)), rep.warnings.length > 6 ? h('li', {}, `…and ${rep.warnings.length - 6} more`) : null)) : null,
      h('h3', {}, 'How should it be restored?'), stratBox, go1, rprog.wrap));
  }
  mount(root, h('div', { class: 'card' }, h('h2', {}, 'Complete backup'), h('p', {}, 'Saves all records, essays, feedback, scores, images and recordings in one ZIP file. Use it to protect your work or move to a new phone.'), lastP, bbtn, bprog.wrap),
    h('div', { class: 'card' }, h('h2', {}, 'Restore'), h('p', {}, 'Choose a backup ZIP. It is checked completely before anything on this phone is changed.'), rbtn, restoreHost),
    h('p', { class: 'small muted' }, 'Excel and HTML exports are for reading and sharing; only the complete backup can be restored.'));
}

function data(root) {
  const info = h('div', { class: 'card' }, h('p', { class: 'muted' }, 'Loading…'));
  (async () => {
    const [c, v] = await Promise.all([db.counts(), verifyMedia()]);
    let est = null; try { est = await navigator.storage?.estimate?.(); } catch { /* unsupported */ }
    const persisted = await navigator.storage?.persisted?.().catch(() => null);
    mount(clear(info), h('h2', {}, 'Stored on this phone'), h('div', { class: 'grid-auto' }, ...[['Listening', c.listening], ['Reading', c.reading], ['Writing T1', c.writing1], ['Writing T2', c.writing2], ['Speaking', c.speaking]].map(([l, n]) => h('div', { class: 'tile' }, h('div', { class: 'v' }, String(n)), h('div', { class: 'l' }, l)))),
      h('p', { class: 'small' }, `${v.total} attachment(s) · ${fmtBytes(v.bytes)}`, est?.usage != null ? ` · app storage in use ${fmtBytes(est.usage)}` : ''), persisted === false ? h('p', { class: 'small muted' }, 'Tip: create a backup regularly. Android can clear app data if the phone is critically low on space.') : null,
      v.missing.length ? h('div', { class: 'alert warn' }, `${v.missing.length} attachment file(s) are missing from storage: ${v.missing.slice(0, 3).map(m => m.name).join(', ')}${v.missing.length > 3 ? '…' : ''}`, h('div', { style: { marginTop: '8px' } }, h('button', { class: 'btn small', onclick: async () => { for (const m of v.missing) await removeMedia(m.id); toast('Broken references removed', 'ok'); go('/settings'); setTimeout(() => go('/settings/data'), 50); } }, 'Remove broken references'))) : h('p', { class: 'small', style: { color: 'var(--good)' } }, '✓ All attachments are present.'));
  })();
  mount(root, info, h('div', { class: 'card' }, h('h2', {}, 'Delete all data'), h('p', {}, 'Permanently deletes every record, recording, image and setting from this phone. A backup is not deleted. Make a backup first if you may need your data again.'),
    h('button', { class: 'btn danger block', onclick: async () => {
      if (!(await promptTyped({ title: 'Delete all data?', message: 'This cannot be undone.', word: 'DELETE' }))) return;
      try { for (const m of await db.mediaMeta.all()) await getMediaAdapter().remove(m.path); await db.clearAllData(); await loadSettings(); toast('All data deleted'); go('/listening'); } catch (e) { toast('Could not delete everything: ' + e.message, 'error'); }
    } }, icon('trash'), 'Delete all data…')));
}

function about(root) {
  mount(root, h('div', { class: 'card' }, h('h2', {}, 'IELTS Tracker'), h('p', {}, `Version ${APP_VERSION}`), h('p', { class: 'small muted' }, 'An offline IELTS Academic practice and progress tracker.')),
    h('div', { class: 'card' }, h('h2', {}, 'Privacy'), h('ul', {}, h('li', {}, 'Everything stays on this phone. There is no account, no analytics and no upload of essays, recordings or photos.'),
      h('li', {}, 'Records are kept in the app’s private storage; recordings and images are copied into the app’s private files. Other apps cannot read them.'), h('li', {}, 'The microphone is requested only when you tap Record; the camera only when you choose Camera.'),
      h('li', {}, 'To take your data out: use Export or Complete backup. To delete it: Settings › Data management › Delete all data (or uninstall the app).'))),
    h('div', { class: 'card' }, h('h2', {}, 'How scores are calculated'), h('ul', {}, h('li', {}, 'Listening and Academic Reading bands are indicative conversions of your raw score out of 40 and can vary slightly between test versions.'),
      h('li', {}, 'Overall band: the mean of the four skill bands, rounded to the nearest half band (.25 up to the next half, .75 up to the next whole).'), h('li', {}, `Writing: ${WRITING_SCORING.label}. ${WRITING_SCORING.explanation}`))));
}
const [appearancePage, excelPage, htmlPage] = [appearance, exportPage('excel'), exportPage('html')];
