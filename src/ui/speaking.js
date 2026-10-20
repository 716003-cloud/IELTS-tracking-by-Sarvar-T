// Speaking: sessions list, session editor (images, real audio recording, assessment), statistics.
import { h, icon, chip, clear, field, toast, confirmDialog, alertDialog, modal, bandSelect, mount } from './dom.js';
import { go, goBack, replacePath } from './nav.js';
import { working, rangePicker, tile, emptyState, statsButton, chartCard, trendChip, targetLine } from './common.js';
import { settings } from './state.js';
import { pickFiles, deliverFile } from './files.js';
import * as db from '../core/db.js';
import { addMedia, removeMedia, removeSessionMedia, mediaUrl, mediaBlob } from '../core/media.js';
import { newSpeaking, validateSpeaking, assessmentStatus, SPEAKING_CRITERIA } from '../core/model.js';
import { calcSpeakingBand, speakingScore } from '../core/scoring.js';
import { speakingPoints, inRange, summarise } from '../core/stats.js';
import { fmtBand } from '../core/bands.js';
import { fmtDate, fmtDuration, fmtBytes, nowISO, debounce, clone } from '../core/util.js';

const byNewest = (a, b) => (a.date + a.createdAt < b.date + b.createdAt ? 1 : -1);
const hasContent = r => r.title || r.topic || r.parts.length || r.feedback || r.notes || r.overall != null || Object.values(r.criteria).some(v => v != null);

export async function speakingList({ root, shell }) {
  shell.setHeader({ title: 'Speaking', actions: [statsButton('/speaking/stats')] });
  const [recs, media] = await Promise.all([db.records.all('speaking'), db.mediaMeta.all()]);
  recs.sort(byNewest);
  let q = ''; const list = h('div');
  const draw = () => {
    clear(list);
    const ql = q.trim().toLowerCase();
    const shown = recs.filter(r => !ql || [r.title, r.topic, r.date, fmtDate(r.date)].join(' ').toLowerCase().includes(ql));
    if (!recs.length) { mount(list, emptyState('mic', 'No speaking sessions yet', 'Create a session to attach question images, record your answers and note your teacher’s scores.')); return; }
    if (!shown.length) { mount(list, emptyState('search', 'Nothing matches', 'Try a different search.')); return; }
    shown.forEach(r => {
      const mine = media.filter(m => m.sessionId === r.id), sc = speakingScore(r), st = assessmentStatus(r, 'speaking');
      mount(list, h('a', { class: 'rec', href: `#/speaking/${r.id}` }, h('div', { class: 'card' }, h('div', { class: 'row spread', style: { flexWrap: 'nowrap' } },
        h('div', { class: 'grow' }, h('div', { class: 't' }, r.title || 'Untitled session'), h('div', { class: 'meta' }, `${fmtDate(r.date)} · ${mine.filter(m => m.kind === 'audio').length} recording(s) · ${mine.filter(m => m.kind === 'image').length} image(s)`),
          h('div', {}, r.status === 'draft' ? chip('Draft') : null, r.parts.map(p => chip('Part ' + p, 'info')), chip(st.label, st.key === 'assessed' ? 'ok' : st.key === 'partial' ? 'warn' : ''))),
        h('div', { class: 'bandbox' }, sc ? fmtBand(sc.value) : '—')))));
    });
  };
  mount(root, h('button', { class: 'btn block', style: { marginBottom: '12px' }, onclick: () => go('/speaking/stats') }, icon('chart'), 'Speaking statistics'),
    h('div', { class: 'search' }, icon('search', 20), h('input', { type: 'search', placeholder: 'Search title, topic or date', 'aria-label': 'Search sessions', oninput: e => { q = e.target.value; draw(); } })), h('div', { style: { height: '12px' } }), list,
    h('a', { class: 'fab', href: '#/speaking/new', 'aria-label': 'New speaking session' }, icon('plus'), 'New session'));
  draw();
}

// ───────────── recorder ─────────────
const pickMime = () => ['audio/webm;codecs=opus', 'audio/webm', 'audio/mp4', 'audio/ogg;codecs=opus'].find(m => globalThis.MediaRecorder?.isTypeSupported?.(m)) || '';

/** Streams WebM from MediaRecorder lack a duration; this nudges the browser to compute it so the seek bar works. */
function fixDuration(audio) {
  audio.addEventListener('loadedmetadata', () => {
    if (audio.duration === Infinity) { audio.currentTime = 1e101; audio.addEventListener('timeupdate', function f() { audio.removeEventListener('timeupdate', f); audio.currentTime = 0; }); }
  }, { once: true });
}

