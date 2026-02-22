#!/usr/bin/env node

import { spawnSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { isAbsolute, join, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const ROOT = fileURLToPath(new URL("..", import.meta.url));
const PROFILE_PATH = join(ROOT, "packages", "bench", "profiles", "ci.json");
const BENCH_RUNNER_PATH = join(ROOT, "packages", "bench", "dist", "run.js");
const BENCH_SCENARIO_INDEX_PATH = join(ROOT, "packages", "bench", "dist", "scenarios", "index.js");
const DEFAULT_JSON_OUTPUT = "results.json";
const DEFAULT_MARKDOWN_OUTPUT = "results.md";

function fail(message) {
  process.stderr.write(`run-bench-ci: ${message}\n`);
  process.exit(1);
}

function printHelp() {
  process.stdout.write(
    [
      "Usage:",
      "  node scripts/run-bench-ci.mjs [--output-dir <path>]",
      "",
      "Options:",
      "  --output-dir <path>  Override profile output directory",
      "  -h, --help           Show this help",
      "",
    ].join("\n"),
  );
}

function parseArgs(argv) {
  let outputDir = null;

  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];

    if (arg === "--output-dir") {
      outputDir = argv[++i] ?? null;
      if (!outputDir) fail("missing value for --output-dir");
      continue;
    }

    if (arg === "--help" || arg === "-h") {
      printHelp();
      process.exit(0);
    }

    fail(`unknown argument: ${arg}`);
  }

  return { outputDir };
}

function toAbsPath(pathValue) {
  return isAbsolute(pathValue) ? pathValue : resolve(ROOT, pathValue);
}

function readJson(path, label) {
  let raw = "";
  try {
    raw = readFileSync(path, "utf8");
  } catch (error) {
    fail(
      `${label}: failed to read ${path}: ${error instanceof Error ? error.message : String(error)}`,
    );
  }

  let parsed;
  try {
    parsed = JSON.parse(raw);
  } catch (error) {
    fail(
      `${label}: failed to parse ${path}: ${error instanceof Error ? error.message : String(error)}`,
    );
  }
  return parsed;
}

