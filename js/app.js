import {
  apiDelete,
  apiList,
  apiMarkAllRead,
  apiMarkRead,
  apiPing,
  apiSetStatus,
  apiUpsert,
  cleanWebAppUrl,
} from "./api.js";
import { typeIcon } from "./icons.js";
import {
  BRANDS,
  TYPES,
  brandColor,
  esc,
  isSampleId,
  mergeItems,
  newId,
  normalizeItem,
  passFilter,
  sortForDay,
  sortForList,
  typeLabel,
  withoutSamples,
} from "./model.js";
import { buildNotifications, isUnread, unreadCount } from "./notify.js";
import {
  clearLocalData,
  discardSampleQueue,
  isConfigured,
  loadItems,
  loadOutbox,
  loadSettings,
  loadTombs,
  purgeSampleData,
  saveItems,
  saveOutbox,
  saveSettings,
  saveTombs,
} from "./storage.js";
import {
  WEEKDAYS,
  WEEKDAYS_MON,
  addDays,
  addMonths,
  formatDayHeading,
  formatListHeading,
  formatMonthTitle,
  formatShortDate,
  formatWeekTitle,
  monthMatrix,
  nowIsoKL,
  startOfWeek,
  todayISO,
  weekdaySun0,
} from "./time.js";

const VIEWS = ["bulan", "minggu", "senarai", "notis", "tetapan"];
const DESKTOP = window.matchMedia("(min-width: 1100px)");

const state = {
  view: null,
  items: [],
  settings: { webAppUrl: "", accessKey: "" },
  filters: { brand: "Semua", type: "Semua", status: "Semua", q: "" },
  cursor: "",
  selectedDate: "",
  today: "",
  mode: "demo",
  syncedAt: "",
  syncError: "",
  syncing: false,
  editing: null,
  confirmDelete: false,
};

function configured() {
  return isConfigured(state.settings);
}

function isDesktop() {
  return DESKTOP.matches;
}

function refreshToday() {
  state.today = todayISO();
}

