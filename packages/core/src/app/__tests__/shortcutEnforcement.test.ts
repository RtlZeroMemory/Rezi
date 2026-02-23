import { assert, describe, test } from "@rezi-ui/testkit";
import type { RuntimeBackend } from "../../backend.js";
import type { ZrevEvent } from "../../events.js";
import { ui } from "../../index.js";
import { ZR_MOD_CTRL } from "../../keybindings/keyCodes.js";
import { DEFAULT_TERMINAL_CAPS } from "../../terminalCaps.js";
import { defaultTheme } from "../../theme/defaultTheme.js";
import type { CommandItem, CommandSource } from "../../widgets/types.js";
import { WidgetRenderer } from "../widgetRenderer.js";
import { flushMicrotasks } from "./helpers.js";

// Intentional WidgetRenderer-level harness: shortcut routing is an engine-level contract.
function noRenderHooks(): { enterRender: () => void; exitRender: () => void } {
  return { enterRender: () => {}, exitRender: () => {} };
}

function keyEvent(key: number, mods = 0, timeMs = 0): ZrevEvent {
  return { kind: "key", action: "down", key, mods, timeMs };
}

function createNoopBackend(): RuntimeBackend {
  return {
    start: async () => {},
    stop: async () => {},
    dispose: () => {},
    requestFrame: async () => {},
    pollEvents: async () =>
      new Promise((_) => {
        // Not used by WidgetRenderer unit-style tests.
      }),
    postUserEvent: () => {},
    getCaps: async () => DEFAULT_TERMINAL_CAPS,
  };
}

