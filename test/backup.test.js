import 'fake-indexeddb/auto';
import { describe, it, expect, beforeEach } from 'vitest';
import JSZip from 'jszip';
import { IDBFactory } from 'fake-indexeddb';
import * as db from '../src/core/db.js';
import { setMediaAdapter, memoryAdapter, addMedia, removeMedia, verifyMedia } from '../src/core/media.js';
import { newPractice, newWriting, newSpeaking } from '../src/core/model.js';
import { createBackup, validateBackup, restoreBackup, analyseConflicts, BACKUP_FORMAT_VERSION } from '../src/core/backup.js';

let mem;
beforeEach(async () => {
  await db.closeDB();
  globalThis.indexedDB = new IDBFactory(); // brand-new "phone"
  mem = memoryAdapter();
  setMediaAdapter(mem);
});

const bytes = n => new Uint8Array(Array.from({ length: n }, (_, i) => (i * 31 + 7) % 256));
async function seed() {
  const L = newPractice('listening'); L.source = 'Cambridge IELTS 18 — Test 2'; L.partTitles = ['Hotel booking', '', 'Seminar', ''];
  L.attempts[1].scores = [5, 6, 7, 8]; L.attempts[2].scores = [7, 7, 8, 9];
  L.mistakes[0] = { categories: ['l_spelling', 'l_accents'], custom: 'Names!', review: { l_spelling: 'improved', l_accents: 'not_improved' } };
  const R = newPractice('reading'); R.attempts[1].scores = [10, 9, 8];
  const W1 = newWriting(1); W1.essay = 'Line one.\n\nLine two with <b>html</b> & “quotes”. Ўзбекча матн'; W1.feedback = 'Good\nTry harder'; W1.criteria = { ta: 6, cc: 6.5, lr: 6, gra: 6 };
  const W2 = newWriting(2); W2.essay = 'Task 2 essay'; W2.teacherOverall = 6.5;
  const S = newSpeaking(); S.title = 'Part 2 cue card'; S.parts = [2]; S.criteria.fc = 6.5; S.overall = 6.5; S.feedback = 'Fluent';
  for (const r of [L, R, W1, W2, S]) await db.records.put(r);
  const audio = await addMedia({ sessionId: S.id, part: 2, kind: 'audio', blob: new Blob([bytes(5000)], { type: 'audio/webm' }), duration: 61, date: S.date, sessionTitle: S.title });
  const image = await addMedia({ sessionId: S.id, part: 2, kind: 'image', blob: new Blob([bytes(3000)], { type: 'image/jpeg' }), date: S.date, sessionTitle: S.title });
  await db.settingsStore.set('targets', { overall: 7, listening: 7.5 });
  await db.settingsStore.set('profile', { name: 'Test Student' });
  return { L, R, W1, W2, S, audio, image };
}

describe('backup → validate → restore into a clean installation', () => {
  it('round-trips every record, relationship and media byte', async () => {
    const s = await seed();
    const { blob, manifest } = await createBackup();
    expect(manifest).toMatchObject({ format: 'ielts-tracker-backup', formatVersion: BACKUP_FORMAT_VERSION, schemaVersion: 1 });
    expect(manifest.counts).toMatchObject({ listening: 1, reading: 1, writing1: 1, writing2: 1, speaking: 1, audio: 1, images: 1 });
    expect(manifest.inventory.every(e => e.sha256.length === 64)).toBe(true);

    const zip = await JSZip.loadAsync(await blob.arrayBuffer());
    const names = Object.keys(zip.files);
    expect(names).toEqual(expect.arrayContaining(['manifest.json', 'data/listening.json', 'data/speaking.json', 'data/goals.json', 'data/settings.json', 'data/profile.json']));
    expect(names.some(n => n.startsWith('media/speaking_audio/'))).toBe(true);
    expect(names.some(n => n.startsWith('media/question_images/'))).toBe(true);

    // new phone
    await db.closeDB(); globalThis.indexedDB = new IDBFactory(); const mem2 = memoryAdapter(); setMediaAdapter(mem2);
    const rep = await validateBackup(blob);
    expect(rep.ok).toBe(true);
    expect(rep.summary).toMatchObject({ records: 5, audio: 1, images: 1 });
    const result = await restoreBackup(rep, { strategy: 'replace' });
    expect(result).toMatchObject({ added: 5, mediaRestored: 2 });

    const L = await db.records.get(s.L.id);
    expect(L).toMatchObject({ source: 'Cambridge IELTS 18 — Test 2', partTitles: ['Hotel booking', '', 'Seminar', ''] });
    expect(L.attempts[2].scores).toEqual([7, 7, 8, 9]);
    expect(L.mistakes[0].review).toEqual({ l_spelling: 'improved', l_accents: 'not_improved' });
    expect((await db.records.get(s.W1.id)).essay).toBe(s.W1.essay);        // paragraph breaks, HTML chars, Cyrillic
    expect((await db.records.get(s.W1.id)).feedback).toBe('Good\nTry harder');
    expect((await db.records.get(s.W2.id)).teacherOverall).toBe(6.5);
    expect((await db.records.get(s.S.id)).overall).toBe(6.5);
    const media = await db.mediaMeta.bySession(s.S.id);
    expect(media).toHaveLength(2);
    const a = media.find(m => m.kind === 'audio');
    expect(a).toMatchObject({ part: 2, duration: 61, path: s.audio.path });
    expect(new Uint8Array(await (await mem2.read(a.path)).arrayBuffer())).toEqual(bytes(5000));
    expect(await db.settingsStore.get('targets')).toEqual({ overall: 7, listening: 7.5 });
    expect((await db.settingsStore.get('profile')).name).toBe('Test Student');
    expect((await verifyMedia()).missing).toHaveLength(0);
  });
});

