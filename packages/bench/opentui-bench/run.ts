#!/usr/bin/env bun

import { writeFileSync } from "node:fs";
import { Writable } from "node:stream";
import { createCliRenderer } from "@opentui/core";
import { createRoot, flushSync } from "@opentui/react";
import { type ReactNode, createElement } from "react";

type CliArgs = Readonly<{
  scenario: string;
  warmup: number;
  iterations: number;
  io: "pty" | "stub";
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

  return { scenario, warmup, iterations, io, resultPath, params };
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

function clipPad(s: string, cols: number): string {
  if (s.length >= cols) return s.slice(0, cols);
  return `${s}${" ".repeat(cols - s.length)}`;
}

function bar(value: number, width: number): string {
  const filled = Math.max(0, Math.min(width, Math.round(value * width)));
  return `${"#".repeat(filled)}${"-".repeat(width - filled)}`;
}

function terminalScreenTransitionLines(
  tick: number,
  params: Record<string, number | string>,
): string[] {
  const rows = Number(params.rows ?? 40);
  const cols = Number(params.cols ?? 120);
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

function terminalFpsStreamLines(tick: number, params: Record<string, number | string>): string[] {
  const rows = Number(params.rows ?? 40);
  const cols = Number(params.cols ?? 120);
  const channels = Number(params.channels ?? 12);
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
  params: Record<string, number | string>,
): string[] {
  const rows = Number(params.rows ?? 40);
  const cols = Number(params.cols ?? 120);
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

function terminalMemorySoakLines(tick: number, params: Record<string, number | string>): string[] {
  const rows = Number(params.rows ?? 40);
  const cols = Number(params.cols ?? 120);
  const lines: string[] = [];

  lines.push(clipPad(`terminal-memory-soak tick=${tick}`, cols));
  for (let i = 0; i < rows - 1; i++) {
    const id = (tick * 7 + i * 19) % 100000;
    const payload = `${String(id).padStart(5, "0")} ${"x".repeat((i % 7) + 8)} ${(tick + i) % 997}`;
    lines.push(clipPad(payload, cols));
  }
  return lines;
}

function lineTree(lines: readonly string[]): ReactNode {
  return createElement(
    "box",
    { flexDirection: "column", paddingX: 0 },
    ...lines.map((ln, i) => createElement("text", { key: String(i) }, ln)),
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
  const offset = tick % (totalItems - viewport);
  const rows: ReactNode[] = [];
  const end = Math.min(totalItems, offset + viewport);
  for (let i = offset; i < end; i++) {
    const active = i === offset + (tick % viewport);
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
  const lines = tableLines(rows, cols, tick);
  return lineTree(lines);
}

function scenarioTree(
  scenario: string,
  params: Record<string, number | string>,
  tick: number,
): ReactNode {
  switch (scenario) {
    case "terminal-rerender":
      return terminalRerenderTree(tick);
    case "terminal-frame-fill":
      return terminalFrameFillTree(
        Number(params.rows ?? 40),
        Number(params.cols ?? 120),
        Number(params.dirtyLines ?? 1),
        tick,
      );
    case "terminal-virtual-list":
      return terminalVirtualListTree(
        Number(params.items ?? 100_000),
        Number(params.viewport ?? 40),
        tick,
      );
    case "terminal-table":
      return terminalTableTree(Number(params.rows ?? 40), Number(params.cols ?? 8), tick);
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

async function runBench(args: CliArgs): Promise<BenchResultData> {
  if (args.io !== "pty") {
    throw new Error("OpenTUI benchmarks require --io pty");
  }

  const stdout = new MeasuringStdout();
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

  const renderTick = async (tick: number): Promise<void> => {
    flushSync(() => {
      root.render(scenarioTree(args.scenario, args.params, tick));
    });
    await renderer.idle();
  };

  await renderTick(0);
  for (let i = 0; i < args.warmup; i++) await renderTick(i + 1);

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
