import { rgb, ui } from "@rezi-ui/core";
import { clampCodeCursor, joinCodeLines, splitCodeDraft } from "./widget-code-editor-state.mjs";
import { normalizeViewport, resolveWidgetDemoLayout } from "./widget-layout.mjs";

export const SELF_EDIT_BANNER = "placeholder";

const CODE_EDITOR_ID = "self-edit-code";
const SAVE_BUTTON_ID = "save-view-file";

const palette = Object.freeze({
  bg: rgb(40, 42, 54),
  frame: rgb(31, 34, 48),
  header: rgb(45, 48, 66),
  panel: rgb(45, 48, 66),
  panelAlt: rgb(36, 39, 53),
  editor: rgb(24, 26, 36),
  modal: rgb(34, 36, 50),
  ink: rgb(248, 248, 242),
  muted: rgb(98, 114, 164),
  cyan: rgb(139, 233, 253),
  green: rgb(80, 250, 123),
  pink: rgb(255, 121, 198),
  purple: rgb(189, 147, 249),
  yellow: rgb(241, 250, 140),
  orange: rgb(255, 184, 108),
  red: rgb(255, 85, 85),
});

function compactNodes(nodes) {
  return nodes.filter((node) => node !== null);
}

function clamp01(value) {
  if (!Number.isFinite(value)) return 0;
  if (value <= 0) return 0;
  if (value >= 1) return 1;
  return value;
}

function clipLine(value, maxLength = 88) {
  const text = typeof value === "string" ? value.replace(/\s+/g, " ").trim() : "";
  if (text.length <= maxLength) return text;
  if (maxLength <= 1) return text.slice(0, maxLength);
  return `${text.slice(0, maxLength - 1)}…`;
}

function asNonNegativeInt(value, fallback = 0) {
  if (typeof value !== "number" || !Number.isFinite(value)) return fallback;
  return Math.max(0, Math.floor(value));
}

function statusColor(level) {
  if (level === "error") return palette.red;
  if (level === "warn") return palette.orange;
  return palette.green;
}

function statusIcon(level) {
  if (level === "error") return "!";
  if (level === "warn") return "▲";
  return "✓";
}

function modalVariant(tone) {
  if (tone === "error") return "error";
  if (tone === "info") return "info";
  return "success";
}

function modalBorderColor(tone) {
  if (tone === "error") return palette.red;
  if (tone === "info") return palette.cyan;
  return palette.green;
}

function normalizeStatus(rawStatus) {
  const source = typeof rawStatus === "object" && rawStatus !== null ? rawStatus : {};
  const level =
    source.level === "error" || source.level === "warn" || source.level === "success"
      ? source.level
      : "success";
  const message = typeof source.message === "string" ? source.message : "Ready.";
  return Object.freeze({ level, message });
}

function normalizeModal(rawModal) {
  const source = typeof rawModal === "object" && rawModal !== null ? rawModal : {};
  return Object.freeze({
    open: source.open === true,
    tone: source.tone === "error" || source.tone === "info" ? source.tone : "success",
    title: typeof source.title === "string" ? source.title : "",
    message: typeof source.message === "string" ? source.message : "",
    detail: typeof source.detail === "string" ? source.detail : "",
  });
}

function normalizeFeed(rawFeed) {
  if (!Array.isArray(rawFeed)) return [];
  return rawFeed.filter((line) => typeof line === "string" && line.trim().length > 0);
}

function normalizeCodeLines(state) {
  const lines = splitCodeDraft(joinCodeLines(state?.codeLines));
  if (lines.length > 1 || (lines[0] ?? "").length > 0) return lines;
  const fallbackDraft = typeof state?.codeDraft === "string" ? state.codeDraft : "";
  return splitCodeDraft(fallbackDraft);
}

function normalizeCodeSelection(lines, selection) {
  if (!selection || typeof selection !== "object") return null;
  const anchor = clampCodeCursor(lines, selection.anchor);
  const active = clampCodeCursor(lines, selection.active);
  return Object.freeze({ anchor, active });
}