describe('validation and failure handling', () => {
  async function makeBackupZip() { await seed(); return (await createBackup()).blob; }
  const rewrite = async (blob, fn) => { const z = await JSZip.loadAsync(await blob.arrayBuffer()); await fn(z); return z.generateAsync({ type: 'uint8array' }); };

  it('rejects non-zip / random bytes', async () => {
    const r = await validateBackup(new Blob([bytes(500)]));
    expect(r.ok).toBe(false); expect(r.errors[0]).toMatch(/not a valid ZIP/);
  });
  it('rejects a truncated archive', async () => {
    const blob = await makeBackupZip();
    const buf = new Uint8Array(await blob.arrayBuffer());
    const r = await validateBackup(buf.slice(0, Math.floor(buf.length / 2)));
    expect(r.ok).toBe(false);
  });
  it('rejects a zip that is not a backup, or has no manifest', async () => {
    const z = new JSZip(); z.file('hello.txt', 'hi');
    expect((await validateBackup(await z.generateAsync({ type: 'uint8array' }))).errors[0]).toMatch(/manifest/);
    const z2 = new JSZip(); z2.file('manifest.json', JSON.stringify({ format: 'something-else' }));
    expect((await validateBackup(await z2.generateAsync({ type: 'uint8array' }))).errors[0]).toMatch(/not an IELTS Tracker backup/);
  });
  it('rejects unsupported format / newer schema versions', async () => {
    const blob = await makeBackupZip();
    const newerFormat = await rewrite(blob, async z => { const m = JSON.parse(await z.file('manifest.json').async('string')); m.formatVersion = 99; z.file('manifest.json', JSON.stringify(m)); });
    expect((await validateBackup(newerFormat)).errors[0]).toMatch(/Unsupported backup format/);
    const newerSchema = await rewrite(blob, async z => { const m = JSON.parse(await z.file('manifest.json').async('string')); m.schemaVersion = 99; z.file('manifest.json', JSON.stringify(m)); });
    expect((await validateBackup(newerSchema)).errors[0]).toMatch(/newer version/);
  });
  it('detects a tampered data file by checksum and a missing data file', async () => {
    const blob = await makeBackupZip();
    const tampered = await rewrite(blob, z => { z.file('data/listening.json', JSON.stringify({ schemaVersion: 1, items: [] })); });
    const r = await validateBackup(tampered); expect(r.ok).toBe(false); expect(r.errors.join(' ')).toMatch(/checksum mismatch/);
    const gone = await rewrite(blob, z => { z.remove('data/writing_task2.json'); });
    expect((await validateBackup(gone)).errors.join(' ')).toMatch(/missing: data\/writing_task2\.json/);
    const bad = await rewrite(blob, z => { z.file('data/goals.json', '{not json'); });
    expect((await validateBackup(bad)).ok).toBe(false);
  });
  it('missing / damaged attachments are skipped with a warning; the rest still restores', async () => {
    const blob = await makeBackupZip();
    const damaged = await rewrite(blob, z => { const fileOf = prefix => Object.keys(z.files).find(n => n.startsWith(prefix) && !n.endsWith('/')); z.file(fileOf('media/speaking_audio/'), bytes(10)); z.remove(fileOf('media/question_images/')); });
    const r = await validateBackup(damaged);
    expect(r.ok).toBe(true);
    expect(r.summary.mediaFiles).toBe(0);
    expect(r.warnings.join(' ')).toMatch(/checksum mismatch/);
    expect(r.warnings.join(' ')).toMatch(/file missing from backup/);
    await db.clearAllData();
    const res = await restoreBackup(r, { strategy: 'replace' });
    expect(res.added).toBe(5);
    expect(await db.mediaMeta.all()).toHaveLength(0);
  });
  it('invalid values inside records are repaired, not trusted', async () => {
    const blob = await makeBackupZip();
    const edited = await rewrite(blob, async z => {
      const d = JSON.parse(await z.file('data/listening.json').async('string')); d.items[0].attempts[1].scores = [99, 6, 7, 8];
      const text = JSON.stringify(d); z.file('data/listening.json', text);
      const m = JSON.parse(await z.file('manifest.json').async('string')); m.inventory = m.inventory.filter(e => e.path !== 'data/listening.json'); z.file('manifest.json', JSON.stringify(m));
    });
    const r = await validateBackup(edited);
    expect(r.ok).toBe(true);
    expect(r.plan.records.find(x => x.type === 'listening').attempts[1].scores).toEqual([null, 6, 7, 8]);
    expect(r.warnings.join(' ')).toMatch(/invalid score ignored/);
  });
  it('a failed restore leaves current data completely untouched and cleans up copied files', async () => {
    const blob = await makeBackupZip();
    // switch to a different phone that already has its own record
    await db.closeDB(); globalThis.indexedDB = new IDBFactory(); const mem2 = memoryAdapter(); setMediaAdapter(mem2);
    const rep = await validateBackup(blob);
    const mine = newWriting(2); mine.essay = 'MY CURRENT ESSAY'; await db.records.put(mine);
    const realWrite = mem2.write.bind(mem2); let n = 0;
    mem2.write = async (p, b) => { if (++n === 2) throw new Error('disk full'); return realWrite(p, b); };
    await expect(restoreBackup(rep, { strategy: 'replace' })).rejects.toThrow(/left unchanged/);
    expect((await db.records.get(mine.id)).essay).toBe('MY CURRENT ESSAY');
    expect((await db.records.all()).map(r => r.id)).toEqual([mine.id]);   // nothing from the backup was applied
    expect(mem2.files.size).toBe(0);                                      // the first copied file was rolled back
    // and a retry without the fault succeeds
    mem2.write = realWrite;
    expect((await restoreBackup(rep, { strategy: 'replace' })).added).toBe(5);
    expect(await db.records.get(mine.id)).toBeUndefined();
  });
});

