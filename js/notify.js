import { addDays } from "./time.js";

export function isUnread(item) {
  if (!item.readAt) return true;
  return (item.updatedAt || "") > item.readAt;
}

export function isUpcomingReminder(item, todayIso) {
  if (!item || item.status === "Siap" || item.remind !== "on") return false;
  return item.date === addDays(todayIso, 2);
}

export function buildNotifications(items, todayIso) {
  const limit = addDays(todayIso, 7);
  const list = [];
  for (const item of items) {
    if (item.status === "Siap") continue;
    if (!item.date) continue;
    let kind = null;
    if (item.date < todayIso) kind = "terlewat";
    else if (item.date === todayIso) kind = "hariini";
    else if (item.time && item.date <= limit) kind = "nanti";
    else if (isUpcomingReminder(item, todayIso)) kind = "nanti";
    if (!kind) continue;
    list.push({ item, kind, unread: isUnread(item) });
  }
  const order = { terlewat: 0, hariini: 1, nanti: 2 };
  list.sort((a, b) => {
    if (order[a.kind] !== order[b.kind]) return order[a.kind] - order[b.kind];
    if (a.unread !== b.unread) return a.unread ? -1 : 1;
    const da = `${a.item.date} ${a.item.time || "99:99"}`;
    const db = `${b.item.date} ${b.item.time || "99:99"}`;
    if (da !== db) return da < db ? -1 : 1;
    return a.item.title.localeCompare(b.item.title, "ms");
  });
  return list;
}

export function unreadCount(items, todayIso) {
  return buildNotifications(items, todayIso).filter((n) => n.unread).length;
}
