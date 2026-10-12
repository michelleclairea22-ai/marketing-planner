import assert from "node:assert/strict";
import { normalizeItem } from "../js/model.js";
import {
  MAX_OCCURRENCES,
  formatRepeat,
  occurrenceDates,
  parseRepeat,
  planSave,
  repeatErrorText,
  seriesTargets,
} from "../js/recur.js";

// Mingguan, 2 minggu, harian
assert.deepEqual(occurrenceDates("2026-10-12", "weekly", "2026-11-02").dates,
  ["2026-10-12", "2026-10-19", "2026-10-26", "2026-11-02"]);
assert.deepEqual(occurrenceDates("2026-10-12", "weekly", "2026-11-01").dates,
  ["2026-10-12", "2026-10-19", "2026-10-26"]);
assert.deepEqual(occurrenceDates("2026-10-12", "biweekly", "2026-11-23").dates,
  ["2026-10-12", "2026-10-26", "2026-11-09", "2026-11-23"]);
assert.deepEqual(occurrenceDates("2026-12-30", "daily", "2027-01-02").dates,
  ["2026-12-30", "2026-12-31", "2027-01-01", "2027-01-02"]);
// Bulanan: 31hb diapit ke hujung bulan, tanpa hanyut
assert.deepEqual(occurrenceDates("2026-01-31", "monthly", "2026-05-31").dates,
  ["2026-01-31", "2026-02-28", "2026-03-31", "2026-04-30", "2026-05-31"]);
assert.deepEqual(occurrenceDates("2027-12-29", "monthly", "2028-03-01").dates,
  ["2027-12-29", "2028-01-29", "2028-02-29"]);
assert.deepEqual(occurrenceDates("2026-11-30", "monthly", "2027-02-28").dates,
  ["2026-11-30", "2026-12-30", "2027-01-30", "2027-02-28"]);
// Tarikh hingga
assert.equal(occurrenceDates("2026-10-12", "weekly", "").error, "until_required");
assert.equal(occurrenceDates("2026-10-12", "weekly", "2026-10-01").error, "until_before");
assert.deepEqual(occurrenceDates("2026-10-12", "weekly", "2026-10-12").dates, ["2026-10-12"]);
assert.deepEqual(occurrenceDates("2026-10-12", "", "").dates, ["2026-10-12"]);
// Had
assert.equal(MAX_OCCURRENCES, 100);
assert.equal(occurrenceDates("2026-01-01", "daily", "2026-04-10").dates.length, 100);
assert.equal(occurrenceDates("2026-01-01", "daily", "2026-04-11").error, "too_many");
assert.match(repeatErrorText("too_many"), /had 100/);
assert.match(repeatErrorText("until_required"), /Hingga/);

assert.deepEqual(parseRepeat("weekly|2026-12-31"), { freq: "weekly", until: "2026-12-31" });
assert.equal(parseRepeat("weekly"), null);
assert.equal(parseRepeat("yearly|2026-12-31"), null);
assert.equal(formatRepeat("monthly", "2026-12-31"), "monthly|2026-12-31");
assert.equal(formatRepeat("", "2026-12-31"), "");

const n = normalizeItem({ id: "a", title: "t", date: "2026-10-12", seriesId: "s1", repeat: "weekly|2026-12-31" });
assert.equal(n.seriesId, "s1");
assert.equal(n.repeat, "weekly|2026-12-31");
assert.equal(normalizeItem({ id: "a", title: "t", date: "2026-10-12", repeat: "bad" }).repeat, "");

// Siri baru
let counter = 0;
const newId = () => `id${++counter}`;
const stamp = "2026-10-12T10:00:00+08:00";
const fields = { title: "Live", type: "Event", brand: "Brutti", date: "2026-10-12", time: "20:00", notes: "", status: "Belum", remind: "on" };
const created = planSave([], null, { fields, freq: "weekly", until: "2026-11-02" }, "one", { stamp, newId });
assert.equal(created.upserts.length, 4);
assert.equal(new Set(created.upserts.map((i) => i.seriesId)).size, 1);
assert.ok(created.upserts.every((i) => i.repeat === "weekly|2026-11-02" && i.remind === "on"));
assert.equal(new Set(created.upserts.map((i) => i.id)).size, 4);
const items = created.upserts.map((i, idx) => ({ ...i, status: idx === 2 ? "Siap" : "Belum" }));

// Pilihan siri
const third = items[1];
assert.deepEqual(seriesTargets(items, third, "one").map((i) => i.date), ["2026-10-19"]);
assert.deepEqual(seriesTargets(items, third, "future").map((i) => i.date), ["2026-10-19", "2026-10-26", "2026-11-02"]);
assert.deepEqual(seriesTargets([...items, { ...items[0], id: "x", seriesId: "lain", date: "2026-10-30" }], third, "future").length, 3);
assert.deepEqual(seriesTargets(items, { ...items[0], seriesId: "" }, "future").map((i) => i.id), [items[0].id]);

// Ubah ini sahaja
const one = planSave(items, third, { fields: { ...fields, date: third.date, title: "Live khas" }, freq: "weekly", until: "2026-11-02" }, "one", { stamp, newId });
assert.equal(one.upserts.length, 1);
assert.equal(one.upserts[0].title, "Live khas");
assert.equal(one.upserts[0].seriesId, third.seriesId);

// Ubah semua akan datang (tarikh/peraturan sama): status tiap ulangan kekal
const fut = planSave(items, third, { fields: { ...fields, date: third.date, title: "Live baru", time: "21:00" }, freq: "weekly", until: "2026-11-02" }, "future", { stamp, newId });
assert.deepEqual(fut.upserts.map((i) => i.date), ["2026-10-19", "2026-10-26", "2026-11-02"]);
assert.ok(fut.upserts.every((i) => i.title === "Live baru" && i.time === "21:00"));
assert.equal(fut.upserts[1].status, "Siap");
assert.deepEqual(fut.deletes, []);

// Ubah semua akan datang dengan peraturan baru: jana semula
const regen = planSave(items, third, { fields: { ...fields, date: third.date }, freq: "biweekly", until: "2026-11-16" }, "future", { stamp, newId });
assert.deepEqual(regen.upserts.map((i) => i.date), ["2026-10-19", "2026-11-02", "2026-11-16"]);
assert.equal(regen.upserts[0].id, third.id);
assert.deepEqual(regen.deletes.sort(), [items[2].id, items[3].id].sort());

// Henti ulang (Tidak) untuk akan datang
const stop = planSave(items, third, { fields: { ...fields, date: third.date }, freq: "", until: "" }, "future", { stamp, newId });
assert.equal(stop.upserts[0].seriesId, "");
assert.equal(stop.deletes.length, 2);

// Item biasa jadi berulang: id asal dikekalkan
const plain = { ...fields, id: "p1", seriesId: "", repeat: "", createdAt: stamp, updatedAt: stamp, readAt: "", remindedAt: "" };
const conv = planSave([plain], plain, { fields, freq: "monthly", until: "2026-12-12" }, "one", { stamp, newId });
assert.equal(conv.upserts.length, 3);
assert.equal(conv.upserts[0].id, "p1");

console.log("recur tests ok");