function parseHash() {
  const hash = location.hash.replace(/^#/, "").toLowerCase();
  return VIEWS.includes(hash) ? hash : "bulan";
}

function go(view) {
  if (!VIEWS.includes(view)) view = "bulan";
  if (parseHash() !== view) location.hash = view;
  else applyView(view);
}

function applyView(view) {
  const same = state.view === view && document.getElementById("view").dataset.current === view;
  state.view = view;
  updateChrome();
  if (!same) renderView({ force: true });
  renderDayPanel();
  renderBadges();
  if (isDesktop()) closeSheet();
}

function syncLabel() {
  if (state.mode === "syncing") return "Menyegerak…";
  if (state.mode === "pending") return "Belum naik";
  if (state.mode === "error") return "Ralat";
  if (state.mode === "synced") return state.syncedAt ? `Disegerak ${state.syncedAt.slice(11, 16)}` : "Disegerak";
  return "Demo";
}

function updateChrome() {
  refreshToday();
  document.body.dataset.view = state.view || "";
  document.body.dataset.mode = state.mode;
  const cal = state.view === "bulan" || state.view === "minggu" || state.view === "senarai";
  document.getElementById("pager").hidden = !cal;
  document.getElementById("btn-today").hidden = !cal;
  document.getElementById("filter-row").hidden = !cal;
  document.getElementById("segment").hidden = state.view === "tetapan";
  document.getElementById("demo-banner").hidden = state.mode !== "demo";
  let title = "Content Planner";
  if (state.view === "bulan" || state.view === "senarai") title = formatMonthTitle(state.cursor);
  else if (state.view === "minggu") title = formatWeekTitle(state.cursor);
  else if (state.view === "notis") title = "Notifikasi";
  else if (state.view === "tetapan") title = "Tetapan";
  document.getElementById("period-title").textContent = title;
  document.querySelectorAll("[data-nav]").forEach((btn) => {
    btn.classList.toggle("is-active", btn.dataset.nav === state.view);
  });
  document.querySelectorAll("[data-brand]").forEach((btn) => {
    btn.classList.toggle("is-active", btn.dataset.brand === state.filters.brand);
  });
  document.querySelectorAll("[data-type]").forEach((btn) => {
    btn.classList.toggle("is-active", btn.dataset.type === state.filters.type);
  });
  document.querySelectorAll("[data-status]").forEach((btn) => {
    btn.classList.toggle("is-active", btn.dataset.status === state.filters.status);
  });
  const label = syncLabel();
  document.querySelectorAll("[data-sync-label]").forEach((el) => {
    el.textContent = label;
  });
}

function renderBadges() {
  const count = unreadCount(state.items, state.today);
  for (const id of ["bell-badge", "nav-badge", "tab-badge"]) {
    const el = document.getElementById(id);
    if (!el) continue;
    el.hidden = count <= 0;
    el.textContent = count > 99 ? "99+" : String(count);
  }
}

function visibleItems() {
  return state.items.filter((item) => passFilter(item, state.filters));
}

function chipHtml(item) {
  const done = item.status === "Siap" ? "is-done" : "";
  return `<button type="button" class="chip ${done}" data-open="${esc(item.id)}" style="--b:${brandColor(item.brand)}" title="${esc(item.title)}">
    <span class="dot"></span>
    <span class="ti">${typeIcon(item.type)}</span>
    <span class="tt">${esc(item.title)}</span>
  </button>`;
}

function itemRow(item, opts = {}) {
  const done = item.status === "Siap";
  const timeLabel = opts.showDate
    ? `${formatShortDate(item.date)}${item.time ? ` ${item.time}` : ""}`
    : (item.time || "–");
  return `<article class="row-item ${done ? "is-done" : ""} ${opts.showDate ? "is-dated" : ""}">
    <div class="row-time">${esc(timeLabel)}</div>
    <button type="button" class="row-open" data-open="${esc(item.id)}">
      <span class="row-title">${esc(item.title)}</span>
      ${item.notes ? `<p class="row-notes">${esc(item.notes)}</p>` : ""}
      <span class="badges">
        <span class="badge-soft"><i class="dot" style="background:${brandColor(item.brand)}"></i>${esc(item.brand)}</span>
        <span class="badge-soft">${typeIcon(item.type)} ${esc(typeLabel(item.type))}</span>
      </span>
    </button>
    <button type="button" class="status-btn ${done ? "is-done" : ""}" data-toggle="${esc(item.id)}" aria-pressed="${done}">${done ? "Siap" : "Belum"}</button>
  </article>`;
}

function renderMonth() {
  const days = monthMatrix(state.cursor);
  const weeks = days.length / 7;
  const monthPrefix = state.cursor.slice(0, 7);
  const items = visibleItems();
  const dow = WEEKDAYS_MON.map((name) => `<div class="dow">${name}</div>`).join("");
  const cells = days.map((iso) => {
    const inMonth = iso.slice(0, 7) === monthPrefix;
    const dayItems = sortForDay(items.filter((item) => item.date === iso));
    const show = dayItems.slice(0, 3);
    const extra = dayItems.length - show.length;
    const cls = [
      "cell",
      inMonth ? "" : "is-out",
      iso === state.today ? "is-today" : "",
      iso === state.selectedDate ? "is-selected" : "",
    ].filter(Boolean).join(" ");
    return `<div class="${cls}" data-date="${iso}" role="gridcell" aria-label="${esc(formatDayHeading(iso))}">
      <div class="cell-top"><span class="date-num">${Number(iso.slice(8, 10))}</span></div>
      <div class="cell-items">${show.map(chipHtml).join("")}${extra > 0 ? `<button type="button" class="more" data-date="${iso}">+${extra} lagi</button>` : ""}</div>
    </div>`;
  }).join("");
  return `<div class="month" data-testid="month-grid" style="--weeks:${weeks}">${dow}${cells}</div>`;
}

function renderWeek() {
  const start = startOfWeek(state.cursor);
  const items = visibleItems();
  const cols = Array.from({ length: 7 }, (_, index) => {
    const iso = addDays(start, index);
    const dayItems = sortForDay(items.filter((item) => item.date === iso));
    const show = dayItems.slice(0, 8);
    const extra = dayItems.length - show.length;
    const cls = [
      "week-col",
      iso === state.today ? "is-today" : "",
      iso === state.selectedDate ? "is-selected" : "",
    ].filter(Boolean).join(" ");
    return `<div class="${cls}" data-date="${iso}">
      <div class="week-head">
        <span class="dow-name">${WEEKDAYS[weekdaySun0(iso)]}</span>
        <span class="date-num">${Number(iso.slice(8, 10))}</span>
      </div>
      <div class="cell-items">
        ${show.map(chipHtml).join("")}
        ${extra > 0 ? `<button type="button" class="more" data-date="${iso}">+${extra} lagi</button>` : ""}
      </div>
    </div>`;
  }).join("");
  return `<div class="week" data-testid="week-grid">${cols}</div>`;
}

function renderList() {
  const month = state.cursor.slice(0, 7);
  const items = visibleItems();
  const monthStart = `${month}-01`;
  const prior = sortForList(items.filter((item) => item.status === "Belum" && item.date < state.today && item.date < monthStart));
  const inMonth = items.filter((item) => item.date.slice(0, 7) === month);
  const dates = [...new Set(inMonth.map((item) => item.date))].sort();
  let html = `<div class="list-view" data-testid="list-view">`;
  if (prior.length) {
    html += `<section><h2 class="section-label">Terlewat</h2>${prior.map((item) => itemRow(item, { showDate: true })).join("")}</section>`;
  }
  if (!dates.length && !prior.length) {
    html += `<div class="empty"><p>Tiada item bulan ni.</p><p class="muted">Tukar bulan, atau tekan + Tambah.</p></div>`;
  }
  for (const iso of dates) {
    const rows = sortForList(inMonth.filter((item) => item.date === iso));
    const mark = iso === state.today ? `<span class="today-pill">Hari ini</span>` : "";
    html += `<section><h2 class="list-date">${esc(formatListHeading(iso))} ${mark}</h2>${rows.map((item) => itemRow(item)).join("")}</section>`;
  }
  html += `</div>`;
  return html;
}

function notifCard(entry) {
  const item = entry.item;
  const kindLabel = entry.kind === "terlewat" ? "Terlewat" : entry.kind === "hariini" ? "Hari ini" : "Akan datang";
  const when = item.time ? `${formatShortDate(item.date)} · ${item.time}` : formatShortDate(item.date);
  return `<article class="note-card ${entry.unread ? "is-unread" : ""}">
    <div class="note-kicker"><i class="dot" style="background:${brandColor(item.brand)}"></i>${kindLabel} · ${esc(item.brand)}</div>
    <button type="button" class="note-open" data-open="${esc(item.id)}">
      <h3>${esc(item.title)}</h3>
      <p class="note-meta">${typeIcon(item.type)} ${esc(typeLabel(item.type))} · ${esc(when)}</p>
    </button>
    <div class="note-actions">
      ${entry.unread ? `<button type="button" data-read="${esc(item.id)}">Tandakan dibaca</button>` : `<span class="read-flag">Dibaca</span>`}
      <button type="button" data-siap="${esc(item.id)}">Tandakan siap</button>
    </div>
  </article>`;
}

function renderNotis() {
  const notes = buildNotifications(state.items, state.today);
  const unread = notes.filter((entry) => entry.unread).length;
  const groups = [
    ["terlewat", "Terlewat"],
    ["hariini", "Hari ini"],
    ["nanti", "Akan datang"],
  ];
  const body = notes.length
    ? groups.map(([kind, label]) => {
      const rows = notes.filter((entry) => entry.kind === kind);
      if (!rows.length) return "";
      return `<section class="note-group"><h2 class="section-label">${label}</h2>${rows.map(notifCard).join("")}</section>`;
    }).join("")
    : `<div class="empty"><p>Tiada kerja tertunggak.</p><p class="muted">Item Belum yang terlewat, hari ini, atau yang ada masa dalam 7 hari akan muncul di sini.</p></div>`;
  return `<div class="notis" data-testid="notif-list">
    <div class="notis-head">
      <p class="section-label">Pusat notifikasi</p>
      <div class="notis-tools">
        <span class="muted">${unread} belum dibaca</span>
        <button type="button" class="btn-ghost" data-read-all ${unread ? "" : "disabled"}>Tandakan semua dibaca</button>
      </div>
    </div>
    ${body}
  </div>`;
}

function renderSettings() {
  const settings = state.settings;
  return `<div class="settings" data-testid="settings">
    <h2>Sambungan</h2>
    <p class="help">Tampal URL Web App dan kunci akses. Sekali sahaja pada telefon, dan sekali lagi pada laptop. Kedua-dua guna Sheet yang sama.</p>
    <label class="field"><span>URL Web App</span>
      <input id="set-url" type="url" inputmode="url" autocomplete="off" placeholder="https://script.google.com/macros/s/.../exec" value="${esc(settings.webAppUrl)}">
    </label>
    <label class="field"><span>Kunci akses</span>
      <span class="key-row">
        <input id="set-key" type="password" autocomplete="off" placeholder="ACCESS_KEY" value="${esc(settings.accessKey)}">
        <button type="button" class="btn-ghost" id="set-show-key">Tunjuk</button>
      </span>
    </label>
    <div class="settings-actions">
      <button type="button" class="btn-primary" id="set-save">Uji & simpan</button>
      <button type="button" class="btn-ghost" id="set-sync">Segerak sekarang</button>
      <button type="button" class="btn-ghost" id="set-disconnect">Guna mod demo</button>
    </div>
    <p class="form-error" id="set-msg">${esc(state.syncError || "")}</p>
    <h2>Data di peranti ini</h2>
    <p class="help">Buang item yang disimpan pada telefon atau laptop ini. Dalam mod demo, item tempatan dipadam. Bila Sheet bersambung, hanya cache tempatan dikosongkan — baris dalam Google Sheet tidak dipadam.</p>
    <button type="button" class="btn-ghost" id="set-clear">Kosongkan data</button>
  </div>`;
}

function renderView({ force = false } = {}) {
  const root = document.getElementById("view");
  if (state.view === "tetapan" && !force && document.getElementById("set-url")) return;
  const same = root.dataset.current === state.view;
  const top = root.scrollTop;
  root.dataset.current = state.view;
  const html = state.view === "minggu" ? renderWeek()
    : state.view === "senarai" ? renderList()
      : state.view === "notis" ? renderNotis()
        : state.view === "tetapan" ? renderSettings()
          : renderMonth();
  root.innerHTML = html;
  if (same) root.scrollTop = top;
}

function dayBlock(iso) {
  const all = state.items.filter((item) => item.date === iso);
  const shown = sortForDay(all.filter((item) => passFilter(item, state.filters)));
  const label = iso === state.today ? "Senarai hari ini" : "Senarai hari";
  const belum = shown.filter((item) => item.status === "Belum").length;
  let body;
  if (!all.length) body = `<p class="empty-copy">Tiada item. Tekan + Tambah.</p>`;
  else if (!shown.length) body = `<p class="empty-copy">Tiada item untuk tapisan ini.</p>`;
  else body = `<div class="day-list">${shown.map((item) => itemRow(item)).join("")}</div>`;
  return `<div class="day-head">
      <div>
        <p class="date-heading">${esc(formatDayHeading(iso))}</p>
        <p class="section-label">${label}</p>
        <p class="day-meta">${belum} belum</p>
      </div>
      <button type="button" class="btn-ghost" data-add-date="${iso}">+ Tambah</button>
    </div>${body}`;
}

function renderDayPanel() {
  const iso = state.selectedDate || state.today;
  document.getElementById("day-panel-body").innerHTML = dayBlock(iso);
}

function renderSheet() {
  const iso = state.selectedDate || state.today;
  const sheet = document.getElementById("sheet");
  sheet.innerHTML = `<button type="button" class="sheet-backdrop" data-close-sheet aria-label="Tutup"></button>
    <div class="sheet-card"><div class="grab"></div>${dayBlock(iso)}
      <button type="button" class="btn-ghost" data-close-sheet>Tutup</button>
    </div>`;
}

function openSheet() {
  renderSheet();
  document.getElementById("sheet").hidden = false;
}

function closeSheet() {
  const sheet = document.getElementById("sheet");
  sheet.hidden = true;
  sheet.innerHTML = "";
}

function paintSelection() {
  document.querySelectorAll(".cell[data-date], .week-col[data-date]").forEach((el) => {
    el.classList.toggle("is-selected", el.dataset.date === state.selectedDate);
  });
}

function selectDay(iso) {
  const monthChanged = state.view === "bulan" && iso.slice(0, 7) !== state.cursor.slice(0, 7);
  state.selectedDate = iso;
  if (monthChanged) {
    state.cursor = iso;
    updateChrome();
    renderView({ force: true });
  } else {
    paintSelection();
  }
  renderDayPanel();
  if (!isDesktop() && state.view === "bulan") openSheet();
}

function refreshViews() {
  renderView({ force: state.view !== "tetapan" });
  renderDayPanel();
  if (!document.getElementById("sheet").hidden) renderSheet();
  renderBadges();
}

function optionTags(list, value, labelKey) {
  return list.map((item) => {
    const id = item.id;
    const label = labelKey ? item[labelKey] : item.id;
    return `<option value="${esc(id)}"${id === value ? " selected" : ""}>${esc(label)}</option>`;
  }).join("");
}

function openEditor(id, dateOverride) {
  const existing = id ? state.items.find((item) => item.id === id) : null;
  state.editing = existing ? { ...existing } : null;
  state.confirmDelete = false;
  const item = existing || {
    title: "",
    type: "Task",
    brand: "Umum",
    date: dateOverride || state.selectedDate || state.today,
    time: "",
    notes: "",
    status: "Belum",
    remind: "off",
  };
  const modal = document.getElementById("modal");
  modal.innerHTML = `<button type="button" class="backdrop" data-close-modal aria-label="Tutup"></button>
    <form class="dialog" id="item-form">
      <h2>${existing ? "Edit item" : "Item baru"}</h2>
      <label class="field"><span>Tajuk</span><input id="f-title" required maxlength="200" value="${esc(item.title)}" autocomplete="off"></label>
      <div class="form-row">
        <label class="field"><span>Jenis</span><select id="f-type">${optionTags(TYPES, item.type, "label")}</select></label>
        <label class="field"><span>Jenama</span>
          <span class="brand-pick"><i class="dot" id="brand-dot" style="background:${brandColor(item.brand)}"></i>
          <select id="f-brand">${optionTags(BRANDS, item.brand)}</select></span>
        </label>
      </div>
      <div class="form-row">
        <label class="field"><span>Tarikh</span><input id="f-date" type="date" required value="${esc(item.date)}"></label>
        <label class="field"><span>Masa (pilihan)</span><input id="f-time" type="time" value="${esc(item.time)}"></label>
      </div>
      <label class="field"><span>Nota</span><textarea id="f-notes" maxlength="4000">${esc(item.notes)}</textarea></label>
      <label class="field"><span>Status</span>
        <select id="f-status">
          <option value="Belum"${item.status !== "Siap" ? " selected" : ""}>Belum</option>
          <option value="Siap"${item.status === "Siap" ? " selected" : ""}>Siap</option>
        </select>
      </label>
      <label class="switch"><input id="f-remind" type="checkbox"${item.remind === "on" ? " checked" : ""}><span>Ingatkan saya. Emel lebih kurang 30 minit sebelum masa. Perlu isi masa.</span></label>
      <p class="form-error" id="form-error"></p>
      <div class="dialog-actions">
        ${existing ? `<button type="button" class="btn-danger" id="btn-delete">Padam</button>` : ""}
        <span class="spacer"></span>
        <button type="button" class="btn-ghost" data-close-modal>Batal</button>
        <button type="submit" class="btn-primary">Simpan</button>
      </div>
    </form>`;
  modal.hidden = false;
  setTimeout(() => document.getElementById("f-title")?.focus(), 30);
}

function closeModal() {
  const modal = document.getElementById("modal");
  modal.hidden = true;
  modal.innerHTML = "";
  state.editing = null;
  state.confirmDelete = false;
}

function submitForm() {
  const title = document.getElementById("f-title").value.trim();
  const date = document.getElementById("f-date").value;
  const error = document.getElementById("form-error");
  if (!title) {
    error.textContent = "Isi tajuk.";
    return;
  }
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
    error.textContent = "Pilih tarikh.";
    return;
  }
  const prev = state.editing;
  const stamp = nowIsoKL();
  const next = {
    id: prev?.id || newId(),
    title,
    type: document.getElementById("f-type").value,
    brand: document.getElementById("f-brand").value,
    date,
    time: document.getElementById("f-time").value || "",
    notes: document.getElementById("f-notes").value.trim(),
    status: document.getElementById("f-status").value === "Siap" ? "Siap" : "Belum",
    remind: document.getElementById("f-remind").checked ? "on" : "off",
    remindedAt: prev?.remindedAt || "",
    readAt: prev?.readAt || "",
    createdAt: prev?.createdAt || stamp,
    updatedAt: stamp,
  };
  if (prev && (prev.date !== next.date || prev.time !== next.time)) {
    next.remindedAt = "";
    next.readAt = "";
  }
  if (prev && prev.remind !== next.remind) next.remindedAt = "";
  state.selectedDate = next.date;
  if (state.view === "bulan" || state.view === "minggu" || state.view === "senarai") state.cursor = next.date;
  closeModal();
  persistItem(next);
  toast("Disimpan");
}

