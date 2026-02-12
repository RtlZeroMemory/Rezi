import { EventEmitter } from "node:events";
import process from "node:process";
import { format } from "node:util";
import terminalSize from "terminal-size";
import {
  type BackendEventBatch,
  type RuntimeBackend,
  type VNode,
  ZRDL_MAGIC,
  ZR_DRAWLIST_VERSION_V2,
  ZR_CURSOR_SHAPE_BLOCK,
  ZR_EVENT_BATCH_VERSION_V1,
  ZREV_MAGIC,
  createApp,
  ui,
} from "@rezi-ui/core";
import { createNodeBackend } from "@rezi-ui/node";
import React from "react";
import AccessibilityContext from "./context/AccessibilityContext.js";
import AppContext from "./context/AppContext.js";
import FocusProvider from "./context/FocusProvider.js";
import CursorContext from "./context/CursorContext.js";
import StdioContext, { type StdioContextValue } from "./context/StdioContext.js";
import { enableWarnOnce } from "./internal/warn.js";
import { resolveFlags, type KittyFlagName } from "./kittyKeyboard.js";
import { applyLayoutSnapshot } from "./measurement.js";
import { type HostRoot, type RootContainer, createRootContainer, updateRootContainer } from "./reconciler.js";
import { normalizeRenderOptions } from "./render/options.js";
import type { CursorPosition } from "./logUpdate.js";
import type { Instance, RenderOptions } from "./types.js";

export type { Instance, RenderOptions } from "./types.js";

type AppState = Readonly<{ vnode: VNode }>;

type InternalRenderOptions = RenderOptions &
  Readonly<{
    internal_backend?: RuntimeBackend;
  }>;

type NormalizedInternalRenderOptions = Readonly<
  InternalRenderOptions & {
    stdout: NodeJS.WriteStream;
    stdin: NodeJS.ReadStream;
    stderr: NodeJS.WriteStream;
    debug: boolean;
    exitOnCtrlC: boolean;
    patchConsole: boolean;
    maxFps: number;
    incrementalRendering: boolean;
    concurrent: boolean;
  }
>;

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

function isInCi(env: Readonly<Record<string, string | undefined>> = process.env): boolean {
  // Mirrors `is-in-ci` behavior closely enough for Ink parity.
  const v = env["CI"];
  if (v && v !== "false") return true;
  if (env["CONTINUOUS_INTEGRATION"]) return true;
  if (env["BUILD_NUMBER"]) return true;
  if (env["RUN_ID"]) return true;
  return false;
}

type ExitError = Error | number | null | undefined;

const instances = new WeakMap<NodeJS.WriteStream, InkCompatInstance>();

function align4(n: number): number {
  return (n + 3) & ~3;
}

function encodeResizeBatchV1(cols: number, rows: number): Uint8Array {
  const totalSize = align4(24 + 32);
  const bytes = new Uint8Array(totalSize);
  const dv = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);

  dv.setUint32(0, ZREV_MAGIC, true);
  dv.setUint32(4, ZR_EVENT_BATCH_VERSION_V1, true);
  dv.setUint32(8, totalSize, true);
  dv.setUint32(12, 1, true); // event_count
  dv.setUint32(16, 0, true); // batch_flags
  dv.setUint32(20, 0, true); // reserved0

  let off = 24;
  dv.setUint32(off + 0, 5, true); // ZREV_RECORD_RESIZE
  dv.setUint32(off + 4, 32, true); // record_size
  dv.setUint32(off + 8, 0, true); // time_ms
  dv.setUint32(off + 12, 0, true); // flags
  dv.setUint32(off + 16, cols, true);
  dv.setUint32(off + 20, rows, true);
  dv.setUint32(off + 24, 0, true);
  dv.setUint32(off + 28, 0, true);

  return bytes;
}

function toPositiveIntOr(v: unknown, fallback: number): number {
  if (typeof v !== "number" || !Number.isFinite(v) || !Number.isInteger(v) || v <= 0) return fallback;
  return v;
}

function getStdoutCols(stdout: NodeJS.WriteStream): number {
  const columns = toPositiveIntOr((stdout as unknown as { columns?: unknown }).columns, 0);
  if (columns > 0) return columns;
  try {
    const size = terminalSize();
    return toPositiveIntOr(size?.columns, 80);
  } catch {
    return 80;
  }
}

