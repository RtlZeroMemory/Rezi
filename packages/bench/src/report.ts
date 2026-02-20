/**
 * Benchmark report formatting.
 *
 * Outputs results as:
 *   - Terminal table (quick viewing)
 *   - Markdown report (artifacts/docs)
 *   - JSON
 */

import { computeStats, fmtKb, fmtMs, fmtOps } from "./measure.js";
import type { BenchMetrics, BenchResult, BenchRun, Framework, MemorySnapshot } from "./types.js";

function fmtCi95(lowMs: number, highMs: number): string {
  if (!Number.isFinite(lowMs) || !Number.isFinite(highMs)) return "n/a";
  if (lowMs === 0 && highMs === 0) return "n/a";
  return `${fmtMs(lowMs)}–${fmtMs(highMs)}`;
}

function fmtKbOpt(kb: number | null): string {
  return kb === null ? "n/a" : fmtKb(kb);
}

function avg(nums: readonly number[]): number {
  if (nums.length === 0) return 0;
  return nums.reduce((a, b) => a + b, 0) / nums.length;
}

function avgNullable(nums: readonly (number | null)[]): number | null {
  const values = nums.filter((n): n is number => n !== null);
  if (values.length === 0) return null;
  return avg(values);
}

function maxNullable(nums: readonly (number | null)[]): number | null {
  const values = nums.filter((n): n is number => n !== null);
  if (values.length === 0) return null;
  return Math.max(...values);
}

function avgMem(rows: readonly MemorySnapshot[]): MemorySnapshot {
  return {
    rssKb: avg(rows.map((r) => r.rssKb)),
    heapUsedKb: avgNullable(rows.map((r) => r.heapUsedKb)),
    heapTotalKb: avgNullable(rows.map((r) => r.heapTotalKb)),
    externalKb: avgNullable(rows.map((r) => r.externalKb)),
    arrayBuffersKb: avgNullable(rows.map((r) => r.arrayBuffersKb)),
  };
}

function maxMem(rows: readonly MemorySnapshot[]): MemorySnapshot {
  return {
    rssKb: Math.max(...rows.map((r) => r.rssKb)),
    heapUsedKb: maxNullable(rows.map((r) => r.heapUsedKb)),
    heapTotalKb: maxNullable(rows.map((r) => r.heapTotalKb)),
    externalKb: maxNullable(rows.map((r) => r.externalKb)),
    arrayBuffersKb: maxNullable(rows.map((r) => r.arrayBuffersKb)),
  };
}

interface AggregatedBenchResult {
  scenario: string;
  framework: Framework;
  params: Record<string, number | string>;
  metrics: BenchMetrics;
  replicateStats: ReturnType<typeof computeStats>;
  runs: readonly BenchResult[];
}

const FRAMEWORK_ORDER: Framework[] = [
  "rezi-native",
  "ink",
  "opentui",
  "bubbletea",
  "terminal-kit",
  "blessed",
  "ratatui",
];

const FRAMEWORK_LABELS: Record<Framework, string> = {
  "rezi-native": "Rezi (native)",
  "ink-compat": "Ink-Compat (removed)",
  ink: "Ink",
  opentui: "OpenTUI",
  bubbletea: "Bubble Tea (Go)",
  "terminal-kit": "terminal-kit",
  blessed: "blessed",
  ratatui: "Ratatui (Rust)",
};

function scenarioKeyFromParts(scenario: string, params: Record<string, number | string>): string {
  const paramStr = Object.entries(params)
    .map(([k, v]) => `${k}=${v}`)
    .join(",");
  return paramStr ? `${scenario} (${paramStr})` : scenario;
}

function scenarioKey(r: Pick<BenchResult, "scenario" | "params">): string {
  return scenarioKeyFromParts(r.scenario, r.params);
}

