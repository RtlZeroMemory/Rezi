/**
 * Terminal suite: memory soak
 *
 * Long-running steady churn to expose allocator pressure and retained memory.
 * This complements the short latency-focused terminal scenarios.
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
import { buildTerminalMemorySoakLines } from "./terminalWorkloads.js";

export const terminalMemorySoakScenario: Scenario = {
  name: "terminal-memory-soak",
  description: "Sustained churn workload to observe memory growth and long-run stability",
  defaultConfig: { warmup: 150, iterations: 1200 },
  paramSets: [{ rows: 40, cols: 120 }],
  frameworks: ["rezi-native", "ink", "opentui", "bubbletea", "blessed", "ratatui"],

  async run(framework: Framework, config: ScenarioConfig, params): Promise<BenchMetrics> {
    tryGc();
    switch (framework) {
      case "rezi-native":
        return runReziLineScenario(config, params, buildTerminalMemorySoakLines);
      case "ink":
        return runInkLineScenario(config, params, buildTerminalMemorySoakLines);
      case "opentui":
        return runOpenTuiScenario("terminal-memory-soak", config, params);
      case "blessed":
        return runBlessedLineScenario(config, params, buildTerminalMemorySoakLines);
      case "ratatui":
        return runRatatuiScenario("terminal-memory-soak", config, params);
      default:
        throw new Error(`Unsupported framework for terminal-memory-soak: ${framework}`);
    }
  },
};
