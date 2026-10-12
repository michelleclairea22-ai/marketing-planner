// Image preparation and the annotation editor (canvas). DOM only; pure math lives in notes.js.
import { clampView, clampZoom, fitInto, fitSize, strokeWidth, toImageSpace, zoomAt } from "./notes.js";

const COLORS = [
  { id: "merah", label: "Merah", value: "#EF4444" },
  { id: "hijau", label: "Hijau", value: "#22C55E" },
  { id: "biru", label: "Biru", value: "#3B82F6" },
];
const SIZES = [
  { id: "halus", label: "Halus", px: 3 },
  { id: "tebal", label: "Tebal", px: 8 },
];

function loadImage(src) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error("image_load"));
    img.src = src;
  });
}

function hasTransparency(ctx, w, h) {
  const data = ctx.getImageData(0, 0, w, h).data;
  const step = Math.max(1, Math.floor((w * h) / 200000)) * 4;
  for (let i = 3; i < data.length; i += step) if (data[i] < 250) return true;
  return false;
}

// File -> { dataUrl, w, h } resized to max 1600px long edge. JPEG 0.85, or PNG when transparent.
export async function prepareImage(file) {
  const url = URL.createObjectURL(file);
  try {
    const img = await loadImage(url);
    const size = fitSize(img.naturalWidth, img.naturalHeight);
    const canvas = document.createElement("canvas");
    canvas.width = size.w;
    canvas.height = size.h;
    const ctx = canvas.getContext("2d");
    ctx.drawImage(img, 0, 0, size.w, size.h);
    const mayAlpha = /png|webp|gif/i.test(file.type || "");
    const dataUrl = mayAlpha && hasTransparency(ctx, size.w, size.h)
      ? canvas.toDataURL("image/png")
      : canvas.toDataURL("image/jpeg", 0.85);
    return { dataUrl, w: size.w, h: size.h };
  } finally {
    URL.revokeObjectURL(url);
  }
}

// Blank white page for "Lukisan kosong", sized to the screen (× devicePixelRatio, capped at 1600).
export function blankPage() {
  const dpr = Math.min(window.devicePixelRatio || 1, 3);
  const size = fitSize(Math.round(Math.min(window.innerWidth, 900) * dpr), Math.round(Math.min(window.innerHeight, 1200) * dpr));
  const canvas = document.createElement("canvas");
  canvas.width = size.w;
  canvas.height = size.h;
  const ctx = canvas.getContext("2d");
  ctx.fillStyle = "#ffffff";
  ctx.fillRect(0, 0, size.w, size.h);
  return { dataUrl: canvas.toDataURL("image/jpeg", 0.9), w: size.w, h: size.h };
}

function isEmpty(ctx, w, h) {
  const data = ctx.getImageData(0, 0, w, h).data;
  for (let i = 3; i < data.length; i += 4) if (data[i] !== 0) return false;
  return true;
}

