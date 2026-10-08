import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { makeSeed, mergeItems, normalizeItem, passFilter, sortForList } from "../js/model.js";
import { buildNotifications, isUnread, unreadCount } from "../js/notify.js";
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
    "isHm_",
    "minutesUntilStart",
    "shouldRemindItem",
    "typeLabel_",
    "formatMalayDate_",
    "compareByTime_",
    "digestHasContent_",
    "digestLine_",
    "buildDigestText_",
    "buildReminderText_",
  ];
  const body = names.map((name) => extractFunction(src, name)).join("\n");
  return new Function(`${body}\nreturn { ${names.join(", ")} };`)();
}

const gas = loadGas();

function itemAt(minuteOfDay, extra = {}) {
  const hh = String(Math.floor(minuteOfDay / 60)).padStart(2, "0");
  const mm = String(minuteOfDay % 60).padStart(2, "0");
  return {
    remind: "on",
    remindedAt: "",
    status: "Belum",
    date: "2026-10-08",
    time: `${hh}:${mm}`,
    title: "Ujian",
    brand: "Brutti",
    type: "Task",
    notes: "",
    ...extra,
  };
}

const base = Date.parse("2026-10-08T00:00:00+08:00");

function leads(phase, itemMinute) {
  const startMs = base + itemMinute * 60000;
  const hh = String(Math.floor(itemMinute / 60)).padStart(2, "0");
  const mm = String(itemMinute % 60).padStart(2, "0");
  let remindedAt = "";
  const sends = [];
  for (let trig = phase - 90; trig < itemMinute + 20; trig += 15) {
    const nowMs = base + trig * 60000;
    const item = itemAt(itemMinute, { time: `${hh}:${mm}`, remindedAt });
    if (gas.shouldRemindItem(item, nowMs)) {
      sends.push((startMs - nowMs) / 60000);
      remindedAt = "sent";
    }
  }
  return sends;
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
assert.equal(gas.shouldRemindItem(itemAt(0, { remind: "off" }), base - 20 * 60000), false);
assert.equal(gas.shouldRemindItem(itemAt(0, { remindedAt: "x" }), base - 20 * 60000), false);
assert.equal(gas.shouldRemindItem(itemAt(0, { status: "Siap" }), base - 20 * 60000), false);
assert.equal(gas.shouldRemindItem(itemAt(0, { time: "" }), base - 20 * 60000), false);
assert.equal(gas.shouldRemindItem(itemAt(20), base), true);
assert.equal(gas.shouldRemindItem(itemAt(30), base), true);
assert.equal(gas.shouldRemindItem(itemAt(31), base), false);
assert.equal(gas.shouldRemindItem(itemAt(0), base), false);

// Cross midnight: 23:50 KL on 7 Oct is 20 minutes before 00:10 on 8 Oct.
const late = Date.parse("2026-10-07T15:50:00Z");
assert.equal(gas.minutesUntilStart("2026-10-08", "00:10", late), 20);
assert.equal(gas.shouldRemindItem(itemAt(10), late), true);

for (let phase = 0; phase < 15; phase += 1) {
  for (let minute = 0; minute < 24 * 60; minute += 1) {
    const sends = leads(phase, minute);
    assert.equal(sends.length, 1, `phase ${phase} minute ${minute} sends ${sends}`);
    assert.ok(sends[0] >= 16 && sends[0] <= 30, `lead ${sends[0]} phase ${phase} minute ${minute}`);
  }
}

const digestItems = [
  { date: "2026-10-08", time: "09:00", title: "Reel", brand: "Brutti", type: "Posting", status: "Belum", notes: "" },
  { date: "2026-10-08", time: "", title: "Nota siap", brand: "Umum", type: "Notes", status: "Siap", notes: "" },
  { date: "2026-10-07", time: "16:00", title: "Video", brand: "Badax", type: "Task", status: "Belum", notes: "" },
  { date: "2026-10-06", time: "", title: "Siap lama", brand: "Saja", type: "Task", status: "Siap", notes: "" },
  { date: "2026-10-09", time: "11:00", title: "Esok", brand: "Saja", type: "Posting", status: "Belum", notes: "" },
];
assert.equal(gas.digestHasContent_(digestItems, "2026-10-08"), true);
assert.equal(gas.digestHasContent_([digestItems[4]], "2026-10-08"), false);
const digest = gas.buildDigestText_(digestItems, "2026-10-08", "https://contoh.github.io/marketing-planner/");
assert.match(digest, /Content Planner/);
assert.match(digest, /Reel/);
assert.match(digest, /Nota siap/);
assert.match(digest, /Video/);
assert.doesNotMatch(digest, /Siap lama/);
assert.doesNotMatch(digest, /Esok/);
assert.match(digest, /Buka: https:\/\/contoh.github.io\/marketing-planner\//);
const reminder = gas.buildReminderText_(digestItems[0], "https://contoh.github.io/marketing-planner/");
assert.match(reminder, /30 minit/);
assert.match(reminder, /Brutti/);
assert.match(reminder, /Posting/);

const today = "2026-10-08";
const stamp = "2026-10-08T08:00:00+08:00";
const seed = makeSeed(today, stamp).map(normalizeItem);
assert.equal(seed.length, 12);
assert.ok(seed.every(Boolean));
const notes = buildNotifications(seed, today);
assert.ok(notes.some((entry) => entry.kind === "terlewat" && entry.item.id === "seed-05"));
assert.ok(notes.every((entry) => entry.item.status !== "Siap"));
assert.ok(!notes.some((entry) => entry.item.id === "seed-09"));
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
assert.match(gs, /Content Planner — senarai hari ini/);
assert.match(gs, /Content Planner — 30 minit lagi:/);
assert.match(html, /<title>Content Planner<\/title>/);
assert.match(html, /src="\.\/icons\/icon-192\.png"/);
assert.doesNotMatch(html, /(?:href|src)="\//);
for (const brand of ["Brutti", "Selesaai", "Tumbooh", "Badax", "Saja", "Umum"]) {
  assert.match(gs, new RegExp(brand));
}

console.log("planner tests ok");
