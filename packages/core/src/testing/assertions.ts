import type { RoutedAction } from "../runtime/router/types.js";
import type {
  ScenarioCursorAssertion,
  ScenarioCursorSnapshot,
  ScenarioDefinition,
  ScenarioInvariantAssertion,
  ScenarioMismatch,
  ScenarioRunResult,
  ScenarioScreenRegionAssertion,
  ScenarioScreenSnapshot,
} from "./scenario.js";

function isObjectRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function matchesSubset(actual: unknown, expected: unknown): boolean {
  if (expected === undefined) return true;
  if (Array.isArray(expected)) {
    if (!Array.isArray(actual) || actual.length !== expected.length) return false;
    for (let i = 0; i < expected.length; i++) {
      if (!matchesSubset(actual[i], expected[i])) return false;
    }
    return true;
  }
  if (isObjectRecord(expected)) {
    if (!isObjectRecord(actual)) return false;
    for (const [key, value] of Object.entries(expected)) {
      if (!matchesSubset(actual[key], value)) return false;
    }
    return true;
  }
  return Object.is(actual, expected);
}

function actionPayload(action: RoutedAction): Readonly<Record<string, unknown>> {
  const payload: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(action)) {
    if (key === "id" || key === "action") continue;
    payload[key] = value;
  }
  return payload;
}

function actionEquals(expected: RoutedAction, actual: RoutedAction): boolean {
  if (expected.id !== actual.id || expected.action !== actual.action) return false;
  return matchesSubset(actionPayload(actual), actionPayload(expected));
}

export function assertScenarioActions(
  actual: readonly RoutedAction[],
  expected: readonly RoutedAction[] | undefined,
): readonly ScenarioMismatch[] {
  if (expected === undefined) return Object.freeze([]);
  const mismatches: ScenarioMismatch[] = [];
  if (actual.length !== expected.length) {
    mismatches.push({
      code: "ZR_SCENARIO_ACTION_COUNT_MISMATCH",
      path: "expectedActions",
      detail: `Expected ${String(expected.length)} actions, observed ${String(actual.length)}`,
      expected: expected.length,
      actual: actual.length,
    });
  }
  const max = Math.max(actual.length, expected.length);
  for (let index = 0; index < max; index++) {
    const want = expected[index];
    const got = actual[index];
    if (want === undefined || got === undefined) continue;
    if (actionEquals(want, got)) continue;
    mismatches.push({
      code: "ZR_SCENARIO_ACTION_MISMATCH",
      path: `expectedActions[${String(index)}]`,
      detail: `Observed action does not match expected action at index ${String(index)}`,
      expected: want,
      actual: got,
    });
  }
  return Object.freeze(mismatches);
}

export function assertScreenRegion(
  screen: ScenarioScreenSnapshot,
  args: ScenarioScreenRegionAssertion,
  path: string,
): ScenarioMismatch | null {
  const expectedSource = typeof args.text === "string" ? args.text.split("\n") : [...args.text];
  const expectedLines = expectedSource.map((line: string) =>
    line.padEnd(args.width, " ").slice(0, args.width),
  );
  const actualLines: string[] = [];
  for (let row = 0; row < args.height; row++) {
    const line = screen.lines[args.y + row] ?? "".padEnd(screen.cols, " ");
    actualLines.push(line.slice(args.x, args.x + args.width).padEnd(args.width, " "));
  }
  const matchMode = args.match ?? "exact";
  const passed =
    matchMode === "includes"
      ? expectedLines.every((line: string, index: number) =>
          (actualLines[index] ?? "").includes(line.trimEnd()),
        )
      : expectedLines.length === actualLines.length &&
        expectedLines.every((line: string, index: number) => line === (actualLines[index] ?? ""));
  if (passed) return null;
  return {
    code: "ZR_SCENARIO_SCREEN_MISMATCH",
    path,
    detail: `Screen region assertion failed (${matchMode})`,
    expected: expectedLines,
    actual: actualLines,
  };
}

export function assertCursor(
  actual: ScenarioCursorSnapshot | null,
  expected: ScenarioCursorAssertion | undefined,
): ScenarioMismatch | null {
  if (expected === undefined) return null;
  if (actual === null) {
    return {
      code: "ZR_SCENARIO_CURSOR_MISMATCH",
      path: "expectedCursorState",
      detail: "Expected cursor snapshot but none was captured",
      expected,
      actual: null,
    };
  }
  if (
    actual.visible !== expected.visible ||
    actual.shape !== expected.shape ||
    actual.blink !== expected.blink
  ) {
    return {
      code: "ZR_SCENARIO_CURSOR_MISMATCH",
      path: "expectedCursorState",
      detail: "Cursor visibility or styling did not match expected state",
      expected,
      actual,
    };
  }
  if (expected.visible && actual.visible && (actual.x !== expected.x || actual.y !== expected.y)) {
    return {
      code: "ZR_SCENARIO_CURSOR_MISMATCH",
      path: "expectedCursorState",
      detail: "Cursor position did not match expected state",
      expected,
      actual,
    };
  }
  return null;
}

function assertInvariant(
  actual: readonly RoutedAction[],
  invariant: ScenarioInvariantAssertion,
  path: string,
): ScenarioMismatch | null {
  if (invariant.kind === "action_absence") {
    const found = actual.find((action) => {
      if (invariant.action.id !== undefined && action.id !== invariant.action.id) return false;
      if (invariant.action.action !== undefined && action.action !== invariant.action.action) {
        return false;
      }
      return matchesSubset(actionPayload(action), invariant.action.payloadSubset);
    });
    if (found === undefined) return null;
    return {
      code: "ZR_SCENARIO_INVARIANT_MISMATCH",
      path,
      detail: "Invariant failed: forbidden action was observed",
      expected: invariant,
      actual: found,
    };
  }
  return {
    code: "ZR_SCENARIO_UNSUPPORTED",
    path,
    detail: `Unsupported invariant kind ${String((invariant as { kind: string }).kind)}`,
  };
}

export function evaluateScenarioResult(
  scenario: ScenarioDefinition,
  partial: Omit<ScenarioRunResult, "status" | "pass" | "mismatches">,
): ScenarioRunResult {
  const mismatches: ScenarioMismatch[] = [];
  mismatches.push(...assertScenarioActions(partial.actions, scenario.expectedActions));
  for (const checkpoint of scenario.expectedScreenCheckpoints) {
    const step = partial.steps.find((item) => item.step === checkpoint.afterStep);
    if (!step) {
      mismatches.push({
        code: "ZR_SCENARIO_SCREEN_MISMATCH",
        path: `expectedScreenCheckpoints.${checkpoint.id}`,
        detail: `No observation was captured for step ${String(checkpoint.afterStep)}`,
      });
      continue;
    }
    const mismatch = assertScreenRegion(
      step.screen,
      checkpoint.args,
      `expectedScreenCheckpoints.${checkpoint.id}`,
    );
    if (mismatch) mismatches.push(mismatch);
  }
  const cursorMismatch = assertCursor(partial.finalCursor, scenario.expectedCursorState);
  if (cursorMismatch) mismatches.push(cursorMismatch);
  for (const invariant of scenario.invariants) {
    const mismatch = assertInvariant(partial.actions, invariant.args, `invariants.${invariant.id}`);
    if (mismatch) mismatches.push(mismatch);
  }
  return Object.freeze({
    ...partial,
    status: mismatches.length === 0 ? "PASS" : "FAIL",
    pass: mismatches.length === 0,
    mismatches: Object.freeze(mismatches),
  });
}
