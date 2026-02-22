/**
 * Terminal suite: Full UI shell (cross-framework)
 *
 * Composite benchmark that keeps all primary surfaces active together:
 * navigation, services table, telemetry bars, inspector, and event stream.
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
import { buildTerminalFullUiLines } from "./terminalWorkloads.js";

export const terminalFullUiScenario: Scenario = {
  name: "terminal-full-ui",
  description: "Full-screen app shell workload (nav + table + telemetry + logs) across frameworks",
  defaultConfig: { warmup: 120, iterations: 1200 },
  paramSets: [{ rows: 40, cols: 120, services: 24 }],
  frameworks: ["rezi-native", "ink", "opentui", "opentui-core", "bubbletea", "blessed", "ratatui"],

  async run(framework: Framework, config: ScenarioConfig, params): Promise<BenchMetrics> {
    tryGc();
    switch (framework) {
      case "rezi-native":
        return runReziLineScenario(config, params, buildTerminalFullUiLines);
      case "ink":
        return runInkLineScenario(config, params, buildTerminalFullUiLines);
      case "opentui":
      case "opentui-core":
      case "bubbletea":
        return runOpenTuiScenario("terminal-full-ui", config, params);
      case "blessed":
        return runBlessedLineScenario(config, params, buildTerminalFullUiLines);
      case "ratatui":
        return runRatatuiScenario("terminal-full-ui", config, params);
      default:
        throw new Error(`Unsupported framework for terminal-full-ui: ${framework}`);
    }
  },
};
