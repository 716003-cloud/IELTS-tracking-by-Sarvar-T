// Complete backup (ZIP) and restore. See docs/BACKUP_FORMAT.md.
// Rules enforced here: validate everything before touching current data; apply DB changes atomically;
// never report success unless the operation really finished.
import JSZip from 'jszip';
import * as db from './db.js';
import { getMediaAdapter, mediaBlob, FOLDERS } from './media.js';
import { SCHEMA_VERSION, SKILLS } from './model.js';
import { isValidBand } from './bands.js';
import { sha256Hex, nowISO, isISODate } from './util.js';

export const BACKUP_FORMAT = 'ielts-tracker-backup';
export const BACKUP_FORMAT_VERSION = 1;
export const APP_VERSION = '1.0.0';

export const DATA_FILES = {
  profile: 'data/profile.json', listening: 'data/listening.json', reading: 'data/reading.json',
  writing_task1: 'data/writing_task1.json', writing_task2: 'data/writing_task2.json',
  speaking: 'data/speaking.json', goals: 'data/goals.json', settings: 'data/settings.json',
};
const wrap = (obj) => JSON.stringify({ schemaVersion: SCHEMA_VERSION, ...obj }, null, 1);

// schema migrations: MIGRATIONS[n] upgrades data written with schemaVersion n to n+1 (none needed for v1).
const MIGRATIONS = {};
export function migrate(file, from) { let d = file; for (let v = from; v < SCHEMA_VERSION; v++) if (MIGRATIONS[v]) d = MIGRATIONS[v](d); return d; }

const README = `IELTS Tracker – complete backup
================================
manifest.json   format/schema versions, creation time, counts and a SHA-256 inventory of every file
data/           one JSON file per area (profile, listening, reading, writing_task1, writing_task2, speaking, goals, settings)
media/          speaking_audio/, question_images/, other_attachments/  (linked from data/speaking.json by id and relative path)
Restore with: IELTS Tracker > Settings > Backup & Restore > Restore from backup.
Do not edit these files by hand; the app verifies checksums before restoring.
`;

export const backupFileName = (d = new Date()) => {
  const p = n => String(n).padStart(2, '0');
  return `ielts_backup_${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}_${p(d.getHours())}${p(d.getMinutes())}.zip`;
};

