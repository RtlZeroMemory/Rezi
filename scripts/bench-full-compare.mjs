#!/usr/bin/env node
/**
 * Compare two full benchmark result sets (historical baseline vs current run).
 *
 * Keyed by: scenario + normalized framework + normalized params.
 * Metrics: timing.mean, timing.p95, opsPerSec, bytesProduced.
 */

import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = fileURLToPath(new URL("..", import.meta.url));
const DEFAULT_BASELINE = join(
  ROOT,
  "benchmarks",
  "2026-02-20-rezi-opentui-react-all-quick-v6",
  "results.json",
);
const DEFAULT_CURRENT = join(ROOT, "out", "bench-current-full", "results.json");
const DEFAULT_REPORT_JSON = join(ROOT, "out", "bench-current-full", "compare-full.json");
const DEFAULT_REPORT_MD = join(ROOT, "out", "bench-current-full", "compare-full.md");

const METRICS = Object.freeze(["timing.mean", "timing.p95", "opsPerSec", "bytesProduced"]);

const FRAMEWORK_ALIASES = Object.freeze({
  opentui: "opentui-core",
});

function die(msg) {
  process.stderr.write(`bench-full-compare: ${msg}\n`);
  process.exit(1);
}

function toRel(absPath) {
  if (!absPath.startsWith(ROOT)) return absPath;
  return absPath.slice(ROOT.length + 1);
}

function parseArgs(argv) {
  const opts = {
    baselinePath: DEFAULT_BASELINE,
    currentPath: DEFAULT_CURRENT,
    reportJsonPath: DEFAULT_REPORT_JSON,
    reportMdPath: DEFAULT_REPORT_MD,
  };

  for (let i = 2; i < argv.length; i++) {
    const arg = argv[i];
    switch (arg) {
      case "--baseline":
        opts.baselinePath = argv[++i] ?? "";
        break;
      case "--current":
        opts.currentPath = argv[++i] ?? "";
        break;
      case "--report-json":
        opts.reportJsonPath = argv[++i] ?? "";
        break;
      case "--report-md":
        opts.reportMdPath = argv[++i] ?? "";
        break;
      case "--help":
      case "-h":
        printHelp();
        process.exit(0);
        break;
      default:
        die(`unknown argument: ${arg}`);
    }
  }

  if (!opts.baselinePath || !opts.currentPath || !opts.reportJsonPath || !opts.reportMdPath) {
    die("--baseline, --current, --report-json, and --report-md require values");
  }
  return opts;
}

function printHelp() {
  process.stdout.write(
    [
      "Usage:",
      "  node scripts/bench-full-compare.mjs [options]",
      "",
      "Options:",
      `  --baseline <path>      Baseline results JSON (default: ${toRel(DEFAULT_BASELINE)})`,
      `  --current <path>       Current results JSON (default: ${toRel(DEFAULT_CURRENT)})`,
      `  --report-json <path>   JSON report output (default: ${toRel(DEFAULT_REPORT_JSON)})`,
      `  --report-md <path>     Markdown report output (default: ${toRel(DEFAULT_REPORT_MD)})`,
      "  --help, -h             Show this help",
      "",
    ].join("\n"),
  );
}

function readJson(path, label) {
  let raw = "";
  try {
    raw = readFileSync(path, "utf8");
  } catch (err) {
    const detail = err instanceof Error ? err.message : String(err);
    die(`${label}: failed to read ${path}\n${detail}`);
  }

  try {
    return JSON.parse(raw);
  } catch (err) {
    const detail = err instanceof Error ? err.message : String(err);
    die(`${label}: failed to parse JSON ${path}\n${detail}`);
  }
}

function isPlainObject(v) {
  return v !== null && typeof v === "object" && !Array.isArray(v);
}

function normalizeFramework(name) {
  const raw = typeof name === "string" ? name : "";
  return FRAMEWORK_ALIASES[raw] ?? raw;
}

function normalizeParams(raw) {
  if (!isPlainObject(raw)) return {};
  const out = {};
  const keys = Object.keys(raw).sort((a, b) => a.localeCompare(b));
  for (const key of keys) {
    const value = raw[key];
    if (
      typeof value === "string" ||
      typeof value === "number" ||
      typeof value === "boolean" ||
      value === null
    ) {
      out[key] = value;
    }
  }
  return out;
}

