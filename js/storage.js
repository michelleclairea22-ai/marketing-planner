import { makeSeed, normalizeItem } from "./model.js";
import { nowIsoKL, todayISO } from "./time.js";

const ITEMS = "cp.items.v1";
const SETTINGS = "cp.settings.v1";
const TOMBS = "cp.tombstones.v1";
const OUTBOX = "cp.outbox.v1";
const SEEDED = "cp.seeded.v1";

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

export function ensureSeeded() {
  if (localStorage.getItem(SEEDED)) return loadItems();
  if (localStorage.getItem(ITEMS)) {
    localStorage.setItem(SEEDED, "1");
    return loadItems();
  }
  const items = makeSeed(todayISO(), nowIsoKL());
  saveItems(items);
  localStorage.setItem(SEEDED, "1");
  return items;
}

export function markSeeded() {
  localStorage.setItem(SEEDED, "1");
}

export function clearLocalData() {
  saveItems([]);
  saveTombs({});
  saveOutbox([]);
  markSeeded();
}
