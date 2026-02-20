#!/usr/bin/env bun

import { writeFileSync } from "node:fs";
import { Writable } from "node:stream";
import { BoxRenderable, TextRenderable, createCliRenderer } from "@opentui/core";
import { createRoot, flushSync } from "@opentui/react";
import { type ReactNode, createElement } from "react";

type CliArgs = Readonly<{
  scenario: string;
  warmup: number;
  iterations: number;
  io: "pty" | "stub";
  driver: "react" | "core";
  resultPath: string | null;
  params: Record<string, number | string>;
}>;

type CpuUsage = Readonly<{ userMs: number; systemMs: number }>;
type MemorySnapshot = Readonly<{ rssKb: number; heapUsedKb: number }>;

type BenchResultData = Readonly<{
  samplesMs: readonly number[];
  totalWallMs: number;
  cpuUserMs: number;
  cpuSysMs: number;
  rssBeforeKb: number;
  rssAfterKb: number;
  rssPeakKb: number;
  heapBeforeKb: number;
  heapAfterKb: number;
  heapPeakKb: number;
  bytesWritten: number;
  frames: number;
}>;

type BenchResultFile =
  | Readonly<{ ok: true; data: BenchResultData }>
  | Readonly<{ ok: false; error: string }>;

class MeasuringStdout extends Writable {
  totalBytes = 0;
  writeCount = 0;
  columns = process.stdout.columns ?? 120;
  rows = process.stdout.rows ?? 40;
  isTTY = true;
  fd = (process.stdout as unknown as { fd?: number }).fd ?? 1;

  override _write(
    chunk: Buffer | string,
    encoding: BufferEncoding,
    callback: (error?: Error | null) => void,
  ): void {
    this.writeCount++;
    this.totalBytes +=
      typeof chunk === "string" ? Buffer.byteLength(chunk, encoding) : chunk.byteLength;

    const done = (err?: Error | null): void => {
      callback(err ?? null);
    };

    try {
      const out = process.stdout as unknown as NodeJS.WriteStream;
      if (typeof chunk === "string") out.write(chunk, encoding, done);
      else out.write(chunk, done);
    } catch (err) {
      done(err instanceof Error ? err : new Error(String(err)));
    }
  }
}

function parseArgs(argv: readonly string[]): CliArgs {
  const params: Record<string, number | string> = {};
  let scenario = "";
  let warmup = 100;
  let iterations = 1000;
  let io: "pty" | "stub" = "pty";
  let driver: "react" | "core" = "react";
  let resultPath: string | null = null;

  for (let i = 2; i < argv.length; i++) {
    const arg = argv[i];
    if (!arg?.startsWith("--")) continue;
    const key = arg.slice(2);
    const rawVal = argv[++i] ?? "";

    switch (key) {
      case "scenario":
        scenario = rawVal;
        break;
      case "warmup":
        warmup = Number.parseInt(rawVal, 10) || 0;
        break;
      case "iterations":
        iterations = Number.parseInt(rawVal, 10) || 1;
        break;
      case "io":
        io = rawVal === "stub" ? "stub" : "pty";
        break;
      case "driver":
        driver = rawVal === "core" ? "core" : "react";
        break;
      case "result-path":
        resultPath = rawVal;
        break;
      default: {
        const asNum = Number(rawVal);
        params[key] = Number.isFinite(asNum) && rawVal.trim() !== "" ? asNum : rawVal;
        break;
      }
    }
  }

  if (!scenario) throw new Error("missing --scenario");
  if (iterations <= 0) throw new Error("--iterations must be > 0");
  if (warmup < 0) throw new Error("--warmup must be >= 0");

  return { scenario, warmup, iterations, io, driver, resultPath, params };
}

function takeCpu(): CpuUsage {
  const c = process.cpuUsage();
  return { userMs: c.user / 1000, systemMs: c.system / 1000 };
}

function diffCpu(before: CpuUsage, after: CpuUsage): CpuUsage {
  return { userMs: after.userMs - before.userMs, systemMs: after.systemMs - before.systemMs };
}

function takeMemory(): MemorySnapshot {
  const m = process.memoryUsage();
  return {
    rssKb: Math.round(m.rss / 1024),
    heapUsedKb: Math.round(m.heapUsed / 1024),
  };
}

function peakMemory(a: MemorySnapshot, b: MemorySnapshot): MemorySnapshot {
  return {
    rssKb: Math.max(a.rssKb, b.rssKb),
    heapUsedKb: Math.max(a.heapUsedKb, b.heapUsedKb),
  };
}

function tryGc(): void {
  if (typeof globalThis.gc === "function") globalThis.gc();
}

function padTo(s: string, width: number): string {
  if (s.length >= width) return s.slice(0, width);
  return s + " ".repeat(width - s.length);
}

function clipPad(s: string, cols: number): string {
  if (s.length >= cols) return s.slice(0, cols);
  return `${s}${" ".repeat(cols - s.length)}`;
}

function bar(value: number, width: number): string {
  const filled = Math.max(0, Math.min(width, Math.round(value * width)));
  return `${"#".repeat(filled)}${"-".repeat(width - filled)}`;
}

function safeMod(value: number, denom: number): number {
  if (denom <= 0) return 0;
  return value % denom;
}

function numberParam(value: number | string | undefined, fallback: number): number {
  return Number(value ?? fallback);
}

const STARTUP_TREE_SIZE = 50;
const CONTENT_UPDATE_LIST_SIZE = 500;

function makeLineContent(row: number, tick: number, cols: number): string {
  const v = (tick * 1103515245 + row * 12345) >>> 0;
  return padTo(`row=${row.toString().padStart(2, "0")} tick=${tick} v=${v.toString(16)}`, cols);
}

