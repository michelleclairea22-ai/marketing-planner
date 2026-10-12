// Small IndexedDB key/value store for note images (data URLs).
// Keys: "o:<imageId>" original, "a:<imageId>" annotation layer. Value: { dataUrl, fileId }.
// Falls back to an in-memory map when IndexedDB is unavailable.

const DB = "cp-notes";
const STORE = "images";
let dbPromise = null;
const mem = new Map();

function open() {
  if (dbPromise) return dbPromise;
  dbPromise = new Promise((resolve) => {
    if (!globalThis.indexedDB) return resolve(null);
    try {
      const req = indexedDB.open(DB, 1);
      req.onupgradeneeded = () => req.result.createObjectStore(STORE);
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => resolve(null);
    } catch {
      resolve(null);
    }
  });
  return dbPromise;
}

function tx(mode, fn) {
  return open().then((db) => new Promise((resolve) => {
    if (!db) return resolve(fn(null));
    const t = db.transaction(STORE, mode);
    const req = fn(t.objectStore(STORE));
    t.oncomplete = () => resolve(req?.result);
    t.onerror = () => resolve(undefined);
    t.onabort = () => resolve(undefined);
  }));
}

export async function imgGet(key) {
  const db = await open();
  if (!db) return mem.get(key);
  return tx("readonly", (s) => s.get(key));
}

export async function imgPut(key, value) {
  const db = await open();
  if (!db) { mem.set(key, value); return; }
  await tx("readwrite", (s) => s.put(value, key));
}

export async function imgDel(key) {
  const db = await open();
  if (!db) { mem.delete(key); return; }
  await tx("readwrite", (s) => s.delete(key));
}

export async function imgKeys() {
  const db = await open();
  if (!db) return [...mem.keys()];
  return (await tx("readonly", (s) => s.getAllKeys())) || [];
}

export async function imgClear() {
  const db = await open();
  if (!db) { mem.clear(); return; }
  await tx("readwrite", (s) => s.clear());
}
