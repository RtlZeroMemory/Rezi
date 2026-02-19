import * as fs from "node:fs";
import { devNull, tmpdir } from "node:os";
import * as path from "node:path";
import type { BadgeVariant, RichTextSpan, TextStyle, ThemeDefinition, VNode } from "@rezi-ui/core";
import {
  createApp,
  darkTheme,
  dimmedTheme,
  draculaTheme,
  highContrastTheme,
  lightTheme,
  nordTheme,
  rgb,
  ui,
} from "@rezi-ui/core";
import { createNodeBackend } from "@rezi-ui/node";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type Phase = 1 | 2 | 3 | 4 | 5;
type ThemeName = "nord" | "dracula" | "dimmed" | "dark" | "light" | "high-contrast";

type Event = {
  id: number;
  at: string;
  severity: "info" | "warn" | "critical";
  message: string;
};

type ThemeSpec = {
  label: string;
  theme: ThemeDefinition;
  badge: BadgeVariant;
};

type PhaseSpec = {
  name: string;
  hz: number;
  durationMs: number;
  intensity: number;
  cpuBurnIters: number;
  ioBlocks: number;
  ballastMb: number;
};

type LaneSize = {
  width: number;
  height: number;
};

type SimModel = {
  drawOpsPerTick: number;
  colorChurnPct: number;
  textChurnPct: number;
  motionPct: number;
};

type State = {
  phase: Phase;
  phaseStartedAt: number;
  phaseElapsedMs: number;
  ticks: number;
  paused: boolean;
  helpOpen: boolean;
  turbo: boolean;
  writeFlood: boolean;
  themeName: ThemeName;
  startedAt: number;
  nowMs: number;
  totalUpdates: number;
  nextEventId: number;
  events: readonly Event[];
  rssGoalNotified: boolean;
  liveUpdateHz: number;
  lastUpdateMs: number;
  lastRenderMs: number;
  lastEventLoopLagMs: number;
  layoutRectCount: number;
  backendEventPollP95Ms: number;
  simDrawOpsPerTick: number;
  simColorChurnPct: number;
  simTextChurnPct: number;
  simMotionPct: number;
  lastRealCpuBurnMs: number;
  lastRealIoWriteMBs: number;
  lastRealBallastMB: number;
  rssBytes: number;
  heapUsedBytes: number;
  processCpuPct: number;
  throughputHistory: readonly number[];
  processCpuHistory: readonly number[];
  rssHistory: readonly number[];
  lagHistory: readonly number[];
  drawHistory: readonly number[];
  ioHistory: readonly number[];
  updateTimeHistory: readonly number[];
  renderTimeHistory: readonly number[];
};

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const PRODUCT_NAME = "__APP_NAME__";
const APP_NAME_PLACEHOLDER = "__APP" + "_NAME__";
const PRODUCT_DISPLAY_NAME =
  PRODUCT_NAME === APP_NAME_PLACEHOLDER ? "Rezi Visual Benchmark" : PRODUCT_NAME;

const UI_FPS_CAP = 30;
const SPARKLINE_HISTORY_SIZE = 24;
const MAX_EVENTS = 12;
const MEMORY_SAMPLE_INTERVAL = 2;
const BACKEND_PERF_SAMPLE_INTERVAL_MS = 2_000;
const PANEL_PX = 1;
const PANEL_PY = 0;
const CADENCE_PULSE_FRAMES = Object.freeze([
  "▁",
  "▂",
  "▃",
  "▄",
  "▅",
  "▆",
  "▇",
  "█",
  "▇",
  "▆",
  "▅",
  "▄",
]);

const LANE_MIN_WIDTH = 40;
const LANE_MAX_WIDTH = 92;
const LANE_MIN_HEIGHT = 14;
const LANE_MAX_HEIGHT = 28;
const LAYOUT_RESERVED_ROWS = 24;

const MEMORY_BALLAST_CHUNK_BYTES = 16 * 1024 * 1024;
const MEMORY_BALLAST_STEP_CHUNKS = 2;

const REAL_IO_BLOCK_BYTES = 64 * 1024;
const REAL_IO_BUFFER = Buffer.alloc(REAL_IO_BLOCK_BYTES, 0x5a);

const PHASE_SPECS: readonly PhaseSpec[] = Object.freeze([
  {
    name: "Boot",
    hz: 2,
    durationMs: 10_000,
    intensity: 0.18,
    cpuBurnIters: 20_000,
    ioBlocks: 1,
    ballastMb: 128,
  },
  {
    name: "Build",
    hz: 4,
    durationMs: 12_000,
    intensity: 0.34,
    cpuBurnIters: 48_000,
    ioBlocks: 2,
    ballastMb: 256,
  },
  {
    name: "Load",
    hz: 8,
    durationMs: 16_000,
    intensity: 0.56,
    cpuBurnIters: 88_000,
    ioBlocks: 4,
    ballastMb: 512,
  },
  {
    name: "Surge",
    hz: 9,
    durationMs: 20_000,
    intensity: 0.78,
    cpuBurnIters: 108_000,
    ioBlocks: 5,
    ballastMb: 896,
  },
  {
    name: "Overdrive",
    hz: 14,
    durationMs: 24_000,
    intensity: 1.0,
    cpuBurnIters: 170_000,
    ioBlocks: 6,
    ballastMb: 1280,
  },
]);

const FILE_ENTRIES = Object.freeze([
  "services/api/router.ts",
  "services/auth/token.ts",
  "services/queue/worker.ts",
  "ui/widgets/chart.ts",
  "ui/widgets/terminal.ts",
  "bench/scenes/matrix.ts",
  "bench/scenes/geometry.ts",
  "bench/scenes/text-lab.ts",
  "runtime/metrics.ts",
  "runtime/render-loop.ts",
  "runtime/layout-engine.ts",
  "runtime/event-loop.ts",
  "storage/cache/index.ts",
  "storage/cache/hotset.ts",
  "storage/blob/writer.ts",
  "storage/blob/compactor.ts",
]);

const COMMAND_LINES = Object.freeze([
  "render --scene geometry --density high",
  "stream --lane text-lab --follow",
  "trace --lane matrix-rain --span 2s",
  "bench --profile overdrive --capture",
  "diff --render-ops --window 5s",
]);

const MATRIX_GLYPHS = Object.freeze("ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789#$%&@*".split(""));
const SHAPE_GLYPHS = Object.freeze([" ", "·", ":", "-", "=", "+", "*", "░", "▒", "▓", "█"]);
const BAR_PARTIALS = Object.freeze(["", "▏", "▎", "▍", "▌", "▋", "▊", "▉"]);

const themeCatalog: Record<ThemeName, ThemeSpec> = {
  nord: { label: "Nord", theme: nordTheme, badge: "info" },
  dracula: { label: "Dracula", theme: draculaTheme, badge: "warning" },
  dimmed: { label: "Dimmed", theme: dimmedTheme, badge: "default" },
  dark: { label: "Dark", theme: darkTheme, badge: "default" },
  light: { label: "Light", theme: lightTheme, badge: "success" },
  "high-contrast": { label: "High Contrast", theme: highContrastTheme, badge: "error" },
};

const themeOrder: readonly ThemeName[] = Object.freeze([
  "nord",
  "dracula",
  "dimmed",
  "dark",
  "light",
  "high-contrast",
]);

type ShortcutSpec = Readonly<{ keys: string | readonly string[]; description: string }>;

