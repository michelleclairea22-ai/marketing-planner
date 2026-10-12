/**
 * Content Planner: email reminder 2 hari sebelum + buang email sehari selepas tarikh.
 * Jalankan installEmailTriggers sekali sahaja. testEmail untuk cuba.
 */

var EMAIL_TAG = "Peringatan Content Planner";

function ownerEmail_() {
  var p = String(PropertiesService.getScriptProperties().getProperty("OWNER_EMAIL") || "").trim();
  return p || Session.getEffectiveUser().getEmail();
}

function buildEmail_(item) {
  var when = formatMalayDate_(item.date) + (item.time ? ", " + item.time : "");
  var subject = EMAIL_TAG + " [" + item.date + "] 2 hari lagi: " + item.title;
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

function sendEmailReminders() {
  var today = todayKL_(new Date());
  var due = selectTwoDayReminders(readAllItems_(), today);
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
  ScriptApp.getProjectTriggers().forEach(function (t) { ScriptApp.deleteTrigger(t); });
  ScriptApp.newTrigger("runEmailReminders").timeBased().everyDays(1).atHour(9).inTimezone(TZ).create();
  console.log("Siap. Peringatan email akan dihantar setiap hari sekitar 9 pagi.");
}

function testEmail() {
  GmailApp.sendEmail(ownerEmail_(), EMAIL_TAG + " (ujian)", "Email peringatan Content Planner berfungsi.");
  console.log("Email ujian dihantar ke " + ownerEmail_());
}
