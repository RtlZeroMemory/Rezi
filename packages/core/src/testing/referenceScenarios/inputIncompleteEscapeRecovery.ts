import type { App } from "../../app/types.js";
import { ui } from "../../ui.js";
import type { ScenarioDefinition, ScenarioFixtureFactory } from "../scenario.js";

interface InputIncompleteEscapeState {
  readonly value: string;
}

export const referenceInputIncompleteEscapeScenario: ScenarioDefinition = Object.freeze({
  schemaVersion: 1,
  id: "input-incomplete-escape-recovers",
  title: "Incomplete escape fallback preserves later input",
  widgetFamily: "input-textarea",
  behaviorStatement:
    "An incomplete escape prefix must fall back deterministically and preserve later text input instead of wedging the stream.",
  evidenceRefs: Object.freeze([
    "docs/widgets/input.md",
    "docs/terminal-io-contract.md",
  ]),
  viewport: Object.freeze({ cols: 48, rows: 8 }),
  theme: Object.freeze({ mode: "named", value: "default" }),
  capabilityProfile: Object.freeze({
    supportsMouse: false,
    supportsBracketedPaste: false,
    supportsFocusEvents: false,
    supportsOsc52: false,
    colorMode: "none",
  }),
  scriptedInput: Object.freeze([
    Object.freeze({
      atMs: 0,
      event: Object.freeze({ kind: "terminalBytes", bytes: "\u001b[" }),
    }),
    Object.freeze({ atMs: 250, event: Object.freeze({ kind: "text", text: "x" }) }),
  ]),
  expectedScreenCheckpoints: Object.freeze([
    Object.freeze({
      id: "fallback-text-visible",
      afterStep: 2,
      assertionRef: "screen_region_assertion",
      args: Object.freeze({
        x: 0,
        y: 0,
        width: 48,
        height: 2,
        match: "includes",
        text: Object.freeze(['Value:"[x"']),
      }),
    }),
  ]),
  invariants: Object.freeze([
    Object.freeze({
      id: "fallback-order-stays-deterministic",
      assertionRef: "invariant_assertion",
      args: Object.freeze({
        kind: "action_absence",
        action: Object.freeze({
          id: "field",
          action: "input",
          payloadSubset: Object.freeze({ value: "x[" }),
        }),
      }),
    }),
  ]),
  fidelityRequirement: "terminal-real",
});

export const createReferenceInputIncompleteEscapeFixture: ScenarioFixtureFactory<
  InputIncompleteEscapeState
> = () => {
  let app!: App<InputIncompleteEscapeState>;
  return Object.freeze({
    initialState: Object.freeze({ value: "" }),
    setup(nextApp) {
      app = nextApp;
    },
    view(state) {
      return ui.focusTrap({ id: "escape-trap", active: true, initialFocus: "field" }, [
        ui.column({}, [
          ui.text(`Value:${JSON.stringify(state.value)}`),
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
