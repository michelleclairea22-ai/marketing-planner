import { isSampleId, normalizeItem, withoutSamples } from "./model.js";

const ITEMS = "cp.items.v1";
const SETTINGS = "cp.settings.v1";
const TOMBS = "cp.tombstones.v1";
const OUTBOX = "cp.outbox.v1";
const SEEDED = "cp.seeded.v1";
const SAMPLES_REMOVED = "cp.samplesRemoved.v1";

function readJSON(key, fallback) {
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return fallback;
    return JSON.parse(raw);
  } catch {
    return fallback;
  }
}

export function loadSettings() {
  const raw = readJSON(SETTINGS, {});
  return {
    webAppUrl: String(raw.webAppUrl || "").trim(),
    accessKey: String(raw.accessKey || ""),
  };
}

export function saveSettings(settings) {
  localStorage.setItem(SETTINGS, JSON.stringify({
    webAppUrl: String(settings.webAppUrl || "").trim(),
    accessKey: String(settings.accessKey || ""),
  }));
}

export function isConfigured(settings) {
  return Boolean(settings?.webAppUrl && settings?.accessKey);
}

export function loadItems() {
  const raw = readJSON(ITEMS, []);
  if (!Array.isArray(raw)) return [];
  return raw.map(normalizeItem).filter(Boolean);
}

export function saveItems(items) {
  localStorage.setItem(ITEMS, JSON.stringify(items));
}

export function loadTombs() {
  const raw = readJSON(TOMBS, {});
  return raw && typeof raw === "object" ? raw : {};
}

export function saveTombs(tombs) {
  localStorage.setItem(TOMBS, JSON.stringify(tombs));
}

export function loadOutbox() {
  const raw = readJSON(OUTBOX, []);
  return Array.isArray(raw) ? raw : [];
}

export function saveOutbox(ops) {
  localStorage.setItem(OUTBOX, JSON.stringify(ops));
}

function outboxWithoutSamples(ops) {
  const next = [];
  for (const op of ops) {
    if (!op || typeof op !== "object") continue;
    if (op.op === "upsert" && isSampleId(op.item?.id)) continue;
    if (op.op === "delete" && isSampleId(op.id)) continue;
    if (op.op === "markAllRead" && Array.isArray(op.ids)) {
      const ids = op.ids.filter((id) => !isSampleId(id));
      if (!ids.length) continue;
      next.push(ids.length === op.ids.length ? op : { ...op, ids });
      continue;
    }
    next.push(op);
  }
  return next;
}

export function discardSampleQueue() {
  const box = loadOutbox();
  const next = outboxWithoutSamples(box);
  if (JSON.stringify(next) !== JSON.stringify(box)) saveOutbox(next);
  return next;
}

// Drop old demo rows (seed-01 … seed-12) and never insert them again.
export function purgeSampleData() {
  const items = loadItems();
  const kept = withoutSamples(items);
  if (kept.length !== items.length) saveItems(kept);
  discardSampleQueue();
  const tombs = loadTombs();
  let tombChanged = false;
  for (const id of Object.keys(tombs)) {
    if (isSampleId(id)) {
      delete tombs[id];
      tombChanged = true;
    }
  }
  if (tombChanged) saveTombs(tombs);
  try {
    localStorage.removeItem(SEEDED);
  } catch {
    // Ignore a locked or missing store.
  }
  if (!localStorage.getItem(SAMPLES_REMOVED)) localStorage.setItem(SAMPLES_REMOVED, "1");
  return kept;
}

export function clearLocalData() {
  saveItems([]);
  saveTombs({});
  saveOutbox([]);
  if (!localStorage.getItem(SAMPLES_REMOVED)) localStorage.setItem(SAMPLES_REMOVED, "1");
}
