/**
 * Content Planner — backend Google Sheet.
 *
 * Ikut README.md. Ringkasnya:
 * 1. Tampal fail ini ke Code.gs (ganti semua).
 * 2. Tampal appsscript.json.
 * 3. Script properties: ACCESS_KEY dan APP_URL (huruf besar tepat).
 * 4. Jalankan setup.
 * 5. Deploy > Web app > Execute as: Me > Who has access: Anyone.
 * 6. Jalankan installTriggers.
 *
 * Setiap permintaan web mesti bawa kunci yang sama dengan ACCESS_KEY.
 * Badan POST ialah JSON bertulis text/plain (supaya pelayar tak buat preflight CORS).
 *
 * Tindakan: ping, list, upsert, delete, setStatus, markRead, markAllRead.
 * Jawapan: { ok: true, ... } atau { ok: false, error: "..." }.
 */

var TZ = "Asia/Kuala_Lumpur";

var HEADERS = [
  "id", "title", "type", "brand", "date", "time", "notes",
  "status", "remind", "remindedAt", "readAt", "createdAt", "updatedAt"
];

var TYPES = ["Task", "Event", "Notes", "Posting"];
var BRANDS = ["Brutti", "Selesaai", "Tumbooh", "Badax", "Saja", "Umum"];

// ----- Logik tulen. Jangan letak { } di dalam rentetan di bahagian ini. -----

function isIsoDate_(s) {
  s = String(s || "");
  if (s.length !== 10) return false;
  if (s.charAt(4) !== "-" || s.charAt(7) !== "-") return false;
  var y = Number(s.slice(0, 4));
  var m = Number(s.slice(5, 7));
  var d = Number(s.slice(8, 10));
  if (!isFinite(y) || !isFinite(m) || !isFinite(d)) return false;
  if (m < 1 || m > 12 || d < 1 || d > 31) return false;
  return true;
}

function isHm_(s) {
  s = String(s || "");
  if (s.length !== 5 || s.charAt(2) !== ":") return false;
  var hh = Number(s.slice(0, 2));
  var mm = Number(s.slice(3, 5));
  if (!isFinite(hh) || !isFinite(mm)) return false;
  if (hh < 0 || hh > 23 || mm < 0 || mm > 59) return false;
  return true;
}

function minutesUntilStart(dateStr, timeStr, nowMs) {
  if (!isIsoDate_(dateStr) || !isHm_(timeStr)) return null;
  var ms = Date.parse(String(dateStr) + "T" + String(timeStr) + ":00+08:00");
  if (isNaN(ms)) return null;
  return (ms - nowMs) / 60000;
}

function shouldRemindItem(item, nowMs) {
  if (!item) return false;
  if (item.remind !== "on") return false;
  if (item.remindedAt) return false;
  if (item.status === "Siap") return false;
  if (!item.time) return false;
  var mins = minutesUntilStart(item.date, item.time, nowMs);
  if (mins === null) return false;
  return mins > 0 && mins <= 30;
}

function typeLabel_(type) {
  if (type === "Task") return "Tugasan";
  if (type === "Event") return "Acara";
  if (type === "Notes") return "Nota";
  if (type === "Posting") return "Posting";
  return String(type || "");
}

function formatMalayDate_(iso) {
  var months = ["Januari", "Februari", "Mac", "April", "Mei", "Jun", "Julai", "Ogos", "September", "Oktober", "November", "Disember"];
  var days = ["Ahad", "Isnin", "Selasa", "Rabu", "Khamis", "Jumaat", "Sabtu"];
  if (!isIsoDate_(iso)) return String(iso || "");
  var y = Number(iso.slice(0, 4));
  var m = Number(iso.slice(5, 7));
  var d = Number(iso.slice(8, 10));
  var wd = new Date(Date.UTC(y, m - 1, d)).getUTCDay();
  return days[wd] + ", " + d + " " + months[m - 1] + " " + y;
}