function makeStaticLine(row: number, cols: number): string {
  return padTo(`row=${row.toString().padStart(2, "0")} static`, cols);
}

function cellValue(row: number, col: number, tick: number, hotRow: number, hotCol: number): string {
  if (row === hotRow && col === hotCol) return `v=${tick}`;
  return `r${row}c${col}`;
}

function tableLines(rows: number, cols: number, tick: number): string[] {
  const hotRow = tick % rows;
  const hotCol = tick % cols;
  const lines: string[] = [];
  const header = Array.from({ length: cols }, (_, c) => `C${c}`.padEnd(10, " ")).join("");
  lines.push(header);
  lines.push("-".repeat(Math.min(120, header.length)));
  for (let r = 0; r < rows; r++) {
    let line = "";
    for (let c = 0; c < cols; c++) {
      line += cellValue(r, c, tick, hotRow, hotCol).padEnd(10, " ");
    }
    lines.push(line.slice(0, 120));
  }
  return lines;
}

function tableUpdateCellValue(r: number, c: number, tick: number): string {
  const v = (tick + r * 131 + c * 17) % 10_000;
  const wide = (tick + r + c) % 13 === 0;
  return wide ? `val=${String(v).padStart(4, "0")} (row=${r})` : String(v);
}

function terminalScreenTransitionLines(
  tick: number,
  params: Readonly<Record<string, number | string>>,
): string[] {
  const rows = numberParam(params.rows, 40);
  const cols = numberParam(params.cols, 120);
  const mode = tick % 3;
  const lines: string[] = [];

  if (mode === 0) {
    lines.push(clipPad("terminal-screen-transition [dashboard]", cols));
    for (let i = 0; i < rows - 1; i++) {
      const v = ((tick * 37 + i * 97) % 1000) / 1000;
      lines.push(
        clipPad(`svc-${String(i).padStart(2, "0")} ${bar(v, 24)} ${(v * 100).toFixed(1)}%`, cols),
      );
    }
    return lines;
  }

  if (mode === 1) {
    lines.push(clipPad("terminal-screen-transition [table]", cols));
    lines.push(clipPad("ID        NAME                 STATE     LAT(ms)   ERR", cols));
    for (let i = 0; i < rows - 2; i++) {
      const id = `node-${String((tick + i) % 512).padStart(3, "0")}`;
      const state = (tick + i) % 7 === 0 ? "degraded" : "healthy ";
      const lat = 10 + ((tick * 13 + i * 7) % 190);
      const err = (tick + i * 3) % 53 === 0 ? "yes" : "no ";
      lines.push(
        clipPad(
          `${id}   backend-${String(i).padStart(2, "0")}        ${state}     ${String(lat).padStart(3, " ")}      ${err}`,
          cols,
        ),
      );
    }
    return lines;
  }

  lines.push(clipPad("terminal-screen-transition [logs]", cols));
  for (let i = 0; i < rows - 1; i++) {
    const seq = tick * rows + i;
    const lvl = seq % 11 === 0 ? "WARN" : seq % 23 === 0 ? "ERROR" : "INFO ";
    lines.push(
      clipPad(
        `${lvl} ${new Date(1700000000000 + seq * 17).toISOString()} service=${seq % 17} msg=transition-${seq}`,
        cols,
      ),
    );
  }
  return lines;
}

function terminalFpsStreamLines(
  tick: number,
  params: Readonly<Record<string, number | string>>,
): string[] {
  const rows = numberParam(params.rows, 40);
  const cols = numberParam(params.cols, 120);
  const channels = numberParam(params.channels, 12);
  const lines: string[] = [];

  lines.push(clipPad(`terminal-fps-stream tick=${tick} target=60fps channels=${channels}`, cols));
  lines.push(clipPad("Channel  Value      Trend", cols));

  const bodyRows = Math.max(1, rows - 2);
  for (let i = 0; i < bodyRows; i++) {
    const ch = i % channels;
    const v = ((tick * (17 + ch) + i * 31) % 1000) / 1000;
    const trendSeed = (tick + i * 13 + ch * 11) % 16;
    const trend = Array.from({ length: 16 }, (_, j) =>
      ((trendSeed + j * 3) % 16) / 15 < v ? "▮" : "▯",
    ).join("");
    lines.push(
      clipPad(
        `ch-${String(ch).padStart(2, "0")}    ${(v * 100).toFixed(2).padStart(6, " ")}%    ${trend}`,
        cols,
      ),
    );
  }
  return lines;
}

function terminalInputLatencyLines(
  tick: number,
  params: Readonly<Record<string, number | string>>,
): string[] {
  const rows = numberParam(params.rows, 40);
  const cols = numberParam(params.cols, 120);
  const lines: string[] = [];

  lines.push(clipPad("terminal-input-latency synthetic-key-event -> frame", cols));
  lines.push(
    clipPad(
      `tick=${tick} active=${tick % 16} token=${((tick * 1103515245) >>> 0).toString(16)}`,
      cols,
    ),
  );
  for (let i = 0; i < rows - 2; i++) {
    const active = i === tick % Math.max(1, rows - 2);
    lines.push(
      clipPad(
        `${active ? ">" : " "} command-${String(i).padStart(2, "0")}  value=${(tick + i * 9) % 10000}`,
        cols,
      ),
    );
  }
  return lines;
}

function terminalMemorySoakLines(
  tick: number,
  params: Readonly<Record<string, number | string>>,
): string[] {
  const rows = numberParam(params.rows, 40);
  const cols = numberParam(params.cols, 120);
  const lines: string[] = [];

  lines.push(clipPad(`terminal-memory-soak tick=${tick}`, cols));
  for (let i = 0; i < rows - 1; i++) {
    const id = (tick * 7 + i * 19) % 100000;
    const payload = `${String(id).padStart(5, "0")} ${"x".repeat((i % 7) + 8)} ${(tick + i) % 997}`;
    lines.push(clipPad(payload, cols));
  }
  return lines;
}

