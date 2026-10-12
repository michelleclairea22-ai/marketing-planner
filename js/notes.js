// Nota: pure logic (no DOM). Notes metadata lives in localStorage; image data lives in IndexedDB (imgstore.js).
import { BRANDS } from "./model.js";

const ID_RE = /^[A-Za-z0-9_-]{1,80}$/;
export const MAX_EDGE = 1600;

export function normalizeImage(raw) {
  if (!raw || typeof raw !== "object") return null;
  const id = String(raw.id || "").trim();
  if (!ID_RE.test(id)) return null;
  return {
    id,
    fileId: String(raw.fileId || "").trim(),
    annotFileId: String(raw.annotFileId || "").trim(),
    w: Math.max(0, Math.round(Number(raw.w) || 0)),
    h: Math.max(0, Math.round(Number(raw.h) || 0)),
  };
}

export function normalizeNote(raw) {
  if (!raw || typeof raw !== "object") return null;
  const id = String(raw.id || "").trim();
  if (!ID_RE.test(id)) return null;
  let images = raw.images;
  if (typeof images === "string") {
    try { images = JSON.parse(images || "[]"); } catch { images = []; }
  }
  if (!Array.isArray(images)) images = [];
  const brand = BRANDS.some((b) => b.id === raw.brand) ? raw.brand : "";
  return {
    id,
    title: String(raw.title || "").trim().slice(0, 200),
    brand,
    body: String(raw.body || "").slice(0, 20000),
    images: images.map(normalizeImage).filter(Boolean),
    createdAt: String(raw.createdAt || ""),
    updatedAt: String(raw.updatedAt || ""),
  };
}

// Last-write-wins by updatedAt, same rules as mergeItems (local wins a tie).
export function mergeNotes(local, server, tombstones = {}) {
  const map = new Map();
  const add = (raw, preferOnTie) => {
    const note = normalizeNote(raw);
    if (!note) return;
    const dead = tombstones[note.id];
    if (dead && dead >= (note.updatedAt || "")) return;
    const prev = map.get(note.id);
    if (!prev) map.set(note.id, note);
    else if (preferOnTie ? (note.updatedAt || "") >= (prev.updatedAt || "") : (note.updatedAt || "") > (prev.updatedAt || "")) map.set(note.id, note);
  };
  for (const raw of server) add(raw, false);
  for (const raw of local) add(raw, true);
  return [...map.values()];
}

export function sortNotes(notes) {
  return [...notes].sort((a, b) => (b.updatedAt || "").localeCompare(a.updatedAt || "") || a.title.localeCompare(b.title));
}

export function noteTitle(note) {
  if (note.title) return note.title;
  const first = String(note.body || "").split("\n").map((s) => s.trim()).find(Boolean);
  return first ? first.slice(0, 60) : "Nota tanpa tajuk";
}

// Scale (w,h) so the long edge is at most max. Never upscales.
export function fitSize(w, h, max = MAX_EDGE) {
  w = Math.max(1, Math.round(Number(w) || 1));
  h = Math.max(1, Math.round(Number(h) || 1));
  const long = Math.max(w, h);
  if (long <= max) return { w, h, scale: 1 };
  const scale = max / long;
  return { w: Math.max(1, Math.round(w * scale)), h: Math.max(1, Math.round(h * scale)), scale };
}

// Fit an image box inside the available screen box (CSS px), keeping aspect ratio.
export function fitInto(w, h, boxW, boxH) {
  const scale = Math.min(boxW / w, boxH / h);
  return { w: Math.max(1, Math.floor(w * scale)), h: Math.max(1, Math.floor(h * scale)), scale };
}

// Convert a client point to image-space coordinates.
export function toImageSpace(clientX, clientY, rect, imgW, imgH) {
  return {
    x: ((clientX - rect.left) / rect.width) * imgW,
    y: ((clientY - rect.top) / rect.height) * imgH,
  };
}

// Pen widths are given in "screen" px and scaled to image space so they look the same on any device.
export function strokeWidth(sizePx, displayScale) {
  return Math.max(1, sizePx / (displayScale || 1));
}

// Which file ids are referenced by a note list (for cache cleanup).
export function referencedImageIds(notes) {
  const ids = new Set();
  for (const note of notes) for (const img of note.images || []) ids.add(img.id);
  return ids;
}

// Images that still need upload (original or annotation stored only locally).
export function pendingUploads(note, hasLocal) {
  const out = [];
  for (const img of note.images || []) {
    if (!img.fileId && hasLocal(`o:${img.id}`)) out.push({ img, kind: "o" });
    if (!img.annotFileId && hasLocal(`a:${img.id}`)) out.push({ img, kind: "a" });
  }
  return out;
}

// Zoom/pan view for the drawing editor: frame top-left at (x, y) inside the stage, scaled by z.
export const ZOOM_MIN = 1;
export const ZOOM_MAX = 6;

export function clampZoom(z) {
  return Math.min(ZOOM_MAX, Math.max(ZOOM_MIN, z));
}

// Zoom to z keeping the stage point (cx, cy) fixed over the same image spot.
export function zoomAt(view, z, cx, cy) {
  const nz = clampZoom(z);
  return { z: nz, x: cx - ((cx - view.x) / view.z) * nz, y: cy - ((cy - view.y) / view.z) * nz };
}

// Keep the scaled frame (fw×fh at z=1) covering the stage, or centred when smaller.
export function clampView(view, fw, fh, sw, sh) {
  const axis = (pos, size, stage) => {
    const s = size * view.z;
    if (s <= stage) return (stage - s) / 2;
    return Math.min(0, Math.max(stage - s, pos));
  };
  return { z: view.z, x: axis(view.x, fw, sw), y: axis(view.y, fh, sh) };
}

// Stage point -> image coordinates for a view (frame fw wide at z=1 shows imgW pixels).
export function stageToImage(sx, sy, view, fw, fh, imgW, imgH) {
  return { x: ((sx - view.x) / (fw * view.z)) * imgW, y: ((sy - view.y) / (fh * view.z)) * imgH };
}
