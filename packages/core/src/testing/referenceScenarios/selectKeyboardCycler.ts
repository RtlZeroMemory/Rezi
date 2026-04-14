import type { App } from "../../app/types.js";
import { ui } from "../../ui.js";
import type { ScenarioDefinition, ScenarioFixtureFactory } from "../scenario.js";

interface SelectScenarioState {
  readonly value: string;
}

export const referenceSelectKeyboardCyclerScenario: ScenarioDefinition = Object.freeze({
  schemaVersion: 1,
  id: "select-keyboard-cycler",
  title: "Select cycles enabled options with keyboard input",
  widgetFamily: "select-dropdown",
  behaviorStatement:
    "A focused select skips disabled options on ArrowDown and Enter/Space advance through enabled choices.",
  evidenceRefs: Object.freeze([
    "docs/widgets/select.md",
    "docs/guide/input-and-focus.md",
    "packages/core/src/app/widgetRenderer/keyboardRouting.ts",
    "packages/core/src/app/__tests__/widgetRenderer.integration.test.ts",
  ]),
  viewport: Object.freeze({ cols: 40, rows: 10 }),
  theme: Object.freeze({ mode: "named", value: "default" }),
  capabilityProfile: Object.freeze({
    supportsMouse: false,
    supportsBracketedPaste: false,
    supportsFocusEvents: false,
    supportsOsc52: false,
    colorMode: "none",
  }),
  scriptedInput: Object.freeze([
    Object.freeze({ atMs: 0, event: Object.freeze({ kind: "key", key: "down" }) }),
    Object.freeze({ atMs: 1, event: Object.freeze({ kind: "key", key: "enter" }) }),
    Object.freeze({ atMs: 2, event: Object.freeze({ kind: "key", key: "space" }) }),
  ]),
  expectedActions: Object.freeze([]),
  expectedScreenCheckpoints: Object.freeze([
    Object.freeze({
      id: "arrow-skips-disabled-option",
      afterStep: 1,
      assertionRef: "screen_region_assertion",
      args: Object.freeze({
        x: 0,
        y: 3,
        width: 40,
        height: 1,
        match: "includes",
        text: Object.freeze(["Selected:system"]),
      }),
    }),
    Object.freeze({
      id: "enter-advances-to-next-enabled-option",
      afterStep: 2,
      assertionRef: "screen_region_assertion",
      args: Object.freeze({
        x: 0,
        y: 3,
        width: 40,
        height: 1,
        match: "includes",
        text: Object.freeze(["Selected:dark"]),
      }),
    }),
    Object.freeze({
      id: "space-advances-like-enter",
      afterStep: 3,
      assertionRef: "screen_region_assertion",
      args: Object.freeze({
        x: 0,
        y: 3,
        width: 40,
        height: 1,
        match: "includes",
        text: Object.freeze(["Selected:system"]),
      }),
    }),
  ]),
  invariants: Object.freeze([
    Object.freeze({
      id: "no-routed-action-dependency",
      assertionRef: "invariant_assertion",
      args: Object.freeze({
        kind: "action_absence",
        action: Object.freeze({
          id: "theme",
          action: "change",
        }),
      }),
    }),
  ]),
  fidelityRequirement: "semantic-only",
  notes:
    "This stays conservative: keyboard-only select behavior is strongly backed, but pointer behavior remains covered outside shared scenarios.",
});

export const createReferenceSelectKeyboardCyclerFixture: ScenarioFixtureFactory<
  SelectScenarioState
> = () => {
  let app!: App<SelectScenarioState>;
  return Object.freeze({
    initialState: Object.freeze({ value: "dark" }),
    setup(nextApp) {
      app = nextApp;
    },
    view(state) {
      return ui.focusTrap({ id: "select-trap", active: true, initialFocus: "theme" }, [
        ui.column({ p: 1, gap: 1 }, [
          ui.text("Select scenario"),
          ui.text(`Selected:${state.value}`),
          ui.select({
            id: "theme",
            value: state.value,
            options: [
              { value: "dark", label: "Dark" },
              { value: "light", label: "Light", disabled: true },
              { value: "system", label: "System" },
            ],
            onChange: (value) => {
              app.update({ value });
            },
          }),
        ]),
      ]);
    },
  });
};