const HELP_SHORTCUTS: readonly ShortcutSpec[] = Object.freeze([
  { keys: ["p", "space"], description: "Pause / resume" },
  { keys: ["+", "-"], description: "Phase up / down" },
  { keys: "r", description: "Reset benchmark" },
  { keys: "t", description: "Cycle theme" },
  { keys: "z", description: "Toggle turbo mode" },
  { keys: "w", description: "Toggle write flood" },
  { keys: "h", description: "Open help" },
  { keys: "escape", description: "Close help" },
  { keys: "q", description: "Quit" },
]);

// ---------------------------------------------------------------------------
// Utilities
// ---------------------------------------------------------------------------

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

function round2(value: number): number {
  return Math.round(value * 100) / 100;
}

function smoothFloat(current: number, target: number, gain: number): number {
  return current + (target - current) * gain;
}

function fixedLabel(value: string, maxChars: number, width = maxChars): string {
  const clipped =
    value.length > maxChars
      ? maxChars <= 1
        ? value.slice(0, 1)
        : `${value.slice(0, maxChars - 1)}\u2026`
      : value;
  return clipped.padEnd(width, " ");
}

function signedDelta(value: number, digits = 0): string {
  const rounded = digits === 0 ? Math.round(value).toString() : value.toFixed(digits);
  if (value > 0) return `+${rounded}`;
  if (value < 0) return rounded;
  return digits === 0 ? "0" : Number(value).toFixed(digits);
}

function animationFrame(frames: readonly string[], tick: number): string {
  if (frames.length === 0) return "";
  return frames[Math.abs(tick) % frames.length] ?? "";
}

function shortcutLabel(keys: string | readonly string[]): string {
  const parts = Array.isArray(keys) ? keys : [keys];
  return parts.join(" + ");
}

function timeStamp(date = new Date()): string {
  return date.toLocaleTimeString("en-US", { hour12: false });
}

function pushSeries(
  history: readonly number[],
  value: number,
  maxSize = SPARKLINE_HISTORY_SIZE,
): readonly number[] {
  return Object.freeze([...history, value].slice(-maxSize));
}

function repeatSeries(value: number, size = SPARKLINE_HISTORY_SIZE): readonly number[] {
  return Object.freeze(Array.from({ length: size }, () => value));
}

function phaseSpec(phase: Phase): PhaseSpec {
  const spec = PHASE_SPECS[phase - 1];
  if (spec) return spec;
  return {
    name: "Boot",
    hz: 2,
    durationMs: 10_000,
    intensity: 0.18,
    cpuBurnIters: 20_000,
    ioBlocks: 1,
    ballastMb: 128,
  };
}

function nextThemeName(current: ThemeName): ThemeName {
  const index = themeOrder.indexOf(current);
  const nextIndex = index < 0 ? 0 : (index + 1) % themeOrder.length;
  return themeOrder[nextIndex] ?? themeOrder[0] ?? "nord";
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  return `${(bytes / (1024 * 1024 * 1024)).toFixed(2)} GB`;
}

function hash32(value: number): number {
  let x = value >>> 0;
  x ^= x >>> 16;
  x = Math.imul(x, 0x7feb352d);
  x ^= x >>> 15;
  x = Math.imul(x, 0x846ca68b);
  x ^= x >>> 16;
  return x >>> 0;
}

function noise4(a: number, b: number, c: number, d = 0): number {
  const seed =
    (Math.imul(a + 1, 374761393) ^
      Math.imul(b + 1, 668265263) ^
      Math.imul(c + 1, 362437) ^
      Math.imul(d + 1, 1274126177)) >>>
    0;
  return hash32(seed) / 0xffffffff;
}

function lerpChannel(start: number, end: number, t: number): number {
  return Math.round(start + (end - start) * t);
}

function clampByte(value: number): number {
  return clamp(Math.round(value), 0, 255);
}

function neonColor(t: number, hueShift = 0): ReturnType<typeof rgb> {
  const angle = t * Math.PI * 2 + hueShift;
  const r = 134 + 110 * Math.sin(angle);
  const g = 134 + 110 * Math.sin(angle + 2.09);
  const b = 134 + 110 * Math.sin(angle + 4.18);
  return rgb(clampByte(r), clampByte(g), clampByte(b));
}

function metricDelta(history: readonly number[]): number {
  const last = history[history.length - 1] ?? 0;
  const prev = history[history.length - 2] ?? last;
  return last - prev;
}

function smoothBar(value: number, width: number): string {
  const clamped = clamp(value, 0, 1);
  const exact = clamped * width;
  const full = Math.floor(exact);
  const rem = exact - full;
  const partialIndex = clamp(Math.round(rem * 8), 0, 7);
  const partial = partialIndex > 0 && full < width ? (BAR_PARTIALS[partialIndex] ?? "") : "";
  const consumed = full + (partial ? 1 : 0);
  return `${"█".repeat(full)}${partial}${" ".repeat(Math.max(0, width - consumed))}`;
}

function eventVariant(severity: Event["severity"]): BadgeVariant {
  if (severity === "critical") return "error";
  if (severity === "warn") return "warning";
  return "info";
}

function eventIcon(severity: Event["severity"]): string {
  if (severity === "critical") return "status.cross";
  if (severity === "warn") return "status.warning";
  return "status.info";
}

function phaseBadgeVariant(phase: Phase, current: Phase): BadgeVariant {
  if (phase === current) return "warning";
  if (phase < current) return "success";
  return "default";
}

function pushCell(spans: RichTextSpan[], text: string, style?: TextStyle): void {
  if (style) spans.push({ text, style });
  else spans.push({ text });
}

function statusBadgeVariant(cpuPct: number, lagMs: number): BadgeVariant {
  if (cpuPct >= 90 || lagMs >= 20) return "error";
  if (cpuPct >= 70 || lagMs >= 12) return "warning";
  return "success";
}

function terminalColumns(): number {
  const cols = process.stdout.columns ?? 180;
  return clamp(cols, 100, 420);
}

function terminalRows(): number {
  const rows = process.stdout.rows ?? 48;
  return clamp(rows, 30, 140);
}

function resolveLaneSize(): LaneSize {
  const cols = terminalColumns();
  const rows = terminalRows();

  const width = clamp(Math.floor((cols - 8) / 3), LANE_MIN_WIDTH, LANE_MAX_WIDTH);
  const reservedRows = clamp(
    Math.floor(rows * 0.42),
    LAYOUT_RESERVED_ROWS - 4,
    LAYOUT_RESERVED_ROWS + 10,
  );
  const availableRows = Math.max(LANE_MIN_HEIGHT, rows - reservedRows);
  const height = clamp(availableRows, LANE_MIN_HEIGHT, LANE_MAX_HEIGHT);
  return { width, height };
}

function deriveSimModel(
  tick: number,
  intensity: number,
  lane: LaneSize,
  writeFlood: boolean,
  turbo: boolean,
): SimModel {
  const cells = lane.width * lane.height;
  const geomPulse = 0.5 + 0.5 * Math.sin(tick / 9);
  const textPulse = 0.5 + 0.5 * Math.cos(tick / 7);
  const matrixPulse = 0.5 + 0.5 * Math.sin(tick / 5);

  const geometryDensity = clamp(0.35 + intensity * 0.48 + (geomPulse - 0.5) * 0.14, 0.2, 0.96);
  const textDensity = clamp(0.26 + intensity * 0.34 + (textPulse - 0.5) * 0.12, 0.15, 0.9);
  const matrixDensity = clamp(0.3 + intensity * 0.5 + (matrixPulse - 0.5) * 0.18, 0.2, 0.98);

  const deterministicOps = cells * (geometryDensity + textDensity + matrixDensity);
  const drawOpsPerTick = Math.round(
    deterministicOps * (writeFlood ? 1.14 : 1) * (turbo ? 1.08 : 1),
  );
  const colorChurnPct = round2(
    clamp((geometryDensity * 0.48 + textDensity * 0.15 + matrixDensity * 0.52) * 100, 0, 100),
  );
  const textChurnPct = round2(
    clamp((textDensity * 0.78 + matrixDensity * 0.14 + intensity * 0.08) * 100, 0, 100),
  );
  const motionPct = round2(
    clamp((matrixDensity * 0.74 + geometryDensity * 0.2 + intensity * 0.1) * 100, 0, 100),
  );

  return {
    drawOpsPerTick,
    colorChurnPct,
    textChurnPct,
    motionPct,
  };
}

