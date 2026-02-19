import { spawn, spawnSync } from "node:child_process";
import { constants, accessSync, readFileSync, unlinkSync } from "node:fs";
import * as os from "node:os";
import { getBenchIoMode } from "../io.js";
import { computeStats } from "../measure.js";
import type { BenchMetrics, MemorySnapshot } from "../types.js";

type OpenTuiResultData = Readonly<{
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

type OpenTuiResultFile =
  | Readonly<{ ok: true; data: OpenTuiResultData }>
  | Readonly<{ ok: false; error: string }>;

function resolveOpenTuiRunnerScript(): string {
  const candidate = `${process.cwd()}/packages/bench/opentui-bench/run.ts`;
  accessSync(candidate, constants.R_OK);
  return candidate;
}

function resolveBunBin(): string {
  const env = process.env as Readonly<{ REZI_BUN_BIN?: string }>;
  return env.REZI_BUN_BIN ?? "bun";
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

export function checkOpenTui(): boolean {
  try {
    resolveOpenTuiRunnerScript();
  } catch {
    return false;
  }
  try {
    const bunBin = resolveBunBin();
    const versionProbe = spawnSync(bunBin, ["--version"], { stdio: "ignore" });
    if ((versionProbe.status ?? 1) !== 0 || versionProbe.error) return false;
    const importProbe = spawnSync(
      bunBin,
      ["-e", "import '@opentui/core'; import '@opentui/react';"],
      { cwd: `${process.cwd()}/packages/bench`, stdio: "ignore" },
    );
    return (importProbe.status ?? 1) === 0 && !importProbe.error;
  } catch {
    return false;
  }
}

export async function runOpenTuiScenario(
  scenario: string,
  config: Readonly<{ warmup: number; iterations: number }>,
  params: Record<string, number | string>,
): Promise<BenchMetrics> {
  const mode = getBenchIoMode() === "terminal" ? "pty" : "stub";
  if (mode !== "pty") {
    throw new Error("OpenTUI benchmarks currently require PTY mode");
  }

  const bunBin = resolveBunBin();
  const runnerScript = resolveOpenTuiRunnerScript();
  const resultPath = `${os.tmpdir()}/rezi-opentui-${process.pid}-${Date.now()}-${Math.random().toString(16).slice(2)}.json`;

  const args: string[] = [
    runnerScript,
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
  for (const [k, v] of Object.entries(params)) {
    args.push(`--${k}`, String(v));
  }

  await new Promise<void>((resolve, reject) => {
    const command = withAffinity(bunBin, args);
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
            `opentui bench failed (exit=${String(code ?? "?")}, signal=${String(signal ?? "")})`,
          ),
        );
      }
    });
  });

  try {
    const parsed = JSON.parse(readFileSync(resultPath, "utf-8")) as OpenTuiResultFile;
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