function editorMetrics(layoutMode, viewportRows) {
  if (layoutMode === "tiny") {
    return Object.freeze({
      editorRows: Math.max(5, Math.min(8, Math.max(5, viewportRows - 12))),
      clipWidth: 44,
    });
  }
  if (layoutMode === "compact") {
    return Object.freeze({
      editorRows: Math.max(8, Math.min(14, Math.max(8, viewportRows - 14))),
      clipWidth: 64,
    });
  }
  return Object.freeze({
    editorRows: Math.max(10, Math.min(16, Math.max(10, viewportRows - 20))),
    clipWidth: 84,
  });
}

function renderHeader(state, layoutMode) {
  const modeLabel = layoutMode === "full" ? "FULL" : layoutMode === "compact" ? "COMPACT" : "TINY";
  const headline = clipLine(state.bannerDraft, layoutMode === "tiny" ? 32 : 62);

  return ui.box(
    {
      border: "double",
      p: 1,
      style: { fg: palette.ink, bg: palette.header },
    },
    [
      ui.row({ justify: "between", items: "center", gap: 1, wrap: true }, [
        ui.text("Hot State-Preserving Reload Widget Lab", {
          variant: "heading",
          style: { fg: palette.ink, bold: true },
        }),
        ui.row({ gap: 1 }, [
          ui.badge(modeLabel, { variant: "info" }),
          ui.badge("DRACULA", { variant: "warning" }),
          ui.badge("LIVE", { variant: "success" }),
        ]),
      ]),
      ui.box(
        { border: "single", px: 1, py: 0, style: { fg: palette.cyan, bg: palette.panelAlt } },
        [
          ui.row({ gap: 1, items: "center", wrap: true }, [
            ui.badge("LIVE UPDATE", { variant: "success" }),
            ui.text(headline, { style: { fg: palette.orange, bold: true } }),
          ]),
        ],
      ),
      ui.text("Esc/F8/Ctrl+G leaves editor focus. q or Alt+Q exits once outside editor.", {
        style: { fg: palette.muted },
      }),
    ],
  );
}

function renderEditorPanel(state, handlers, layoutMode, viewport, status, feed) {
  const metrics = editorMetrics(layoutMode, viewport.rows);
  const lines = normalizeCodeLines(state);
  const cursor = clampCodeCursor(lines, state.codeCursor);
  const selection = normalizeCodeSelection(lines, state.codeSelection);
  const latestFeed = clipLine(feed[feed.length - 1] ?? "No HSR events yet.", metrics.clipWidth);
  const scrollTop = asNonNegativeInt(state.codeScrollTop, 0);
  const scrollLeft = asNonNegativeInt(state.codeScrollLeft, 0);

  const statusBlock = ui.box(
    {
      border: "single",
      px: 1,
      py: 0,
      style: { fg: statusColor(status.level), bg: palette.panelAlt },
    },
    [
      ui.text(`${statusIcon(status.level)} ${clipLine(status.message, metrics.clipWidth)}`, {
        style: { fg: statusColor(status.level), bold: true },
      }),
      ui.text(`HSR: ${latestFeed}`, { style: { fg: palette.muted } }),
    ],
  );

  const footerRow = ui.row({ gap: 1, items: "center", wrap: true }, [
    ui.button({
      id: SAVE_BUTTON_ID,
      label: "Save + Hot Reload",
      onPress: handlers.onSaveBannerToFile,
      style: { fg: palette.green, bold: true },
    }),
    ui.kbd("Enter"),
    ui.kbd("F6"),
    ui.text("fallback: Ctrl+S / Ctrl+O", { style: { fg: palette.muted } }),
  ]);

  return ui.box(
    {
      title: "Self-Edit widget-view.mjs",
      border: "rounded",
      px: 1,
      py: 0,
      style: { fg: palette.ink, bg: palette.panel },
    },
    [
      ui.column({ gap: 1 }, [
        ui.row({ gap: 1, items: "center", wrap: true }, [
          ui.badge("TYPE HERE", { variant: "success" }),
          ui.text("Edit TypeScript and save. Live Update banner changes without process restart.", {
            style: { fg: palette.muted },
          }),
        ]),
        ui.box(
          {
            border: "single",
            px: 0,
            py: 0,
            height: metrics.editorRows + 2,
            style: { fg: palette.cyan, bg: palette.editor },
          },
          [
            ui.codeEditor({
              id: CODE_EDITOR_ID,
              lines,
              cursor,
              selection,
              scrollTop,
              scrollLeft,
              syntaxLanguage: "typescript",
              lineNumbers: true,
              tabSize: 2,
              insertSpaces: true,
              wordWrap: false,
              onChange: (nextLines, nextCursor) =>
                handlers.onCodeEditorChange(nextLines, nextCursor),
              onSelectionChange: (nextSelection) =>
                handlers.onCodeEditorSelectionChange(nextSelection),
              onScroll: (nextTop, nextLeft) => handlers.onCodeEditorScroll(nextTop, nextLeft),
            }),
          ],
        ),
        footerRow,
        ui.text("Press Esc / F8 / Ctrl+G to leave editor focus and use global keys.", {
          style: { fg: palette.muted },
        }),
        statusBlock,
      ]),
    ],
  );
}

