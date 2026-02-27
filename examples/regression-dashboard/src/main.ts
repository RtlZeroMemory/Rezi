import { appendFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { exit } from "node:process";
import { createDrawlistBuilder } from "@rezi-ui/core";
import { parsePayload, parseRecordHeader } from "@rezi-ui/core/debug";
import { createNodeApp } from "@rezi-ui/node";
import { resolveDashboardCommand } from "./helpers/keybindings.js";
import { reduceDashboardState, selectedService } from "./helpers/state.js";
import { createInitialState } from "./helpers/state.js";
import { renderOverviewScreen } from "./screens/overview.js";
import { themeSpec } from "./theme.js";
import type { DashboardAction, DashboardState } from "./types.js";

const UI_FPS_CAP = 30;
const TICK_MS = 900;
const DRAWLIST_HEADER_SIZE = 64;
const DEBUG_HEADER_SIZE = 40;
const DEBUG_QUERY_MAX_RECORDS = 64;
const ENABLE_BACKEND_DEBUG = process.env["REZI_REGRESSION_BACKEND_DEBUG"] !== "0";
const DEBUG_LOG_PATH =
  process.env["REZI_REGRESSION_DEBUG_LOG"] ?? `${tmpdir()}/rezi-regression-dashboard.log`;

const initialState = createInitialState();
const enableHsr = process.argv.includes("--hsr") || process.env["REZI_HSR"] === "1";
const forceHeadless = process.argv.includes("--headless");
const hasInteractiveTty = process.stdout.isTTY === true && process.stdin.isTTY === true;

type OverviewRenderer = typeof renderOverviewScreen;
type OverviewModule = Readonly<{
  renderOverviewScreen?: OverviewRenderer;
}>;

function serializeDetail(detail: unknown): string {
  if (detail instanceof Error) {
    return JSON.stringify({
      name: detail.name,
      message: detail.message,
      stack: detail.stack,
    });
  }
  if (typeof detail === "string") return detail;
  try {
    return JSON.stringify(detail);
  } catch {
    return String(detail);
  }
}

function describeError(error: unknown): string {
  if (error instanceof Error) return `${error.name}: ${error.message}`;
  return serializeDetail(error);
}

function stderrLog(message: string): void {
  try {
    process.stderr.write(`${message}\n`);
  } catch {
    // best-effort diagnostics only
  }
}

function toSignedI32(value: number): number {
  return value > 0x7fff_ffff ? value - 0x1_0000_0000 : value;
}

type DrawlistHeaderSummary = Readonly<{
  magic: number;
  version: number;
  headerSize: number;
  totalSize: number;
  cmdOffset: number;
  cmdBytes: number;
  cmdCount: number;
  stringsSpanOffset: number;
  stringsCount: number;
  stringsBytesOffset: number;
  stringsBytesLen: number;
  blobsSpanOffset: number;
  blobsCount: number;
  blobsBytesOffset: number;
  blobsBytesLen: number;
  reserved0: number;
}>;

function summarizeDrawlistHeader(bytes: Uint8Array): DrawlistHeaderSummary | null {
  if (bytes.byteLength < DRAWLIST_HEADER_SIZE) return null;
  const dv = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const u32 = (offset: number) => dv.getUint32(offset, true);
  return {
    magic: u32(0),
    version: u32(4),
    headerSize: u32(8),
    totalSize: u32(12),
    cmdOffset: u32(16),
    cmdBytes: u32(20),
    cmdCount: u32(24),
    stringsSpanOffset: u32(28),
    stringsCount: u32(32),
    stringsBytesOffset: u32(36),
    stringsBytesLen: u32(40),
    blobsSpanOffset: u32(44),
    blobsCount: u32(48),
    blobsBytesOffset: u32(52),
    blobsBytesLen: u32(56),
    reserved0: u32(60),
  };
}

function summarizeDebugPayload(payload: unknown): unknown {
  if (!payload || typeof payload !== "object") return payload;
  const value = payload as Readonly<Record<string, unknown>>;
  if (value["kind"] === "drawlistBytes") {
    const bytes = value["bytes"];
    if (bytes instanceof Uint8Array) {
      return {
        kind: "drawlistBytes",
        byteLength: bytes.byteLength,
        header: summarizeDrawlistHeader(bytes),
      };
    }
  }
  if (
    typeof value["validationResult"] === "number" &&
    typeof value["executionResult"] === "number"
  ) {
    return {
      ...value,
      validationResultSigned: toSignedI32(value["validationResult"]),
      executionResultSigned: toSignedI32(value["executionResult"]),
    };
  }
  return value;
}

function probeDrawlistHeader(): DrawlistHeaderSummary | null {
  const builder = createDrawlistBuilder({});
  builder.clear();
  builder.drawText(0, 0, "probe");
  const built = builder.build();
  if (!built.ok) return null;
  return summarizeDrawlistHeader(built.bytes);
}

function debugLog(step: string, detail?: unknown): void {
  try {
    const payload =
      detail === undefined
        ? ""
        : ` ${typeof detail === "string" ? detail : serializeDetail(detail)}`;
    appendFileSync(DEBUG_LOG_PATH, `${new Date().toISOString()} ${step}${payload}\n`);
  } catch {
    // best-effort diagnostics only
  }
}

debugLog("boot", {
  pid: process.pid,
  cwd: process.cwd(),
  term: process.env["TERM"] ?? null,
  stdoutTTY: process.stdout.isTTY === true,
  stdinTTY: process.stdin.isTTY === true,
  stdoutCols: process.stdout.columns ?? null,
  stdoutRows: process.stdout.rows ?? null,
  argv: process.argv.slice(2),
});

let terminating = false;
function terminateProcessNow(exitCode: number): void {
  if (terminating) return;
  terminating = true;
  process.exitCode = exitCode;
  exit(exitCode);
}

process.on("uncaughtException", (error) => {
  debugLog("uncaughtException", error);
  stderrLog(`Regression dashboard uncaught exception: ${describeError(error)}`);
  terminateProcessNow(1);
});
process.on("unhandledRejection", (reason) => {
  debugLog("unhandledRejection", reason);
  stderrLog(`Regression dashboard unhandled rejection: ${describeError(reason)}`);
  terminateProcessNow(1);
});
process.on("beforeExit", (code) => {
  debugLog("beforeExit", { code });
});
process.on("exit", (code) => {
  debugLog("exit", { code });
});
process.on("SIGTERM", () => {
  debugLog("signal", "SIGTERM");
  terminateProcessNow(143);
});
process.on("SIGINT", () => {
  debugLog("signal", "SIGINT");
  terminateProcessNow(130);
});

if (forceHeadless || !hasInteractiveTty) {
  debugLog("mode.headless", { forceHeadless, hasInteractiveTty });
  const { createTestRenderer } = await import("@rezi-ui/core/testing");
  const renderer = createTestRenderer({ viewport: { cols: 120, rows: 34 } });
  const tree = renderOverviewScreen(initialState, {
    onTogglePause: () => {},
    onCycleFilter: () => {},
    onCycleTheme: () => {},
    onToggleHelp: () => {},
    onSelectService: () => {},
  });
  process.stdout.write(`${renderer.render(tree).toText()}\n`);
  if (!forceHeadless) {
    process.stderr.write(
      "Regression dashboard: interactive mode needs a real TTY. Run this in a terminal, or use --headless.\n",
    );
  }
  debugLog("mode.headless.exit");
  exit(0);
}

const ttyCols =
  typeof process.stdout.columns === "number" && Number.isInteger(process.stdout.columns)
    ? process.stdout.columns
    : 0;
const ttyRows =
  typeof process.stdout.rows === "number" && Number.isInteger(process.stdout.rows)
    ? process.stdout.rows
    : 0;
if (ttyCols <= 0 || ttyRows <= 0) {
  const message =
    `Regression dashboard: terminal reports invalid size cols=${String(ttyCols)} rows=${String(ttyRows)}.` +
    " Run `stty rows 24 cols 80` and retry, or run with --headless.";
  stderrLog(message);
  debugLog("mode.invalid-tty-size", { ttyCols, ttyRows });
  exit(1);
}

debugLog("app.create.begin");
const app = createNodeApp({
  config: {
    fpsCap: UI_FPS_CAP,
    emojiWidthPolicy: "auto",
    executionMode: "inline",
  },
  initialState,
  theme: themeSpec(initialState.themeName).theme,
  ...(enableHsr
    ? {
        hotReload: {
          viewModule: new URL("./screens/overview.ts", import.meta.url),
          moduleRoot: new URL("./", import.meta.url),
          resolveView: (moduleNs: unknown) => {
            const render = (moduleNs as OverviewModule).renderOverviewScreen;
            if (typeof render !== "function") {
              throw new Error(
                "HSR: ./screens/overview.ts must export renderOverviewScreen(state, actions)",
              );
            }
            return buildOverviewView(render);
          },
        },
      }
    : {}),
});
debugLog("app.create.ok");
let protocolMismatchReported = false;
const drawlistHeaderProbe = probeDrawlistHeader();
debugLog("drawlist.probe.header", drawlistHeaderProbe);

function buildOverviewView(renderer: OverviewRenderer) {
  return (state: DashboardState) =>
    renderer(state, {
      onTogglePause: () => dispatch({ type: "toggle-pause" }),
      onCycleFilter: () => dispatch({ type: "cycle-filter" }),
      onCycleTheme: () => dispatch({ type: "cycle-theme" }),
      onToggleHelp: () => dispatch({ type: "toggle-help" }),
      onSelectService: (serviceId) => dispatch({ type: "set-selected-id", serviceId }),
    });
}

function dispatch(action: DashboardAction): void {
  let nextThemeName = initialState.themeName;
  let themeChanged = false;

  app.update((previous) => {
    const next = reduceDashboardState(previous, action);
    if (next.themeName !== previous.themeName) {
      nextThemeName = next.themeName;
      themeChanged = true;
    }
    return next;
  });

  if (themeChanged) {
    app.setTheme(themeSpec(nextThemeName).theme);
  }
}

let stopping = false;
let telemetryTimer: ReturnType<typeof setInterval> | null = null;
let fatalStopScheduled = false;

async function stopApp(exitCode = 0): Promise<void> {
  if (stopping) return;
  stopping = true;

  if (telemetryTimer) {
    clearInterval(telemetryTimer);
    telemetryTimer = null;
  }

  try {
    await app.stop();
  } catch {
    // Ignore shutdown races.
  }

  app.dispose();
  exit(exitCode);
}

function applyCommand(command: ReturnType<typeof resolveDashboardCommand>): void {
  if (!command) return;

  if (command === "quit") {
    void stopApp();
    return;
  }

  if (command === "move-up") {
    dispatch({ type: "move-selection", delta: -1 });
    return;
  }

  if (command === "move-down") {
    dispatch({ type: "move-selection", delta: 1 });
    return;
  }

  if (command === "toggle-help") {
    dispatch({ type: "toggle-help" });
    return;
  }

  if (command === "toggle-pause") {
    dispatch({ type: "toggle-pause" });
    return;
  }

  if (command === "cycle-filter") {
    dispatch({ type: "cycle-filter" });
    return;
  }

  if (command === "cycle-theme") {
    dispatch({ type: "cycle-theme" });
  }
}

app.view(buildOverviewView(renderOverviewScreen));
debugLog("app.view.set");

app.keys({
  q: () => applyCommand(resolveDashboardCommand("q")),
  "ctrl+c": () => applyCommand(resolveDashboardCommand("ctrl+c")),
  up: () => applyCommand(resolveDashboardCommand("up")),
  down: () => applyCommand(resolveDashboardCommand("down")),
  j: () => applyCommand(resolveDashboardCommand("j")),
  k: () => applyCommand(resolveDashboardCommand("k")),
  h: () => applyCommand(resolveDashboardCommand("h")),
  "shift+/": () => applyCommand(resolveDashboardCommand("shift+/")),
  f: () => applyCommand(resolveDashboardCommand("f")),
  t: () => applyCommand(resolveDashboardCommand("t")),
  p: () => applyCommand(resolveDashboardCommand("p")),
  space: () => applyCommand(resolveDashboardCommand("space")),
  escape: () => {
    app.update((state) => (state.showHelp ? { ...state, showHelp: false } : state));
  },
  enter: () => {
    app.update((state) => {
      const selected = selectedService(state);
      if (!selected) return state;
      return { ...state, selectedId: selected.id };
    });
  },
});
debugLog("app.keys.set");

async function dumpBackendDebug(reason: string): Promise<void> {
  if (!ENABLE_BACKEND_DEBUG) return;
  try {
    const queried = await app.backend.debug.debugQuery({ maxRecords: DEBUG_QUERY_MAX_RECORDS });
    debugLog("backend.debug.query", {
      reason,
      result: queried.result,
      headersByteLength: queried.headers.byteLength,
    });

    let lastDrawlistHeader: DrawlistHeaderSummary | null = null;
    for (let offset = 0; offset + DEBUG_HEADER_SIZE <= queried.headers.byteLength; offset += DEBUG_HEADER_SIZE) {
      const headerParsed = parseRecordHeader(queried.headers, offset);
      if (!headerParsed.ok) {
        debugLog("backend.debug.header.parse.error", { reason, offset, error: headerParsed.error });
        continue;
      }

      const header = headerParsed.value;
      const payloadBytes =
        header.payloadSize > 0
          ? ((await app.backend.debug.debugGetPayload(header.recordId)) ?? new Uint8Array(0))
          : new Uint8Array(0);
      const payloadParsed = parsePayload(header.category, payloadBytes);
      if (!payloadParsed.ok) {
        debugLog("backend.debug.payload.parse.error", {
          reason,
          header,
          error: payloadParsed.error,
        });
        continue;
      }

      const payloadSummary = summarizeDebugPayload(payloadParsed.value);
      debugLog("backend.debug.record", { reason, header, payload: payloadSummary });

      if (payloadSummary && typeof payloadSummary === "object") {
        const record = payloadSummary as Readonly<Record<string, unknown>>;
        if (record["kind"] === "drawlistBytes") {
          const headerSummary = record["header"];
          if (headerSummary && typeof headerSummary === "object") {
            lastDrawlistHeader = headerSummary as DrawlistHeaderSummary;
          }
        } else if (
          !protocolMismatchReported &&
          typeof record["validationResultSigned"] === "number" &&
          record["validationResultSigned"] === -5 &&
          lastDrawlistHeader !== null &&
          (lastDrawlistHeader.stringsCount !== 0 || lastDrawlistHeader.blobsCount !== 0)
        ) {
          protocolMismatchReported = true;
          const message =
            "Regression dashboard: native drawlist validation failed with ZR_ERR_FORMAT. " +
            `Captured header uses strings/blobs sections (stringsCount=${String(lastDrawlistHeader.stringsCount)}, blobsCount=${String(lastDrawlistHeader.blobsCount)}), ` +
            "but the current native expects these header fields to be zero in drawlist v1. " +
            "This indicates @rezi-ui/core and @rezi-ui/native drawlist wire formats are out of sync.";
          stderrLog(message);
          debugLog("diagnostic.drawlist-wire-mismatch", {
            reason,
            validationResultSigned: record["validationResultSigned"],
            header: lastDrawlistHeader,
          });
        }
      }
    }
  } catch (error) {
    debugLog("backend.debug.query.error", { reason, error: describeError(error) });
  }
}

if (ENABLE_BACKEND_DEBUG) {
  try {
    debugLog("backend.debug.enable.begin");
    await app.backend.debug.debugEnable({
      enabled: true,
      ringCapacity: 2048,
      minSeverity: "trace",
      captureDrawlistBytes: true,
    });
    debugLog("backend.debug.enable.ok");
  } catch (error) {
    debugLog("backend.debug.enable.error", error);
    stderrLog(`Regression dashboard: failed to enable backend debug trace: ${describeError(error)}`);
  }
}

app.onEvent((event) => {
  if (event.kind === "fatal") {
    debugLog("event.fatal", event);
    stderrLog(`Regression dashboard fatal: ${event.code}: ${event.detail}`);
    process.exitCode = 1;
    if (
      !protocolMismatchReported &&
      event.detail.includes("engine_submit_drawlist failed: code=-5") &&
      drawlistHeaderProbe !== null &&
      (drawlistHeaderProbe.stringsCount !== 0 || drawlistHeaderProbe.blobsCount !== 0)
    ) {
      protocolMismatchReported = true;
      const message =
        "Regression dashboard: detected drawlist wire-format mismatch. " +
        `Builder probe emits non-zero header string/blob sections (stringsCount=${String(drawlistHeaderProbe.stringsCount)}, blobsCount=${String(drawlistHeaderProbe.blobsCount)}), ` +
        "while native submit is failing with ZR_ERR_FORMAT (-5). " +
        "This indicates @rezi-ui/core and @rezi-ui/native are out of sync.";
      stderrLog(message);
      debugLog("diagnostic.drawlist-wire-mismatch", { event, drawlistHeaderProbe });
    }
    if (telemetryTimer) {
      clearInterval(telemetryTimer);
      telemetryTimer = null;
    }
    if (!fatalStopScheduled) {
      fatalStopScheduled = true;
      void (async () => {
        await dumpBackendDebug("fatal-event");
        await stopApp(1);
      })();
    }
  }
});

telemetryTimer = setInterval(() => {
  dispatch({ type: "tick", nowMs: Date.now() });
}, TICK_MS);
debugLog("timer.started", { tickMs: TICK_MS });

try {
  debugLog("app.start.begin");
  await app.start();
  debugLog("app.start.ok");
} catch (error) {
  debugLog("app.start.error", error);
  stderrLog(`Regression dashboard startup failed: ${describeError(error)}`);
  process.exitCode = 1;
  await dumpBackendDebug("app-start-error");
  await stopApp(1);
} finally {
  debugLog("app.start.finally");
  if (telemetryTimer) {
    clearInterval(telemetryTimer);
    telemetryTimer = null;
  }
  debugLog("timer.stopped");
}
