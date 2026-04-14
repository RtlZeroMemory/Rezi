import { assert, test } from "@rezi-ui/testkit";
import type { App } from "../../app/types.js";
import { ui } from "../../index.js";
import {
  type ScenarioDefinition,
  type ScenarioFixtureFactory,
  createReferenceInputModalFixture,
  evaluateScenarioResult,
  referenceInputModalScenario,
  runReplayScenario,
  runSemanticScenario,
} from "../index.js";

type ReplayState = Readonly<{ value: string }>;

const replayScenario: ScenarioDefinition = Object.freeze({
  schemaVersion: 1,
  id: "replay-stateless-input",
  title: "Replay runner supports stateful screen assertions",
  widgetFamily: "input-textarea",
  behaviorStatement: "A replay fixture can update state and assert the resulting screen content.",
  evidenceRefs: Object.freeze([
    "packages/core/src/repro/replay.ts",
    "packages/core/src/testing/events.ts",
  ]),
  viewport: Object.freeze({ cols: 32, rows: 8 }),
  theme: Object.freeze({ mode: "named", value: "default" }),
  capabilityProfile: Object.freeze({
    supportsMouse: true,
    supportsBracketedPaste: true,
    supportsFocusEvents: true,
    supportsOsc52: true,
    colorMode: "truecolor",
  }),
  scriptedInput: Object.freeze([
    Object.freeze({ atMs: 0, event: Object.freeze({ kind: "text", text: "a" }) }),
    Object.freeze({ atMs: 100, event: Object.freeze({ kind: "text", text: "b" }) }),
  ]),
  expectedActions: Object.freeze([
    Object.freeze({ id: "field", action: "input", value: "a", cursor: 1 }),
    Object.freeze({ id: "field", action: "input", value: "ab", cursor: 2 }),
  ]),
  expectedScreenCheckpoints: Object.freeze([
    Object.freeze({
      id: "dynamic-value",
      afterStep: 2,
      assertionRef: "screen_region_assertion",
      args: Object.freeze({
        x: 0,
        y: 1,
        width: 32,
        height: 5,
        match: "exact",
        text: Object.freeze([
          " Replay harness                 ",
          "                                ",
          " Value:ab                       ",
          "                                ",
          "  ab                            ",
        ]),
      }),
    }),
  ]),
  invariants: Object.freeze([
    Object.freeze({
      id: "no-duplicate-input",
      assertionRef: "invariant_assertion",
      args: Object.freeze({
        kind: "action_absence",
        action: Object.freeze({
          id: "field",
          action: "input",
          payloadSubset: Object.freeze({ value: "aba" }),
        }),
      }),
    }),
  ]),
  fidelityRequirement: "semantic-only",
});

const createReplayFixture: ScenarioFixtureFactory<ReplayState> = () => {
  let app!: App<ReplayState>;
  return Object.freeze({
    initialState: Object.freeze({ value: "" }),
    setup(nextApp) {
      app = nextApp;
    },
    view(state) {
      return ui.focusTrap({ id: "trap", active: true, initialFocus: "field" }, [
        ui.column({ p: 1 }, [
          ui.text("Replay harness"),
          ui.text(`Value:${state.value}`),
          ui.input({
            id: "field",
            value: state.value,
            onInput: (value) => {
              app.update({ value });
            },
          }),
        ]),
      ]);
    },
  });
};

test("semantic scenario runner: shared reference scenario passes", async () => {
  const result = await runSemanticScenario({
    scenario: referenceInputModalScenario,
    createFixture: createReferenceInputModalFixture,
  });
  assert.equal(result.pass, true);
  assert.equal(result.status, "PASS");
  assert.deepEqual(result.mismatches, []);
});

test("replay scenario runner: stateless input scenario passes", async () => {
  const result = await runReplayScenario({
    scenario: replayScenario,
    createFixture: createReplayFixture,
  });
  assert.equal(result.pass, true);
  assert.equal(result.status, "PASS");
  assert.deepEqual(result.mismatches, []);
});

test("replay scenario runner: cursor-dependent scenario fails clearly", async () => {
  const result = await runReplayScenario({
    scenario: {
      ...replayScenario,
      expectedCursorState: Object.freeze({
        visible: true,
        x: 1,
        y: 2,
        shape: 2,
        blink: true,
      }),
    },
    createFixture: createReplayFixture,
  });
  assert.equal(result.pass, false);
  assert.equal(
    result.mismatches.some((item) => item.code === "ZR_SCENARIO_UNSUPPORTED"),
    true,
  );
});

test("evaluateScenarioResult: cursor assertions compare final cursor snapshots", () => {
  const { expectedActions: _expectedActions, ...cursorScenarioBase } = replayScenario;
  const result = evaluateScenarioResult(
    {
      ...cursorScenarioBase,
      expectedScreenCheckpoints: Object.freeze([]),
      invariants: Object.freeze([]),
      expectedCursorState: Object.freeze({
        visible: true,
        x: 2,
        y: 1,
        shape: 2,
        blink: true,
      }),
    },
    {
      mode: "semantic",
      actions: Object.freeze([]),
      steps: Object.freeze([]),
      finalScreen: Object.freeze({
        cols: 32,
        rows: 8,
        lines: Object.freeze(Array.from({ length: 8 }, () => "".padEnd(32, " "))),
      }),
      finalCursor: Object.freeze({
        visible: true,
        x: 2,
        y: 1,
        shape: 2,
        blink: true,
      }),
    },
  );
  assert.equal(result.pass, true);
  assert.deepEqual(result.mismatches, []);
});
