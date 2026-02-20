/**
 * Benchmark suite types.
 *
 * Covers timing, memory, CPU, and stability metrics for comparing
 * Rezi native, Ink, OpenTUI, and other terminal rendering pipelines.
 */

// ── Metric Primitives ──────────────────────────────────────────────

export interface TimingStats {
  /** Sample count */
  n: number;
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
  /**
   * 95% bootstrap confidence interval for the mean (ms).
   * Deterministic (seeded) so the same samples produce the same interval.
   */
  meanCi95Low: number;
  meanCi95High: number;
}

export interface MemorySnapshot {
  rssKb: number;
  heapUsedKb: number | null;
  heapTotalKb: number | null;
  externalKb: number | null;
  arrayBuffersKb: number | null;
}

export type NodeMemorySnapshot = Readonly<{
  rssKb: number;
  heapUsedKb: number;
  heapTotalKb: number;
  externalKb: number;
  arrayBuffersKb: number;
}>;

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
  /** RSS growth during the measured loop (KB). */
  rssGrowthKb: number;
  /** heapUsed growth during the measured loop (KB). */
  heapUsedGrowthKb: number | null;
  /**
   * Estimated memory growth slope (KB / iteration), if the scenario collects samples.
   * `null` if not measured.
   */
  rssSlopeKbPerIter: number | null;
  /** See rssSlopeKbPerIter. */
  heapUsedSlopeKbPerIter: number | null;
  /** True/false if slope is evaluated against a stability threshold, else null. */
  memStable: boolean | null;
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
  /**
   * PTY bytes observed by the parent process for this run (if measured).
   * Useful when framework-local byte counters are unavailable.
   */
  ptyBytesObserved: number | null;
}

// ── Result Envelope ────────────────────────────────────────────────

export type Framework =
  | "ink"
  /** Deprecated: kept for historical result compatibility; not part of active suite. */
  | "ink-compat"
  | "rezi-native"
  | "opentui"
  | "bubbletea"
  | "terminal-kit"
  | "blessed"
  | "ratatui";

export interface BenchResult {
  scenario: string;
  framework: Framework;
  params: Record<string, number | string>;
  metrics: BenchMetrics;
  /** 0-based replicate index for this scenario/framework/params run. */
  replicate: number;
  timestamp: string;
  nodeVersion: string;
  platform: string;
  arch: string;
}

export interface BenchMeta {
  timestamp: string;
  nodeVersion: string;
  platform: string;
  arch: string;
  osType: string;
  osRelease: string;
  cpuModel: string;
  cpuCores: number;
  memoryTotalMb: number;
  bunVersion: string | null;
  rustcVersion: string | null;
  cargoVersion: string | null;
  cpuGovernor: string | null;
  isWsl: boolean;
}

export interface BenchInvocation {
  suite: "all" | "terminal";
  matchup: "none" | "rezi-opentui" | "rezi-opentui-bubbletea";
  opentuiDriver: "react" | "core";
  scenarioFilter: string | null;
  frameworkFilter: Framework | null;
  iterationsOverride: number | null;
  warmupOverride: number | null;
  quick: boolean;
  ioMode: "stub" | "pty";
  replicates: number;
  discardFirstReplicate: boolean;
  shuffleFrameworkOrder: boolean;
  shuffleSeed: string;
  envCheck: "off" | "warn" | "strict";
  cpuAffinity: string | null;
}

export interface BenchRun {
  meta: BenchMeta;
  invocation: BenchInvocation;
  results: BenchResult[];
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
