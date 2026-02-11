/**
 * packages/core/src/perf/perf.ts — Lightweight perf instrumentation.
 *
 * Opt-in via REZI_PERF=1 environment variable. Zero-cost when disabled.
 *
 * @see packages/bench/README.md for usage examples
 */

/** Phases tracked by the instrumentation system. */
export type InstrumentationPhase =
  | "event_poll"
  | "event_parse"
  | "schedule_wait"
  | "commit"
  | "layout"
  | "render"
  | "drawlist_build"
  | "submit_frame"
  | "backend_ack"
  // Phase split: frame_build = synchronous TS pipeline (view/commit/layout/render/build),
  // worker_roundtrip = async transport from requestFrame call to backend ack.
  // backend_ack = frame_build + worker_roundtrip (kept for backward compatibility).
  | "frame_build"
  | "worker_roundtrip"
  // Detail-only phases (gated by REZI_PERF_DETAIL=1)
  | "view"
  | "vnode_commit"
  | "layout_indexes"
  | "damage_identity_diff"
  | "metadata_collect"
  | "routing_rebuild"
  | "effects"
  | "backend_request";

export const PERF_PHASES: readonly InstrumentationPhase[] = Object.freeze([
  "event_poll",
  "event_parse",
  "schedule_wait",
  "commit",
  "layout",
  "render",
  "drawlist_build",
  "submit_frame",
  "backend_ack",
  "frame_build",
  "worker_roundtrip",
  // Detail-only phases
  "view",
  "vnode_commit",
  "layout_indexes",
  "damage_identity_diff",
  "metadata_collect",
  "routing_rebuild",
  "effects",
  "backend_request",
]);

/** Statistics for a single phase. */
export type PhaseStats = Readonly<{
  count: number;
  avg: number;
  p50: number;
  p95: number;
  p99: number;
  max: number;
  /** Top 10 worst (highest) samples for spike analysis. */
  worst10: readonly number[];
}>;

/** Aggregated perf snapshot. */
export type PerfSnapshot = Readonly<{
  phases: Readonly<{ [K in InstrumentationPhase]?: PhaseStats }>;
}>;

/** Token returned by markStart for timing correlation. */
export type PerfToken = number;

/**
 * Check if perf mode is enabled.
 * Uses globalThis.process to avoid Node.js imports in core.
 */
export const PERF_ENABLED: boolean = (() => {
  try {
    const g = globalThis as { process?: { env?: { REZI_PERF?: string } } };
    return g.process?.env?.REZI_PERF === "1";
  } catch {
    return false;
  }
})();

/**
 * Check if perf detail mode is enabled.
 * Requires PERF_ENABLED, and uses a separate env var so baseline benches (REZI_PERF=1)
 * are not perturbed by additional instrumentation unless explicitly requested.
 */
export const PERF_DETAIL_ENABLED: boolean = (() => {
  try {
    if (!PERF_ENABLED) return false;
    const g = globalThis as { process?: { env?: { REZI_PERF_DETAIL?: string } } };
    return g.process?.env?.REZI_PERF_DETAIL === "1";
  } catch {
    return false;
  }
})();

/**
 * High-resolution timer function.
 * Falls back to Date.now() if performance.now() is unavailable.
 */
const now: () => number = (() => {
  const g = globalThis as { performance?: { now?: () => number } };
  const perfNow = g.performance?.now;
  if (typeof perfNow === "function") {
    const perf = g.performance;
    return () => {
      const fn = perf?.now;
      return typeof fn === "function" ? fn.call(perf) : Date.now();
    };
  }
  return () => Date.now();
})();

/** Maximum samples kept per phase (ring buffer). */
const RING_CAP = 1024;

/** Ring buffer for a single phase. */
type PhaseRing = {
  samples: Float64Array;
  cursor: number;
  count: number;
  sum: number;
  max: number;
};

function createPhaseRing(): PhaseRing {
  return {
    samples: new Float64Array(RING_CAP),
    cursor: 0,
    count: 0,
    sum: 0,
    max: 0,
  };
}

function recordSample(ring: PhaseRing, dt: number): void {
  // Subtract old value if overwriting
  if (ring.count >= RING_CAP) {
    const old = ring.samples[ring.cursor] ?? 0;
    ring.sum -= old;
  }

  ring.samples[ring.cursor] = dt;
  ring.sum += dt;
  ring.cursor = (ring.cursor + 1) % RING_CAP;
  ring.count = Math.min(ring.count + 1, RING_CAP);

  if (dt > ring.max) {
    ring.max = dt;
  }
}

