/**
 * Terminal suite: Full UI navigation flow (cross-framework)
 *
 * Simulates route/page transitions for an end-to-end terminal app shell while
 * preserving deterministic content across frameworks.
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
import { buildTerminalFullUiNavigationLines } from "./terminalWorkloads.js";

export const terminalFullUiNavigationScenario: Scenario = {
  name: "terminal-full-ui-navigation",
  description: "Full-app route flow benchmark (overview/services/deploy/incidents/logs/command)",
  defaultConfig: { warmup: 120, iterations: 1200 },
  paramSets: [{ rows: 40, cols: 120, services: 24, dwell: 8 }],
  frameworks: ["rezi-native", "ink", "opentui", "opentui-core", "bubbletea", "blessed", "ratatui"],

  async run(framework: Framework, config: ScenarioConfig, params): Promise<BenchMetrics> {
    tryGc();
    switch (framework) {
      case "rezi-native":
        return runReziLineScenario(config, params, buildTerminalFullUiNavigationLines);
      case "ink":
        return runInkLineScenario(config, params, buildTerminalFullUiNavigationLines);
      case "opentui":
      case "opentui-core":
      case "bubbletea":
        return runOpenTuiScenario("terminal-full-ui-navigation", config, params);
      case "blessed":
        return runBlessedLineScenario(config, params, buildTerminalFullUiNavigationLines);
      case "ratatui":
        return runRatatuiScenario("terminal-full-ui-navigation", config, params);
      default:
        throw new Error(`Unsupported framework for terminal-full-ui-navigation: ${framework}`);
    }
  },
};