function benchmarkLines(items: number, seed: number, cols: number): string[] {
  const lines: string[] = [];
  lines.push(clipPad(`Benchmark: ${items} items (#${seed})`, cols));
  lines.push(clipPad(`Total: ${items}  Page 1`, cols));
  for (let i = 0; i < items; i++) {
    lines.push(clipPad(`${i}. Item ${i} details`, cols));
  }
  return lines;
}

function rerenderLines(count: number, cols: number): string[] {
  return [
    clipPad("Counter Benchmark", cols),
    clipPad(`Count: ${count}  [+1]  [-1]`, cols),
    clipPad(`Last updated: iteration ${count}`, cols),
  ];
}

function contentUpdateLines(selected: number, cols: number): string[] {
  const lines: string[] = [];
  lines.push(clipPad(`Files  ${CONTENT_UPDATE_LIST_SIZE} items  Selected: ${selected}`, cols));
  for (let i = 0; i < CONTENT_UPDATE_LIST_SIZE; i++) {
    const marker = i === selected ? ">" : " ";
    lines.push(
      clipPad(
        `${marker} ${String(i).padStart(3, " ")}. entry-${i}.log ${(i * 1024 + 512).toLocaleString()} B`,
        cols,
      ),
    );
  }
  return lines;
}

function layoutStressLines(rows: number, cols: number, tick: number, termCols: number): string[] {
  const lines: string[] = [];
  lines.push(clipPad("Layout stress", termCols));
  lines.push(clipPad(`tick=${tick}`, termCols));
  for (let r = 0; r < rows; r++) {
    const labels: string[] = [];
    const values: string[] = [];
    for (let c = 0; c < cols; c++) {
      const v = (tick + r * 31 + c * 17) % 1000;
      const wide = (tick + r + c) % 7 === 0;
      const value = wide ? `value=${v} (${String(v).padStart(4, "0")})` : `v=${v}`;
      labels.push(`C${c}`);
      values.push(value);
    }
    lines.push(clipPad(labels.join(" | "), termCols));
    lines.push(clipPad(values.join(" | "), termCols));
  }
  return lines;
}

function scrollStressLines(items: number, active: number, tick: number, cols: number): string[] {
  const lines: string[] = [];
  lines.push(clipPad("Scroll stress (non-virtualized)", cols));
  lines.push(clipPad(`items=${items} active=${active} tick=${tick}`, cols));
  for (let i = 0; i < items; i++) {
    lines.push(
      clipPad(
        `${String(i).padStart(5, " ")} ${i === active ? "▶" : " "} Item ${i} v=${(tick + i * 17) % 1000}`,
        cols,
      ),
    );
  }
  return lines;
}

function virtualListLines(
  totalItems: number,
  viewport: number,
  tick: number,
  cols: number,
): string[] {
  const lines: string[] = [];
  const offset = safeMod(tick, totalItems - viewport);
  const end = Math.min(totalItems, offset + viewport);
  lines.push(clipPad("Virtual list", cols));
  lines.push(
    clipPad(`total=${totalItems} viewport=${viewport} offset=${offset} tick=${tick}`, cols),
  );
  for (let i = offset; i < end; i++) {
    lines.push(
      clipPad(`${String(i).padStart(6, " ")} • Item ${i} v=${(tick + i * 97) % 1000}`, cols),
    );
  }
  return lines;
}

function tablesLines(rows: number, cols: number, tick: number, termCols: number): string[] {
  const lines: string[] = [];
  lines.push(clipPad("Table update", termCols));
  lines.push(clipPad(`rows=${rows} cols=${cols} tick=${tick}`, termCols));
  lines.push(
    clipPad(["row", ...Array.from({ length: cols }, (_, c) => `Col ${c}`)].join("  "), termCols),
  );
  for (let r = 0; r < rows; r++) {
    const cells: string[] = [];
    for (let c = 0; c < cols; c++) {
      cells.push(tableUpdateCellValue(r, c, tick));
    }
    lines.push(clipPad(`${String(r).padStart(4, " ")}  ${cells.join("  ")}`, termCols));
  }
  return lines;
}

function memoryProfileLines(tick: number, cols: number): string[] {
  const pct = safeMod(tick, 100);
  const filled = Math.floor(pct / 5);
  const barText = `[${"#".repeat(filled)}${".".repeat(20 - filled)}] ${pct}%`;
  const lines: string[] = [];
  lines.push(clipPad(`Iteration ${tick}`, cols));
  lines.push(clipPad(barText, cols));
  for (let j = 0; j < 20; j++) {
    lines.push(clipPad(`  Line ${j}: value=${tick * 20 + j}`, cols));
  }
  return lines;
}

function terminalRerenderLines(tick: number, cols: number): string[] {
  return [clipPad("terminal-rerender", cols), clipPad(`tick=${tick}`, cols)];
}

function terminalVirtualListLines(
  totalItems: number,
  viewport: number,
  tick: number,
  cols: number,
): string[] {
  const lines: string[] = [];
  const offset = safeMod(tick, totalItems - viewport);
  const end = Math.min(totalItems, offset + viewport);
  lines.push(clipPad("terminal-virtual-list", cols));
  lines.push(
    clipPad(`total=${totalItems} viewport=${viewport} offset=${offset} tick=${tick}`, cols),
  );
  for (let i = offset; i < end; i++) {
    const active = i === offset + safeMod(tick, viewport);
    lines.push(
      clipPad(
        `${String(i).padStart(6, " ")} • Item ${i} v=${(tick + i * 97) % 1000}${active ? " <" : ""}`,
        cols,
      ),
    );
  }
  return lines;
}

