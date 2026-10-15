// Nota view: list, editor, offline outbox and sync with the Notes tab + Drive.
import { apiImageGet, apiImageUpload, apiNoteDelete, apiNoteUpsert, apiNotesList } from "./api.js";
import { blankPage, openAnnotator, prepareImage } from "./draw.js";
import { imgClear, imgDel, imgGet, imgKeys, imgPut } from "./imgstore.js";
import { BRANDS, brandColor, esc, newId } from "./model.js";
import { checklistProgress, mergeNotes, normalizeNote, noteTitle, parseLines, plainBody, toggleLine, pendingUploads, referencedImageIds, sortNotes } from "./notes.js";
import {
  clearLocalNotes,
  loadNoteOutbox,
  loadNoteTombs,
  loadNotes,
  queueNoteOp,
  saveNoteOutbox,
  saveNoteTombs,
  saveNotes,
} from "./storage.js";
import { formatShortDate, nowIsoKL } from "./time.js";

let ctx = null; // { toast, mapError, settings(), configured(), onChange() }
const urls = new Map(); // key -> dataUrl (memory cache)
const ui = { notes: [], draft: null, draftData: new Map(), confirmDelete: false, syncing: false, busy: false };

export function initNotes(hooks) {
  ctx = hooks;
  ui.notes = loadNotes().map(normalizeNote).filter(Boolean);
}

export function notesCount() {
  return ui.notes.length;
}

async function getUrl(key) {
  if (ui.draftData.has(key)) return ui.draftData.get(key).dataUrl;
  if (urls.has(key)) return urls.get(key);
  const rec = await imgGet(key);
  if (rec?.dataUrl) urls.set(key, rec.dataUrl);
  return rec?.dataUrl || "";
}

function stackHtml(img, cls = "") {
  return `<span class="ni-stack ${cls}" style="aspect-ratio:${img.w || 4} / ${img.h || 3}">
    <img alt="" data-src="o:${esc(img.id)}"><img alt="" class="ni-annot" data-src="a:${esc(img.id)}">
  </span>`;
}

// Fill <img data-src> elements from cache/IndexedDB. Hides missing annotation layers.
export async function hydrate(root = document) {
  const nodes = [...root.querySelectorAll("img[data-src]")];
  await Promise.all(nodes.map(async (el) => {
    const url = await getUrl(el.dataset.src);
    if (url) {
      if (el.getAttribute("src") !== url) el.src = url;
      el.hidden = false;
    } else {
      el.removeAttribute("src");
      el.hidden = true;
    }
  }));
}

