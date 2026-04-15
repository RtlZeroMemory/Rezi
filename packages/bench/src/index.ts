/**
 * @rezi-ui/bench — Benchmark suite for Rezi and terminal UI runtimes.
 *
 * This package is intended to be run via the CLI entry point (run.ts),
 * but exports are available for programmatic use.
 */

export { scenarios, findScenario } from "./scenarios/index.js";
export { computeStats, benchSync, benchAsync, tryGc } from "./measure.js";
export { printTerminalTable, toMarkdown, toJSON } from "./report.js";
export { BenchBackend, MeasuringStream, NullReadable } from "./backends.js";
export type {
  Framework,
  Scenario,
  ScenarioConfig,
  BenchMetrics,
  BenchResult,
  TimingStats,
  MemorySnapshot,
  CpuUsage,
} from "./types.js";