function computeStats(ring: PhaseRing): PhaseStats | null {
  if (ring.count === 0) return null;

  // Copy active samples
  const arr: number[] = [];
  const n = Math.min(ring.count, RING_CAP);
  for (let i = 0; i < n; i++) {
    const sample = ring.samples[i];
    if (sample !== undefined) arr.push(sample);
  }

  // Sort for percentiles
  arr.sort((a, b) => a - b);

  const p50Idx = Math.min(arr.length - 1, Math.floor(arr.length * 0.5));
  const p95Idx = Math.min(arr.length - 1, Math.floor(arr.length * 0.95));
  const p99Idx = Math.min(arr.length - 1, Math.floor(arr.length * 0.99));

  // Extract worst 10 (highest values, at the end of sorted array)
  const worst10Start = Math.max(0, arr.length - 10);
  const worst10 = Object.freeze(arr.slice(worst10Start).reverse());

  return Object.freeze({
    count: ring.count,
    avg: ring.sum / ring.count,
    p50: arr[p50Idx] ?? 0,
    p95: arr[p95Idx] ?? 0,
    p99: arr[p99Idx] ?? 0,
    max: ring.max,
    worst10,
  });
}

/** Global perf aggregator. */
class PerfAggregator {
  private readonly rings = new Map<InstrumentationPhase, PhaseRing>();
  private pendingStarts = new Map<InstrumentationPhase, number>();

  markStart(phase: InstrumentationPhase): PerfToken {
    const t = now();
    this.pendingStarts.set(phase, t);
    return t;
  }

  markEnd(phase: InstrumentationPhase, token: PerfToken): void {
    const end = now();
    const start = token;
    const dt = end - start;

    let ring = this.rings.get(phase);
    if (!ring) {
      ring = createPhaseRing();
      this.rings.set(phase, ring);
    }
    recordSample(ring, dt);
    this.pendingStarts.delete(phase);
  }

  /** Record a duration directly (for cases where timing is computed elsewhere). */
  record(phase: InstrumentationPhase, durationMs: number): void {
    let ring = this.rings.get(phase);
    if (!ring) {
      ring = createPhaseRing();
      this.rings.set(phase, ring);
    }
    recordSample(ring, durationMs);
  }

  snapshot(): PerfSnapshot {
    const phases: { [K in InstrumentationPhase]?: PhaseStats } = {};
    for (const p of PERF_PHASES) {
      const ring = this.rings.get(p);
      if (ring) {
        const stats = computeStats(ring);
        if (stats) {
          phases[p] = stats;
        }
      }
    }
    return Object.freeze({ phases: Object.freeze(phases) });
  }

  reset(): void {
    this.rings.clear();
    this.pendingStarts.clear();
  }
}

/** Global aggregator instance (only used when PERF_ENABLED). */
let globalAggregator: PerfAggregator | null = null;

function getAggregator(): PerfAggregator {
  if (!globalAggregator) {
    globalAggregator = new PerfAggregator();
  }
  return globalAggregator;
}

/**
 * Get current high-resolution timestamp (same timer as perfMarkStart/markEnd).
 * Returns 0 when perf is disabled.
 */
export function perfNow(): number {
  if (!PERF_ENABLED) return 0;
  return now();
}

/**
 * Mark the start of a phase. Returns a token to pass to markEnd.
 * No-op when perf is disabled.
 */
export function perfMarkStart(phase: InstrumentationPhase): PerfToken {
  if (!PERF_ENABLED) return 0;
  return getAggregator().markStart(phase);
}

/**
 * Mark the end of a phase.
 * No-op when perf is disabled.
 */
export function perfMarkEnd(phase: InstrumentationPhase, token: PerfToken): void {
  if (!PERF_ENABLED) return;
  getAggregator().markEnd(phase, token);
}

/**
 * Record a duration directly for a phase.
 * No-op when perf is disabled.
 */
export function perfRecord(phase: InstrumentationPhase, durationMs: number): void {
  if (!PERF_ENABLED) return;
  getAggregator().record(phase, durationMs);
}

/**
 * Get a snapshot of all collected perf data.
 * Returns empty snapshot when perf is disabled.
 */
export function perfSnapshot(): PerfSnapshot {
  if (!PERF_ENABLED) {
    return Object.freeze({ phases: Object.freeze({}) });
  }
  return getAggregator().snapshot();
}

/**
 * Reset all perf data.
 * No-op when perf is disabled.
 */
export function perfReset(): void {
  if (!PERF_ENABLED) return;
  getAggregator().reset();
}
