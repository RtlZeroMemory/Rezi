import { createApp } from "@rezi-ui/core";
import { createHotStateReload, createNodeBackend } from "@rezi-ui/node";
import {
  clampCodeCursor,
  createCodeEditorState,
  joinCodeLines,
  splitCodeDraft,
} from "./widget-code-editor-state.mjs";
import { buildWidgetSnippet, extractBannerFromSnippet } from "./widget-code-snippet.mjs";
import {
  ACTIVITY_FEED_LIMIT,
  appendActivityFeed,
  buildSavePresentation,
  closeModalState,
  createModalState,
  isEditorInputId,
  summarizeHsrEvent,
} from "./widget-demo-feedback.mjs";
import { rewriteWidgetViewBanner, sanitizeSelfEditBanner } from "./widget-view-self-edit.mjs";
import { SELF_EDIT_BANNER, renderWidgetScreen } from "./widget-view.mjs";

const widgetViewModuleUrl = new URL("./widget-view.mjs", import.meta.url);
const CODE_EDITOR_ID = "self-edit-code";
const SAVE_VIEW_FILE_ID = "save-view-file";

function readInitialViewport() {
  const cols =
    typeof process.stdout.columns === "number" && Number.isFinite(process.stdout.columns)
      ? Math.max(20, Math.floor(process.stdout.columns))
      : 80;
  const rows =
    typeof process.stdout.rows === "number" && Number.isFinite(process.stdout.rows)
      ? Math.max(8, Math.floor(process.stdout.rows))
      : 24;
  return Object.freeze({ cols, rows });
}

const initialSnippet = buildWidgetSnippet(SELF_EDIT_BANNER);
const initialEditor = createCodeEditorState(initialSnippet);

const initialState = Object.freeze({
  count: 0,
  name: "Alice",
  notes: "Hot-reload preserves this value while changing only the view code.",
  bannerDraft: SELF_EDIT_BANNER,
  codeDraft: initialSnippet,
  codeLines: initialEditor.lines,
  codeCursor: initialEditor.cursor,
  codeSelection: initialEditor.selection,
  codeScrollTop: initialEditor.scrollTop,
  codeScrollLeft: initialEditor.scrollLeft,
  viewport: readInitialViewport(),
  saveCount: 0,
  selfEditStatus: Object.freeze({
    level: "success",
    message: "Ready. Edit code, then press F6/Ctrl+O/Ctrl+S (or Save button).",
  }),
  feedbackModal: closeModalState(),
  activityFeed: Object.freeze([
    "Ready: edit code, save, and watch live swap preserve state/focus.",
  ]),
  focusTrapVersion: 0,
  focusTrapInitialFocus: CODE_EDITOR_ID,
  showHelp: true,
});

const app = createApp({
  backend: createNodeBackend({ fpsCap: 30 }),
  initialState,
  config: { fpsCap: 30 },
});

const enableHsr = !process.argv.includes("--no-hsr");
let hsrController = null;
let stopping = false;
let latestState = initialState;
let suppressHsrModalUntilMs = 0;
let hsrReadyAtMs = 0;

function updateState(updater) {
  const next = typeof updater === "function" ? updater(latestState) : updater;
  latestState = next;
  app.update(() => next);
}

function closeFeedbackModal() {
  updateState((prev) =>
    Object.freeze({
      ...prev,
      feedbackModal: closeModalState(),
    }),
  );
}

function requestFocusOn(nextId) {
  updateState((prev) => {
    const nextVersion =
      typeof prev.focusTrapVersion === "number" && Number.isFinite(prev.focusTrapVersion)
        ? Math.max(0, Math.floor(prev.focusTrapVersion)) + 1
        : 1;
    const target =
      typeof nextId === "string" && nextId.length > 0 ? nextId : prev.focusTrapInitialFocus;
    return Object.freeze({
      ...prev,
      focusTrapVersion: nextVersion,
      focusTrapInitialFocus: target,
    });
  });
}

