import type { App } from "../../app/types.js";
import { ui } from "../../index.js";
import type { ScenarioDefinition, ScenarioFixtureFactory } from "../scenario.js";

interface InputModalScenarioState {
  readonly value: string;
  readonly modalOpen: boolean;
}

export const referenceInputModalScenario: ScenarioDefinition = Object.freeze({
  schemaVersion: 1,
  id: "input-modal-blocking-focus-restore",
  title: "Input editing pauses behind modal and resumes after close",
  widgetFamily: "input-textarea",
  behaviorStatement:
    "A focused input accepts edits, an opened modal blocks background typing, and closing the modal restores focus so typing resumes immediately.",
  evidenceRefs: Object.freeze([
    "docs/widgets/input.md",
    "docs/widgets/modal.md",
    "docs/guide/input-and-focus.md",
    "packages/core/src/runtime/__tests__/inputEditor.contract.test.ts",
    "packages/core/src/runtime/__tests__/focus.layers.test.ts",
    "packages/core/src/widgets/__tests__/modal.focus.test.ts",
  ]),
  viewport: Object.freeze({ cols: 48, rows: 14 }),
  theme: Object.freeze({ mode: "named", value: "default" }),
  capabilityProfile: Object.freeze({
    supportsMouse: false,
    supportsBracketedPaste: false,
    supportsFocusEvents: false,
    supportsOsc52: false,
    colorMode: "none",
  }),
  scriptedInput: Object.freeze([
    Object.freeze({ atMs: 0, event: Object.freeze({ kind: "text", text: "a" }) }),
    Object.freeze({
      atMs: 1,
      event: Object.freeze({ kind: "key", key: "o", mods: Object.freeze(["ctrl"] as const) }),
    }),
    Object.freeze({ atMs: 2, event: Object.freeze({ kind: "text", text: "b" }) }),
    Object.freeze({ atMs: 3, event: Object.freeze({ kind: "key", key: "enter" }) }),
    Object.freeze({ atMs: 4, event: Object.freeze({ kind: "text", text: "c" }) }),
  ]),
  expectedActions: Object.freeze([
    Object.freeze({ id: "field", action: "input", value: "a", cursor: 1 }),
    Object.freeze({ id: "modal-close", action: "press" }),
    Object.freeze({ id: "field", action: "input", value: "ac", cursor: 2 }),
  ]),
  expectedScreenCheckpoints: Object.freeze([
    Object.freeze({
      id: "value-after-first-edit",
      afterStep: 1,
      assertionRef: "screen_region_assertion",
      args: Object.freeze({
        x: 0,
        y: 0,
        width: 48,
        height: 4,
        match: "exact",
        text: Object.freeze([
          "                                                ",
          " Reference scenario                             ",
          "                                                ",
          " Value:a                                        ",
        ]),
      }),
    }),
    Object.freeze({
      id: "modal-visible",
      afterStep: 2,
      assertionRef: "screen_region_assertion",
      args: Object.freeze({
        x: 0,
        y: 3,
        width: 48,
        height: 6,
        match: "exact",
        text: Object.freeze([
          "░░░░░░░┌─Pause editing─────────────────┐░░░░░░░░",
          "░░░░░░░│░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░│░░░░░░░░",
          "░░░░░░░│Modal blocks background typing░│░░░░░░░░",
          "░░░░░░░│░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░│░░░░░░░░",
          "░░░░░░░│░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░│░░░░░░░░",
          "░░░░░░░│░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░│░░░░░░░░",
        ]),
      }),
    }),
    Object.freeze({
      id: "value-after-resume",
      afterStep: 5,
      assertionRef: "screen_region_assertion",
      args: Object.freeze({
        x: 0,
        y: 0,
        width: 48,
        height: 4,
        match: "exact",
        text: Object.freeze([
          "                                                ",
          " Reference scenario                             ",
          "                                                ",
          " Value:ac                                       ",
        ]),
      }),
    }),
  ]),
  invariants: Object.freeze([
    Object.freeze({
      id: "no-blocked-input-leak",
      assertionRef: "invariant_assertion",
      args: Object.freeze({
        kind: "action_absence",
        action: Object.freeze({
          id: "field",
          action: "input",
          payloadSubset: Object.freeze({ value: "ab" }),
        }),
      }),
    }),
  ]),
  fidelityRequirement: "terminal-real",
  notes:
    "Uses a keyboard shortcut to open the modal so the scenario can prove blocking and focus restore without depending on select/dropdown or OSC52 fallback behavior.",
  unresolvedAssumptions: Object.freeze([
    "MVP uses a minimal typed key/text alias layer for scriptedInput.event instead of strict low-level event objects.",
  ]),
});

export const createReferenceInputModalFixture: ScenarioFixtureFactory<
  InputModalScenarioState
> = () => {
  let app!: App<InputModalScenarioState>;
  return Object.freeze({
    initialState: Object.freeze({ value: "", modalOpen: false }),
    setup(nextApp) {
      app = nextApp;
      app.keys({
        "ctrl+o": () => {
          app.update((state) => (state.modalOpen ? state : { ...state, modalOpen: true }));
        },
      });
    },
    view(state) {
      const baseContent = ui.column({ p: 1, gap: 1 }, [
        ui.text("Reference scenario"),
        ui.text(`Value:${state.value}`),
        ui.input({
          id: "field",
          value: state.value,
          onInput: (value) => {
            app.update((current) => ({ ...current, value }));
          },
        }),
        ui.text("Ctrl+O opens modal"),
      ]);
      const base = ui.focusTrap({ id: "root-trap", active: true, initialFocus: "field" }, [
        baseContent,
      ]);
      if (!state.modalOpen) return base;
      return ui.layers([
        base,
        ui.modal({
          id: "pause-modal",
          title: "Pause editing",
          initialFocus: "modal-close",
          returnFocusTo: "field",
          closeOnEscape: false,
          closeOnBackdrop: false,
          content: ui.text("Modal blocks background typing"),
          actions: [
            ui.button({
              id: "modal-close",
              label: "Resume",
              onPress: () => {
                app.update((current) => ({ ...current, modalOpen: false }));
              },
            }),
          ],
        }),
      ]);
    },
  });
};