function recorderControl({ ensureSession, onSaved, part }) {
  const host = h('div');
  let rec = null, stream = null, chunks = [], t0 = 0, timer = null, wake = null, discard = false, mime = '';
  const stopTracks = () => { stream?.getTracks().forEach(t => t.stop()); stream = null; clearInterval(timer); wake?.release?.().catch(() => {}); wake = null; };
  const idle = () => { mount(clear(host), h('button', { class: 'btn accent small', onclick: start }, icon('rec', 20), `Record Part ${part}`)); };

  async function explainAndStart() {
    const seen = await db.settingsStore.get('micExplained', false);
    if (!seen) {
      const ok = await confirmDialog({ title: 'Microphone access', message: 'The app needs the microphone to record your speaking answers. Recordings stay on this phone, inside the app, and are never uploaded. Android will now ask for permission.', confirmText: 'Continue', cancelText: 'Not now' });
      if (!ok) return false;
      await db.settingsStore.set('micExplained', true);
    }
    return true;
  }
  async function start() {
    if (!navigator.mediaDevices?.getUserMedia || !globalThis.MediaRecorder) { await alertDialog('Recording not supported', 'This device or browser cannot record audio inside the app.'); return; }
    if (!(await explainAndStart())) return;
    try { stream = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: false, noiseSuppression: false, autoGainControl: true } }); }
    catch (e) {
      const denied = e.name === 'NotAllowedError' || e.name === 'SecurityError';
      await alertDialog(denied ? 'Microphone permission denied' : 'No microphone available', denied
        ? 'Recording needs microphone permission. Open Android Settings › Apps › IELTS Tracker › Permissions › Microphone, allow it, then try again. Your other records are not affected.'
        : 'No usable microphone was found on this device.');
      return;
    }
    try { await ensureSession(); } catch (e) { stopTracks(); toast('Could not save the session first: ' + e.message, 'error'); return; }
    mime = pickMime(); chunks = []; discard = false;
    try { rec = new MediaRecorder(stream, { ...(mime ? { mimeType: mime } : {}), audioBitsPerSecond: 96000 }); }
    catch { rec = new MediaRecorder(stream); }
    rec.ondataavailable = e => { if (e.data?.size) chunks.push(e.data); };
    rec.onerror = () => toast('Recording error – stopping.', 'error');
    rec.onstop = () => finish();
    rec.start(1000); t0 = Date.now();
    try { wake = await navigator.wakeLock?.request('screen'); } catch { wake = null; }
    const clock = h('span', { class: 'timer', 'aria-live': 'off' }, '0:00');
    timer = setInterval(() => { clock.textContent = fmtDuration((Date.now() - t0) / 1000); }, 250);
    mount(clear(host), h('div', { class: 'recbar', role: 'status', 'aria-label': 'Recording in progress' }, h('span', { class: 'recdot' }), clock, h('span', { class: 'grow muted small' }, `Recording Part ${part}…`),
      h('button', { class: 'btn danger small', onclick: () => rec.state !== 'inactive' && rec.stop() }, icon('stop', 20), 'Stop'),
      h('button', { class: 'btn ghost small', onclick: async () => { if (await confirmDialog({ title: 'Cancel recording?', message: 'The recording will be thrown away.', confirmText: 'Discard', danger: true })) { discard = true; if (rec.state !== 'inactive') rec.stop(); } } }, 'Cancel')));
  }
  async function finish() {
    const dur = (Date.now() - t0) / 1000;
    stopTracks();
    if (discard || !chunks.length) { idle(); if (!discard) toast('Nothing was recorded.', 'error'); return; }
    const blob = new Blob(chunks, { type: rec.mimeType || mime || 'audio/webm' });
    const url = URL.createObjectURL(blob);
    const audio = h('audio', { controls: true, src: url, preload: 'metadata' }); fixDuration(audio);
    mount(clear(host), h('div', { class: 'recording' }, h('b', {}, `New recording · ${fmtDuration(dur)} · ${fmtBytes(blob.size)}`), audio,
      h('div', { class: 'row', style: { marginTop: '8px' } },
        h('button', { class: 'btn primary small', onclick: async (e) => { e.target.disabled = true; try { await onSaved(blob, dur); URL.revokeObjectURL(url); idle(); toast('Recording saved', 'ok'); } catch (err) { e.target.disabled = false; toast('Could not save recording: ' + err.message, 'error'); } } }, icon('check', 20), 'Save recording'),
        h('button', { class: 'btn ghost small', onclick: async () => { if (await confirmDialog({ title: 'Discard recording?', message: 'This recording has not been saved yet.', confirmText: 'Discard', danger: true })) { URL.revokeObjectURL(url); idle(); } } }, 'Discard'))));
  }
  idle();
  host.leave = async () => { // leaving the screen mid-recording: keep what was recorded rather than lose it
    if (rec && rec.state === 'recording') { const p = new Promise(r => { const prev = rec.onstop; rec.onstop = async () => { const dur = (Date.now() - t0) / 1000; stopTracks(); if (chunks.length && !discard) { try { await onSaved(new Blob(chunks, { type: rec.mimeType || mime || 'audio/webm' }), dur); } catch { /* nothing more we can do */ } } r(); }; }); rec.stop(); await p; }
    else stopTracks();
  };
  return host;
}

