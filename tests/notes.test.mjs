import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  fitInto,
  fitSize,
  mergeNotes,
  normalizeNote,
  noteTitle,
  pendingUploads,
  referencedImageIds,
  sortNotes,
  strokeWidth,
  toImageSpace,
} from "../js/notes.js";
import { queueNoteOp } from "../js/storage.js";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

// normalizeNote
const n = normalizeNote({ id: "n1", title: "  Open Day ", brand: "Brutti", body: "a", images: '[{"id":"i1","fileId":"F","w":"1600.4","h":900}]', updatedAt: "2026-10-12T10:00:00+08:00" });
assert.equal(n.title, "Open Day");
assert.equal(n.brand, "Brutti");
assert.deepEqual(n.images, [{ id: "i1", fileId: "F", annotFileId: "", w: 1600, h: 900 }]);
assert.equal(normalizeNote({ id: "n2", brand: "Bukan" }).brand, "");
assert.equal(normalizeNote({ id: "bad id!" }), null);
assert.equal(normalizeNote({ id: "n3", images: "not json" }).images.length, 0);
assert.equal(noteTitle({ title: "", body: "\n  Baris satu\nDua" }), "Baris satu");
assert.equal(noteTitle({ title: "", body: "" }), "Nota tanpa tajuk");

// mergeNotes: last-write-wins, local wins tie, tombstones
const older = { id: "a", title: "lama", updatedAt: "2026-10-01T09:00:00+08:00" };
const newer = { id: "a", title: "baru", updatedAt: "2026-10-02T09:00:00+08:00" };
assert.equal(mergeNotes([older], [newer])[0].title, "baru");
assert.equal(mergeNotes([newer], [older])[0].title, "baru");
assert.equal(mergeNotes([{ ...older, title: "local" }], [{ ...older, title: "server" }])[0].title, "local");
assert.equal(mergeNotes([], [older], { a: "2026-10-01T09:00:00+08:00" }).length, 0);
assert.equal(mergeNotes([], [newer], { a: "2026-10-01T09:00:00+08:00" }).length, 1);
assert.deepEqual(mergeNotes([{ id: "x", updatedAt: "1" }], [{ id: "y", updatedAt: "2" }]).map((r) => r.id).sort(), ["x", "y"]);
assert.deepEqual(sortNotes([older, { ...newer, id: "b" }].map(normalizeNote)).map((r) => r.id), ["b", "a"]);

// resize math
assert.deepEqual(fitSize(4000, 3000), { w: 1600, h: 1200, scale: 0.4 });
assert.deepEqual(fitSize(1080, 1920), { w: 900, h: 1600, scale: 1600 / 1920 });
assert.deepEqual(fitSize(800, 600), { w: 800, h: 600, scale: 1 });
assert.deepEqual(fitSize(1600, 10), { w: 1600, h: 10, scale: 1 });
assert.equal(fitSize(5000, 1).h, 1);
const fit = fitInto(1600, 1200, 390, 700);
assert.equal(fit.w, 390);
assert.equal(fit.h, 292);
assert.equal(fitInto(900, 1600, 1280, 640).h, 640);

// pointer mapping and pen width
assert.deepEqual(toImageSpace(150, 250, { left: 50, top: 50, width: 400, height: 300 }, 1600, 1200), { x: 400, y: 800 });
assert.equal(strokeWidth(3, 0.25), 12);
assert.equal(strokeWidth(3, 0), 3);

// pending uploads + refs
const note = normalizeNote({ id: "n", images: [{ id: "i1", fileId: "" }, { id: "i2", fileId: "F2", annotFileId: "" }, { id: "i3", fileId: "F3", annotFileId: "A3" }] });
const local = new Set(["o:i1", "a:i2", "o:i3", "a:i3"]);
assert.deepEqual(pendingUploads(note, (k) => local.has(k)).map((j) => `${j.kind}:${j.img.id}`), ["o:i1", "a:i2"]);
assert.deepEqual([...referencedImageIds([note])], ["i1", "i2", "i3"]);

// outbox keeps one op per note
let box = queueNoteOp([], { op: "upsert", id: "a" });
box = queueNoteOp(box, { op: "upsert", id: "b" });
box = queueNoteOp(box, { op: "delete", id: "a" });
assert.deepEqual(box, [{ op: "upsert", id: "b" }, { op: "delete", id: "a" }]);

// Apps Script: routes, Notes tab, Drive, scopes, Emel.gs helpers kept
const gs = fs.readFileSync(path.join(root, "apps-script/Code.gs"), "utf8");
for (const action of ["notesList", "noteUpsert", "noteDelete", "imageUpload", "imageGet"]) {
  assert.match(gs, new RegExp(`action === "${action}"`));
}
assert.match(gs, /"id", "title", "brand", "body", "images", "createdAt", "updatedAt"/);
assert.match(gs, /Content Planner Notes/);
assert.match(gs, /setTrashed\(true\)/);
const setupSrc = gs.slice(gs.indexOf("function setup()"), gs.indexOf("function ensureNtfyTopic_"));
assert.match(setupSrc, /ensureNotesSheet_\(\)/);
const routeSrc = gs.slice(gs.indexOf("function route_("), gs.indexOf("function json_("));
assert.ok(routeSrc.indexOf("isAuthorized_") < routeSrc.indexOf("notesList"));
const emel = fs.readFileSync(path.join(root, "apps-script/Emel.gs"), "utf8");
for (const helper of ["formatMalayDate_", "typeLabel_", "appUrl_", "todayKL_", "selectTwoDayReminders", "readAllItems_", "markReminded_", "addIsoDays_"]) {
  assert.match(emel + "", new RegExp(helper.replace(/_$/, "_")));
  assert.match(gs, new RegExp(`function ${helper}\\(`));
}
assert.match(gs, /var TZ = /);
const manifest = JSON.parse(fs.readFileSync(path.join(root, "apps-script/appsscript.json"), "utf8"));
for (const scope of ["spreadsheets.currentonly", "script.external_request", "script.scriptapp", "https://mail.google.com/", "userinfo.email", "https://www.googleapis.com/auth/drive"]) {
  assert.ok(manifest.oauthScopes.some((s) => s.includes(scope)), scope);
}

// Client wiring
const html = fs.readFileSync(path.join(root, "index.html"), "utf8");
assert.equal((html.match(/data-nav="nota"/g) || []).length, 2);
const sw = fs.readFileSync(path.join(root, "sw.js"), "utf8");
for (const f of ["notes.js", "notes-ui.js", "draw.js", "imgstore.js"]) assert.match(sw, new RegExp(`./js/${f}`));
const draw = fs.readFileSync(path.join(root, "js/draw.js"), "utf8");
assert.match(draw, /destination-out/);
assert.match(draw, /pointerdown/);
const css = fs.readFileSync(path.join(root, "css/app.css"), "utf8");
assert.match(css, /touch-action: none/);

console.log("notes tests ok");
