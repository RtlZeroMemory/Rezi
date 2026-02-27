import { appendFileSync, mkdirSync } from "node:fs";
import { dirname } from "node:path";
import type { BenchMetrics, ScenarioConfig } from "./types.js";

type CorePerfModule = Readonly<{
  perfReset?: () => void;
  perfSnapshot?: () => unknown;
}>;

function readEnv(name: string): string | null {
  const value = process.env[name];
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

function envFlag(name: string): boolean {
  const value = readEnv(name);
  if (value === null) return false;
  const norm = value.toLowerCase();
  return norm === "1" || norm === "true" || norm === "yes" || norm === "on";
}

const PROFILE_ENABLED = envFlag("REZI_BENCH_REZI_PROFILE");
const PROFILE_LOG_PATH = readEnv("REZI_BENCH_REZI_PROFILE_LOG");

export function resetReziPerfSnapshot(core: CorePerfModule): void {
  if (!PROFILE_ENABLED) return;
  core.perfReset?.();
}

export function emitReziPerfSnapshot(
  core: CorePerfModule,
  scenario: string,
  params: Record<string, number | string>,
  config: ScenarioConfig,
  metrics: BenchMetrics,
): void {
  if (!PROFILE_ENABLED) return;
  if (!PROFILE_LOG_PATH) return;
  const snapshot = core.perfSnapshot?.();
  if (snapshot === undefined) return;

  try {
    mkdirSync(dirname(PROFILE_LOG_PATH), { recursive: true });
    appendFileSync(
      PROFILE_LOG_PATH,
      `${JSON.stringify({
        ts: new Date().toISOString(),
        pid: process.pid,
        scenario,
        params,
        config,
        timingMeanMs: metrics.timing.mean,
        timingP95Ms: metrics.timing.p95,
        bytesProduced: metrics.bytesProduced,
        framesProduced: metrics.framesProduced,
        perfSnapshot: snapshot,
      })}\n`,
      "utf8",
    );
  } catch {
    // Profiling is optional and must never affect benchmark execution.
  }
}