function scenarioLines(
  scenario: string,
  params: Readonly<Record<string, number | string>>,
  tick: number,
  cols: number,
): string[] {
  switch (scenario) {
    case "startup":
      return benchmarkLines(STARTUP_TREE_SIZE, tick, cols);
    case "tree-construction":
      return benchmarkLines(numberParam(params.items, 100), tick, cols);
    case "rerender":
      return rerenderLines(tick, cols);
    case "content-update":
      return contentUpdateLines(safeMod(tick, CONTENT_UPDATE_LIST_SIZE), cols);
    case "layout-stress":
      return layoutStressLines(
        numberParam(params.rows, 40),
        numberParam(params.cols, 4),
        tick,
        cols,
      );
    case "scroll-stress": {
      const items = numberParam(params.items, 2000);
      return scrollStressLines(items, safeMod(tick, items), tick, cols);
    }
    case "virtual-list":
      return virtualListLines(
        numberParam(params.items, 100_000),
        numberParam(params.viewport, 40),
        tick,
        cols,
      );
    case "tables":
      return tablesLines(numberParam(params.rows, 100), numberParam(params.cols, 8), tick, cols);
    case "memory-profile":
      return memoryProfileLines(tick, cols);

    case "terminal-rerender":
      return terminalRerenderLines(tick, cols);
    case "terminal-frame-fill": {
      const rows = numberParam(params.rows, 40);
      const dirtyLines = numberParam(params.dirtyLines, 1);
      const lines: string[] = [];
      for (let r = 0; r < rows; r++) {
        const content = r < dirtyLines ? makeLineContent(r, tick, cols) : makeStaticLine(r, cols);
        lines.push(content);
      }
      return lines;
    }
    case "terminal-virtual-list":
      return terminalVirtualListLines(
        numberParam(params.items, 100_000),
        numberParam(params.viewport, 40),
        tick,
        cols,
      );
    case "terminal-table":
      return tableLines(numberParam(params.rows, 40), numberParam(params.cols, 8), tick).map((ln) =>
        clipPad(ln, cols),
      );
    case "terminal-screen-transition":
      return terminalScreenTransitionLines(tick, params);
    case "terminal-fps-stream":
      return terminalFpsStreamLines(tick, params);
    case "terminal-input-latency":
      return terminalInputLatencyLines(tick, params);
    case "terminal-memory-soak":
      return terminalMemorySoakLines(tick, params);
    default:
      throw new Error(`unsupported OpenTUI scenario "${scenario}"`);
  }
}

function lineTree(lines: readonly string[]): ReactNode {
  return createElement(
    "box",
    { flexDirection: "column", paddingX: 0 },
    ...lines.map((ln, i) => createElement("text", { key: String(i) }, ln)),
  );
}

function benchmarkTree(items: number, seed: number): ReactNode {
  const rows: ReactNode[] = [];
  for (let i = 0; i < items; i++) {
    rows.push(
      createElement(
        "box",
        { key: String(i), flexDirection: "row", gap: 1 },
        createElement("text", null, `${i}.`),
        createElement("text", null, `Item ${i}`),
        createElement("text", null, "details"),
      ),
    );
  }

  return createElement(
    "box",
    { flexDirection: "column", paddingX: 1, gap: 1 },
    createElement("text", null, `Benchmark: ${items} items (#${seed})`),
    createElement(
      "box",
      { flexDirection: "row", gap: 2 },
      createElement("text", null, `Total: ${items}`),
      createElement("text", null, "Page 1"),
    ),
    ...rows,
  );
}

function rerenderTree(count: number): ReactNode {
  return createElement(
    "box",
    { flexDirection: "column", paddingX: 1, gap: 1 },
    createElement("text", null, "Counter Benchmark"),
    createElement(
      "box",
      { flexDirection: "row", gap: 2 },
      createElement("text", null, `Count: ${count}`),
      createElement("text", null, "[+1]"),
      createElement("text", null, "[-1]"),
    ),
    createElement("text", null, `Last updated: iteration ${count}`),
  );
}

function contentUpdateTree(selected: number): ReactNode {
  const rows: ReactNode[] = [];
  for (let i = 0; i < CONTENT_UPDATE_LIST_SIZE; i++) {
    const isSelected = i === selected;
    rows.push(
      createElement(
        "box",
        { key: String(i), flexDirection: "row", gap: 1 },
        createElement("text", null, isSelected ? ">" : " "),
        createElement("text", null, `${String(i).padStart(3, " ")}.`),
        createElement("text", null, `entry-${i}.log`),
        createElement("text", null, `${(i * 1024 + 512).toLocaleString()} B`),
      ),
    );
  }

  return createElement(
    "box",
    { flexDirection: "column", paddingX: 0 },
    createElement(
      "box",
      { flexDirection: "row", gap: 2 },
      createElement("text", null, "Files"),
      createElement("text", null, `${CONTENT_UPDATE_LIST_SIZE} items`),
      createElement("text", null, `Selected: ${selected}`),
    ),
    ...rows,
  );
}