function saveLocalItem(item) {
  const items = loadItems();
  const index = items.findIndex((row) => row.id === item.id);
  if (index >= 0) items[index] = item;
  else items.push(item);
  saveItems(items);
  state.items = items;
}

function dropOutboxFor(id) {
  saveOutbox(loadOutbox().filter((op) => {
    if (op.op === "upsert" && op.item?.id === id) return false;
    if (op.op === "delete" && op.id === id) return false;
    return true;
  }));
}

function enqueueUpsert(item) {
  const box = loadOutbox().filter((op) => !(op.op === "upsert" && op.item?.id === item.id) && !(op.op === "delete" && op.id === item.id));
  box.push({ op: "upsert", item });
  saveOutbox(box);
}

function enqueueDelete(id) {
  const box = loadOutbox().filter((op) => !(op.op === "upsert" && op.item?.id === id) && !(op.op === "delete" && op.id === id));
  box.push({ op: "delete", id });
  saveOutbox(box);
}

function mapError(err) {
  const code = err?.code || err?.message;
  if (code === "unauthorized") return "Kunci salah, atau ACCESS_KEY belum diset.";
  if (code === "network") return "Tak dapat hubung. Semak URL /exec dan internet.";
  if (code === "bad_response") return "Pelayan tak jawab. Semak deploy Web App (Anyone, /exec).";
  if (code === "no_sheet") return "Tab Items tiada. Jalankan setup() dalam Apps Script.";
  if (code === "title_required") return "Isi tajuk.";
  if (code === "date_required") return "Pilih tarikh.";
  if (code === "not_found") return "Item tiada dalam Sheet.";
  return "Ralat segerak. Cuba lagi.";
}