// ---------------------------------------------------------------------------
// Visual lanes
// ---------------------------------------------------------------------------

function renderGeometryLane(tick: number, intensity: number, lane: LaneSize): readonly VNode[] {
  const rows: VNode[] = [];
  const width = lane.width;
  const height = lane.height;
  const t = tick * 0.045;

  for (let y = 0; y < height; y++) {
    const spans: RichTextSpan[] = [];
    const ny = ((y / Math.max(1, height - 1)) * 2 - 1) * 1.2;
    for (let x = 0; x < width; x++) {
      const nx = ((x / Math.max(1, width - 1)) * 2 - 1) * 1.12;
      const radius = Math.hypot(nx * 1.08, ny * 1.36);
      const angle = Math.atan2(ny, nx);
      const baseRing = 0.32 + 0.11 * Math.sin(t * 0.7 + angle * 1.6);
      const ring = Math.exp(-(((radius - baseRing) * 6.8) ** 2));
      const swirl = 0.5 + 0.5 * Math.sin(radius * 18 - t * 3.2 + Math.cos(angle * 4 + t) * 2.2);
      const ridge = 0.5 + 0.5 * Math.sin(nx * 10.8 - ny * 7.9 + t * 2.1);
      const spark = noise4(x, y, tick, 13);
      const checker =
        ((Math.floor((nx + 1.2) * 6 + t * 0.8) + Math.floor((ny + 1.1) * 4 - t * 0.7)) & 1) === 0
          ? 0.16
          : -0.08;

      let signal = clamp(
        0.22 +
          ring * 0.44 +
          swirl * 0.31 +
          ridge * 0.24 +
          checker +
          spark * 0.16 +
          intensity * 0.15,
        0,
        1,
      );
      const gridX = Math.max(4, Math.round(13 - intensity * 6));
      const gridY = Math.max(3, Math.round(9 - intensity * 4));
      if (
        (x + Math.floor(tick * 0.7)) % gridX === 0 ||
        (y + Math.floor(tick * 0.5)) % gridY === 0
      ) {
        signal = Math.max(signal, 0.66 + 0.24 * spark);
      }

      let glyph = SHAPE_GLYPHS[Math.round(signal * (SHAPE_GLYPHS.length - 1))] ?? " ";
      if (glyph !== " " && signal > 0.9) glyph = spark > 0.5 ? "◆" : "●";

      const color = neonColor(0.12 + signal * 0.92 + spark * 0.14, 0.35 + angle * 0.12);
      if (glyph === " ") {
        pushCell(spans, glyph);
      } else if (signal > 0.95) {
        const bg = rgb(
          lerpChannel(16, 72, signal),
          lerpChannel(12, 38, signal),
          lerpChannel(26, 78, signal),
        );
        pushCell(spans, glyph, { fg: color, bg, bold: signal > 0.98 });
      } else {
        pushCell(spans, glyph, { fg: color });
      }
    }
    rows.push(ui.richText(spans));
  }

  return rows;
}

function renderTextLabLane(tick: number, intensity: number, lane: LaneSize): readonly VNode[] {
  const rows: VNode[] = [];
  const width = lane.width;
  const height = lane.height;
  const fileNameWidth = clamp(Math.floor(width * 0.48), 16, 54);
  const barWidth = clamp(Math.floor(width * 0.24), 10, 24);
  const cmd = COMMAND_LINES[Math.floor(tick / 14) % COMMAND_LINES.length] ?? "run benchmark";
  const typePos = tick % (cmd.length + Math.max(10, Math.floor(width * 0.35)));
  const typed = typePos <= cmd.length ? cmd.slice(0, typePos) : cmd;
  const cursor = tick % 2 === 0 ? "▌" : " ";

  rows.push(
    ui.richText([
      { text: "$ ", style: { fg: rgb(120, 210, 255), bold: true } },
      { text: typed, style: { fg: rgb(195, 225, 255) } },
      { text: cursor, style: { fg: rgb(255, 216, 98), bold: true } },
    ]),
  );

  const readRate = Math.round(44 + intensity * 235 + 18 * Math.sin(tick / 8));
  const writeRate = Math.round(16 + intensity * 176 + 22 * Math.cos(tick / 10));
  const parseRate = Math.round(18 + intensity * 84 + 12 * Math.sin(tick / 11 + 0.6));
  rows.push(
    ui.richText([
      {
        text: `sim read ${readRate.toString().padStart(4, " ")} MB/s`,
        style: { fg: rgb(150, 220, 255) },
      },
      { text: "  |  " },
      {
        text: `sim write ${writeRate.toString().padStart(4, " ")} MB/s`,
        style: { fg: rgb(255, 188, 110) },
      },
      { text: "  |  " },
      {
        text: `parse ${parseRate.toString().padStart(3, " ")} op/s`,
        style: { fg: rgb(165, 206, 255) },
      },
    ]),
  );

  const queueDepth = clamp(0.22 + intensity * 0.68 + 0.12 * Math.sin(tick / 7), 0, 1);
  rows.push(
    ui.richText([
      { text: "queue ", style: { fg: rgb(148, 178, 212) } },
      {
        text: smoothBar(queueDepth, clamp(Math.floor(width * 0.25), 10, 24)),
        style: { fg: rgb(98, 168, 230) },
      },
      {
        text: ` ${(queueDepth * 100).toFixed(0).padStart(3, " ")}%`,
        style: { fg: rgb(120, 196, 255) },
      },
    ]),
  );

  const rowsForFiles = Math.max(3, height - 5);
  for (let i = 0; i < rowsForFiles; i++) {
    const idx = (i + Math.floor(tick / 2)) % FILE_ENTRIES.length;
    const name = FILE_ENTRIES[idx] ?? "runtime/task.ts";
    const pulse = 0.5 + 0.5 * Math.sin((tick + i * 2.7) / 6.5);
    const load = clamp(noise4(i, tick, idx, 71) * 0.62 + pulse * 0.28 + intensity * 0.18, 0, 1);
    const op = load > 0.82 ? "WRITE" : load > 0.62 ? "READ " : load > 0.38 ? "PARSE" : "IDLE ";
    const opStyle: TextStyle =
      op === "WRITE"
        ? { fg: rgb(255, 132, 132), bold: true }
        : op === "READ "
          ? { fg: rgb(255, 214, 120), bold: true }
          : op === "PARSE"
            ? { fg: rgb(130, 215, 255) }
            : { fg: rgb(134, 152, 174), dim: true };
    const pct = Math.round(load * 100);
    const bar = smoothBar(load, barWidth);
    const heatGlyph = SHAPE_GLYPHS[Math.round(load * (SHAPE_GLYPHS.length - 1))] ?? ".";
    rows.push(
      ui.richText([
        { text: fixedLabel(name, fileNameWidth, fileNameWidth), style: { fg: rgb(192, 204, 224) } },
        { text: " " },
        { text: op, style: opStyle },
        { text: " " },
        {
          text: fixedLabel(`${pct.toString().padStart(3, " ")}%`, 4, 4),
          style: { fg: rgb(110, 196, 255) },
        },
        { text: " " },
        { text: bar, style: { fg: rgb(98, 170, 225) } },
        { text: " " },
        { text: `${heatGlyph}${heatGlyph}`, style: { fg: rgb(168, 216, 255), dim: load < 0.42 } },
      ]),
    );
  }

  return rows.slice(0, height);
}