function layoutStressTree(rows: number, cols: number, tick: number): ReactNode {
  const grid: ReactNode[] = [];
  for (let r = 0; r < rows; r++) {
    const cells: ReactNode[] = [];
    for (let c = 0; c < cols; c++) {
      const v = (tick + r * 31 + c * 17) % 1000;
      const wide = (tick + r + c) % 7 === 0;
      const value = wide ? `value=${v} (${String(v).padStart(4, "0")})` : `v=${v}`;
      cells.push(
        createElement(
          "box",
          { key: `c:${r}:${c}`, flexGrow: 1, flexDirection: "column" },
          createElement("text", null, `C${c}`),
          createElement("text", null, value),
        ),
      );
    }
    grid.push(createElement("box", { key: `r:${r}`, flexDirection: "row", gap: 1 }, ...cells));
  }

  return createElement(
    "box",
    { flexDirection: "column", paddingX: 1, gap: 1 },
    createElement("text", null, "Layout stress"),
    createElement("text", null, `tick=${tick}`),
    ...grid,
  );
}

function scrollStressTree(items: number, active: number, tick: number): ReactNode {
  const rows: ReactNode[] = [];
  for (let i = 0; i < items; i++) {
    const isActive = i === active;
    rows.push(
      createElement(
        "box",
        { key: String(i), flexDirection: "row", gap: 1 },
        createElement("text", null, String(i).padStart(5, " ")),
        createElement("text", null, isActive ? "▶" : " "),
        createElement("text", null, `Item ${i}`),
        createElement("text", null, `v=${(tick + i * 17) % 1000}`),
      ),
    );
  }

  return createElement(
    "box",
    { flexDirection: "column", paddingX: 1, gap: 1 },
    createElement("text", null, "Scroll stress (non-virtualized)"),
    createElement("text", null, `items=${items} active=${active} tick=${tick}`),
    ...rows,
  );
}

function virtualListTree(totalItems: number, viewport: number, tick: number): ReactNode {
  const rows: ReactNode[] = [];
  const offset = safeMod(tick, totalItems - viewport);
  const start = offset;
  const end = Math.min(totalItems, offset + viewport);

  for (let i = start; i < end; i++) {
    rows.push(
      createElement(
        "box",
        { key: String(i), flexDirection: "row", gap: 1 },
        createElement("text", null, String(i).padStart(6, " ")),
        createElement("text", null, "•"),
        createElement("text", null, `Item ${i}`),
        createElement("text", null, `v=${(tick + i * 97) % 1000}`),
      ),
    );
  }

  return createElement(
    "box",
    { flexDirection: "column", paddingX: 1, gap: 1 },
    createElement("text", null, "Virtual list"),
    createElement(
      "text",
      null,
      `total=${totalItems} viewport=${viewport} offset=${offset} tick=${tick}`,
    ),
    ...rows,
  );
}

function tablesTree(rows: number, cols: number, tick: number): ReactNode {
  const headerCells: ReactNode[] = [];
  for (let c = 0; c < cols; c++) {
    headerCells.push(createElement("text", { key: `h:${c}` }, `Col ${c}`));
  }

  const body: ReactNode[] = [];
  for (let r = 0; r < rows; r++) {
    const cells: ReactNode[] = [];
    for (let c = 0; c < cols; c++) {
      cells.push(createElement("text", { key: `c:${r}:${c}` }, tableUpdateCellValue(r, c, tick)));
    }
    body.push(
      createElement(
        "box",
        { key: `r:${r}`, flexDirection: "row", gap: 2 },
        createElement("text", null, String(r).padStart(4, " ")),
        ...cells,
      ),
    );
  }

  return createElement(
    "box",
    { flexDirection: "column", paddingX: 1, gap: 1 },
    createElement("text", null, "Table update"),
    createElement("text", null, `rows=${rows} cols=${cols} tick=${tick}`),
    createElement(
      "box",
      { flexDirection: "row", gap: 2 },
      createElement("text", null, "row"),
      ...headerCells,
    ),
    ...body,
  );
}

function memoryProfileTree(tick: number): ReactNode {
  const pct = safeMod(tick, 100);
  const filled = Math.floor(pct / 5);
  const barText = `[${"#".repeat(filled)}${".".repeat(20 - filled)}] ${pct}%`;

  const lines: ReactNode[] = [];
  for (let j = 0; j < 20; j++) {
    lines.push(createElement("text", { key: String(j) }, `  Line ${j}: value=${tick * 20 + j}`));
  }

  return createElement(
    "box",
    { flexDirection: "column", paddingX: 1 },
    createElement("text", null, `Iteration ${tick}`),
    createElement("box", { flexDirection: "row", gap: 1 }, createElement("text", null, barText)),
    ...lines,
  );
}

function terminalRerenderTree(tick: number): ReactNode {
  return createElement(
    "box",
    { flexDirection: "column", paddingX: 1, gap: 1 },
    createElement("text", null, "terminal-rerender"),
    createElement("text", null, `tick=${tick}`),
  );
}

function terminalFrameFillTree(
  rows: number,
  cols: number,
  dirtyLines: number,
  tick: number,
): ReactNode {
  const lines: ReactNode[] = [];
  for (let r = 0; r < rows; r++) {
    const content = r < dirtyLines ? makeLineContent(r, tick, cols) : makeStaticLine(r, cols);
    lines.push(createElement("text", { key: String(r) }, content));
  }
  return createElement("box", { flexDirection: "column", paddingX: 0 }, ...lines);
}

function terminalVirtualListTree(totalItems: number, viewport: number, tick: number): ReactNode {
  const offset = safeMod(tick, totalItems - viewport);
  const rows: ReactNode[] = [];
  const end = Math.min(totalItems, offset + viewport);
  for (let i = offset; i < end; i++) {
    const active = i === offset + safeMod(tick, viewport);
    rows.push(
      createElement(
        "box",
        { key: String(i), flexDirection: "row", gap: 1 },
        createElement("text", null, String(i).padStart(6, " ")),
        createElement("text", null, "•"),
        createElement("text", null, `Item ${i}`),
        createElement("text", null, `v=${(tick + i * 97) % 1000}`),
        createElement("text", null, active ? " <" : ""),
      ),
    );
  }
  return createElement(
    "box",
    { flexDirection: "column", paddingX: 1, gap: 1 },
    createElement("text", null, "terminal-virtual-list"),
    createElement(
      "text",
      null,
      `total=${totalItems} viewport=${viewport} offset=${offset} tick=${tick}`,
    ),
    ...rows,
  );
}

