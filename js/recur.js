// Item berulang ("Ulang"). Setiap kejadian disimpan sebagai item biasa
// yang berkongsi seriesId; repeat = "weekly|2026-12-31".

export const REPEAT_OPTIONS = [
  { id: "", label: "Tidak" },
  { id: "daily", label: "Setiap hari" },
  { id: "weekly", label: "Setiap minggu" },
  { id: "biweekly", label: "Setiap 2 minggu" },
  { id: "monthly", label: "Setiap bulan" },
];

export const MAX_OCCURRENCES = 100;
const FREQS = ["daily", "weekly", "biweekly", "monthly"];
const ISO = /^\d{4}-\d{2}-\d{2}$/;

function pad(n) {
  return String(n).padStart(2, "0");
}

function daysInMonth(y, m) {
  return new Date(Date.UTC(y, m, 0)).getUTCDate();
}

function shiftDays(iso, n) {
  const [y, m, d] = iso.split("-").map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d + n));
  return `${dt.getUTCFullYear()}-${pad(dt.getUTCMonth() + 1)}-${pad(dt.getUTCDate())}`;
}

// Bulan ke-n dari tarikh mula; 29–31 diapit ke hujung bulan.
function monthStep(iso, n) {
  const [y, m, d] = iso.split("-").map(Number);
  const total = (m - 1) + n;
  const yy = y + Math.floor(total / 12);
  const mm = ((total % 12) + 12) % 12 + 1;
  return `${yy}-${pad(mm)}-${pad(Math.min(d, daysInMonth(yy, mm)))}`;
}

export function parseRepeat(value) {
  const [freq, until] = String(value || "").split("|");
  if (!FREQS.includes(freq) || !ISO.test(until || "")) return null;
  return { freq, until };
}

export function formatRepeat(freq, until) {
  return FREQS.includes(freq) && ISO.test(until || "") ? `${freq}|${until}` : "";
}

export function repeatLabel(value) {
  const rule = parseRepeat(value);
  if (!rule) return "";
  return REPEAT_OPTIONS.find((o) => o.id === rule.freq)?.label || "";
}

// { dates } atau { error: "until_required" | "until_before" | "too_many" }
export function occurrenceDates(start, freq, until, cap = MAX_OCCURRENCES) {
  if (!FREQS.includes(freq)) return { dates: [start] };
  if (!ISO.test(until || "")) return { error: "until_required" };
  if (until < start) return { error: "until_before" };
  const dates = [];
  for (let i = 0; ; i += 1) {
    const iso = freq === "monthly" ? monthStep(start, i)
      : shiftDays(start, i * (freq === "daily" ? 1 : freq === "weekly" ? 7 : 14));
    if (iso > until) break;
    if (dates.length >= cap) return { error: "too_many", cap };
    dates.push(iso);
  }
  return { dates };
}

export function repeatErrorText(error, cap = MAX_OCCURRENCES) {
  if (error === "until_required") return "Pilih tarikh Hingga untuk item berulang.";
  if (error === "until_before") return "Tarikh Hingga mesti selepas tarikh mula.";
  if (error === "too_many") return `Terlalu banyak ulangan (had ${cap}). Pilih tarikh Hingga lebih awal.`;
  return "";
}

// scope "one" = item ini sahaja; "future" = item ini dan selepasnya dalam siri.
export function seriesTargets(items, item, scope) {
  if (!item) return [];
  if (scope !== "future" || !item.seriesId) return items.filter((row) => row.id === item.id);
  return items.filter((row) => row.seriesId === item.seriesId && row.date >= item.date);
}

// Bina item untuk setiap tarikh. base = medan bersama, ids = id sedia ada untuk diguna semula.
export function buildSeries(base, dates, { seriesId, repeat, stamp, newId, firstId }) {
  return dates.map((date, index) => ({
    ...base,
    id: index === 0 && firstId ? firstId : newId(),
    date,
    seriesId,
    repeat,
    status: index === 0 ? base.status : "Belum",
    remindedAt: "",
    readAt: "",
    createdAt: stamp,
    updatedAt: stamp,
  }));
}

export function editedCopy(prev, fields, stamp, keepDate) {
  const next = {
    ...prev,
    ...fields,
    date: keepDate ? prev.date : fields.date,
    status: keepDate ? prev.status : fields.status,
    updatedAt: stamp,
  };
  if (prev.date !== next.date || prev.time !== next.time) next.readAt = "";
  if (prev.date !== next.date || prev.remind !== next.remind) next.remindedAt = "";
  return next;
}

// Kembalikan { upserts, deletes } untuk borang yang dihantar. Logik tulen, diuji.
export function planSave(items, prev, form, scope, { stamp, newId }) {
  const { fields, freq, until } = form;
  const repeat = formatRepeat(freq, until);
  if (!prev) {
    if (!repeat) return { upserts: [{ id: newId(), ...fields, remindedAt: "", readAt: "", createdAt: stamp, updatedAt: stamp, seriesId: "", repeat: "" }], deletes: [] };
    const { dates } = occurrenceDates(fields.date, freq, until);
    return { upserts: buildSeries(fields, dates, { seriesId: newId(), repeat, stamp, newId }), deletes: [] };
  }
  if (!prev.seriesId) {
    if (!repeat) return { upserts: [editedCopy(prev, fields, stamp, false)], deletes: [] };
    const { dates } = occurrenceDates(fields.date, freq, until);
    const series = buildSeries(fields, dates, { seriesId: newId(), repeat, stamp, newId, firstId: prev.id });
    series[0] = { ...editedCopy(prev, fields, stamp, false), seriesId: series[0].seriesId, repeat };
    return { upserts: series, deletes: [] };
  }
  if (scope !== "future") return { upserts: [editedCopy(prev, fields, stamp, false)], deletes: [] };
  const targets = seriesTargets(items, prev, "future");
  const others = targets.filter((row) => row.id !== prev.id).map((row) => row.id);
  if (!repeat) {
    return { upserts: [{ ...editedCopy(prev, fields, stamp, false), seriesId: "", repeat: "" }], deletes: others };
  }
  if (fields.date === prev.date && repeat === prev.repeat) {
    const upserts = targets.map((row) => (row.id === prev.id
      ? editedCopy(row, fields, stamp, false)
      : editedCopy(row, fields, stamp, true)));
    return { upserts, deletes: [] };
  }
  const { dates } = occurrenceDates(fields.date, freq, until);
  const series = buildSeries(fields, dates, { seriesId: prev.seriesId, repeat, stamp, newId, firstId: prev.id });
  series[0] = { ...editedCopy(prev, fields, stamp, false), repeat };
  return { upserts: series, deletes: others };
}