function getStdoutRows(stdout: NodeJS.WriteStream): number {
  const rows = toPositiveIntOr((stdout as unknown as { rows?: unknown }).rows, 0);
  if (rows > 0) return rows;
  try {
    const size = terminalSize();
    return toPositiveIntOr(size?.rows, 24);
  } catch {
    return 24;
  }
}

type BufferedWaiter = Readonly<{
  resolve: (b: BackendEventBatch) => void;
  reject: (err: Error) => void;
}>;

type PatchFrame = (drawlist: Uint8Array) => Uint8Array;

class BufferedBackend implements RuntimeBackend {
  private readonly inner: RuntimeBackend;
  private readonly patchFrame: PatchFrame | null;
  private queue: BackendEventBatch[] = [];
  private waiters: BufferedWaiter[] = [];
  private pollError: Error | null = null;
  private pumping = false;

  constructor(inner: RuntimeBackend, opts?: Readonly<{ patchFrame?: PatchFrame }>) {
    this.inner = inner;
    this.patchFrame = opts?.patchFrame ?? null;
  }

  enqueue(batch: BackendEventBatch): void {
    if (this.pollError) {
      try {
        batch.release();
      } catch {
        // ignore
      }
      return;
    }

    const w = this.waiters.shift();
    if (w) {
      w.resolve(batch);
      return;
    }

    this.queue.push(batch);
  }

  fail(err: Error): void {
    if (this.pollError) return;
    this.pollError = err;

    for (const w of this.waiters) {
      w.reject(err);
    }
    this.waiters = [];

    for (const b of this.queue) {
      try {
        b.release();
      } catch {
        // ignore
      }
    }
    this.queue = [];
  }

  async start(): Promise<void> {
    await this.inner.start();

    if (this.pumping) return;
    this.pumping = true;
    void (async () => {
      while (this.pumping) {
        try {
          const batch = await this.inner.pollEvents();
          this.enqueue(batch);
        } catch (e: unknown) {
          if (!this.pumping) return;
          this.fail(e instanceof Error ? e : new Error(String(e)));
          return;
        }
      }
    })();
  }

  async stop(): Promise<void> {
    this.pumping = false;
    await this.inner.stop();
  }

  dispose(): void {
    this.pumping = false;
    this.inner.dispose();
  }

  async requestFrame(drawlist: Uint8Array): Promise<void> {
    const patched = this.patchFrame ? this.patchFrame(drawlist) : drawlist;
    return this.inner.requestFrame(patched);
  }

  pollEvents(): Promise<BackendEventBatch> {
    const b = this.queue.shift();
    if (b) return Promise.resolve(b);
    if (this.pollError) return Promise.reject(this.pollError);

    return new Promise<BackendEventBatch>((resolve, reject) => {
      this.waiters.push({
        resolve,
        reject: (err) => reject(err),
      });
    });
  }

  postUserEvent(tag: number, payload: Uint8Array): void {
    this.inner.postUserEvent(tag, payload);
  }

  async getCaps() {
    return this.inner.getCaps();
  }
}

const SET_CURSOR_CMD_SIZE = 20;
const OP_SET_CURSOR = 7;