function stableStringify(value) {
  if (Array.isArray(value)) {
    return `[${value.map((entry) => stableStringify(entry)).join(",")}]`;
  }
  if (isPlainObject(value)) {
    const keys = Object.keys(value).sort();
    return `{${keys.map((k) => `${JSON.stringify(k)}:${stableStringify(value[k])}`).join(",")}}`;
  }
  return JSON.stringify(value);
}

function makeKey(entry) {
  const scenario = typeof entry.scenario === "string" ? entry.scenario : "";
  const framework = normalizeFramework(entry.framework);
  const params = normalizeParams(entry.params);
  return `${scenario}|${framework}|${stableStringify(params)}`;
}

function metricValue(entry, path) {
  const parts = path.split(".");
  let cursor = entry.metrics;
  for (const part of parts) {
    if (!isPlainObject(cursor) || !(part in cursor)) return null;
    cursor = cursor[part];
  }
  return typeof cursor === "number" && Number.isFinite(cursor) ? cursor : null;
}

function pct(delta, baseline) {
  if (baseline === 0) return null;
  return delta / baseline;
}

function compareRuns(baselineRun, currentRun) {
  const baselineResults = Array.isArray(baselineRun.results) ? baselineRun.results : [];
  const currentResults = Array.isArray(currentRun.results) ? currentRun.results : [];

  const baselineByKey = new Map();
  for (const result of baselineResults) {
    baselineByKey.set(makeKey(result), result);
  }
  const currentByKey = new Map();
  for (const result of currentResults) {
    currentByKey.set(makeKey(result), result);
  }

  const allKeys = new Set([...baselineByKey.keys(), ...currentByKey.keys()]);
  const comparisons = [];
  const onlyBaseline = [];
  const onlyCurrent = [];

  for (const key of [...allKeys].sort((a, b) => a.localeCompare(b))) {
    const baseline = baselineByKey.get(key) ?? null;
    const current = currentByKey.get(key) ?? null;
    if (!baseline && current) {
      onlyCurrent.push({
        key,
        scenario: current.scenario,
        framework: normalizeFramework(current.framework),
        params: normalizeParams(current.params),
      });
      continue;
    }
    if (baseline && !current) {
      onlyBaseline.push({
        key,
        scenario: baseline.scenario,
        framework: normalizeFramework(baseline.framework),
        params: normalizeParams(baseline.params),
      });
      continue;
    }
    if (!baseline || !current) continue;

    const scenario = current.scenario;
    const framework = normalizeFramework(current.framework);
    const params = normalizeParams(current.params);
    const metrics = {};
    for (const metric of METRICS) {
      const base = metricValue(baseline, metric);
      const cur = metricValue(current, metric);
      if (base === null || cur === null) {
        metrics[metric] = null;
        continue;
      }
      const delta = cur - base;
      metrics[metric] = {
        baseline: base,
        current: cur,
        delta,
        deltaPct: pct(delta, base),
      };
    }

    comparisons.push({
      key,
      scenario,
      framework,
      params,
      metrics,
    });
  }

  const reziNativeByMean = comparisons
    .filter((entry) => entry.framework === "rezi-native")
    .filter((entry) => entry.metrics["timing.mean"] !== null)
    .sort((a, b) => {
      const deltaA = a.metrics["timing.mean"]?.delta ?? -Infinity;
      const deltaB = b.metrics["timing.mean"]?.delta ?? -Infinity;
      return deltaB - deltaA;
    });

  return {
    summary: {
      baselineCount: baselineResults.length,
      currentCount: currentResults.length,
      comparedCount: comparisons.length,
      onlyBaselineCount: onlyBaseline.length,
      onlyCurrentCount: onlyCurrent.length,
      frameworkAliases: FRAMEWORK_ALIASES,
    },
    comparisons,
    onlyBaseline,
    onlyCurrent,
    topReziNativeMeanRegressions: reziNativeByMean.slice(0, 5),
  };
}

function fmtNum(v, digits = 6) {
  if (typeof v !== "number" || !Number.isFinite(v)) return "n/a";
  return v.toFixed(digits);
}

