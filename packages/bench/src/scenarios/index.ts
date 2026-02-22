/**
 * Scenario registry — all available benchmark scenarios.
 */

import type { Scenario } from "../types.js";
import { constructionScenario } from "./construction.js";
import { contentUpdateScenario } from "./content-update.js";
import { layoutStressScenario } from "./layoutStress.js";
import { memoryScenario } from "./memory.js";
import { rerenderScenario } from "./rerender.js";
import { scrollStressScenario } from "./scrollStress.js";
import { startupScenario } from "./startup.js";
import { tableScenario } from "./tables.js";
import { terminalFpsStreamScenario } from "./terminalFpsStream.js";
import { terminalFrameFillScenario } from "./terminalFrameFill.js";
import { terminalFullUiScenario } from "./terminalFullUi.js";
import { terminalFullUiNavigationScenario } from "./terminalFullUiNavigation.js";
import { terminalInputLatencyScenario } from "./terminalInputLatency.js";
import { terminalMemorySoakScenario } from "./terminalMemorySoak.js";
import { terminalRerenderScenario } from "./terminalRerender.js";
import { terminalScreenTransitionScenario } from "./terminalScreenTransition.js";
import { terminalStrictUiScenario } from "./terminalStrictUi.js";
import { terminalStrictUiNavigationScenario } from "./terminalStrictUiNavigation.js";
import { terminalTableScenario } from "./terminalTable.js";
import { terminalVirtualListScenario } from "./terminalVirtualList.js";
import { virtualListScenario } from "./virtualList.js";

export const scenarios: readonly Scenario[] = [
  startupScenario,
  constructionScenario,
  rerenderScenario,
  contentUpdateScenario,
  layoutStressScenario,
  scrollStressScenario,
  virtualListScenario,
  tableScenario,
  memoryScenario,
  // Cross-framework competitor suite (OpenTUI, blessed, ratatui) — run with: --suite terminal --io pty
  terminalRerenderScenario,
  terminalFrameFillScenario,
  terminalScreenTransitionScenario,
  terminalFpsStreamScenario,
  terminalInputLatencyScenario,
  terminalMemorySoakScenario,
  terminalFullUiScenario,
  terminalFullUiNavigationScenario,
  terminalStrictUiScenario,
  terminalStrictUiNavigationScenario,
  terminalVirtualListScenario,
  terminalTableScenario,
];

export function findScenario(name: string): Scenario | undefined {
  return scenarios.find((s) => s.name === name);
}
