import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { isSampleId, makeSeed, mergeItems, normalizeItem, passFilter, sortForList, withoutSamples, SAMPLE_IDS } from "../js/model.js";
import { clearLocalData, loadItems, loadOutbox, loadTombs, purgeSampleData, saveItems, saveOutbox, saveTombs } from "../js/storage.js";
import { buildNotifications, isUnread, isUpcomingReminder, unreadCount } from "../js/notify.js";
import {
  addDays,
  addMonths,
  formatDayHeading,
  monthMatrix,
  nowIsoKL,
  startOfWeek,
  todayISO,
} from "../js/time.js";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

function extractFunction(src, name) {
  const token = `function ${name}(`;
  const start = src.indexOf(token);
  assert.notEqual(start, -1, `missing ${name}`);
  let i = src.indexOf("{", start);
  let depth = 0;
  for (; i < src.length; i += 1) {
    const ch = src[i];
    if (ch === "{") depth += 1;
    else if (ch === "}") {
      depth -= 1;
      if (depth === 0) return src.slice(start, i + 1);
    }
  }
  throw new Error(`unclosed ${name}`);
}

function loadGas() {
  const src = fs.readFileSync(path.join(root, "apps-script/Code.gs"), "utf8");
  const names = [
    "isIsoDate_",
    "addIsoDays_",
    "alreadyRemindedFor_",
    "shouldRemindItem",
    "selectTwoDayReminders",
    "typeLabel_",
    "formatMalayDate_",
    "oneLine_",
    "normalizeRepeat_",
    "normalizeSeriesId_",
    "missingHeaders_",
  ];
  const headers = src.slice(src.indexOf("var HEADERS"), src.indexOf("];", src.indexOf("var HEADERS")) + 2);
  const body = headers + "\n" + names.map((name) => extractFunction(src, name)).join("\n");
  return new Function(`${body}\nreturn { ${names.join(", ")} };`)();
}

const gas = loadGas();

function reminderItem(extra = {}) {
  return {
    id: "abc",
    remind: "on",
    remindedAt: "",
    status: "Belum",
    date: "2026-10-10",
    time: "09:00",
    title: "Reel",
    brand: "Brutti",
    type: "Posting",
    notes: "Hook",
    ...extra,
  };
}

// 8 Oct 2026 is Thursday, 00:30 in Kuala Lumpur.
assert.equal(todayISO(new Date("2026-10-07T16:30:00Z")), "2026-10-08");
assert.equal(todayISO(new Date("2026-10-07T15:30:00Z")), "2026-10-07");
assert.equal(nowIsoKL(new Date("2026-10-07T16:30:00Z")), "2026-10-08T00:30:00+08:00");
assert.equal(formatDayHeading("2026-10-08"), "Khamis, 8 Okt");
assert.equal(startOfWeek("2026-10-01"), "2026-09-28");
assert.equal(startOfWeek("2026-10-04"), "2026-09-28");
assert.equal(addDays("2026-10-31", 1), "2026-11-01");
assert.equal(addMonths("2026-10-31", 1), "2026-11-30");
assert.equal(addMonths("2026-03-31", -1), "2026-02-28");

const october = monthMatrix("2026-10-08");
assert.equal(october.length % 7, 0);
assert.equal(october[0], "2026-09-28");
assert.equal(october.at(-1), "2026-11-01");

assert.equal(gas.formatMalayDate_("2026-10-08"), "Khamis, 8 Oktober 2026");
assert.equal(gas.addIsoDays_("2026-10-08", 2), "2026-10-10");
assert.equal(gas.addIsoDays_("2026-10-31", 2), "2026-11-02");
assert.equal(gas.addIsoDays_("2026-12-30", 2), "2027-01-01");
assert.equal(gas.addIsoDays_("2024-02-28", 1), "2024-02-29");
assert.equal(gas.addIsoDays_("bukan-tarikh", 2), "");

