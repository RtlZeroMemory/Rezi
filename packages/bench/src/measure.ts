/**
 * Measurement utilities: timing statistics, memory & CPU snapshots, formatting.
 */

import type {
  BenchMetrics,
  CpuUsage,
  MemorySnapshot,
  NodeMemorySnapshot,
  TimingStats,
} from "./types.js";

// ── Statistics ──────────────────────────────────────────────────────

function xorshift32(seed: number): () => number {
  let x = seed >>> 0;
  return () => {
    // xorshift32
    x ^= x << 13;
    x ^= x >>> 17;
    x ^= x << 5;
    // Normalize to [0, 1)
    return (x >>> 0) / 0x1_0000_0000;
  };
}

function percentile(sorted: readonly number[], p: number): number {
  if (sorted.length === 0) return 0;
  const idx = Math.min(Math.max(Math.floor(p * sorted.length), 0), sorted.length - 1);
  return sorted[idx] ?? 0;
}

function bootstrapMeanCi95(samples: readonly number[]): { low: number; high: number } {
  const n = samples.length;
  if (n < 2) {
    const m = samples[0] ?? 0;
    return { low: m, high: m };
  }

  // Deterministic bootstrap (fixed seed) so CI is reproducible.
  const rnd = xorshift32(0x6b33_17f5);
  const resamples = Math.min(2000, Math.max(500, Math.floor(200_000 / n))); // budgeted O(resamples*n)
  const means: number[] = [];
  means.length = resamples;

  for (let r = 0; r < resamples; r++) {
    let sum = 0;
    for (let i = 0; i < n; i++) {
      const j = Math.floor(rnd() * n);
      sum += samples[j] ?? 0;
    }
    means[r] = sum / n;
  }

  means.sort((a, b) => a - b);
  const low = percentile(means, 0.025);
  const high = percentile(means, 0.975);
  return { low, high };
}

export function computeStats(samples: readonly number[]): TimingStats {
  if (samples.length === 0) {
    return {
      n: 0,
      mean: 0,
      median: 0,
      p95: 0,
      p99: 0,
      min: 0,
      max: 0,
      stddev: 0,
      cv: 0,
      meanCi95Low: 0,
      meanCi95High: 0,
    };
  }
  const sorted = [...samples].sort((a, b) => a - b);
  const n = sorted.length;
  const valueAt = (index: number) => sorted[index] ?? 0;
  const sum = sorted.reduce((a, b) => a + b, 0);
  const mean = sum / n;

  const mid = Math.floor(n / 2);
  const median = n % 2 === 0 ? (valueAt(mid - 1) + valueAt(mid)) / 2 : valueAt(mid);

  const p95 = valueAt(Math.min(Math.ceil(n * 0.95) - 1, n - 1));
  const p99 = valueAt(Math.min(Math.ceil(n * 0.99) - 1, n - 1));
  const min = valueAt(0);
  const max = valueAt(n - 1);

  const variance = sorted.reduce((acc, v) => acc + (v - mean) ** 2, 0) / n;
  const stddev = Math.sqrt(variance);
  const cv = mean > 0 ? stddev / mean : 0;
  const ci = bootstrapMeanCi95(sorted);

  return {
    n,
    mean,
    median,
    p95,
    p99,
    min,
    max,
    stddev,
    cv,
    meanCi95Low: ci.low,
    meanCi95High: ci.high,
  };
}

// ── Snapshots ───────────────────────────────────────────────────────

export function takeMemory(): NodeMemorySnapshot {
  const m = process.memoryUsage();
  return {
    rssKb: Math.round(m.rss / 1024),
    heapUsedKb: Math.round(m.heapUsed / 1024),
    heapTotalKb: Math.round(m.heapTotal / 1024),
    externalKb: Math.round(m.external / 1024),
    arrayBuffersKb: Math.round(m.arrayBuffers / 1024),
  };
}

export function takeCpu(): CpuUsage {
  const c = process.cpuUsage();
  return { userMs: c.user / 1000, systemMs: c.system / 1000 };
}

export function diffCpu(before: CpuUsage, after: CpuUsage): CpuUsage {
  return {
    userMs: after.userMs - before.userMs,
    systemMs: after.systemMs - before.systemMs,
  };
}

export function peakMemory(a: MemorySnapshot, b: MemorySnapshot): MemorySnapshot {
  const maxOpt = (x: number | null, y: number | null): number | null => {
    if (x === null && y === null) return null;
    if (x === null) return y;
    if (y === null) return x;
    return Math.max(x, y);
  };
  return {
    rssKb: Math.max(a.rssKb, b.rssKb),
    heapUsedKb: maxOpt(a.heapUsedKb, b.heapUsedKb),
    heapTotalKb: maxOpt(a.heapTotalKb, b.heapTotalKb),
    externalKb: maxOpt(a.externalKb, b.externalKb),
    arrayBuffersKb: maxOpt(a.arrayBuffersKb, b.arrayBuffersKb),
  };
}

// ── GC ──────────────────────────────────────────────────────────────