function renderMatrixLane(tick: number, intensity: number, lane: LaneSize): readonly VNode[] {
  const rows: VNode[] = [];
  const width = lane.width;
  const height = lane.height;
  const tailLen = Math.max(4, Math.round(6 + intensity * 9));

  for (let y = 0; y < height; y++) {
    const spans: RichTextSpan[] = [];
    for (let x = 0; x < width; x++) {
      const columnSeed = noise4(x, 0, 0, 17);
      const speed = 0.45 + columnSeed * 1.25 + intensity * 0.65;
      const phaseOffset = Math.floor(columnSeed * 17) + ((x * 9) % (height + 14));
      const head = (tick * speed + phaseOffset) % (height + 14);
      const distance = head - y;
      let glyph = " ";
      let style: TextStyle | undefined;

      if (distance >= 0 && distance < tailLen) {
        const g =
          MATRIX_GLYPHS[
            (x * 13 + y * 7 + tick + Math.floor(columnSeed * 23)) % MATRIX_GLYPHS.length
          ] ?? "#";
        glyph = g;
        if (distance < 1.1) {
          style = { fg: rgb(232, 255, 236), bold: true };
        } else if (distance < 3.8) {
          style = { fg: rgb(166, 255, 174), bold: intensity > 0.85 };
        } else {
          const fade = 1 - distance / tailLen;
          const green = lerpChannel(74, 210, fade);
          const blue = lerpChannel(20, 110, fade * 0.65 + columnSeed * 0.35);
          style = { fg: rgb(24, green, blue), dim: fade < 0.25 };
        }
      } else {
        const spark = noise4(x, y, tick, 109);
        if (spark > 0.994 - intensity * 0.03) {
          glyph = spark > 0.994 ? "*" : ".";
          style = { fg: rgb(42, 96, 58), dim: true };
        }
      }

      pushCell(spans, glyph, style);
    }
    rows.push(ui.richText(spans));
  }

  return rows;
}

// ---------------------------------------------------------------------------
// Real stress engines
// ---------------------------------------------------------------------------

let _lastUpdateDurationMs = 0;
let _lastCpuUsage = process.cpuUsage();
let _lastCpuSampleAtMs = Date.now();
let _lastRenderMs = 0;
let _lastLayoutRectCount = 0;
let _lastBackendEventPollP95Ms = 0;
let _lastViewMs = 0;

let _backendPerfInFlight = false;
let _lastBackendPerfSampleMs = 0;
let _backend: ReturnType<typeof createNodeBackend> | null = null;

let _memoryBallast: Buffer[] = [];
let _memoryBallastBytes = 0;
let _cpuBurnAccumulator = 0x13572468;

let _realIoFd: number | null = null;
let _realIoSinkLabel = "unavailable";
let _realIoSinkIsNullDevice = false;

function closeRealIoSink(): void {
  if (_realIoFd === null) return;
  try {
    fs.closeSync(_realIoFd);
  } catch {
    // ignore cleanup error
  }
  _realIoFd = null;
  _realIoSinkLabel = "unavailable";
  _realIoSinkIsNullDevice = false;
}

function openRealIoSink(): void {
  closeRealIoSink();
  const fallbackNull = process.platform === "win32" ? "NUL" : "/dev/null";
  const fileCandidates = [
    path.join(tmpdir(), "rezi-visual-benchmark-sink.bin"),
    path.join(process.cwd(), ".rezi-visual-benchmark-sink.bin"),
  ];
  const candidates = [
    { target: devNull, nullDevice: true },
    { target: fallbackNull, nullDevice: true },
    ...fileCandidates.map((target) => ({ target, nullDevice: false })),
  ];

  for (const candidate of candidates) {
    try {
      _realIoFd = fs.openSync(candidate.target, "w");
      _realIoSinkLabel = candidate.target;
      _realIoSinkIsNullDevice = candidate.nullDevice;
      return;
    } catch {
      // try next candidate
    }
  }

  _realIoFd = null;
  _realIoSinkLabel = "unavailable";
  _realIoSinkIsNullDevice = false;
}

openRealIoSink();

function clearMemoryBallast(): void {
  _memoryBallast = [];
  _memoryBallastBytes = 0;
}

function adjustMemoryBallast(targetBytes: number): number {
  const cappedTarget = Math.max(0, targetBytes);
  const stepBytes = MEMORY_BALLAST_CHUNK_BYTES * MEMORY_BALLAST_STEP_CHUNKS;

  if (_memoryBallastBytes < cappedTarget) {
    let toAdd = Math.min(cappedTarget - _memoryBallastBytes, stepBytes);
    while (toAdd > 0) {
      const chunkBytes = Math.min(MEMORY_BALLAST_CHUNK_BYTES, toAdd);
      const chunk = Buffer.alloc(chunkBytes, (_memoryBallast.length * 17) & 0xff);
      _memoryBallast.push(chunk);
      _memoryBallastBytes += chunkBytes;
      toAdd -= chunkBytes;
    }
  } else if (_memoryBallastBytes > cappedTarget) {
    let toRemove = Math.min(_memoryBallastBytes - cappedTarget, stepBytes);
    while (toRemove > 0 && _memoryBallast.length > 0) {
      const chunk = _memoryBallast.pop();
      if (!chunk) break;
      _memoryBallastBytes -= chunk.length;
      toRemove -= chunk.length;
    }
  }

  return _memoryBallastBytes;
}

function runRealCpuBurn(iterations: number, tick: number): number {
  const count = Math.max(0, Math.floor(iterations));
  const start = performance.now();
  let acc = _cpuBurnAccumulator | 0;
  for (let i = 0; i < count; i++) {
    acc = Math.imul(acc ^ (tick + i), 1664525) + 1013904223;
    acc ^= acc >>> 16;
  }
  _cpuBurnAccumulator = acc;
  return round2(performance.now() - start);
}

function runRealIoWrite(blocks: number): number {
  if (_realIoFd === null) openRealIoSink();
  if (_realIoFd === null) return 0;

  const blockCount = Math.max(0, Math.floor(blocks));
  const position = _realIoSinkIsNullDevice ? null : 0;
  let written = 0;

  for (let i = 0; i < blockCount; i++) {
    if (_realIoFd === null) break;
    try {
      written += fs.writeSync(_realIoFd, REAL_IO_BUFFER, 0, REAL_IO_BUFFER.length, position);
    } catch {
      closeRealIoSink();
      break;
    }
  }

  return written;
}

// ---------------------------------------------------------------------------
// Simulation
// ---------------------------------------------------------------------------

let _nextIntervalMs = 1000 / phaseSpec(1).hz;