function terminalTableTree(rows: number, cols: number, tick: number): ReactNode {
  return lineTree(tableLines(rows, cols, tick));
}

function scenarioTree(
  scenario: string,
  params: Readonly<Record<string, number | string>>,
  tick: number,
): ReactNode {
  switch (scenario) {
    case "startup":
      return benchmarkTree(STARTUP_TREE_SIZE, tick);
    case "tree-construction":
      return benchmarkTree(numberParam(params.items, 100), tick);
    case "rerender":
      return rerenderTree(tick);
    case "content-update":
      return contentUpdateTree(safeMod(tick, CONTENT_UPDATE_LIST_SIZE));
    case "layout-stress":
      return layoutStressTree(numberParam(params.rows, 40), numberParam(params.cols, 4), tick);
    case "scroll-stress": {
      const items = numberParam(params.items, 2000);
      return scrollStressTree(items, safeMod(tick, items), tick);
    }
    case "virtual-list":
      return virtualListTree(
        numberParam(params.items, 100_000),
        numberParam(params.viewport, 40),
        tick,
      );
    case "tables":
      return tablesTree(numberParam(params.rows, 100), numberParam(params.cols, 8), tick);
    case "memory-profile":
      return memoryProfileTree(tick);

    case "terminal-rerender":
      return terminalRerenderTree(tick);
    case "terminal-frame-fill":
      return terminalFrameFillTree(
        numberParam(params.rows, 40),
        numberParam(params.cols, 120),
        numberParam(params.dirtyLines, 1),
        tick,
      );
    case "terminal-virtual-list":
      return terminalVirtualListTree(
        numberParam(params.items, 100_000),
        numberParam(params.viewport, 40),
        tick,
      );
    case "terminal-table":
      return terminalTableTree(numberParam(params.rows, 40), numberParam(params.cols, 8), tick);
    case "terminal-screen-transition":
      return lineTree(terminalScreenTransitionLines(tick, params));
    case "terminal-fps-stream":
      return lineTree(terminalFpsStreamLines(tick, params));
    case "terminal-input-latency":
      return lineTree(terminalInputLatencyLines(tick, params));
    case "terminal-memory-soak":
      return lineTree(terminalMemorySoakLines(tick, params));
    default:
      throw new Error(`unsupported OpenTUI scenario "${scenario}"`);
  }
}

function scenarioViewportRows(
  scenario: string,
  params: Readonly<Record<string, number | string>>,
): number {
  switch (scenario) {
    case "startup":
      return Math.max(40, STARTUP_TREE_SIZE + 5);
    case "tree-construction":
      return Math.max(40, numberParam(params.items, 100) + 5);
    case "content-update":
      return 540;
    default:
      return 40;
  }
}

function scenarioViewportCols(): number {
  return 120;
}

function usesEventLoopScheduling(scenario: string): boolean {
  return scenario === "terminal-input-latency";
}

type OpenTuiRoot = ReturnType<typeof createRoot>;
type OpenTuiRenderer = Awaited<ReturnType<typeof createCliRenderer>>;
type OpenTuiCoreScene = {
  renderer: OpenTuiRenderer;
  container: BoxRenderable;
  lines: TextRenderable[];
  cols: number;
};

async function createRendererForBench(
  stdout: MeasuringStdout,
  rows: number,
  cols: number,
): Promise<Readonly<{ renderer: OpenTuiRenderer; root: OpenTuiRoot }>> {
  stdout.rows = rows;
  stdout.columns = cols;

  const renderer = await createCliRenderer({
    stdin: process.stdin as NodeJS.ReadStream,
    stdout: stdout as unknown as NodeJS.WriteStream,
    exitOnCtrlC: false,
    targetFps: 1000,
    maxFps: 1000,
    useMouse: false,
    useConsole: false,
    autoFocus: false,
  });

  const root = createRoot(renderer);
  return { renderer, root };
}

async function createCoreRendererForBench(
  stdout: MeasuringStdout,
  rows: number,
  cols: number,
): Promise<OpenTuiRenderer> {
  stdout.rows = rows;
  stdout.columns = cols;

  return createCliRenderer({
    stdin: process.stdin as NodeJS.ReadStream,
    stdout: stdout as unknown as NodeJS.WriteStream,
    exitOnCtrlC: false,
    targetFps: 1000,
    maxFps: 1000,
    useMouse: false,
    useConsole: false,
    autoFocus: false,
  });
}

function createCoreScene(renderer: OpenTuiRenderer, cols: number): OpenTuiCoreScene {
  const container = new BoxRenderable(renderer, {
    flexDirection: "column",
    paddingX: 0,
    paddingY: 0,
    gap: 0,
  });
  renderer.root.add(container);
  return { renderer, container, lines: [], cols };
}

function setCoreLines(scene: OpenTuiCoreScene, lines: readonly string[]): void {
  while (scene.lines.length < lines.length) {
    const node = new TextRenderable(scene.renderer, {
      content: "",
      truncate: true,
      wrapMode: "none",
    });
    scene.lines.push(node);
    scene.container.add(node);
  }

  while (scene.lines.length > lines.length) {
    const node = scene.lines.pop();
    if (!node) break;
    try {
      scene.container.remove(node.id);
    } catch {
      // ignore
    }
    try {
      node.destroy();
    } catch {
      // ignore
    }
  }

  for (let i = 0; i < lines.length; i++) {
    const node = scene.lines[i];
    if (!node) continue;
    node.content = lines[i] ?? "";
  }
}

