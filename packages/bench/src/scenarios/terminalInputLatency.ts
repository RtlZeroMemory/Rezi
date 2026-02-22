/**
 * Terminal suite: synthetic input latency
 *
 * Models an "input event -> rerender -> frame delivered" loop by scheduling each
 * update through the event loop. This approximates interactive command-palette /
 * list navigation workloads.
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
import { buildTerminalInputLatencyLines } from "./terminalWorkloads.js";

export const terminalInputLatencyScenario: Scenario = {
  name: "terminal-input-latency",
  description: "Synthetic input event -> frame latency (event-loop scheduled updates)",
  defaultConfig: { warmup: 100, iterations: 1000 },
  paramSets: [{ rows: 40, cols: 120 }],
  frameworks: ["rezi-native", "ink", "opentui", "opentui-core", "bubbletea", "blessed", "ratatui"],

  async run(framework: Framework, config: ScenarioConfig, params): Promise<BenchMetrics> {
    tryGc();
    switch (framework) {
      case "rezi-native":
        return runReziLineScenario(config, params, buildTerminalInputLatencyLines, "event-loop");
      case "ink":
        return runInkLineScenario(config, params, buildTerminalInputLatencyLines, "event-loop");
      case "opentui":
      case "opentui-core":
      case "bubbletea":
        return runOpenTuiScenario("terminal-input-latency", config, params);
      case "blessed":
        return runBlessedLineScenario(config, params, buildTerminalInputLatencyLines, "event-loop");
      case "ratatui":
        return runRatatuiScenario("terminal-input-latency", config, params);
      default:
        throw new Error(`Unsupported framework for terminal-input-latency: ${framework}`);
    }
  },
};
