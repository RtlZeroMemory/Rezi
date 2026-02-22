#!/usr/bin/env node
/**
 * Benchmark runner entry point.
 *
 * Usage:
 *   node --expose-gc packages/bench/dist/run.js [options]
 *
 * Options:
 *   --suite <name>          "all" (default) or "terminal" (includes OpenTUI + Bubble Tea + blessed + ratatui)
 *   --matchup <name>        optional matchup preset: "rezi-opentui" | "rezi-opentui-bubbletea"
 *   --opentui-driver <name> OpenTUI backend: "react" (default) or "core" (imperative)
 *   --scenario <name>       Run only this scenario (default: all)
 *   --framework <name>      Run only this framework (default: all)
 *   --iterations <n>        Override iteration count
 *   --warmup <n>            Override warmup count
 *   --replicates <n>        Repeat each scenario/framework N times
 *   --discard-first-replicate  Run first replicate as warmup and exclude from reports
 *   --shuffle-framework-order   Randomize framework execution order per replicate
 *   --shuffle-seed <seed>   Seed used for deterministic framework shuffling
 *   --env-check <mode>      "off" | "warn" (default) | "strict"
 *   --cpu-affinity <list>   Pin child processes via taskset, e.g. "0-3"
 *   --json                  Output raw JSON instead of table
 *   --markdown              Output markdown report
 *   --output <path>         Write results to file
 *   --output-dir <path>     Write JSON + markdown into directory
 *   --io <mode>             "stub" (default) or "pty" (real TTY mode)
 *   --quick                 Quick mode: fewer iterations (good for CI)
 */