function simulateTick(state: State, nowMs: number): State {
  if (state.paused) return state;

  const tick = state.ticks + 1;
  const tickDeltaMs = Math.max(1, nowMs - state.nowMs);
  const instantHz = 1000 / tickDeltaMs;
  const liveUpdateHz = round2(
    smoothFloat(state.liveUpdateHz <= 0 ? instantHz : state.liveUpdateHz, instantHz, 0.35),
  );

  const prevSpec = phaseSpec(state.phase);
  const elapsed = nowMs - state.phaseStartedAt;

  let phase = state.phase;
  let phaseStartedAt = state.phaseStartedAt;
  if (elapsed >= prevSpec.durationMs && state.phase < 5) {
    phase = (state.phase + 1) as Phase;
    phaseStartedAt = nowMs;
  }

  const spec = phaseSpec(phase);
  _nextIntervalMs = 1000 / spec.hz;

  const targetIntervalMs = Math.max(1, _nextIntervalMs);
  const lagMs = round2(clamp(tickDeltaMs - targetIntervalMs, 0, 200));

  const turboMul = state.turbo ? 1.45 : 1;
  const floodMul = state.writeFlood ? 1.8 : 1;
  const intensity = clamp(spec.intensity * turboMul, 0, 1.8);
  const lane = resolveLaneSize();
  const simModel = deriveSimModel(tick, intensity, lane, state.writeFlood, state.turbo);
  const simDrawOpsPerTick = simModel.drawOpsPerTick;
  const simColorChurnPct = simModel.colorChurnPct;
  const simTextChurnPct = simModel.textChurnPct;
  const simMotionPct = simModel.motionPct;

  const burnIters = spec.cpuBurnIters * turboMul * (state.writeFlood ? 1.2 : 1);
  const lastRealCpuBurnMs = runRealCpuBurn(burnIters, tick);

  const ioBlocks = spec.ioBlocks * turboMul * floodMul;
  const ioBytes = runRealIoWrite(ioBlocks);
  const lastRealIoWriteMBs = round2((ioBytes / (1024 * 1024)) * instantHz);

  const ballastTargetMb = spec.ballastMb + (state.turbo ? 256 : 0);
  const ballastBytes = adjustMemoryBallast(ballastTargetMb * 1024 * 1024);
  const lastRealBallastMB = round2(ballastBytes / (1024 * 1024));

  let rssBytes = state.rssBytes;
  let heapUsedBytes = state.heapUsedBytes;
  let processCpuPct = state.processCpuPct;
  if (tick % MEMORY_SAMPLE_INTERVAL === 0) {
    const mem = process.memoryUsage();
    rssBytes = mem.rss;
    heapUsedBytes = mem.heapUsed;

    const usageNow = process.cpuUsage();
    const cpuUsageUs =
      usageNow.user - _lastCpuUsage.user + (usageNow.system - _lastCpuUsage.system);
    const elapsedCpuMs = Math.max(1, nowMs - _lastCpuSampleAtMs);
    processCpuPct = round2(clamp((cpuUsageUs / 1000 / elapsedCpuMs) * 100, 0, 999));
    _lastCpuUsage = usageNow;
    _lastCpuSampleAtMs = nowMs;
  }

  if (
    !_backendPerfInFlight &&
    nowMs - _lastBackendPerfSampleMs >= BACKEND_PERF_SAMPLE_INTERVAL_MS &&
    _backend !== null
  ) {
    _backendPerfInFlight = true;
    _lastBackendPerfSampleMs = nowMs;
    void _backend.perf
      .perfSnapshot()
      .then((snapshot) => {
        const phaseEventPoll = snapshot.phases.event_poll;
        if (phaseEventPoll !== undefined) {
          _lastBackendEventPollP95Ms = round2(phaseEventPoll.p95);
        }
      })
      .catch(() => {})
      .finally(() => {
        _backendPerfInFlight = false;
      });
  }

  let nextEventId = state.nextEventId;
  const generated: Event[] = [];
  const addEvent = (severity: Event["severity"], message: string): void => {
    if (generated.length >= MAX_EVENTS) return;
    generated.push({ id: nextEventId, at: timeStamp(), severity, message });
    nextEventId += 1;
  };

  if (phase !== state.phase) {
    addEvent(
      "info",
      `Phase ${phase} ${spec.name}: ${spec.hz} Hz, intensity ${(spec.intensity * 100).toFixed(0)}%.`,
    );
  }

  if (tick % Math.max(8, Math.round(34 / Math.max(1, spec.hz))) === 0) {
    const severity: Event["severity"] = processCpuPct > 86 || lagMs > 18 ? "warn" : "info";
    addEvent(
      severity,
      `sim-draw ${simDrawOpsPerTick.toLocaleString()}/tick (${lane.width}x${lane.height}x3) · CPU ${processCpuPct.toFixed(1)}% · RSS ${formatBytes(rssBytes)} · lag ${lagMs.toFixed(2)} ms.`,
    );
  }

  if (lagMs > 24) {
    addEvent("critical", `Event-loop lag spike ${lagMs.toFixed(2)} ms.`);
  }

  let rssGoalNotified = state.rssGoalNotified;
  if (!rssGoalNotified && rssBytes >= 1024 * 1024 * 1024) {
    rssGoalNotified = true;
    addEvent("info", `RSS crossed 1 GB (${formatBytes(rssBytes)}).`);
  }

  return {
    ...state,
    phase,
    phaseStartedAt,
    phaseElapsedMs: nowMs - phaseStartedAt,
    ticks: tick,
    nowMs,
    totalUpdates: state.totalUpdates + 1,
    nextEventId,
    events: Object.freeze([...generated, ...state.events].slice(0, MAX_EVENTS)),
    rssGoalNotified,
    liveUpdateHz,
    lastRenderMs: _lastRenderMs,
    lastEventLoopLagMs: lagMs,
    layoutRectCount: _lastLayoutRectCount,
    backendEventPollP95Ms: _lastBackendEventPollP95Ms,
    simDrawOpsPerTick,
    simColorChurnPct,
    simTextChurnPct,
    simMotionPct,
    lastRealCpuBurnMs,
    lastRealIoWriteMBs,
    lastRealBallastMB,
    rssBytes,
    heapUsedBytes,
    processCpuPct,
    throughputHistory: pushSeries(state.throughputHistory, liveUpdateHz),
    processCpuHistory: pushSeries(state.processCpuHistory, processCpuPct),
    rssHistory: pushSeries(state.rssHistory, round2(rssBytes / (1024 * 1024))),
    lagHistory: pushSeries(state.lagHistory, lagMs),
    drawHistory: pushSeries(state.drawHistory, simDrawOpsPerTick),
    ioHistory: pushSeries(state.ioHistory, lastRealIoWriteMBs),
    updateTimeHistory: pushSeries(state.updateTimeHistory, _lastUpdateDurationMs),
    renderTimeHistory: pushSeries(state.renderTimeHistory, _lastRenderMs),
  };
}

// ---------------------------------------------------------------------------
// App setup
// ---------------------------------------------------------------------------

const initialNowMs = Date.now();
const backend = createNodeBackend({
  fpsCap: UI_FPS_CAP,
  executionMode: "worker",
});
_backend = backend;

