/**
 * Content Planner — backend Google Sheet.
 *
 * Ikut README.md. Ringkasnya:
 * 1. Tampal fail ini ke Code.gs (ganti semua).
 * 2. Tampal appsscript.json.
 * 3. Script properties: ACCESS_KEY dan APP_URL (huruf besar tepat).
 * 4. Jalankan setup. Log menunjukkan NTFY_TOPIC. Langgan topik itu dalam app ntfy.
 * 5. Deploy > Web app > Execute as: Me > Who has access: Anyone.
 * 6. Jalankan installTriggers (sekali). Kemudian testNtfy.
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

function addIsoDays_(iso, days) {
  if (!isIsoDate_(iso)) return "";
  var y = Number(iso.slice(0, 4));
  var m = Number(iso.slice(5, 7));
  var d = Number(iso.slice(8, 10));
  var dt = new Date(Date.UTC(y, m - 1, d + Number(days)));
  var yy = String(dt.getUTCFullYear());
  var mm = dt.getUTCMonth() + 1;
  var dd = dt.getUTCDate();
  var mmText = mm < 10 ? "0" + mm : String(mm);
  var ddText = dd < 10 ? "0" + dd : String(dd);
  return yy + "-" + mmText + "-" + ddText;
}

function alreadyRemindedFor_(remindedAt, itemDate) {
  var stamp = String(remindedAt || "").trim();
  if (!stamp || !isIsoDate_(itemDate)) return false;
  if (stamp === itemDate) return true;
  return stamp.slice(0, 10) === itemDate;
}

function shouldRemindItem(item, todayIso) {
  if (!item) return false;
  if (item.remind !== "on") return false;
  if (item.status === "Siap") return false;
  if (!isIsoDate_(item.date) || !isIsoDate_(todayIso)) return false;
  if (item.date !== addIsoDays_(todayIso, 2)) return false;
  if (alreadyRemindedFor_(item.remindedAt, item.date)) return false;
  return true;
}

function selectTwoDayReminders(items, todayIso) {
  var out = [];
  var i;
  if (!items || !items.length) return out;
  for (i = 0; i < items.length; i++) {
    if (shouldRemindItem(items[i], todayIso)) out.push(items[i]);
  }
  return out;
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

function oneLine_(value) {
  return String(value || "").replace(/[\u0000-\u001F\u007F]+/g, " ").replace(/ +/g, " ").trim();
}

function utf8Base64_(text) {
  var bytes = [];
  var i;
  for (i = 0; i < text.length; i++) {
    var c = text.charCodeAt(i);
    if (c < 128) bytes.push(c);
    else if (c < 2048) bytes.push(192 | (c >> 6), 128 | (c & 63));
    else if (c >= 55296 && c <= 56319 && i + 1 < text.length) {
      var c2 = text.charCodeAt(i + 1);
      i += 1;
      var u = ((c & 1023) << 10 | (c2 & 1023)) + 65536;
      bytes.push(240 | (u >> 18), 128 | ((u >> 12) & 63), 128 | ((u >> 6) & 63), 128 | (u & 63));
    } else bytes.push(224 | (c >> 12), 128 | ((c >> 6) & 63), 128 | (c & 63));
  }
  var alphabet = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";
  var out = "";
  for (i = 0; i < bytes.length; i += 3) {
    var b0 = bytes[i];
    var b1 = i + 1 < bytes.length ? bytes[i + 1] : 0;
    var b2 = i + 2 < bytes.length ? bytes[i + 2] : 0;
    out += alphabet.charAt(b0 >> 2);
    out += alphabet.charAt(((b0 & 3) << 4) | (b1 >> 4));
    out += i + 1 < bytes.length ? alphabet.charAt(((b1 & 15) << 2) | (b2 >> 6)) : "=";
    out += i + 2 < bytes.length ? alphabet.charAt(b2 & 63) : "=";
  }
  return out;
}

function ntfyHeader_(value) {
  var text = oneLine_(value);
  var i;
  for (i = 0; i < text.length; i++) {
    if (text.charCodeAt(i) > 126) return "=?UTF-8?B?" + utf8Base64_(text) + "?=";
  }
  return text;
}

function ntfyTagForType_(type) {
  if (type === "Task") return "clipboard";
  if (type === "Event") return "calendar";
  if (type === "Notes") return "memo";
  if (type === "Posting") return "mega";
  return "bell";
}

function itemClickUrl_(appUrl, id) {
  var base = String(appUrl || "").trim();
  var itemId = String(id || "").trim();
  if (!base || !itemId) return "";
  var hash = "";
  var hashAt = base.indexOf("#");
  if (hashAt >= 0) {
    hash = base.slice(hashAt);
    base = base.slice(0, hashAt);
  }
  var joiner = base.indexOf("?") >= 0 ? "&" : "?";
  return base + joiner + "item=" + encodeURIComponent(itemId) + hash;
}

function clipNote_(notes) {
  var note = oneLine_(notes);
  if (note.length > 180) note = note.slice(0, 180) + "…";
  return note;
}

function buildNtfyReminder_(item, appUrl) {
  var when = formatMalayDate_(item.date);
  if (item.time) when = when + ", " + item.time;
  var lines = [];
  lines.push("Jenama: " + String(item.brand || ""));
  lines.push("Jenis: " + typeLabel_(item.type));
  lines.push("Tarikh: " + when);
  var note = clipNote_(item.notes);
  if (note) lines.push(note);
  return {
    title: "2 hari lagi: " + oneLine_(item.title).slice(0, 140),
    body: lines.join("\n"),
    tags: ntfyTagForType_(item.type),
    click: itemClickUrl_(appUrl, item.id)
  };
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

// ----- Menu, setup, notifikasi ntfy -----
// OWNER_EMAIL (jika masih ada dari versi lama) tidak dibaca dan tidak digunakan.

function onOpen() {
  SpreadsheetApp.getUi()
    .createMenu("Content Planner")
    .addItem("1. Setup helaian", "setup")
    .addItem("2. Pasang peringatan ntfy", "installTriggers")
    .addItem("Uji notifikasi ntfy", "testNtfy")
    .addItem("Pratonton peringatan 2 hari (log)", "previewTwoDayReminders")
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
  var topic = ensureNtfyTopic_();
  Logger.log("NTFY_TOPIC: " + topic);
  console.log("NTFY_TOPIC: " + topic);
  console.log("Setup siap. Tab Items sedia. Zon masa Asia/Kuala_Lumpur. Langgan topik di atas dalam app ntfy (pelayan ntfy.sh).");
  return "Setup siap. NTFY_TOPIC: " + topic;
}

function ensureNtfyTopic_() {
  var props = PropertiesService.getScriptProperties();
  var topic = String(props.getProperty("NTFY_TOPIC") || "").trim();
  if (topic) return topic;
  topic = "content-planner-" + randomTopicSuffix_(16);
  props.setProperty("NTFY_TOPIC", topic);
  return topic;
}

function randomTopicSuffix_(length) {
  var alphabet = "abcdefghijklmnopqrstuvwxyz0123456789";
  var out = "";
  var i;
  for (i = 0; i < length; i++) out += alphabet.charAt(Math.floor(Math.random() * alphabet.length));
  return out;
}

function installTriggers() {
  ScriptApp.getProjectTriggers().forEach(function (trigger) {
    ScriptApp.deleteTrigger(trigger);
  });
  ScriptApp.newTrigger("sendTwoDayReminders")
    .timeBased()
    .atHour(9)
    .everyDays(1)
    .inTimezone(TZ)
    .create();
  var topic = String(PropertiesService.getScriptProperties().getProperty("NTFY_TOPIC") || "").trim();
  console.log("Pemasa lama dipadam. Peringatan ntfy dipasang: setiap hari sekitar jam 9 pagi (Asia/Kuala_Lumpur).");
  if (!topic) console.log("NTFY_TOPIC belum ada. Jalankan setup, kemudian langgan topik itu dalam app ntfy.");
  return "Peringatan ntfy dipasang.";
}

function sendTwoDayReminders() {
  var topic = String(PropertiesService.getScriptProperties().getProperty("NTFY_TOPIC") || "").trim();
  if (!topic) {
    console.log("NTFY_TOPIC kosong. Jalankan setup.");
    return;
  }
  var today = todayKL_(new Date());
  var url = appUrl_();
  var due = selectTwoDayReminders(readAllItems_(), today);
  console.log("Peringatan 2 hari untuk " + addIsoDays_(today, 2) + ": " + due.length + " item.");
  due.forEach(function (item) {
    var note = buildNtfyReminder_(item, url);
    if (!postNtfy_(topic, note)) {
      console.log("Tak dihantar: " + item.id + " " + item.title);
      return;
    }
    markReminded_(item.id, item.date);
    console.log("Dihantar: " + item.date + " " + item.title);
  });
}

function testNtfy() {
  var topic = String(PropertiesService.getScriptProperties().getProperty("NTFY_TOPIC") || "").trim();
  if (!topic) {
    console.log("NTFY_TOPIC kosong. Jalankan setup.");
    return "NTFY_TOPIC kosong. Jalankan setup.";
  }
  var ok = postNtfy_(topic, {
    title: "Content Planner: notifikasi berjaya",
    body: "Content Planner: notifikasi berjaya",
    tags: "white_check_mark",
    click: appUrl_()
  });
  if (!ok) return "Notifikasi ujian gagal. Lihat log.";
  console.log("Notifikasi ujian dihantar. Semak telefon.");
  return "Notifikasi ujian dihantar.";
}

function postNtfy_(topic, note) {
  var safeTopic = String(topic || "").trim();
  if (!/^[A-Za-z0-9][A-Za-z0-9_-]{0,63}$/.test(safeTopic)) {
    console.log("NTFY_TOPIC tidak sah.");
    return false;
  }
  var headers = {
    Title: ntfyHeader_(note.title),
    Tags: ntfyHeader_(note.tags)
  };
  if (note.click) headers.Click = oneLine_(note.click);
  var response;
  try {
    response = UrlFetchApp.fetch("https://ntfy.sh/" + safeTopic, {
      method: "post",
      contentType: "text/plain; charset=utf-8",
      payload: String(note.body || ""),
      headers: headers,
      muteHttpExceptions: true
    });
  } catch (err) {
    console.log("ntfy gagal: " + String(err && err.message ? err.message : err));
    return false;
  }
  var code = response.getResponseCode();
  if (code < 200 || code >= 300) {
    console.log("ntfy gagal HTTP " + code + " " + String(response.getContentText() || "").slice(0, 300));
    return false;
  }
  return true;
}

function markReminded_(id, itemDate) {
  withLock_(function () {
    var item = readAllItems_().filter(function (it) { return it.id === id; })[0];
    if (!item || item.date !== itemDate) return;
    if (alreadyRemindedFor_(item.remindedAt, item.date)) return;
    item.remindedAt = item.date;
    item.updatedAt = nowIsoKL_(new Date());
    writeItem_(item);
  });
}

function previewTwoDayReminders() {
  var today = todayKL_(new Date());
  var due = selectTwoDayReminders(readAllItems_(), today);
  if (!due.length) {
    console.log("Tiada item untuk " + addIsoDays_(today, 2) + ".");
    return "Tiada";
  }
  var lines = due.map(function (item) {
    var when = item.time ? item.date + " " + item.time : item.date;
    return when + "  " + item.title;
  });
  console.log(lines.join("\n"));
  return lines.join("\n");
}