/** Build the ZIP. Throws (with a readable message) if anything cannot be included – never a partial "success". */
export async function createBackup({ onProgress = () => {} } = {}) {
  onProgress({ stage: 'Collecting records', percent: 2 });
  const [listening, reading, w1, w2, speaking, media, settings] = await Promise.all([
    db.records.all('listening'), db.records.all('reading'), db.records.all('writing1'), db.records.all('writing2'),
    db.records.all('speaking'), db.mediaMeta.all(), db.settingsStore.all(),
  ]);
  const zip = new JSZip();
  const inventory = [];
  const addFile = async (path, content, opts = {}) => {
    const bytes = typeof content === 'string' ? new TextEncoder().encode(content) : new Uint8Array(content);
    zip.file(path, bytes, { binary: true, compression: opts.store ? 'STORE' : 'DEFLATE', compressionOptions: { level: 6 }, date: new Date() });
    inventory.push({ path, size: bytes.byteLength, sha256: await sha256Hex(bytes), kind: opts.kind || 'data' });
  };

  const { profile = {}, targets = {}, ...rest } = settings;
  await addFile(DATA_FILES.profile, wrap({ profile }));
  await addFile(DATA_FILES.listening, wrap({ items: listening }));
  await addFile(DATA_FILES.reading, wrap({ items: reading }));
  await addFile(DATA_FILES.writing_task1, wrap({ items: w1 }));
  await addFile(DATA_FILES.writing_task2, wrap({ items: w2 }));
  await addFile(DATA_FILES.speaking, wrap({ sessions: speaking, media }));
  await addFile(DATA_FILES.goals, wrap({ targets }));
  await addFile(DATA_FILES.settings, wrap({ settings: rest }));

  let i = 0;
  for (const m of media) {
    onProgress({ stage: `Adding media (${i + 1}/${media.length})`, percent: 5 + (i / Math.max(1, media.length)) * 55 });
    let blob;
    try { blob = await mediaBlob(m); } catch (e) { throw new Error(`Cannot read attachment "${m.name}". Backup was NOT created. (${e.message})`); }
    await addFile(m.path, await blob.arrayBuffer(), { store: true, kind: 'media' });
    i++;
  }
  await addFile('README.txt', README, { kind: 'info' });

  const manifest = {
    format: BACKUP_FORMAT, formatVersion: BACKUP_FORMAT_VERSION, schemaVersion: SCHEMA_VERSION,
    appVersion: APP_VERSION, createdAt: nowISO(),
    counts: { listening: listening.length, reading: reading.length, writing1: w1.length, writing2: w2.length, speaking: speaking.length,
      audio: media.filter(m => m.kind === 'audio').length, images: media.filter(m => m.kind === 'image').length, otherFiles: media.filter(m => m.kind === 'file').length },
    inventory,
  };
  zip.file('manifest.json', JSON.stringify(manifest, null, 1));

  const blob = await zip.generateAsync({ type: 'blob', compression: 'DEFLATE', compressionOptions: { level: 6 } },
    meta => onProgress({ stage: 'Compressing', percent: 60 + meta.percent * 0.35 }));

  // Self-check: re-open what we just made. If this fails we must not claim success.
  onProgress({ stage: 'Verifying backup', percent: 96 });
  const check = await validateBackup(blob);
  if (!check.ok) throw new Error('Backup verification failed: ' + check.errors.join('; '));
  const expected = listening.length + reading.length + w1.length + w2.length + speaking.length;
  if (check.summary.records !== expected || check.summary.mediaFiles !== media.length) throw new Error('Backup verification failed: record or attachment counts differ.');
  await db.settingsStore.set('lastBackupAt', manifest.createdAt);
  onProgress({ stage: 'Done', percent: 100 });
  return { blob, filename: backupFileName(), manifest };
}

// ───────────────────────────── validation ─────────────────────────────
const isObj = x => x && typeof x === 'object' && !Array.isArray(x);
const str = x => (typeof x === 'string' ? x : '');
const bandOrNull = x => (isValidBand(x) ? x : null);
const safePath = p => typeof p === 'string' && p.startsWith('media/') && !p.includes('..') && !p.includes('\\');

/** Normalise a record from a backup; returns null if it is unusable. `issues` collects repairs for the report. */
export function sanitizeRecord(type, r, issues) {
  if (!isObj(r) || typeof r.id !== 'string' || !r.id || r.type !== type) { issues.push(`Skipped a ${type} record without a valid id/type.`); return null; }
  if (!isISODate(r.date)) { issues.push(`Skipped ${type} record ${r.id.slice(0, 8)}: invalid date.`); return null; }
  const base = { ...r, schemaVersion: SCHEMA_VERSION, createdAt: str(r.createdAt) || nowISO(), updatedAt: str(r.updatedAt) || str(r.createdAt) || nowISO(), status: r.status === 'saved' ? 'saved' : 'draft' };
  if (type === 'listening' || type === 'reading') {
    const cfg = SKILLS[type];
    const attempts = {};
    for (const a of [1, 2, 3]) {
      const sc = Array.isArray(r.attempts?.[a]?.scores) ? r.attempts[a].scores : [];
      attempts[a] = { scores: Array.from({ length: cfg.parts }, (_, p) => {
        const v = sc[p];
        if (v == null) return null;
        if (Number.isInteger(v) && v >= 0 && v <= cfg.max[p]) return v;
        issues.push(`Record ${r.id.slice(0, 8)}: invalid score ignored (attempt ${a}, part ${p + 1}).`); return null;
      }) };
    }
    return { ...base, source: str(r.source), description: str(r.description), completed: !!r.completed,
      partTitles: Array.from({ length: cfg.parts }, (_, p) => str(r.partTitles?.[p])), attempts,
      mistakes: Array.from({ length: cfg.parts }, (_, p) => {
        const m = r.mistakes?.[p] || {};
        return { categories: Array.isArray(m.categories) ? m.categories.filter(x => typeof x === 'string') : [], custom: str(m.custom), review: isObj(m.review) ? m.review : {} };
      }) };
  }
  if (type === 'writing1' || type === 'writing2') {
    return { ...base, title: str(r.title), prompt: str(r.prompt), essay: str(r.essay), feedback: str(r.feedback),
      criteria: Object.fromEntries(['ta', 'cc', 'lr', 'gra'].map(k => [k, bandOrNull(r.criteria?.[k])])), teacherOverall: bandOrNull(r.teacherOverall) };
  }
  if (type === 'speaking') {
    return { ...base, title: str(r.title), topic: str(r.topic), parts: Array.isArray(r.parts) ? r.parts.filter(p => [1, 2, 3].includes(p)) : [],
      criteria: Object.fromEntries(['fc', 'lr', 'gra', 'pr'].map(k => [k, bandOrNull(r.criteria?.[k])])), overall: bandOrNull(r.overall), feedback: str(r.feedback), notes: str(r.notes) };
  }
  return null;
}

