import type { CursorShape } from "../abi.js";
import type { App } from "../app/types.js";
import type { RoutedAction } from "../runtime/router/types.js";
import type { ThemeDefinition } from "../theme/tokens.js";
import type { VNode } from "../widgets/types.js";

export type ScenarioWidgetFamily =
  | "input-textarea"
  | "select-dropdown"
  | "modal-overlay-dialog"
  | "table-tree-virtual-list";

export type ScenarioColorMode = "none" | "16" | "256" | "truecolor";
export type ScenarioTheme = Readonly<{ mode: "named"; value: "default" }>;
export type ScenarioKeyMod = "shift" | "ctrl" | "alt" | "meta";

export type ScenarioCapabilityProfile = Readonly<{
  supportsMouse: boolean;
  supportsBracketedPaste: boolean;
  supportsFocusEvents: boolean;
  supportsOsc52: boolean;
  colorMode: ScenarioColorMode;
}>;

export type ScenarioScriptedInputEvent =
  | Readonly<{ kind: "text"; text: string }>
  | Readonly<{ kind: "paste"; text: string }>
  | Readonly<{ kind: "resize"; cols: number; rows: number }>
  | Readonly<{ kind: "key"; key: string | number; mods?: readonly ScenarioKeyMod[] }>;

export type ScenarioScriptedInputStep = Readonly<{
  atMs: number;
  event: ScenarioScriptedInputEvent;
}>;

export type ScenarioExpectedAction = RoutedAction;

export type ScenarioScreenRegionAssertion = Readonly<{
  x: number;
  y: number;
  width: number;
  height: number;
  match?: "exact" | "includes";
  text: string | readonly string[];
}>;

export type ScenarioCursorAssertion =
  | Readonly<{
      visible: false;
      shape: CursorShape;
      blink: boolean;
    }>
  | Readonly<{
      visible: true;
      x: number;
      y: number;
      shape: CursorShape;
      blink: boolean;
    }>;

export type ScenarioInvariantAssertion = Readonly<{
  kind: "action_absence";
  action: Readonly<{
    id?: string;
    action?: RoutedAction["action"];
    payloadSubset?: Readonly<Record<string, unknown>>;
  }>;
}>;

export type ScenarioScreenCheckpoint = Readonly<{
  id: string;
  afterStep: number;
  assertionRef: "screen_region_assertion";
  args: ScenarioScreenRegionAssertion;
}>;

export type ScenarioInvariant = Readonly<{
  id: string;
  assertionRef: "invariant_assertion";
  args: ScenarioInvariantAssertion;
}>;

export type ScenarioDefinition = Readonly<{
  schemaVersion: 1;
  id: string;
  title: string;
  widgetFamily: ScenarioWidgetFamily;
  behaviorStatement: string;
  evidenceRefs: readonly string[];
  viewport: Readonly<{ cols: number; rows: number }>;
  theme: ScenarioTheme;
  capabilityProfile: ScenarioCapabilityProfile;
  scriptedInput: readonly ScenarioScriptedInputStep[];
  expectedActions?: readonly ScenarioExpectedAction[];
  expectedScreenCheckpoints: readonly ScenarioScreenCheckpoint[];
  expectedCursorState?: ScenarioCursorAssertion;
  invariants: readonly ScenarioInvariant[];
  fidelityRequirement: "semantic-only" | "terminal-real";
  notes?: string;
  unresolvedAssumptions?: readonly string[];
}>;

export type ScenarioScreenSnapshot = Readonly<{
  cols: number;
  rows: number;
  lines: readonly string[];
}>;

export type ScenarioCursorSnapshot = ScenarioCursorAssertion;

export type ScenarioStepObservation = Readonly<{
  step: number;
  screen: ScenarioScreenSnapshot;
  cursor: ScenarioCursorSnapshot | null;
  actions: readonly ScenarioExpectedAction[];
}>;

export type ScenarioMismatchCode =
  | "ZR_SCENARIO_INVALID"
  | "ZR_SCENARIO_UNSUPPORTED"
  | "ZR_SCENARIO_ACTION_COUNT_MISMATCH"
  | "ZR_SCENARIO_ACTION_MISMATCH"
  | "ZR_SCENARIO_SCREEN_MISMATCH"
  | "ZR_SCENARIO_CURSOR_MISMATCH"
  | "ZR_SCENARIO_INVARIANT_MISMATCH"
  | "ZR_SCENARIO_RUNTIME_FATAL";

export type ScenarioMismatch = Readonly<{
  code: ScenarioMismatchCode;
  path: string;
  detail: string;
  expected?: unknown;
  actual?: unknown;
}>;

export type ScenarioRunResult = Readonly<{
  mode: "semantic" | "replay" | "pty";
  status: "PASS" | "FAIL";
  pass: boolean;
  actions: readonly ScenarioExpectedAction[];
  steps: readonly ScenarioStepObservation[];
  finalScreen: ScenarioScreenSnapshot;
  finalCursor: ScenarioCursorSnapshot | null;
  mismatches: readonly ScenarioMismatch[];
}>;

export type ScenarioFixture<S> = Readonly<{
  initialState: S;
  theme?: ThemeDefinition;
  setup?: (app: App<S>) => void;
  view: (state: S) => VNode;
}>;

export type ScenarioFixtureFactory<S> = () => ScenarioFixture<S>;

export function createScenarioScreenSnapshot(
  viewport: Readonly<{ cols: number; rows: number }>,
  text: string,
): ScenarioScreenSnapshot {
  const rawLines = text.split("\n");
  const lines: string[] = [];
  for (let row = 0; row < viewport.rows; row++) {
    const raw = rawLines[row] ?? "";
    lines.push(raw.padEnd(viewport.cols, " ").slice(0, viewport.cols));
  }
  return Object.freeze({
    cols: viewport.cols,
    rows: viewport.rows,
    lines: Object.freeze(lines),
  });
}

export function validateScenarioDefinition(
  scenario: ScenarioDefinition,
): readonly ScenarioMismatch[] {
  const mismatches: ScenarioMismatch[] = [];
  if (scenario.schemaVersion !== 1) {
    mismatches.push({
      code: "ZR_SCENARIO_INVALID",
      path: "schemaVersion",
      detail: `Expected schemaVersion=1 (got ${String(scenario.schemaVersion)})`,
      expected: 1,
      actual: scenario.schemaVersion,
    });
  }
  if (scenario.evidenceRefs.length === 0) {
    mismatches.push({
      code: "ZR_SCENARIO_INVALID",
      path: "evidenceRefs",
      detail: "Scenario must include at least one evidenceRef",
    });
  }
  if (scenario.expectedScreenCheckpoints.length === 0) {
    mismatches.push({
      code: "ZR_SCENARIO_INVALID",
      path: "expectedScreenCheckpoints",
      detail: "Scenario must include at least one screen checkpoint",
    });
  }
  if (scenario.invariants.length === 0) {
    mismatches.push({
      code: "ZR_SCENARIO_INVALID",
      path: "invariants",
      detail: "Scenario must include at least one invariant",
    });
  }
  if (scenario.theme.mode !== "named" || scenario.theme.value !== "default") {
    mismatches.push({
      code: "ZR_SCENARIO_UNSUPPORTED",
      path: "theme",
      detail: `Only theme { mode: \"named\", value: \"default\" } is supported in this MVP`,
      expected: { mode: "named", value: "default" },
      actual: scenario.theme,
    });
  }
  return Object.freeze(mismatches);
}
