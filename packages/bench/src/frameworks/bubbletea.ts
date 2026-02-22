import { spawn, spawnSync } from "node:child_process";
import { constants, accessSync, mkdirSync, readFileSync, unlinkSync } from "node:fs";
import * as os from "node:os";
import { getBenchIoMode } from "../io.js";
import { computeStats } from "../measure.js";
import type { BenchMetrics, MemorySnapshot } from "../types.js";

type BubbleTeaResultData = Readonly<{
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

type BubbleTeaResultFile =
  | Readonly<{ ok: true; data: BubbleTeaResultData }>
  | Readonly<{ ok: false; error: string }>;

function resolveBubbleTeaBenchDir(): string {
  const candidate = `${process.cwd()}/packages/bench/bubbletea-bench`;
  accessSync(candidate, constants.R_OK);
  return candidate;
}

function resolveGoBin(): string {
  const env = process.env as Readonly<{ REZI_GO_BIN?: string }>;
  return env.REZI_GO_BIN ?? "go";
}

function resolveBubbleTeaFps(): number | null {
  const env = process.env as Readonly<{
    REZI_BUBBLETEA_BENCH_FPS?: string;
    REZI_BUBBLETEA_FPS?: string;
  }>;
  const raw = (env.REZI_BUBBLETEA_BENCH_FPS ?? env.REZI_BUBBLETEA_FPS ?? "").trim();
  if (raw.length === 0) return null;
  const parsed = Number.parseInt(raw, 10);
  if (!Number.isFinite(parsed) || parsed <= 0) {
    throw new Error(
      `invalid Bubble Tea FPS override: ${raw} (expected positive integer via REZI_BUBBLETEA_BENCH_FPS)`,
    );
  }
  return parsed;
}

function resolveBubbleTeaBenchBinaryPath(): string {
  const env = process.env as Readonly<{ REZI_BUBBLETEA_BENCH_BIN?: string }>;
  if (env.REZI_BUBBLETEA_BENCH_BIN) {
    accessSync(env.REZI_BUBBLETEA_BENCH_BIN, constants.X_OK);
    return env.REZI_BUBBLETEA_BENCH_BIN;
  }
  const benchDir = resolveBubbleTeaBenchDir();
  const outDir = `${benchDir}/.bin`;
  mkdirSync(outDir, { recursive: true });
  return `${outDir}/bubbletea-bench`;
}

function withAffinity(
  file: string,
  args: readonly string[],
): Readonly<{ file: string; args: string[] }> {
  const env = process.env as Readonly<{ REZI_BENCH_CPU_AFFINITY?: string }>;
  const affinity = env.REZI_BENCH_CPU_AFFINITY?.trim();
  if (!affinity) return { file, args: [...args] };
  if (process.platform !== "linux") {
    throw new Error("--cpu-affinity is only supported on Linux hosts");
  }
  const probe = spawnSync("taskset", ["--version"], { stdio: "ignore" });
  if ((probe.status ?? 1) !== 0) {
    throw new Error("--cpu-affinity requested but taskset is unavailable");
  }
  return { file: "taskset", args: ["-c", affinity, file, ...args] };
}

function memWithRssHeap(rssKb: number, heapUsedKb: number): MemorySnapshot {
  return {
    rssKb,
    heapUsedKb,
    heapTotalKb: null,
    externalKb: null,
    arrayBuffersKb: null,
  };
}

let cachedBuiltBinary: string | null = null;

function ensureBuilt(): string {
  const env = process.env as Readonly<{ REZI_BUBBLETEA_BENCH_BIN?: string }>;
  const binary = resolveBubbleTeaBenchBinaryPath();
  if (env.REZI_BUBBLETEA_BENCH_BIN) return binary;
  if (cachedBuiltBinary === binary) return binary;

  const goBin = resolveGoBin();
  const benchDir = resolveBubbleTeaBenchDir();
  const built = spawnSync(goBin, ["build", "-mod=mod", "-o", binary, "."], {
    cwd: benchDir,
    stdio: ["ignore", "ignore", "inherit"],
    env: { ...process.env },
  });
  if ((built.status ?? 1) !== 0 || built.error) {
    throw new Error(
      `bubbletea build failed (${built.error?.message ?? `exit=${built.status ?? 1}`})`,
    );
  }
  cachedBuiltBinary = binary;
  return binary;
}

export function checkBubbleTea(): boolean {
  try {
    resolveBubbleTeaBenchDir();
  } catch {
    return false;
  }

  try {
    const goBin = resolveGoBin();
    const probe = spawnSync(goBin, ["version"], { stdio: "ignore" });
    if ((probe.status ?? 1) !== 0 || probe.error) return false;
    resolveBubbleTeaBenchBinaryPath();
    return true;
  } catch {
    return false;
  }
}

export async function runBubbleTeaScenario(
  scenario: string,
  config: Readonly<{ warmup: number; iterations: number }>,
  params: Record<string, number | string>,
): Promise<BenchMetrics> {
  const mode = getBenchIoMode() === "terminal" ? "pty" : "stub";
  if (mode !== "pty") {
    throw new Error("Bubble Tea benchmarks currently require PTY mode");
  }

  const binary = ensureBuilt();
  const resultPath = `${os.tmpdir()}/rezi-bubbletea-${process.pid}-${Date.now()}-${Math.random().toString(16).slice(2)}.json`;

  const args: string[] = [
    "--scenario",
    scenario,
    "--warmup",
    String(config.warmup),
    "--iterations",
    String(config.iterations),
    "--io",
    mode,
    "--result-path",
    resultPath,
  ];
  const fps = resolveBubbleTeaFps();
  if (fps !== null) {
    args.push("--fps", String(fps));
  }

  for (const [k, v] of Object.entries(params)) {
    args.push(`--${k}`, String(v));
  }

  await new Promise<void>((resolve, reject) => {
    const command = withAffinity(binary, args);
    const child = spawn(command.file, command.args, {
      stdio: ["ignore", "inherit", "inherit"],
      env: { ...process.env },
    });
    child.on("error", (err) => reject(err));
    child.on("exit", (code, signal) => {
      if (code === 0) resolve();
      else {
        reject(
          new Error(
            `bubbletea bench failed (exit=${String(code ?? "?")}, signal=${String(signal ?? "")})`,
          ),
        );
      }
    });
  });

  try {
    const parsed = JSON.parse(readFileSync(resultPath, "utf-8")) as BubbleTeaResultFile;
    if (!("ok" in parsed) || parsed.ok !== true) {
      throw new Error("ok" in parsed ? parsed.error : "invalid result payload");
    }

    const d = parsed.data;
    const timing = computeStats(d.samplesMs);
    const memBefore = memWithRssHeap(d.rssBeforeKb, d.heapBeforeKb);
    const memAfter = memWithRssHeap(d.rssAfterKb, d.heapAfterKb);
    const memPeak = memWithRssHeap(d.rssPeakKb, d.heapPeakKb);
    const heapUsedGrowthKb =
      memAfter.heapUsedKb === null || memBefore.heapUsedKb === null
        ? null
        : memAfter.heapUsedKb - memBefore.heapUsedKb;

    return {
      timing,
      memBefore,
      memAfter,
      memPeak,
      rssGrowthKb: memAfter.rssKb - memBefore.rssKb,
      heapUsedGrowthKb,
      rssSlopeKbPerIter: null,
      heapUsedSlopeKbPerIter: null,
      memStable: null,
      cpu: { userMs: d.cpuUserMs, systemMs: d.cpuSysMs },
      iterations: timing.n,
      totalWallMs: d.totalWallMs,
      opsPerSec: timing.n / (d.totalWallMs / 1000),
      framesProduced: d.frames,
      bytesProduced: d.bytesWritten,
      ptyBytesObserved: null,
    };
  } finally {
    try {
      unlinkSync(resultPath);
    } catch {
      // ignore
    }
  }
}