function appendSetCursorV2(drawlist: Uint8Array, position: CursorPosition): Uint8Array {
  const dv = new DataView(drawlist.buffer, drawlist.byteOffset, drawlist.byteLength);
  if (dv.byteLength < 64) return drawlist;
  if (dv.getUint32(0, true) !== ZRDL_MAGIC) return drawlist;
  if (dv.getUint32(4, true) !== ZR_DRAWLIST_VERSION_V2) return drawlist;

  const headerSize = dv.getUint32(8, true);
  const totalSize = dv.getUint32(12, true);
  const cmdOffset = dv.getUint32(16, true);
  const cmdBytes = dv.getUint32(20, true);
  const cmdCount = dv.getUint32(24, true);

  const stringsSpanOffset = dv.getUint32(28, true);
  const stringsCount = dv.getUint32(32, true);
  const stringsBytesOffset = dv.getUint32(36, true);
  const stringsBytesLen = dv.getUint32(40, true);
  const blobsSpanOffset = dv.getUint32(44, true);
  const blobsCount = dv.getUint32(48, true);
  const blobsBytesOffset = dv.getUint32(52, true);
  const blobsBytesLen = dv.getUint32(56, true);

  if (headerSize !== 64) return drawlist;
  if (totalSize !== dv.byteLength) return drawlist;
  if (cmdOffset === 0) return drawlist;

  const cmdEnd = cmdOffset + cmdBytes;
  if (cmdEnd > totalSize) return drawlist;

  const out = new Uint8Array(totalSize + SET_CURSOR_CMD_SIZE);
  out.set(drawlist.subarray(0, cmdEnd), 0);

  const outDv = new DataView(out.buffer, out.byteOffset, out.byteLength);

  // Insert SET_CURSOR at the end of the command stream so it overrides any prior hideCursor.
  const off = cmdEnd;
  outDv.setUint16(off + 0, OP_SET_CURSOR, true);
  outDv.setUint16(off + 2, 0, true);
  outDv.setUint32(off + 4, SET_CURSOR_CMD_SIZE, true);
  outDv.setInt32(off + 8, position.x | 0, true);
  outDv.setInt32(off + 12, position.y | 0, true);
  outDv.setUint8(off + 16, ZR_CURSOR_SHAPE_BLOCK);
  outDv.setUint8(off + 17, 1); // visible
  outDv.setUint8(off + 18, 1); // blink (Ink doesn't expose this; true is fine)
  outDv.setUint8(off + 19, 0);

  // Shift remainder (string/blobs sections) by SET_CURSOR_CMD_SIZE.
  out.set(drawlist.subarray(cmdEnd), cmdEnd + SET_CURSOR_CMD_SIZE);

  const shift = (n: number): number => (n === 0 ? 0 : n + SET_CURSOR_CMD_SIZE);

  // Header (64 bytes)
  outDv.setUint32(0, ZRDL_MAGIC, true);
  outDv.setUint32(4, ZR_DRAWLIST_VERSION_V2, true);
  outDv.setUint32(8, headerSize, true);
  outDv.setUint32(12, out.byteLength, true);
  outDv.setUint32(16, cmdOffset, true);
  outDv.setUint32(20, cmdBytes + SET_CURSOR_CMD_SIZE, true);
  outDv.setUint32(24, cmdCount + 1, true);
  outDv.setUint32(28, shift(stringsSpanOffset), true);
  outDv.setUint32(32, stringsCount, true);
  outDv.setUint32(36, shift(stringsBytesOffset), true);
  outDv.setUint32(40, stringsBytesLen, true);
  outDv.setUint32(44, shift(blobsSpanOffset), true);
  outDv.setUint32(48, blobsCount, true);
  outDv.setUint32(52, shift(blobsBytesOffset), true);
  outDv.setUint32(56, blobsBytesLen, true);
  outDv.setUint32(60, 0, true);

  return out;
}

function getInstance(
  stdout: NodeJS.WriteStream,
  createInstance: () => InkCompatInstance,
  concurrent: boolean,
): InkCompatInstance {
  let instance = instances.get(stdout);

  if (!instance) {
    instance = createInstance();
    instances.set(stdout, instance);
  } else if (instance.isConcurrent !== concurrent) {
    console.warn(
      `Warning: render() was called with concurrent: ${concurrent}, but the existing instance for this stdout uses concurrent: ${instance.isConcurrent}. ` +
        `The concurrent option only takes effect on the first render. Call unmount() first if you need to change the rendering mode.`,
    );
  }

  return instance;
}

class InkCompatInstance {
  /**
   * Whether this instance is using concurrent rendering mode.
   */
  readonly isConcurrent: boolean;

  private readonly options: NormalizedInternalRenderOptions;

  private readonly app: ReturnType<typeof createApp<AppState>>;
  private readonly container: RootContainer;
  private readonly root: HostRoot;

  private readonly supportsRawMode: boolean;
  private rawModeEnabledCount = 0;
  private readableListener: (() => void) | undefined;
  private restoreConsole: (() => void) | null = null;
  private unsubEvents: (() => void) | null = null;