// Opens the full-screen editor. Resolves with { annot: dataUrl|"" } on save, or null on cancel.
export function openAnnotator({ original, annot, w, h }) {
  return new Promise(async (resolve) => {
    const root = document.createElement("div");
    root.className = "draw";
    root.setAttribute("role", "dialog");
    root.setAttribute("aria-label", "Lukis atas gambar");
    root.dataset.testid = "draw-editor";
    root.innerHTML = `<div class="draw-bar">
        <div class="draw-group" role="group" aria-label="Warna">
          ${COLORS.map((c, i) => `<button type="button" class="draw-color${i === 0 ? " is-active" : ""}" data-color="${c.value}" aria-label="${c.label}" style="--c:${c.value}"></button>`).join("")}
        </div>
        <div class="draw-group" role="group" aria-label="Saiz">
          ${SIZES.map((s, i) => `<button type="button" class="draw-btn${i === 0 ? " is-active" : ""}" data-size="${s.px}">${s.label}</button>`).join("")}
        </div>
        <button type="button" class="draw-btn" data-tool="eraser">Pemadam</button>
        <button type="button" class="draw-btn" data-act="undo">Undo</button>
        <button type="button" class="draw-btn" data-act="clear">Kosongkan lukisan</button>
        <div class="draw-group" role="group" aria-label="Zum">
          <button type="button" class="draw-btn" data-act="zoom-out" aria-label="Zum keluar">−</button>
          <span class="draw-zoom" data-testid="draw-zoom" aria-live="polite">100%</span>
          <button type="button" class="draw-btn" data-act="zoom-in" aria-label="Zum masuk">+</button>
          <button type="button" class="draw-btn" data-act="fit">Muat</button>
          <button type="button" class="draw-btn" data-tool="pan" aria-pressed="false">✋ Gerak</button>
        </div>
        <span class="spacer"></span>
        <button type="button" class="btn-ghost" data-act="cancel">Batal</button>
        <button type="button" class="btn-primary" data-act="save">Simpan</button>
      </div>
      <div class="draw-stage"><div class="draw-frame">
        <canvas class="draw-base"></canvas><canvas class="draw-annot" data-testid="draw-canvas"></canvas>
      </div></div>`;
    document.body.appendChild(root);
    document.body.classList.add("is-drawing");
    const stage = root.querySelector(".draw-stage");
    const frame = root.querySelector(".draw-frame");
    const base = root.querySelector(".draw-base");
    const layer = root.querySelector(".draw-annot");
    for (const c of [base, layer]) { c.width = w; c.height = h; }
    const bctx = base.getContext("2d");
    const ctx = layer.getContext("2d");
    try {
      bctx.drawImage(await loadImage(original), 0, 0, w, h);
      if (annot) ctx.drawImage(await loadImage(annot), 0, 0, w, h);
    } catch {
      // Draw on whatever loaded.
    }

    let displayScale = 1;
    let fw = 1, fh = 1, sw = 1, sh = 1;
    let view = { z: 1, x: 0, y: 0 };
    const zoomLabel = root.querySelector(".draw-zoom");
    let raf = 0;
    const apply = () => {
      raf = 0;
      frame.style.transform = `translate3d(${view.x}px, ${view.y}px, 0) scale(${view.z})`;
      zoomLabel.textContent = `${Math.round(view.z * 100)}%`;
    };
    const setView = (v) => {
      view = clampView(v, fw, fh, sw, sh);
      if (!raf) raf = requestAnimationFrame(apply);
    };
    const layout = () => {
      const box = stage.getBoundingClientRect();
      sw = box.width; sh = box.height;
      const fit = fitInto(w, h, Math.max(50, sw - 16), Math.max(50, sh - 16));
      fw = fit.w; fh = fit.h;
      frame.style.width = `${fit.w}px`;
      frame.style.height = `${fit.h}px`;
      displayScale = fit.w / w;
      setView(view);
    };
    layout();
    apply();
    window.addEventListener("resize", layout);
    const stagePoint = (ev) => {
      const r = stage.getBoundingClientRect();
      return { x: ev.clientX - r.left, y: ev.clientY - r.top };
    };
    const zoomBy = (factor, at) => {
      setView(zoomAt(view, clampZoom(view.z * factor), at?.x ?? sw / 2, at?.y ?? sh / 2));
    };

    const tool = { color: COLORS[0].value, size: SIZES[0].px, eraser: false, pan: false };
    const undo = [];
    const snapshot = () => {
      undo.push(ctx.getImageData(0, 0, w, h));
      if (undo.length > 30) undo.shift();
    };
    let drawing = null;
    let pan = null; // { id, start, view }
    let pinch = null; // { d, mid, view }
    let spaceDown = false;
    const pointers = new Map();
    const panMode = () => tool.pan || spaceDown;
    const updateCursor = () => stage.classList.toggle("is-pan", panMode());

    const point = (ev) => toImageSpace(ev.clientX, ev.clientY, layer.getBoundingClientRect(), w, h);
    const cancelStroke = () => {
      if (!drawing) return;
      const prev = undo.pop();
      if (prev) ctx.putImageData(prev, 0, 0);
      drawing = null;
      ctx.globalCompositeOperation = "source-over";
    };
    const begin = (ev) => {
      if (drawing) return;
      if (ev.target !== layer) return;
      snapshot();
      const p = point(ev);
      drawing = { id: ev.pointerId, last: p };
      ctx.globalCompositeOperation = tool.eraser ? "destination-out" : "source-over";
      ctx.strokeStyle = tool.color;
      ctx.fillStyle = tool.color;
      ctx.lineCap = "round";
      ctx.lineJoin = "round";
      const pressure = ev.pointerType === "pen" && ev.pressure ? 0.5 + ev.pressure : 1;
      ctx.lineWidth = strokeWidth(tool.eraser ? tool.size * 3 : tool.size, displayScale * view.z) * pressure;
      ctx.beginPath();
      ctx.arc(p.x, p.y, ctx.lineWidth / 2, 0, Math.PI * 2);
      ctx.fill();
    };
    const pinchInfo = () => {
      const [a, b] = [...pointers.values()];
      return { d: Math.hypot(a.x - b.x, a.y - b.y) || 1, mid: { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 } };
    };
    const down = (ev) => {
      if (ev.target.closest(".draw-bar")) return;
      ev.preventDefault();
      stage.setPointerCapture?.(ev.pointerId);
      pointers.set(ev.pointerId, stagePoint(ev));
      if (pointers.size === 2) {
        cancelStroke();
        pan = null;
        pinch = { ...pinchInfo(), view };
        return;
      }
      if (pointers.size > 2 || pinch) return;
      if (panMode() || ev.button === 1) {
        pan = { id: ev.pointerId, start: stagePoint(ev), view };
        return;
      }
      if (ev.button === 0 || ev.pointerType !== "mouse") begin(ev);
    };
    const move = (ev) => {
      if (!pointers.has(ev.pointerId)) return;
      ev.preventDefault();
      pointers.set(ev.pointerId, stagePoint(ev));
      if (pinch) {
        if (pointers.size < 2) return;
        const cur = pinchInfo();
        const v0 = pinch.view;
        const z = clampZoom(v0.z * (cur.d / pinch.d));
        const ix = (pinch.mid.x - v0.x) / v0.z;
        const iy = (pinch.mid.y - v0.y) / v0.z;
        setView({ z, x: cur.mid.x - ix * z, y: cur.mid.y - iy * z });
        return;
      }
      if (pan && ev.pointerId === pan.id) {
        const p = stagePoint(ev);
        setView({ z: pan.view.z, x: pan.view.x + p.x - pan.start.x, y: pan.view.y + p.y - pan.start.y });
        return;
      }
      if (!drawing || ev.pointerId !== drawing.id) return;
      const events = ev.getCoalescedEvents ? ev.getCoalescedEvents() : [ev];
      for (const e of (events.length ? events : [ev])) {
        const p = point(e);
        const mid = { x: (drawing.last.x + p.x) / 2, y: (drawing.last.y + p.y) / 2 };
        ctx.beginPath();
        ctx.moveTo(drawing.lastMid?.x ?? drawing.last.x, drawing.lastMid?.y ?? drawing.last.y);
        ctx.quadraticCurveTo(drawing.last.x, drawing.last.y, mid.x, mid.y);
        ctx.stroke();
        drawing.last = p;
        drawing.lastMid = mid;
      }
    };
    const up = (ev) => {
      if (!pointers.has(ev.pointerId)) return;
      pointers.delete(ev.pointerId);
      if (pinch) {
        if (pointers.size === 0) pinch = null;
        return;
      }
      if (pan && ev.pointerId === pan.id) { pan = null; return; }
      if (!drawing || ev.pointerId !== drawing.id) return;
      if (ev.type === "pointercancel") { cancelStroke(); return; }
      ctx.beginPath();
      ctx.moveTo(drawing.lastMid?.x ?? drawing.last.x, drawing.lastMid?.y ?? drawing.last.y);
      ctx.lineTo(drawing.last.x, drawing.last.y);
      ctx.stroke();
      drawing = null;
      ctx.globalCompositeOperation = "source-over";
    };
    stage.addEventListener("pointerdown", down);
    stage.addEventListener("pointermove", move);
    stage.addEventListener("pointerup", up);
    stage.addEventListener("pointercancel", up);
    stage.addEventListener("wheel", (ev) => {
      ev.preventDefault();
      if (drawing) return;
      const dy = ev.deltaMode === 1 ? ev.deltaY * 16 : ev.deltaY;
      zoomBy(Math.exp(Math.max(-0.5, Math.min(0.5, -dy * (ev.ctrlKey && Math.abs(dy) < 50 ? 0.01 : 0.003)))), stagePoint(ev));
    }, { passive: false });
    const blockTouch = (ev) => { if (!ev.target.closest(".draw-bar")) ev.preventDefault(); };
    root.addEventListener("touchmove", blockTouch, { passive: false });
    root.addEventListener("gesturestart", (ev) => ev.preventDefault());
    root.addEventListener("gesturechange", (ev) => ev.preventDefault());
    const onKey = (ev) => {
      if (ev.code !== "Space" || ev.target.closest?.("input, textarea")) return;
      ev.preventDefault();
      const was = spaceDown;
      spaceDown = ev.type === "keydown";
      if (was !== spaceDown) updateCursor();
    };
    window.addEventListener("keydown", onKey);
    window.addEventListener("keyup", onKey);

    const finish = (result) => {
      window.removeEventListener("resize", layout);
      window.removeEventListener("keydown", onKey);
      window.removeEventListener("keyup", onKey);
      document.body.classList.remove("is-drawing");
      root.remove();
      resolve(result);
    };

    root.addEventListener("click", (ev) => {
      const color = ev.target.closest("[data-color]");
      if (color) {
        tool.color = color.dataset.color;
        tool.eraser = false;
        root.querySelectorAll("[data-color]").forEach((b) => b.classList.toggle("is-active", b === color));
        root.querySelector("[data-tool=eraser]").classList.remove("is-active");
        return;
      }
      const size = ev.target.closest("[data-size]");
      if (size) {
        tool.size = Number(size.dataset.size);
        root.querySelectorAll("[data-size]").forEach((b) => b.classList.toggle("is-active", b === size));
        return;
      }
      if (ev.target.closest("[data-tool=eraser]")) {
        tool.eraser = !tool.eraser;
        ev.target.closest("[data-tool=eraser]").classList.toggle("is-active", tool.eraser);
        root.querySelectorAll("[data-color]").forEach((b) => b.classList.toggle("is-active", !tool.eraser && b.dataset.color === tool.color));
        return;
      }
      const panBtn = ev.target.closest("[data-tool=pan]");
      if (panBtn) {
        tool.pan = !tool.pan;
        panBtn.classList.toggle("is-active", tool.pan);
        panBtn.setAttribute("aria-pressed", String(tool.pan));
        updateCursor();
        return;
      }
      const act = ev.target.closest("[data-act]")?.dataset.act;
      if (act === "zoom-in") {
        zoomBy(1.5);
      } else if (act === "zoom-out") {
        zoomBy(1 / 1.5);
      } else if (act === "fit") {
        setView({ z: 1, x: 0, y: 0 });
      } else if (act === "undo") {
        const prev = undo.pop();
        if (prev) ctx.putImageData(prev, 0, 0);
      } else if (act === "clear") {
        snapshot();
        ctx.clearRect(0, 0, w, h);
      } else if (act === "cancel") {
        finish(null);
      } else if (act === "save") {
        finish({ annot: isEmpty(ctx, w, h) ? "" : layer.toDataURL("image/png") });
      }
    });
  });
}
