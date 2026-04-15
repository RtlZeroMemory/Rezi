import { assert, describe, test } from "@rezi-ui/testkit";
import type { RuntimeBackend } from "../../backend.js";
import type { ZrevEvent } from "../../events.js";
import { ui } from "../../index.js";
import {
  ZR_KEY_BACKSPACE,
  ZR_KEY_DOWN,
  ZR_KEY_ENTER,
  ZR_KEY_ESCAPE,
  ZR_KEY_TAB,
  ZR_KEY_UP,
} from "../../keybindings/keyCodes.js";
import { DEFAULT_TERMINAL_CAPS } from "../../terminalCaps.js";
import { defaultTheme } from "../../theme/defaultTheme.js";
import type { CommandItem, CommandPaletteProps, CommandSource } from "../../widgets/types.js";
import { WidgetRenderer } from "../widgetRenderer.js";
import { routeCommandPaletteKeyDown } from "../widgetRenderer/commandPaletteRouting.js";
import { flushMicrotasks } from "./helpers.js";

function createDeferred<T>(): {
  promise: Promise<T>;
  resolve: (value: T) => void;
} {
  let resolve: ((value: T) => void) | undefined;
  const promise = new Promise<T>((res) => {
    resolve = res;
  });
  return {
    promise,
    resolve: (value: T) => resolve?.(value),
  };
}

function keyEvent(key: number): ZrevEvent {
  return { kind: "key", timeMs: 0, key, mods: 0, action: "down" };
}