async function markSynced() {
  state.mode = loadOutbox().length ? "pending" : "synced";
  state.syncedAt = nowIsoKL();
  state.syncError = "";
  updateChrome();
}

async function persistItem(item) {
  saveLocalItem(item);
  refreshViews();
  updateChrome();
  if (!configured()) {
    state.mode = "demo";
    updateChrome();
    return;
  }
  try {
    state.mode = "syncing";
    updateChrome();
    await apiUpsert(state.settings, item);
    dropOutboxFor(item.id);
    await markSynced();
  } catch (err) {
    enqueueUpsert(item);
    state.mode = "pending";
    state.syncError = mapError(err);
    updateChrome();
    toast(state.syncError);
  }
}

async function persistStatus(id, forced) {
  const item = state.items.find((row) => row.id === id);
  if (!item) return;
  const status = forced || (item.status === "Siap" ? "Belum" : "Siap");
  if (item.status === status) return;
  const stamp = nowIsoKL();
  const next = { ...item, status, updatedAt: stamp };
  saveLocalItem(next);
  refreshViews();
  if (!configured()) return;
  try {
    state.mode = "syncing";
    updateChrome();
    await apiSetStatus(state.settings, id, status, stamp);
    dropOutboxFor(id);
    await markSynced();
  } catch (err) {
    enqueueUpsert(next);
    state.mode = "pending";
    state.syncError = mapError(err);
    updateChrome();
    toast(state.syncError);
  }
}