function aggregateFrameworkRuns(runs: readonly BenchResult[]): AggregatedBenchResult {
  const first = runs[0];
  if (!first) {
    throw new Error("aggregateFrameworkRuns requires at least one run");
  }

  if (runs.length === 1) {
    const only = first;
    return {
      scenario: only.scenario,
      framework: only.framework,
      params: only.params,
      metrics: only.metrics,
      replicateStats: computeStats([only.metrics.timing.mean]),
      runs,
    };
  }

  const timingMeans = runs.map((r) => r.metrics.timing.mean);
  const timing = computeStats(timingMeans);
  const memBefore = avgMem(runs.map((r) => r.metrics.memBefore));
  const memAfter = avgMem(runs.map((r) => r.metrics.memAfter));
  const memPeak = maxMem(runs.map((r) => r.metrics.memPeak));

  const metrics: BenchMetrics = {
    timing,
    memBefore,
    memAfter,
    memPeak,
    rssGrowthKb: avg(runs.map((r) => r.metrics.rssGrowthKb)),
    heapUsedGrowthKb: avgNullable(runs.map((r) => r.metrics.heapUsedGrowthKb)),
    rssSlopeKbPerIter: avgNullable(runs.map((r) => r.metrics.rssSlopeKbPerIter)),
    heapUsedSlopeKbPerIter: avgNullable(runs.map((r) => r.metrics.heapUsedSlopeKbPerIter)),
    memStable: runs.every((r) => r.metrics.memStable === true)
      ? true
      : runs.every((r) => r.metrics.memStable === false)
        ? false
        : null,
    cpu: {
      userMs: avg(runs.map((r) => r.metrics.cpu.userMs)),
      systemMs: avg(runs.map((r) => r.metrics.cpu.systemMs)),
    },
    iterations: Math.round(avg(runs.map((r) => r.metrics.iterations))),
    totalWallMs: avg(runs.map((r) => r.metrics.totalWallMs)),
    opsPerSec: avg(runs.map((r) => r.metrics.opsPerSec)),
    framesProduced: Math.round(avg(runs.map((r) => r.metrics.framesProduced))),
    bytesProduced: avg(runs.map((r) => r.metrics.bytesProduced)),
    ptyBytesObserved: avgNullable(runs.map((r) => r.metrics.ptyBytesObserved)),
  };

  return {
    scenario: first.scenario,
    framework: first.framework,
    params: first.params,
    metrics,
    replicateStats: computeStats(timingMeans),
    runs,
  };
}

function aggregateResultsByScenario(
  results: readonly BenchResult[],
): Map<string, readonly AggregatedBenchResult[]> {
  const byScenario = new Map<string, Map<Framework, BenchResult[]>>();

  for (const r of results) {
    const key = scenarioKey(r);
    const byFramework = byScenario.get(key) ?? new Map<Framework, BenchResult[]>();
    const rows = byFramework.get(r.framework) ?? [];
    rows.push(r);
    byFramework.set(r.framework, rows);
    byScenario.set(key, byFramework);
  }

  const out = new Map<string, readonly AggregatedBenchResult[]>();
  for (const [key, byFramework] of byScenario) {
    const rows = [...byFramework.entries()]
      .map(([, runs]) => aggregateFrameworkRuns(runs))
      .sort((a, b) => FRAMEWORK_ORDER.indexOf(a.framework) - FRAMEWORK_ORDER.indexOf(b.framework));
    out.set(key, rows);
  }
  return out;
}

type RatioSummary = Readonly<{
  mean: number;
  low: number;
  high: number;
  significant: boolean;
}>;

function ratioVsBaseline(
  baseline: AggregatedBenchResult,
  other: AggregatedBenchResult,
): RatioSummary | null {
  const base = baseline.metrics.timing;
  const cmp = other.metrics.timing;
  if (base.mean <= 0 || base.meanCi95Low <= 0 || base.meanCi95High <= 0) return null;
  if (cmp.mean <= 0 || cmp.meanCi95Low <= 0 || cmp.meanCi95High <= 0) return null;

  const mean = cmp.mean / base.mean;
  const low = cmp.meanCi95Low / base.meanCi95High;
  const high = cmp.meanCi95High / base.meanCi95Low;
  const significant = low > 1 || high < 1;
  return { mean, low, high, significant };
}

function ratioText(summary: RatioSummary): string {
  const band = `[${summary.low.toFixed(1)}x, ${summary.high.toFixed(1)}x]`;
  if (summary.mean >= 1) {
    return summary.significant
      ? `${summary.mean.toFixed(1)}x slower ${band}`
      : `${summary.mean.toFixed(1)}x slower ${band} (inconclusive)`;
  }
  const invMean = 1 / summary.mean;
  const invLow = 1 / summary.high;
  const invHigh = 1 / summary.low;
  return summary.significant
    ? `${invMean.toFixed(1)}x faster [${invLow.toFixed(1)}x, ${invHigh.toFixed(1)}x]`
    : `${invMean.toFixed(1)}x faster [${invLow.toFixed(1)}x, ${invHigh.toFixed(1)}x] (inconclusive)`;
}