function renderCounterPanel(state, handlers) {
  const meter = clamp01((state.count + 10) / 20);
  return ui.box(
    {
      title: "State Probe",
      border: "rounded",
      px: 1,
      py: 0,
      style: { fg: palette.ink, bg: palette.panelAlt },
    },
    [
      ui.column({ gap: 1 }, [
        ui.row({ gap: 2, items: "center", wrap: true }, [
          ui.button({
            id: "counter-dec",
            label: "-1",
            onPress: handlers.onDecrement,
            style: { fg: palette.orange, bold: true },
          }),
          ui.text(`Count: ${String(state.count)}`, {
            variant: "heading",
            style: { fg: palette.cyan, bold: true },
          }),
          ui.button({
            id: "counter-inc",
            label: "+1",
            onPress: handlers.onIncrement,
            style: { fg: palette.green, bold: true },
          }),
        ]),
        ui.progress(meter, {
          label: "State continuity",
          showPercent: true,
          style: { fg: palette.purple },
          trackStyle: { fg: palette.muted },
        }),
      ]),
    ],
  );
}

function renderFormPanel(state, handlers, layoutMode) {
  const notesRows = layoutMode === "full" ? 4 : 2;
  return ui.box(
    {
      title: "Persistent Form State",
      border: "rounded",
      px: 1,
      py: 0,
      style: { fg: palette.ink, bg: palette.panel },
    },
    [
      ui.column({ gap: 1 }, [
        ui.text("Name", { variant: "caption", style: { fg: palette.muted } }),
        ui.input({
          id: "name",
          value: state.name,
          onInput: (value) => handlers.onNameInput(value),
          style: { fg: palette.ink, bg: palette.panelAlt },
        }),
        ui.text("Notes", { variant: "caption", style: { fg: palette.muted } }),
        ui.textarea({
          id: "notes",
          value: state.notes,
          onInput: (value) => handlers.onNotesInput(value),
          rows: notesRows,
          style: { fg: palette.ink, bg: palette.panelAlt },
        }),
      ]),
    ],
  );
}

function renderRunbookPanel() {
  return ui.box(
    {
      title: "Navigation",
      border: "rounded",
      px: 1,
      py: 0,
      style: { fg: palette.ink, bg: palette.panel },
    },
    [
      ui.column({ gap: 1 }, [
        ui.row({ gap: 1, wrap: true }, [
          ui.badge("Tab next", { variant: "info" }),
          ui.badge("Shift+Tab prev", { variant: "info" }),
          ui.badge("Esc out", { variant: "warning" }),
          ui.badge("Enter save", { variant: "success" }),
          ui.badge("F10 quit", { variant: "warning" }),
        ]),
        ui.callout("Focus order: editor -> save -> name -> notes -> counter controls.", {
          variant: "info",
        }),
      ]),
    ],
  );
}