async function renderCoreTickDirect(
  scene: OpenTuiCoreScene,
  scenario: string,
  params: Readonly<Record<string, number | string>>,
  tick: number,
): Promise<void> {
  setCoreLines(scene, scenarioLines(scenario, params, tick, scene.cols));
  scene.renderer.requestRender();
  await scene.renderer.idle();
}

async function destroyCoreScene(scene: OpenTuiCoreScene): Promise<void> {
  for (const node of scene.lines) {
    try {
      node.destroy();
    } catch {
      // ignore
    }
  }
  try {
    scene.container.destroyRecursively();
  } catch {
    // ignore
  }
  try {
    scene.renderer.destroy();
  } catch {
    // ignore
  }
}

async function destroyRenderer(root: OpenTuiRoot, renderer: OpenTuiRenderer): Promise<void> {
  try {
    root.unmount();
  } catch {
    // ignore
  }
  try {
    renderer.destroy();
  } catch {
    // ignore
  }
  try {
    await renderer.idle();
  } catch {
    // ignore
  }
}

async function runStartupBenchReact(args: CliArgs): Promise<BenchResultData> {
  const rows = scenarioViewportRows(args.scenario, args.params);
  const cols = scenarioViewportCols();

  const runIteration = async (
    seed: number,
  ): Promise<Readonly<{ elapsedMs: number; bytes: number }>> => {
    const stdout = new MeasuringStdout();
    const { renderer, root } = await createRendererForBench(stdout, rows, cols);

    try {
      const ts = performance.now();
      flushSync(() => {
        root.render(scenarioTree("startup", args.params, seed));
      });
      await renderer.idle();
      return { elapsedMs: performance.now() - ts, bytes: stdout.totalBytes };
    } finally {
      await destroyRenderer(root, renderer);
    }
  };

  for (let i = 0; i < args.warmup; i++) {
    await runIteration(i + 1);
  }

  tryGc();
  const memBefore = takeMemory();
  const cpuBefore = takeCpu();
  let memPeak = memBefore;

  const samplesMs: number[] = [];
  let bytesWritten = 0;
  const t0 = performance.now();

  for (let i = 0; i < args.iterations; i++) {
    const result = await runIteration(args.warmup + i + 1);
    samplesMs.push(result.elapsedMs);
    bytesWritten += result.bytes;

    if (i % 50 === 49) memPeak = peakMemory(memPeak, takeMemory());
  }

  const totalWallMs = performance.now() - t0;
  const cpuAfter = takeCpu();
  const memAfter = takeMemory();
  memPeak = peakMemory(memPeak, memAfter);
  const cpu = diffCpu(cpuBefore, cpuAfter);

  return {
    samplesMs,
    totalWallMs,
    cpuUserMs: cpu.userMs,
    cpuSysMs: cpu.systemMs,
    rssBeforeKb: memBefore.rssKb,
    rssAfterKb: memAfter.rssKb,
    rssPeakKb: memPeak.rssKb,
    heapBeforeKb: memBefore.heapUsedKb,
    heapAfterKb: memAfter.heapUsedKb,
    heapPeakKb: memPeak.heapUsedKb,
    bytesWritten,
    frames: args.iterations,
  };
}

async function runSteadyStateBenchReact(args: CliArgs): Promise<BenchResultData> {
  const rows = scenarioViewportRows(args.scenario, args.params);
  const cols = scenarioViewportCols();
  const stdout = new MeasuringStdout();
  const { renderer, root } = await createRendererForBench(stdout, rows, cols);

  const renderTickDirect = async (tick: number): Promise<void> => {
    flushSync(() => {
      root.render(scenarioTree(args.scenario, args.params, tick));
    });
    await renderer.idle();
  };

  const renderTick = async (tick: number): Promise<void> => {
    if (!usesEventLoopScheduling(args.scenario)) {
      await renderTickDirect(tick);
      return;
    }

    await new Promise<void>((resolve, reject) => {
      setImmediate(() => {
        renderTickDirect(tick).then(resolve).catch(reject);
      });
    });
  };

  try {
    await renderTickDirect(0);
    for (let i = 0; i < args.warmup; i++) {
      await renderTick(i + 1);
    }

    tryGc();
    const memBefore = takeMemory();
    const cpuBefore = takeCpu();
    let memPeak = memBefore;

    const samplesMs: number[] = [];
    const bytesBase = stdout.totalBytes;
    const t0 = performance.now();

    for (let i = 0; i < args.iterations; i++) {
      const ts = performance.now();
      await renderTick(args.warmup + i + 1);
      samplesMs.push(performance.now() - ts);

      if (i % 100 === 99) memPeak = peakMemory(memPeak, takeMemory());
    }

    const totalWallMs = performance.now() - t0;
    const cpuAfter = takeCpu();
    const memAfter = takeMemory();
    memPeak = peakMemory(memPeak, memAfter);
    const cpu = diffCpu(cpuBefore, cpuAfter);

    return {
      samplesMs,
      totalWallMs,
      cpuUserMs: cpu.userMs,
      cpuSysMs: cpu.systemMs,
      rssBeforeKb: memBefore.rssKb,
      rssAfterKb: memAfter.rssKb,
      rssPeakKb: memPeak.rssKb,
      heapBeforeKb: memBefore.heapUsedKb,
      heapAfterKb: memAfter.heapUsedKb,
      heapPeakKb: memPeak.heapUsedKb,
      bytesWritten: stdout.totalBytes - bytesBase,
      frames: args.iterations,
    };
  } finally {
    await destroyRenderer(root, renderer);
  }
}

