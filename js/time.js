export const TZ = "Asia/Kuala_Lumpur";

export const MONTHS = [
  "Januari", "Februari", "Mac", "April", "Mei", "Jun",
  "Julai", "Ogos", "September", "Oktober", "November", "Disember",
];

export const MONTHS_SHORT = [
  "Jan", "Feb", "Mac", "Apr", "Mei", "Jun",
  "Jul", "Ogo", "Sep", "Okt", "Nov", "Dis",
];

export const WEEKDAYS = ["Ahad", "Isnin", "Selasa", "Rabu", "Khamis", "Jumaat", "Sabtu"];
export const WEEKDAYS_MON = ["Isn", "Sel", "Rab", "Kha", "Jum", "Sab", "Ahd"];

export function pad(n) {
  return String(n).padStart(2, "0");
}

export function klParts(date = new Date()) {
  const fmt = new Intl.DateTimeFormat("en-US", {
    timeZone: TZ,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hourCycle: "h23",
  });
  const bag = {};
  for (const part of fmt.formatToParts(date)) bag[part.type] = part.value;
  if (bag.hour === "24") bag.hour = "00";
  return bag;
}

export function todayISO(date = new Date()) {
  const p = klParts(date);
  return `${p.year}-${p.month}-${p.day}`;
}

export function nowIsoKL(date = new Date()) {
  const p = klParts(date);
  return `${p.year}-${p.month}-${p.day}T${p.hour}:${p.minute}:${p.second}+08:00`;
}

export function weekdaySun0(iso) {
  const [y, m, d] = iso.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d)).getUTCDay();
}

export function addDays(iso, days) {
  const [y, m, d] = iso.split("-").map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d + days));
  return `${dt.getUTCFullYear()}-${pad(dt.getUTCMonth() + 1)}-${pad(dt.getUTCDate())}`;
}

export function addMonths(iso, delta) {
  const [y, m, d] = iso.split("-").map(Number);
  const dt = new Date(Date.UTC(y, m - 1 + delta, 1));
  const dim = new Date(Date.UTC(dt.getUTCFullYear(), dt.getUTCMonth() + 1, 0)).getUTCDate();
  const day = Math.min(d, dim);
  return `${dt.getUTCFullYear()}-${pad(dt.getUTCMonth() + 1)}-${pad(day)}`;
}

export function startOfWeek(iso) {
  const js = weekdaySun0(iso);
  const delta = js === 0 ? -6 : 1 - js;
  return addDays(iso, delta);
}

export function monthMatrix(iso) {
  const [y, m] = iso.split("-").map(Number);
  const first = `${y}-${pad(m)}-01`;
  const start = startOfWeek(first);
  const lastDate = new Date(Date.UTC(y, m, 0)).getUTCDate();
  const lastIso = `${y}-${pad(m)}-${pad(lastDate)}`;
  const end = addDays(startOfWeek(lastIso), 6);
  const days = [];
  for (let cur = start; cur <= end; cur = addDays(cur, 1)) days.push(cur);
  return days;
}

export function formatMonthTitle(iso) {
  const [y, m] = iso.split("-").map(Number);
  return `${MONTHS[m - 1]} ${y}`;
}

export function formatWeekTitle(iso) {
  const start = startOfWeek(iso);
  const end = addDays(start, 6);
  const [y1, m1, d1] = start.split("-").map(Number);
  const [y2, m2, d2] = end.split("-").map(Number);
  if (m1 === m2 && y1 === y2) return `${d1}–${d2} ${MONTHS_SHORT[m1 - 1]} ${y1}`;
  if (y1 === y2) return `${d1} ${MONTHS_SHORT[m1 - 1]} – ${d2} ${MONTHS_SHORT[m2 - 1]} ${y1}`;
  return `${d1} ${MONTHS_SHORT[m1 - 1]} ${y1} – ${d2} ${MONTHS_SHORT[m2 - 1]} ${y2}`;
}

export function formatDayHeading(iso) {
  const [y, m, d] = iso.split("-").map(Number);
  const wd = WEEKDAYS[weekdaySun0(iso)];
  return `${wd}, ${d} ${MONTHS_SHORT[m - 1]}`;
}

export function formatListHeading(iso) {
  const [, m, d] = iso.split("-").map(Number);
  const wd = WEEKDAYS[weekdaySun0(iso)];
  return `${wd}, ${Number(d)} ${MONTHS[m - 1]}`;
}

export function formatShortDate(iso) {
  const [, m, d] = iso.split("-").map(Number);
  return `${Number(d)} ${MONTHS_SHORT[m - 1]}`;
}