/** Validate a backup without changing anything. `source` may be a Blob/File/ArrayBuffer/Uint8Array. */
export async function validateBackup(source) {
  const rep = { ok: false, errors: [], warnings: [], manifest: null, summary: null, plan: null, zip: null };
  let zip;
  try {
    const input = source && typeof source.arrayBuffer === 'function' ? await source.arrayBuffer() : source;
    zip = await JSZip.loadAsync(input);
  } catch { rep.errors.push('This file is not a valid ZIP archive, or it is damaged.'); return rep; }
  const readJson = async path => {
    const f = zip.file(path);
    if (!f) throw new Error(`Required file is missing: ${path}`);
    try { return JSON.parse(await f.async('string')); } catch { throw new Error(`File is damaged or not valid JSON: ${path}`); }
  };
  let manifest;
  try { manifest = await readJson('manifest.json'); } catch (e) { rep.errors.push(e.message.replace('Required file is missing: manifest.json', 'manifest.json is missing – this is not an IELTS Tracker backup.')); return rep; }
  rep.manifest = manifest;
  if (manifest.format !== BACKUP_FORMAT) { rep.errors.push('This ZIP is not an IELTS Tracker backup.'); return rep; }
  if (!Number.isInteger(manifest.formatVersion) || manifest.formatVersion > BACKUP_FORMAT_VERSION) { rep.errors.push(`Unsupported backup format version (${manifest.formatVersion}). Update the app and try again.`); return rep; }
  if (!Number.isInteger(manifest.schemaVersion) || manifest.schemaVersion > SCHEMA_VERSION) { rep.errors.push(`This backup was made by a newer version of the app (data schema ${manifest.schemaVersion}). Update the app to restore it.`); return rep; }
  if (!Array.isArray(manifest.inventory)) { rep.errors.push('Backup manifest has no file inventory.'); return rep; }
  const inv = new Map(manifest.inventory.map(e => [e.path, e]));

  // Data files: every one must exist and match its checksum – a damaged data file makes the backup unusable.
  const data = {};
  for (const [key, path] of Object.entries(DATA_FILES)) {
    try {
      const f = zip.file(path);
      if (!f) throw new Error(`Required file is missing: ${path}`);
      const bytes = await f.async('uint8array');
      const e = inv.get(path);
      if (e && (e.size !== bytes.byteLength || e.sha256 !== await sha256Hex(bytes))) throw new Error(`File is damaged (checksum mismatch): ${path}`);
      data[key] = migrate(JSON.parse(new TextDecoder().decode(bytes)), manifest.schemaVersion);
    } catch (e) { rep.errors.push(e.message.startsWith('Required') || e.message.startsWith('File is damaged') ? e.message : `File is damaged or not valid JSON: ${path}`); }
  }
  if (rep.errors.length) return rep;

  const issues = [];
  const listArr = (d, k = 'items') => (Array.isArray(d?.[k]) ? d[k] : (issues.push(`Unexpected structure in a data file (${k}).`), []));
  const records = [
    ...listArr(data.listening).map(r => sanitizeRecord('listening', r, issues)),
    ...listArr(data.reading).map(r => sanitizeRecord('reading', r, issues)),
    ...listArr(data.writing_task1).map(r => sanitizeRecord('writing1', r, issues)),
    ...listArr(data.writing_task2).map(r => sanitizeRecord('writing2', r, issues)),
    ...listArr(data.speaking, 'sessions').map(r => sanitizeRecord('speaking', r, issues)),
  ].filter(Boolean);
  const ids = new Set(); const unique = [];
  for (const r of records) { if (ids.has(r.id)) { issues.push(`Duplicate record id ignored: ${r.id.slice(0, 8)}`); continue; } ids.add(r.id); unique.push(r); }
  const sessionIds = new Set(unique.filter(r => r.type === 'speaking').map(r => r.id));

  // Media: missing or damaged attachments are reported and skipped; the rest of the backup still restores.
  const media = []; const missing = [];
  for (const m of listArr(data.speaking, 'media')) {
    if (!isObj(m) || typeof m.id !== 'string' || !safePath(m.path) || !['audio', 'image', 'file'].includes(m.kind)) { issues.push('Skipped an attachment with invalid metadata.'); continue; }
    if (!sessionIds.has(m.sessionId)) { issues.push(`Attachment "${m.name}" belongs to a session that is not in the backup – skipped.`); continue; }
    const f = zip.file(m.path);
    if (!f) { missing.push({ name: m.name, reason: 'file missing from backup' }); continue; }
    const e = inv.get(m.path);
    if (e) { const bytes = await f.async('uint8array'); if (e.size !== bytes.byteLength || e.sha256 !== await sha256Hex(bytes)) { missing.push({ name: m.name, reason: 'file damaged (checksum mismatch)' }); continue; } }
    media.push(m);
  }
  const t = data.goals?.targets, p = data.profile?.profile, s = data.settings?.settings;
  rep.plan = { records: unique, media, settings: { ...(isObj(s) ? s : {}), ...(isObj(p) ? { profile: p } : {}), ...(isObj(t) ? { targets: t } : {}) } };
  rep.warnings = [...issues, ...missing.map(x => `Attachment "${x.name}" skipped: ${x.reason}.`)];
  rep.missingMedia = missing;
  const count = ty => unique.filter(r => r.type === ty).length;
  rep.summary = {
    createdAt: manifest.createdAt, appVersion: manifest.appVersion, schemaVersion: manifest.schemaVersion,
    records: unique.length, listening: count('listening'), reading: count('reading'), writing1: count('writing1'), writing2: count('writing2'), speaking: count('speaking'),
    audio: media.filter(m => m.kind === 'audio').length, images: media.filter(m => m.kind === 'image').length, otherFiles: media.filter(m => m.kind === 'file').length,
    mediaFiles: media.length, mediaBytes: media.reduce((a, m) => a + (m.size || 0), 0),
  };
  rep.ok = true; rep.zip = zip;
  return rep;
}

