/**
 * Benchmark report formatting.
 *
 * Outputs results as:
 *   - Terminal table (colored, for quick viewing)
 *   - Markdown table (for README / docs)
 *   - JSON (for automated tracking / CI)
 */

import { fmtKb, fmtMs, fmtOps, fmtPercent } from "./measure.js";
import type { BenchResult, Framework } from "./types.js";

// ── Terminal Table ──────────────────────────────────────────────────

function pad(s: string, w: number, align: "left" | "right" = "left"): string {
  if (s.length >= w) return s.slice(0, w);
  const gap = w - s.length;
  return align === "right" ? " ".repeat(gap) + s : s + " ".repeat(gap);
}

const FRAMEWORK_LABELS: Record<Framework, string> = {
  "rezi-native": "Rezi (native)",
  "ink-compat": "Ink-on-Rezi",
  ink: "Ink",
  "terminal-kit": "terminal-kit",
  blessed: "blessed",
  ratatui: "Ratatui (Rust)",
};

export function printTerminalTable(results: readonly BenchResult[]): void {
  // Group by scenario+params
  const groups = new Map<string, BenchResult[]>();
  for (const r of results) {
    const paramStr = Object.entries(r.params)
      .map(([k, v]) => `${k}=${v}`)
      .join(",");
    const key = paramStr ? `${r.scenario} (${paramStr})` : r.scenario;
    const arr = groups.get(key) ?? [];
    arr.push(r);
    groups.set(key, arr);
  }

  for (const [group, items] of groups) {
    console.log(`\n  ${group}`);
    console.log(`  ${"─".repeat(98)}`);
    const header = [
      pad("Framework", 16),
      pad("Mean", 12, "right"),
      pad("p95", 12, "right"),
      pad("p99", 12, "right"),
      pad("ops/s", 14, "right"),
      pad("RSS", 10, "right"),
      pad("Heap", 10, "right"),
      pad("CPU", 12, "right"),
      pad("CV", 8, "right"),
    ].join("");
    console.log(`  ${header}`);
    console.log(`  ${"─".repeat(98)}`);

    const order: Framework[] = [
      "rezi-native",
      "ink-compat",
      "ink",
      "terminal-kit",
      "blessed",
      "ratatui",
    ];
    const sorted = [...items].sort(
      (a, b) => order.indexOf(a.framework) - order.indexOf(b.framework),
    );

    const baseline = sorted[0]?.metrics.timing.mean ?? 1;

    for (const r of sorted) {
      const m = r.metrics;
      const speedup =
        r.framework === sorted[0]?.framework
          ? ""
          : ` (${(m.timing.mean / baseline).toFixed(1)}x slower)`;
      const row = [
        pad(FRAMEWORK_LABELS[r.framework] ?? r.framework, 16),
        pad(fmtMs(m.timing.mean), 12, "right"),
        pad(fmtMs(m.timing.p95), 12, "right"),
        pad(fmtMs(m.timing.p99), 12, "right"),
        pad(fmtOps(m.opsPerSec), 14, "right"),
        pad(fmtKb(m.memPeak.rssKb), 10, "right"),
        pad(fmtKb(m.memPeak.heapUsedKb), 10, "right"),
        pad(fmtMs(m.cpu.userMs + m.cpu.systemMs), 12, "right"),
        pad(fmtPercent(m.timing.cv), 8, "right"),
      ].join("");

      console.log(`  ${row}${speedup}`);
    }
  }
  console.log();
}

// ── Markdown Table ──────────────────────────────────────────────────