const app = createApp<State>({
  backend,
  config: {
    fpsCap: UI_FPS_CAP,
    internal_onRender: (metrics) => {
      _lastRenderMs = round2(metrics.renderTime);
    },
    internal_onLayout: (snapshot) => {
      _lastLayoutRectCount = snapshot.idRects.size;
    },
  },
  theme: themeCatalog.nord.theme,
  initialState: {
    phase: 1,
    phaseStartedAt: initialNowMs,
    phaseElapsedMs: 0,
    ticks: 0,
    paused: false,
    helpOpen: false,
    turbo: false,
    writeFlood: false,
    themeName: "nord",
    startedAt: initialNowMs,
    nowMs: initialNowMs,
    totalUpdates: 0,
    nextEventId: 1,
    events: Object.freeze([]),
    rssGoalNotified: false,
    liveUpdateHz: phaseSpec(1).hz,
    lastUpdateMs: 0,
    lastRenderMs: 0,
    lastEventLoopLagMs: 0,
    layoutRectCount: 0,
    backendEventPollP95Ms: 0,
    simDrawOpsPerTick: 0,
    simColorChurnPct: 0,
    simTextChurnPct: 0,
    simMotionPct: 0,
    lastRealCpuBurnMs: 0,
    lastRealIoWriteMBs: 0,
    lastRealBallastMB: 0,
    rssBytes: 0,
    heapUsedBytes: 0,
    processCpuPct: 0,
    throughputHistory: repeatSeries(phaseSpec(1).hz),
    processCpuHistory: repeatSeries(0),
    rssHistory: repeatSeries(0),
    lagHistory: repeatSeries(0),
    drawHistory: repeatSeries(0),
    ioHistory: repeatSeries(0),
    updateTimeHistory: repeatSeries(0),
    renderTimeHistory: repeatSeries(0),
  },
});

// ---------------------------------------------------------------------------
// Actions
// ---------------------------------------------------------------------------

function togglePauseAction(): void {
  app.update((s) => ({ ...s, paused: !s.paused }));
}

function toggleTurboAction(): void {
  app.update((s) => ({ ...s, turbo: !s.turbo }));
}

function toggleWriteFloodAction(): void {
  app.update((s) => ({ ...s, writeFlood: !s.writeFlood }));
}

function cycleThemeAction(): void {
  let nextTheme: ThemeName = "nord";
  app.update((s) => {
    nextTheme = nextThemeName(s.themeName);
    return { ...s, themeName: nextTheme };
  });
  app.setTheme(themeCatalog[nextTheme]?.theme ?? themeCatalog.nord.theme);
}

function openHelpAction(): void {
  app.update((s) => ({ ...s, helpOpen: true }));
}

function closeHelpAction(): void {
  app.update((s) => ({ ...s, helpOpen: false }));
}

function advancePhaseAction(): void {
  app.update((s) => {
    if (s.phase >= 5) return s;
    const next = (s.phase + 1) as Phase;
    _nextIntervalMs = 1000 / phaseSpec(next).hz;
    return { ...s, phase: next, phaseStartedAt: Date.now(), phaseElapsedMs: 0 };
  });
}

function retreatPhaseAction(): void {
  app.update((s) => {
    if (s.phase <= 1) return s;
    const next = (s.phase - 1) as Phase;
    _nextIntervalMs = 1000 / phaseSpec(next).hz;
    return { ...s, phase: next, phaseStartedAt: Date.now(), phaseElapsedMs: 0 };
  });
}

function resetAction(): void {
  const now = Date.now();
  _nextIntervalMs = 1000 / phaseSpec(1).hz;
  _lastCpuUsage = process.cpuUsage();
  _lastCpuSampleAtMs = now;
  _lastRenderMs = 0;
  _lastLayoutRectCount = 0;
  _lastBackendEventPollP95Ms = 0;
  _backendPerfInFlight = false;
  _lastBackendPerfSampleMs = 0;
  clearMemoryBallast();
  if (_realIoFd === null) openRealIoSink();

  app.update((s) => ({
    ...s,
    phase: 1,
    phaseStartedAt: now,
    phaseElapsedMs: 0,
    ticks: 0,
    paused: false,
    turbo: false,
    writeFlood: false,
    startedAt: now,
    nowMs: now,
    totalUpdates: 0,
    nextEventId: 1,
    events: Object.freeze([]),
    rssGoalNotified: false,
    liveUpdateHz: phaseSpec(1).hz,
    lastUpdateMs: 0,
    lastRenderMs: 0,
    lastEventLoopLagMs: 0,
    layoutRectCount: 0,
    backendEventPollP95Ms: 0,
    simDrawOpsPerTick: 0,
    simColorChurnPct: 0,
    simTextChurnPct: 0,
    simMotionPct: 0,
    lastRealCpuBurnMs: 0,
    lastRealIoWriteMBs: 0,
    lastRealBallastMB: 0,
    rssBytes: 0,
    heapUsedBytes: 0,
    processCpuPct: 0,
    throughputHistory: repeatSeries(phaseSpec(1).hz),
    processCpuHistory: repeatSeries(0),
    rssHistory: repeatSeries(0),
    lagHistory: repeatSeries(0),
    drawHistory: repeatSeries(0),
    ioHistory: repeatSeries(0),
    updateTimeHistory: repeatSeries(0),
    renderTimeHistory: repeatSeries(0),
  }));
}

function stopAction(): void {
  stopTelemetryLoop();
  clearMemoryBallast();
  closeRealIoSink();
  void app.stop();
}

// ---------------------------------------------------------------------------
// View
// ---------------------------------------------------------------------------

