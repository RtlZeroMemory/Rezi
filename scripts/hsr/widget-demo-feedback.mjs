export const ACTIVITY_FEED_LIMIT = 6;

const INPUT_IDS = new Set(["self-edit-code", "name", "notes"]);

function freezeModal(value) {
  if (!value) return null;
  return Object.freeze({
    open: value.open === true,
    tone: value.tone === "error" ? "error" : value.tone === "info" ? "info" : "success",
    title: typeof value.title === "string" ? value.title : "",
    message: typeof value.message === "string" ? value.message : "",
    detail: typeof value.detail === "string" ? value.detail : "",
    autoCloseAtMs:
      typeof value.autoCloseAtMs === "number" && Number.isFinite(value.autoCloseAtMs)
        ? value.autoCloseAtMs
        : null,
  });
}

export function isEditorInputId(id) {
  return typeof id === "string" && INPUT_IDS.has(id);
}

export function appendActivityFeed(feed, entry, limit = ACTIVITY_FEED_LIMIT) {
  const safeLimit = Number.isInteger(limit) && limit > 0 ? limit : ACTIVITY_FEED_LIMIT;
  const source = Array.isArray(feed) ? feed.filter((line) => typeof line === "string") : [];
  const text = typeof entry === "string" ? entry.trim() : "";
  if (text.length === 0) return Object.freeze(source.slice(-safeLimit));
  const last = source[source.length - 1];
  if (last === text) return Object.freeze(source.slice(-safeLimit));
  return Object.freeze([...source, text].slice(-safeLimit));
}

export function createModalState({
  tone = "success",
  title = "",
  message = "",
  detail = "",
  autoCloseAtMs = null,
} = {}) {
  return freezeModal({
    open: true,
    tone,
    title,
    message,
    detail,
    autoCloseAtMs,
  });
}

export function closeModalState() {
  return Object.freeze({
    open: false,
    tone: "info",
    title: "",
    message: "",
    detail: "",
    autoCloseAtMs: null,
  });
}

export function buildSavePresentation({ changed, reloaded, banner, saveCount, nowMs }) {
  const safeBanner = typeof banner === "string" && banner.length > 0 ? banner : "placeholder";
  const safeCount =
    typeof saveCount === "number" && Number.isFinite(saveCount)
      ? Math.max(0, Math.floor(saveCount))
      : 0;
  const now = typeof nowMs === "number" && Number.isFinite(nowMs) ? Math.floor(nowMs) : Date.now();

  if (changed && reloaded) {
    return Object.freeze({
      status: Object.freeze({
        level: "success",
        message: `Saved + reloaded: ${safeBanner}`,
      }),
      modal: createModalState({
        tone: "success",
        title: "Hot Swap Applied",
        message: "widget-view.mjs was reloaded live without restarting the app.",
        detail: `Banner: ${safeBanner}   Saves: ${String(safeCount)}`,
        autoCloseAtMs: now + 1800,
      }),
      activity: "Reload applied from self-edit save.",
    });
  }

  if (changed && !reloaded) {
    return Object.freeze({
      status: Object.freeze({
        level: "error",
        message: `Saved file but reload failed: ${safeBanner}`,
      }),
      modal: createModalState({
        tone: "error",
        title: "Reload Failed",
        message: "File write succeeded but HSR could not apply the new widget view.",
        detail: `Banner: ${safeBanner}`,
      }),
      activity: "File saved, but live reload failed.",
    });
  }

  if (!changed && reloaded) {
    return Object.freeze({
      status: Object.freeze({
        level: "success",
        message: `No file change; forced reload applied: ${safeBanner}`,
      }),
      modal: createModalState({
        tone: "info",
        title: "Reload Applied",
        message: "HSR reapplied the current view module.",
        detail: `Banner unchanged: ${safeBanner}`,
        autoCloseAtMs: now + 1400,
      }),
      activity: "Manual reload applied (no file delta).",
    });
  }

  return Object.freeze({
    status: Object.freeze({
      level: "success",
      message: `No file change needed: ${safeBanner}`,
    }),
    modal: null,
    activity: "No file change detected.",
  });
}

export function summarizeHsrEvent(event) {
  const level = event?.level === "error" ? "error" : event?.level === "warn" ? "warn" : "info";
  const message = typeof event?.message === "string" ? event.message : "";
  const changedPath = typeof event?.changedPath === "string" ? event.changedPath : "";
  const pathTail =
    changedPath.length > 0 ? (changedPath.split(/[\\/]/).filter(Boolean).slice(-1)[0] ?? "") : "";

  let headline = message.trim();
  if (headline.length === 0) headline = "HSR event";
  if (pathTail.length > 0) headline += ` (${pathTail})`;

  if (level === "error") return `HSR error: ${headline}`;
  if (level === "warn") return `HSR warning: ${headline}`;
  return `HSR: ${headline}`;
}
