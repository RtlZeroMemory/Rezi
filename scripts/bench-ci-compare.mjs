#!/usr/bin/env node
/**
 * CI benchmark comparator for regression gating.
 *
 * Compares a "current" bench run JSON against a committed baseline JSON using
 * per-metric threshold rules from config. Emits:
 * - machine-readable JSON report
 * - markdown summary report
 *
 * Exit codes:
 * - 0: no hard regressions
 * - 1: hard regressions, missing required comparisons, or invalid input
 */

import { mkdirSync, readFileSync, realpathSync, writeFileSync } from "node:fs";
import { dirname, join, relative } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = fileURLToPath(new URL("..", import.meta.url));
const DEFAULT_BASELINE_PATH = join(ROOT, "benchmarks", "ci-baseline", "results.json");
const DEFAULT_CONFIG_PATH = join(ROOT, "benchmarks", "ci-baseline", "config.json");
const DEFAULT_CURRENT_PATH = join(ROOT, "out", "bench-ci", "results.json");
const DEFAULT_REPORT_JSON_PATH = join(ROOT, "out", "bench-ci", "compare.json");
const DEFAULT_REPORT_MD_PATH = join(ROOT, "out", "bench-ci", "compare.md");

const STATUS = Object.freeze({
  PASS: "pass",
  HARD_REGRESSION: "hard_regression",
  ADVISORY_REGRESSION: "advisory_regression",
  MISSING_BASELINE_RESULT: "missing_baseline_result",
  MISSING_CURRENT_RESULT: "missing_current_result",
  MISSING_BASELINE_METRIC: "missing_baseline_metric",
  MISSING_CURRENT_METRIC: "missing_current_metric",
});

const HARD_STATUSES = new Set([
  STATUS.HARD_REGRESSION,
  STATUS.MISSING_BASELINE_RESULT,
  STATUS.MISSING_CURRENT_RESULT,
  STATUS.MISSING_BASELINE_METRIC,
  STATUS.MISSING_CURRENT_METRIC,
]);

const REQUIRED_FRAME_FILL_VARIANTS = Object.freeze([
  {
    scenario: "terminal-frame-fill",
    framework: "rezi-native",
    params: { rows: 40, cols: 120, dirtyLines: 1 },
  },
  {
    scenario: "terminal-frame-fill",
    framework: "rezi-native",
    params: { rows: 40, cols: 120, dirtyLines: 40 },
  },
]);

function die(message) {
  process.stderr.write(`${message}\n`);
  process.exit(1);
}

function parseArgs(argv) {
  const opts = {
    baselinePath: DEFAULT_BASELINE_PATH,
    currentPath: DEFAULT_CURRENT_PATH,
    configPath: DEFAULT_CONFIG_PATH,
    reportJsonPath: DEFAULT_REPORT_JSON_PATH,
    reportMdPath: DEFAULT_REPORT_MD_PATH,
    failOnAdvisory: false,
  };

  for (let i = 2; i < argv.length; i++) {
    const arg = argv[i];
    switch (arg) {
      case "--baseline":
        opts.baselinePath = argv[++i] ?? null;
        break;
      case "--current":
        opts.currentPath = argv[++i] ?? null;
        break;
      case "--config":
        opts.configPath = argv[++i] ?? null;
        break;
      case "--report-json":
        opts.reportJsonPath = argv[++i] ?? null;
        break;
      case "--report-md":
        opts.reportMdPath = argv[++i] ?? null;
        break;
      case "--fail-on-advisory":
        opts.failOnAdvisory = true;
        break;
      case "--help":
      case "-h":
        printUsage();
        process.exit(0);
        break;
      default:
        die(`bench-ci-compare: unknown argument: ${arg}`);
    }
  }

  if (!opts.baselinePath || !opts.configPath || !opts.reportJsonPath || !opts.reportMdPath) {
    die("bench-ci-compare: --baseline, --config, --report-json, and --report-md require values");
  }

  return opts;
}

