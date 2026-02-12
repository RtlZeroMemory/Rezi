#!/usr/bin/env node
/**
 * Benchmark runner entry point.
 *
 * Usage:
 *   node --expose-gc packages/bench/dist/run.js [options]
 *
 * Options:
 *   --suite <name>          "all" (default) or "terminal" (includes blessed + ratatui)
 *   --scenario <name>       Run only this scenario (default: all)
 *   --framework <name>      Run only this framework (default: all)
 *   --iterations <n>        Override iteration count
 *   --warmup <n>            Override warmup count
 *   --json                  Output raw JSON instead of table
 *   --markdown              Output markdown report
 *   --output <path>         Write results to file
 *   --output-dir <path>     Write JSON + markdown into directory
 *   --io <mode>             "stub" (default) or "pty" (real TTY mode)
 *   --quick                 Quick mode: fewer iterations (good for CI)
 */

import { spawn } from "node:child_process";
import { constants, accessSync, mkdirSync, readFileSync, unlinkSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";
import * as os from "node:os";
import { fileURLToPath } from "node:url";
import { tryGc } from "./measure.js";
import { optionalImport } from "./optionalImport.js";
import { printTerminalTable, toJSON, toMarkdown } from "./report.js";
import { scenarios } from "./scenarios/index.js";
import type { BenchResult, BenchRun, Framework, ScenarioConfig } from "./types.js";

// ── CLI Parsing ─────────────────────────────────────────────────────

interface CliOpts {
  suite: "all" | "terminal";
  scenario: string | null;
  framework: Framework | null;
  iterations: number | null;
  warmup: number | null;
  json: boolean;
  markdown: boolean;
  output: string | null;
  outputDir: string | null;
  io: "stub" | "pty";
  quick: boolean;
}

function parseArgs(argv: string[]): CliOpts {
  const opts: CliOpts = {
    suite: "all",
    scenario: null,
    framework: null,
    iterations: null,
    warmup: null,
    json: false,
    markdown: false,
    output: null,
    outputDir: null,
    io: "stub",
    quick: false,
  };

  for (let i = 2; i < argv.length; i++) {
    const arg = argv[i];
    switch (arg) {
      case "--suite": {
        const v = argv[++i] ?? "";
        opts.suite = v === "terminal" ? "terminal" : "all";
        break;
      }
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
      case "--output-dir":
        opts.outputDir = argv[++i] ?? null;
        break;
      case "--io": {
        const v = argv[++i] ?? "";
        opts.io = v === "pty" ? "pty" : "stub";
        break;
      }
      case "--quick":
        opts.quick = true;
        break;
    }
  }
  return opts;
}

// ── Availability checks ─────────────────────────────────────────────

async function checkFramework(fw: Framework, io: "stub" | "pty"): Promise<boolean> {
  try {
    switch (fw) {
      case "rezi-native":
        await import("@rezi-ui/core");
        if (io === "pty") await import("@rezi-ui/node");
        return true;
      case "ink-compat":
        await import("@rezi-ui/ink-compat");
        if (io === "pty") await import("@rezi-ui/node");
        return true;
      case "ink":
        await optionalImport("ink");
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

async function runIsolated(
  scenarioName: string,
  framework: Framework,
  config: ScenarioConfig,
  params: Record<string, number | string>,
): Promise<BenchResult> {
  const workerPath = fileURLToPath(new URL("./worker.js", import.meta.url));
  const payload = { scenario: scenarioName, framework, config, params };
  const payloadB64 = Buffer.from(JSON.stringify(payload), "utf-8").toString("base64");

  return new Promise<BenchResult>((resolve, reject) => {
    const child = spawn(process.execPath, ["--expose-gc", workerPath, "--payload", payloadB64], {
      stdio: ["ignore", "pipe", "pipe"],
      env: { ...process.env },
    });

    let stdout = "";
    let stderr = "";
    child.stdout?.setEncoding("utf-8");
    child.stderr?.setEncoding("utf-8");
    child.stdout?.on("data", (d) => {
      stdout += String(d);
    });
    child.stderr?.on("data", (d) => {
      stderr += String(d);
    });

    child.on("error", (err) => reject(err));
    child.on("close", (code) => {
      const line = stdout.trim().split(/\r?\n/).pop() ?? "";
      try {
        const parsed = JSON.parse(line) as
          | { ok: true; result: BenchResult }
          | { ok: false; error: string; timestamp?: string };
        if ("ok" in parsed && parsed.ok) {
          resolve(parsed.result);
          return;
        }
        const msg =
          "ok" in parsed && parsed.ok === false
            ? parsed.error
            : `worker returned invalid JSON: ${line.slice(0, 200)}`;
        reject(new Error(`${msg}${stderr ? `\n${stderr}` : ""}`));
      } catch (err) {
        reject(
          new Error(
            `worker failed (exit=${code ?? "?"}). stdout="${stdout.slice(0, 200)}" stderr="${stderr.slice(0, 200)}" err=${
              err instanceof Error ? err.message : String(err)
            }`,
          ),
        );
      }
    });
  });
}

async function runIsolatedPty(
  scenarioName: string,
  framework: Framework,
  config: ScenarioConfig,
  params: Record<string, number | string>,
): Promise<BenchResult> {
  type PtyExit = Readonly<{ exitCode: number; signal?: number }>;
  type PtyProcess = Readonly<{
    onData: (cb: (data: string) => void) => void;
    onExit: (cb: (e: PtyExit) => void) => void;
  }>;
  type PtySpawn = (file: string, args: string[], opts: unknown) => PtyProcess;

  let ptySpawn: PtySpawn | null = null;
  try {
    const require = createRequire(import.meta.url);
    const mod = require("node-pty") as unknown;
    const spawn = (mod as { spawn?: unknown }).spawn;
    ptySpawn = typeof spawn === "function" ? (spawn as PtySpawn) : null;
  } catch {
    // ignore
  }
  if (!ptySpawn) {
    throw new Error(
      'PTY mode requires "node-pty". Install it: npm i -w @rezi-ui/bench -D node-pty',
    );
  }

  const workerPath = fileURLToPath(new URL("./worker.js", import.meta.url));
  const payload = { scenario: scenarioName, framework, config, params };
  const payloadB64 = Buffer.from(JSON.stringify(payload), "utf-8").toString("base64");
  const resultPath = `${os.tmpdir()}/rezi-bench-${process.pid}-${Date.now()}-${Math.random().toString(16).slice(2)}.json`;

  return new Promise<BenchResult>((resolve, reject) => {
    const pty = ptySpawn(
      process.execPath,
      ["--expose-gc", workerPath, "--payload", payloadB64, "--result-path", resultPath],
      {
        name: "xterm-256color",
        cols: 120,
        rows: 40,
        cwd: process.cwd(),
        env: {
          ...process.env,
          REZI_BENCH_IO: "terminal",
          TERM: "xterm-256color",
        },
      },
    );

    pty.onData(() => {});

    pty.onExit(({ exitCode, signal }) => {
      try {
        const json = readFileSync(resultPath, "utf-8");
        const parsed = JSON.parse(json) as
          | { ok: true; result: BenchResult }
          | { ok: false; error: string };
        if ("ok" in parsed && parsed.ok) {
          resolve(parsed.result);
          return;
        }
        reject(new Error("ok" in parsed ? parsed.error : "invalid result payload"));
      } catch (err) {
        reject(
          new Error(
            `pty worker failed (exit=${exitCode}, signal=${String(signal ?? "")}): ${
              err instanceof Error ? err.message : String(err)
            }`,
          ),
        );
      } finally {
        try {
          unlinkSync(resultPath);
        } catch {
          // ignore
        }
      }
    });
  });
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
    const ok = await checkFramework(fw, opts.io);
    availableFrameworks.set(fw, ok);
    if (!ok) {
      console.log(`  [skip] ${fw}: not installed`);
    }
  }
  console.log();

  // Collect scenarios to run
  const suiteScenarios =
    opts.suite === "terminal" ? scenarios.filter((s) => s.name.startsWith("terminal-")) : scenarios;
  const toRun = opts.scenario
    ? suiteScenarios.filter((s) => s.name === opts.scenario)
    : [...suiteScenarios];

  if (toRun.length === 0) {
    console.error(
      `No scenario matching "${opts.scenario}". Available: ${scenarios.map((s) => s.name).join(", ")}`,
    );
    process.exit(1);
  }

  const results: BenchResult[] = [];
  const run: BenchRun = {
    meta: {
      timestamp: new Date().toISOString(),
      nodeVersion: process.version,
      platform: process.platform,
      arch: process.arch,
      osType: os.type(),
      osRelease: os.release(),
      cpuModel: os.cpus()[0]?.model ?? "unknown",
      cpuCores: os.cpus().length,
      memoryTotalMb: Math.round(os.totalmem() / (1024 * 1024)),
    },
    invocation: {
      suite: opts.suite,
      scenarioFilter: opts.scenario,
      frameworkFilter: opts.framework,
      iterationsOverride: opts.iterations,
      warmupOverride: opts.warmup,
      quick: opts.quick,
      ioMode: opts.io,
    },
    results,
  };

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
          const r =
            opts.io === "pty"
              ? await runIsolatedPty(scenario.name, fw, config, params)
              : await runIsolated(scenario.name, fw, config, params);
          results.push(r);
          console.log(
            `done (${r.metrics.timing.mean.toFixed(3)}ms avg, ${Math.round(r.metrics.opsPerSec)} ops/s)`,
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
    const json = toJSON(run);
    if (opts.output) {
      writeFileSync(opts.output, json, "utf-8");
      console.log(`\nJSON written to ${opts.output}`);
    } else {
      console.log(json);
    }
  } else if (opts.markdown) {
    const md = toMarkdown(run);
    if (opts.output) {
      writeFileSync(opts.output, md, "utf-8");
      console.log(`\nMarkdown written to ${opts.output}`);
    } else {
      console.log(md);
    }
  } else {
    printTerminalTable(results);

    if (opts.output) {
      writeFileSync(opts.output, toJSON(run), "utf-8");
      console.log(`JSON written to ${opts.output}`);
    }
  }

  if (opts.outputDir) {
    const dir = opts.outputDir.replace(/\/+$/, "");
    mkdirSync(dir, { recursive: true });
    const jsonPath = `${dir}/results.json`;
    const mdPath = `${dir}/results.md`;
    writeFileSync(jsonPath, toJSON(run), "utf-8");
    writeFileSync(mdPath, toMarkdown(run), "utf-8");
    console.log(`\nWrote ${jsonPath} and ${mdPath}`);
  }
}

main().catch((err) => {
  console.error("Benchmark runner failed:", err);
  process.exit(1);
});