/** How many records in the backup already exist in the app (same id) – shown before the user picks a strategy. */
export async function analyseConflicts(rep) {
  const existing = new Map((await db.records.all()).map(r => [r.id, r]));
  let same = 0, newer = 0, older = 0, fresh = 0;
  for (const r of rep.plan.records) {
    const e = existing.get(r.id);
    if (!e) fresh++; else { same++; if (r.updatedAt > e.updatedAt) newer++; else if (r.updatedAt < e.updatedAt) older++; }
  }
  return { existingTotal: existing.size, fresh, same, backupNewer: newer, backupOlder: older };
}

export const STRATEGIES = [
  { id: 'merge-keep', label: 'Add missing records, keep my current version of any record that already exists', safe: true },
  { id: 'merge-newer', label: 'Add missing records; if a record exists in both, keep whichever was edited most recently', safe: true },
  { id: 'replace', label: 'Replace everything on this phone with the backup (current records are deleted)', safe: false },
];

const withSuffix = (path, n) => path.replace(/(\.[A-Za-z0-9]+)$/, `_restored${n}$1`);

/** Apply a validated backup. Existing data is only changed in one atomic DB transaction after all files are written. */
export async function restoreBackup(rep, { strategy = 'merge-keep', onProgress = () => {} } = {}) {
  if (!rep?.ok || !rep.plan) throw new Error('Backup has not been validated.');
  if (!STRATEGIES.some(s => s.id === strategy)) throw new Error('Unknown restore strategy.');
  const adapter = getMediaAdapter();
  const existingRecs = new Map((await db.records.all()).map(r => [r.id, r]));
  const existingMedia = await db.mediaMeta.all();
  const existingMediaIds = new Set(existingMedia.map(m => m.id));
  const takenPaths = new Map(existingMedia.map(m => [m.path, m.id]));

  const res = { added: 0, updated: 0, skipped: 0, mediaRestored: 0, mediaSkipped: 0, warnings: [...rep.warnings] };
  const toPut = []; const importedSessions = new Set();
  for (const r of rep.plan.records) {
    const ex = existingRecs.get(r.id);
    if (strategy === 'replace' || !ex) { toPut.push(r); importedSessions.add(r.id); res.added += strategy === 'replace' ? 0 : 1; }
    else if (strategy === 'merge-newer' && r.updatedAt > ex.updatedAt) { toPut.push(r); importedSessions.add(r.id); res.updated++; }
    else res.skipped++;
  }
  if (strategy === 'replace') res.added = toPut.length;

  const mediaToPut = []; const written = [];
  const list = rep.plan.media.filter(m => importedSessions.has(m.sessionId) && (strategy === 'replace' || !existingMediaIds.has(m.id)));
  res.mediaSkipped = rep.plan.media.length - list.length;
  try {
    let i = 0;
    for (const m of list) {
      onProgress({ stage: `Restoring attachments (${i + 1}/${list.length})`, percent: 5 + (i / Math.max(1, list.length)) * 80 });
      let meta = { ...m };
      const holder = takenPaths.get(meta.path);
      const sameFileAlready = strategy === 'replace' && holder === meta.id && await adapter.exists(meta.path);
      if (!sameFileAlready) {
        // never silently overwrite a different attachment that has the same file name
        if ((holder && holder !== meta.id) || (strategy !== 'replace' && await adapter.exists(meta.path))) {
          let n = 1; while (takenPaths.has(withSuffix(meta.path, n)) || await adapter.exists(withSuffix(meta.path, n))) n++;
          meta.path = withSuffix(meta.path, n); meta.name = meta.path.split('/').pop();
        }
        const bytes = await rep.zip.file(m.path).async('arraybuffer');
        await adapter.write(meta.path, new Blob([bytes], { type: meta.mime }));
        written.push(meta.path);
      }
      takenPaths.set(meta.path, meta.id);
      mediaToPut.push(meta); res.mediaRestored++; i++;
    }

    onProgress({ stage: 'Saving records', percent: 90 });
    let settings = null;
    const bs = rep.plan.settings;
    if (strategy === 'replace') settings = { ...bs };
    else {
      const cur = await db.settingsStore.all();
      settings = {};
      if (bs.targets) settings.targets = { ...bs.targets, ...(cur.targets || {}) };
      if (bs.profile && !(cur.profile && cur.profile.name)) settings.profile = bs.profile;
      if (bs.categories) {
        const merged = JSON.parse(JSON.stringify(cur.categories || bs.categories));
        for (const sk of ['listening', 'reading']) {
          const have = new Set((merged[sk] || []).map(c => c.id));
          (bs.categories[sk] || []).forEach(c => { if (!have.has(c.id)) (merged[sk] = merged[sk] || []).push(c); });
        }
        settings.categories = merged;
      }
    }
    await db.applyBatch({ clear: strategy === 'replace', records: toPut, media: mediaToPut, settings });
  } catch (e) {
    for (const p of written) { try { await adapter.remove(p); } catch { /* best effort */ } }
    throw new Error(`Restore failed and your existing data was left unchanged. (${e.message})`);
  }
  if (strategy === 'replace') { // best-effort cleanup of files that no longer belong to any record
    const keep = new Set(mediaToPut.map(m => m.path));
    for (const old of existingMedia) if (!keep.has(old.path)) { try { await adapter.remove(old.path); } catch { /* orphan */ } }
  }
  onProgress({ stage: 'Done', percent: 100 });
  return res;
}