// ── Terminal Table ──────────────────────────────────────────────────

function pad(s: string, w: number, align: "left" | "right" = "left"): string {
  if (s.length >= w) return s.slice(0, w);
  const gap = w - s.length;
  return align === "right" ? " ".repeat(gap) + s : s + " ".repeat(gap);
}

export function printTerminalTable(results: readonly BenchResult[]): void {
  const groups = aggregateResultsByScenario(results);

  for (const [group, items] of groups) {
    console.log(`\n  ${group}`);
    console.log(`  ${"─".repeat(132)}`);
    const header = [
      pad("Framework", 16),
      pad("Runs", 7, "right"),
      pad("Mean", 12, "right"),
      pad("Run CV", 10, "right"),
      pad("Mean CI95", 18, "right"),
      pad("ops/s", 14, "right"),
      pad("Wall", 12, "right"),
      pad("CPU (u+s)", 12, "right"),
      pad("RSS", 10, "right"),
      pad("Heap", 10, "right"),
      pad("Bytes", 11, "right"),
      pad("PTY Bytes", 12, "right"),
    ].join("");
    console.log(`  ${header}`);
    console.log(`  ${"─".repeat(132)}`);

    const baseline = items.find((r) => r.framework === "rezi-native") ?? items[0];
    const baselineMean = baseline?.metrics.timing.mean ?? 1;

    for (const r of items) {
      const m = r.metrics;
      const speedup =
        r.framework === baseline?.framework
          ? ""
          : ` (${(m.timing.mean / baselineMean).toFixed(1)}x slower)`;
      const bytesPerFrameKb = m.bytesProduced / Math.max(1, m.framesProduced) / 1024;
      const row = [
        pad(FRAMEWORK_LABELS[r.framework] ?? r.framework, 16),
        pad(String(r.runs.length), 7, "right"),
        pad(fmtMs(m.timing.mean), 12, "right"),
        pad(`${(r.replicateStats.cv * 100).toFixed(1)}%`, 10, "right"),
        pad(fmtCi95(m.timing.meanCi95Low, m.timing.meanCi95High), 18, "right"),
        pad(fmtOps(m.opsPerSec), 14, "right"),
        pad(fmtMs(m.totalWallMs), 12, "right"),
        pad(fmtMs(m.cpu.userMs + m.cpu.systemMs), 12, "right"),
        pad(fmtKb(m.memPeak.rssKb), 10, "right"),
        pad(fmtKbOpt(m.memPeak.heapUsedKb), 10, "right"),
        pad(fmtKb(bytesPerFrameKb), 11, "right"),
        pad(m.ptyBytesObserved === null ? "n/a" : fmtKb(m.ptyBytesObserved / 1024), 12, "right"),
      ].join("");

      console.log(`  ${row}${speedup}`);
    }
  }
  console.log();
}

// ── Markdown Table ──────────────────────────────────────────────────

