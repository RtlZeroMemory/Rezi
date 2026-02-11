/**
 * Scenario registry — all available benchmark scenarios.
 */

import type { Scenario } from "../types.js";
import { constructionScenario } from "./construction.js";
import { contentUpdateScenario } from "./content-update.js";
import { memoryScenario } from "./memory.js";
import { rerenderScenario } from "./rerender.js";
import { startupScenario } from "./startup.js";

export const scenarios: readonly Scenario[] = [
  startupScenario,
  constructionScenario,
  rerenderScenario,
  contentUpdateScenario,
  memoryScenario,
];

export function findScenario(name: string): Scenario | undefined {
  return scenarios.find((s) => s.name === name);
}
