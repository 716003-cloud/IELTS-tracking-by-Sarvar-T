// Persistent local storage: IndexedDB inside the app's WebView (app-private, survives restarts).
// Large media files are NOT stored here on Android – see media.js (Capacitor Filesystem).
const DB_NAME = 'ielts-tracker';
const DB_VERSION = 1;
let dbp = null;

export function openDB() {
  if (!dbp) {
    dbp = new Promise((resolve, reject) => {
      const r = indexedDB.open(DB_NAME, DB_VERSION);
      r.onupgradeneeded = () => {
        const d = r.result;
        d.createObjectStore('records', { keyPath: 'id' }).createIndex('type', 'type');
        d.createObjectStore('media', { keyPath: 'id' }).createIndex('sessionId', 'sessionId');
        d.createObjectStore('blobs', { keyPath: 'path' }); // browser-only fallback for media bytes
        d.createObjectStore('settings', { keyPath: 'key' });
      };
      r.onsuccess = () => resolve(r.result);
      r.onerror = () => { dbp = null; reject(r.error); };
      r.onblocked = () => reject(new Error('Database is blocked by another tab.'));
    });
  }
  return dbp;
}
export async function closeDB() { if (dbp) { (await dbp).close(); dbp = null; } }

const req = r => new Promise((res, rej) => { r.onsuccess = () => res(r.result); r.onerror = () => rej(r.error); });

async function run(stores, mode, fn) {
  const db = await openDB();
  const t = db.transaction(stores, mode);
  const done = new Promise((res, rej) => { t.oncomplete = () => res(); t.onerror = () => rej(t.error); t.onabort = () => rej(t.error || new Error('Transaction aborted')); });
  const out = await fn(...stores.map(s => t.objectStore(s)));
  await done;
  return out;
}

export const records = {
  put: rec => run(['records'], 'readwrite', s => req(s.put(rec))),
  get: id => run(['records'], 'readonly', s => req(s.get(id))),
  all: type => run(['records'], 'readonly', s => (type ? req(s.index('type').getAll(type)) : req(s.getAll()))),
  del: id => run(['records'], 'readwrite', s => req(s.delete(id))),
};
export const mediaMeta = {
  put: m => run(['media'], 'readwrite', s => req(s.put(m))),
  get: id => run(['media'], 'readonly', s => req(s.get(id))),
  all: () => run(['media'], 'readonly', s => req(s.getAll())),
  bySession: sid => run(['media'], 'readonly', s => req(s.index('sessionId').getAll(sid))),
  del: id => run(['media'], 'readwrite', s => req(s.delete(id))),
};
export const blobStore = {
  put: (path, buf, mime) => run(['blobs'], 'readwrite', s => req(s.put({ path, buf, mime }))),
  get: path => run(['blobs'], 'readonly', s => req(s.get(path))),
  del: path => run(['blobs'], 'readwrite', s => req(s.delete(path))),
  keys: () => run(['blobs'], 'readonly', s => req(s.getAllKeys())),
};
export const settingsStore = {
  async get(key, fallback = null) { const r = await run(['settings'], 'readonly', s => req(s.get(key))); return r ? r.value : fallback; },
  set: (key, value) => run(['settings'], 'readwrite', s => req(s.put({ key, value }))),
  all: async () => Object.fromEntries((await run(['settings'], 'readonly', s => req(s.getAll()))).map(r => [r.key, r.value])),
};

/**
 * Apply many writes atomically (all or nothing). Used by restore so a failure leaves existing data untouched.
 * { clear: bool, records: [], media: [], settings: {key: value}, deleteRecordIds: [], deleteMediaIds: [] }
 */
export function applyBatch({ clear = false, records: recs = [], media = [], settings = null, deleteRecordIds = [], deleteMediaIds = [] }) {
  return run(['records', 'media', 'settings'], 'readwrite', async (rs, ms, ss) => {
    const pending = [];
    if (clear) { pending.push(req(rs.clear()), req(ms.clear())); if (settings) pending.push(req(ss.clear())); }
    await Promise.all(pending);
    const writes = [];
    deleteRecordIds.forEach(id => writes.push(req(rs.delete(id))));
    deleteMediaIds.forEach(id => writes.push(req(ms.delete(id))));
    recs.forEach(r => writes.push(req(rs.put(r))));
    media.forEach(m => writes.push(req(ms.put(m))));
    if (settings) Object.entries(settings).forEach(([key, value]) => writes.push(req(ss.put({ key, value }))));
    await Promise.all(writes);
  });
}

export async function clearAllData() {
  await run(['records', 'media', 'settings', 'blobs'], 'readwrite', async (a, b, c, d) => {
    await Promise.all([req(a.clear()), req(b.clear()), req(c.clear()), req(d.clear())]);
  });
}

export async function counts() {
  const all = await records.all();
  const c = { listening: 0, reading: 0, writing1: 0, writing2: 0, speaking: 0 };
  all.forEach(r => { if (r.type in c) c[r.type]++; });
  return c;
}