function compareByTime_(a, b) {
  var ta = a.time || "99:99";
  var tb = b.time || "99:99";
  if (ta < tb) return -1;
  if (ta > tb) return 1;
  var na = a.title || "";
  var nb = b.title || "";
  if (na < nb) return -1;
  if (na > nb) return 1;
  return 0;
}

function digestHasContent_(items, today) {
  var i;
  for (i = 0; i < items.length; i++) {
    var it = items[i];
    if (it.date === today) return true;
    if (it.status === "Belum" && it.date && it.date < today) return true;
  }
  return false;
}

function digestLine_(it, withDate) {
  var when = it.time || "—";
  if (withDate) when = it.date + " " + when;
  return "• " + when + "  " + it.title + "  (" + it.brand + ", " + typeLabel_(it.type) + ")  " + it.status;
}

function buildDigestText_(items, today, appUrl) {
  var todays = [];
  var overdue = [];
  var i;
  for (i = 0; i < items.length; i++) {
    var it = items[i];
    if (it.date === today) todays.push(it);
    else if (it.status === "Belum" && it.date && it.date < today) overdue.push(it);
  }
  todays.sort(compareByTime_);
  overdue.sort(function (a, b) {
    if (a.date < b.date) return -1;
    if (a.date > b.date) return 1;
    return compareByTime_(a, b);
  });
  var lines = [];
  lines.push("Content Planner");
  lines.push(formatMalayDate_(today));
  lines.push("");
  lines.push("Hari ini");
  if (!todays.length) lines.push("• Tiada");
  for (i = 0; i < todays.length; i++) lines.push(digestLine_(todays[i], false));
  lines.push("");
  lines.push("Terlewat (belum siap)");
  if (!overdue.length) lines.push("• Tiada");
  var cap = overdue.length > 30 ? 30 : overdue.length;
  for (i = 0; i < cap; i++) lines.push(digestLine_(overdue[i], true));
  if (overdue.length > 30) lines.push("• +" + (overdue.length - 30) + " lagi");
  if (appUrl) {
    lines.push("");
    lines.push("Buka: " + appUrl);
  }
  return lines.join("\n");
}

function buildReminderText_(item, appUrl) {
  var lines = [];
  lines.push("Peringatan — lebih kurang 30 minit lagi.");
  lines.push("");
  lines.push(item.title);
  lines.push("Jenama: " + item.brand);
  lines.push("Jenis: " + typeLabel_(item.type));
  lines.push("Masa: " + formatMalayDate_(item.date) + ", " + item.time);
  var note = String(item.notes || "");
  if (note) {
    if (note.length > 400) note = note.slice(0, 400) + "…";
    lines.push("");
    lines.push(note);
  }
  if (appUrl) {
    lines.push("");
    lines.push("Buka: " + appUrl);
  }
  return lines.join("\n");
}

// ----- Web app -----

function doGet(e) {
  var params = (e && e.parameter) || {};
  return route_({
    action: params.action || "list",
    key: params.key || "",
    id: params.id || ""
  });
}

function doPost(e) {
  try {
    var raw = e && e.postData && e.postData.contents ? e.postData.contents : "{}";
    var body = JSON.parse(raw);
    if (!body || typeof body !== "object") return json_({ ok: false, error: "bad_json" });
    return route_(body);
  } catch (err) {
    return json_({ ok: false, error: "bad_json" });
  }
}

function route_(body) {
  try {
    if (!isAuthorized_(body.key)) return json_({ ok: false, error: "unauthorized" });
    var action = String(body.action || "");
    if (action === "ping") {
      return json_({ ok: true, app: "Content Planner", tz: TZ });
    }
    if (action === "list") return json_({ ok: true, items: readAllItems_() });
    if (action === "upsert") return json_(upsertFromClient_(body.item || {}));
    if (action === "delete") return json_(deleteFromClient_(body.id));
    if (action === "setStatus") return json_(setStatus_(body));
    if (action === "markRead") return json_(markRead_(body));
    if (action === "markAllRead") return json_(markAllRead_(body));
    return json_({ ok: false, error: "unknown_action" });
  } catch (err) {
    var message = String(err && err.message ? err.message : err);
    if (message.indexOf("NO_SHEET") >= 0) return json_({ ok: false, error: "no_sheet" });
    return json_({ ok: false, error: "server_error" });
  }
}

