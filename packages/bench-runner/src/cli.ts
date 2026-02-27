import { mkdirSync, readFileSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import path from "node:path";
import net from "node:net";
import os from "node:os";
import { setTimeout as delay } from "node:timers/promises";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { performance } from "node:perf_hooks";

import { runInPty } from "@rezi-ui/ink-compat-bench-harness";

type RendererName = "real-ink" | "ink-compat";

function readArg(name: string): string | undefined {
  const idx = process.argv.indexOf(`--${name}`);
  if (idx === -1) return undefined;
  return process.argv[idx + 1];
}

function hasFlag(name: string): boolean {
  return process.argv.includes(`--${name}`);
}

function requireArg(name: string): string {
  const value = readArg(name);
  if (!value) throw new Error(`Missing --${name}`);
  return value;
}

function parseIntArg(name: string, fallback: number): number {
  const raw = readArg(name);
  if (!raw) return fallback;
  const v = Number.parseInt(raw, 10);
  return Number.isFinite(v) ? v : fallback;
}

async function getClockTicksPerSecond(): Promise<number> {
  try {
    const pExec = promisify(execFile);
    const { stdout } = await pExec("getconf", ["CLK_TCK"]);
    const v = Number.parseInt(String(stdout).trim(), 10);
    return Number.isFinite(v) && v > 0 ? v : 100;
  } catch {
    return 100;
  }
}

function computeCpuSecondsFromProcSamples(
  samples: readonly { cpuUserTicks: number | null; cpuSystemTicks: number | null }[],
  clkTck: number,
): number | null {
  const first = samples.find((s) => s.cpuUserTicks != null && s.cpuSystemTicks != null);
  const last = [...samples]
    .reverse()
    .find((s) => s.cpuUserTicks != null && s.cpuSystemTicks != null);
  if (!first || !last) return null;
  const dt =
    (last.cpuUserTicks! + last.cpuSystemTicks!) - (first.cpuUserTicks! + first.cpuSystemTicks!);
  return dt / clkTck;
}

async function openControlServer(socketPath: string): Promise<{
  sendLine: (obj: unknown) => void;
  waitForClient: (timeoutMs: number) => Promise<boolean>;
  close: () => Promise<void>;
}> {
  rmSync(socketPath, { force: true });
  let sock: net.Socket | null = null;
  const server = net.createServer((s) => {
    sock = s;
    sock.setNoDelay(true);
  });
  await new Promise<void>((resolve, reject) => {
    server.once("error", reject);
    server.listen(socketPath, () => resolve());
  });

  const waitForClient = async (timeoutMs: number): Promise<boolean> => {
    if (sock) return true;
    return await Promise.race([
      new Promise<boolean>((resolve) => server.once("connection", () => resolve(true))),
      delay(timeoutMs).then(() => false),
    ]);
  };

  const sendLine = (obj: unknown): void => {
    sock?.write(`${JSON.stringify(obj)}\n`);
  };

  const close = async (): Promise<void> => {
    try {
      sock?.destroy();
    } catch {}
    await new Promise<void>((resolve) => server.close(() => resolve()));
    rmSync(socketPath, { force: true });
  };

  return { sendLine, waitForClient, close };
}

function seededToken(i: number): string {
  const words = [
    "lorem",
    "ipsum",
    "dolor",
    "sit",
    "amet,",
    "consectetur",
    "adipiscing",
    "elit.",
    "sed",
    "do",
    "eiusmod",
    "tempor",
    "incididunt",
    "ut",
    "labore",
    "et",
    "dolore",
    "magna",
    "aliqua.",
  ];
  const w = words[i % words.length] ?? "x";
  const mod = i % 29;
  if (mod === 0) return `**${w}**`;
  if (mod === 7) return `\`code:${w}\``;
  if (mod === 13) return `(${w})`;
  return w;
}

async function driveScenario(
  scenario: string,
  seed: number,
  control: Awaited<ReturnType<typeof openControlServer>>,
  childFinished: () => boolean,
): Promise<void> {
  const ok = await control.waitForClient(4000);
  if (!ok) return;
  if (childFinished()) return;

  control.sendLine({ type: "init", seed });

  if (scenario === "streaming-chat") {
    const total = 360;
    const ratePerSecond = 120;
    const intervalMs = Math.round(1000 / ratePerSecond);
    for (let i = 0; i < total; i++) {
      if (childFinished()) break;
      control.sendLine({ type: "token", text: `t=${i} ${seededToken(i)} ${seededToken(i + 1)}` });
      await delay(intervalMs);
    }
    control.sendLine({ type: "done" });
    return;
  }

  const tickMs =
    scenario === "large-list-scroll" ? 33 : scenario === "resize-storm" ? 25 : 16;
  const tickCount =
    scenario === "large-list-scroll"
      ? 120
      : scenario === "dashboard-grid"
        ? 140
        : scenario === "style-churn"
          ? 180
          : scenario === "resize-storm"
            ? 40
            : 60;

  for (let i = 0; i < tickCount; i++) {
    if (childFinished()) break;
    control.sendLine({ type: "tick" });
    await delay(tickMs);
  }
  control.sendLine({ type: "done" });
}

function safeReadJsonl(pathname: string): readonly Record<string, unknown>[] {
  try {
    const text = readFileSync(pathname, "utf8");
    return text
      .split("\n")
      .filter(Boolean)
      .map((l) => JSON.parse(l) as Record<string, unknown>);
  } catch {
    return [];
  }
}

async function main(): Promise<void> {
  const scenario = requireArg("scenario");
  const renderer = requireArg("renderer") as RendererName;
  const runs = parseIntArg("runs", 1);
  const outRoot = path.resolve(readArg("out") ?? "results");
  const cols = parseIntArg("cols", 80);
  const rows = parseIntArg("rows", 24);
  const stableWindowMs = parseIntArg("stable-ms", 250);
  const cpuProf = hasFlag("cpu-prof");

  const repoRoot = process.cwd();
  const appEntry = path.join(repoRoot, "packages/bench-app/dist/entry.js");
  const clkTck = await getClockTicksPerSecond();

  mkdirSync(outRoot, { recursive: true });
  const startedAt = new Date().toISOString().replace(/[:.]/g, "-");
  const batchDir = path.join(outRoot, `ink-bench_${scenario}_${renderer}_${startedAt}`);
  mkdirSync(batchDir, { recursive: true });

  const summaries: unknown[] = [];

  for (let i = 0; i < runs; i++) {
    linkInkForRenderer(repoRoot, renderer);
    const runDir = path.join(batchDir, `run_${String(i + 1).padStart(2, "0")}`);
    mkdirSync(runDir, { recursive: true });

    const controlSocket = path.join(
      os.tmpdir(),
      `inkbench_${process.pid}_${Math.trunc(performance.now())}_${i}.sock`,
    );
    const controlServer = await openControlServer(controlSocket);
    const seed = 1337 + i;

    const args = [
      "--no-warnings",
      ...(cpuProf
        ? [
            "--cpu-prof",
            "--cpu-prof-dir",
            path.join(runDir, "cpu-prof"),
            "--cpu-prof-name",
            `${scenario}_${renderer}_run${i + 1}.cpuprofile`,
          ]
        : []),
      appEntry,
    ];

    const env: Record<string, string | undefined> = {
      ...process.env,
      BENCH_SCENARIO: scenario,
      BENCH_RENDERER: renderer,
      BENCH_OUT_DIR: runDir,
      BENCH_COLS: String(cols),
      BENCH_ROWS: String(rows),
      BENCH_CONTROL_SOCKET: controlSocket,
      BENCH_TIMEOUT_MS: process.env["BENCH_TIMEOUT_MS"] ?? "15000",
      BENCH_EXIT_AFTER_DONE_MS:
        process.env["BENCH_EXIT_AFTER_DONE_MS"] ?? String(Math.max(0, stableWindowMs + 50)),
      BENCH_INK_COMPAT_PHASES: process.env["BENCH_INK_COMPAT_PHASES"] ?? "1",
      BENCH_MAX_FPS: process.env["BENCH_MAX_FPS"] ?? "60",
    };

    const inputScript =
      scenario === "large-list-scroll"
        ? Array.from({ length: 40 }, (_, j) => ({
            kind: "write" as const,
            atMs: 250 + j * 35,
            data: "\\u001b[B",
          }))
        : scenario === "resize-storm"
          ? [
              { kind: "resize" as const, atMs: 200, cols: 100, rows: 30 },
              { kind: "resize" as const, atMs: 350, cols: 80, rows: 24 },
              { kind: "resize" as const, atMs: 500, cols: 120, rows: 28 },
              { kind: "resize" as const, atMs: 650, cols: 80, rows: 24 },
              { kind: "resize" as const, atMs: 800, cols: 90, rows: 26 },
              { kind: "resize" as const, atMs: 950, cols: 80, rows: 24 },
            ]
          : undefined;

    let childExited = false;
    const runPromise = runInPty({
      cwd: repoRoot,
      command: process.execPath,
      args,
      env,
      cols,
      rows,
      outDir: runDir,
      rawOutputFile: "pty-output.bin",
      screenFile: "screen-final.txt",
      stableWindowMs,
      meaningfulPaintText: "BENCH_READY",
      ...(inputScript ? { inputScript } : {}),
      procSampleIntervalMs: 50,
    }).finally(() => {
      childExited = true;
    });

    const drivePromise = driveScenario(scenario, seed, controlServer, () => childExited).finally(
      () => controlServer.close(),
    );

    const result = await Promise.all([runPromise, drivePromise]).then(([r]) => r);

    const frames = safeReadJsonl(path.join(runDir, "frames.jsonl"));
    const renderTotalMs = frames.reduce((a, f) => a + (Number(f["renderTotalMs"]) || 0), 0);
    const stdoutBytes = frames.reduce((a, f) => a + (Number(f["stdoutBytes"]) || 0), 0);
    const stdoutWrites = frames.reduce((a, f) => a + (Number(f["stdoutWrites"]) || 0), 0);
    const cpuSeconds = computeCpuSecondsFromProcSamples(result.procSamples, clkTck);

    const summary = {
      scenario,
      renderer,
      run: i + 1,
      meanWallS: (result.stableAtMs ?? result.durationMs) / 1000,
      totalCpuTimeS: cpuSeconds,
      meanRenderTotalMs: renderTotalMs,
      timeToFirstMeaningfulPaintMs: result.meaningfulPaintAtMs,
      timeToStableMs: result.stableAtMs,
      writes: stdoutWrites,
      bytes: stdoutBytes,
      renderMsPerKB: stdoutBytes > 0 ? renderTotalMs / (stdoutBytes / 1024) : null,
      framesEmitted: frames.length,
      ...result,
    };

    summaries.push(summary);
    writeFileSync(path.join(runDir, "run-summary.json"), JSON.stringify(summary, null, 2));
  }

  writeFileSync(path.join(batchDir, "batch-summary.json"), JSON.stringify(summaries, null, 2));
}

main().catch((err: unknown) => {
  const msg = err instanceof Error ? err.stack ?? err.message : String(err);
  console.error(msg);
  process.exitCode = 1;
});
function linkInkForRenderer(repoRoot: string, renderer: RendererName): void {
  const benchNodeModules = path.join(repoRoot, "packages/bench-app/node_modules");
  mkdirSync(benchNodeModules, { recursive: true });
  const linkPath = path.join(benchNodeModules, "ink");
  rmSync(linkPath, { force: true });
  const target =
    renderer === "real-ink"
      ? path.join(repoRoot, "node_modules/@jrichman/ink")
      : path.join(repoRoot, "packages/ink-compat");
  symlinkSync(target, linkPath, "junction");
}
