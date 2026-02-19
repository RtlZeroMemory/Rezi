import { spawn, spawnSync } from "node:child_process";
import { constants, accessSync, readFileSync, unlinkSync, writeFileSync } from "node:fs";
import * as os from "node:os";
import { getBenchIoMode } from "../io.js";
import { computeStats } from "../measure.js";
import type { BenchMetrics, MemorySnapshot } from "../types.js";

type RatatuiResultData = Readonly<{
  samplesMs: readonly number[];
  totalWallMs: number;
  cpuUserMs: number;
  cpuSysMs: number;
  rssBeforeKb: number;
  rssAfterKb: number;
  rssPeakKb: number;
  bytesWritten: number;
  frames: number;
}>;

type RatatuiResultFile =
  | Readonly<{ ok: true; data: RatatuiResultData }>
  | Readonly<{ ok: false; error: string }>;

function resolveRatatuiBenchBinary(): string {
  const env = process.env as Readonly<{ REZI_RATATUI_BENCH_BIN?: string }>;
  const candidate =
    env.REZI_RATATUI_BENCH_BIN ??
    `${process.cwd()}/benchmarks/native/ratatui-bench/target/release/ratatui-bench`;
  accessSync(candidate, constants.X_OK);
  return candidate;
}

function memWithRss(rssKb: number): MemorySnapshot {
  return {
    rssKb,
    heapUsedKb: null,
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

export async function runRatatuiScenario(
  scenario: string,
  config: Readonly<{ warmup: number; iterations: number }>,
  params: Record<string, number | string>,
): Promise<BenchMetrics> {
  const bin = resolveRatatuiBenchBinary();
  const mode = getBenchIoMode() === "terminal" ? "pty" : "stub";
  const resultPath = `${os.tmpdir()}/rezi-ratatui-${process.pid}-${Date.now()}-${Math.random().toString(16).slice(2)}.json`;

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
  for (const [k, v] of Object.entries(params)) {
    args.push(`--${k}`, String(v));
  }

  // Avoid any stdout/stderr JSON. The native bench writes results to a file.
  const stdio: ("ignore" | "inherit")[] =
    mode === "pty" ? ["ignore", "inherit", "inherit"] : ["ignore", "ignore", "inherit"];

  await new Promise<void>((resolve, reject) => {
    const command = withAffinity(bin, args);
    const child = spawn(command.file, command.args, { stdio });
    child.on("error", (err) => reject(err));
    child.on("exit", (code, signal) => {
      if (code === 0) resolve();
      else
        reject(
          new Error(
            `ratatui bench failed (exit=${String(code ?? "?")}, signal=${String(signal ?? "")})`,
          ),
        );
    });
  });

  try {
    const parsed = JSON.parse(readFileSync(resultPath, "utf-8")) as RatatuiResultFile;
    if (!("ok" in parsed) || parsed.ok !== true) {
      throw new Error("ok" in parsed ? parsed.error : "invalid result payload");
    }

    const d = parsed.data;
    const timing = computeStats(d.samplesMs);
    const memBefore = memWithRss(d.rssBeforeKb);
    const memAfter = memWithRss(d.rssAfterKb);
    const memPeak = memWithRss(d.rssPeakKb);

    return {
      timing,
      memBefore,
      memAfter,
      memPeak,
      rssGrowthKb: memAfter.rssKb - memBefore.rssKb,
      heapUsedGrowthKb: null,
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

// Convenience helper for local development: emit a stub result file for schema checks.
export function writeRatatuiSchemaStub(path: string): void {
  const stub: RatatuiResultFile = {
    ok: true,
    data: {
      samplesMs: [1, 1, 1],
      totalWallMs: 3,
      cpuUserMs: 3,
      cpuSysMs: 0,
      rssBeforeKb: 0,
      rssAfterKb: 0,
      rssPeakKb: 0,
      bytesWritten: 0,
      frames: 3,
    },
  };
  writeFileSync(path, JSON.stringify(stub, null, 2), "utf-8");
}
