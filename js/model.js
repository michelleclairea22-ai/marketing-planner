import { addDays } from "./time.js";

export const BRANDS = [
  { id: "Brutti", color: "#FF6B4A" },
  { id: "Selesaai", color: "#3DDC97" },
  { id: "Tumbooh", color: "#3B82F6" },
  { id: "Badax", color: "#F5B942" },
  { id: "Saja", color: "#A78BFA" },
  { id: "Umum", color: "#8B8B8B" },
];

export const TYPES = [
  { id: "Task", label: "Tugasan" },
  { id: "Event", label: "Acara" },
  { id: "Notes", label: "Nota" },
  { id: "Posting", label: "Posting" },
];

export function brandColor(id) {
  return BRANDS.find((b) => b.id === id)?.color || "#8B8B8B";
}

export function typeLabel(id) {
  return TYPES.find((t) => t.id === id)?.label || id || "";
}

export function esc(s) {
  return String(s ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

export function newId() {
  if (globalThis.crypto?.randomUUID) return crypto.randomUUID();
  return `id-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

export function normalizeItem(raw) {
  if (!raw || typeof raw !== "object") return null;
  const id = String(raw.id || "").trim();
  const title = String(raw.title || "").trim();
  const date = String(raw.date || "").slice(0, 10);
  if (!id || !title || !/^\d{4}-\d{2}-\d{2}$/.test(date)) return null;
  const type = TYPES.some((t) => t.id === raw.type) ? raw.type : "Task";
  const brand = BRANDS.some((b) => b.id === raw.brand) ? raw.brand : "Umum";
  const status = raw.status === "Siap" ? "Siap" : "Belum";
  let time = String(raw.time || "").trim();
  if (time && !/^\d{2}:\d{2}$/.test(time)) time = "";
  return {
    id,
    title,
    type,
    brand,
    date,
    time,
    notes: String(raw.notes || ""),
    status,
    remind: raw.remind === "on" ? "on" : "off",
    remindedAt: String(raw.remindedAt || ""),
    readAt: String(raw.readAt || ""),
    createdAt: String(raw.createdAt || ""),
    updatedAt: String(raw.updatedAt || ""),
  };
}

export function passFilter(item, filters) {
  if (filters.brand && filters.brand !== "Semua" && item.brand !== filters.brand) return false;
  if (filters.type && filters.type !== "Semua" && item.type !== filters.type) return false;
  if (filters.status && filters.status !== "Semua" && item.status !== filters.status) return false;
  const q = (filters.q || "").trim().toLowerCase();
  if (q && !item.title.toLowerCase().includes(q)) return false;
  return true;
}

export function sortForDay(items) {
  return [...items].sort((a, b) => {
    const ta = a.time || "99:99";
    const tb = b.time || "99:99";
    if (ta !== tb) return ta < tb ? -1 : 1;
    return a.title.localeCompare(b.title, "ms");
  });
}

export function sortForList(items) {
  return [...items].sort((a, b) => {
    if (a.status !== b.status) return a.status === "Belum" ? -1 : 1;
    const ta = a.time || "99:99";
    const tb = b.time || "99:99";
    if (ta !== tb) return ta < tb ? -1 : 1;
    return a.title.localeCompare(b.title, "ms");
  });
}

export function mergeItems(local, server, tombstones = {}) {
  const map = new Map();
  for (const raw of server) {
    const item = normalizeItem(raw);
    if (!item) continue;
    const dead = tombstones[item.id];
    if (dead && dead >= (item.updatedAt || "")) continue;
    map.set(item.id, item);
  }
  for (const raw of local) {
    const item = normalizeItem(raw);
    if (!item) continue;
    const dead = tombstones[item.id];
    if (dead && dead >= (item.updatedAt || "")) continue;
    const prev = map.get(item.id);
    if (!prev || (item.updatedAt || "") >= (prev.updatedAt || "")) map.set(item.id, item);
  }
  return [...map.values()];
}

export function makeSeed(today, stamp) {
  const at = (n) => addDays(today, n);
  const row = (partial) => ({
    notes: "",
    remind: "off",
    remindedAt: "",
    readAt: "",
    createdAt: stamp,
    updatedAt: stamp,
    time: "",
    status: "Belum",
    ...partial,
  });
  return [
    row({
      id: "seed-01",
      title: "Reel produk baru",
      type: "Posting",
      brand: "Brutti",
      date: at(0),
      time: "09:00",
      remind: "on",
      notes: "Hook 3 saat pertama. CTA link di bio.",
    }),
    row({
      id: "seed-02",
      title: "Balas komen Shopee",
      type: "Task",
      brand: "Selesaai",
      date: at(0),
      time: "14:30",
      remind: "on",
      readAt: stamp,
      notes: "Utamakan soalan saiz.",
    }),
    row({
      id: "seed-03",
      title: "Live petang",
      type: "Event",
      brand: "Tumbooh",
      date: at(0),
      time: "20:00",
      remind: "on",
      notes: "Set lampu sebelum 7.45 malam.",
    }),
    row({
      id: "seed-04",
      title: "Caption cerita harian",
      type: "Notes",
      brand: "Umum",
      date: at(0),
      status: "Siap",
      readAt: stamp,
    }),
    row({
      id: "seed-05",
      title: "Edit video testimoni",
      type: "Task",
      brand: "Badax",
      date: at(-1),
      time: "16:00",
      notes: "Potong bahagian senyap.",
    }),
    row({
      id: "seed-06",
      title: "Balas DM pelanggan",
      type: "Task",
      brand: "Saja",
      date: at(-2),
      time: "11:00",
    }),
    row({
      id: "seed-07",
      title: "Siapkan brief minggu ni",
      type: "Task",
      brand: "Tumbooh",
      date: at(-4),
      status: "Siap",
      readAt: stamp,
    }),
    row({
      id: "seed-08",
      title: "Story behind the scene",
      type: "Posting",
      brand: "Saja",
      date: at(1),
      time: "11:00",
      remind: "on",
    }),
    row({
      id: "seed-09",
      title: "Moodboard warna musim",
      type: "Notes",
      brand: "Badax",
      date: at(2),
    }),
    row({
      id: "seed-10",
      title: "Jadual posting bulan ni",
      type: "Notes",
      brand: "Umum",
      date: at(3),
      time: "09:30",
      remind: "on",
    }),
    row({
      id: "seed-11",
      title: "Pop-up Imago",
      type: "Event",
      brand: "Brutti",
      date: at(5),
      time: "10:00",
      remind: "on",
      notes: "Bawa stok saiz S hingga L.",
    }),
    row({
      id: "seed-12",
      title: "Carousel tips rumah kemas",
      type: "Posting",
      brand: "Selesaai",
      date: at(6),
      time: "18:30",
      remind: "on",
    }),
  ];
}