function isPlainObject(value) {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function normalizeParams(value, source) {
  if (!isPlainObject(value)) {
    fail(`${source} must be an object`);
  }
  const out = {};
  const keys = Object.keys(value).sort();
  for (const key of keys) {
    const raw = value[key];
    if (typeof raw !== "number" && typeof raw !== "string" && typeof raw !== "boolean") {
      fail(
        `${source}.${key} must be number|string|boolean (got ${raw === null ? "null" : typeof raw})`,
      );
    }
    out[key] = raw;
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

function makeKey(scenario, framework, params) {
  return `${scenario}|${framework}|${stableStringify(params ?? {})}`;
}

function loadCiProfile(profilePath) {
  if (!existsSync(profilePath)) {
    fail(`profile file not found: ${profilePath}`);
  }

  const profile = readJson(profilePath, "profile");
  if (!isPlainObject(profile)) {
    fail("profile root must be an object");
  }

  if (profile.name !== "ci") {
    fail('profile.name must be "ci"');
  }
  if (profile.suite !== "terminal") {
    fail('profile.suite must be "terminal"');
  }
  if (profile.io !== "stub") {
    fail('profile.io must be "stub" for deterministic PR CI gating');
  }

  if (typeof profile.framework !== "string" || profile.framework.length === 0) {
    fail("profile.framework must be a non-empty string");
  }
  if (!Number.isInteger(profile.warmup) || profile.warmup < 0) {
    fail("profile.warmup must be an integer >= 0");
  }
  if (!Number.isInteger(profile.iterations) || profile.iterations <= 0) {
    fail("profile.iterations must be an integer > 0");
  }
  if (typeof profile.outputDir !== "string" || profile.outputDir.length === 0) {
    fail("profile.outputDir must be a non-empty string");
  }

  if (!Array.isArray(profile.requiredScenarios) || profile.requiredScenarios.length === 0) {
    fail("profile.requiredScenarios must be a non-empty array");
  }
  const requiredScenarios = [];
  const seenScenarios = new Set();
  for (const scenario of profile.requiredScenarios) {
    if (typeof scenario !== "string" || scenario.length === 0) {
      fail("profile.requiredScenarios entries must be non-empty strings");
    }
    if (!scenario.startsWith("terminal-")) {
      fail(`profile.requiredScenarios entry must be a terminal scenario: ${scenario}`);
    }
    if (seenScenarios.has(scenario)) {
      fail(`profile.requiredScenarios contains duplicate entry: ${scenario}`);
    }
    seenScenarios.add(scenario);
    requiredScenarios.push(scenario);
  }

  if (!isPlainObject(profile.requiredScenarioParams)) {
    fail("profile.requiredScenarioParams must be an object");
  }
  const requiredScenarioParams = new Map();
  for (const [scenario, rawParamSets] of Object.entries(profile.requiredScenarioParams)) {
    if (!Array.isArray(rawParamSets) || rawParamSets.length === 0) {
      fail(`profile.requiredScenarioParams.${scenario} must be a non-empty array`);
    }
    if (!seenScenarios.has(scenario)) {
      fail(`profile.requiredScenarioParams.${scenario} is not listed in requiredScenarios`);
    }
    const normalized = rawParamSets.map((params, index) =>
      normalizeParams(params, `profile.requiredScenarioParams.${scenario}[${index}]`),
    );
    requiredScenarioParams.set(scenario, normalized);
  }

  if (!isPlainObject(profile.explicitExclusions)) {
    fail("profile.explicitExclusions must be an object");
  }
  const explicitExclusions = new Map();
  for (const [scenario, reason] of Object.entries(profile.explicitExclusions)) {
    if (typeof scenario !== "string" || scenario.length === 0) {
      fail("profile.explicitExclusions keys must be non-empty strings");
    }
    if (!scenario.startsWith("terminal-")) {
      fail(`profile.explicitExclusions key must be a terminal scenario: ${scenario}`);
    }
    if (typeof reason !== "string" || reason.trim().length === 0) {
      fail(`profile.explicitExclusions.${scenario} must be a non-empty reason string`);
    }
    if (seenScenarios.has(scenario)) {
      fail(`profile.explicitExclusions.${scenario} duplicates requiredScenarios`);
    }
    explicitExclusions.set(scenario, reason.trim());
  }

  const outputBlock = isPlainObject(profile.output) ? profile.output : {};
  const resultsJson =
    typeof outputBlock.resultsJson === "string" && outputBlock.resultsJson.length > 0
      ? outputBlock.resultsJson
      : DEFAULT_JSON_OUTPUT;
  const resultsMarkdown =
    typeof outputBlock.resultsMarkdown === "string" && outputBlock.resultsMarkdown.length > 0
      ? outputBlock.resultsMarkdown
      : DEFAULT_MARKDOWN_OUTPUT;

  if (
    !isPlainObject(profile.deterministicOrdering) ||
    Object.keys(profile.deterministicOrdering).length === 0
  ) {
    fail("profile.deterministicOrdering must be an object");
  }

  return {
    name: profile.name,
    description: typeof profile.description === "string" ? profile.description : "",
    suite: profile.suite,
    framework: profile.framework,
    io: profile.io,
    warmup: profile.warmup,
    iterations: profile.iterations,
    outputDir: profile.outputDir,
    output: { resultsJson, resultsMarkdown },
    requiredScenarios,
    requiredScenarioParams,
    explicitExclusions,
    deterministicOrdering: profile.deterministicOrdering,
  };
}

function runBench(profile, outputDir) {
  const args = [
    "--expose-gc",
    BENCH_RUNNER_PATH,
    "--suite",
    profile.suite,
    "--framework",
    profile.framework,
    "--warmup",
    String(profile.warmup),
    "--iterations",
    String(profile.iterations),
    "--io",
    profile.io,
    "--output-dir",
    outputDir,
  ];

  process.stdout.write("\n[bench:ci] running reduced CI suite\n");
  process.stdout.write(`  suite=${profile.suite}\n`);
  process.stdout.write(`  framework=${profile.framework}\n`);
  process.stdout.write(`  io=${profile.io}\n`);
  process.stdout.write(`  warmup=${profile.warmup}\n`);
  process.stdout.write(`  iterations=${profile.iterations}\n`);

  const result = spawnSync(process.execPath, args, {
    cwd: ROOT,
    stdio: "inherit",
    env: { ...process.env },
  });

  if (result.signal) {
    fail(`benchmark command terminated by signal ${result.signal}`);
  }

  if ((result.status ?? 1) !== 0) {
    process.exit(result.status ?? 1);
  }
}

function loadBenchRun(path) {
  const raw = readJson(path, "results");
  if (!isPlainObject(raw) || !Array.isArray(raw.results)) {
    fail(`results: ${path} must be a benchmark run object with a results[] array`);
  }
  return raw;
}

async function loadTerminalScenarioManifest() {
  if (!existsSync(BENCH_SCENARIO_INDEX_PATH)) {
    fail(
      `missing scenario registry: ${BENCH_SCENARIO_INDEX_PATH}. Run "npx tsc -b packages/bench" first.`,
    );
  }

  let mod;
  try {
    mod = await import(pathToFileURL(BENCH_SCENARIO_INDEX_PATH).href);
  } catch (error) {
    fail(
      `failed to load scenario registry from ${BENCH_SCENARIO_INDEX_PATH}: ${
        error instanceof Error ? error.message : String(error)
      }`,
    );
  }

  const scenarioRows = mod?.scenarios;
  if (!Array.isArray(scenarioRows)) {
    fail(`scenario registry did not export scenarios[]: ${BENCH_SCENARIO_INDEX_PATH}`);
  }

  const names = [];
  for (const row of scenarioRows) {
    if (!isPlainObject(row)) continue;
    const name = typeof row.name === "string" ? row.name : "";
    if (!name.startsWith("terminal-")) continue;
    names.push(name);
  }
  names.sort();
  return names;
}

function verifyScenarioManifest(profile, terminalScenarioNames) {
  const required = new Set(profile.requiredScenarios);
  const excluded = profile.explicitExclusions;

  const missingCoverage = [];
  for (const scenario of terminalScenarioNames) {
    if (required.has(scenario) || excluded.has(scenario)) continue;
    missingCoverage.push(scenario);
  }
  if (missingCoverage.length > 0) {
    fail(
      [
        "every terminal scenario must be either requiredScenarios or explicitExclusions in packages/bench/profiles/ci.json",
        `missing: ${missingCoverage.join(", ")}`,
      ].join("\n"),
    );
  }

  const staleExclusions = [];
  for (const scenario of excluded.keys()) {
    if (!terminalScenarioNames.includes(scenario)) {
      staleExclusions.push(scenario);
    }
  }
  if (staleExclusions.length > 0) {
    fail(
      `profile.explicitExclusions contains unknown terminal scenario(s): ${staleExclusions.join(", ")}`,
    );
  }

  return {
    terminalScenarioCount: terminalScenarioNames.length,
    requiredScenarios: profile.requiredScenarios.length,
    explicitExclusions: excluded.size,
  };
}

function verifyCoverage(profile, run) {
  const index = new Map();

  for (const entry of run.results) {
    if (!isPlainObject(entry)) continue;
    if (entry.framework !== profile.framework) continue;
    const scenario =
      typeof entry.scenario === "string" && entry.scenario.length > 0 ? entry.scenario : null;
    if (!scenario) continue;
    const params = normalizeParams(entry.params ?? {}, `results.params(${scenario})`);
    const key = makeKey(scenario, profile.framework, params);
    index.set(key, true);
  }

  for (const scenario of profile.requiredScenarios) {
    const hasAnyForScenario = [...index.keys()].some((key) =>
      key.startsWith(`${scenario}|${profile.framework}|`),
    );
    if (!hasAnyForScenario) {
      fail(`required scenario missing from output: ${scenario} [${profile.framework}]`);
    }
  }

  for (const [scenario, paramSets] of profile.requiredScenarioParams.entries()) {
    for (const params of paramSets) {
      const key = makeKey(scenario, profile.framework, params);
      if (!index.has(key)) {
        fail(
          `required scenario+params missing from output: ${scenario} [${profile.framework}] params=${stableStringify(
            params,
          )}`,
        );
      }
    }
  }

  return {
    requiredScenarios: profile.requiredScenarios.length,
    requiredParamRows: [...profile.requiredScenarioParams.values()].reduce(
      (sum, paramSets) => sum + paramSets.length,
      0,
    ),
    frameworkResultRows: [...index.keys()].length,
  };
}

async function main() {
  const { outputDir: outputDirArg } = parseArgs(process.argv.slice(2));
  const profile = loadCiProfile(PROFILE_PATH);

  if (!existsSync(BENCH_RUNNER_PATH)) {
    fail(`missing bench runner: ${BENCH_RUNNER_PATH}. Run \"npx tsc -b packages/bench\" first.`);
  }
  const terminalScenarioNames = await loadTerminalScenarioManifest();
  const scenarioManifest = verifyScenarioManifest(profile, terminalScenarioNames);

  const outputDir = toAbsPath(outputDirArg ?? profile.outputDir);
  mkdirSync(outputDir, { recursive: true });

  runBench(profile, outputDir);

  const resultsJsonPath = join(outputDir, profile.output.resultsJson);
  const resultsMarkdownPath = join(outputDir, profile.output.resultsMarkdown);

  if (!existsSync(resultsJsonPath)) {
    fail(`bench output missing JSON report: ${resultsJsonPath}`);
  }
  if (!existsSync(resultsMarkdownPath)) {
    fail(`bench output missing markdown report: ${resultsMarkdownPath}`);
  }

  const run = loadBenchRun(resultsJsonPath);
  const coverage = verifyCoverage(profile, run);

  const manifest = {
    profileName: profile.name,
    profilePath: PROFILE_PATH,
    generatedAt: new Date().toISOString(),
    outputDir,
    invocation: {
      suite: profile.suite,
      framework: profile.framework,
      io: profile.io,
      warmup: profile.warmup,
      iterations: profile.iterations,
    },
    output: {
      resultsJson: resultsJsonPath,
      resultsMarkdown: resultsMarkdownPath,
    },
    deterministicOrdering: profile.deterministicOrdering,
    scenarioManifest,
    coverage,
  };

  writeFileSync(join(outputDir, "manifest.json"), `${JSON.stringify(manifest, null, 2)}\n`, "utf8");
  writeFileSync(
    join(outputDir, "profile.json"),
    `${JSON.stringify(
      {
        ...profile,
        requiredScenarioParams: Object.fromEntries(profile.requiredScenarioParams.entries()),
        explicitExclusions: Object.fromEntries(profile.explicitExclusions.entries()),
      },
      null,
      2,
    )}\n`,
    "utf8",
  );

  process.stdout.write(
    `\n[bench:ci] completed. Output: ${outputDir}\n[bench:ci] verified ${coverage.frameworkResultRows} result row(s)\n`,
  );
}

main().catch((error) => fail(error instanceof Error ? error.message : String(error)));