// ───────────── editor ─────────────
export async function speakingEditor({ root, params: [id], shell }) {
  let rec, restored = false, persisted = true, dirty = false;
  if (id === 'new') { rec = newSpeaking(); persisted = false; }
  else if (working.has(id)) { rec = working.get(id); restored = true; }
  else { rec = await db.records.get(id); if (!rec || rec.type !== 'speaking') throw new Error('Session not found. It may have been deleted.'); }
  let editing = id === 'new' || restored || rec.status === 'draft';
  if (restored) dirty = true;   // restored unsaved edits must be confirmed before they can be discarded
  let media = persisted ? await db.mediaMeta.bySession(rec.id) : [];
  const refs = {}, leaves = [];
  async function persist() { rec.updatedAt = nowISO(); await db.records.put(rec); if (!persisted) { persisted = true; replacePath(`/speaking/${rec.id}`); } }
  const autosave = debounce(async () => { if (editing && rec.status === 'draft' && hasContent(rec)) await persist(); }, 700);
  const touch = () => { dirty = true; autosave(); };
  /** Media needs the session row to exist. For a brand-new session that means saving it as a draft first (also for saved ones being edited we only need the row to exist). */
  const ensureSession = async () => { if (!persisted) { autosave.cancel(); await persist(); } };
  const reloadMedia = async () => { media = await db.mediaMeta.bySession(rec.id); };

  async function save() {
    const errs = validateSpeaking(rec);
    if (errs.length) { refs.alert.replaceChildren(h('div', { class: 'alert bad', role: 'alert' }, errs.join(' '))); return; }
    autosave.cancel(); rec.status = 'saved'; await persist(); working.delete(rec.id); editing = false; dirty = false; toast('Session saved', 'ok'); render();
  }
  async function cancel() {
    if (rec.status === 'saved') {
      if (dirty && !(await confirmDialog({ title: 'Discard changes?', message: 'Your edits to this session will be lost. Recordings and images you already added stay.', confirmText: 'Discard', danger: true }))) return;
      working.delete(rec.id); rec = await db.records.get(rec.id); editing = false; dirty = false; render();
    } else {
      if ((hasContent(rec) || media.length) && !(await confirmDialog({ title: 'Discard this draft?', message: 'The draft session and any recordings or images attached to it will be deleted.', confirmText: 'Discard draft', danger: true }))) return;
      autosave.cancel(); if (persisted) { await removeSessionMedia(rec.id); await db.records.del(rec.id); } editing = false; goBack('/speaking');
    }
  }
  function startEdit() { rec = clone(rec); working.set(rec.id, rec); editing = true; dirty = false; render(); }
  async function remove() {
    const n = media.length;
    if (!(await confirmDialog({ title: 'Delete this session?', message: `“${rec.title || 'Untitled session'}”${n ? ` and its ${n} recording(s)/image(s)` : ''} will be permanently deleted. This cannot be undone.`, confirmText: 'Delete', danger: true }))) return;
    autosave.cancel(); working.delete(rec.id); editing = false; await removeSessionMedia(rec.id); await db.records.del(rec.id); toast('Session deleted'); go('/speaking');
  }

  async function addFiles(files, kind, part) {
    if (!files.length) return;
    try {
      await ensureSession();
      for (const f of files) await addMedia({ sessionId: rec.id, part, kind, blob: f, originalName: f.name, date: rec.date, sessionTitle: rec.title });
      await reloadMedia(); toast(`${files.length} file(s) added`, 'ok'); render();
    } catch (e) { toast('Could not add file: ' + e.message, 'error'); }
  }
  async function delMedia(m) {
    if (!(await confirmDialog({ title: m.kind === 'audio' ? 'Delete this recording?' : 'Remove this file?', message: `${m.name} will be permanently deleted from this phone.`, confirmText: 'Delete', danger: true }))) return;
    await removeMedia(m.id); await reloadMedia(); render();
  }
  async function viewImage(m) {
    const url = await mediaUrl(m); let zoom = false;
    const img = h('img', { src: url, alt: m.name });
    const box = h('div', { class: 'viewer', style: { overflow: 'auto', maxHeight: '70vh' } }, img);
    modal({ title: m.part ? `Part ${m.part} question` : 'Image', wide: true, body: box, actions: [
      { label: 'Zoom', class: '', onClick: () => { zoom = !zoom; img.style.maxWidth = zoom ? 'none' : '100%'; img.style.width = zoom ? '200%' : ''; img.style.maxHeight = zoom ? 'none' : '70vh'; } }, { label: 'Close', class: 'primary', value: true }] });
  }

  function mediaSection(part) {
    const imgs = media.filter(m => m.kind === 'image' && m.part === part), auds = media.filter(m => m.kind === 'audio' && m.part === part), files = media.filter(m => m.kind === 'file' && m.part === part);
    const thumbs = h('div', { class: 'thumbs' });
    imgs.forEach(m => { const im = h('img', { alt: m.name }); mediaUrl(m).then(u => { im.src = u; }).catch(() => { im.alt = 'Image missing'; });
      thumbs.append(h('div', { class: 'thumb' }, h('button', { class: 'thumb', style: { border: 0, width: '100%', height: '100%' }, 'aria-label': `Open question image ${m.name}`, onclick: () => viewImage(m) }, im),
        editing ? h('button', { class: 'del', 'aria-label': `Delete ${m.name}`, onclick: () => delMedia(m) }, icon('x', 18)) : null)); });
    const audList = h('div');
    auds.forEach(m => { const a = h('audio', { controls: true, preload: 'none' }); mediaUrl(m).then(u => { a.src = u; fixDuration(a); }).catch(() => {});
      audList.append(h('div', { class: 'recording' }, h('div', { class: 'row spread', style: { flexWrap: 'nowrap' } }, h('div', { class: 'small' }, h('b', {}, fmtDuration(m.duration)), ` · ${fmtBytes(m.size)}`, h('div', { class: 'muted' }, m.name)),
        editing ? h('button', { class: 'icon-btn', style: { color: 'var(--bad)' }, 'aria-label': `Delete recording ${m.name}`, onclick: () => delMedia(m) }, icon('trash')) : null), a)); });
    const recorder = editing && part ? recorderControl({ part, ensureSession, onSaved: async (blob, dur) => { await addMedia({ sessionId: rec.id, part, kind: 'audio', blob, duration: dur, date: rec.date, sessionTitle: rec.title }); await reloadMedia(); render(); } }) : null;
    if (recorder) leaves.push(recorder.leave);
    return h('div', {}, h('h3', { style: { margin: '6px 0' } }, 'Question images'),
      imgs.length ? thumbs : h('p', { class: 'muted small' }, 'No images yet.'),
      editing ? h('div', { class: 'row', style: { margin: '8px 0 14px' } }, h('button', { class: 'btn small', onclick: async () => addFiles(await pickFiles('image/*', { multiple: true }), 'image', part) }, icon('image', 20), 'Gallery'),
        h('button', { class: 'btn small', onclick: async () => addFiles(await pickFiles('image/*', { capture: 'environment' }), 'image', part) }, icon('camera', 20), 'Camera')) : null,
      part ? [h('h3', { style: { margin: '6px 0' } }, 'Recordings'), auds.length ? audList : h('p', { class: 'muted small' }, 'No recordings yet.'), recorder || (editing ? null : null)] : null,
      files.length || (editing && !part) ? [h('h3', { style: { margin: '10px 0 6px' } }, 'Other files'), files.map(m => h('div', { class: 'row spread', style: { marginBottom: '6px' } }, h('button', { class: 'btn small ghost', onclick: async () => { try { await deliverFile(await mediaBlob(m), m.originalName || m.name); } catch (e) { toast('Could not open: ' + e.message, 'error'); } } }, icon('clip', 18), m.originalName || m.name),
        editing ? h('button', { class: 'icon-btn', style: { color: 'var(--bad)' }, 'aria-label': `Delete ${m.name}`, onclick: () => delMedia(m) }, icon('trash')) : null))] : null,
      editing && !part ? h('button', { class: 'btn small', onclick: async () => addFiles(await pickFiles('*/*', { multiple: true }), 'file', null) }, icon('clip', 20), 'Attach file') : null);
  }

  function refresh() {
    const prov = calcSpeakingBand(rec.criteria); refs.prov.textContent = prov == null ? 'Enter all four criteria' : fmtBand(prov);
    const st = assessmentStatus(rec, 'speaking'); refs.status.textContent = st.label; refs.status.className = 'chip ' + (st.key === 'assessed' ? 'ok' : st.key === 'partial' ? 'warn' : '');
  }
  function render() {
    leaves.length = 0; clear(root);
    shell.setHeader({ title: rec.title || (persisted ? 'Speaking session' : 'New speaking session'), back: true, actions: [statsButton('/speaking/stats')] });
    refs.alert = h('div', { 'aria-live': 'assertive' }); refs.prov = h('b'); refs.status = h('span', { class: 'chip' });
    const partsShown = [...new Set([...rec.parts, ...media.filter(m => m.part).map(m => m.part)])].sort();
    mount(root, restored ? h('div', { class: 'alert info' }, 'Your unsaved changes were restored. Save or cancel when you are ready.') : null, refs.alert,
      h('div', { class: 'row', style: { marginBottom: '10px' } }, rec.status === 'draft' ? chip('Draft') : chip('Saved', 'ok'), refs.status),
      editing ? h('div', { class: 'row', style: { marginBottom: '12px' } }, h('button', { class: 'btn primary grow', onclick: save }, icon('check'), 'Save session'),
        rec.status === 'draft' ? h('button', { class: 'btn', onclick: async () => { autosave.cancel(); await persist(); dirty = false; toast('Draft saved', 'ok'); } }, 'Save draft') : null, h('button', { class: 'btn ghost', onclick: cancel }, 'Cancel'))
        : h('div', { class: 'row', style: { marginBottom: '12px' } }, h('button', { class: 'btn primary grow', onclick: startEdit }, icon('edit'), 'Edit session'), h('button', { class: 'btn ghost', onclick: remove }, icon('trash'), 'Delete')),
      h('div', { class: 'card' },
        field('Date', h('input', { type: 'date', value: rec.date, disabled: !editing, oninput: e => { rec.date = e.target.value; touch(); } })),
        field('Session title (optional)', h('input', { type: 'text', value: rec.title, disabled: !editing, placeholder: 'e.g. Part 2 – a book you enjoyed', oninput: e => { rec.title = e.target.value; touch(); } })),
        field('Topic / description (optional)', h('textarea', { rows: 2, value: rec.topic, disabled: !editing, oninput: e => { rec.topic = e.target.value; touch(); } })),
        h('div', { class: 'field' }, h('label', {}, 'Parts practised'), h('div', { class: 'pills', role: 'group', 'aria-label': 'Parts practised' }, [1, 2, 3].map(p => h('button', { class: 'pill', disabled: !editing, 'aria-pressed': String(rec.parts.includes(p)),
          onclick: () => { rec.parts = rec.parts.includes(p) ? rec.parts.filter(x => x !== p) : [...rec.parts, p].sort(); touch(); render(); } }, `Part ${p}`))), h('div', { class: 'hint' }, 'Any combination is fine; you do not need all three.'))),
      partsShown.length ? partsShown.map(p => h('div', { class: 'card' }, h('h2', {}, `Part ${p}`), !rec.parts.includes(p) ? h('p', { class: 'small muted' }, 'This part is not ticked above, but it still has attachments.') : null, mediaSection(p)))
        : h('div', { class: 'card muted' }, 'Tick the parts you practised to add question images and recordings.'),
      h('div', { class: 'card' }, h('h2', {}, 'General materials'), h('p', { class: 'small muted' }, 'Images or files that belong to the whole session.'), mediaSection(null)),
      h('div', { class: 'card' }, h('h2', {}, 'Teacher assessment'), h('p', { class: 'small muted' }, 'Enter the band scores from your teacher. You do not need to fill in every field.'),
        SPEAKING_CRITERIA.map(c => h('div', { class: 'crit' }, h('label', {}, c.label), bandSelect(rec.criteria[c.key], v => { rec.criteria[c.key] = v; refresh(); touch(); }, { disabled: !editing, label: c.label }))),
        h('div', { class: 'crit' }, h('label', {}, 'Overall Speaking band (teacher)'), bandSelect(rec.overall, v => { rec.overall = v; refresh(); touch(); }, { disabled: !editing, label: 'Overall Speaking band' })),
        h('div', { class: 'row spread small', style: { margin: '4px 0 12px' } }, h('span', { class: 'muted' }, 'Provisional mean of the four criteria (not a teacher score)'), refs.prov),
        field('Teacher feedback', editing ? h('textarea', { rows: 6, value: rec.feedback, placeholder: 'Paste written feedback here, if any', oninput: e => { rec.feedback = e.target.value; touch(); } }) : h('div', { class: 'essay' }, rec.feedback || h('span', { class: 'muted' }, 'Nothing entered.'))),
        field('My notes (optional)', editing ? h('textarea', { rows: 4, value: rec.notes, oninput: e => { rec.notes = e.target.value; touch(); } }) : h('div', { class: 'essay' }, rec.notes || h('span', { class: 'muted' }, 'Nothing entered.')))));
    refresh();
  }
  render();
  return () => { autosave.cancel(); leaves.forEach(f => f && f()); if (editing && rec.status === 'draft' && hasContent(rec)) persist(); };
}