async function persistRead(id) {
  const item = state.items.find((row) => row.id === id);
  if (!item || !isUnread(item)) return;
  const stamp = nowIsoKL();
  const next = { ...item, readAt: stamp, updatedAt: stamp };
  saveLocalItem(next);
  refreshViews();
  if (!configured()) return;
  try {
    await apiMarkRead(state.settings, id, stamp);
    dropOutboxFor(id);
    await markSynced();
  } catch (err) {
    enqueueUpsert(next);
    state.mode = "pending";
    state.syncError = mapError(err);
    updateChrome();
    toast(state.syncError);
  }
}

async function persistReadAll() {
  const ids = buildNotifications(state.items, state.today).filter((entry) => entry.unread).map((entry) => entry.item.id);
  if (!ids.length) return;
  const stamp = nowIsoKL();
  const idSet = new Set(ids);
  const items = state.items.map((item) => (idSet.has(item.id) ? { ...item, readAt: stamp, updatedAt: stamp } : item));
  saveItems(items);
  state.items = items;
  refreshViews();
  if (!configured()) return;
  try {
    await apiMarkAllRead(state.settings, ids, stamp);
    await markSynced();
  } catch (err) {
    const box = loadOutbox();
    box.push({ op: "markAllRead", ids, readAt: stamp });
    saveOutbox(box);
    state.mode = "pending";
    state.syncError = mapError(err);
    updateChrome();
    toast(state.syncError);
  }
}

