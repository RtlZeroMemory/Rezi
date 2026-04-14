import type { App } from "../../app/types.js";
import { ui } from "../../ui.js";
import type { ScenarioDefinition, ScenarioFixtureFactory } from "../scenario.js";

interface VirtualListResizeStormState {
  readonly activated: string;
}

export const referenceVirtualListResizeStormScenario: ScenarioDefinition = Object.freeze({
  schemaVersion: 1,
  id: "virtual-list-resize-storm-stays-interactive",
  title: "Virtual list stays interactive through a resize storm",
  widgetFamily: "table-tree-virtual-list",
  behaviorStatement:
    "Repeated viewport changes must not wedge a virtual list; later keyboard navigation and activation still work.",
  evidenceRefs: Object.freeze([
    "docs/widgets/virtual-list.md",
    "docs/terminal-io-contract.md",
    "packages/core/src/widgets/__tests__/virtualList.contract.test.ts",
    "packages/core/src/app/__tests__/widgetBehavior.contracts.test.ts",
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
    Object.freeze({ atMs: 0, event: Object.freeze({ kind: "resize", cols: 52, rows: 12 }) }),
    Object.freeze({ atMs: 10, event: Object.freeze({ kind: "resize", cols: 34, rows: 8 }) }),
    Object.freeze({ atMs: 20, event: Object.freeze({ kind: "resize", cols: 60, rows: 14 }) }),
    Object.freeze({ atMs: 30, event: Object.freeze({ kind: "resize", cols: 40, rows: 10 }) }),
    Object.freeze({ atMs: 60, event: Object.freeze({ kind: "key", key: "down" }) }),
    Object.freeze({ atMs: 70, event: Object.freeze({ kind: "key", key: "enter" }) }),
  ]),
  expectedScreenCheckpoints: Object.freeze([
    Object.freeze({
      id: "activation-after-resize-storm",
      afterStep: 6,
      assertionRef: "screen_region_assertion",
      args: Object.freeze({
        x: 0,
        y: 0,
        width: 40,
        height: 2,
        match: "includes",
        text: Object.freeze(["Activated:1"]),
      }),
    }),
  ]),
  invariants: Object.freeze([
    Object.freeze({
      id: "no-ghost-activation",
      assertionRef: "invariant_assertion",
      args: Object.freeze({
        kind: "action_absence",
        action: Object.freeze({
          id: "missing-list-action",
          action: "press",
        }),
      }),
    }),
  ]),
  fidelityRequirement: "terminal-real",
  notes:
    "The oracle stays behavior-first: later activation must still work after repeated resizes, without asserting exact row geometry during the storm.",
});

export const createReferenceVirtualListResizeStormFixture: ScenarioFixtureFactory<
  VirtualListResizeStormState
> = () => {
  let app!: App<VirtualListResizeStormState>;
  const items = Object.freeze(Array.from({ length: 100 }, (_, index) => index));
  return Object.freeze({
    initialState: Object.freeze({ activated: "-" }),
    setup(nextApp) {
      app = nextApp;
    },
    view(state) {
      return ui.focusTrap({ id: "resize-trap", active: true, initialFocus: "list" }, [
        ui.column({}, [
          ui.text(`Activated:${state.activated}`),
          ui.virtualList({
            id: "list",
            items,
            itemHeight: 1,
            renderItem: (item, _index, focused) =>
              ui.text(focused ? `> ${String(item)}` : String(item)),
            onSelect: (item: number) => {
              app.update({ activated: String(item) });
            },
          }),
        ]),
      ]);
    },
  });
};
