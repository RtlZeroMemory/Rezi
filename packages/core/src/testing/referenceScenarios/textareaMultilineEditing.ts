import type { App } from "../../app/types.js";
import { ui } from "../../ui.js";
import type { ScenarioDefinition, ScenarioFixtureFactory } from "../scenario.js";

interface TextareaScenarioState {
  readonly value: string;
}

export const referenceTextareaMultilineScenario: ScenarioDefinition = Object.freeze({
  schemaVersion: 1,
  id: "textarea-multiline-editing",
  title: "Textarea preserves multiline editing behavior",
  widgetFamily: "input-textarea",
  behaviorStatement:
    "A focused textarea inserts a newline on Enter and continues editing on the following line.",
  evidenceRefs: Object.freeze([
    "docs/widgets/textarea.md",
    "docs/guide/input-and-focus.md",
    "packages/core/src/runtime/__tests__/inputEditor.state.test.ts",
    "packages/core/src/app/__tests__/widgetRenderer.integration.test.ts",
  ]),
  viewport: Object.freeze({ cols: 40, rows: 12 }),
  theme: Object.freeze({ mode: "named", value: "default" }),
  capabilityProfile: Object.freeze({
    supportsMouse: false,
    supportsBracketedPaste: false,
    supportsFocusEvents: false,
    supportsOsc52: false,
    colorMode: "none",
  }),
  scriptedInput: Object.freeze([
    Object.freeze({ atMs: 0, event: Object.freeze({ kind: "key", key: "enter" }) }),
    Object.freeze({ atMs: 1, event: Object.freeze({ kind: "text", text: "x" }) }),
  ]),
  expectedActions: Object.freeze([
    Object.freeze({ id: "notes", action: "input", value: "ab\n", cursor: 3 }),
    Object.freeze({ id: "notes", action: "input", value: "ab\nx", cursor: 4 }),
  ]),
  expectedScreenCheckpoints: Object.freeze([
    Object.freeze({
      id: "newline-inserted",
      afterStep: 1,
      assertionRef: "screen_region_assertion",
      args: Object.freeze({
        x: 0,
        y: 3,
        width: 40,
        height: 1,
        match: "includes",
        text: Object.freeze(['Value:"ab\\n"']),
      }),
    }),
    Object.freeze({
      id: "second-line-edit",
      afterStep: 2,
      assertionRef: "screen_region_assertion",
      args: Object.freeze({
        x: 0,
        y: 3,
        width: 40,
        height: 1,
        match: "includes",
        text: Object.freeze(['Value:"ab\\nx"']),
      }),
    }),
  ]),
  invariants: Object.freeze([
    Object.freeze({
      id: "no-single-line-collapse",
      assertionRef: "invariant_assertion",
      args: Object.freeze({
        kind: "action_absence",
        action: Object.freeze({
          id: "notes",
          action: "input",
          payloadSubset: Object.freeze({ value: "abx" }),
        }),
      }),
    }),
  ]),
  fidelityRequirement: "semantic-only",
});

export const createReferenceTextareaMultilineFixture: ScenarioFixtureFactory<
  TextareaScenarioState
> = () => {
  let app!: App<TextareaScenarioState>;
  return Object.freeze({
    initialState: Object.freeze({ value: "ab" }),
    setup(nextApp) {
      app = nextApp;
    },
    view(state) {
      return ui.focusTrap({ id: "textarea-trap", active: true, initialFocus: "notes" }, [
        ui.column({ p: 1, gap: 1 }, [
          ui.text("Textarea scenario"),
          ui.text(`Value:${JSON.stringify(state.value)}`),
          ui.textarea({
            id: "notes",
            value: state.value,
            rows: 4,
            onInput: (value) => {
              app.update({ value });
            },
          }),
        ]),
      ]);
    },
  });
};