app.view((state) => {
  const viewStartMs = performance.now();

  const spec = phaseSpec(state.phase);
  const themeSpec = themeCatalog[state.themeName] ?? themeCatalog.nord;
  const palette = themeSpec.theme.colors;

  const rootStyle: TextStyle = { bg: palette.bg.base, fg: palette.fg.primary };
  const panelStyle: TextStyle = { bg: palette.bg.elevated, fg: palette.fg.primary };
  const metaStyle: TextStyle = { fg: palette.fg.secondary, dim: true };
  const quietStyle: TextStyle = { fg: palette.fg.muted, dim: true };
  const accentStyle: TextStyle = { fg: palette.accent.primary, bold: true };

  const phaseProgress = clamp(state.phaseElapsedMs / Math.max(1, spec.durationMs), 0, 1);
  const cadencePulse = animationFrame(CADENCE_PULSE_FRAMES, state.ticks);

  const throughputDelta = metricDelta(state.throughputHistory);
  const cpuDelta = metricDelta(state.processCpuHistory);
  const rssDelta = metricDelta(state.rssHistory);
  const lagDelta = metricDelta(state.lagHistory);
  const ioDelta = metricDelta(state.ioHistory);

  const statusVariant = statusBadgeVariant(state.processCpuPct, state.lastEventLoopLagMs);
  const statusLabel =
    statusVariant === "error" ? "HOT" : statusVariant === "warning" ? "RISING" : "STABLE";

  const intensity = clamp(spec.intensity * (state.turbo ? 1.45 : 1), 0, 1.8);
  const lane = resolveLaneSize();
  const laneCellCount = lane.width * lane.height * 3;
  const drawSparkMax = Math.max(6000, lane.width * lane.height * 5);
  const drawLastPerTick = state.drawHistory[state.drawHistory.length - 1] ?? 0;
  const drawPrevPerTick = state.drawHistory[state.drawHistory.length - 2] ?? drawLastPerTick;
  const hzLast = state.throughputHistory[state.throughputHistory.length - 1] ?? state.liveUpdateHz;
  const hzPrev = state.throughputHistory[state.throughputHistory.length - 2] ?? hzLast;
  const drawOpsPerSec = round2(drawLastPerTick * hzLast);
  const drawDeltaPerSec = drawOpsPerSec - drawPrevPerTick * hzPrev;

  const realIoAvailable = _realIoFd !== null;
  const realIoSinkTypeLabel = !realIoAvailable
    ? "no sink"
    : _realIoSinkIsNullDevice
      ? "null sink"
      : "file sink";
  const realIoSinkLabel = realIoAvailable ? _realIoSinkLabel : "unavailable";

  const rssGoalHit = state.rssBytes >= 1024 * 1024 * 1024;

  const headerStrip = ui.row({ gap: 1, items: "center", wrap: true }, [
    ui.text(PRODUCT_DISPLAY_NAME, { variant: "heading" }),
    ui.text("|", { style: quietStyle }),
    ui.text("DEMO benchmark", { style: metaStyle }),
    ui.text("|", { style: quietStyle }),
    state.paused
      ? ui.text("paused", { style: { fg: palette.warning, bold: true } })
      : ui.richText([
          { text: cadencePulse, style: { fg: palette.accent.primary, bold: true } },
          { text: " streaming", style: accentStyle },
        ]),
    ui.spacer({ flex: 1 }),
    ui.text(`phase ${state.phase}/${PHASE_SPECS.length} ${spec.name}`, { style: accentStyle }),
    ui.text(`· ${spec.hz} Hz`, { style: metaStyle }),
    ui.text(`· ${(intensity * 100).toFixed(0)}%`, { style: metaStyle }),
  ]);

  const phaseStrip = ui.row({ gap: 1, items: "center", wrap: true }, [
    ...([1, 2, 3, 4, 5] as const).map((phase) =>
      ui.badge(
        `${phase === state.phase ? "LIVE " : ""}${phase} ${fixedLabel(phaseSpec(phase).name, 9, 9)}`,
        {
          variant: phaseBadgeVariant(phase, state.phase),
        },
      ),
    ),
    ui.spacer({ flex: 1 }),
    ui.text(`turbo ${state.turbo ? "on" : "off"}`, {
      style: state.turbo ? accentStyle : metaStyle,
    }),
    ui.text(`write-flood ${state.writeFlood ? "on" : "off"}`, {
      style: state.writeFlood ? accentStyle : metaStyle,
    }),
  ]);

  const progressStrip = ui.row({ gap: 1, items: "center" }, [
    ui.text("ramp", { style: metaStyle }),
    ui.progress(state.phase === 5 ? 1 : phaseProgress, {
      variant: "blocks",
      width: 30,
      style: { fg: palette.accent.primary },
    }),
    ui.text(
      state.phase === 5
        ? "final phase"
        : `${Math.round(phaseProgress * 100)}% -> phase ${state.phase + 1}`,
      { style: metaStyle },
    ),
  ]);

  const statusStrip = ui.row({ gap: 1, items: "center", wrap: true }, [
    ui.badge(statusLabel, { variant: statusVariant }),
    ui.text(`CPU(proc) ${state.processCpuPct.toFixed(1)}%`, { style: metaStyle }),
    ui.text(`lag ${state.lastEventLoopLagMs.toFixed(2)} ms`, { style: metaStyle }),
    ui.text(`sim-draw ${Math.round(drawOpsPerSec).toLocaleString()}/s`, { style: metaStyle }),
    ui.text(`RSS ${formatBytes(state.rssBytes)}`, { style: metaStyle }),
    ui.text(`sink ${realIoSinkTypeLabel}`, { style: metaStyle }),
    ui.spacer({ flex: 1 }),
    ui.text("keys: p +/- z w t h q", { style: quietStyle }),
  ]);

  const diagnosticsText = ui.box(
    {
      border: "rounded",
      px: PANEL_PX,
      py: PANEL_PY,
      style: panelStyle,
      title: "DIAGNOSTICS / BENCHMARKS",
    },
    [
      ui.column({ gap: 0 }, [
        ui.row({ gap: 1, items: "center", wrap: true }, [
          ui.badge("SIM", { variant: "warning" }),
          ui.text("deterministic visual model (draw/color/text/motion scorecard)", {
            style: quietStyle,
          }),
          ui.badge("REAL", { variant: "success" }),
          ui.text("process CPU/RSS + update/render timings + sink I/O", { style: quietStyle }),
        ]),
        ui.row({ gap: 1, items: "center", wrap: true }, [
          ui.text(`tick ${state.liveUpdateHz.toFixed(1)} Hz (${signedDelta(throughputDelta, 1)})`, {
            style: metaStyle,
          }),
          ui.text(
            `sim-draw ${Math.round(drawOpsPerSec).toLocaleString()}/s (${signedDelta(drawDeltaPerSec, 0)})`,
            { style: metaStyle },
          ),
          ui.text(`cpu(proc) ${state.processCpuPct.toFixed(1)}% (${signedDelta(cpuDelta, 1)})`, {
            style: metaStyle,
          }),
          ui.text(
            `rss ${(state.rssBytes / (1024 * 1024)).toFixed(0)} MB (${signedDelta(rssDelta, 1)})`,
            { style: metaStyle },
          ),
        ]),
        ui.row({ gap: 1, items: "center", wrap: true }, [
          ui.text(
            `loop-lag ${state.lastEventLoopLagMs.toFixed(2)} ms (${signedDelta(lagDelta, 2)})`,
            { style: metaStyle },
          ),
          ui.text(`io ${state.lastRealIoWriteMBs.toFixed(1)} MB/s (${signedDelta(ioDelta, 1)})`, {
            style: metaStyle,
          }),
          ui.text(`color ${state.simColorChurnPct.toFixed(0)}%`, { style: metaStyle }),
          ui.text(`text ${state.simTextChurnPct.toFixed(0)}%`, { style: metaStyle }),
          ui.text(`motion ${state.simMotionPct.toFixed(0)}%`, { style: metaStyle }),
        ]),
        ui.row({ gap: 1, items: "center", wrap: true }, [
          ui.text("cpu(proc)", { style: quietStyle }),
          ui.sparkline(state.processCpuHistory, { width: 16, min: 0, max: 100 }),
          ui.text("rss", { style: quietStyle }),
          ui.sparkline(state.rssHistory, { width: 16, min: 0, max: 1400 }),
          ui.text("lag", { style: quietStyle }),
          ui.sparkline(state.lagHistory, { width: 16, min: 0, max: 40 }),
          ui.text("sim-draw", { style: quietStyle }),
          ui.sparkline(state.drawHistory, { width: 16, min: 0, max: drawSparkMax }),
        ]),
        ui.row({ gap: 1, items: "center", wrap: true }, [
          ui.text(
            `model deterministic lane ${lane.width}x${lane.height} (cells ${laneCellCount})`,
            { style: quietStyle },
          ),
          ui.text(`update ${state.lastUpdateMs.toFixed(2)} ms`, { style: quietStyle }),
          ui.text(`view ${_lastViewMs.toFixed(2)} ms`, { style: quietStyle }),
          ui.text(`render ${state.lastRenderMs.toFixed(2)} ms`, { style: quietStyle }),
          ui.text(`event_poll p95 ${state.backendEventPollP95Ms.toFixed(2)} ms`, {
            style: quietStyle,
          }),
          ui.text(`sink ${realIoSinkLabel}`, {
            style: quietStyle,
            textOverflow: "ellipsis",
            maxWidth: 44,
          }),
          ui.text(rssGoalHit ? "RSS >= 1GB reached" : "RSS >= 1GB pending", {
            style: rssGoalHit ? { fg: palette.error, bold: true } : quietStyle,
          }),
        ]),
      ]),
    ],
  );

  const demoPanel = ui.box(
    {
      border: "rounded",
      px: PANEL_PX,
      py: PANEL_PY,
      flex: 4,
      style: panelStyle,
      title: "DEMO",
    },
    [
      ui.row({ gap: 1, items: "stretch" }, [
        ui.box(
          {
            border: "rounded",
            px: PANEL_PX,
            py: PANEL_PY,
            flex: 1,
            style: panelStyle,
            title: "Shapes / Geometry Lane",
          },
          [
            ui.column({ gap: 0 }, [
              ui.text("Rectangles, circles, grids, color waves", { style: metaStyle }),
              ...renderGeometryLane(state.ticks, intensity, lane),
            ]),
          ],
        ),
        ui.box(
          {
            border: "rounded",
            px: PANEL_PX,
            py: PANEL_PY,
            flex: 1,
            style: panelStyle,
            title: "Text / File Activity Lane",
          },
          [
            ui.column({ gap: 0 }, [
              ui.text("Typing, file churn, stream-style updates", { style: metaStyle }),
              ...renderTextLabLane(state.ticks, intensity, lane),
            ]),
          ],
        ),
        ui.box(
          {
            border: "rounded",
            px: PANEL_PX,
            py: PANEL_PY,
            flex: 1,
            style: panelStyle,
            title: "Matrix Lane",
          },
          [
            ui.column({ gap: 0 }, [
              ui.text("Matrix-style rain with varying tails", { style: metaStyle }),
              ...renderMatrixLane(state.ticks, intensity, lane),
            ]),
          ],
        ),
      ]),
    ],
  );

  const eventsStrip = ui.box(
    { border: "rounded", px: PANEL_PX, py: PANEL_PY, style: panelStyle, title: "EVENTS" },
    [
      ui.column({ gap: 0 }, [
        ...Array.from({ length: 6 }, (_, i) => {
          const ev = state.events[i];
          if (!ev) return ui.text(" ", { key: `ev-empty-${i}`, style: quietStyle });
          return ui.row({ key: `ev-${ev.id}`, gap: 1, items: "center" }, [
            ui.icon(eventIcon(ev.severity)),
            ui.badge(fixedLabel(ev.severity.toUpperCase(), 8, 8), {
              variant: eventVariant(ev.severity),
            }),
            ui.text(`[${ev.at}] ${ev.message}`, {
              style: metaStyle,
              textOverflow: "ellipsis",
              maxWidth: 108,
            }),
          ]);
        }),
      ]),
    ],
  );

  const footer = ui.row({ gap: 1, items: "center", wrap: true }, [
    ui.text("keys", { style: quietStyle }),
    ui.text("p/space pause", { style: quietStyle }),
    ui.text("·", { style: quietStyle }),
    ui.text("+/- phase", { style: quietStyle }),
    ui.text("·", { style: quietStyle }),
    ui.text("z turbo", { style: quietStyle }),
    ui.text("·", { style: quietStyle }),
    ui.text("w write-flood", { style: quietStyle }),
    ui.text("·", { style: quietStyle }),
    ui.text("t theme", { style: quietStyle }),
    ui.text("·", { style: quietStyle }),
    ui.text("h help", { style: quietStyle }),
    ui.text("·", { style: quietStyle }),
    ui.text("q quit", { style: quietStyle }),
    ui.spacer({ flex: 1 }),
    ui.text(`updates ${state.totalUpdates}`, { style: quietStyle }),
  ]);

  const content = ui.column({ flex: 1, p: 1, gap: 1, items: "stretch", style: rootStyle }, [
    headerStrip,
    phaseStrip,
    progressStrip,
    statusStrip,
    diagnosticsText,
    demoPanel,
    eventsStrip,
    footer,
  ]);

  _lastViewMs = performance.now() - viewStartMs;

  return ui.layers([
    content,
    state.helpOpen
      ? ui.modal({
          id: "help-modal",
          title: `${PRODUCT_DISPLAY_NAME} Controls`,
          width: 66,
          frameStyle: {
            background: palette.bg.elevated,
            foreground: palette.fg.primary,
            border: palette.border.default,
          },
          backdrop: "dim",
          initialFocus: "help-close",
          returnFocusTo: "toggle-pause",
          content: ui.column({ gap: 1 }, [
            ui.text("Keyboard Controls", { style: accentStyle }),
            ui.divider({ char: "·" }),
            ...HELP_SHORTCUTS.map((shortcut, i) =>
              ui.row({ key: `shortcut-${i}`, gap: 1, items: "center" }, [
                ui.kbd(shortcutLabel(shortcut.keys)),
                ui.text(shortcut.description, { style: metaStyle }),
              ]),
            ),
          ]),
          actions: [
            ui.button({ id: "help-close", label: "Close (Esc)", onPress: closeHelpAction }),
          ],
          onClose: closeHelpAction,
        })
      : null,
  ]);
});