export function renderNotesView() {
  const notes = sortNotes(ui.notes);
  const cards = notes.map((note) => {
    const first = note.images[0];
    const brand = note.brand ? `<span class="badge-soft"><i class="dot" style="background:${brandColor(note.brand)}"></i>${esc(note.brand)}</span>` : "";
    const plain = plainBody(note.body);
    const snippet = plain.trim() ? `<p class="row-notes">${esc(plain.slice(0, 160))}</p>` : "";
    const prog = checklistProgress(note.body);
    const progress = prog.done ? `<span class="badge-soft badge-prog">${prog.done}/${prog.total} ✓</span>` : "";
    const siap = note.done ? `<span class="badge-soft badge-siap">SIAP</span>` : "";
    const count = note.images.length > 1 ? `<span class="badge-soft">${note.images.length} gambar</span>` : "";
    return `<div class="nota-wrap${note.done ? " is-siap" : ""}"><button type="button" class="nota-card" data-note="${esc(note.id)}">
      ${first ? stackHtml(first, "nota-thumb") : `<span class="nota-thumb nota-thumb-empty" aria-hidden="true"><svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M6 3h9l5 5v13a1 1 0 0 1-1 1H6a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1z"/><path d="M14 3v6h6M8 13h8M8 17h6"/></svg></span>`}
      <span class="nota-info">
        <span class="row-title">${esc(noteTitle(note))}</span>
        ${snippet}
        <span class="badges">${siap}${brand}${progress}<span class="badge-soft">Dikemas ${esc(formatShortDate((note.updatedAt || "").slice(0, 10)))}</span>${count}</span>
      </span>
    </button><button type="button" class="nota-quick${note.done ? " on" : ""}" data-note-siap="${esc(note.id)}" aria-pressed="${note.done}" aria-label="${note.done ? "Tanda belum siap" : "Tanda siap"}" title="${note.done ? "Tanda belum siap" : "Tanda siap"}">✓</button></div>`;
  }).join("");
  return `<div class="nota-view" data-testid="nota-list">
    <div class="notis-head">
      <p class="section-label">Nota</p>
      <div class="notis-tools">
        <button type="button" class="btn-primary" data-note-new>+ Nota baru</button>
      </div>
    </div>
    ${notes.length ? `<div class="nota-grid">${cards}</div>` : `<div class="empty"><p>Tiada nota lagi.</p><p class="muted">Tekan + Nota baru. Tambah teks, gambar, atau lukis atas gambar.</p></div>`}
  </div>`;
}

// ----- Editor -----

function draftImagesHtml() {
  return ui.draft.images.map((img) => `<div class="ne-img" data-img="${esc(img.id)}">
      ${stackHtml(img)}
      <div class="ne-img-actions">
        <button type="button" class="btn-ghost" data-img-draw="${esc(img.id)}">Lukis</button>
        <button type="button" class="btn-ghost" data-img-remove="${esc(img.id)}">Buang</button>
      </div>
    </div>`).join("");
}

function paintDraftImages() {
  const box = document.getElementById("ne-images");
  if (!box) return;
  box.innerHTML = draftImagesHtml();
  hydrate(box);
}

export function openNoteEditor(id) {
  const existing = id ? ui.notes.find((n) => n.id === id) : null;
  ui.draft = existing ? structuredClone(existing) : { id: newId(), title: "", brand: "", body: "", done: false, images: [], createdAt: "", updatedAt: "" };
  ui.draft.isNew = !existing;
  ui.draftData = new Map();
  ui.confirmDelete = false;
  const modal = document.getElementById("modal");
  const brandOpts = [`<option value="">Tiada</option>`].concat(BRANDS.map((b) => `<option value="${esc(b.id)}"${b.id === ui.draft.brand ? " selected" : ""}>${esc(b.id)}</option>`)).join("");
  modal.innerHTML = `<button type="button" class="backdrop" data-close-note aria-label="Tutup"></button>
    <form class="dialog dialog-wide" id="note-form" data-testid="note-form">
      <h2>${existing ? "Edit nota" : "Nota baru"}</h2>
      <div class="form-row">
        <label class="field"><span>Tajuk</span><input id="n-title" maxlength="200" value="${esc(ui.draft.title)}" autocomplete="off" placeholder="Contoh: Senarai semak Brutti Open Day"></label>
        <label class="field"><span>Brand (pilihan)</span>
          <span class="brand-pick"><i class="dot" id="n-brand-dot" style="background:${ui.draft.brand ? brandColor(ui.draft.brand) : "transparent"}"></i>
          <select id="n-brand">${brandOpts}</select></span>
        </label>
      </div>
      <label class="field"><span>Nota</span><textarea id="n-body" maxlength="20000" rows="6">${esc(ui.draft.body)}</textarea></label>
      <div class="field"><span>Senarai semak <small class="muted">(tekan kotak untuk tanda)</small></span>
        <div id="ne-check" class="ne-check" data-testid="note-checklist"></div>
      </div>
      <label class="ne-siap"><input type="checkbox" id="n-done"${ui.draft.done ? " checked" : ""}> Nota ini <b>Siap</b></label>
      <div class="field"><span>Gambar</span>
        <div id="ne-images" class="ne-images"></div>
        <div class="ne-add">
          <label class="btn-ghost ne-file">+ Gambar<input id="n-file" type="file" accept="image/*" multiple hidden></label>
          <button type="button" class="btn-ghost" data-img-blank>Lukisan kosong</button>
        </div>
      </div>
      <p class="form-error" id="note-error"></p>
      <div class="dialog-actions">
        ${existing ? `<button type="button" class="btn-danger" id="btn-note-delete">Padam</button>` : ""}
        <span class="spacer"></span>
        <button type="button" class="btn-ghost" data-close-note>Batal</button>
        <button type="submit" class="btn-primary">Simpan</button>
      </div>
    </form>`;
  modal.hidden = false;
  paintDraftImages();
  paintChecklist();
}

function paintChecklist() {
  const box = document.getElementById("ne-check");
  const body = document.getElementById("n-body")?.value || "";
  if (!box) return;
  const lines = parseLines(body).filter((l) => !l.empty);
  box.innerHTML = lines.length ? lines.map((l) => `<button type="button" class="ne-line${l.checked ? " done" : ""}" data-tick-line="${l.index}" aria-pressed="${l.checked}">
      <span class="ne-box" aria-hidden="true">${l.checked ? "✓" : ""}</span><span class="ne-text">${esc(l.text.trim())}</span></button>`).join("")
    : `<p class="muted">Tulis nota di atas, satu perkara satu baris.</p>`;
}

// Tick/Siap changes on an existing note save immediately (like a normal edit), keeping the editor open.
function quickPersist() {
  readForm();
  const draft = ui.draft;
  const stored = draft && ui.notes.find((n) => n.id === draft.id);
  if (!stored) return; // new note: saved with Simpan
  const stamp = nowIsoKL();
  const note = normalizeNote({ ...stored, body: draft.body, done: draft.done, updatedAt: stamp });
  draft.updatedAt = stamp;
  saveLocal(note);
  ctx.onChange();
  queue({ op: "upsert", id: note.id });
  flushSoon();
}

function toggleNoteDone(id) {
  const stored = ui.notes.find((n) => n.id === id);
  if (!stored) return;
  const note = normalizeNote({ ...stored, done: !stored.done, updatedAt: nowIsoKL() });
  saveLocal(note);
  ctx.toast(note.done ? "Nota ditanda Siap" : "Nota belum siap");
  ctx.onChange();
  queue({ op: "upsert", id: note.id });
  flushSoon();
}

function readForm() {
  if (!ui.draft) return;
  ui.draft.title = document.getElementById("n-title")?.value.trim() || "";
  ui.draft.brand = document.getElementById("n-brand")?.value || "";
  ui.draft.body = document.getElementById("n-body")?.value || "";
  const done = document.getElementById("n-done");
  if (done) ui.draft.done = done.checked;
}

export function closeNoteEditor() {
  const modal = document.getElementById("modal");
  modal.hidden = true;
  modal.innerHTML = "";
  ui.draft = null;
  ui.draftData = new Map();
  ui.confirmDelete = false;
}

export function noteEditorOpen() {
  return Boolean(ui.draft);
}

async function addFiles(files) {
  const err = document.getElementById("note-error");
  for (const file of files) {
    if (!/^image\//.test(file.type || "")) continue;
    try {
      if (err) err.textContent = "Memproses gambar…";
      const out = await prepareImage(file);
      const id = newId();
      ui.draftData.set(`o:${id}`, { dataUrl: out.dataUrl, fileId: "" });
      ui.draft?.images.push({ id, fileId: "", annotFileId: "", w: out.w, h: out.h });
    } catch {
      ctx.toast("Gambar tak dapat dibuka.");
    }
  }
  if (err) err.textContent = "";
  paintDraftImages();
}

async function drawOn(imageId) {
  const img = ui.draft?.images.find((i) => i.id === imageId);
  if (!img) return;
  const original = await getUrl(`o:${img.id}`);
  if (!original) {
    ctx.toast("Gambar belum dimuat turun. Cuba lagi bila dalam talian.");
    return;
  }
  const annot = await getUrl(`a:${img.id}`);
  const result = await openAnnotator({ original, annot, w: img.w, h: img.h });
  if (!result || !ui.draft) return;
  ui.draftData.set(`a:${img.id}`, { dataUrl: result.annot, fileId: "" });
  img.annotFileId = "";
  paintDraftImages();
}

async function addBlank() {
  const out = blankPage();
  const id = newId();
  ui.draftData.set(`o:${id}`, { dataUrl: out.dataUrl, fileId: "" });
  ui.draft.images.push({ id, fileId: "", annotFileId: "", w: out.w, h: out.h });
  paintDraftImages();
  await drawOn(id);
}

async function saveDraft() {
  readForm();
  const draft = ui.draft;
  if (!draft) return;
  if (!draft.title && !draft.body.trim() && !draft.images.length) {
    document.getElementById("note-error").textContent = "Isi tajuk, nota, atau tambah gambar.";
    return;
  }
  const stamp = nowIsoKL();
  const note = normalizeNote({ ...draft, createdAt: draft.createdAt || stamp, updatedAt: stamp });
  const prev = ui.notes.find((n) => n.id === note.id);
  for (const [key, rec] of ui.draftData) {
    if (key.startsWith("a:") && !rec.dataUrl) {
      await imgDel(key);
      urls.delete(key);
    } else {
      await imgPut(key, rec);
      urls.set(key, rec.dataUrl);
    }
  }
  // Remove local data for images taken out of the note.
  const keep = new Set(note.images.map((i) => i.id));
  for (const img of prev?.images || []) {
    if (!keep.has(img.id)) await dropImage(img.id);
  }
  closeNoteEditor();
  saveLocal(note);
  ctx.toast("Nota disimpan");
  ctx.onChange();
  queue({ op: "upsert", id: note.id });
  flushSoon();
}

async function dropImage(id) {
  for (const k of [`o:${id}`, `a:${id}`]) {
    await imgDel(k);
    urls.delete(k);
  }
}

function saveLocal(note) {
  const i = ui.notes.findIndex((n) => n.id === note.id);
  if (i >= 0) ui.notes[i] = note;
  else ui.notes.push(note);
  saveNotes(ui.notes);
}

function queue(op) {
  saveNoteOutbox(queueNoteOp(loadNoteOutbox(), op));
}

async function deleteDraft() {
  const id = ui.draft?.id;
  if (!id) return;
  const note = ui.notes.find((n) => n.id === id);
  closeNoteEditor();
  ui.notes = ui.notes.filter((n) => n.id !== id);
  saveNotes(ui.notes);
  const tombs = loadNoteTombs();
  tombs[id] = nowIsoKL();
  saveNoteTombs(tombs);
  for (const img of note?.images || []) await dropImage(img.id);
  ctx.toast("Nota dipadam");
  ctx.onChange();
  queue({ op: "delete", id });
  flushSoon();
}

// Returns true when the click was handled here.
export function handleNotesClick(event) {
  const t = event.target;
  if (t.closest("[data-note-new]")) { openNoteEditor(null); return true; }
  const quick = t.closest("[data-note-siap]");
  if (quick) { toggleNoteDone(quick.dataset.noteSiap); return true; }
  const open = t.closest("[data-note]");
  if (open) { openNoteEditor(open.dataset.note); return true; }
  if (!ui.draft) return false;
  if (t.closest("[data-close-note]")) { closeNoteEditor(); return true; }
  const tick = t.closest("[data-tick-line]");
  if (tick) {
    const area = document.getElementById("n-body");
    if (area) {
      area.value = toggleLine(area.value, Number(tick.dataset.tickLine));
      paintChecklist();
      quickPersist();
    }
    return true;
  }
  const draw = t.closest("[data-img-draw]");
  if (draw) { readForm(); drawOn(draw.dataset.imgDraw); return true; }
  const rm = t.closest("[data-img-remove]");
  if (rm) {
    const id = rm.dataset.imgRemove;
    ui.draft.images = ui.draft.images.filter((i) => i.id !== id);
    ui.draftData.delete(`o:${id}`);
    ui.draftData.delete(`a:${id}`);
    paintDraftImages();
    return true;
  }
  if (t.closest("[data-img-blank]")) { readForm(); addBlank(); return true; }
  const del = t.closest("#btn-note-delete");
  if (del) {
    if (!ui.confirmDelete) {
      ui.confirmDelete = true;
      del.textContent = "Pasti padam?";
      return true;
    }
    deleteDraft();
    return true;
  }
  return false;
}

export function bindNotes() {
  document.body.addEventListener("input", (event) => {
    if (event.target.id === "n-body") paintChecklist();
  });
  document.body.addEventListener("submit", (event) => {
    if (event.target.id !== "note-form") return;
    event.preventDefault();
    saveDraft();
  });
  document.body.addEventListener("change", (event) => {
    if (event.target.id === "n-file") {
      const files = [...(event.target.files || [])];
      event.target.value = "";
      addFiles(files);
    } else if (event.target.id === "n-done") {
      quickPersist();
    } else if (event.target.id === "n-brand") {
      const dot = document.getElementById("n-brand-dot");
      if (dot) dot.style.background = event.target.value ? brandColor(event.target.value) : "transparent";
    }
  });
}

// ----- Sync -----

let flushTimer = 0;
function flushSoon() {
  clearTimeout(flushTimer);
  flushTimer = setTimeout(() => syncNotes({ quiet: true, pushOnly: true }), 50);
}

async function uploadPending(note) {
  const keys = new Set(await imgKeys());
  const jobs = pendingUploads(note, (k) => keys.has(k));
  for (const { img, kind } of jobs) {
    const key = `${kind}:${img.id}`;
    const rec = await imgGet(key);
    if (!rec?.dataUrl) continue;
    const res = await apiImageUpload(ctx.settings(), rec.dataUrl, `${note.id}-${img.id}-${kind === "o" ? "asal" : "lukisan"}`);
    await imgPut(key, { dataUrl: rec.dataUrl, fileId: res.fileId });
    if (kind === "o") img.fileId = res.fileId;
    else img.annotFileId = res.fileId;
    const current = ui.notes.find((n) => n.id === note.id);
    const target = current?.images.find((i) => i.id === img.id);
    if (target) {
      if (kind === "o") target.fileId = res.fileId;
      else target.annotFileId = res.fileId;
      saveNotes(ui.notes);
    }
  }
}

async function flushNoteOutbox() {
  const box = loadNoteOutbox();
  for (let i = 0; i < box.length; i += 1) {
    const op = box[i];
    try {
      if (op.op === "delete") {
        await apiNoteDelete(ctx.settings(), op.id);
        const tombs = loadNoteTombs();
        delete tombs[op.id];
        saveNoteTombs(tombs);
      } else {
        const note = ui.notes.find((n) => n.id === op.id);
        if (note) {
          await uploadPending(note);
          const fresh = ui.notes.find((n) => n.id === op.id) || note;
          await apiNoteUpsert(ctx.settings(), fresh);
        }
      }
      saveNoteOutbox(loadNoteOutbox().filter((row) => !(row.id === op.id && row.op === op.op)));
    } catch (err) {
      throw err;
    }
  }
}

// Download images we don't have (or that changed on another device).
async function fetchMissingImages() {
  for (const note of ui.notes) {
    for (const img of note.images) {
      for (const [kind, fileId] of [["o", img.fileId], ["a", img.annotFileId]]) {
        const key = `${kind}:${img.id}`;
        const rec = await imgGet(key);
        if (fileId) {
          if (rec?.fileId === fileId) continue;
          if (rec && !rec.fileId) continue; // local edit waiting to upload
          try {
            const res = await apiImageGet(ctx.settings(), fileId);
            await imgPut(key, { dataUrl: res.dataUrl, fileId });
            urls.set(key, res.dataUrl);
          } catch {
            // Try again next sync.
          }
        } else if (kind === "a" && rec?.fileId) {
          await imgDel(key); // annotation cleared on another device
          urls.delete(key);
        }
      }
    }
  }
}

async function cleanupImages() {
  const refs = referencedImageIds(ui.notes);
  for (const key of await imgKeys()) {
    const id = String(key).slice(2);
    if (!refs.has(id)) await imgDel(key);
  }
}

export async function syncNotes(opts = {}) {
  if (!ctx) return;
  if (!ctx.configured()) {
    if (!opts.pushOnly) cleanupImages();
    return;
  }
  if (ui.syncing) return;
  ui.syncing = true;
  try {
    await flushNoteOutbox();
    if (!opts.pushOnly) {
      const remote = ((await apiNotesList(ctx.settings())).notes || []).map(normalizeNote).filter(Boolean);
      const tombs = loadNoteTombs();
      for (const id of Object.keys(tombs)) {
        if (!remote.some((n) => n.id === id)) delete tombs[id];
      }
      saveNoteTombs(tombs);
      const merged = mergeNotes(ui.notes, remote, tombs);
      ui.notes = merged;
      saveNotes(ui.notes);
      ctx.onChange();
      await fetchMissingImages();
      await cleanupImages();
      ctx.onChange();
    }
  } catch (err) {
    if (!opts.quiet) ctx.toast(ctx.mapError(err));
  } finally {
    ui.syncing = false;
  }
}

// Called right after first connecting: push every local note.
export function queueAllNotes() {
  let box = loadNoteOutbox();
  for (const note of ui.notes) box = queueNoteOp(box, { op: "upsert", id: note.id });
  saveNoteOutbox(box);
}

export async function clearNotesCache() {
  clearLocalNotes();
  ui.notes = [];
  urls.clear();
  await imgClear();
}

export function hasPendingNotes() {
  return loadNoteOutbox().length > 0;
}