async function runStartupBenchCore(args: CliArgs): Promise<BenchResultData> {
  const rows = scenarioViewportRows(args.scenario, args.params);
  const cols = scenarioViewportCols();

  const runIteration = async (
    seed: number,
  ): Promise<Readonly<{ elapsedMs: number; bytes: number }>> => {
    const stdout = new MeasuringStdout();
    const renderer = await createCoreRendererForBench(stdout, rows, cols);
    const scene = createCoreScene(renderer, cols);

    try {
      const ts = performance.now();
      await renderCoreTickDirect(scene, "startup", args.params, seed);
      return { elapsedMs: performance.now() - ts, bytes: stdout.totalBytes };
    } finally {
      await destroyCoreScene(scene);
    }
  };

  for (let i = 0; i < args.warmup; i++) {
    await runIteration(i + 1);
  }

  tryGc();
  const memBefore = takeMemory();
  const cpuBefore = takeCpu();
  let memPeak = memBefore;

  const samplesMs: number[] = [];
  let bytesWritten = 0;
  const t0 = performance.now();

  for (let i = 0; i < args.iterations; i++) {
    const result = await runIteration(args.warmup + i + 1);
    samplesMs.push(result.elapsedMs);
    bytesWritten += result.bytes;

    if (i % 50 === 49) memPeak = peakMemory(memPeak, takeMemory());
  }

  const totalWallMs = performance.now() - t0;
  const cpuAfter = takeCpu();
  const memAfter = takeMemory();
  memPeak = peakMemory(memPeak, memAfter);
  const cpu = diffCpu(cpuBefore, cpuAfter);

  return {
    samplesMs,
    totalWallMs,
    cpuUserMs: cpu.userMs,
    cpuSysMs: cpu.systemMs,
    rssBeforeKb: memBefore.rssKb,
    rssAfterKb: memAfter.rssKb,
    rssPeakKb: memPeak.rssKb,
    heapBeforeKb: memBefore.heapUsedKb,
    heapAfterKb: memAfter.heapUsedKb,
    heapPeakKb: memPeak.heapUsedKb,
    bytesWritten,
    frames: args.iterations,
  };
}

async function runSteadyStateBenchCore(args: CliArgs): Promise<BenchResultData> {
  const rows = scenarioViewportRows(args.scenario, args.params);
  const cols = scenarioViewportCols();
  const stdout = new MeasuringStdout();
  const renderer = await createCoreRendererForBench(stdout, rows, cols);
  const scene = createCoreScene(renderer, cols);

  const renderTickDirect = async (tick: number): Promise<void> => {
    await renderCoreTickDirect(scene, args.scenario, args.params, tick);
  };

  const renderTick = async (tick: number): Promise<void> => {
    if (!usesEventLoopScheduling(args.scenario)) {
      await renderTickDirect(tick);
      return;
    }

    await new Promise<void>((resolve, reject) => {
      setImmediate(() => {
        renderTickDirect(tick).then(resolve).catch(reject);
      });
    });
  };

  try {
    await renderTickDirect(0);
    for (let i = 0; i < args.warmup; i++) {
      await renderTick(i + 1);
    }

    tryGc();
    const memBefore = takeMemory();
    const cpuBefore = takeCpu();
    let memPeak = memBefore;

    const samplesMs: number[] = [];
    const bytesBase = stdout.totalBytes;
    const t0 = performance.now();

    for (let i = 0; i < args.iterations; i++) {
      const ts = performance.now();
      await renderTick(args.warmup + i + 1);
      samplesMs.push(performance.now() - ts);

      if (i % 100 === 99) memPeak = peakMemory(memPeak, takeMemory());
    }

    const totalWallMs = performance.now() - t0;
    const cpuAfter = takeCpu();
    const memAfter = takeMemory();
    memPeak = peakMemory(memPeak, memAfter);
    const cpu = diffCpu(cpuBefore, cpuAfter);

    return {
      samplesMs,
      totalWallMs,
      cpuUserMs: cpu.userMs,
      cpuSysMs: cpu.systemMs,
      rssBeforeKb: memBefore.rssKb,
      rssAfterKb: memAfter.rssKb,
      rssPeakKb: memPeak.rssKb,
      heapBeforeKb: memBefore.heapUsedKb,
      heapAfterKb: memAfter.heapUsedKb,
      heapPeakKb: memPeak.heapUsedKb,
      bytesWritten: stdout.totalBytes - bytesBase,
      frames: args.iterations,
    };
  } finally {
    await destroyCoreScene(scene);
  }
}

async function runBench(args: CliArgs): Promise<BenchResultData> {
  if (args.io !== "pty") {
    throw new Error("OpenTUI benchmarks require --io pty");
  }

  if (args.driver === "core") {
    if (args.scenario === "startup") {
      return runStartupBenchCore(args);
    }
    return runSteadyStateBenchCore(args);
  }

  if (args.scenario === "startup") {
    return runStartupBenchReact(args);
  }

  return runSteadyStateBenchReact(args);
}

function emit(resultPath: string | null, payload: BenchResultFile): void {
  const serialized = JSON.stringify(payload);
  if (resultPath) writeFileSync(resultPath, serialized, "utf-8");
  else process.stdout.write(`${serialized}\n`);
}

async function main(): Promise<void> {
  const args = parseArgs(process.argv);
  try {
    const data = await runBench(args);
    emit(args.resultPath, { ok: true, data });
    process.exit(0);
  } catch (err) {
    const error = err instanceof Error ? err.message : String(err);
    emit(args.resultPath, { ok: false, error });
    process.exit(1);
  }
}

main().catch((err) => {
  const message = err instanceof Error ? err.message : String(err);
  process.stderr.write(`${message}\n`);
  process.exit(1);
});
