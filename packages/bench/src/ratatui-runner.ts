/**
 * Ratatui benchmark runner.
 *
 * Manages the Rust ratatui-bench binary: builds it if needed, then
 * shells out to run individual scenarios and parses the JSON output
 * back into BenchMetrics.
 */

import { execFileSync, execSync } from "node:child_process";
import { existsSync } from "node:fs";
import { resolve } from "node:path";
import { computeStats, takeMemory } from "./measure.js";
import type { BenchMetrics, ScenarioConfig } from "./types.js";

const BENCH_DIR = resolve(import.meta.dirname ?? ".", "..", "ratatui-bench");
const BINARY = resolve(BENCH_DIR, "target", "release", "ratatui-bench");

/** Check if we can build/run the ratatui benchmark. */
export function checkRatatui(): boolean {
  try {
    execSync("cargo --version", { stdio: "ignore" });
    return existsSync(resolve(BENCH_DIR, "Cargo.toml"));
  } catch {
    return false;
  }
}

let _built = false;
let _buildError: Error | null = null;

/** Build the ratatui-bench binary in release mode. */
export function ensureBuilt(): void {
  if (_built && existsSync(BINARY)) return;
  if (existsSync(BINARY)) {
    _built = true;
    return;
  }
  if (_buildError) throw _buildError;
  console.log("\n  [ratatui] Building release binary...");
  try {
    execSync("cargo build --release", {
      cwd: BENCH_DIR,
      stdio: ["ignore", "ignore", "inherit"],
      timeout: 120_000,
    });
    _built = true;
  } catch (err) {
    // We sometimes end up with a corrupt/half-populated `target/` (e.g., checked-in artifacts,
    // interrupted builds). A clean rebuild is a pragmatic recovery path.
    console.log("  [ratatui] Build failed; running `cargo clean` and retrying once...");
    try {
      execSync("cargo clean", { cwd: BENCH_DIR, stdio: ["ignore", "ignore", "inherit"] });
      execSync("cargo build --release", {
        cwd: BENCH_DIR,
        stdio: ["ignore", "ignore", "inherit"],
        timeout: 120_000,
      });
      _built = true;
    } catch (err2) {
      _buildError =
        err2 instanceof Error ? err2 : new Error(`ratatui ensureBuilt failed: ${String(err2)}`);
      throw _buildError;
    }
  }
}

interface RatatuiOutput {
  timing: {
    mean: number;
    median: number;
    p95: number;
    p99: number;
    min: number;
    max: number;
    stddev: number;
    cv: number;
  };
  iterations: number;
  total_wall_ms: number;
  ops_per_sec: number;
  peak_rss_kb: number;
}

/**
 * Run a ratatui scenario and return BenchMetrics.
 */
export function runRatatui(
  scenario: string,
  config: ScenarioConfig,
  params: Readonly<{ items?: number | string }> = {},
): BenchMetrics {
  ensureBuilt();

  const args = [
    "--scenario",
    scenario,
    "--warmup",
    String(config.warmup),
    "--iterations",
    String(config.iterations),
  ];

  if (params.items !== undefined) {
    args.push("--items", String(params.items));
  }

  const stdout = execFileSync(BINARY, args, {
    timeout: 300_000,
    encoding: "utf-8",
    stdio: ["ignore", "pipe", "inherit"],
  });

  const output: RatatuiOutput = JSON.parse(stdout.trim());

  // We can't measure Ratatui's memory from inside Node, so use its self-report
  const memSnapshot = {
    rssKb: output.peak_rss_kb,
    heapUsedKb: 0, // N/A for Rust
    heapTotalKb: 0,
    externalKb: 0,
    arrayBuffersKb: 0,
  };

  return {
    timing: output.timing,
    memBefore: memSnapshot,
    memAfter: memSnapshot,
    memPeak: memSnapshot,
    cpu: { userMs: 0, systemMs: 0 }, // would need /proc/self/stat parsing
    iterations: output.iterations,
    totalWallMs: output.total_wall_ms,
    opsPerSec: output.ops_per_sec,
    framesProduced: output.iterations,
    bytesProduced: 0,
  };
}
