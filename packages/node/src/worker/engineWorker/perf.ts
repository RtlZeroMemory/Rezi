import type { PerfSample } from "./shared.js";

const PERF_MAX_SAMPLES = 1024;

export type PerfSnapshot = {
  phases: Record<
    string,
    {
      count: number;
      avg: number;
      p50: number;
      p95: number;
      p99: number;
      max: number;
      worst10: number[];
    }
  >;
};

export function perfRecord(
  enabled: boolean,
  perfSamples: PerfSample[],
  phase: string,
  durationMs: number,
): void {
  if (!enabled) return;
  if (perfSamples.length >= PERF_MAX_SAMPLES) {
    perfSamples.shift();
  }
  perfSamples.push({ phase, durationMs });
}

export function perfSnapshot(perfSamples: readonly PerfSample[]): PerfSnapshot {
  const byPhase = new Map<string, number[]>();
  for (const sample of perfSamples) {
    let arr = byPhase.get(sample.phase);
    if (!arr) {
      arr = [];
      byPhase.set(sample.phase, arr);
    }
    arr.push(sample.durationMs);
  }

  const phases: PerfSnapshot["phases"] = {};
  for (const [phase, samples] of byPhase) {
    const sorted = [...samples].sort((a, b) => a - b);
    const sum = sorted.reduce((acc, value) => acc + value, 0);
    const p50Idx = Math.min(sorted.length - 1, Math.floor(sorted.length * 0.5));
    const p95Idx = Math.min(sorted.length - 1, Math.floor(sorted.length * 0.95));
    const p99Idx = Math.min(sorted.length - 1, Math.floor(sorted.length * 0.99));
    const worst10Start = Math.max(0, sorted.length - 10);
    const worst10 = sorted.slice(worst10Start).reverse();
    phases[phase] = {
      count: sorted.length,
      avg: sorted.length > 0 ? sum / sorted.length : 0,
      p50: sorted[p50Idx] ?? 0,
      p95: sorted[p95Idx] ?? 0,
      p99: sorted[p99Idx] ?? 0,
      max: sorted[sorted.length - 1] ?? 0,
      worst10,
    };
  }

  return { phases };
}
