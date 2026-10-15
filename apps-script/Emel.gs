/**
 * Content Planner: email reminder + buang email sehari selepas tarikh.
 * - Item bermasa: email 12 jam sebelum masa item (selagi masa itu belum lepas).
 * - Item tanpa masa: email jam 9 pagi (Asia/Kuala_Lumpur) sehari sebelum tarikh.
 * Satu email sahaja bagi setiap item (remindedAt menyimpan tarikh yang sudah diingatkan).
 * Item berulang (Ulang) ialah baris berasingan, jadi setiap kejadian diingatkan sendiri.
 * Jalankan installEmailTriggers sekali sahaja (trigger setiap jam). testEmail untuk cuba.
 */

var EMAIL_TAG = "Peringatan Content Planner";

function ownerEmail_() {
  var p = String(PropertiesService.getScriptProperties().getProperty("OWNER_EMAIL") || "").trim();
  return p || Session.getEffectiveUser().getEmail();
}

function buildEmail_(item) {
  var when = formatMalayDate_(item.date) + (item.time ? ", " + item.time : "");
  var subject = EMAIL_TAG + " [" + item.date + "] Peringatan: " + item.title;
  var lines = [
    item.title,
    "",
    "Tarikh: " + when,
    "Brand: " + (item.brand || "-"),
    "Jenis: " + typeLabel_(item.type)
  ];
  if (item.notes) lines.push("", "Nota: " + String(item.notes).slice(0, 500));
  var app = appUrl_();
  if (app) lines.push("", "Buka: " + app);
  lines.push("", "Email ini akan dibuang sendiri sehari selepas tarikh tersebut.");
  return { subject: subject, body: lines.join("\n") };
}

var KL_OFFSET_MS_ = 8 * 3600 * 1000; // Asia/Kuala_Lumpur, UTC+8, tiada DST

// Waktu sebenar (ms epoch) bagi tarikh + masa KL. time kosong = 00:00.
function klEpochMs_(iso, time) {
  var d = String(iso).split("-");
  var t = String(time || "00:00").split(":");
  return Date.UTC(+d[0], +d[1] - 1, +d[2], +t[0] || 0, +t[1] || 0) - KL_OFFSET_MS_;
}

// Saat email patut dihantar & had akhir (eksklusif) penghantaran.
function reminderWindow_(item) {
  var hasTime = /^\d{1,2}:\d{2}$/.test(String(item.time || "").trim());
  if (hasTime) {
    var at = klEpochMs_(item.date, item.time);
    return { from: at - 12 * 3600 * 1000, until: at };
  }
  // Tanpa masa: 9 pagi sehari sebelum, selagi tarikh item belum lepas (hingga hujung hari itu).
  return { from: klEpochMs_(addIsoDays_(item.date, -1), "09:00"), until: klEpochMs_(addIsoDays_(item.date, 1), "00:00") };
}

function isReminderDue_(item, nowMs) {
  if (!item || item.remind !== "on" || item.status === "Siap") return false;
  if (!isIsoDate_(item.date)) return false;
  if (alreadyRemindedFor_(item.remindedAt, item.date)) return false;
  var w = reminderWindow_(item);
  return nowMs >= w.from && nowMs < w.until;
}

function selectDueReminders_(items, nowMs) {
  return (items || []).filter(function (item) { return isReminderDue_(item, nowMs); });
}

function sendEmailReminders() {
  var due = selectDueReminders_(readAllItems_(), Date.now());
  var to = ownerEmail_();
  due.forEach(function (item) {
    try {
      var mail = buildEmail_(item);
      GmailApp.sendEmail(to, mail.subject, mail.body);
      markReminded_(item.id, item.date);
    } catch (err) {
      console.log("Gagal hantar untuk " + item.title + ": " + err);
    }
  });
  return due.length;
}

function cleanupReminderEmails() {
  var today = todayKL_(new Date());
  var threads = GmailApp.search('subject:"' + EMAIL_TAG + '"', 0, 100);
  var removed = 0;
  threads.forEach(function (thread) {
    var m = String(thread.getFirstMessageSubject() || "").match(/\[(\d{4}-\d{2}-\d{2})\]/);
    if (!m) return;
    if (today >= addIsoDays_(m[1], 1)) {
      thread.moveToTrash();
      removed++;
    }
  });
  return removed;
}

function runEmailReminders() {
  cleanupReminderEmails();
  sendEmailReminders();
}

function installEmailTriggers() {
  ScriptApp.getProjectTriggers().forEach(function (t) {
    if (t.getHandlerFunction() === "runEmailReminders") ScriptApp.deleteTrigger(t);
  });
  ScriptApp.newTrigger("runEmailReminders").timeBased().everyHours(1).create();
  console.log("Siap. Semakan peringatan email berjalan setiap jam.");
}

function testEmail() {
  GmailApp.sendEmail(ownerEmail_(), EMAIL_TAG + " (ujian)", "Email peringatan Content Planner berfungsi.");
  console.log("Email ujian dihantar ke " + ownerEmail_());
}