const target = reminderItem();
assert.equal(gas.shouldRemindItem(target, "2026-10-08"), true);
assert.equal(gas.shouldRemindItem(reminderItem({ time: "" }), "2026-10-08"), true);
assert.equal(gas.shouldRemindItem(target, "2026-10-09"), false);
assert.equal(gas.shouldRemindItem(target, "2026-10-07"), false);
assert.equal(gas.shouldRemindItem(reminderItem({ remind: "off" }), "2026-10-08"), false);
assert.equal(gas.shouldRemindItem(reminderItem({ status: "Siap" }), "2026-10-08"), false);
assert.equal(gas.shouldRemindItem(reminderItem({ date: "2026-11-01" }), "2026-10-30"), true);
assert.equal(gas.alreadyRemindedFor_("", "2026-10-10"), false);
assert.equal(gas.alreadyRemindedFor_("2026-10-10", "2026-10-10"), true);
assert.equal(gas.alreadyRemindedFor_("2026-10-10", "2026-10-12"), false);
assert.equal(gas.alreadyRemindedFor_("2026-10-08T09:00:00+08:00", "2026-10-10"), false);
assert.equal(gas.alreadyRemindedFor_("2026-10-10T09:05:00+08:00", "2026-10-10"), true);
assert.equal(gas.shouldRemindItem(reminderItem({ remindedAt: "2026-10-10" }), "2026-10-08"), false);
assert.equal(gas.shouldRemindItem(reminderItem({ date: "2026-10-12", remindedAt: "2026-10-10" }), "2026-10-10"), true);

const picked = gas.selectTwoDayReminders([
  target,
  reminderItem({ id: "off", remind: "off" }),
  reminderItem({ id: "done", status: "Siap" }),
  reminderItem({ id: "later", date: "2026-10-11" }),
  reminderItem({ id: "notime", time: "", title: "Tanpa" }),
  reminderItem({ id: "sent", remindedAt: "2026-10-10" }),
], "2026-10-08");
assert.deepEqual(picked.map((item) => item.id), ["abc", "notime"]);

// Lajur baharu untuk item berulang, ditambah di hujung helaian lama.
const oldHeaders = ["id", "title", "type", "brand", "date", "time", "notes", "status", "remind", "remindedAt", "readAt", "createdAt", "updatedAt"];
assert.deepEqual(gas.missingHeaders_(oldHeaders), ["seriesId", "repeat"]);
assert.deepEqual(gas.missingHeaders_([...oldHeaders, "seriesId", "repeat"]), []);
assert.deepEqual(gas.missingHeaders_([...oldHeaders, "lain", "repeat"]), ["seriesId"]);
assert.equal(gas.normalizeRepeat_("weekly|2026-12-31"), "weekly|2026-12-31");
assert.equal(gas.normalizeRepeat_("biweekly|2026-12-31"), "biweekly|2026-12-31");
assert.equal(gas.normalizeRepeat_("yearly|2026-12-31"), "");
assert.equal(gas.normalizeRepeat_("weekly"), "");
assert.equal(gas.normalizeSeriesId_("abc-1_2"), "abc-1_2");
assert.equal(gas.normalizeSeriesId_("a b"), "");

const today = "2026-10-08";
const stamp = "2026-10-08T08:00:00+08:00";
const seed = makeSeed(today, stamp).map(normalizeItem);
assert.equal(seed.length, 12);
assert.ok(seed.every(Boolean));
const notes = buildNotifications(seed, today);
assert.ok(notes.some((entry) => entry.kind === "terlewat" && entry.item.id === "seed-05"));
assert.ok(notes.every((entry) => entry.item.status !== "Siap"));
assert.ok(!notes.some((entry) => entry.item.id === "seed-09"));
assert.equal(isUpcomingReminder(seed.find((item) => item.id === "seed-09"), today), false);
const twoDay = normalizeItem({
  id: "plain-2",
  title: "Tanpa masa",
  type: "Task",
  brand: "Umum",
  date: "2026-10-10",
  time: "",
  status: "Belum",
  remind: "on",
  updatedAt: stamp,
});
assert.equal(isUpcomingReminder(twoDay, today), true);
assert.ok(buildNotifications([twoDay], today).some((entry) => entry.item.id === "plain-2" && entry.kind === "nanti"));
assert.equal(buildNotifications([{ ...twoDay, status: "Siap" }], today).length, 0);
assert.equal(buildNotifications([{ ...twoDay, remind: "off" }], today).length, 0);
assert.equal(buildNotifications([{ ...twoDay, date: "2026-10-09" }], today).length, 0);
assert.ok(buildNotifications([reminderItem({ id: "timed-2", remind: "off", date: "2026-10-10" })], today).some((entry) => entry.item.id === "timed-2"));
assert.ok(notes.some((entry) => entry.item.id === "seed-02" && entry.unread === false));
assert.equal(isUnread(seed.find((item) => item.id === "seed-01")), true);
assert.equal(unreadCount(seed, today), notes.filter((entry) => entry.unread).length);
const edited = { ...seed.find((item) => item.id === "seed-02"), updatedAt: "2026-10-08T09:00:00+08:00" };
assert.equal(isUnread(edited), true);

