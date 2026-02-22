/**
 * Terminal suite: screen transitions
 *
 * Cycles through distinct full-screen views (dashboard/table/logs) to
 * capture churn from large subtree replacement.
 */

import { runOpenTuiScenario } from "../frameworks/opentui.js";
import { runRatatuiScenario } from "../frameworks/ratatui.js";
import { tryGc } from "../measure.js";
import type { BenchMetrics, Framework, Scenario, ScenarioConfig } from "../types.js";
import {
  runBlessedLineScenario,
  runInkLineScenario,
  runReziLineScenario,
} from "./terminalLineBench.js";
import { buildTerminalScreenTransitionLines } from "./terminalWorkloads.js";

export const terminalScreenTransitionScenario: Scenario = {
  name: "terminal-screen-transition",
  description: "Cycle between dashboard/table/log screens (full-tree transition workload)",
  defaultConfig: { warmup: 100, iterations: 1000 },
  paramSets: [{ rows: 40, cols: 120 }],
  frameworks: ["rezi-native", "ink", "opentui", "opentui-core", "bubbletea", "blessed", "ratatui"],

  async run(framework: Framework, config: ScenarioConfig, params): Promise<BenchMetrics> {
    tryGc();
    switch (framework) {
      case "rezi-native":
        return runReziLineScenario(config, params, buildTerminalScreenTransitionLines);
      case "ink":
        return runInkLineScenario(config, params, buildTerminalScreenTransitionLines);
      case "opentui":
      case "opentui-core":
      case "bubbletea":
        return runOpenTuiScenario("terminal-screen-transition", config, params);
      case "blessed":
        return runBlessedLineScenario(config, params, buildTerminalScreenTransitionLines);
      case "ratatui":
        return runRatatuiScenario("terminal-screen-transition", config, params);
      default:
        throw new Error(`Unsupported framework for terminal-screen-transition: ${framework}`);
    }
  },
};