async function persistDelete(id) {
  const stamp = nowIsoKL();
  saveItems(loadItems().filter((item) => item.id !== id));
  state.items = loadItems();
  const tombs = loadTombs();
  tombs[id] = stamp;
  saveTombs(tombs);
  dropOutboxFor(id);
  refreshViews();
  closeModal();
  toast("Dipadam");
  if (!configured()) return;
  try {
    await apiDelete(state.settings, id);
    const left = loadTombs();
    delete left[id];
    saveTombs(left);
    await markSynced();
  } catch (err) {
    enqueueDelete(id);
    state.mode = "pending";
    state.syncError = mapError(err);
    updateChrome();
    toast(state.syncError);
  }
}

async function flushOutbox() {
  const box = discardSampleQueue().filter((op) => !(op.op === "upsert" && isSampleId(op.item?.id)));
  for (let i = 0; i < box.length; i += 1) {
    const op = box[i];
    try {
      if (op.op === "upsert") await apiUpsert(state.settings, op.item);
      else if (op.op === "delete") await apiDelete(state.settings, op.id);
      else if (op.op === "markAllRead") await apiMarkAllRead(state.settings, op.ids, op.readAt);
    } catch (err) {
      saveOutbox(box.slice(i));
      throw err;
    }
  }
  saveOutbox([]);
}

async function sync(opts = {}) {
  if (!configured()) {
    state.mode = "demo";
    updateChrome();
    return;
  }
  if (state.syncing) return;
  state.syncing = true;
  state.mode = "syncing";
  updateChrome();
  try {
    await flushOutbox();
    const remote = (await apiList(state.settings)).items || [];
    const remoteNorm = withoutSamples(remote.map(normalizeItem).filter(Boolean));
    const tombs = loadTombs();
    for (const id of Object.keys(tombs)) {
      if (isSampleId(id) || !remoteNorm.some((item) => item.id === id)) delete tombs[id];
    }
    const merged = withoutSamples(mergeItems(withoutSamples(loadItems()), remoteNorm, tombs));
    saveItems(merged);
    saveTombs(tombs);
    state.items = merged;
    state.mode = loadOutbox().length ? "pending" : "synced";
    state.syncedAt = nowIsoKL();
    state.syncError = "";
    refreshViews();
  } catch (err) {
    state.mode = loadOutbox().length ? "pending" : "error";
    state.syncError = mapError(err);
    if (!opts.quiet) toast(state.syncError);
  } finally {
    state.syncing = false;
    updateChrome();
  }
}