function codeDraftFromState(state) {
  return joinCodeLines(state.codeLines);
}

async function saveBannerToWidgetFile() {
  const extracted = extractBannerFromSnippet(
    codeDraftFromState(latestState),
    latestState.bannerDraft,
  );
  const draft = sanitizeSelfEditBanner(extracted);
  const manualSaveWindowUntilMs = Date.now() + 2500;
  if (manualSaveWindowUntilMs > suppressHsrModalUntilMs) {
    suppressHsrModalUntilMs = manualSaveWindowUntilMs;
  }

  try {
    const result = rewriteWidgetViewBanner(widgetViewModuleUrl, draft);
    let reloaded = false;
    if (hsrController) {
      if (!hsrController.isRunning()) await hsrController.start();
      reloaded = await hsrController.reloadNow();
    }

    const now = Date.now();
    updateState((prev) => {
      const nextSaveCount = prev.saveCount + 1;
      const presentation = buildSavePresentation({
        changed: result.changed,
        reloaded,
        banner: result.banner,
        saveCount: nextSaveCount,
        nowMs: now,
      });
      if (presentation.modal) suppressHsrModalUntilMs = now + 1200;
      const nextSnippet = buildWidgetSnippet(result.banner);
      const nextEditor = createCodeEditorState(nextSnippet, {
        scrollTop: prev.codeScrollTop,
        scrollLeft: prev.codeScrollLeft,
      });

      return Object.freeze({
        ...prev,
        bannerDraft: result.banner,
        codeDraft: nextSnippet,
        codeLines: nextEditor.lines,
        codeCursor: nextEditor.cursor,
        codeSelection: nextEditor.selection,
        codeScrollTop: nextEditor.scrollTop,
        codeScrollLeft: nextEditor.scrollLeft,
        saveCount: nextSaveCount,
        selfEditStatus: Object.freeze(presentation.status),
        feedbackModal: presentation.modal ?? closeModalState(),
        activityFeed: appendActivityFeed(
          prev.activityFeed,
          presentation.activity,
          ACTIVITY_FEED_LIMIT,
        ),
      });
    });
  } catch (error) {
    const detail = error instanceof Error ? error.message : String(error);
    updateState((prev) =>
      Object.freeze({
        ...prev,
        selfEditStatus: Object.freeze({
          level: "error",
          message: `Save failed: ${detail}`,
        }),
        feedbackModal: createModalState({
          tone: "error",
          title: "Save Failed",
          message: "Could not rewrite widget-view.mjs.",
          detail,
        }),
        activityFeed: appendActivityFeed(
          prev.activityFeed,
          `Save failed: ${detail}`,
          ACTIVITY_FEED_LIMIT,
        ),
      }),
    );
  }
}

function buildView(renderer) {
  return (state) =>
    renderer(state, {
      onIncrement: () => {
        updateState((prev) => ({ ...prev, count: prev.count + 1 }));
      },
      onDecrement: () => {
        updateState((prev) => ({ ...prev, count: prev.count - 1 }));
      },
      onNameInput: (value) => {
        updateState((prev) => ({ ...prev, name: value }));
      },
      onNotesInput: (value) => {
        updateState((prev) => Object.freeze({ ...prev, notes: value }));
      },
      onCodeEditorChange: (lines, cursor) => {
        updateState((prev) => {
          const normalizedLines = splitCodeDraft(joinCodeLines(lines));
          const normalizedCursor = clampCodeCursor(normalizedLines, cursor);
          const nextDraft = joinCodeLines(normalizedLines);
          return Object.freeze({
            ...prev,
            codeDraft: nextDraft,
            codeLines: normalizedLines,
            codeCursor: normalizedCursor,
            bannerDraft: extractBannerFromSnippet(nextDraft, prev.bannerDraft),
          });
        });
      },
      onCodeEditorSelectionChange: (selection) => {
        updateState((prev) =>
          Object.freeze({
            ...prev,
            codeSelection: selection ?? null,
          }),
        );
      },
      onCodeEditorScroll: (scrollTop, scrollLeft) => {
        const nextScrollTop = Number.isFinite(scrollTop) ? Math.max(0, Math.floor(scrollTop)) : 0;
        const nextScrollLeft = Number.isFinite(scrollLeft)
          ? Math.max(0, Math.floor(scrollLeft))
          : 0;
        updateState((prev) => {
          if (prev.codeScrollTop === nextScrollTop && prev.codeScrollLeft === nextScrollLeft) {
            return prev;
          }
          return Object.freeze({
            ...prev,
            codeScrollTop: nextScrollTop,
            codeScrollLeft: nextScrollLeft,
          });
        });
      },
      onSaveBannerToFile: () => {
        void saveBannerToWidgetFile();
      },
      onCloseFeedbackModal: () => {
        closeFeedbackModal();
      },
    });
}