function printUsage() {
  process.stdout.write(
    [
      "Usage:",
      "  node scripts/bench-ci-compare.mjs [options]",
      "",
      "Options:",
      `  --current <path>       Current results JSON (default: ${toRel(DEFAULT_CURRENT_PATH)})`,
      `  --baseline <path>      Baseline results JSON (default: ${toRel(DEFAULT_BASELINE_PATH)})`,
      `  --config <path>        Threshold config JSON (default: ${toRel(DEFAULT_CONFIG_PATH)})`,
      `  --report-json <path>   Machine report output (default: ${toRel(DEFAULT_REPORT_JSON_PATH)})`,
      `  --report-md <path>     Markdown report output (default: ${toRel(DEFAULT_REPORT_MD_PATH)})`,
      "  --fail-on-advisory     Also fail CI when advisory regressions are present",
      "  --help, -h             Show this help",
      "",
    ].join("\n"),
  );
}

function readJson(path, label) {
  let raw;
  try {
    raw = readFileSync(path, "utf8");
  } catch (err) {
    const detail = err instanceof Error ? err.message : String(err);
    throw new Error(`${label}: failed to read ${path}\n${detail}`);
  }

  try {
    return JSON.parse(raw);
  } catch (err) {
    const detail = err instanceof Error ? err.message : String(err);
    throw new Error(`${label}: failed to parse JSON ${path}\n${detail}`);
  }
}