function json_(obj) {
  return ContentService
    .createTextOutput(JSON.stringify(obj))
    .setMimeType(ContentService.MimeType.JSON);
}

function isAuthorized_(key) {
  var expected = PropertiesService.getScriptProperties().getProperty("ACCESS_KEY") || "";
  if (!expected) return false;
  return safeEqual_(String(key || ""), expected);
}

function safeEqual_(a, b) {
  if (a.length !== b.length) return false;
  var mismatch = 0;
  var i;
  for (i = 0; i < a.length; i++) mismatch |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return mismatch === 0;
}

function appUrl_() {
  return String(PropertiesService.getScriptProperties().getProperty("APP_URL") || "").trim();
}

function ownerEmail_() {
  var saved = PropertiesService.getScriptProperties().getProperty("OWNER_EMAIL") || "";
  if (saved) return saved;
  try {
    return Session.getEffectiveUser().getEmail() || "";
  } catch (err) {
    return "";
  }
}

function nowIsoKL_(date) {
  return Utilities.formatDate(date || new Date(), TZ, "yyyy-MM-dd'T'HH:mm:ss") + "+08:00";
}

function todayKL_(date) {
  return Utilities.formatDate(date || new Date(), TZ, "yyyy-MM-dd");
}

// ----- Helaian -----

function getItemsSheet_() {
  var ss = SpreadsheetApp.getActive();
  var sheet = ss.getSheetByName("Items");
  if (!sheet) throw new Error("NO_SHEET");
  return sheet;
}

function readAllItems_() {
  var sheet = getItemsSheet_();
  var values = sheet.getDataRange().getValues();
  if (!values.length) return [];
  var headers = values[0].map(function (h) { return String(h || "").trim(); });
  var map = {};
  var order = [];
  var r;
  for (r = 1; r < values.length; r++) {
    var row = values[r];
    var blank = row.every(function (cell) { return cell === "" || cell === null; });
    if (blank) continue;
    var obj = {};
    headers.forEach(function (h, i) { if (h) obj[h] = row[i]; });
    var item = normalizeStored_(obj);
    if (!item) continue;
    if (!map[item.id]) order.push(item.id);
    map[item.id] = item;
  }
  return order.map(function (id) { return map[id]; });
}

function findRowById_(sheet, id) {
  var last = sheet.getLastRow();
  if (last < 2) return -1;
  var ids = sheet.getRange(2, 1, last - 1, 1).getValues();
  var i;
  for (i = 0; i < ids.length; i++) {
    if (String(ids[i][0]) === id) return i + 2;
  }
  return -1;
}

function writeItem_(item) {
  var sheet = getItemsSheet_();
  var row = HEADERS.map(function (h) { return item[h] == null ? "" : String(item[h]); });
  var rowIndex = findRowById_(sheet, item.id);
  if (rowIndex === -1) rowIndex = Math.max(sheet.getLastRow(), 1) + 1;
  var range = sheet.getRange(rowIndex, 1, 1, HEADERS.length);
  range.setNumberFormat("@");
  range.setValues([row]);
  return item;
}

function withLock_(fn) {
  var lock = LockService.getScriptLock();
  lock.waitLock(20000);
  try {
    return fn();
  } finally {
    lock.releaseLock();
  }
}

