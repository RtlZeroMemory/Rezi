import { type RuntimeBackend, type UiEvent, type VNode, createApp, ui } from "@rezi-ui/core";
import { createNodeBackend } from "@rezi-ui/node";
import React from "react";
import AccessibilityContext from "./context/AccessibilityContext.js";
import AppContext from "./context/AppContext.js";
import FocusProvider from "./context/FocusProvider.js";
import StdioContext, { type StdioContextValue } from "./context/StdioContext.js";
import { createInputEventEmitter } from "./internal/emitter.js";
import { enableWarnOnce } from "./internal/warn.js";
import { applyLayoutSnapshot } from "./measurement.js";
import type reconciler from "./reconciler.js";
import { type HostRoot, createRootContainer, updateRootContainer } from "./reconciler.js";
import { createConsoleCapture } from "./render/consoleCapture.js";
import { deferred } from "./render/deferred.js";
import { normalizeRenderOptions } from "./render/options.js";
import type { Instance, RenderOptions } from "./types.js";

type AppState = Readonly<{ vnode: VNode; consoleLines: readonly string[] }>;

const ANSI_ALTERNATE_BUFFER_ENTER = "\u001B[?1049h";
const ANSI_ALTERNATE_BUFFER_EXIT = "\u001B[?1049l";

function hasRawMode(stdin: NodeJS.ReadStream): stdin is NodeJS.ReadStream & {
  isTTY: true;
  setRawMode: (value: boolean) => void;
  ref: () => void;
  unref: () => void;
} {
  return (
    (stdin as unknown as { isTTY?: unknown }).isTTY === true &&
    typeof (stdin as unknown as { setRawMode?: unknown }).setRawMode === "function"
  );
}

function writeBestEffort(stream: NodeJS.WriteStream, data: string): void {
  try {
    void stream.write(data);
  } catch {
    // ignore
  }
}