function isPlainObject(value) {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function normalizeParams(value, source) {
  if (!isPlainObject(value)) {
    throw new Error(`${source} must be an object`);
  }
  const out = {};
  const keys = Object.keys(value).sort();
  for (const key of keys) {
    const v = value[key];
    if (typeof v !== "number" && typeof v !== "string" && typeof v !== "boolean") {
      throw new Error(
        `${source}.${key} must be number|string|boolean (got ${v === null ? "null" : typeof v})`,
      );
    }
    out[key] = v;
  }
  return out;
}

function stableStringify(value) {
  if (Array.isArray(value)) {
    return `[${value.map((v) => stableStringify(v)).join(",")}]`;
  }
  if (isPlainObject(value)) {
    const keys = Object.keys(value).sort();
    return `{${keys.map((k) => `${JSON.stringify(k)}:${stableStringify(value[k])}`).join(",")}}`;
  }
  return JSON.stringify(value);
}

function makeDescriptorKey(scenario, framework, params) {
  return `${scenario}|${framework}|${stableStringify(params ?? {})}`;
}

function normalizeScenarioDescriptor(raw, source) {
  if (!isPlainObject(raw)) {
    throw new Error(`${source} must be an object`);
  }

  const scenario = raw.scenario;
  const framework = raw.framework;
  if (typeof scenario !== "string" || scenario.length === 0) {
    throw new Error(`${source}.scenario must be a non-empty string`);
  }
  if (typeof framework !== "string" || framework.length === 0) {
    throw new Error(`${source}.framework must be a non-empty string`);
  }

  const params = normalizeParams(raw.params ?? {}, `${source}.params`);

  return {
    scenario,
    framework,
    params,
    key: makeDescriptorKey(scenario, framework, params),
  };
}

function normalizeSeverity(raw, source) {
  if (raw === undefined) return undefined;
  if (raw === "hard" || raw === "advisory") return raw;
  throw new Error(`${source} must be "hard" or "advisory"`);
}

function normalizeDirection(raw, source) {
  if (raw === undefined) return undefined;
  if (raw === "higher_is_worse" || raw === "lower_is_worse") return raw;
  throw new Error(`${source} must be "higher_is_worse" or "lower_is_worse"`);
}

function normalizeNumber(raw, source) {
  const n = Number(raw);
  if (!Number.isFinite(n) || n < 0) {
    throw new Error(`${source} must be a non-negative finite number`);
  }
  return n;
}

function normalizeDefaultRule(metric, raw, source) {
  if (!isPlainObject(raw)) {
    throw new Error(`${source} must be an object`);
  }
  return {
    metric,
    relativeRegression: normalizeNumber(raw.relativeRegression, `${source}.relativeRegression`),
    absoluteRegression: normalizeNumber(raw.absoluteRegression, `${source}.absoluteRegression`),
    severity: normalizeSeverity(raw.severity, `${source}.severity`) ?? "hard",
    direction: normalizeDirection(raw.direction, `${source}.direction`) ?? "higher_is_worse",
    source,
  };
}

function normalizeOverride(raw, index, defaultRules) {
  const source = `metrics.overrides[${index}]`;
  if (!isPlainObject(raw)) {
    throw new Error(`${source} must be an object`);
  }
  if (!isPlainObject(raw.match)) {
    throw new Error(`${source}.match must be an object`);
  }
  if (!isPlainObject(raw.rule)) {
    throw new Error(`${source}.rule must be an object`);
  }

  const metric = raw.match.metric;
  if (typeof metric !== "string" || metric.length === 0) {
    throw new Error(`${source}.match.metric must be a non-empty string`);
  }
  if (!defaultRules.has(metric)) {
    throw new Error(
      `${source}.match.metric=${metric} has no matching default rule in metrics.defaults`,
    );
  }

  const match = {
    metric,
    scenario:
      raw.match.scenario === undefined
        ? undefined
        : validateString(raw.match.scenario, `${source}.match.scenario`),
    framework:
      raw.match.framework === undefined
        ? undefined
        : validateString(raw.match.framework, `${source}.match.framework`),
    params:
      raw.match.params === undefined
        ? undefined
        : normalizeParams(raw.match.params, `${source}.match.params`),
  };

  const rulePatch = {
    relativeRegression:
      raw.rule.relativeRegression === undefined
        ? undefined
        : normalizeNumber(raw.rule.relativeRegression, `${source}.rule.relativeRegression`),
    absoluteRegression:
      raw.rule.absoluteRegression === undefined
        ? undefined
        : normalizeNumber(raw.rule.absoluteRegression, `${source}.rule.absoluteRegression`),
    severity: normalizeSeverity(raw.rule.severity, `${source}.rule.severity`),
    direction: normalizeDirection(raw.rule.direction, `${source}.rule.direction`),
  };

  if (
    rulePatch.relativeRegression === undefined &&
    rulePatch.absoluteRegression === undefined &&
    rulePatch.severity === undefined &&
    rulePatch.direction === undefined
  ) {
    throw new Error(`${source}.rule must include at least one override field`);
  }

  const reason = raw.reason === undefined ? null : validateString(raw.reason, `${source}.reason`);

  return { source, match, rulePatch, reason };
}

function validateString(raw, source) {
  if (typeof raw !== "string" || raw.length === 0) {
    throw new Error(`${source} must be a non-empty string`);
  }
  return raw;
}

function assertRequiredFrameFillVariants(requiredScenarios) {
  const keys = new Set(requiredScenarios.map((d) => d.key));
  for (const required of REQUIRED_FRAME_FILL_VARIANTS) {
    const key = makeDescriptorKey(required.scenario, required.framework, required.params);
    if (!keys.has(key)) {
      throw new Error(
        [
          "requiredScenarios must explicitly include terminal-frame-fill variants:",
          "- scenario=terminal-frame-fill framework=rezi-native params={rows:40,cols:120,dirtyLines:1}",
          "- scenario=terminal-frame-fill framework=rezi-native params={rows:40,cols:120,dirtyLines:40}",
        ].join("\n"),
      );
    }
  }
}

export function normalizeComparatorConfig(rawConfig) {
  if (!isPlainObject(rawConfig)) {
    throw new Error("config root must be an object");
  }

  const requiredRaw = rawConfig.requiredScenarios;
  if (!Array.isArray(requiredRaw) || requiredRaw.length === 0) {
    throw new Error("config.requiredScenarios must be a non-empty array");
  }

  const requiredScenarios = requiredRaw.map((entry, index) =>
    normalizeScenarioDescriptor(entry, `requiredScenarios[${index}]`),
  );

  const seenKeys = new Set();
  for (const entry of requiredScenarios) {
    if (seenKeys.has(entry.key)) {
      throw new Error(`duplicate required scenario entry: ${entry.key}`);
    }
    seenKeys.add(entry.key);
  }

  assertRequiredFrameFillVariants(requiredScenarios);

  if (!isPlainObject(rawConfig.metrics)) {
    throw new Error("config.metrics must be an object");
  }
  if (!isPlainObject(rawConfig.metrics.defaults)) {
    throw new Error("config.metrics.defaults must be an object");
  }

  const defaultRuleEntries = Object.entries(rawConfig.metrics.defaults).sort((a, b) =>
    a[0].localeCompare(b[0]),
  );
  if (defaultRuleEntries.length === 0) {
    throw new Error("config.metrics.defaults must define at least one metric rule");
  }

  const defaultRules = new Map();
  for (const [metric, ruleRaw] of defaultRuleEntries) {
    if (typeof metric !== "string" || metric.length === 0) {
      throw new Error("metrics.defaults keys must be non-empty metric paths");
    }
    const normalized = normalizeDefaultRule(metric, ruleRaw, `metrics.defaults.${metric}`);
    defaultRules.set(metric, normalized);
  }

  const overridesRaw = rawConfig.metrics.overrides ?? [];
  if (!Array.isArray(overridesRaw)) {
    throw new Error("config.metrics.overrides must be an array when provided");
  }
  const overrides = overridesRaw.map((entry, index) =>
    normalizeOverride(entry, index, defaultRules),
  );

  return {
    meta: isPlainObject(rawConfig.meta) ? rawConfig.meta : null,
    requiredScenarios,
    defaultRules,
    overrides,
  };
}

function normalizeBenchRun(rawRun, source) {
  if (!isPlainObject(rawRun)) {
    throw new Error(`${source} root must be an object`);
  }
  if (!Array.isArray(rawRun.results)) {
    throw new Error(`${source}.results must be an array`);
  }
  return rawRun;
}

function indexBenchResults(run, source) {
  const map = new Map();
  for (let i = 0; i < run.results.length; i++) {
    const entry = run.results[i];
    const prefix = `${source}.results[${i}]`;
    if (!isPlainObject(entry)) {
      throw new Error(`${prefix} must be an object`);
    }
    const scenario = validateString(entry.scenario, `${prefix}.scenario`);
    const framework = validateString(entry.framework, `${prefix}.framework`);
    const params = normalizeParams(entry.params ?? {}, `${prefix}.params`);
    const key = makeDescriptorKey(scenario, framework, params);
    if (map.has(key)) {
      throw new Error(`${source}: duplicate benchmark result key ${key}`);
    }
    map.set(key, entry);
  }
  return map;
}

function getMetricValue(metrics, metricPath) {
  const parts = metricPath.split(".");
  let cursor = metrics;
  for (const part of parts) {
    if (!isPlainObject(cursor) || !(part in cursor)) {
      return null;
    }
    cursor = cursor[part];
  }
  if (typeof cursor !== "number" || !Number.isFinite(cursor)) {
    return null;
  }
  return cursor;
}

function overrideMatches(override, context) {
  const { match } = override;
  if (match.metric !== context.metric) return false;
  if (match.scenario !== undefined && match.scenario !== context.scenario) return false;
  if (match.framework !== undefined && match.framework !== context.framework) return false;
  if (match.params !== undefined) {
    if (stableStringify(match.params) !== stableStringify(context.params)) return false;
  }
  return true;
}

function resolveRule(config, context) {
  const base = config.defaultRules.get(context.metric);
  if (!base) return null;

  let resolved = {
    metric: base.metric,
    relativeRegression: base.relativeRegression,
    absoluteRegression: base.absoluteRegression,
    severity: base.severity,
    direction: base.direction,
  };
  let source = base.source;
  let reason = null;

  for (const override of config.overrides) {
    if (!overrideMatches(override, context)) continue;
    resolved = {
      metric: resolved.metric,
      relativeRegression: override.rulePatch.relativeRegression ?? resolved.relativeRegression,
      absoluteRegression: override.rulePatch.absoluteRegression ?? resolved.absoluteRegression,
      severity: override.rulePatch.severity ?? resolved.severity,
      direction: override.rulePatch.direction ?? resolved.direction,
    };
    source = override.source;
    reason = override.reason;
  }

  return { rule: resolved, source, reason };
}

function computeDeltaStats(baselineValue, currentValue, rule) {
  const delta = currentValue - baselineValue;
  const deltaPct = baselineValue === 0 ? null : delta / baselineValue;
  const relativeAllowance = Math.abs(baselineValue) * rule.relativeRegression;
  const allowedDelta = Math.max(relativeAllowance, rule.absoluteRegression);
  const worseDelta =
    rule.direction === "higher_is_worse"
      ? currentValue - baselineValue
      : baselineValue - currentValue;
  const regressed = worseDelta > allowedDelta;
  return {
    delta,
    deltaPct,
    relativeAllowance,
    allowedDelta,
    worseDelta,
    regressed,
  };
}

function buildMissingResultCheck(req, metric, status, reason) {
  return {
    scenario: req.scenario,
    framework: req.framework,
    params: req.params,
    metric,
    status,
    severity: "hard",
    baselineValue: null,
    currentValue: null,
    delta: null,
    deltaPct: null,
    threshold: null,
    ruleSource: null,
    ruleReason: null,
    reason,
  };
}

function sortChecks(checks) {
  checks.sort((a, b) => {
    if (a.scenario !== b.scenario) return a.scenario.localeCompare(b.scenario);
    const aParams = stableStringify(a.params ?? {});
    const bParams = stableStringify(b.params ?? {});
    if (aParams !== bParams) return aParams.localeCompare(bParams);
    if (a.framework !== b.framework) return a.framework.localeCompare(b.framework);
    return a.metric.localeCompare(b.metric);
  });
  return checks;
}

export function compareBenchRuns(baselineRunRaw, currentRunRaw, config, options = {}) {
  const baselineRun = normalizeBenchRun(baselineRunRaw, "baseline");
  const currentRun = normalizeBenchRun(currentRunRaw, "current");
  const baselineIndex = indexBenchResults(baselineRun, "baseline");
  const currentIndex = indexBenchResults(currentRun, "current");

  const metricPaths = [...config.defaultRules.keys()].sort();
  const checks = [];

  for (const req of config.requiredScenarios) {
    const baselineResult = baselineIndex.get(req.key) ?? null;
    const currentResult = currentIndex.get(req.key) ?? null;

    if (!baselineResult) {
      for (const metric of metricPaths) {
        checks.push(
          buildMissingResultCheck(
            req,
            metric,
            STATUS.MISSING_BASELINE_RESULT,
            "required scenario missing from baseline results",
          ),
        );
      }
      continue;
    }
    if (!currentResult) {
      for (const metric of metricPaths) {
        checks.push(
          buildMissingResultCheck(
            req,
            metric,
            STATUS.MISSING_CURRENT_RESULT,
            "required scenario missing from current results",
          ),
        );
      }
      continue;
    }

    for (const metric of metricPaths) {
      const resolved = resolveRule(config, {
        scenario: req.scenario,
        framework: req.framework,
        params: req.params,
        metric,
      });
      if (!resolved) continue;

      const baselineValue = getMetricValue(baselineResult.metrics, metric);
      const currentValue = getMetricValue(currentResult.metrics, metric);

      if (baselineValue === null) {
        checks.push({
          scenario: req.scenario,
          framework: req.framework,
          params: req.params,
          metric,
          status: STATUS.MISSING_BASELINE_METRIC,
          severity: "hard",
          baselineValue: null,
          currentValue,
          delta: null,
          deltaPct: null,
          threshold: null,
          ruleSource: resolved.source,
          ruleReason: resolved.reason,
          reason: `metric "${metric}" missing or non-numeric in baseline`,
        });
        continue;
      }

      if (currentValue === null) {
        checks.push({
          scenario: req.scenario,
          framework: req.framework,
          params: req.params,
          metric,
          status: STATUS.MISSING_CURRENT_METRIC,
          severity: "hard",
          baselineValue,
          currentValue: null,
          delta: null,
          deltaPct: null,
          threshold: null,
          ruleSource: resolved.source,
          ruleReason: resolved.reason,
          reason: `metric "${metric}" missing or non-numeric in current`,
        });
        continue;
      }

      const stats = computeDeltaStats(baselineValue, currentValue, resolved.rule);
      const severity = resolved.rule.severity;
      let status = STATUS.PASS;
      if (stats.regressed) {
        status = severity === "hard" ? STATUS.HARD_REGRESSION : STATUS.ADVISORY_REGRESSION;
      }

      checks.push({
        scenario: req.scenario,
        framework: req.framework,
        params: req.params,
        metric,
        status,
        severity,
        baselineValue,
        currentValue,
        delta: stats.delta,
        deltaPct: stats.deltaPct,
        threshold: {
          relativeRegression: resolved.rule.relativeRegression,
          absoluteRegression: resolved.rule.absoluteRegression,
          relativeAllowance: stats.relativeAllowance,
          allowedDelta: stats.allowedDelta,
          direction: resolved.rule.direction,
        },
        ruleSource: resolved.source,
        ruleReason: resolved.reason,
        reason: stats.regressed ? "regression threshold exceeded" : "within threshold",
      });
    }
  }

  sortChecks(checks);

  const hardFailures = checks.filter((c) => HARD_STATUSES.has(c.status));
  const hardRegressions = checks.filter((c) => c.status === STATUS.HARD_REGRESSION);
  const advisoryRegressions = checks.filter((c) => c.status === STATUS.ADVISORY_REGRESSION);
  const missingChecks = checks.filter(
    (c) =>
      c.status === STATUS.MISSING_BASELINE_RESULT ||
      c.status === STATUS.MISSING_CURRENT_RESULT ||
      c.status === STATUS.MISSING_BASELINE_METRIC ||
      c.status === STATUS.MISSING_CURRENT_METRIC,
  );
  const passChecks = checks.filter((c) => c.status === STATUS.PASS);

  const failOnAdvisory = options.failOnAdvisory === true;
  const exitCode =
    hardFailures.length > 0 || (failOnAdvisory && advisoryRegressions.length > 0) ? 1 : 0;

  return {
    meta: {
      generatedAt: new Date().toISOString(),
      failOnAdvisory,
      gateBehavior:
        "hard regressions fail CI; advisory regressions are informational unless --fail-on-advisory is set",
    },
    summary: {
      requiredScenarios: config.requiredScenarios.length,
      metricsPerScenario: metricPaths.length,
      totalChecks: checks.length,
      passed: passChecks.length,
      hardRegressions: hardRegressions.length,
      advisoryRegressions: advisoryRegressions.length,
      hardFailures: hardFailures.length,
      missingComparisons: missingChecks.length,
      exitCode,
    },
    checks,
  };
}

function formatNumber(value) {
  if (value === null || value === undefined) return "n/a";
  return Number(value).toFixed(6);
}

function formatPercent(value) {
  if (value === null || value === undefined || !Number.isFinite(value)) return "n/a";
  const pct = value * 100;
  const sign = pct >= 0 ? "+" : "";
  return `${sign}${pct.toFixed(2)}%`;
}

function formatDelta(delta, deltaPct) {
  if (delta === null || delta === undefined) return "n/a";
  const sign = delta >= 0 ? "+" : "";
  const pct = formatPercent(deltaPct);
  return `${sign}${Number(delta).toFixed(6)} (${pct})`;
}

function formatThreshold(threshold) {
  if (!threshold) return "n/a";
  const dir = threshold.direction === "higher_is_worse" ? "+" : "-";
  return `${dir}${formatNumber(threshold.allowedDelta)} (max rel ${(
    threshold.relativeRegression * 100
  ).toFixed(1)}%, abs ${formatNumber(threshold.absoluteRegression)})`;
}

function paramsToString(params) {
  const keys = Object.keys(params ?? {}).sort();
  if (keys.length === 0) return "";
  return keys.map((k) => `${k}=${String(params[k])}`).join(", ");
}

function scenarioToString(check) {
  const paramText = paramsToString(check.params);
  if (paramText.length === 0) return `${check.scenario} [${check.framework}]`;
  return `${check.scenario} (${paramText}) [${check.framework}]`;
}

function statusToLabel(status) {
  switch (status) {
    case STATUS.PASS:
      return "PASS";
    case STATUS.HARD_REGRESSION:
      return "FAIL (hard)";
    case STATUS.ADVISORY_REGRESSION:
      return "WARN (advisory)";
    case STATUS.MISSING_BASELINE_RESULT:
      return "FAIL (missing baseline scenario)";
    case STATUS.MISSING_CURRENT_RESULT:
      return "FAIL (missing current scenario)";
    case STATUS.MISSING_BASELINE_METRIC:
      return "FAIL (missing baseline metric)";
    case STATUS.MISSING_CURRENT_METRIC:
      return "FAIL (missing current metric)";
    default:
      return status;
  }
}

function markdownTable(checks) {
  if (checks.length === 0) {
    return "_None._\n";
  }

  const lines = [
    "| Status | Scenario | Metric | Baseline | Current | Delta | Threshold |",
    "| --- | --- | --- | ---: | ---: | ---: | --- |",
  ];

  for (const check of checks) {
    lines.push(
      [
        `| ${statusToLabel(check.status)}`,
        `${scenarioToString(check)}`,
        `${check.metric}`,
        `${formatNumber(check.baselineValue)}`,
        `${formatNumber(check.currentValue)}`,
        `${formatDelta(check.delta, check.deltaPct)}`,
        `${formatThreshold(check.threshold)} |`,
      ].join(" | "),
    );
  }

  return `${lines.join("\n")}\n`;
}

export function toMarkdownReport(report, paths) {
  const hard = report.checks.filter((c) => HARD_STATUSES.has(c.status));
  const advisory = report.checks.filter((c) => c.status === STATUS.ADVISORY_REGRESSION);
  const allChecks = report.checks;

  const lines = [
    "# CI Benchmark Regression Report",
    "",
    `- Generated: ${report.meta.generatedAt}`,
    `- Baseline: \`${toRel(paths.baselinePath)}\``,
    `- Current: \`${toRel(paths.currentPath)}\``,
    `- Config: \`${toRel(paths.configPath)}\``,
    `- Gate behavior: ${report.meta.gateBehavior}`,
    "",
    "## Summary",
    "",
    "| Checks | Value |",
    "| --- | ---: |",
    `| Required scenarios | ${report.summary.requiredScenarios} |`,
    `| Metrics per scenario | ${report.summary.metricsPerScenario} |`,
    `| Total checks | ${report.summary.totalChecks} |`,
    `| Passed | ${report.summary.passed} |`,
    `| Hard regressions | ${report.summary.hardRegressions} |`,
    `| Advisory regressions | ${report.summary.advisoryRegressions} |`,
    `| Missing comparisons | ${report.summary.missingComparisons} |`,
    `| Exit code | ${report.summary.exitCode} |`,
    "",
    "## Hard Failures",
    "",
    markdownTable(hard),
    "## Advisory Regressions",
    "",
    markdownTable(advisory),
    "## All Checks",
    "",
    markdownTable(allChecks),
  ];

  return `${lines.join("\n")}\n`;
}

function toRel(path) {
  if (path.startsWith(ROOT)) {
    return relative(ROOT, path);
  }
  return path;
}

function writeOutput(path, content) {
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, content, "utf8");
}