const list = sortForList(seed.filter((item) => item.date === today));
assert.equal(list[0].status, "Belum");
assert.equal(list.at(-1).status, "Siap");
assert.equal(passFilter(seed[0], { brand: "Brutti", type: "Semua", status: "Semua", q: "reel" }), true);
assert.equal(passFilter(seed[0], { brand: "Saja", type: "Semua", status: "Semua", q: "" }), false);

const server = [{ ...seed[0], title: "Lama", updatedAt: "2026-10-01T00:00:00+08:00" }];
const local = [{ ...seed[0], title: "Baru", updatedAt: "2026-10-08T10:00:00+08:00" }];
assert.equal(mergeItems(local, server, {})[0].title, "Baru");
assert.equal(mergeItems([{ ...seed[0], updatedAt: "2026-10-01T00:00:00+08:00" }], [{ ...seed[0], title: "Server", updatedAt: "2026-10-08T10:00:00+08:00" }], {})[0].title, "Server");
assert.equal(mergeItems([], server, { "seed-01": "2026-10-09T00:00:00+08:00" }).length, 0);
assert.equal(mergeItems([], [{ ...seed[0], updatedAt: "2026-10-10T00:00:00+08:00" }], { "seed-01": "2026-10-09T00:00:00+08:00" }).length, 1);

