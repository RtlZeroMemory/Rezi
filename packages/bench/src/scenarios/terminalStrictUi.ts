/**
 * Terminal suite: Strict apples-to-apples full UI benchmark.
 *
 * Uses a structured layout in every framework path (panels + titles + sections)
 * to reduce bias from line-only primitive update loops.
 */

import { tryGc } from "../measure.js";
import type { BenchMetrics, Framework, Scenario, ScenarioConfig } from "../types.js";
import { runTerminalStrictScenario } from "./terminalStrictBench.js";

export const terminalStrictUiScenario: Scenario = {
  name: "terminal-strict-ui",
  description: "Strict full UI dashboard benchmark with structured panel composition",
  defaultConfig: { warmup: 120, iterations: 1200 },
  paramSets: [{ rows: 40, cols: 120, services: 24 }],
  frameworks: ["rezi-native", "ink", "opentui", "opentui-core", "bubbletea", "blessed", "ratatui"],

  async run(framework: Framework, config: ScenarioConfig, params): Promise<BenchMetrics> {
    tryGc();
    switch (framework) {
      case "rezi-native":
      case "ink":
      case "opentui":
      case "opentui-core":
      case "bubbletea":
      case "blessed":
      case "ratatui":
        return runTerminalStrictScenario(framework, config, params, "dashboard");
      default:
        throw new Error(`Unsupported framework for terminal-strict-ui: ${framework}`);
    }
  },
};