import { spawn, spawnSync } from "node:child_process";
import { constants, accessSync, mkdirSync, readFileSync, unlinkSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";
import * as os from "node:os";
import { fileURLToPath } from "node:url";
import { tryGc } from "./measure.js";
import { printTerminalTable, toJSON, toMarkdown } from "./report.js";
import { scenarios } from "./scenarios/index.js";
import type { BenchResult, BenchRun, Framework, ScenarioConfig } from "./types.js";

// ── CLI Parsing ─────────────────────────────────────────────────────

interface CliOpts {
  suite: "all" | "terminal";
  matchup: "none" | "rezi-opentui" | "rezi-opentui-bubbletea";
  opentuiDriver: "react" | "core";
  scenario: string | null;
  framework: Framework | null;
  iterations: number | null;
  warmup: number | null;
  replicates: number;
  discardFirstReplicate: boolean;
  shuffleFrameworkOrder: boolean;
  shuffleSeed: string;
  envCheck: "off" | "warn" | "strict";
  cpuAffinity: string | null;
  json: boolean;
  markdown: boolean;
  output: string | null;
  outputDir: string | null;
  io: "stub" | "pty";
  quick: boolean;
}

type BenchEnv = NodeJS.ProcessEnv & {
  REZI_BENCH_CPU_AFFINITY?: string;
  REZI_BENCH_OPENTUI_DRIVER?: string;
  REZI_BENCH_OPENTUI_PROVIDER?: string;
};

function parseArgs(argv: string[]): CliOpts {
  const opts: CliOpts = {
    suite: "all",
    matchup: "none",
    opentuiDriver: "react",
    scenario: null,
    framework: null,
    iterations: null,
    warmup: null,
    replicates: 1,
    discardFirstReplicate: false,
    shuffleFrameworkOrder: false,
    shuffleSeed: "rezi-bench-seed",
    envCheck: "warn",
    cpuAffinity: null,
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
      case "--matchup": {
        const v = (argv[++i] ?? "").toLowerCase();
        if (v === "rezi-opentui") opts.matchup = "rezi-opentui";
        else if (v === "rezi-opentui-bubbletea") opts.matchup = "rezi-opentui-bubbletea";
        else opts.matchup = "none";
        break;
      }
      case "--opentui-driver": {
        const v = (argv[++i] ?? "").toLowerCase();
        opts.opentuiDriver = v === "core" ? "core" : "react";
        break;
      }
      case "--framework":
        opts.framework = (argv[++i] ?? null) as Framework | null;
        break;
      case "--iterations":
        opts.iterations = Number.parseInt(argv[++i] ?? "", 10) || null;
        break;
      case "--warmup":
        opts.warmup = Number.parseInt(argv[++i] ?? "", 10) || null;
        break;
      case "--replicates":
        opts.replicates = Math.max(1, Number.parseInt(argv[++i] ?? "", 10) || 1);
        break;
      case "--discard-first-replicate":
        opts.discardFirstReplicate = true;
        break;
      case "--shuffle-framework-order":
        opts.shuffleFrameworkOrder = true;
        break;
      case "--shuffle-seed":
        opts.shuffleSeed = argv[++i] ?? opts.shuffleSeed;
        break;
      case "--env-check": {
        const mode = (argv[++i] ?? "warn").toLowerCase();
        opts.envCheck = mode === "off" || mode === "strict" || mode === "warn" ? mode : "warn";
        break;
      }
      case "--cpu-affinity":
        opts.cpuAffinity = argv[++i] ?? null;
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

function hashSeed(text: string): number {
  let h = 2166136261 >>> 0;
  for (let i = 0; i < text.length; i++) {
    h ^= text.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

function makeRng(seed: number): () => number {
  let x = seed >>> 0;
  return () => {
    x ^= x << 13;
    x ^= x >>> 17;
    x ^= x << 5;
    return (x >>> 0) / 0x1_0000_0000;
  };
}

function shuffleDeterministic<T>(items: readonly T[], seedText: string): T[] {
  const out = [...items];
  const rnd = makeRng(hashSeed(seedText));
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(rnd() * (i + 1));
    const current = out[i] as T;
    out[i] = out[j] as T;
    out[j] = current;
  }
  return out;
}

let cachedTaskset: string | null | undefined;
function resolveTaskset(): string | null {
  if (cachedTaskset !== undefined) return cachedTaskset;
  if (process.platform !== "linux") {
    cachedTaskset = null;
    return cachedTaskset;
  }
  try {
    const probe = spawnSync("taskset", ["--version"], { stdio: "ignore" });
    cachedTaskset = (probe.status ?? 1) === 0 ? "taskset" : null;
  } catch {
    cachedTaskset = null;
  }
  return cachedTaskset;
}

function withAffinity(
  file: string,
  args: readonly string[],
  cpuAffinity: string | null,
): Readonly<{ file: string; args: string[] }> {
  if (!cpuAffinity) return { file, args: [...args] };
  const taskset = resolveTaskset();
  if (!taskset) {
    throw new Error("--cpu-affinity requires taskset on Linux; taskset not available on this host");
  }
  return { file: taskset, args: ["-c", cpuAffinity, file, ...args] };
}

function readCpuGovernor(): string | null {
  if (process.platform !== "linux") return null;
  try {
    return readFileSync("/sys/devices/system/cpu/cpu0/cpufreq/scaling_governor", "utf-8").trim();
  } catch {
    return null;
  }
}

function isWslHost(): boolean {
  const rel = os.release().toLowerCase();
  return rel.includes("microsoft") || rel.includes("wsl") || "WSL_DISTRO_NAME" in process.env;
}

function detectToolVersion(command: string, args: readonly string[]): string | null {
  try {
    const out = spawnSync(command, args, { encoding: "utf-8" });
    if ((out.status ?? 1) !== 0) return null;
    const text = String(out.stdout ?? "").trim();
    if (!text) return null;
    return text.split(/\r?\n/)[0] ?? null;
  } catch {
    return null;
  }
}

function runEnvironmentChecks(opts: CliOpts): void {
  if (opts.envCheck === "off") return;

  const warnings: string[] = [];
  if (process.platform === "linux") {
    const governor = readCpuGovernor();
    if (governor && governor !== "performance") {
      warnings.push(`CPU governor is "${governor}" (recommended: "performance")`);
    }
  }
  if (isWslHost()) {
    warnings.push("Running on WSL/virtualized kernel can increase benchmark jitter");
  }
  if (opts.cpuAffinity && !resolveTaskset()) {
    warnings.push("--cpu-affinity requested but taskset is unavailable");
  }

  if (warnings.length === 0) return;

  const message = warnings.map((w) => `  [env] ${w}`).join("\n");
  if (opts.envCheck === "strict") {
    throw new Error(`Environment checks failed in strict mode:\n${message}`);
  }
  console.log(message);
  console.log("  [env] continue (env-check=warn)\n");
}

// ── Availability checks ─────────────────────────────────────────────

async function checkFramework(
  fw: Framework,
  io: "stub" | "pty",
  opentuiDriver: "react" | "core",
): Promise<boolean> {
  try {
    switch (fw) {
      case "rezi-native":
        await import("@rezi-ui/core");
        if (io === "pty") await import("@rezi-ui/node");
        return true;
      case "ink-compat":
        return false;
      case "ink":
        await import("ink");
        return true;
      case "opentui":
        if (io !== "pty") return false;
        return (await import("./frameworks/opentui.js")).checkOpenTui(opentuiDriver);
      case "opentui-core":
        if (io !== "pty") return false;
        return (await import("./frameworks/opentui.js")).checkOpenTui("core");
      case "bubbletea":
        if (io !== "pty") return false;
        return (await import("./frameworks/bubbletea.js")).checkBubbleTea();
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
  replicate: number,
  cpuAffinity: string | null,
  opentuiDriver: "react" | "core",
): Promise<BenchResult> {
  const workerPath = fileURLToPath(new URL("./worker.js", import.meta.url));
  const payload = { scenario: scenarioName, framework, config, params, replicate };
  const payloadB64 = Buffer.from(JSON.stringify(payload), "utf-8").toString("base64");

  return new Promise<BenchResult>((resolve, reject) => {
    const env: BenchEnv = { ...process.env };
    if (cpuAffinity) env.REZI_BENCH_CPU_AFFINITY = cpuAffinity;
    env.REZI_BENCH_OPENTUI_DRIVER = framework === "opentui-core" ? "core" : opentuiDriver;
    env.REZI_BENCH_OPENTUI_PROVIDER = framework === "bubbletea" ? "bubbletea" : "opentui";
    const command = withAffinity(
      process.execPath,
      ["--expose-gc", workerPath, "--payload", payloadB64],
      cpuAffinity,
    );
    const child = spawn(command.file, command.args, {
      stdio: ["ignore", "pipe", "pipe"],
      env,
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
          if (parsed.result.metrics.ptyBytesObserved === undefined) {
            parsed.result.metrics.ptyBytesObserved = null;
          }
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
  replicate: number,
  cpuAffinity: string | null,
  opentuiDriver: "react" | "core",
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
  const payload = { scenario: scenarioName, framework, config, params, replicate };
  const payloadB64 = Buffer.from(JSON.stringify(payload), "utf-8").toString("base64");
  const resultPath = `${os.tmpdir()}/rezi-bench-${process.pid}-${Date.now()}-${Math.random().toString(16).slice(2)}.json`;

  return new Promise<BenchResult>((resolve, reject) => {
    const env: BenchEnv = { ...process.env };
    if (cpuAffinity) env.REZI_BENCH_CPU_AFFINITY = cpuAffinity;
    env.REZI_BENCH_OPENTUI_DRIVER = framework === "opentui-core" ? "core" : opentuiDriver;
    env.REZI_BENCH_OPENTUI_PROVIDER = framework === "bubbletea" ? "bubbletea" : "opentui";
    const command = withAffinity(
      process.execPath,
      ["--expose-gc", workerPath, "--payload", payloadB64, "--result-path", resultPath],
      cpuAffinity,
    );
    const pty = ptySpawn(command.file, command.args, {
      name: "xterm-256color",
      cols: 120,
      rows: 40,
      cwd: process.cwd(),
      env: {
        ...env,
        REZI_BENCH_IO: "terminal",
        TERM: "xterm-256color",
      },
    });

    let observedPtyBytes = 0;
    pty.onData((data) => {
      observedPtyBytes += Buffer.byteLength(data, "utf-8");
    });

    pty.onExit(({ exitCode, signal }) => {
      try {
        const json = readFileSync(resultPath, "utf-8");
        const parsed = JSON.parse(json) as
          | { ok: true; result: BenchResult }
          | { ok: false; error: string };
        if ("ok" in parsed && parsed.ok) {
          parsed.result.metrics.ptyBytesObserved = observedPtyBytes;
          // Some frameworks (e.g. OpenTUI) write directly to the fd, bypassing
          // the in-process MeasuringStdout stream, so bytesProduced stays 0.
          // Fall back to the PTY-observed byte count instead of rejecting.
          if (observedPtyBytes > 0 && parsed.result.metrics.bytesProduced <= 0) {
            parsed.result.metrics.bytesProduced = observedPtyBytes;
          }
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

  runEnvironmentChecks(opts);

  // Check which frameworks are available
  const availableFrameworks = new Map<Framework, boolean>();
  for (const fw of [
    "rezi-native",
    "ink",
    "opentui",
    "opentui-core",
    "bubbletea",
    "terminal-kit",
    "blessed",
    "ratatui",
  ] as Framework[]) {
    if (
      opts.matchup === "rezi-opentui" &&
      fw !== "rezi-native" &&
      fw !== "opentui" &&
      fw !== "opentui-core"
    ) {
      availableFrameworks.set(fw, false);
      continue;
    }
    if (
      opts.matchup === "rezi-opentui-bubbletea" &&
      fw !== "rezi-native" &&
      fw !== "opentui" &&
      fw !== "opentui-core" &&
      fw !== "bubbletea"
    ) {
      availableFrameworks.set(fw, false);
      continue;
    }
    if (opts.framework && opts.framework !== fw) {
      availableFrameworks.set(fw, false);
      continue;
    }
    const ok = await checkFramework(fw, opts.io, opts.opentuiDriver);
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
  const bunBin = (process.env as Readonly<{ REZI_BUN_BIN?: string }>).REZI_BUN_BIN ?? "bun";
  const isWsl = isWslHost();
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
      bunVersion: detectToolVersion(bunBin, ["--version"]),
      rustcVersion: detectToolVersion("rustc", ["--version"]),
      cargoVersion: detectToolVersion("cargo", ["--version"]),
      cpuGovernor: readCpuGovernor(),
      isWsl,
      environmentCaveat: isWsl
        ? "Results collected on WSL/virtualized kernel; expect higher timer and I/O jitter."
        : null,
    },
    invocation: {
      suite: opts.suite,
      matchup: opts.matchup,
      opentuiDriver: opts.opentuiDriver,
      scenarioFilter: opts.scenario,
      frameworkFilter: opts.framework,
      iterationsOverride: opts.iterations,
      warmupOverride: opts.warmup,
      quick: opts.quick,
      ioMode: opts.io,
      replicates: opts.replicates,
      discardFirstReplicate: opts.discardFirstReplicate,
      shuffleFrameworkOrder: opts.shuffleFrameworkOrder,
      shuffleSeed: opts.shuffleSeed,
      envCheck: opts.envCheck,
      cpuAffinity: opts.cpuAffinity,
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
      const runnableFrameworks = scenario.frameworks.filter((fw) => availableFrameworks.get(fw));
      if (runnableFrameworks.length === 0) continue;

      for (let replicate = 0; replicate < opts.replicates; replicate++) {
        const discardThisReplicate =
          opts.discardFirstReplicate && opts.replicates > 1 && replicate === 0;

        const orderSeed = `${opts.shuffleSeed}|${label}|replicate=${replicate}`;
        const frameworkOrder = opts.shuffleFrameworkOrder
          ? shuffleDeterministic(runnableFrameworks, orderSeed)
          : [...runnableFrameworks];

        for (const fw of frameworkOrder) {
          const config: ScenarioConfig = {
            warmup: opts.warmup ?? (opts.quick ? 10 : scenario.defaultConfig.warmup),
            iterations: opts.iterations ?? (opts.quick ? 50 : scenario.defaultConfig.iterations),
          };

          process.stdout.write(`  ${label} / ${fw} [rep ${replicate + 1}/${opts.replicates}] ... `);
          tryGc();

          try {
            const r =
              opts.io === "pty"
                ? await runIsolatedPty(
                    scenario.name,
                    fw,
                    config,
                    params,
                    replicate,
                    opts.cpuAffinity,
                    opts.opentuiDriver,
                  )
                : await runIsolated(
                    scenario.name,
                    fw,
                    config,
                    params,
                    replicate,
                    opts.cpuAffinity,
                    opts.opentuiDriver,
                  );

            if (discardThisReplicate) {
              console.log(
                `warmup discard (${r.metrics.timing.mean.toFixed(3)}ms avg, ${Math.round(r.metrics.opsPerSec)} ops/s)`,
              );
            } else {
              results.push(r);
              console.log(
                `done (${r.metrics.timing.mean.toFixed(3)}ms avg, ${Math.round(r.metrics.opsPerSec)} ops/s)`,
              );
            }
          } catch (err) {
            console.log(`FAILED: ${err instanceof Error ? err.message : String(err)}`);
          }
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
