/**
 * Terminal suite: Strict apples-to-apples navigation benchmark.
 *
 * Exercises page/route transitions while keeping panelized structure consistent
 * across frameworks.
 */

import { tryGc } from "../measure.js";
import type { BenchMetrics, Framework, Scenario, ScenarioConfig } from "../types.js";
import { runTerminalStrictScenario } from "./terminalStrictBench.js";

export const terminalStrictUiNavigationScenario: Scenario = {
  name: "terminal-strict-ui-navigation",
  description: "Strict full UI navigation benchmark with structured panel composition",
  defaultConfig: { warmup: 120, iterations: 1200 },
  paramSets: [{ rows: 40, cols: 120, services: 24, dwell: 8 }],
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
        return runTerminalStrictScenario(framework, config, params, "navigation");
      default:
        throw new Error(`Unsupported framework for terminal-strict-ui-navigation: ${framework}`);
    }
  },
};