function normalizeStored_(raw) {
  var title = cellText_(raw.title).trim();
  var date = normalizeDate_(raw.date);
  var id = cellText_(raw.id).trim();
  if (!id || !title || !date) return null;
  if (!/^[A-Za-z0-9_-]{1,80}$/.test(id)) return null;
  var type = TYPES.indexOf(cellText_(raw.type)) >= 0 ? cellText_(raw.type) : "Task";
  var brand = BRANDS.indexOf(cellText_(raw.brand)) >= 0 ? cellText_(raw.brand) : "Umum";
  var status = cellText_(raw.status) === "Siap" ? "Siap" : "Belum";
  var remind = isRemindOn_(raw.remind) ? "on" : "off";
  return {
    id: id,
    title: title.slice(0, 200),
    type: type,
    brand: brand,
    date: date,
    time: normalizeTime_(raw.time),
    notes: cellText_(raw.notes).slice(0, 4000),
    status: status,
    remind: remind,
    remindedAt: normalizeStamp_(raw.remindedAt),
    readAt: normalizeStamp_(raw.readAt),
    createdAt: normalizeStamp_(raw.createdAt),
    updatedAt: normalizeStamp_(raw.updatedAt)
  };
}

function normalizeIncoming_(raw, existing) {
  raw = raw || {};
  var now = nowIsoKL_(new Date());
  var id = cellText_(raw.id).trim();
  if (!id) id = Utilities.getUuid();
  if (!/^[A-Za-z0-9_-]{1,80}$/.test(id)) return { error: "bad_id" };
  var title = cellText_(raw.title).trim();
  if (!title) return { error: "title_required" };
  var date = normalizeDate_(raw.date);
  if (!date) return { error: "date_required" };
  var type = TYPES.indexOf(cellText_(raw.type)) >= 0 ? cellText_(raw.type) : "Task";
  var brand = BRANDS.indexOf(cellText_(raw.brand)) >= 0 ? cellText_(raw.brand) : "Umum";
  var status = cellText_(raw.status) === "Siap" ? "Siap" : "Belum";
  var item = {
    id: id,
    title: title.slice(0, 200),
    type: type,
    brand: brand,
    date: date,
    time: normalizeTime_(raw.time),
    notes: cellText_(raw.notes).slice(0, 4000),
    status: status,
    remind: isRemindOn_(raw.remind) ? "on" : "off",
    remindedAt: normalizeStamp_(raw.remindedAt),
    readAt: normalizeStamp_(raw.readAt),
    createdAt: normalizeStamp_(raw.createdAt) || (existing && existing.createdAt) || now,
    updatedAt: normalizeStamp_(raw.updatedAt) || now
  };
  return { item: item };
}

function cellText_(value) {
  if (value instanceof Date && !isNaN(value.getTime())) {
    return Utilities.formatDate(value, TZ, "yyyy-MM-dd HH:mm:ss");
  }
  if (value === null || value === undefined) return "";
  return String(value);
}

function normalizeDate_(value) {
  if (value instanceof Date && !isNaN(value.getTime())) {
    return Utilities.formatDate(value, TZ, "yyyy-MM-dd");
  }
  var s = String(value || "").trim();
  if (/^\d{4}-\d{2}-\d{2}/.test(s) && isIsoDate_(s.slice(0, 10))) return s.slice(0, 10);
  return "";
}

function normalizeTime_(value) {
  if (value instanceof Date && !isNaN(value.getTime())) {
    return Utilities.formatDate(value, TZ, "HH:mm");
  }
  var s = String(value || "").trim();
  if (!s) return "";
  var match = s.match(/^(\d{1,2}):(\d{2})/);
  if (!match) return "";
  var hh = Number(match[1]);
  var mm = Number(match[2]);
  if (hh < 0 || hh > 23 || mm < 0 || mm > 59) return "";
  var hhText = hh < 10 ? "0" + hh : String(hh);
  var mmText = mm < 10 ? "0" + mm : String(mm);
  return hhText + ":" + mmText;
}

function normalizeStamp_(value) {
  if (value instanceof Date && !isNaN(value.getTime())) {
    return Utilities.formatDate(value, TZ, "yyyy-MM-dd'T'HH:mm:ss") + "+08:00";
  }
  return String(value || "").trim();
}

