// IndexedDB abstraction layer — raw window.indexedDB, versioned migrations, persistence request.
const NAME = 'safescada-hse';
const VERSION = 1;
export const STORES = ['audits', 'hazards', 'capas', 'meta'];
let _db = null;

function migrate(db, oldVersion, tx) {
  if (oldVersion < 1) {
    const a = db.createObjectStore('audits', { keyPath: 'id' });
    a.createIndex('facility', 'facility'); a.createIndex('ts', 'ts');
    const h = db.createObjectStore('hazards', { keyPath: 'id' });
    h.createIndex('facility', 'facility'); h.createIndex('ts', 'ts');
    const c = db.createObjectStore('capas', { keyPath: 'id' });
    c.createIndex('facility', 'facility'); c.createIndex('status', 'status'); c.createIndex('due', 'due');
    db.createObjectStore('meta', { keyPath: 'key' });
  }
  // Future migrations: if (oldVersion < 2) { ...add stores/indexes using `tx.objectStore(...)`; transform records... }
}

export function open() {
  if (_db) return Promise.resolve(_db);
  return new Promise((resolve, reject) => {
    if (!('indexedDB' in window)) return reject(new Error('IndexedDB not supported'));
    const req = indexedDB.open(NAME, VERSION);
    req.onupgradeneeded = (e) => migrate(req.result, e.oldVersion, req.transaction);
    req.onsuccess = () => {
      _db = req.result;
      _db.onversionchange = () => { _db.close(); _db = null; };
      _db.onclose = () => { _db = null; };
      resolve(_db);
    };
    req.onerror = () => reject(req.error);
    req.onblocked = () => reject(new Error('Database upgrade blocked — close other tabs of this app.'));
  });
}

async function run(store, mode, fn) {
  const db = await open();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(store, mode);
    const s = tx.objectStore(store);
    let result;
    const r = fn(s);
    if (r && 'onsuccess' in r) r.onsuccess = () => { result = r.result; };
    tx.oncomplete = () => resolve(result);
    tx.onerror = () => reject(tx.error);
    tx.onabort = () => reject(tx.error || new Error('Transaction aborted (quota exceeded?)'));
  });
}

export const getAll = (store) => run(store, 'readonly', (s) => s.getAll());
export const get = (store, key) => run(store, 'readonly', (s) => s.get(key));
export const put = (store, value) => run(store, 'readwrite', (s) => s.put(value));
export const del = (store, key) => run(store, 'readwrite', (s) => s.delete(key));
export const count = (store) => run(store, 'readonly', (s) => s.count());
export const clear = (store) => run(store, 'readwrite', (s) => s.clear());
export const getByIndex = (store, index, value) => run(store, 'readonly', (s) => s.index(index).getAll(value));

export async function putMany(store, values) {
  const db = await open();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(store, 'readwrite');
    const s = tx.objectStore(store);
    values.forEach((v) => s.put(v));
    tx.oncomplete = () => resolve(values.length);
    tx.onerror = () => reject(tx.error);
    tx.onabort = () => reject(tx.error || new Error('Transaction aborted'));
  });
}

export async function getMeta(key, fallback = null) {
  const r = await get('meta', key);
  return r ? r.value : fallback;
}
export const setMeta = (key, value) => put('meta', { key, value });

export async function requestPersistence() {
  if (!navigator.storage || !navigator.storage.persist) return { supported: false, persisted: false };
  let persisted = await navigator.storage.persisted();
  if (!persisted) persisted = await navigator.storage.persist();
  return { supported: true, persisted };
}

export async function storageEstimate() {
  if (!navigator.storage || !navigator.storage.estimate) return null;
  const e = await navigator.storage.estimate();
  const persisted = navigator.storage.persisted ? await navigator.storage.persisted() : false;
  return { usage: e.usage || 0, quota: e.quota || 0, persisted };
}

export async function exportAll() {
  const out = { app: 'safescada-hse-audit', schema: VERSION, exportedAt: new Date().toISOString(), stores: {} };
  for (const s of STORES) out.stores[s] = await getAll(s);
  out.stores.meta = out.stores.meta.filter((m) => !String(m.key).startsWith('draft:'));
  return out;
}

export async function importAll(data) {
  if (!data || data.app !== 'safescada-hse-audit' || !data.stores) throw new Error('Not a SafeSCADA HSE backup file.');
  const res = {};
  for (const s of STORES) {
    const rows = Array.isArray(data.stores[s]) ? data.stores[s] : [];
    const key = s === 'meta' ? 'key' : 'id';
    const valid = rows.filter((r) => r && r[key] !== undefined && !String(r[key]).startsWith('draft:'));
    res[s] = await putMany(s, valid);
  }
  return res;
}