// ───────────── statistics ─────────────
export async function speakingStats({ root, shell }) {
  shell.setHeader({ title: 'Speaking statistics', back: true });
  const [recs, media] = await Promise.all([db.records.all('speaking'), db.mediaMeta.all()]);
  let range = 'all'; const host = h('div');
  const draw = () => {
    clear(host);
    const pts = speakingPoints(recs), shown = inRange(pts, range), target = settings.targets.speaking, sm = summarise(pts, target);
    mount(host, rangePicker(range, r => { range = r; draw(); }), h('div', { style: { height: '12px' } }));
    mount(host, h('div', { class: 'card' }, h('div', { class: 'grid-auto' }, tile('Sessions', String(recs.length)), tile('Recordings', String(media.filter(m => m.kind === 'audio').length)),
      tile('Part 1', String(recs.filter(r => r.parts.includes(1)).length)), tile('Part 2', String(recs.filter(r => r.parts.includes(2)).length)), tile('Part 3', String(recs.filter(r => r.parts.includes(3)).length)), tile('Assessed', String(pts.length)))));
    if (!pts.length) { mount(host, emptyState('mic', 'No assessed sessions yet', 'When your teacher gives you scores, enter them in a session and your progress chart will appear here. Unassessed recordings are never given a score.')); return; }
    mount(host, chartCard([{ name: 'Overall Speaking', color: 'var(--c-speaking)', points: shown }], target ? [{ value: target, color: 'var(--accent)', label: 'Target' }] : [], 'Speaking band over time', 'No assessed sessions in this period.'),
      h('div', { class: 'card' }, h('div', { class: 'row spread' }, h('h3', { style: { margin: 0 } }, 'Progress'), trendChip(sm.trend)), h('div', { style: { height: '8px' } }),
        h('div', { class: 'grid-auto' }, tile('Most recent', fmtBand(sm.latest)), tile('Best', fmtBand(sm.best)), tile('Target', target ? fmtBand(target) : '—')), h('div', { style: { marginTop: '10px' } }, targetLine(sm.target)),
        sm.provisional ? h('p', { class: 'small muted' }, 'The most recent figure is provisional (mean of criteria; no teacher overall entered).') : null));
    const cols = ['var(--c-listening)', 'var(--c-reading)', 'var(--c-writing)', 'var(--c-speaking)'];
    const sorted = recs.slice().sort((a, b) => (a.date < b.date ? -1 : 1));
    const series = SPEAKING_CRITERIA.map((c, i) => ({ name: c.label, color: cols[i], points: inRange(sorted.filter(r => r.criteria[c.key] != null).map(r => ({ date: r.date, value: r.criteria[c.key] })), range) }));
    mount(host, series.some(s => s.points.length >= 2) ? chartCard(series, [], 'Speaking criterion trends') : h('div', { class: 'card muted small' }, 'Criterion trends appear once at least two sessions have criterion scores.'));
  };
  mount(root, host); draw();
}
