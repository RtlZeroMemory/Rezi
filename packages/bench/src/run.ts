#!/usr/bin/env node
/**
 * Benchmark runner entry point.
 *
 * Usage:
 *   node --expose-gc packages/bench/dist/run.js [options]
 *
 * Options:
 *   --scenario <name>       Run only this scenario (default: all)
 *   --framework <name>      Run only this framework (default: all)
 *   --iterations <n>        Override iteration count
 *   --warmup <n>            Override warmup count
 *   --json                  Output raw JSON instead of table
 *   --markdown              Output markdown report
 *   --output <path>         Write results to file
 *   --quick                 Quick mode: fewer iterations (good for CI)
 */

import { writeFileSync } from "node:fs";
import { tryGc } from "./measure.js";
import { printTerminalTable, toJSON, toMarkdown } from "./report.js";
import { scenarios } from "./scenarios/index.js";
import type { BenchResult, Framework, ScenarioConfig } from "./types.js";

// ── CLI Parsing ─────────────────────────────────────────────────────

interface CliOpts {
  scenario: string | null;
  framework: Framework | null;
  iterations: number | null;
  warmup: number | null;
  json: boolean;
  markdown: boolean;
  output: string | null;
  quick: boolean;
}

function parseArgs(argv: string[]): CliOpts {
  const opts: CliOpts = {
    scenario: null,
    framework: null,
    iterations: null,
    warmup: null,
    json: false,
    markdown: false,
    output: null,
    quick: false,
  };

  for (let i = 2; i < argv.length; i++) {
    const arg = argv[i];
    switch (arg) {
      case "--scenario":
        opts.scenario = argv[++i] ?? null;
        break;
      case "--framework":
        opts.framework = (argv[++i] ?? null) as Framework | null;
        break;
      case "--iterations":
        opts.iterations = Number.parseInt(argv[++i] ?? "", 10) || null;
        break;
      case "--warmup":
        opts.warmup = Number.parseInt(argv[++i] ?? "", 10) || null;
        break;
      case "--json":
        opts.json = true;
        break;
      case "--markdown":
        opts.markdown = true;
        break;
      case "--output":
        opts.output = argv[++i] ?? null;
        break;
      case "--quick":
        opts.quick = true;
        break;
    }
  }
  return opts;
}

// ── Availability checks ─────────────────────────────────────────────

async function checkFramework(fw: Framework): Promise<boolean> {
  try {
    switch (fw) {
      case "rezi-native":
        await import("@rezi-ui/core");
        return true;
      case "ink-compat":
        await import("@rezi-ui/ink-compat");
        return true;
      case "ink":
        await import("ink");
        return true;
      case "terminal-kit":
        await import("terminal-kit");
        return true;
      case "blessed":
        await import("blessed");
        return true;
      case "ratatui": {
        const { checkRatatui } = await import("./ratatui-runner.js");
        return checkRatatui();
      }
    }
  } catch {
    return false;
  }
}

// ── Main ────────────────────────────────────────────────────────────

async function main(): Promise<void> {
  const opts = parseArgs(process.argv);

  console.log("Rezi Benchmark Suite");
  console.log("====================\n");

  if (typeof globalThis.gc !== "function") {
    console.log("  (hint: run with --expose-gc for more accurate memory measurements)\n");
  }

  // Check which frameworks are available
  const availableFrameworks = new Map<Framework, boolean>();
  for (const fw of [
    "rezi-native",
    "ink-compat",
    "ink",
    "terminal-kit",
    "blessed",
    "ratatui",
  ] as Framework[]) {
    if (opts.framework && opts.framework !== fw) {
      availableFrameworks.set(fw, false);
      continue;
    }
    const ok = await checkFramework(fw);
    availableFrameworks.set(fw, ok);
    if (!ok) {
      console.log(`  [skip] ${fw}: not installed`);
    }
  }
  console.log();

  // Collect scenarios to run
  const toRun = opts.scenario ? scenarios.filter((s) => s.name === opts.scenario) : [...scenarios];

  if (toRun.length === 0) {
    console.error(
      `No scenario matching "${opts.scenario}". Available: ${scenarios.map((s) => s.name).join(", ")}`,
    );
    process.exit(1);
  }

  const results: BenchResult[] = [];
  const timestamp = new Date().toISOString();

  for (const scenario of toRun) {
    const paramSets = scenario.paramSets.length > 0 ? scenario.paramSets : [{}];

    for (const params of paramSets) {
      const paramStr = Object.entries(params)
        .map(([k, v]) => `${k}=${v}`)
        .join(", ");
      const label = paramStr ? `${scenario.name} (${paramStr})` : scenario.name;

      for (const fw of scenario.frameworks) {
        if (!availableFrameworks.get(fw)) continue;

        const config: ScenarioConfig = {
          warmup: opts.warmup ?? (opts.quick ? 10 : scenario.defaultConfig.warmup),
          iterations: opts.iterations ?? (opts.quick ? 50 : scenario.defaultConfig.iterations),
        };

        process.stdout.write(`  ${label} / ${fw} ... `);
        tryGc();

        try {
          const metrics = await scenario.run(fw, config, params);

          results.push({
            scenario: scenario.name,
            framework: fw,
            params: { ...params } as Record<string, number | string>,
            metrics,
            timestamp,
            nodeVersion: process.version,
            platform: process.platform,
            arch: process.arch,
          });

          console.log(
            `done (${metrics.timing.mean.toFixed(3)}ms avg, ${Math.round(metrics.opsPerSec)} ops/s)`,
          );
        } catch (err) {
          console.log(`FAILED: ${err instanceof Error ? err.message : String(err)}`);
        }
      }
    }
  }

  // Output results
  if (results.length === 0) {
    console.log("\nNo results collected.");
    process.exit(1);
  }

  if (opts.json) {
    const json = toJSON(results);
    if (opts.output) {
      writeFileSync(opts.output, json, "utf-8");
      console.log(`\nJSON written to ${opts.output}`);
    } else {
      console.log(json);
    }
  } else if (opts.markdown) {
    const md = toMarkdown(results);
    if (opts.output) {
      writeFileSync(opts.output, md, "utf-8");
      console.log(`\nMarkdown written to ${opts.output}`);
    } else {
      console.log(md);
    }
  } else {
    printTerminalTable(results);

    if (opts.output) {
      writeFileSync(opts.output, toJSON(results), "utf-8");
      console.log(`JSON written to ${opts.output}`);
    }
  }
}

main().catch((err) => {
  console.error("Benchmark runner failed:", err);
  process.exit(1);
});
