// Media files (audio recordings, question images, other attachments).
// Android: copied into app-private storage with Capacitor Filesystem (Directory.Data/media/...).
// Browser/dev: bytes live in IndexedDB. Tests: in-memory adapter. All share one interface.
import { Capacitor } from '@capacitor/core';
import { Filesystem, Directory } from '@capacitor/filesystem';
import { mediaMeta, blobStore } from './db.js';
import { uid, nowISO, slug } from './util.js';

const CHUNK = 3 * 256 * 1024; // multiple of 3 so base64 pieces concatenate cleanly

const blobToBase64 = blob => new Promise((res, rej) => {
  const fr = new FileReader();
  fr.onload = () => res(String(fr.result).split(',')[1] || '');
  fr.onerror = () => rej(fr.error);
  fr.readAsDataURL(blob);
});

/** Write a Blob to a native file in chunks so big recordings are never base64-encoded in one piece. */
export async function writeChunked(path, blob, directory = Directory.Data) {
  let off = 0;
  do {
    const data = await blobToBase64(blob.slice(off, off + CHUNK));
    if (off === 0) await Filesystem.writeFile({ path, data, directory, recursive: true });
    else await Filesystem.appendFile({ path, data, directory });
    off += CHUNK;
  } while (off < blob.size);
}

export const nativeAdapter = {
  name: 'native-filesystem',
  write(path, blob) { return writeChunked(path, blob, Directory.Data); },
  async url(path) {
    const { uri } = await Filesystem.getUri({ path, directory: Directory.Data });
    return Capacitor.convertFileSrc(uri);
  },
  async read(path) { const r = await fetch(await this.url(path)); if (!r.ok) throw new Error('File not found: ' + path); return r.blob(); },
  async remove(path) { try { await Filesystem.deleteFile({ path, directory: Directory.Data }); } catch { /* already gone */ } },
  async exists(path) { try { await Filesystem.stat({ path, directory: Directory.Data }); return true; } catch { return false; } },
};

export const webAdapter = {
  name: 'indexeddb',
  async write(path, blob) { await blobStore.put(path, await blob.arrayBuffer(), blob.type); },
  async read(path) { const r = await blobStore.get(path); if (!r) throw new Error('File not found: ' + path); return new Blob([r.buf], { type: r.mime }); },
  async url(path) { return URL.createObjectURL(await this.read(path)); },
  async remove(path) { await blobStore.del(path); },
  async exists(path) { return !!(await blobStore.get(path)); },
};

export function memoryAdapter() {
  const files = new Map();
  return {
    name: 'memory', files,
    async write(path, blob) { files.set(path, new Blob([await blob.arrayBuffer()], { type: blob.type })); },
    async read(path) { if (!files.has(path)) throw new Error('File not found: ' + path); return files.get(path); },
    async url(path) { return 'memory://' + path; },
    async remove(path) { files.delete(path); },
    async exists(path) { return files.has(path); },
  };
}

let adapter = Capacitor.isNativePlatform() ? nativeAdapter : webAdapter;
export const setMediaAdapter = a => { adapter = a; urlCache.clear(); };
export const getMediaAdapter = () => adapter;

const urlCache = new Map();
export const FOLDERS = { audio: 'speaking_audio', image: 'question_images', file: 'other_attachments' };

const EXT = { 'audio/webm': 'webm', 'audio/ogg': 'ogg', 'audio/mp4': 'm4a', 'audio/mpeg': 'mp3', 'audio/wav': 'wav', 'audio/aac': 'aac',
  'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp', 'image/gif': 'gif', 'image/heic': 'heic', 'application/pdf': 'pdf' };
export const extFor = (mime, name = '') => {
  const m = String(mime || '').split(';')[0].toLowerCase();
  if (EXT[m]) return EXT[m];
  const e = /\.([a-z0-9]{1,5})$/i.exec(name);
  return e ? e[1].toLowerCase() : 'bin';
};

/** Copy bytes into app-managed storage and register metadata. Never overwrites an existing file name. */
export async function addMedia({ sessionId, part = null, kind, blob, originalName = '', duration = null, date, sessionTitle = '' }) {
  const id = uid();
  const ext = extFor(blob.type, originalName);
  const existing = (await mediaMeta.bySession(sessionId)).map(m => m.name);
  const base = `${date || nowISO().slice(0, 10)}_${slug(sessionTitle) || 'session'}-${sessionId.slice(0, 6)}_${part ? 'part' + part : 'general'}_${kind}`;
  let n = 1, name;
  do { name = `${base}${String(n).padStart(2, '0')}.${ext}`; n++; } while (existing.includes(name) || (await adapter.exists(`media/${FOLDERS[kind]}/${name}`)));
  const path = `media/${FOLDERS[kind]}/${name}`;
  await adapter.write(path, blob);
  const meta = { id, sessionId, part, kind, mime: blob.type || 'application/octet-stream', size: blob.size, duration, name, originalName, path, createdAt: nowISO() };
  try { await mediaMeta.put(meta); } catch (e) { await adapter.remove(path); throw e; }
  return meta;
}

export const mediaBlob = meta => adapter.read(meta.path);
export async function mediaUrl(meta) {
  if (!urlCache.has(meta.id)) urlCache.set(meta.id, await adapter.url(meta.path));
  return urlCache.get(meta.id);
}

/** Delete one attachment. The file is only removed if no other metadata row still points at the same path. */
export async function removeMedia(id) {
  const meta = await mediaMeta.get(id);
  if (!meta) return;
  await mediaMeta.del(id);
  const stillUsed = (await mediaMeta.all()).some(m => m.path === meta.path);
  if (!stillUsed) await adapter.remove(meta.path);
  const u = urlCache.get(id);
  if (u && u.startsWith('blob:')) URL.revokeObjectURL(u);
  urlCache.delete(id);
}

export async function removeSessionMedia(sessionId) {
  for (const m of await mediaMeta.bySession(sessionId)) await removeMedia(m.id);
}

/** Integrity check for Data Management: which metadata rows have no file, which files have no metadata (web/memory only). */
export async function verifyMedia() {
  const metas = await mediaMeta.all();
  const missing = [];
  for (const m of metas) if (!(await adapter.exists(m.path))) missing.push(m);
  return { total: metas.length, missing, bytes: metas.reduce((a, m) => a + (m.size || 0), 0) };
}