const gs = fs.readFileSync(path.join(root, "apps-script/Code.gs"), "utf8");
const api = fs.readFileSync(path.join(root, "js/api.js"), "utf8");
const manifest = JSON.parse(fs.readFileSync(path.join(root, "manifest.json"), "utf8"));
const appsscript = JSON.parse(fs.readFileSync(path.join(root, "apps-script/appsscript.json"), "utf8"));
const html = fs.readFileSync(path.join(root, "index.html"), "utf8");
for (const action of ["ping", "list", "upsert", "delete", "setStatus", "markRead", "markAllRead"]) {
  assert.match(gs, new RegExp(`action === "${action}"`));
  assert.match(api, new RegExp(`"${action}"`));
}
assert.match(api, /text\/plain/);
assert.match(api, /redirect: "follow"/);
assert.equal(manifest.name, "Content Planner");
assert.equal(manifest.short_name, "Content Planner");
assert.equal(appsscript.timeZone, "Asia/Kuala_Lumpur");
assert.doesNotMatch(gs, /MailApp|GmailApp|sendEmail/);
// ntfy lama dibuang; emel (Emel.gs) kekal.
assert.doesNotMatch(gs, /ntfy|NTFY_TOPIC|UrlFetchApp|installTriggers|sendTwoDayReminders|testNtfy/);
assert.ok(!appsscript.oauthScopes.includes("https://www.googleapis.com/auth/script.external_request"));
assert.ok(!appsscript.oauthScopes.includes("https://www.googleapis.com/auth/script.send_mail"));
assert.ok(appsscript.oauthScopes.includes("https://mail.google.com/"));
assert.ok(appsscript.oauthScopes.includes("https://www.googleapis.com/auth/script.scriptapp"));
const setupSrc = extractFunction(gs, "setup");
assert.match(setupSrc, /ensureItemHeaders_/);
assert.match(setupSrc, /ensureNotesSheet_/);
assert.doesNotMatch(setupSrc, /NTFY|ntfy/);
assert.match(extractFunction(gs, "getItemsSheet_"), /ensureItemHeaders_/);
assert.match(gs, /"seriesId", "repeat"/);
for (const action of ["upsertMany", "deleteMany"]) {
  assert.match(gs, new RegExp(`action === "${action}"`));
  assert.match(api, new RegExp(`"${action}"`));
}
const emel = fs.readFileSync(path.join(root, "apps-script/Emel.gs"), "utf8");
for (const helper of ["formatMalayDate_", "typeLabel_", "appUrl_", "todayKL_", "selectTwoDayReminders", "shouldRemindItem", "alreadyRemindedFor_", "readAllItems_", "markReminded_", "addIsoDays_"]) {
  assert.match(gs, new RegExp(`function ${helper}\\(`), `Code.gs mesti ada ${helper} untuk Emel.gs`);
}
assert.match(gs, /var TZ = "Asia\/Kuala_Lumpur"/);
assert.match(emel, /runEmailReminders/);
assert.match(html, /<title>Content Planner<\/title>/);
assert.match(html, /src="\.\/icons\/icon-192\.png"/);
assert.doesNotMatch(html, /(?:href|src)="\//);
for (const brand of ["Brutti", "Selesaai", "Tumbooh", "Badax", "Saja", "Umum"]) {
  assert.match(gs, new RegExp(brand));
}

assert.deepEqual(seed.map((item) => item.id), SAMPLE_IDS);
assert.equal(isSampleId("seed-01"), true);
assert.equal(isSampleId("seed-12"), true);
assert.equal(isSampleId("seed-13"), false);
assert.equal(isSampleId("6f1c0c3e-1b2a-4d5e-9f70-abc123def456"), false);
const own = normalizeItem({ ...seed[0], id: "user-1", title: "Brief sendiri" });
assert.deepEqual(withoutSamples([...seed, own]).map((item) => item.id), ["user-1"]);

const mem = new Map();
globalThis.localStorage = {
  getItem(key) { return mem.has(key) ? mem.get(key) : null; },
  setItem(key, value) { mem.set(key, String(value)); },
  removeItem(key) { mem.delete(key); },
};
saveItems([...seed, own]);
saveOutbox([
  { op: "upsert", item: seed[0] },
  { op: "upsert", item: own },
  { op: "delete", id: "seed-05" },
  { op: "markAllRead", ids: ["seed-02", "user-1"], readAt: stamp },
]);
saveTombs({ "seed-03": stamp, "user-1": stamp });
assert.deepEqual(purgeSampleData().map((item) => item.id), ["user-1"]);
assert.deepEqual(loadItems().map((item) => item.id), ["user-1"]);
assert.deepEqual(loadOutbox(), [
  { op: "upsert", item: own },
  { op: "markAllRead", ids: ["user-1"], readAt: stamp },
]);
assert.deepEqual(loadTombs(), { "user-1": stamp });
assert.equal(localStorage.getItem("cp.samplesRemoved.v1"), "1");
assert.equal(localStorage.getItem("cp.seeded.v1"), null);
assert.deepEqual(purgeSampleData().map((item) => item.id), ["user-1"]);

mem.clear();
assert.deepEqual(purgeSampleData(), []);
assert.equal(mem.has("cp.items.v1"), false);
assert.equal(localStorage.getItem("cp.samplesRemoved.v1"), "1");

saveItems(seed);
clearLocalData();
assert.deepEqual(loadItems(), []);
assert.deepEqual(purgeSampleData(), []);

const storageSrc = fs.readFileSync(path.join(root, "js/storage.js"), "utf8");
const appSrc = fs.readFileSync(path.join(root, "js/app.js"), "utf8");
const sw = fs.readFileSync(path.join(root, "sw.js"), "utf8");
assert.doesNotMatch(storageSrc, /makeSeed/);
assert.doesNotMatch(appSrc, /makeSeed|ensureSeeded/);
assert.match(appSrc, /Kosongkan data/);
assert.match(appSrc, /window\.confirm/);
assert.match(appSrc, /Baris dalam Google Sheet tidak dipadam/);
const push = appSrc.slice(appSrc.indexOf("async function pushAndPull"), appSrc.indexOf("async function connectFromForm"));
assert.match(push, /isSampleId\(item\.id\)\) continue/);
assert.match(push, /withoutSamples/);
const flush = appSrc.slice(appSrc.indexOf("async function flushOutbox"), appSrc.indexOf("async function sync"));
assert.match(flush, /discardSampleQueue/);
assert.match(html, /class="filter-selects"/);
assert.match(html, /id="brand-filters"/);
assert.match(html, /id="type-filters"/);
assert.match(html, /id="status-filters"/);
assert.doesNotMatch(html, /chip-row|class="fchip"/);
assert.match(appSrc, /Semua brand/);
assert.match(appSrc, /Semua jenis/);
assert.match(appSrc, /Semua status/);
assert.match(appSrc, /Ingatkan saya\. Email 12 jam sebelum \(tiada masa: 9 pagi sehari sebelum\)\./);
assert.doesNotMatch(appSrc, /ntfy|Notifikasi ke telefon/);
assert.match(appSrc, /searchParams\.get\("item"\)/);
assert.doesNotMatch(appSrc, /30 minit|Emel /);
assert.match(sw, /content-planner-v9/);
assert.doesNotMatch(sw, /content-planner-v7/);
assert.doesNotMatch(sw, /content-planner-v6/);
assert.match(sw, /recur\.js/);
assert.doesNotMatch(sw, /content-planner-v4/);
assert.doesNotMatch(sw, /content-planner-v1/);
assert.doesNotMatch(sw, /content-planner-v2/);
assert.doesNotMatch(sw, /content-planner-v3/);

console.log("planner tests ok");