export function toMarkdown(run: BenchRun): string {
  const { meta, invocation, results } = run;
  const lines: string[] = [];
  lines.push("# Benchmark Results\n");
  lines.push(
    `> ${meta.timestamp} | Node ${meta.nodeVersion} | Bun ${meta.bunVersion ?? "n/a"} | rustc ${meta.rustcVersion ?? "n/a"} | cargo ${meta.cargoVersion ?? "n/a"} | ${meta.osType} ${meta.osRelease} | ${meta.platform} ${meta.arch} | ${meta.cpuModel} (${meta.cpuCores} cores) | RAM ${meta.memoryTotalMb}MB | governor=${meta.cpuGovernor ?? "n/a"} | wsl=${meta.isWsl ? "yes" : "no"}\n`,
  );
  lines.push(
    `> Invocation: suite=${invocation.suite} matchup=${invocation.matchup} scenario=${invocation.scenarioFilter ?? "all"} framework=${invocation.frameworkFilter ?? "all"} warmup=${invocation.warmupOverride ?? "default"} iterations=${invocation.iterationsOverride ?? "default"} quick=${invocation.quick ? "yes" : "no"} io=${invocation.ioMode} opentuiDriver=${invocation.opentuiDriver} replicates=${invocation.replicates} discardFirstReplicate=${invocation.discardFirstReplicate ? "yes" : "no"} shuffleFrameworkOrder=${invocation.shuffleFrameworkOrder ? "yes" : "no"} shuffleSeed=${invocation.shuffleSeed} envCheck=${invocation.envCheck} cpuAffinity=${invocation.cpuAffinity ?? "none"}\n`,
  );

  const groups = aggregateResultsByScenario(results);

  for (const [group, items] of groups) {
    lines.push(`## ${group}\n`);
    lines.push(
      "| Framework | Runs | Mean | Run CV | Mean CI95 | ops/s | Wall | CPU user | CPU sys | Peak RSS | Peak Heap | Bytes | PTY Bytes |",
    );
    lines.push("|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|");

    for (const r of items) {
      const m = r.metrics;
      lines.push(
        `| ${FRAMEWORK_LABELS[r.framework]} | ${r.runs.length} | ${fmtMs(m.timing.mean)} | ${(r.replicateStats.cv * 100).toFixed(1)}% | ${fmtCi95(m.timing.meanCi95Low, m.timing.meanCi95High)} | ${fmtOps(m.opsPerSec)} | ${fmtMs(m.totalWallMs)} | ${fmtMs(m.cpu.userMs)} | ${fmtMs(m.cpu.systemMs)} | ${fmtKb(m.memPeak.rssKb)} | ${fmtKbOpt(m.memPeak.heapUsedKb)} | ${fmtKb(m.bytesProduced / 1024)} | ${m.ptyBytesObserved === null ? "n/a" : fmtKb(m.ptyBytesObserved / 1024)} |`,
      );
    }
    lines.push("");
  }

  lines.push("## Relative Performance (vs Rezi native)\n");
  lines.push(
    '> Includes ratio confidence bands from each framework mean CI. Rows marked "(inconclusive)" have CIs overlapping parity.\n',
  );

  const allFws: Framework[] = ["ink", "opentui", "terminal-kit", "blessed", "ratatui"];
  const presentFws = allFws.filter((fw) =>
    [...groups.values()].some((items) => items.some((r) => r.framework === fw)),
  );

  const headerCols = presentFws.map((fw) => FRAMEWORK_LABELS[fw]);
  lines.push(`| Scenario | ${headerCols.join(" | ")} |`);
  lines.push(`|---|${presentFws.map(() => "---:").join("|")}|`);

  for (const [group, items] of groups) {
    const nativeResult = items.find((r) => r.framework === "rezi-native");
    const cols = presentFws.map((fw) => {
      if (!nativeResult) return "N/A";
      const other = items.find((r) => r.framework === fw);
      if (!other) return "N/A";
      const ratio = ratioVsBaseline(nativeResult, other);
      if (!ratio) return "N/A";
      return ratioText(ratio);
    });
    lines.push(`| ${group} | ${cols.join(" | ")} |`);
  }

  lines.push("\n## Memory Comparison\n");
  lines.push(
    "| Scenario | Framework | Peak RSS | Peak Heap | RSS Growth | Heap Growth | RSS Slope | Stable |",
  );
  lines.push("|---|---|---:|---:|---:|---:|---:|---:|");

  for (const [group, items] of groups) {
    for (const r of items) {
      const m = r.metrics;
      const rssGrowth = m.rssGrowthKb;
      const heapGrowth = m.heapUsedGrowthKb;
      const rssGrowthStr =
        rssGrowth > 0
          ? `+${fmtKb(rssGrowth)}`
          : rssGrowth < 0
            ? `-${fmtKb(Math.abs(rssGrowth))}`
            : "0KB";
      const heapGrowthStr =
        heapGrowth === null
          ? "n/a"
          : heapGrowth > 0
            ? `+${fmtKb(heapGrowth)}`
            : heapGrowth < 0
              ? `-${fmtKb(Math.abs(heapGrowth))}`
              : "0KB";
      const slope =
        m.rssSlopeKbPerIter === null ? "N/A" : `${m.rssSlopeKbPerIter.toFixed(4)} KB/iter`;
      const stable = m.memStable === null ? "N/A" : m.memStable ? "yes" : "no";
      lines.push(
        `| ${group} | ${FRAMEWORK_LABELS[r.framework]} | ${fmtKb(m.memPeak.rssKb)} | ${fmtKbOpt(m.memPeak.heapUsedKb)} | ${rssGrowthStr} | ${heapGrowthStr} | ${slope} | ${stable} |`,
      );
    }
  }

  return `${lines.join("\n")}\n`;
}

// ── JSON ────────────────────────────────────────────────────────────

export function toJSON(run: BenchRun): string {
  return `${JSON.stringify(run, null, 2)}\n`;
}