async function pushAndPull(settings) {
  discardSampleQueue();
  const remote = withoutSamples(((await apiList(settings)).items || []).map(normalizeItem).filter(Boolean));
  const local = withoutSamples(loadItems());
  const tombs = loadTombs();
  for (const id of Object.keys(tombs)) {
    if (isSampleId(id)) delete tombs[id];
  }
  const merged = withoutSamples(mergeItems(local, remote, tombs));
  for (const item of merged) {
    if (isSampleId(item.id)) continue;
    const remoteItem = remote.find((row) => row.id === item.id);
    if (!remoteItem || (item.updatedAt || "") > (remoteItem.updatedAt || "")) {
      await apiUpsert(settings, item);
    }
  }
  for (const [id, at] of Object.entries(tombs)) {
    if (isSampleId(id)) continue;
    const remoteItem = remote.find((row) => row.id === id);
    if (remoteItem && at >= (remoteItem.updatedAt || "")) await apiDelete(settings, id);
  }
  const remote2 = withoutSamples(((await apiList(settings)).items || []).map(normalizeItem).filter(Boolean));
  saveItems(remote2);
  saveTombs({});
  saveOutbox([]);
  state.items = remote2;
  state.mode = "synced";
  state.syncedAt = nowIsoKL();
  state.syncError = "";
}

async function connectFromForm() {
  const url = cleanWebAppUrl(document.getElementById("set-url").value);
  const key = document.getElementById("set-key").value.trim();
  const msg = document.getElementById("set-msg");
  if (!url.startsWith("https://")) {
    msg.textContent = "URL mesti bermula dengan https://";
    return;
  }
  if (!url.endsWith("/exec")) {
    msg.textContent = "Guna pautan Web App yang berakhir dengan /exec, bukan /dev.";
    return;
  }
  if (!key) {
    msg.textContent = "Isi kunci akses.";
    return;
  }
  msg.textContent = "Menyambung… Google kadang ambil beberapa saat.";
  const settings = { webAppUrl: url, accessKey: key };
  try {
    await apiPing(settings);
    saveSettings(settings);
    state.settings = settings;
    await pushAndPull(settings);
    updateChrome();
    refreshViews();
    msg.textContent = "Sambung. Telefon dan laptop akan segerak.";
    toast("Sheet bersambung");
  } catch (err) {
    msg.textContent = mapError(err);
  }
}

function disconnect() {
  saveSettings({ webAppUrl: "", accessKey: "" });
  state.settings = loadSettings();
  state.mode = "demo";
  state.syncError = "";
  updateChrome();
  const msg = document.getElementById("set-msg");
  if (msg) msg.textContent = "Mod demo. Data kekal di peranti ini.";
  toast("Mod demo");
}

function shift(dir) {
  refreshToday();
  if (state.view === "minggu") state.cursor = addDays(state.cursor, dir * 7);
  else state.cursor = addMonths(state.cursor, dir);
  state.selectedDate = state.cursor;
  closeSheet();
  updateChrome();
  renderView({ force: true });
  renderDayPanel();
}

function goToday() {
  refreshToday();
  state.cursor = state.today;
  state.selectedDate = state.today;
  closeSheet();
  if (state.view === "notis" || state.view === "tetapan") go("bulan");
  else {
    updateChrome();
    renderView({ force: true });
    renderDayPanel();
  }
}

let toastTimer = 0;
function toast(message) {
  const el = document.getElementById("toast");
  el.textContent = message;
  el.hidden = false;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => {
    el.hidden = true;
  }, 3200);
}

function buildFilters() {
  document.getElementById("brand-filters").innerHTML = [`<button type="button" class="fchip" data-brand="Semua">Semua</button>`]
    .concat(BRANDS.map((brand) => `<button type="button" class="fchip" data-brand="${brand.id}"><span class="dot" style="background:${brand.color}"></span>${brand.id}</button>`))
    .join("");
  document.getElementById("type-filters").innerHTML = [`<button type="button" class="fchip" data-type="Semua">Semua jenis</button>`]
    .concat(TYPES.map((type) => `<button type="button" class="fchip" data-type="${type.id}">${type.label}</button>`))
    .join("");
  document.getElementById("status-filters").innerHTML = ["Semua", "Belum", "Siap"]
    .map((status) => `<button type="button" class="fchip" data-status="${status}">${status === "Semua" ? "Semua status" : status}</button>`)
    .join("");
}

