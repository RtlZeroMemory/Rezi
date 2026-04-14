import type { App } from "../../app/types.js";
import { ui } from "../../ui.js";
import type { ScenarioDefinition, ScenarioFixtureFactory } from "../scenario.js";

interface InputMouseCapabilityFallbackState {
  readonly first: string;
  readonly second: string;
}

const SECOND_INPUT_CLICK = "\u001b[<0;4;4M\u001b[<0;4;4m";

export const referenceInputMouseCapabilityFallbackScenario: ScenarioDefinition = Object.freeze({
  schemaVersion: 1,
  id: "input-mouse-disabled-keeps-keyboard-focus",
  title: "Mouse bytes do not steal input focus when mouse support is disabled",
  widgetFamily: "input-textarea",
  behaviorStatement:
    "When PTY mouse support is disabled, raw mouse bytes must not move focus away from the active input, and keyboard typing must keep editing the original field.",
  evidenceRefs: Object.freeze([
    "docs/widgets/input.md",
    "docs/backend/terminal-caps.md",
    "docs/guide/mouse-support.md",
    "packages/core/src/app/__tests__/widgetBehavior.contracts.test.ts",
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
      event: Object.freeze({ kind: "terminalBytes", bytes: SECOND_INPUT_CLICK }),
    }),
    Object.freeze({ atMs: 20, event: Object.freeze({ kind: "text", text: "x" }) }),
  ]),
  expectedActions: Object.freeze([
    Object.freeze({ id: "first", action: "input", value: "ax", cursor: 2 }),
  ]),
  expectedScreenCheckpoints: Object.freeze([
    Object.freeze({
      id: "first-input-kept-focus",
      afterStep: 2,
      assertionRef: "screen_region_assertion",
      args: Object.freeze({
        x: 0,
        y: 0,
        width: 48,
        height: 5,
        match: "exact",
        text: Object.freeze([
          'First:"ax"                                      ',
          "                                                ",
          " ax                                             ",
          "                                                ",
          'Second:"b"                                      ',
        ]),
      }),
    }),
  ]),
  invariants: Object.freeze([
    Object.freeze({
      id: "second-input-not-mutated",
      assertionRef: "invariant_assertion",
      args: Object.freeze({
        kind: "action_absence",
        action: Object.freeze({
          id: "second",
          action: "input",
          payloadSubset: Object.freeze({ value: "bx" }),
        }),
      }),
    }),
  ]),
  fidelityRequirement: "terminal-real",
});

export const createReferenceInputMouseCapabilityFallbackFixture: ScenarioFixtureFactory<
  InputMouseCapabilityFallbackState
> = () => {
  let app!: App<InputMouseCapabilityFallbackState>;
  return Object.freeze({
    initialState: Object.freeze({ first: "a", second: "b" }),
    setup(nextApp) {
      app = nextApp;
    },
    view(state) {
      return ui.focusTrap({ id: "mouse-cap-trap", active: true, initialFocus: "first" }, [
        ui.column({}, [
          ui.text(`First:${JSON.stringify(state.first)}`),
          ui.input({
            id: "first",
            value: state.first,
            onInput: (value) => {
              app.update((current) => ({ ...current, first: value }));
            },
          }),
          ui.text(`Second:${JSON.stringify(state.second)}`),
          ui.input({
            id: "second",
            value: state.second,
            onInput: (value) => {
              app.update((current) => ({ ...current, second: value }));
            },
          }),
        ]),
      ]);
    },
  });
};