  private cursorPosition: CursorPosition | undefined = undefined;

  private kittyProtocolEnabled = false;
  private cancelKittyDetection: (() => void) | undefined;

  private isUnmounted = false;
  private exitPromise?: Promise<void>;
  private resolveExitPromise: () => void = () => {};
  private rejectExitPromise: (reason?: Error) => void = () => {};
  private beforeExitHandler: (() => void) | undefined;

  private latestTree: React.ReactNode | null = null;

  private readonly internalEventEmitter: EventEmitter;
  private readonly backend: BufferedBackend;

  constructor(options: NormalizedInternalRenderOptions) {
    this.options = options;
    this.isConcurrent = options.concurrent ?? false;

    if (options.debug === true) enableWarnOnce();

    const stdin = options.stdin;
    const stdout = options.stdout;
    const stderr = options.stderr;
    const maxFps = options.maxFps ?? 30;

    this.internalEventEmitter = new EventEmitter();
    this.internalEventEmitter.setMaxListeners(Infinity);

    let rootRef: HostRoot | null = null;

    const rawBackend =
      options.internal_backend ?? createNodeBackend({ fpsCap: maxFps, useDrawlistV2: true });
    const backend = new BufferedBackend(rawBackend, {
      patchFrame: (drawlist) => {
        const position = this.cursorPosition;
        return position ? appendSetCursorV2(drawlist, position) : drawlist;
      },
    });
    this.backend = backend;

    const handleStdoutResize = (): void => {
      backend.enqueue({
        bytes: encodeResizeBatchV1(getStdoutCols(stdout), getStdoutRows(stdout)),
        droppedBatches: 0,
        release: () => {},
      });
    };

    const app = createApp<AppState>({
      backend,
      initialState: { vnode: ui.text("") },
      config: {
        fpsCap: maxFps,
        internal_onRender: (metrics) => {
          options.onRender?.(metrics);
        },
        internal_onLayout: (snapshot) => {
          if (!rootRef) return;
          applyLayoutSnapshot(rootRef, snapshot.idRects);
        },
      },
    });

    app.view((s) => s.vnode);

    this.app = app;

    // Ink patches console when patchConsole=true and not in debug mode.
    if (options.patchConsole !== false && options.debug !== true) {
      this.restoreConsole = this.patchConsole();
    }

    // Mirror Ink: subscribe to stdout 'resize' events (best-effort) and convert them
    // into backend resize batches so Rezi's layout/render pipeline reruns.
    const stdoutEmitter = stdout as unknown as {
      on?: (event: string, listener: () => void) => unknown;
      off?: (event: string, listener: () => void) => unknown;
    };
    if (typeof stdoutEmitter.on === "function" && typeof stdoutEmitter.off === "function") {
      stdoutEmitter.on("resize", handleStdoutResize);
      this.unsubEvents = () => {
        stdoutEmitter.off?.("resize", handleStdoutResize);
      };
    }

    this.supportsRawMode = hasRawMode(stdin);

    const exitOnCtrlC = options.exitOnCtrlC !== false;

    const handleInput = (input: string): void => {
      // Exit on Ctrl+C (only when raw mode is enabled and we are reading stdin).
      // eslint-disable-next-line unicorn/no-hex-escape
      if (input === "\x03" && exitOnCtrlC) {
        this.unmount();
        return;
      }
    };

    const handleReadable = (): void => {
      // eslint-disable-next-line @typescript-eslint/ban-types
      let chunk;
      // eslint-disable-next-line @typescript-eslint/ban-types
      while ((chunk = stdin.read() as string | null) !== null) {
        handleInput(chunk);
        this.internalEventEmitter.emit("input", chunk);
      }
    };

    const stdioValue: StdioContextValue = Object.freeze({
      stdin,
      stdout,
      stderr,
      internal_writeToStdout: (data: string) => this.writeToStdout(data),
      internal_writeToStderr: (data: string) => this.writeToStderr(data),
      setRawMode: (enabled: boolean) => {
        if (!this.supportsRawMode) {
          if (stdin === process.stdin) {
            throw new Error(
              "Raw mode is not supported on the current process.stdin, which Ink uses as input stream by default.\n" +
                "Read about how to prevent this error on https://github.com/vadimdemedes/ink/#israwmodesupported",
            );
          }
          throw new Error(
            "Raw mode is not supported on the stdin provided to Ink.\n" +
              "Read about how to prevent this error on https://github.com/vadimdemedes/ink/#israwmodesupported",
          );
        }

        stdin.setEncoding("utf8");

        if (enabled) {
          if (this.rawModeEnabledCount === 0) {
            try {
              stdin.ref();
            } catch {
              // ignore
            }
            stdin.setRawMode(true);
            this.readableListener = handleReadable;
            stdin.addListener("readable", handleReadable);
          }
          this.rawModeEnabledCount++;
          return;
        }

        if (this.rawModeEnabledCount <= 0) return;
        this.rawModeEnabledCount--;
        if (this.rawModeEnabledCount === 0) {
          try {
            stdin.setRawMode(false);
          } catch {
            // ignore
          }
          if (this.readableListener) {
            stdin.removeListener("readable", this.readableListener);
            this.readableListener = undefined;
          }
          try {
            stdin.unref();
          } catch {
            // ignore
          }
        }
      },
      isRawModeSupported: this.supportsRawMode,
      internal_exitOnCtrlC: options.exitOnCtrlC !== false,
      internal_eventEmitter: this.internalEventEmitter,
    });

    const isScreenReaderEnabled =
      options.isScreenReaderEnabled ??
      // biome-ignore lint/complexity/useLiteralKeys: process.env is typed with an index signature under our TS config.
      process.env["INK_SCREEN_READER"] === "true";

    const wrap = (node: React.ReactNode) =>
      React.createElement(
        AppContext.Provider,
        { value: { exit: (err?: Error) => this.unmount(err) } },
        React.createElement(
          AccessibilityContext.Provider,
          { value: isScreenReaderEnabled },
          React.createElement(
            StdioContext.Provider,
            { value: stdioValue },
            React.createElement(
              CursorContext.Provider,
              { value: { setCursorPosition() {} } },
              React.createElement(FocusProvider, null, node),
            ),
          ),
        ),
      );

    this.root = {
      kind: "root",
      children: [],
      staticVNodes: [],
      onCommit: (vnode) => {
        app.update((prev) => ({ ...prev, vnode: vnode ?? ui.text("") }));
      },
    };
    rootRef = this.root;

    this.container = createRootContainer(this.root);

    // Render wrapper is stable, but node changes each call.
    this.wrap = wrap;

    void app.start().catch((e: unknown) => {
      this.unmount(e instanceof Error ? e : new Error(String(e)));
    });
  }