export function render(
  tree: React.ReactNode,
  options?: RenderOptions | NodeJS.WriteStream,
): Instance {
  const opts = normalizeRenderOptions(options);

  if (opts.debug === true) enableWarnOnce();

  const stdin = opts.stdin ?? process.stdin;
  const stdout = opts.stdout ?? process.stdout;
  const stderr = opts.stderr ?? process.stderr;

  const exitOnCtrlC = opts.exitOnCtrlC !== false;
  const maxFps = opts.maxFps ?? 60;
  const isScreenReaderEnabled =
    opts.isScreenReaderEnabled ??
    // biome-ignore lint/complexity/useLiteralKeys: process.env is typed with an index signature under our TS config.
    process.env["INK_SCREEN_READER"] === "true";

  let alternateBufferActive = opts.alternateBufferAlreadyActive === true;
  const canUseAlternateBuffer =
    opts.alternateBuffer === true && (stdout as unknown as { isTTY?: unknown }).isTTY === true;

  if (canUseAlternateBuffer && !alternateBufferActive) {
    writeBestEffort(stdout, ANSI_ALTERNATE_BUFFER_ENTER);
    alternateBufferActive = true;
  }

  const eventEmitter = createInputEventEmitter<UiEvent>();

  let rootRef: HostRoot | null = null;

  const backend = ((opts as { internal_backend?: unknown }).internal_backend ??
    createNodeBackend({ fpsCap: maxFps })) as RuntimeBackend;
  const app = createApp<AppState>({
    backend,
    initialState: { vnode: ui.text(""), consoleLines: [] },
    config: {
      fpsCap: maxFps,
      internal_onRender: (metrics) => {
        opts.onRender?.(metrics);
      },
      internal_onLayout: (snapshot) => {
        if (!rootRef) return;
        applyLayoutSnapshot(rootRef, snapshot.idRects);
      },
    },
  });
  app.view((s) => {
    if (s.consoleLines.length === 0) return s.vnode;
    const out: VNode[] = [];
    for (const line of s.consoleLines) out.push(ui.text(line));
    out.push(s.vnode);
    return out.length === 1 ? (out[0] ?? ui.text("")) : ui.column({}, out);
  });

  const exitD = deferred<void>();
  let exited = false;
  let exitError: Error | null = null;
  let restoreConsole: (() => void) | null = null;
  let unsubEvents: (() => void) | null = null;

  const supportsRawMode = hasRawMode(stdin);
  const backendOwnsRawMode = stdin === process.stdin;
  let rawModeEnabledCount = 0;

  const cleanupPatchedConsole = () => {
    if (restoreConsole === null) return;
    try {
      restoreConsole();
    } catch {
      // ignore
    }
    restoreConsole = null;
  };

  const cleanupEventSubscription = () => {
    if (unsubEvents === null) return;
    try {
      unsubEvents();
    } catch {
      // ignore
    }
    unsubEvents = null;
  };

  const cleanupRawMode = () => {
    if (rawModeEnabledCount <= 0) return;
    if (supportsRawMode && !backendOwnsRawMode) {
      try {
        stdin.setRawMode(false);
      } catch {
        // ignore
      }
      try {
        stdin.unref();
      } catch {
        // ignore
      }
    }
    rawModeEnabledCount = 0;
  };

  const cleanupAlternateBuffer = () => {
    if (!canUseAlternateBuffer || !alternateBufferActive) return;
    writeBestEffort(stdout, ANSI_ALTERNATE_BUFFER_EXIT);
    alternateBufferActive = false;
  };

  // Console patching: best-effort Ink compatibility.
  // We intentionally disable in debug mode and in Node's test runner.
  const shouldPatchConsole =
    opts.patchConsole !== false &&
    opts.debug !== true &&
    !process.argv.includes("--test") &&
    (stdout as unknown as { isTTY?: unknown }).isTTY === true;

  const { patchConsole, clearConsoleBuffer } = createConsoleCapture(app, () => exited);

  let latestTree = tree;
  let container: ReturnType<typeof reconciler.createContainer> | null = null;

  const requestExit = (err?: Error) => {
    if (exited) return;
    if (err) exitError = err;
    exited = true;
    cleanupPatchedConsole();
    cleanupEventSubscription();
    cleanupRawMode();
    cleanupAlternateBuffer();
    void Promise.resolve()
      .then(() => app.stop())
      .catch(() => {
        // Best-effort; still resolve/reject exit promise.
      })
      .finally(() => {
        cleanupEventSubscription();
        try {
          app.dispose();
        } catch {
          // ignore
        }
        if (exitError) exitD.reject(exitError);
        else exitD.resolve(undefined);
      });
  };

  if (exitOnCtrlC) {
    app.keys({
      "ctrl+c": () => requestExit(),
    });
  }

  unsubEvents = app.onEvent((ev) => {
    eventEmitter.emit("input", ev);
  });

  const stdioValue: StdioContextValue = Object.freeze({
    stdin,
    stdout,
    stderr,
    setRawMode: (enabled: boolean) => {
      if (!supportsRawMode) {
        if (stdin === process.stdin) {
          throw new Error(
            "Raw mode is not supported on the current process.stdin, which Ink uses as input stream by default.",
          );
        }
        throw new Error("Raw mode is not supported on the stdin provided to Ink.");
      }

      if (enabled) {
        if (rawModeEnabledCount === 0 && !backendOwnsRawMode) {
          stdin.setEncoding("utf8");
          try {
            stdin.ref();
          } catch {
            // ignore
          }
          stdin.setRawMode(true);
        }
        rawModeEnabledCount++;
        return;
      }

      if (rawModeEnabledCount <= 0) return;
      rawModeEnabledCount--;
      if (rawModeEnabledCount === 0 && !backendOwnsRawMode) {
        stdin.setRawMode(false);
        try {
          stdin.unref();
        } catch {
          // ignore
        }
      }
    },
    isRawModeSupported: supportsRawMode,
    internal_exitOnCtrlC: exitOnCtrlC,
    internal_eventEmitter: eventEmitter,
  });

  const requestRerender = () => {
    if (exited || container === null) return;
    clearConsoleBuffer();
    updateRootContainer(container, wrap(latestTree));
  };

  const wrap = (node: React.ReactNode) =>
    React.createElement(
      AppContext.Provider,
      { value: { exit: requestExit, rerender: requestRerender } },
      React.createElement(
        AccessibilityContext.Provider,
        { value: isScreenReaderEnabled },
        React.createElement(
          StdioContext.Provider,
          { value: stdioValue },
          React.createElement(FocusProvider, null, node),
        ),
      ),
    );

  const root: HostRoot = {
    kind: "root",
    children: [],
    staticVNodes: [],
    onCommit(vnode) {
      app.update((prev) => ({ ...prev, vnode: vnode ?? ui.text("") }));
    },
  };
  rootRef = root;

  container = createRootContainer(root);

  try {
    if (shouldPatchConsole) restoreConsole = patchConsole();
    updateRootContainer(container, wrap(latestTree));
  } catch (error) {
    cleanupPatchedConsole();
    cleanupEventSubscription();
    cleanupRawMode();
    cleanupAlternateBuffer();
    try {
      app.dispose();
    } catch {
      // ignore
    }
    throw error;
  }

  void app.start().catch((e: unknown) => {
    requestExit(e instanceof Error ? e : new Error(String(e)));
  });

  return {
    rerender(nextTree: React.ReactNode) {
      latestTree = nextTree;
      requestRerender();
    },
    unmount() {
      if (container === null) return;
      updateRootContainer(container, null);
      requestExit();
    },
    waitUntilExit() {
      return exitD.promise;
    },
    cleanup() {
      if (container === null) return;
      updateRootContainer(container, null);
      requestExit();
    },
    clear() {
      clearConsoleBuffer();
      app.update((prev) => ({ ...prev, vnode: ui.text(""), consoleLines: [] }));
    },
  };
}