// ---------------------------------------------------------------------------
// Telemetry loop
// ---------------------------------------------------------------------------

let telemetryTimer: ReturnType<typeof setTimeout> | null = null;
let telemetryRunning = false;
let telemetryNextAt = 0;

function clearTelemetryTimer(): void {
  if (telemetryTimer === null) return;
  clearTimeout(telemetryTimer);
  telemetryTimer = null;
}

function scheduleTelemetryTick(nowMs = Date.now()): void {
  if (!telemetryRunning) return;
  const intervalMs = _nextIntervalMs;
  if (telemetryNextAt <= 0) telemetryNextAt = nowMs + intervalMs;
  const delayMs = Math.max(0, telemetryNextAt - nowMs);
  telemetryTimer = setTimeout(() => runTelemetryTick(intervalMs), delayMs);
}

function runTelemetryTick(intervalMs: number): void {
  if (!telemetryRunning) return;
  const nowMs = Date.now();
  if (telemetryNextAt <= 0) telemetryNextAt = nowMs;

  const maxDrift = intervalMs * 2;
  if (nowMs - telemetryNextAt > maxDrift) telemetryNextAt = nowMs;
  telemetryNextAt += intervalMs;

  app.update((state) => {
    const updateStart = performance.now();
    const nextState = simulateTick(state, nowMs);
    _lastUpdateDurationMs = round2(performance.now() - updateStart);
    if (nextState === state) return state;
    return {
      ...nextState,
      updateTimeHistory: pushSeries(nextState.updateTimeHistory, _lastUpdateDurationMs),
      lastUpdateMs: _lastUpdateDurationMs,
    };
  });

  scheduleTelemetryTick(nowMs);
}

function startTelemetryLoop(): void {
  if (telemetryRunning) return;
  telemetryRunning = true;
  telemetryNextAt = 0;
  scheduleTelemetryTick();
}

function stopTelemetryLoop(): void {
  telemetryRunning = false;
  telemetryNextAt = 0;
  clearTelemetryTimer();
}

// ---------------------------------------------------------------------------
// Events + keys
// ---------------------------------------------------------------------------

app.onEvent((ev) => {
  if (ev.kind === "engine") {
    const raw = ev.event;
    if (raw.kind === "resize") startTelemetryLoop();
  }
  if (ev.kind === "fatal") stopTelemetryLoop();
});

app.keys({
  q: stopAction,
  "ctrl+c": stopAction,
  p: togglePauseAction,
  space: togglePauseAction,
  "+": advancePhaseAction,
  "=": advancePhaseAction,
  "-": retreatPhaseAction,
  r: resetAction,
  t: cycleThemeAction,
  T: cycleThemeAction,
  "shift+t": cycleThemeAction,
  z: toggleTurboAction,
  w: toggleWriteFloodAction,
  h: openHelpAction,
  escape: closeHelpAction,
});

// ---------------------------------------------------------------------------
// Start
// ---------------------------------------------------------------------------

try {
  await app.start();
} finally {
  stopTelemetryLoop();
  clearMemoryBallast();
  closeRealIoSink();
}