  // Wrapped render tree builder (assigned in constructor).
  private wrap!: (node: React.ReactNode) => React.ReactElement;

  render = (node: React.ReactNode): void => {
    if (this.isUnmounted) return;
    this.latestTree = node;
    updateRootContainer(this.container, this.wrap(node));
  };

  clear = (): void => {
    this.app.update((prev) => ({ ...prev, vnode: ui.text("") }));
  };

  writeToStdout = (data: string): void => {
    if (this.isUnmounted) return;
    try {
      this.options.stdout.write(data);
    } catch {
      // ignore
    }

    // Best-effort: schedule a new frame so the UI is restored after external writes.
    // Ink clears and re-renders the last output; Rezi's runtime needs a dirty turn
    // even if the React tree didn't change.
    try {
      this.app.update((prev) => ({ ...prev }));
    } catch {
      // ignore
    }
  };

  writeToStderr = (data: string): void => {
    if (this.isUnmounted) return;
    try {
      this.options.stderr.write(data);
    } catch {
      // ignore
    }

    try {
      this.app.update((prev) => ({ ...prev }));
    } catch {
      // ignore
    }
  };

  patchConsole = (): (() => void) => {
    const methods = ["log", "info", "warn", "error", "debug"] as const;
    const original: Partial<Record<(typeof methods)[number], (...args: unknown[]) => void>> = {};

    for (const name of methods) {
      const fn = console[name];
      if (typeof fn !== "function") continue;
      // eslint-disable-next-line no-console
      original[name] = fn;
      // eslint-disable-next-line no-console
      console[name] = (...args: unknown[]) => {
        const text = format(...args) + "\n";
        const toStderr = name === "warn" || name === "error";
        if (toStderr) {
          if (text.startsWith("The above error occurred")) return;
          this.writeToStderr(text);
          return;
        }
        this.writeToStdout(text);
      };
    }

    return () => {
      for (const name of methods) {
        const prev = original[name];
        if (!prev) continue;
        // eslint-disable-next-line no-console
        console[name] = prev;
      }
    };
  };