app.view(buildView(renderWidgetScreen));
app.onEvent((event) => {
  if (event.kind !== "engine") return;
  if (event.event.kind === "resize") {
    const cols = event.event.cols;
    const rows = event.event.rows;
    updateState((prev) => {
      if (prev.viewport.cols === cols && prev.viewport.rows === rows) return prev;
      return { ...prev, viewport: Object.freeze({ cols, rows }) };
    });
    return;
  }

  if (event.event.kind === "tick") {
    const modal = latestState.feedbackModal;
    if (
      modal &&
      modal.open === true &&
      typeof modal.autoCloseAtMs === "number" &&
      Number.isFinite(modal.autoCloseAtMs) &&
      Date.now() >= modal.autoCloseAtMs
    ) {
      closeFeedbackModal();
    }
  }
});

app.keys({
  "ctrl+q": () => {
    void shutdown();
  },
  "ctrl+x": () => {
    void shutdown();
  },
  "ctrl+c": () => {
    void shutdown();
  },
  "alt+q": () => {
    void shutdown();
  },
  f10: () => {
    void shutdown();
  },
  q: {
    when: (ctx) => !isEditorInputId(ctx.focusedId),
    handler: () => {
      if (latestState.feedbackModal.open) {
        closeFeedbackModal();
        return;
      }
      void shutdown();
    },
  },
  "ctrl+g": {
    when: (ctx) => ctx.focusedId === CODE_EDITOR_ID,
    handler: () => {
      requestFocusOn(SAVE_VIEW_FILE_ID);
    },
  },
  f8: {
    when: (ctx) => ctx.focusedId === CODE_EDITOR_ID,
    handler: () => {
      requestFocusOn(SAVE_VIEW_FILE_ID);
    },
  },
  escape: {
    handler: (ctx) => {
      if (latestState.feedbackModal.open) {
        closeFeedbackModal();
        return;
      }
      if (ctx.focusedId === CODE_EDITOR_ID) {
        requestFocusOn(SAVE_VIEW_FILE_ID);
        return;
      }
      if (latestState.showHelp) {
        updateState((prev) => ({ ...prev, showHelp: false }));
      }
    },
  },
  "ctrl+s": () => {
    if (latestState.feedbackModal.open) closeFeedbackModal();
    void saveBannerToWidgetFile();
  },
  "ctrl+o": () => {
    if (latestState.feedbackModal.open) closeFeedbackModal();
    void saveBannerToWidgetFile();
  },
  f6: () => {
    if (latestState.feedbackModal.open) closeFeedbackModal();
    void saveBannerToWidgetFile();
  },
  enter: {
    when: (ctx) => !latestState.feedbackModal.open && ctx.focusedId === SAVE_VIEW_FILE_ID,
    handler: () => {
      void saveBannerToWidgetFile();
    },
  },
  h: {
    when: (ctx) => !isEditorInputId(ctx.focusedId),
    handler: () => {
      updateState((prev) => ({ ...prev, showHelp: !prev.showHelp }));
    },
  },
  "+": {
    when: (ctx) => !isEditorInputId(ctx.focusedId),
    handler: () => {
      updateState((prev) => ({ ...prev, count: prev.count + 1 }));
    },
  },
  "shift+=": {
    when: (ctx) => !isEditorInputId(ctx.focusedId),
    handler: () => {
      updateState((prev) => ({ ...prev, count: prev.count + 1 }));
    },
  },
  "-": {
    when: (ctx) => !isEditorInputId(ctx.focusedId),
    handler: () => {
      updateState((prev) => ({ ...prev, count: prev.count - 1 }));
    },
  },
});