describe('merge strategies and conflicts', () => {
  it('keep-mine adds missing, never overwrites; newer-wins takes the more recent edit', async () => {
    const s = await seed(); const { blob } = await createBackup();
    const rep = await validateBackup(blob);
    // local copy of one backed-up essay was edited AFTER the backup, another record deleted
    const local = await db.records.get(s.W2.id); local.essay = 'edited later'; local.updatedAt = '2999-01-01T00:00:00.000Z'; await db.records.put(local);
    await db.records.del(s.R.id);
    const c = await analyseConflicts(rep);
    expect(c).toMatchObject({ fresh: 1, same: 4, backupOlder: 1 });

    const keep = await restoreBackup(rep, { strategy: 'merge-keep' });
    expect(keep).toMatchObject({ added: 1, skipped: 4 });
    expect((await db.records.get(s.W2.id)).essay).toBe('edited later');
    expect(await db.records.get(s.R.id)).toBeTruthy();

    // make the backup copy newer than local for W1 only
    const l1 = await db.records.get(s.W1.id); l1.essay = 'old local'; l1.updatedAt = '2000-01-01T00:00:00.000Z'; await db.records.put(l1);
    const nw = await restoreBackup(rep, { strategy: 'merge-newer' });
    expect(nw.updated).toBe(1);
    expect((await db.records.get(s.W1.id)).essay).toBe(s.W1.essay);
    expect((await db.records.get(s.W2.id)).essay).toBe('edited later');
  });
  it('merging into a non-empty profile never overwrites a different attachment that has the same file name', async () => {
    const s = await seed(); const { blob } = await createBackup();
    const rep = await validateBackup(blob);
    // simulate other attachment already occupying the path with a different id
    await db.mediaMeta.del(s.audio.id);
    await db.mediaMeta.put({ ...s.audio, id: 'other-id', sessionId: 'other-session' });
    await db.records.del(s.S.id);
    await restoreBackup(rep, { strategy: 'merge-keep' });
    const metas = await db.mediaMeta.all();
    const restored = metas.find(m => m.id === s.audio.id);
    expect(restored.path).not.toBe(s.audio.path);
    expect(restored.path).toMatch(/_restored1\./);
    expect(mem.files.has(s.audio.path)).toBe(true);
    expect(mem.files.has(restored.path)).toBe(true);
  });
});

describe('media deletion safety', () => {
  it('only deletes the file when no other metadata row uses the same path', async () => {
    const s = await seed();
    await db.mediaMeta.put({ ...s.audio, id: 'dup-row' });
    await removeMedia(s.audio.id);
    expect(mem.files.has(s.audio.path)).toBe(true);
    await removeMedia('dup-row');
    expect(mem.files.has(s.audio.path)).toBe(false);
  });
  it('never overwrites an existing recording that has the same base name', async () => {
    const S = newSpeaking(); await db.records.put(S);
    const mk = () => addMedia({ sessionId: S.id, part: 1, kind: 'audio', blob: new Blob([bytes(10)], { type: 'audio/webm' }), date: '2026-10-17', sessionTitle: 'T' });
    const a = await mk(), b = await mk();
    expect(a.path).not.toBe(b.path);
    expect(mem.files.size).toBe(2);
  });
});