function onClick(event) {
  const toggle = event.target.closest("[data-toggle]");
  if (toggle) {
    persistStatus(toggle.dataset.toggle);
    return;
  }
  const read = event.target.closest("[data-read]");
  if (read) {
    persistRead(read.dataset.read);
    return;
  }
  const siap = event.target.closest("[data-siap]");
  if (siap) {
    persistStatus(siap.dataset.siap, "Siap");
    return;
  }
  const readAll = event.target.closest("[data-read-all]");
  if (readAll && !readAll.disabled) {
    persistReadAll();
    return;
  }
  if (event.target.closest("[data-close-modal]")) {
    closeModal();
    return;
  }
  if (event.target.closest("[data-close-sheet]")) {
    closeSheet();
    return;
  }
  if (event.target.closest("#btn-delete")) {
    const button = event.target.closest("#btn-delete");
    if (!state.confirmDelete) {
      state.confirmDelete = true;
      button.textContent = "Pasti padam?";
      return;
    }
    if (state.editing?.id) persistDelete(state.editing.id);
    return;
  }
  const addDate = event.target.closest("[data-add-date]");
  if (addDate) {
    state.selectedDate = addDate.dataset.addDate;
    openEditor(null, addDate.dataset.addDate);
    return;
  }
  const open = event.target.closest("[data-open]");
  if (open) {
    const item = state.items.find((row) => row.id === open.dataset.open);
    if (item) {
      state.selectedDate = item.date;
      renderDayPanel();
      paintSelection();
    }
    openEditor(open.dataset.open);
    return;
  }
  const brand = event.target.closest("[data-brand]");
  if (brand) {
    state.filters.brand = brand.dataset.brand;
    updateChrome();
    refreshViews();
    return;
  }
  const type = event.target.closest("[data-type]");
  if (type) {
    state.filters.type = type.dataset.type;
    updateChrome();
    refreshViews();
    return;
  }
  const status = event.target.closest("[data-status]");
  if (status) {
    state.filters.status = status.dataset.status;
    updateChrome();
    refreshViews();
    return;
  }
  const dateEl = event.target.closest("[data-date]");
  if (dateEl?.dataset.date) {
    selectDay(dateEl.dataset.date);
    return;
  }
  const nav = event.target.closest("[data-nav]");
  if (nav) {
    go(nav.dataset.nav);
    return;
  }
  if (event.target.closest("#btn-add")) {
    openEditor(null);
    return;
  }
  if (event.target.closest("#btn-prev")) {
    shift(-1);
    return;
  }
  if (event.target.closest("#btn-next")) {
    shift(1);
    return;
  }
  if (event.target.closest("#btn-today")) {
    goToday();
    return;
  }
  if (event.target.closest("#btn-bell") || event.target.closest("#btn-settings")) {
    go(event.target.closest("#btn-settings") ? "tetapan" : "notis");
    return;
  }
  if (event.target.closest("#set-save")) {
    connectFromForm();
    return;
  }
  if (event.target.closest("#set-sync")) {
    sync();
    return;
  }
  if (event.target.closest("#set-disconnect")) {
    disconnect();
    return;
  }
  if (event.target.closest("#set-show-key")) {
    const input = document.getElementById("set-key");
    const button = event.target.closest("#set-show-key");
    const show = input.type === "password";
    input.type = show ? "text" : "password";
    button.textContent = show ? "Sembunyi" : "Tunjuk";
    return;
  }
  if (event.target.closest("#set-clear")) {
    const connected = configured();
    const message = connected
      ? "Kosongkan data pada peranti ini? Hanya cache tempatan dikosongkan. Baris dalam Google Sheet tidak dipadam."
      : "Kosongkan semua data pada peranti ini? Item di telefon atau laptop ini akan dipadam.";
    if (!window.confirm(message)) return;
    clearLocalData();
    state.items = [];
    refreshViews();
    toast(connected ? "Cache tempatan dikosongkan" : "Data dikosongkan");
    if (connected) sync();
  }
}

function bind() {
  document.body.addEventListener("click", onClick);
  document.body.addEventListener("submit", (event) => {
    if (event.target.id !== "item-form") return;
    event.preventDefault();
    submitForm();
  });
  document.body.addEventListener("change", (event) => {
    if (event.target.id === "f-brand") {
      const dot = document.getElementById("brand-dot");
      if (dot) dot.style.background = brandColor(event.target.value);
    }
  });
  document.getElementById("search").addEventListener("input", (event) => {
    state.filters.q = event.target.value;
    refreshViews();
  });
  document.addEventListener("keydown", (event) => {
    if (event.key !== "Escape") return;
    if (!document.getElementById("modal").hidden) closeModal();
    else closeSheet();
  });
  window.addEventListener("hashchange", () => applyView(parseHash()));
  let resizeTimer = 0;
  window.addEventListener("resize", () => {
    clearTimeout(resizeTimer);
    resizeTimer = setTimeout(() => {
      if (isDesktop()) closeSheet();
      if (state.view === "bulan" || state.view === "minggu") renderView({ force: true });
    }, 150);
  });
  document.addEventListener("visibilitychange", () => {
    refreshToday();
    if (document.visibilityState === "visible") {
      updateChrome();
      refreshViews();
      sync({ quiet: true });
    }
  });
  setInterval(() => sync({ quiet: true }), 120000);
}

function boot() {
  state.settings = loadSettings();
  state.items = purgeSampleData();
  refreshToday();
  state.cursor = state.today;
  state.selectedDate = state.today;
  state.mode = configured() ? "syncing" : "demo";
  buildFilters();
  bind();
  if (!location.hash) history.replaceState(null, "", "#bulan");
  applyView(parseHash());
  if ("serviceWorker" in navigator) {
    navigator.serviceWorker.register("./sw.js").catch(() => {});
  }
  if (configured()) sync({ quiet: true });
}

boot();