function fmtPct(v) {
  if (typeof v !== "number" || !Number.isFinite(v)) return "n/a";
  return `${(v * 100).toFixed(2)}%`;
}

function fmtParams(params) {
  const keys = Object.keys(params);
  if (keys.length === 0) return "{}";
  return `{${keys.map((k) => `${k}=${String(params[k])}`).join(", ")}}`;
}

function buildMarkdown(report, opts) {
  const lines = [];
  lines.push("# Full Benchmark Comparison");
  lines.push("");
  lines.push(`- Generated: ${new Date().toISOString()}`);
  lines.push(`- Baseline: \`${toRel(opts.baselinePath)}\``);
  lines.push(`- Current: \`${toRel(opts.currentPath)}\``);
  lines.push("");
  lines.push("## Summary");
  lines.push("");
  lines.push("| Item | Value |");
  lines.push("| --- | ---: |");
  lines.push(`| Baseline results | ${report.summary.baselineCount} |`);
  lines.push(`| Current results | ${report.summary.currentCount} |`);
  lines.push(`| Compared pairs | ${report.summary.comparedCount} |`);
  lines.push(`| Baseline-only keys | ${report.summary.onlyBaselineCount} |`);
  lines.push(`| Current-only keys | ${report.summary.onlyCurrentCount} |`);
  lines.push("");

  lines.push("## Top 5 rezi-native Regressions (timing.mean)");
  lines.push("");
  lines.push(
    "| Scenario | Params | Baseline | Current | Delta | Delta % | p95 Δ | ops/s Δ | bytes Δ |",
  );
  lines.push("| --- | --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: |");
  for (const entry of report.topReziNativeMeanRegressions) {
    const mean = entry.metrics["timing.mean"];
    const p95 = entry.metrics["timing.p95"];
    const ops = entry.metrics.opsPerSec;
    const bytes = entry.metrics.bytesProduced;
    lines.push(
      [
        `| ${entry.scenario}`,
        fmtParams(entry.params),
        fmtNum(mean?.baseline),
        fmtNum(mean?.current),
        fmtNum(mean?.delta),
        fmtPct(mean?.deltaPct),
        fmtNum(p95?.delta),
        fmtNum(ops?.delta),
        fmtNum(bytes?.delta),
      ].join(" | ") + " |",
    );
  }
  lines.push("");

  lines.push("## Key Mismatches");
  lines.push("");
  lines.push(`- Baseline-only: ${report.summary.onlyBaselineCount}`);
  lines.push(`- Current-only: ${report.summary.onlyCurrentCount}`);
  lines.push("");
  if (report.onlyBaseline.length > 0) {
    lines.push("### Baseline-only (first 20)");
    lines.push("");
    for (const row of report.onlyBaseline.slice(0, 20)) {
      lines.push(`- ${row.scenario} [${row.framework}] ${fmtParams(row.params)}`);
    }
    lines.push("");
  }
  if (report.onlyCurrent.length > 0) {
    lines.push("### Current-only (first 20)");
    lines.push("");
    for (const row of report.onlyCurrent.slice(0, 20)) {
      lines.push(`- ${row.scenario} [${row.framework}] ${fmtParams(row.params)}`);
    }
    lines.push("");
  }

  return `${lines.join("\n")}\n`;
}

function main() {
  const opts = parseArgs(process.argv);
  const baseline = readJson(opts.baselinePath, "baseline");
  const current = readJson(opts.currentPath, "current");
  const report = compareRuns(baseline, current);
  const md = buildMarkdown(report, opts);

  mkdirSync(dirname(opts.reportJsonPath), { recursive: true });
  mkdirSync(dirname(opts.reportMdPath), { recursive: true });
  writeFileSync(opts.reportJsonPath, `${JSON.stringify(report, null, 2)}\n`, "utf8");
  writeFileSync(opts.reportMdPath, md, "utf8");

  process.stdout.write(
    [
      `Wrote ${toRel(opts.reportJsonPath)}`,
      `Wrote ${toRel(opts.reportMdPath)}`,
      `Compared ${report.summary.comparedCount} paired keys`,
      `Top rezi-native mean regressions: ${report.topReziNativeMeanRegressions.length}`,
      "",
    ].join("\n"),
  );
}

main();