function printConsoleSummary(report, paths) {
  const hard = report.checks.filter((c) => HARD_STATUSES.has(c.status));
  const advisory = report.checks.filter((c) => c.status === STATUS.ADVISORY_REGRESSION);

  process.stdout.write(
    [
      `bench-ci-compare: checked ${report.summary.totalChecks} comparisons`,
      `  hard regressions: ${report.summary.hardRegressions}`,
      `  advisory regressions: ${report.summary.advisoryRegressions}`,
      `  missing comparisons: ${report.summary.missingComparisons}`,
      `  report json: ${toRel(paths.reportJsonPath)}`,
      `  report md: ${toRel(paths.reportMdPath)}`,
      "",
    ].join("\n"),
  );

  if (hard.length > 0) {
    process.stderr.write("bench-ci-compare: hard failures detected\n");
    for (const check of hard) {
      process.stderr.write(
        [
          `- scenario=${scenarioToString(check)}`,
          `metric=${check.metric}`,
          `baseline=${formatNumber(check.baselineValue)}`,
          `current=${formatNumber(check.currentValue)}`,
          `delta=${formatDelta(check.delta, check.deltaPct)}`,
          `threshold=${formatThreshold(check.threshold)}`,
          `reason=${check.reason}`,
        ].join(" | "),
      );
      process.stderr.write("\n");
    }
  }

  if (hard.length === 0 && advisory.length > 0) {
    process.stdout.write("bench-ci-compare: advisory regressions (non-fatal)\n");
    for (const check of advisory) {
      process.stdout.write(
        [
          `- scenario=${scenarioToString(check)}`,
          `metric=${check.metric}`,
          `baseline=${formatNumber(check.baselineValue)}`,
          `current=${formatNumber(check.currentValue)}`,
          `delta=${formatDelta(check.delta, check.deltaPct)}`,
          `threshold=${formatThreshold(check.threshold)}`,
        ].join(" | "),
      );
      process.stdout.write("\n");
    }
  }
}

