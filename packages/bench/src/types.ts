/**
 * Benchmark suite types.
 *
 * Covers timing, memory, CPU, and stability metrics for comparing
 * Rezi native, ink-compat, Ink, and terminal-kit rendering pipelines.
 */

// ── Metric Primitives ──────────────────────────────────────────────

export interface TimingStats {
  /** Arithmetic mean (ms) */
  mean: number;
  /** Median / p50 (ms) */
  median: number;
  /** 95th percentile (ms) */
  p95: number;
  /** 99th percentile (ms) */
  p99: number;
  /** Minimum observed (ms) */
  min: number;
  /** Maximum observed (ms) */
  max: number;
  /** Standard deviation (ms) */
  stddev: number;
  /** Coefficient of variation (stddev / mean). Lower = more stable. */
  cv: number;
}

export interface MemorySnapshot {
  rssKb: number;
  heapUsedKb: number;
  heapTotalKb: number;
  externalKb: number;
  arrayBuffersKb: number;
}

export interface CpuUsage {
  userMs: number;
  systemMs: number;
}

// ── Aggregated Bench Metrics ───────────────────────────────────────

export interface BenchMetrics {
  /** Per-iteration timing distribution */
  timing: TimingStats;
  /** Memory before the measured loop */
  memBefore: MemorySnapshot;
  /** Memory after the measured loop */
  memAfter: MemorySnapshot;
  /** Peak memory observed during the loop */
  memPeak: MemorySnapshot;
  /** CPU time consumed by the measured loop */
  cpu: CpuUsage;
  /** Number of measured iterations (excludes warmup) */
  iterations: number;
  /** Total wall-clock time for the measured loop (ms) */
  totalWallMs: number;
  /** Operations per second */
  opsPerSec: number;
  /** Frames or writes delivered (for async pipelines) */
  framesProduced: number;
  /** Total bytes produced (drawlist or ANSI) */
  bytesProduced: number;
}

// ── Result Envelope ────────────────────────────────────────────────

export type Framework =
  | "ink"
  | "ink-compat"
  | "rezi-native"
  | "terminal-kit"
  | "blessed"
  | "ratatui";

export interface BenchResult {
  scenario: string;
  framework: Framework;
  params: Record<string, number | string>;
  metrics: BenchMetrics;
  timestamp: string;
  nodeVersion: string;
  platform: string;
  arch: string;
}

// ── Scenario Interface ─────────────────────────────────────────────

export interface ScenarioConfig {
  /** Warmup iterations (discarded) */
  warmup: number;
  /** Measured iterations */
  iterations: number;
}

export interface Scenario {
  name: string;
  description: string;
  defaultConfig: ScenarioConfig;
  /** Parameter sets to sweep (e.g. different tree sizes). Empty = run once. */
  paramSets: ReadonlyArray<Record<string, number | string>>;
  /** Which frameworks this scenario supports. */
  frameworks: readonly Framework[];
  /** Execute the scenario and return metrics. */
  run(
    framework: Framework,
    config: ScenarioConfig,
    params: Record<string, number | string>,
  ): Promise<BenchMetrics>;
}