function renderFeedbackModal(modal, handlers, layoutMode) {
  if (!modal.open) return null;
  const width = layoutMode === "full" ? 78 : layoutMode === "compact" ? 66 : 56;
  const detailWidth = layoutMode === "tiny" ? 44 : 68;
  const title = modal.title.length > 0 ? modal.title : "HSR Update";
  const message =
    modal.message.length > 0
      ? modal.message
      : "View module changed and state stayed alive in this running process.";

  return ui.modal({
    id: "widget-feedback-modal",
    title,
    width,
    maxWidth: 84,
    backdrop: "dim",
    closeOnBackdrop: true,
    closeOnEscape: true,
    frameStyle: {
      background: palette.modal,
      foreground: palette.ink,
      border: modalBorderColor(modal.tone),
    },
    initialFocus: "widget-feedback-close",
    returnFocusTo: CODE_EDITOR_ID,
    onClose: handlers.onCloseFeedbackModal,
    content: ui.column({ gap: 1 }, [
      ui.callout(message, { variant: modalVariant(modal.tone) }),
      modal.detail.length > 0
        ? ui.box(
            { border: "single", px: 1, py: 0, style: { fg: palette.muted, bg: palette.modal } },
            [
              ui.text(clipLine(modal.detail, detailWidth), {
                style: { fg: palette.muted },
              }),
            ],
          )
        : null,
    ]),
    actions: [
      ui.button({
        id: "widget-feedback-close",
        label: "Close",
        onPress: handlers.onCloseFeedbackModal,
      }),
    ],
  });
}

function renderBody(layoutMode, editorPanel, formPanel, counterPanel, runbookPanel) {
  if (layoutMode === "tiny") {
    return ui.column({ gap: 1 }, [editorPanel]);
  }

  if (layoutMode === "compact") {
    return ui.column({ gap: 1 }, [editorPanel]);
  }

  return ui.row({ gap: 1, items: "stretch" }, [
    ui.column({ gap: 1, flex: 3 }, [editorPanel]),
    ui.column({ gap: 1, flex: 2 }, compactNodes([formPanel, counterPanel, runbookPanel])),
  ]);
}

export function renderWidgetScreen(state, handlers) {
  const viewport = normalizeViewport(state.viewport);
  const layoutMode = resolveWidgetDemoLayout(viewport);
  const status = normalizeStatus(state.selfEditStatus);
  const modal = normalizeModal(state.feedbackModal);
  const feed = normalizeFeed(state.activityFeed);
  const trapVersion =
    typeof state.focusTrapVersion === "number" && Number.isFinite(state.focusTrapVersion)
      ? Math.max(0, Math.floor(state.focusTrapVersion))
      : 0;
  const trapInitialFocus =
    typeof state.focusTrapInitialFocus === "string" && state.focusTrapInitialFocus.length > 0
      ? state.focusTrapInitialFocus
      : CODE_EDITOR_ID;

  const editorPanel = renderEditorPanel(state, handlers, layoutMode, viewport, status, feed);
  const formPanel = renderFormPanel(state, handlers, layoutMode);
  const counterPanel = renderCounterPanel(state, handlers);
  const runbookPanel = renderRunbookPanel();
  const body = renderBody(layoutMode, editorPanel, formPanel, counterPanel, runbookPanel);

  const footer = ui.row({ gap: 1, wrap: true, items: "center" }, [
    ui.text(`Viewport ${String(viewport.cols)}x${String(viewport.rows)} (${layoutMode})`, {
      style: { fg: palette.muted },
    }),
    ui.kbd("Tab"),
    ui.kbd("Shift+Tab"),
    ui.kbd("Esc"),
    ui.kbd("Enter"),
    ui.kbd("F6"),
    ui.kbd("q"),
    ui.kbd("F10"),
  ]);

  const page = ui.page({
    p: 1,
    gap: 1,
    header: renderHeader(state, layoutMode),
    body,
    footer,
  });

  const frame = ui.box(
    {
      border: "single",
      p: 0,
      width: "full",
      height: "full",
      style: { fg: palette.ink, bg: palette.frame },
    },
    [ui.box({ width: "full", height: "full", style: { fg: palette.ink, bg: palette.bg } }, [page])],
  );

  const trapped = ui.focusTrap(
    {
      id: `widget-hsr-focus-trap-${String(trapVersion)}`,
      active: true,
      initialFocus: trapInitialFocus,
    },
    [frame],
  );

  const feedbackModal = renderFeedbackModal(modal, handlers, layoutMode);
  if (!feedbackModal) return trapped;
  return ui.layers([trapped, feedbackModal]);
}
