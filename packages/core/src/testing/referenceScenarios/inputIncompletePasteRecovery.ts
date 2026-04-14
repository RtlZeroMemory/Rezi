import type { App } from "../../app/types.js";
import { ui } from "../../ui.js";
import type { ScenarioDefinition, ScenarioFixtureFactory } from "../scenario.js";

interface InputIncompletePasteState {
  readonly value: string;
  readonly submitted: number;
}

export const referenceInputIncompletePasteScenario: ScenarioDefinition = Object.freeze({
  schemaVersion: 1,
  id: "input-incomplete-paste-recovers",
  title: "Input remains live after an incomplete bracketed paste",
  widgetFamily: "input-textarea",
  behaviorStatement:
    "A focused input must not wedge when bracketed paste starts without an end marker; later keyboard navigation and submit still work.",
  evidenceRefs: Object.freeze([
    "docs/widgets/input.md",
    "docs/terminal-io-contract.md",
    "packages/core/src/runtime/__tests__/inputEditor.paste.test.ts",
  ]),
  viewport: Object.freeze({ cols: 48, rows: 10 }),
  theme: Object.freeze({ mode: "named", value: "default" }),
  capabilityProfile: Object.freeze({
    supportsMouse: false,
    supportsBracketedPaste: true,
    supportsFocusEvents: false,
    supportsOsc52: false,
    colorMode: "16",
  }),
  scriptedInput: Object.freeze([
    Object.freeze({
      atMs: 0,
      event: Object.freeze({ kind: "terminalBytes", bytes: "\u001b[200~broken" }),
    }),
    Object.freeze({ atMs: 250, event: Object.freeze({ kind: "key", key: "tab" }) }),
    Object.freeze({ atMs: 260, event: Object.freeze({ kind: "key", key: "enter" }) }),
  ]),
  expectedActions: Object.freeze([
    Object.freeze({ id: "field", action: "input", value: "broken", cursor: 6 }),
    Object.freeze({ id: "submit", action: "press" }),
  ]),
  expectedScreenCheckpoints: Object.freeze([
    Object.freeze({
      id: "submit-still-works",
      afterStep: 3,
      assertionRef: "screen_region_assertion",
      args: Object.freeze({
        x: 0,
        y: 0,
        width: 48,
        height: 3,
        match: "includes",
        text: Object.freeze(["Submitted:1"]),
      }),
    }),
  ]),
  invariants: Object.freeze([
    Object.freeze({
      id: "no-ghost-press",
      assertionRef: "invariant_assertion",
      args: Object.freeze({
        kind: "action_absence",
        action: Object.freeze({
          id: "ghost-submit",
          action: "press",
        }),
      }),
    }),
  ]),
  fidelityRequirement: "terminal-real",
  notes:
    "Terminal I/O contract coverage already pins missing-end bracketed paste to flush, so the scenario asserts the visible flush plus later keyboard liveness.",
});

export const createReferenceInputIncompletePasteFixture: ScenarioFixtureFactory<
  InputIncompletePasteState
> = () => {
  let app!: App<InputIncompletePasteState>;
  return Object.freeze({
    initialState: Object.freeze({ value: "", submitted: 0 }),
    setup(nextApp) {
      app = nextApp;
    },
    view(state) {
      return ui.focusTrap({ id: "paste-trap", active: true, initialFocus: "field" }, [
        ui.column({}, [
          ui.text(`Submitted:${String(state.submitted)}`),
          ui.text(`Value:${JSON.stringify(state.value)}`),
          ui.input({
            id: "field",
            value: state.value,
            onInput: (value) => {
              app.update((current) => ({ ...current, value }));
            },
          }),
          ui.button({
            id: "submit",
            label: "Submit",
            onPress: () => {
              app.update((current) => ({ ...current, submitted: current.submitted + 1 }));
            },
          }),
        ]),
      ]);
    },
  });
};
