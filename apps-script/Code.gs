/**
 * Content Planner — backend Google Sheet.
 *
 * Ikut README.md. Ringkasnya:
 * 1. Tampal fail ini ke Code.gs (ganti semua).
 * 2. Tampal appsscript.json.
 * 3. Script properties: ACCESS_KEY dan APP_URL (huruf besar tepat).
 * 4. Tambah Emel.gs (peringatan emel). Jalankan setup (buat tab Items dan Notes).
 * 5. Deploy > Web app > Execute as: Me > Who has access: Anyone.
 * 6. Jalankan installEmailTriggers (sekali). Kemudian testEmail.
 *
 * Setiap permintaan web mesti bawa kunci yang sama dengan ACCESS_KEY.
 * Badan POST ialah JSON bertulis text/plain (supaya pelayar tak buat preflight CORS).
 *
 * Tindakan: ping, list, upsert, upsertMany, delete, deleteMany, setStatus, markRead, markAllRead,
 *          notesList, noteUpsert, noteDelete, imageUpload, imageGet.
 * Jawapan: { ok: true, ... } atau { ok: false, error: "..." }.
 */

var TZ = "Asia/Kuala_Lumpur";

var HEADERS = [
  "id", "title", "type", "brand", "date", "time", "notes",
  "status", "remind", "remindedAt", "readAt", "createdAt", "updatedAt",
  "seriesId", "repeat"
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

function normalizeRepeat_(value) {
  var s = String(value || "").trim();
  return /^(daily|weekly|biweekly|monthly)\|\d{4}-\d{2}-\d{2}$/.test(s) ? s : "";
}

function normalizeSeriesId_(value) {
  var s = String(value || "").trim();
  return /^[A-Za-z0-9_-]{1,80}$/.test(s) ? s : "";
}

// Lajur yang tiada dalam baris tajuk (ikut susunan HEADERS). Logik tulen, diuji.
function missingHeaders_(current) {
  var have = {};
  (current || []).forEach(function (h) { have[String(h || "").trim()] = true; });
  return HEADERS.filter(function (h) { return !have[h]; });
}

function oneLine_(value) {
  return String(value || "").replace(/[\u0000-\u001F\u007F]+/g, " ").replace(/ +/g, " ").trim();
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
    if (action === "upsertMany") return json_(upsertManyFromClient_(body.items));
    if (action === "delete") return json_(deleteFromClient_(body.id));
    if (action === "deleteMany") return json_(deleteManyFromClient_(body.ids));
    if (action === "setStatus") return json_(setStatus_(body));
    if (action === "markRead") return json_(markRead_(body));
    if (action === "markAllRead") return json_(markAllRead_(body));
    if (action === "notesList") return json_({ ok: true, notes: readAllNotes_() });
    if (action === "noteUpsert") return json_(noteUpsert_(body.note || {}));
    if (action === "noteDelete") return json_(noteDelete_(body.id));
    if (action === "imageUpload") return json_(imageUpload_(body));
    if (action === "imageGet") return json_(imageGet_(body.fileId));
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
  ensureItemHeaders_(sheet);
  return sheet;
}

// Tambah lajur baharu (cth. seriesId, repeat) di hujung tanpa menyentuh data sedia ada.
function ensureItemHeaders_(sheet) {
  var lastCol = Math.max(sheet.getLastColumn(), 1);
  var current = sheet.getRange(1, 1, 1, lastCol).getValues()[0].map(function (h) {
    return String(h || "").trim();
  });
  var blank = current.every(function (h) { return !h; });
  if (blank) {
    sheet.getRange(1, 1, 1, HEADERS.length).setValues([HEADERS]);
    return HEADERS.slice();
  }
  var missing = missingHeaders_(current);
  if (!missing.length) return current;
  while (current.length && !current[current.length - 1]) current.pop();
  var start = current.length + 1;
  var needCols = start + missing.length - 1;
  if (sheet.getMaxColumns() < needCols) {
    sheet.insertColumnsAfter(sheet.getMaxColumns(), needCols - sheet.getMaxColumns());
  }
  var range = sheet.getRange(1, start, 1, missing.length);
  range.setValues([missing]);
  range.setFontWeight("bold");
  sheet.getRange(1, start, Math.max(sheet.getMaxRows(), 1), missing.length).setNumberFormat("@");
  return current.concat(missing);
}

function headerRow_(sheet) {
  return sheet.getRange(1, 1, 1, Math.max(sheet.getLastColumn(), 1)).getValues()[0].map(function (h) {
    return String(h || "").trim();
  });
}

// Baris penuh ikut susunan tajuk dalam helaian. Lajur yang tidak dikenali dikekalkan dari baris lama.
function rowFor_(headers, item, oldRow) {
  return headers.map(function (h, i) {
    if (HEADERS.indexOf(h) < 0) return oldRow ? oldRow[i] : "";
    return item[h] == null ? "" : String(item[h]);
  });
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
  var headers = headerRow_(sheet);
  var rowIndex = findRowById_(sheet, item.id);
  var oldRow = null;
  if (rowIndex === -1) rowIndex = Math.max(sheet.getLastRow(), 1) + 1;
  else oldRow = sheet.getRange(rowIndex, 1, 1, headers.length).getValues()[0];
  var range = sheet.getRange(rowIndex, 1, 1, headers.length);
  range.setNumberFormat("@");
  range.setValues([rowFor_(headers, item, oldRow)]);
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
    updatedAt: normalizeStamp_(raw.updatedAt),
    seriesId: normalizeSeriesId_(raw.seriesId),
    repeat: normalizeRepeat_(raw.repeat)
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
    updatedAt: normalizeStamp_(raw.updatedAt) || now,
    seriesId: normalizeSeriesId_(raw.seriesId),
    repeat: normalizeRepeat_(raw.repeat)
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

function upsertManyFromClient_(rawItems) {
  if (!Array.isArray(rawItems)) return { ok: false, error: "bad_items" };
  if (rawItems.length > 200) return { ok: false, error: "too_many" };
  return withLock_(function () {
    var sheet = getItemsSheet_();
    var headers = headerRow_(sheet);
    var existing = {};
    readAllItems_().forEach(function (it) { existing[it.id] = it; });
    var normalized = [];
    var i;
    for (i = 0; i < rawItems.length; i++) {
      var raw = rawItems[i] || {};
      var res = normalizeIncoming_(raw, existing[cellText_(raw.id).trim()] || null);
      if (res.error) return { ok: false, error: res.error };
      normalized.push(res.item);
    }
    var last = sheet.getLastRow();
    var values = last >= 2 ? sheet.getRange(2, 1, last - 1, headers.length).getValues() : [];
    var rowById = {};
    values.forEach(function (row, idx) { rowById[String(row[0])] = idx; });
    var appended = [];
    normalized.forEach(function (item) {
      var idx = rowById[item.id];
      if (idx === undefined) {
        rowById[item.id] = -1;
        appended.push(rowFor_(headers, item, null));
        return;
      }
      if (idx < 0) return;
      var range = sheet.getRange(idx + 2, 1, 1, headers.length);
      range.setNumberFormat("@");
      range.setValues([rowFor_(headers, item, values[idx])]);
    });
    if (appended.length) {
      var block = sheet.getRange(Math.max(last, 1) + 1, 1, appended.length, headers.length);
      block.setNumberFormat("@");
      block.setValues(appended);
    }
    return { ok: true, items: normalized };
  });
}

function deleteManyFromClient_(ids) {
  if (!Array.isArray(ids)) return { ok: false, error: "bad_ids" };
  var wanted = {};
  ids.forEach(function (id) {
    var key = String(id || "").trim();
    if (key) wanted[key] = true;
  });
  return withLock_(function () {
    var sheet = getItemsSheet_();
    var last = sheet.getLastRow();
    if (last < 2) return { ok: true, ids: ids };
    var col = sheet.getRange(2, 1, last - 1, 1).getValues();
    var r;
    for (r = col.length - 1; r >= 0; r--) {
      if (wanted[String(col[r][0])]) sheet.deleteRow(r + 2);
    }
    return { ok: true, ids: ids };
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

// ----- Menu, setup, peringatan (emel dalam Emel.gs) -----
// OWNER_EMAIL (jika masih ada dari versi lama) tidak dibaca dan tidak digunakan.

function onOpen() {
  SpreadsheetApp.getUi()
    .createMenu("Content Planner")
    .addItem("1. Setup helaian", "setup")
    .addItem("2. Pasang peringatan emel", "installEmailTriggers")
    .addItem("Uji emel peringatan", "testEmail")
    .addItem("Pratonton peringatan email (log)", "previewTwoDayReminders")
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
  var headers = ensureItemHeaders_(sheet);
  var rows = Math.max(sheet.getMaxRows(), 200);
  sheet.getRange(1, 1, rows, headers.length).setNumberFormat("@");
  sheet.getRange(1, 1, 1, headers.length).setFontWeight("bold");
  sheet.setFrozenRows(1);
  var widths = { id: 220, title: 240, type: 100, brand: 120, date: 110, time: 80, notes: 280, status: 80, remind: 80,
    remindedAt: 180, readAt: 180, createdAt: 180, updatedAt: 180, seriesId: 220, repeat: 160 };
  headers.forEach(function (h, i) { if (widths[h]) sheet.setColumnWidth(i + 1, widths[h]); });
  ensureNotesSheet_();
  Logger.log("Setup siap. Tab Items dan Notes sedia. Zon masa Asia/Kuala_Lumpur.");
  return "Setup siap.";
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
  // Nama dikekalkan untuk menu. Guna peraturan baharu dalam Emel.gs (12 jam / 9 pagi sehari sebelum).
  var due = selectDueReminders_(readAllItems_(), Date.now());
  if (!due.length) {
    console.log("Tiada peringatan perlu dihantar sekarang.");
    return "Tiada";
  }
  var lines = due.map(function (item) {
    var when = item.time ? item.date + " " + item.time : item.date;
    return when + "  " + item.title;
  });
  console.log(lines.join("\n"));
  return lines.join("\n");
}

// ----- Nota (tab Notes) dan gambar (Drive) -----

var NOTE_HEADERS = ["id", "title", "brand", "body", "images", "createdAt", "updatedAt"];
var NOTES_FOLDER = "Content Planner Notes";

function ensureNotesSheet_() {
  var ss = SpreadsheetApp.getActive();
  var sheet = ss.getSheetByName("Notes");
  if (!sheet) sheet = ss.insertSheet("Notes");
  var current = sheet.getRange(1, 1, 1, NOTE_HEADERS.length).getValues()[0].map(function (h) {
    return String(h || "");
  });
  var same = NOTE_HEADERS.every(function (h, i) { return current[i] === h; });
  if (!same) {
    sheet.getRange(1, 1, 1, NOTE_HEADERS.length).setValues([NOTE_HEADERS]);
    sheet.getRange(1, 1, Math.max(sheet.getMaxRows(), 200), NOTE_HEADERS.length).setNumberFormat("@");
    sheet.getRange(1, 1, 1, NOTE_HEADERS.length).setFontWeight("bold");
    sheet.setFrozenRows(1);
  }
  return sheet;
}

function parseNoteImages_(value) {
  var list = value;
  if (typeof value === "string") {
    try {
      list = value ? JSON.parse(value) : [];
    } catch (err) {
      list = [];
    }
  }
  if (!Array.isArray(list)) return [];
  var out = [];
  list.forEach(function (img) {
    if (!img || typeof img !== "object") return;
    var id = String(img.id || "").trim();
    if (!/^[A-Za-z0-9_-]{1,80}$/.test(id)) return;
    out.push({
      id: id,
      fileId: String(img.fileId || "").trim(),
      annotFileId: String(img.annotFileId || "").trim(),
      w: Math.max(0, Math.round(Number(img.w) || 0)),
      h: Math.max(0, Math.round(Number(img.h) || 0))
    });
  });
  return out.slice(0, 30);
}

function normalizeNote_(raw, existing) {
  raw = raw || {};
  var id = cellText_(raw.id).trim();
  if (!id || !/^[A-Za-z0-9_-]{1,80}$/.test(id)) return null;
  var brand = cellText_(raw.brand).trim();
  if (BRANDS.indexOf(brand) < 0) brand = "";
  var now = nowIsoKL_(new Date());
  return {
    id: id,
    title: cellText_(raw.title).trim().slice(0, 200),
    brand: brand,
    body: cellText_(raw.body).slice(0, 20000),
    images: parseNoteImages_(raw.images),
    createdAt: normalizeStamp_(raw.createdAt) || (existing && existing.createdAt) || now,
    updatedAt: normalizeStamp_(raw.updatedAt) || now
  };
}

function readAllNotes_() {
  var sheet = ensureNotesSheet_();
  var values = sheet.getDataRange().getValues();
  var out = [];
  var r;
  for (r = 1; r < values.length; r++) {
    var obj = {};
    NOTE_HEADERS.forEach(function (h, i) { obj[h] = values[r][i]; });
    var note = normalizeNote_(obj, null);
    if (note) out.push(note);
  }
  return out;
}

function noteFileIds_(note) {
  var ids = [];
  (note && note.images ? note.images : []).forEach(function (img) {
    if (img.fileId) ids.push(img.fileId);
    if (img.annotFileId) ids.push(img.annotFileId);
  });
  return ids;
}

function trashFiles_(ids) {
  ids.forEach(function (fileId) {
    try {
      DriveApp.getFileById(fileId).setTrashed(true);
    } catch (err) {
      console.log("Gagal buang fail " + fileId + ": " + err);
    }
  });
}

function noteUpsert_(raw) {
  return withLock_(function () {
    var sheet = ensureNotesSheet_();
    var id = cellText_(raw && raw.id).trim();
    var existing = readAllNotes_().filter(function (n) { return n.id === id; })[0] || null;
    var note = normalizeNote_(raw, existing);
    if (!note) return { ok: false, error: "bad_id" };
    if (existing && (existing.updatedAt || "") > (note.updatedAt || "")) {
      return { ok: true, note: existing, stale: true };
    }
    var row = NOTE_HEADERS.map(function (h) {
      return h === "images" ? JSON.stringify(note.images) : String(note[h] == null ? "" : note[h]);
    });
    var rowIndex = findRowById_(sheet, note.id);
    if (rowIndex === -1) rowIndex = Math.max(sheet.getLastRow(), 1) + 1;
    var range = sheet.getRange(rowIndex, 1, 1, NOTE_HEADERS.length);
    range.setNumberFormat("@");
    range.setValues([row]);
    if (existing) {
      var keep = {};
      noteFileIds_(note).forEach(function (f) { keep[f] = true; });
      trashFiles_(noteFileIds_(existing).filter(function (f) { return !keep[f]; }));
    }
    return { ok: true, note: note };
  });
}

function noteDelete_(id) {
  id = String(id || "").trim();
  if (!id) return { ok: false, error: "not_found" };
  return withLock_(function () {
    var sheet = ensureNotesSheet_();
    var note = readAllNotes_().filter(function (n) { return n.id === id; })[0];
    var rowIndex = findRowById_(sheet, id);
    if (rowIndex !== -1) sheet.deleteRow(rowIndex);
    if (note) trashFiles_(noteFileIds_(note));
    return { ok: true, id: id };
  });
}

function notesFolder_() {
  var it = DriveApp.getFoldersByName(NOTES_FOLDER);
  while (it.hasNext()) {
    var folder = it.next();
    if (!folder.isTrashed()) return folder;
  }
  return DriveApp.createFolder(NOTES_FOLDER);
}

function imageUpload_(body) {
  var data = String(body.dataUrl || body.base64 || "");
  var mimeType = String(body.mimeType || "");
  var comma = data.indexOf(",");
  if (data.slice(0, 5) === "data:" && comma > 0) {
    var head = data.slice(5, comma);
    if (!mimeType) mimeType = head.split(";")[0];
    data = data.slice(comma + 1);
  }
  if (mimeType !== "image/png" && mimeType !== "image/jpeg" && mimeType !== "image/webp") mimeType = "image/png";
  if (!data) return { ok: false, error: "no_image" };
  var name = oneLine_(body.name || "nota").replace(/[^A-Za-z0-9._-]/g, "_").slice(0, 80) || "nota";
  var blob = Utilities.newBlob(Utilities.base64Decode(data), mimeType, name);
  var file = notesFolder_().createFile(blob);
  return { ok: true, fileId: file.getId() };
}

function imageGet_(fileId) {
  fileId = String(fileId || "").trim();
  if (!fileId) return { ok: false, error: "not_found" };
  var file;
  try {
    file = DriveApp.getFileById(fileId);
  } catch (err) {
    return { ok: false, error: "not_found" };
  }
  var blob = file.getBlob();
  var mime = blob.getContentType() || "image/png";
  return { ok: true, fileId: fileId, dataUrl: "data:" + mime + ";base64," + Utilities.base64Encode(blob.getBytes()) };
}