async function shutdown() {
  if (stopping) return;
  stopping = true;

  if (hsrController) {
    await hsrController.stop();
    hsrController = null;
  }

  try {
    await app.stop();
  } catch {
    // Ignore stop races.
  }

  app.dispose();
}

console.log(
  "[HSR widget demo] Quit with F10, Alt+Q, q (outside editor inputs), Ctrl+Q, or Ctrl+C.",
);
console.log("[HSR widget demo] Extra quit fallback: Ctrl+X.");
console.log("[HSR widget demo] Press Esc (or F8/Ctrl+G) to jump focus out of code editor.");
console.log(
  "[HSR widget demo] Edit code snippet and save with Enter on Save button (or F6/Ctrl+O/Ctrl+S).",
);

try {
  if (enableHsr) {
    hsrController = createHotStateReload({
      app,
      viewModule: widgetViewModuleUrl,
      moduleRoot: new URL("./", import.meta.url),
      resolveView: (moduleNs) => {
        const render = moduleNs.renderWidgetScreen;
        if (typeof render !== "function") {
          throw new Error("Expected renderWidgetScreen export from widget-view.mjs");
        }
        return buildView(render);
      },
      onError: (error, context) => {
        const detail = error instanceof Error ? `${error.name}: ${error.message}` : String(error);
        updateState((prev) =>
          Object.freeze({
            ...prev,
            selfEditStatus: Object.freeze({
              level: "error",
              message: "HSR reload failed. Fix code and save again.",
            }),
            feedbackModal: createModalState({
              tone: "error",
              title: "HSR Reload Error",
              message: "The previous view stayed active to preserve running state.",
              detail,
            }),
            activityFeed: appendActivityFeed(
              prev.activityFeed,
              `HSR error (${context.phase}): ${detail}`,
              ACTIVITY_FEED_LIMIT,
            ),
          }),
        );
      },
      log: (event) => {
        const summary = summarizeHsrEvent(event);
        const now = Date.now();
        updateState((prev) =>
          Object.freeze({
            ...prev,
            activityFeed: appendActivityFeed(prev.activityFeed, summary, ACTIVITY_FEED_LIMIT),
          }),
        );

        const hasChangedPath =
          typeof event.changedPath === "string" && event.changedPath.length > 0;
        const isReloadApplied =
          event.level === "info" &&
          typeof event.message === "string" &&
          event.message.includes("reload applied") &&
          hasChangedPath;

        if (isReloadApplied && now >= hsrReadyAtMs && now >= suppressHsrModalUntilMs) {
          suppressHsrModalUntilMs = now + 1200;
          updateState((prev) =>
            Object.freeze({
              ...prev,
              selfEditStatus: Object.freeze({
                level: "success",
                message: "External file change reloaded live.",
              }),
              feedbackModal: createModalState({
                tone: "info",
                title: "External Hot Swap Applied",
                message: "Detected a file save and swapped the view module live.",
                detail: event.changedPath ?? "",
                autoCloseAtMs: now + 1500,
              }),
            }),
          );
        }
      },
    });
    await hsrController.start();
    hsrReadyAtMs = Date.now() + 1200;
  }

  await app.run();
} finally {
  if (hsrController) {
    await hsrController.stop();
    hsrController = null;
  }
}