export function tryGc(): void {
  if (typeof globalThis.gc === "function") {
    globalThis.gc();
  }
}

// ── Metrics Builder ─────────────────────────────────────────────────

/**
 * Run a synchronous benchmark loop and collect all metrics.
 *
 * @param fn - The function to benchmark. Called with iteration index.
 * @param warmup - Number of warmup iterations (discarded).
 * @param iterations - Number of measured iterations.
 */
export function benchSync(
  fn: (i: number) => void,
  warmup: number,
  iterations: number,
): BenchMetrics {
  // Warmup
  for (let i = 0; i < warmup; i++) fn(i);

  tryGc();
  const memBefore = takeMemory();
  const cpuBefore = takeCpu();
  let memPeak: MemorySnapshot = memBefore;

  const samples: number[] = [];
  const t0 = performance.now();

  for (let i = 0; i < iterations; i++) {
    const ts = performance.now();
    fn(i);
    samples.push(performance.now() - ts);

    // Sample memory every 100 iterations
    if (i % 100 === 99) {
      memPeak = peakMemory(memPeak, takeMemory());
    }
  }

  const totalWallMs = performance.now() - t0;
  const cpuAfter = takeCpu();
  const memAfter = takeMemory();
  memPeak = peakMemory(memPeak, memAfter);

  return {
    timing: computeStats(samples),
    memBefore,
    memAfter,
    memPeak,
    rssGrowthKb: memAfter.rssKb - memBefore.rssKb,
    heapUsedGrowthKb: memAfter.heapUsedKb - memBefore.heapUsedKb,
    rssSlopeKbPerIter: null,
    heapUsedSlopeKbPerIter: null,
    memStable: null,
    cpu: diffCpu(cpuBefore, cpuAfter),
    iterations,
    totalWallMs,
    opsPerSec: iterations / (totalWallMs / 1000),
    framesProduced: iterations,
    bytesProduced: 0,
    ptyBytesObserved: null,
  };
}

/**
 * Run an async benchmark loop and collect all metrics.
 *
 * @param fn - Async function to benchmark. Must resolve when one iteration is complete.
 * @param warmup - Number of warmup iterations.
 * @param iterations - Number of measured iterations.
 */
export async function benchAsync(
  fn: (i: number) => Promise<void>,
  warmup: number,
  iterations: number,
): Promise<BenchMetrics> {
  // Warmup
  for (let i = 0; i < warmup; i++) await fn(i);

  tryGc();
  const memBefore = takeMemory();
  const cpuBefore = takeCpu();
  let memPeak: MemorySnapshot = memBefore;

  const samples: number[] = [];
  const t0 = performance.now();

  for (let i = 0; i < iterations; i++) {
    const ts = performance.now();
    await fn(i);
    samples.push(performance.now() - ts);

    if (i % 100 === 99) {
      memPeak = peakMemory(memPeak, takeMemory());
    }
  }

  const totalWallMs = performance.now() - t0;
  const cpuAfter = takeCpu();
  const memAfter = takeMemory();
  memPeak = peakMemory(memPeak, memAfter);

  return {
    timing: computeStats(samples),
    memBefore,
    memAfter,
    memPeak,
    rssGrowthKb: memAfter.rssKb - memBefore.rssKb,
    heapUsedGrowthKb: memAfter.heapUsedKb - memBefore.heapUsedKb,
    rssSlopeKbPerIter: null,
    heapUsedSlopeKbPerIter: null,
    memStable: null,
    cpu: diffCpu(cpuBefore, cpuAfter),
    iterations,
    totalWallMs,
    opsPerSec: iterations / (totalWallMs / 1000),
    framesProduced: iterations,
    bytesProduced: 0,
    ptyBytesObserved: null,
  };
}

// ── Formatting ──────────────────────────────────────────────────────

export function fmtMs(ms: number): string {
  if (ms < 0.001) return `${(ms * 1_000_000).toFixed(0)}ns`;
  if (ms < 1) return `${(ms * 1000).toFixed(0)}µs`;
  if (ms < 1000) return `${ms.toFixed(2)}ms`;
  return `${(ms / 1000).toFixed(2)}s`;
}

export function fmtKb(kb: number): string {
  const sign = kb < 0 ? "-" : "";
  const abs = Math.abs(kb);
  if (abs < 10) return `${sign}${abs.toFixed(2)}KB`;
  if (abs < 1024) return `${sign}${abs.toFixed(1)}KB`;
  if (abs < 1024 * 1024) return `${sign}${(abs / 1024).toFixed(1)}MB`;
  return `${sign}${(abs / (1024 * 1024)).toFixed(2)}GB`;
}

export function fmtOps(ops: number): string {
  if (ops < 1000) return `${ops.toFixed(0)} ops/s`;
  if (ops < 1_000_000) return `${(ops / 1000).toFixed(1)}K ops/s`;
  return `${(ops / 1_000_000).toFixed(2)}M ops/s`;
}

export function fmtPercent(v: number): string {
  return `${(v * 100).toFixed(1)}%`;
}