export function toMarkdown(results: readonly BenchResult[]): string {
  const lines: string[] = [];
  lines.push("# Benchmark Results\n");
  lines.push(
    `> Node ${results[0]?.nodeVersion ?? "?"} | ${results[0]?.platform ?? "?"} ${results[0]?.arch ?? "?"} | ${results[0]?.timestamp ?? ""}\n`,
  );

  // Group by scenario+params
  const groups = new Map<string, BenchResult[]>();
  for (const r of results) {
    const paramStr = Object.entries(r.params)
      .map(([k, v]) => `${k}=${v}`)
      .join(", ");
    const key = paramStr ? `${r.scenario} (${paramStr})` : r.scenario;
    const arr = groups.get(key) ?? [];
    arr.push(r);
    groups.set(key, arr);
  }

  for (const [group, items] of groups) {
    lines.push(`## ${group}\n`);
    lines.push(
      "| Framework | Mean | p95 | p99 | ops/s | Peak RSS | Peak Heap | CPU | Stability (CV) |",
    );
    lines.push("|---|---:|---:|---:|---:|---:|---:|---:|---:|");

    const order: Framework[] = [
      "rezi-native",
      "ink-compat",
      "ink",
      "terminal-kit",
      "blessed",
      "ratatui",
    ];
    const sorted = [...items].sort(
      (a, b) => order.indexOf(a.framework) - order.indexOf(b.framework),
    );

    for (const r of sorted) {
      const m = r.metrics;
      lines.push(
        `| ${FRAMEWORK_LABELS[r.framework]} | ${fmtMs(m.timing.mean)} | ${fmtMs(m.timing.p95)} | ${fmtMs(m.timing.p99)} | ${fmtOps(m.opsPerSec)} | ${fmtKb(m.memPeak.rssKb)} | ${fmtKb(m.memPeak.heapUsedKb)} | ${fmtMs(m.cpu.userMs + m.cpu.systemMs)} | ${fmtPercent(m.timing.cv)} |`,
      );
    }
    lines.push("");
  }

  // Summary: relative performance (ratio = other / rezi; >1 means rezi is faster)
  lines.push("## Relative Performance (vs Rezi native)\n");
  lines.push(
    '> "Xx slower" = Rezi native is X times faster. "Xx faster" = other framework is faster.\n',
  );

  // Determine which frameworks have results
  const allFws: Framework[] = ["ink", "ink-compat", "terminal-kit", "blessed", "ratatui"];
  const presentFws = allFws.filter((fw) =>
    [...groups.values()].some((items) => items.some((r) => r.framework === fw)),
  );

  const headerCols = presentFws.map((fw) => FRAMEWORK_LABELS[fw]);
  lines.push(`| Scenario | ${headerCols.join(" | ")} |`);
  lines.push(`|---|${presentFws.map(() => "---:").join("|")}|`);

  for (const [group, items] of groups) {
    const nativeResult = items.find((r) => r.framework === "rezi-native");
    const nativeMean = nativeResult?.metrics.timing.mean ?? 0;

    const fmtRatio = (fw: Framework) => {
      const other = items.find((r) => r.framework === fw);
      if (!other || nativeMean <= 0) return "N/A";
      const ratio = other.metrics.timing.mean / nativeMean;
      return ratio >= 1 ? `${ratio.toFixed(1)}x slower` : `${(1 / ratio).toFixed(1)}x faster`;
    };

    const cols = presentFws.map(fmtRatio);
    lines.push(`| ${group} | ${cols.join(" | ")} |`);
  }

  lines.push("\n## Memory Comparison\n");
  lines.push("| Scenario | Framework | Peak RSS | Peak Heap | Mem Growth |");
  lines.push("|---|---|---:|---:|---:|");

  for (const [group, items] of groups) {
    for (const r of items) {
      const m = r.metrics;
      const growth = m.memAfter.rssKb - m.memBefore.rssKb;
      const growthStr =
        growth > 0 ? `+${fmtKb(growth)}` : growth < 0 ? `-${fmtKb(Math.abs(growth))}` : "0KB";
      lines.push(
        `| ${group} | ${FRAMEWORK_LABELS[r.framework]} | ${fmtKb(m.memPeak.rssKb)} | ${fmtKb(m.memPeak.heapUsedKb)} | ${growthStr} |`,
      );
    }
  }

  return `${lines.join("\n")}\n`;
}

// ── JSON ────────────────────────────────────────────────────────────

export function toJSON(results: readonly BenchResult[]): string {
  return JSON.stringify(results, null, 2);
}