describe("widget shortcut enforcement contracts", () => {
  test("dropdown shortcut invokes the matching item action", () => {
    const backend = createNoopBackend();
    const renderer = new WidgetRenderer<void>({ backend, requestRender: () => {} });

    const actions: string[] = [];
    const vnode = ui.layers([
      ui.button({ id: "anchor", label: "Menu" }),
      ui.dropdown({
        id: "dd",
        anchorId: "anchor",
        items: [{ id: "save", label: "Save", shortcut: "Ctrl+S" }],
        onSelect: (item) => actions.push(`select:${item.id}`),
        onClose: () => actions.push("close"),
      }),
    ]);

    const frame = renderer.submitFrame(
      () => vnode,
      undefined,
      { cols: 40, rows: 10 },
      defaultTheme,
      noRenderHooks(),
    );
    assert.equal(frame.ok, true);

    const routed = renderer.routeEngineEvent(keyEvent(83, ZR_MOD_CTRL, 1));
    assert.equal(routed.needsRender, true);
    assert.deepEqual(actions, ["select:save", "close"]);
  });

  test("disabled dropdown shortcut is inert", () => {
    const backend = createNoopBackend();
    const renderer = new WidgetRenderer<void>({ backend, requestRender: () => {} });

    let selected = 0;
    const vnode = ui.layers([
      ui.button({ id: "anchor", label: "Menu" }),
      ui.dropdown({
        id: "dd",
        anchorId: "anchor",
        items: [{ id: "save", label: "Save", shortcut: "Ctrl+S", disabled: true }],
        onSelect: () => {
          selected++;
        },
      }),
    ]);

    const frame = renderer.submitFrame(
      () => vnode,
      undefined,
      { cols: 40, rows: 10 },
      defaultTheme,
      noRenderHooks(),
    );
    assert.equal(frame.ok, true);

    const routed = renderer.routeEngineEvent(keyEvent(83, ZR_MOD_CTRL, 1));
    assert.equal(routed.needsRender, false);
    assert.equal(selected, 0);
  });

  test("closing a dropdown deactivates its shortcuts", () => {
    const backend = createNoopBackend();
    const renderer = new WidgetRenderer<void>({ backend, requestRender: () => {} });

    const actions: string[] = [];
    const openView = () =>
      ui.layers([
        ui.button({ id: "anchor", label: "Menu" }),
        ui.dropdown({
          id: "dd",
          anchorId: "anchor",
          items: [{ id: "save", label: "Save", shortcut: "Ctrl+S" }],
          onSelect: (item) => actions.push(item.id),
        }),
      ]);

    const openFrame = renderer.submitFrame(
      openView,
      undefined,
      { cols: 40, rows: 10 },
      defaultTheme,
      noRenderHooks(),
    );
    assert.equal(openFrame.ok, true);

    renderer.routeEngineEvent(keyEvent(83, ZR_MOD_CTRL, 1));
    assert.deepEqual(actions, ["save"]);

    const closedFrame = renderer.submitFrame(
      () => ui.button({ id: "anchor", label: "Menu" }),
      undefined,
      { cols: 40, rows: 10 },
      defaultTheme,
      noRenderHooks(),
    );
    assert.equal(closedFrame.ok, true);

    const routed = renderer.routeEngineEvent(keyEvent(83, ZR_MOD_CTRL, 2));
    assert.equal(routed.needsRender, false);
    assert.deepEqual(actions, ["save"]);
  });

  test("conflicting dropdown shortcuts prefer the topmost overlay", () => {
    const backend = createNoopBackend();
    const renderer = new WidgetRenderer<void>({ backend, requestRender: () => {} });

    const actions: string[] = [];
    const vnode = ui.layers([
      ui.column({}, [
        ui.button({ id: "anchor-a", label: "A" }),
        ui.button({ id: "anchor-b", label: "B" }),
      ]),
      ui.dropdown({
        id: "dd-a",
        anchorId: "anchor-a",
        items: [{ id: "save-a", label: "Save A", shortcut: "Ctrl+S" }],
        onSelect: () => actions.push("A"),
      }),
      ui.dropdown({
        id: "dd-b",
        anchorId: "anchor-b",
        items: [{ id: "save-b", label: "Save B", shortcut: "Ctrl+S" }],
        onSelect: () => actions.push("B"),
      }),
    ]);

    const frame = renderer.submitFrame(
      () => vnode,
      undefined,
      { cols: 60, rows: 14 },
      defaultTheme,
      noRenderHooks(),
    );
    assert.equal(frame.ok, true);

    renderer.routeEngineEvent(keyEvent(83, ZR_MOD_CTRL, 1));
    assert.deepEqual(actions, ["B"]);
  });

  test("command palette shortcut works when palette is open", async () => {
    const backend = createNoopBackend();
    const renderer = new WidgetRenderer<void>({ backend, requestRender: () => {} });

    const selections: string[] = [];
    let closeCount = 0;
    const sourceItems: readonly CommandItem[] = Object.freeze([
      { id: "save", label: "Save", sourceId: "commands", shortcut: "Ctrl+S" },
    ]);
    const source: CommandSource = {
      id: "commands",
      name: "Commands",
      getItems: () => sourceItems,
    };

    const view = () =>
      ui.commandPalette({
        id: "cp",
        open: true,
        query: "",
        sources: Object.freeze([source]),
        selectedIndex: 0,
        onQueryChange: () => {},
        onSelect: (item) => selections.push(item.id),
        onClose: () => {
          closeCount++;
        },
      });

    const firstFrame = renderer.submitFrame(
      view,
      undefined,
      { cols: 80, rows: 20 },
      defaultTheme,
      noRenderHooks(),
    );
    assert.equal(firstFrame.ok, true);

    await flushMicrotasks(8);

    const secondFrame = renderer.submitFrame(
      view,
      undefined,
      { cols: 80, rows: 20 },
      defaultTheme,
      noRenderHooks(),
    );
    assert.equal(secondFrame.ok, true);

    const routed = renderer.routeEngineEvent(keyEvent(83, ZR_MOD_CTRL, 10));
    assert.equal(routed.needsRender, true);
    assert.deepEqual(selections, ["save"]);
    assert.equal(closeCount, 1);
  });

  test("invalid shortcut strings are ignored without crashing", () => {
    const backend = createNoopBackend();
    const renderer = new WidgetRenderer<void>({ backend, requestRender: () => {} });

    let selected = 0;
    const vnode = ui.layers([
      ui.button({ id: "anchor", label: "Menu" }),
      ui.dropdown({
        id: "dd",
        anchorId: "anchor",
        items: [{ id: "save", label: "Save", shortcut: "FooBar" }],
        onSelect: () => {
          selected++;
        },
      }),
    ]);

    const frame = renderer.submitFrame(
      () => vnode,
      undefined,
      { cols: 40, rows: 10 },
      defaultTheme,
      noRenderHooks(),
    );
    assert.equal(frame.ok, true);

    assert.doesNotThrow(() => {
      renderer.routeEngineEvent(keyEvent(83, ZR_MOD_CTRL, 1));
    });
    assert.equal(selected, 0);
  });
});