function noRenderHooks(): { enterRender: () => void; exitRender: () => void } {
  return { enterRender: () => {}, exitRender: () => {} };
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

describe("commandPalette routing contracts", () => {
  test("ArrowDown skips disabled items", () => {
    const items: readonly CommandItem[] = Object.freeze([
      { id: "disabled", label: "Disabled", sourceId: "commands", disabled: true },
      { id: "enabled-1", label: "Enabled One", sourceId: "commands" },
      { id: "enabled-2", label: "Enabled Two", sourceId: "commands" },
    ]);
    const selectionChanges: number[] = [];

    const palette: CommandPaletteProps = {
      id: "cp",
      open: true,
      query: "",
      sources: Object.freeze([]),
      selectedIndex: 0,
      onChange: () => {},
      onSelect: () => {},
      onClose: () => {},
      onSelectionChange: (index) => selectionChanges.push(index),
    };

    assert.equal(routeCommandPaletteKeyDown(keyEvent(ZR_KEY_DOWN), palette, items), true);
    assert.deepEqual(selectionChanges, [1]);
  });

  test("ArrowUp wraps to the last enabled item when the selection starts at the first item", () => {
    const items: readonly CommandItem[] = Object.freeze([
      { id: "disabled", label: "Disabled", sourceId: "commands", disabled: true },
      { id: "enabled-1", label: "Enabled One", sourceId: "commands" },
      { id: "enabled-2", label: "Enabled Two", sourceId: "commands" },
    ]);
    const selectionChanges: number[] = [];

    const palette: CommandPaletteProps = {
      id: "cp",
      open: true,
      query: "",
      sources: Object.freeze([]),
      selectedIndex: 1,
      onChange: () => {},
      onSelect: () => {},
      onClose: () => {},
      onSelectionChange: (index) => selectionChanges.push(index),
    };

    assert.equal(routeCommandPaletteKeyDown(keyEvent(ZR_KEY_UP), palette, items), true);
    assert.deepEqual(selectionChanges, [2]);
  });

  test("enter activates selected item or falls back to first enabled item", () => {
    const items: readonly CommandItem[] = Object.freeze([
      { id: "disabled", label: "Disabled", sourceId: "commands", disabled: true },
      { id: "enabled-1", label: "Enabled One", sourceId: "commands" },
      { id: "enabled-2", label: "Enabled Two", sourceId: "commands" },
    ]);
    const activated: string[] = [];
    let closedCount = 0;

    const palette: CommandPaletteProps = {
      id: "cp",
      open: true,
      query: "",
      sources: Object.freeze([]),
      selectedIndex: 0,
      onChange: () => {},
      onSelect: (item) => activated.push(item.id),
      onClose: () => {
        closedCount++;
      },
    };

    assert.equal(routeCommandPaletteKeyDown(keyEvent(ZR_KEY_ENTER), palette, items), true);
    assert.deepEqual(activated, ["enabled-1"]);
    assert.equal(closedCount, 1);
  });

  test("backspace updates query immediately and resets selection", () => {
    const queryChanges: string[] = [];
    const selectionChanges: number[] = [];

    const palette: CommandPaletteProps = {
      id: "cp",
      open: true,
      query: "abc",
      sources: Object.freeze([]),
      selectedIndex: 3,
      onChange: (next) => queryChanges.push(next),
      onSelect: () => {},
      onClose: () => {},
      onSelectionChange: (index) => selectionChanges.push(index),
    };

    assert.equal(routeCommandPaletteKeyDown(keyEvent(ZR_KEY_BACKSPACE), palette, []), true);
    assert.deepEqual(queryChanges, ["ab"]);
    assert.deepEqual(selectionChanges, [0]);
  });
});

describe("commandPalette async fetch contracts", () => {
  test("same query and sources do not refetch until the query changes", () => {
    const requestedQueries: string[] = [];

    const source: CommandSource = {
      id: "commands",
      name: "Commands",
      getItems: (query) => {
        requestedQueries.push(query);
        return Object.freeze([]);
      },
    };
    let sources = Object.freeze([source]);

    const backend = createNoopBackend();
    const renderer = new WidgetRenderer<void>({
      backend,
      requestRender: () => {},
    });

    let query = "a";
    const view = () =>
      ui.commandPalette({
        id: "cp",
        open: true,
        query,
        sources,
        selectedIndex: 0,
        onChange: (next) => {
          query = next;
        },
        onSelect: () => {},
        onClose: () => {},
      });

    let frame = renderer.submitFrame(
      view,
      undefined,
      { cols: 60, rows: 10 },
      defaultTheme,
      noRenderHooks(),
    );
    assert.equal(frame.ok, true);

    frame = renderer.submitFrame(
      view,
      undefined,
      { cols: 60, rows: 10 },
      defaultTheme,
      noRenderHooks(),
    );
    assert.equal(frame.ok, true);

    sources = Object.freeze([source]);
    frame = renderer.submitFrame(
      view,
      undefined,
      { cols: 60, rows: 10 },
      defaultTheme,
      noRenderHooks(),
    );
    assert.equal(frame.ok, true);

    query = "ab";
    frame = renderer.submitFrame(
      view,
      undefined,
      { cols: 60, rows: 10 },
      defaultTheme,
      noRenderHooks(),
    );
    assert.equal(frame.ok, true);

    assert.deepEqual(requestedQueries, ["a", "a", "ab"]);
  });

  test("stale async results do not replace the latest command selection", async () => {
    const first = createDeferred<readonly CommandItem[]>();
    const second = createDeferred<readonly CommandItem[]>();
    const requestedQueries: string[] = [];

    const source: CommandSource = {
      id: "commands",
      name: "Commands",
      getItems: (query) => {
        requestedQueries.push(query);
        if (query === "a") return first.promise;
        if (query === "ab") return second.promise;
        return Object.freeze([]);
      },
    };
    const sources = Object.freeze([source]);

    const backend = createNoopBackend();
    const renderer = new WidgetRenderer<void>({
      backend,
      requestRender: () => {},
    });
    const selected: string[] = [];
    let closedCount = 0;
    let query = "a";

    const view = () =>
      ui.commandPalette({
        id: "cp",
        open: true,
        query,
        sources,
        selectedIndex: 0,
        onChange: (next) => {
          query = next;
        },
        onSelect: (item) => selected.push(item.id),
        onClose: () => {
          closedCount++;
        },
      });

    let frame = renderer.submitFrame(
      view,
      undefined,
      { cols: 60, rows: 10 },
      defaultTheme,
      noRenderHooks(),
    );
    assert.equal(frame.ok, true);

    query = "ab";
    frame = renderer.submitFrame(
      view,
      undefined,
      { cols: 60, rows: 10 },
      defaultTheme,
      noRenderHooks(),
    );
    assert.equal(frame.ok, true);

    second.resolve(
      Object.freeze([
        { id: "new", label: "ab candidate", sourceId: "commands" },
      ] satisfies CommandItem[]),
    );
    await flushMicrotasks(4);
    frame = renderer.submitFrame(
      view,
      undefined,
      { cols: 60, rows: 10 },
      defaultTheme,
      noRenderHooks(),
    );
    assert.equal(frame.ok, true);
    renderer.routeEngineEvent(keyEvent(ZR_KEY_TAB));
    assert.equal(renderer.getFocusedId(), "cp");
    renderer.routeEngineEvent(keyEvent(ZR_KEY_ENTER));
    assert.deepEqual(selected, ["new"]);
    assert.equal(closedCount, 1);
    selected.length = 0;
    closedCount = 0;

    first.resolve(
      Object.freeze([
        { id: "old", label: "a candidate", sourceId: "commands" },
      ] satisfies CommandItem[]),
    );
    await flushMicrotasks(4);
    frame = renderer.submitFrame(
      view,
      undefined,
      { cols: 60, rows: 10 },
      defaultTheme,
      noRenderHooks(),
    );
    assert.equal(frame.ok, true);

    renderer.routeEngineEvent(keyEvent(ZR_KEY_TAB));
    assert.equal(renderer.getFocusedId(), "cp");

    renderer.routeEngineEvent(keyEvent(ZR_KEY_ENTER));

    assert.deepEqual(requestedQueries, ["a", "ab"]);
    assert.deepEqual(selected, ["new"]);
    assert.equal(closedCount, 1);
  });
});