function runCli() {
  const opts = parseArgs(process.argv);

  const baselineRunRaw = readJson(opts.baselinePath, "baseline");
  const currentRunRaw = readJson(opts.currentPath, "current");
  const configRaw = readJson(opts.configPath, "config");
  const config = normalizeComparatorConfig(configRaw);

  const report = compareBenchRuns(baselineRunRaw, currentRunRaw, config, {
    failOnAdvisory: opts.failOnAdvisory,
  });

  const reportWithPaths = {
    ...report,
    inputs: {
      baselinePath: opts.baselinePath,
      currentPath: opts.currentPath,
      configPath: opts.configPath,
    },
    baselineMeta: isPlainObject(baselineRunRaw.meta) ? baselineRunRaw.meta : null,
    currentMeta: isPlainObject(currentRunRaw.meta) ? currentRunRaw.meta : null,
    configMeta: config.meta,
  };

  writeOutput(`${opts.reportJsonPath}`, `${JSON.stringify(reportWithPaths, null, 2)}\n`);
  writeOutput(opts.reportMdPath, toMarkdownReport(report, opts));
  printConsoleSummary(report, opts);
  process.exit(report.summary.exitCode);
}

const invokedPath = process.argv[1] ? realpathSync(process.argv[1]) : null;
const selfPath = realpathSync(fileURLToPath(import.meta.url));

if (invokedPath && invokedPath === selfPath) {
  try {
    runCli();
  } catch (err) {
    const detail = err instanceof Error ? (err.stack ?? err.message) : String(err);
    process.stderr.write(`bench-ci-compare: FAIL\n${detail}\n`);
    process.exit(1);
  }
}
