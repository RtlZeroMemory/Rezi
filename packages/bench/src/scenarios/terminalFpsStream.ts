/**
 * Terminal suite: 60fps-style stream
 *
 * Simulates continuously changing telemetry channels to stress sustained,
 * frame-heavy update pipelines.
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
import { buildTerminalFpsStreamLines } from "./terminalWorkloads.js";

export const terminalFpsStreamScenario: Scenario = {
  name: "terminal-fps-stream",
  description: "Sustained telemetry stream updates (60fps-like incremental frame churn)",
  defaultConfig: { warmup: 100, iterations: 1200 },
  paramSets: [{ rows: 40, cols: 120, channels: 12 }],
  frameworks: ["rezi-native", "ink", "opentui", "opentui-core", "bubbletea", "blessed", "ratatui"],

  async run(framework: Framework, config: ScenarioConfig, params): Promise<BenchMetrics> {
    tryGc();
    switch (framework) {
      case "rezi-native":
        return runReziLineScenario(config, params, buildTerminalFpsStreamLines);
      case "ink":
        return runInkLineScenario(config, params, buildTerminalFpsStreamLines);
      case "opentui":
      case "opentui-core":
      case "bubbletea":
        return runOpenTuiScenario("terminal-fps-stream", config, params);
      case "blessed":
        return runBlessedLineScenario(config, params, buildTerminalFpsStreamLines);
      case "ratatui":
        return runRatatuiScenario("terminal-fps-stream", config, params);
      default:
        throw new Error(`Unsupported framework for terminal-fps-stream: ${framework}`);
    }
  },
};