function isRemindOn_(value) {
  var s = String(value || "").trim().toLowerCase();
  return s === "on" || s === "true" || s === "ya" || s === "1";
}

function upsertFromClient_(raw) {
  return withLock_(function () {
    var existing = null;
    var id = cellText_(raw && raw.id).trim();
    if (id) {
      existing = readAllItems_().filter(function (it) { return it.id === id; })[0] || null;
    }
    var normalized = normalizeIncoming_(raw, existing);
    if (normalized.error) return { ok: false, error: normalized.error };
    writeItem_(normalized.item);
    return { ok: true, item: normalized.item };
  });
}

function deleteFromClient_(id) {
  id = String(id || "").trim();
  if (!id) return { ok: false, error: "not_found" };
  return withLock_(function () {
    var sheet = getItemsSheet_();
    var rowIndex = findRowById_(sheet, id);
    if (rowIndex === -1) return { ok: true, id: id };
    sheet.deleteRow(rowIndex);
    return { ok: true, id: id };
  });
}

function setStatus_(body) {
  var id = String(body.id || "").trim();
  var status = body.status === "Siap" ? "Siap" : "Belum";
  var stamp = normalizeStamp_(body.updatedAt) || nowIsoKL_(new Date());
  return withLock_(function () {
    var items = readAllItems_();
    var item = items.filter(function (it) { return it.id === id; })[0];
    if (!item) return { ok: false, error: "not_found" };
    item.status = status;
    item.updatedAt = stamp;
    writeItem_(item);
    return { ok: true, item: item };
  });
}

function markRead_(body) {
  var id = String(body.id || "").trim();
  var stamp = normalizeStamp_(body.readAt) || nowIsoKL_(new Date());
  return withLock_(function () {
    var item = readAllItems_().filter(function (it) { return it.id === id; })[0];
    if (!item) return { ok: false, error: "not_found" };
    item.readAt = stamp;
    item.updatedAt = stamp;
    writeItem_(item);
    return { ok: true, item: item };
  });
}

function markAllRead_(body) {
  var ids = Array.isArray(body.ids) ? body.ids.map(function (id) { return String(id || ""); }) : [];
  var stamp = normalizeStamp_(body.readAt) || nowIsoKL_(new Date());
  return withLock_(function () {
    var wanted = {};
    ids.forEach(function (id) { if (id) wanted[id] = true; });
    var updated = [];
    readAllItems_().forEach(function (item) {
      if (!wanted[item.id]) return;
      item.readAt = stamp;
      item.updatedAt = stamp;
      writeItem_(item);
      updated.push(item);
    });
    return { ok: true, items: updated };
  });
}

// ----- Menu, setup, emel -----

function onOpen() {
  SpreadsheetApp.getUi()
    .createMenu("Content Planner")
    .addItem("1. Setup helaian", "setup")
    .addItem("2. Pasang peringatan emel", "installTriggers")
    .addItem("Pratonton digest (log)", "previewDailyDigest")
    .addItem("Pratonton peringatan (log)", "previewReminders")
    .addItem("Hantar digest sekarang", "sendDailyDigest")
    .addToUi();
}

function setup() {
  var ss = SpreadsheetApp.getActive();
  ss.setSpreadsheetTimeZone(TZ);
  var sheet = ss.getSheetByName("Items");
  if (!sheet) {
    var first = ss.getSheets()[0];
    if (first && ss.getSheets().length === 1 && first.getLastRow() === 0) {
      first.setName("Items");
      sheet = first;
    } else {
      sheet = ss.insertSheet("Items");
    }
  }
  var current = sheet.getRange(1, 1, 1, HEADERS.length).getValues()[0].map(function (h) {
    return String(h || "");
  });
  var same = HEADERS.every(function (h, i) { return current[i] === h; });
  if (!same) sheet.getRange(1, 1, 1, HEADERS.length).setValues([HEADERS]);
  var rows = Math.max(sheet.getMaxRows(), 200);
  sheet.getRange(1, 1, rows, HEADERS.length).setNumberFormat("@");
  sheet.getRange(1, 1, 1, HEADERS.length).setFontWeight("bold");
  sheet.setFrozenRows(1);
  var widths = [220, 240, 100, 120, 110, 80, 280, 80, 80, 180, 180, 180, 180];
  widths.forEach(function (width, i) { sheet.setColumnWidth(i + 1, width); });
  console.log("Setup siap. Tab Items sedia. Zon masa Asia/Kuala_Lumpur.");
  return "Setup siap.";
}