  // eslint-disable-next-line @typescript-eslint/ban-types
  unmount = (error?: ExitError): void => {
    if (this.isUnmounted) return;

    if (this.beforeExitHandler) {
      process.off("beforeExit", this.beforeExitHandler);
      this.beforeExitHandler = undefined;
    }

    this.isUnmounted = true;

    instances.delete(this.options.stdout);

    if (this.unsubEvents) {
      try {
        this.unsubEvents();
      } catch {
        // ignore
      }
      this.unsubEvents = null;
    }

    if (this.restoreConsole) {
      try {
        this.restoreConsole();
      } catch {
        // ignore
      }
      this.restoreConsole = null;
    }

    if (this.rawModeEnabledCount > 0 && this.supportsRawMode) {
      try {
        this.options.stdin.setRawMode(false);
      } catch {
        // ignore
      }
      if (this.readableListener) {
        try {
          this.options.stdin.removeListener("readable", this.readableListener);
        } catch {
          // ignore
        }
        this.readableListener = undefined;
      }
      try {
        this.options.stdin.unref();
      } catch {
        // ignore
      }
      this.rawModeEnabledCount = 0;
    }

    try {
      updateRootContainer(this.container, null);
    } catch {
      // Best-effort; unmount should not throw.
    }

    const resolveOrReject = () => {
      if (error instanceof Error) this.rejectExitPromise(error);
      else this.resolveExitPromise();
    };

    const isProcessExiting = error !== undefined && !(error instanceof Error);
    if (isProcessExiting) {
      resolveOrReject();
      return;
    }

    void Promise.resolve()
      .then(() => this.app.stop())
      .catch(() => {
        // ignore
      })
      .finally(() => {
        try {
          this.app.dispose();
        } catch {
          // ignore
        }

        // Ensure any queued writes have been processed before resolving.
        const stdout = this.options.stdout as unknown as {
          write?: (chunk: string, cb?: () => void) => unknown;
          writableLength?: unknown;
          _writableState?: unknown;
        };

        if (
          stdout &&
          typeof stdout.write === "function" &&
          (stdout._writableState !== undefined || stdout.writableLength !== undefined)
        ) {
          try {
            (this.options.stdout as unknown as NodeJS.WriteStream).write("", resolveOrReject);
            return;
          } catch {
            // ignore
          }
        }

        setImmediate(resolveOrReject);
      });
  };

  waitUntilExit = async (): Promise<void> => {
    this.exitPromise ||= new Promise((resolve, reject) => {
      this.resolveExitPromise = resolve;
      this.rejectExitPromise = reject;
    });

    if (!this.beforeExitHandler) {
      this.beforeExitHandler = () => {
        this.unmount();
      };

      process.once("beforeExit", this.beforeExitHandler);
    }

    return this.exitPromise;
  };
}

export default function render(tree: React.ReactNode, options?: RenderOptions | NodeJS.WriteStream): Instance {
  const opts = normalizeRenderOptions(options) as InternalRenderOptions;

  const inkOptions: NormalizedInternalRenderOptions = {
    stdout: process.stdout,
    stdin: process.stdin,
    stderr: process.stderr,
    debug: false,
    exitOnCtrlC: true,
    patchConsole: true,
    maxFps: 30,
    incrementalRendering: false,
    concurrent: false,
    ...opts,
  };

  const instance = getInstance(
    inkOptions.stdout,
    () => new InkCompatInstance(inkOptions),
    inkOptions.concurrent ?? false,
  );

  instance.render(tree);

  return {
    rerender: instance.render,
    unmount() {
      instance.unmount();
    },
    waitUntilExit: instance.waitUntilExit,
    cleanup: () => instances.delete(inkOptions.stdout),
    clear: instance.clear,
  };
}