function installTriggers() {
  var email = "";
  try {
    email = Session.getActiveUser().getEmail() || Session.getEffectiveUser().getEmail() || "";
  } catch (err) {
    email = "";
  }
  if (!email) {
    throw new Error("Tak dapat emel anda. Jalankan installTriggers dari editor semasa anda log masuk.");
  }
  PropertiesService.getScriptProperties().setProperty("OWNER_EMAIL", email);
  ScriptApp.getProjectTriggers().forEach(function (trigger) {
    var fn = trigger.getHandlerFunction();
    if (fn === "sendDailyDigest" || fn === "sendUpcomingReminders") {
      ScriptApp.deleteTrigger(trigger);
    }
  });
  ScriptApp.newTrigger("sendDailyDigest")
    .timeBased()
    .atHour(8)
    .everyDays(1)
    .inTimezone(TZ)
    .create();
  ScriptApp.newTrigger("sendUpcomingReminders")
    .timeBased()
    .everyMinutes(15)
    .create();
  console.log("Peringatan dipasang untuk " + email + ". Digest sekitar 8 pagi. Semakan item setiap 15 minit.");
  return "Peringatan dipasang untuk " + email;
}

function sendDailyDigest() {
  var email = ownerEmail_();
  if (!email) {
    console.log("OWNER_EMAIL kosong. Jalankan installTriggers.");
    return;
  }
  var today = todayKL_(new Date());
  var items = readAllItems_();
  if (!digestHasContent_(items, today)) {
    console.log("Digest kosong untuk " + today + ". Emel tak dihantar.");
    return;
  }
  var body = buildDigestText_(items, today, appUrl_());
  MailApp.sendEmail(email, "Content Planner — senarai hari ini", body);
}

function sendUpcomingReminders() {
  var email = ownerEmail_();
  if (!email) {
    console.log("OWNER_EMAIL kosong. Jalankan installTriggers.");
    return;
  }
  var now = new Date();
  var nowMs = now.getTime();
  var url = appUrl_();
  var due = readAllItems_().filter(function (item) { return shouldRemindItem(item, nowMs); });
  due.forEach(function (item) {
    var subject = "Content Planner — 30 minit lagi: " + String(item.title).slice(0, 80);
    MailApp.sendEmail(email, subject, buildReminderText_(item, url));
    markReminded_(item.id, nowIsoKL_(now));
  });
}

function markReminded_(id, stamp) {
  withLock_(function () {
    var item = readAllItems_().filter(function (it) { return it.id === id; })[0];
    if (!item || item.remindedAt) return;
    item.remindedAt = stamp;
    item.updatedAt = stamp;
    writeItem_(item);
  });
}

function previewDailyDigest() {
  var today = todayKL_(new Date());
  var text = buildDigestText_(readAllItems_(), today, appUrl_());
  console.log(text);
  return text;
}

function previewReminders() {
  var now = new Date();
  var due = readAllItems_().filter(function (item) { return shouldRemindItem(item, now.getTime()); });
  if (!due.length) {
    console.log("Tiada item dalam tetingkap 30 minit.");
    return "Tiada";
  }
  var lines = due.map(function (item) {
    return item.date + " " + item.time + "  " + item.title;
  });
  console.log(lines.join("\n"));
  return lines.join("\n");
}
