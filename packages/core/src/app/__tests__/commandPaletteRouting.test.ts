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
import {
  kickoffCommandPaletteItemFetches,
  routeCommandPaletteKeyDown,
} from "../widgetRenderer/commandPaletteRouting.js";
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
  test("selection movement skips disabled items and wraps", () => {
    const items: readonly CommandItem[] = Object.freeze([
      { id: "disabled", label: "Disabled", sourceId: "commands", disabled: true },
      { id: "enabled-1", label: "Enabled One", sourceId: "commands" },
      { id: "enabled-2", label: "Enabled Two", sourceId: "commands" },
    ]);
    const selectionChanges: number[] = [];

    const basePalette: CommandPaletteProps = {
      id: "cp",
      open: true,
      query: "",
      sources: Object.freeze([]),
      selectedIndex: 0,
      onQueryChange: () => {},
      onSelect: () => {},
      onClose: () => {},
      onSelectionChange: (index) => selectionChanges.push(index),
    };

    assert.equal(routeCommandPaletteKeyDown(keyEvent(ZR_KEY_DOWN), basePalette, items), true);

    const upPalette: CommandPaletteProps = { ...basePalette, selectedIndex: 1 };
    assert.equal(routeCommandPaletteKeyDown(keyEvent(ZR_KEY_UP), upPalette, items), true);

    assert.deepEqual(selectionChanges, [1, 2]);
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
      onQueryChange: () => {},
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
      onQueryChange: (next) => queryChanges.push(next),
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
  test("query/sources identity gate refetches and query changes trigger immediate fetch", () => {
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
    const sources: readonly CommandSource[] = Object.freeze([source]);

    const commandPaletteById = new Map<string, CommandPaletteProps>();
    const commandPaletteItemsById = new Map<string, readonly CommandItem[]>();
    const commandPaletteLoadingById = new Map<string, boolean>();
    const commandPaletteFetchTokenById = new Map<string, number>();
    const commandPaletteLastQueryById = new Map<string, string>();
    const commandPaletteLastSourcesRefById = new Map<string, readonly unknown[]>();
    let renderCount = 0;

    const paletteForQuery = (query: string): CommandPaletteProps => ({
      id: "cp",
      open: true,
      query,
      sources,
      selectedIndex: 0,
      onQueryChange: () => {},
      onSelect: () => {},
      onClose: () => {},
    });

    commandPaletteById.set("cp", paletteForQuery("a"));
    kickoffCommandPaletteItemFetches(
      commandPaletteById,
      commandPaletteItemsById,
      commandPaletteLoadingById,
      commandPaletteFetchTokenById,
      commandPaletteLastQueryById,
      commandPaletteLastSourcesRefById,
      () => {
        renderCount++;
      },
    );

    // Same query and same sources reference should not schedule another fetch.
    kickoffCommandPaletteItemFetches(
      commandPaletteById,
      commandPaletteItemsById,
      commandPaletteLoadingById,
      commandPaletteFetchTokenById,
      commandPaletteLastQueryById,
      commandPaletteLastSourcesRefById,
      () => {
        renderCount++;
      },
    );

    commandPaletteById.set("cp", paletteForQuery("ab"));
    kickoffCommandPaletteItemFetches(
      commandPaletteById,
      commandPaletteItemsById,
      commandPaletteLoadingById,
      commandPaletteFetchTokenById,
      commandPaletteLastQueryById,
      commandPaletteLastSourcesRefById,
      () => {
        renderCount++;
      },
    );

    assert.deepEqual(requestedQueries, ["a", "ab"]);
    assert.equal(commandPaletteLoadingById.get("cp"), true);
    assert.equal(renderCount, 0);
  });

  test("stale async results are ignored when a newer query fetch starts", async () => {
    const first = createDeferred<readonly CommandItem[]>();
    const second = createDeferred<readonly CommandItem[]>();

    const source: CommandSource = {
      id: "commands",
      name: "Commands",
      getItems: (query) => {
        if (query === "a") return first.promise;
        if (query === "ab") return second.promise;
        return Object.freeze([]);
      },
    };
    const sources: readonly CommandSource[] = Object.freeze([source]);

    const commandPaletteById = new Map<string, CommandPaletteProps>();
    const commandPaletteItemsById = new Map<string, readonly CommandItem[]>();
    const commandPaletteLoadingById = new Map<string, boolean>();
    const commandPaletteFetchTokenById = new Map<string, number>();
    const commandPaletteLastQueryById = new Map<string, string>();
    const commandPaletteLastSourcesRefById = new Map<string, readonly unknown[]>();
    let renderCount = 0;

    const paletteForQuery = (query: string): CommandPaletteProps => ({
      id: "cp",
      open: true,
      query,
      sources,
      selectedIndex: 0,
      onQueryChange: () => {},
      onSelect: () => {},
      onClose: () => {},
    });

    commandPaletteById.set("cp", paletteForQuery("a"));
    kickoffCommandPaletteItemFetches(
      commandPaletteById,
      commandPaletteItemsById,
      commandPaletteLoadingById,
      commandPaletteFetchTokenById,
      commandPaletteLastQueryById,
      commandPaletteLastSourcesRefById,
      () => {
        renderCount++;
      },
    );

    commandPaletteById.set("cp", paletteForQuery("ab"));
    kickoffCommandPaletteItemFetches(
      commandPaletteById,
      commandPaletteItemsById,
      commandPaletteLoadingById,
      commandPaletteFetchTokenById,
      commandPaletteLastQueryById,
      commandPaletteLastSourcesRefById,
      () => {
        renderCount++;
      },
    );

    second.resolve(
      Object.freeze([
        { id: "new", label: "ab candidate", sourceId: "commands" },
      ] satisfies CommandItem[]),
    );
    await flushMicrotasks(4);

    assert.deepEqual(
      commandPaletteItemsById.get("cp")?.map((item) => item.id),
      ["new"],
    );
    assert.equal(commandPaletteLoadingById.get("cp"), false);
    assert.equal(renderCount, 1);

    first.resolve(
      Object.freeze([
        { id: "old", label: "a candidate", sourceId: "commands" },
      ] satisfies CommandItem[]),
    );
    await flushMicrotasks(4);

    assert.deepEqual(
      commandPaletteItemsById.get("cp")?.map((item) => item.id),
      ["new"],
    );
    assert.equal(commandPaletteLoadingById.get("cp"), false);
    assert.equal(renderCount, 1);
  });
});

describe("commandPalette escape contracts in layered focus contexts", () => {
  test("modal layer with closeOnEscape=false routes Escape to focused command palette", () => {
    const backend = createNoopBackend();
    const renderer = new WidgetRenderer<void>({
      backend,
      requestRender: () => {},
    });
    const events: string[] = [];

    const vnode = ui.layers([
      ui.layer({
        id: "modal",
        modal: true,
        closeOnEscape: false,
        onClose: () => events.push("layer-close"),
        content: ui.commandPalette({
          id: "cp",
          open: true,
          query: "",
          sources: Object.freeze([]),
          selectedIndex: 0,
          onQueryChange: () => {},
          onSelect: () => {},
          onClose: () => events.push("palette-close"),
        }),
      }),
    ]);

    const res = renderer.submitFrame(
      () => vnode,
      undefined,
      { cols: 60, rows: 10 },
      defaultTheme,
      noRenderHooks(),
    );
    assert.ok(res.ok);
    assert.equal(renderer.getFocusedId(), null);

    renderer.routeEngineEvent(keyEvent(ZR_KEY_TAB));
    assert.equal(renderer.getFocusedId(), "cp");

    renderer.routeEngineEvent(keyEvent(ZR_KEY_ESCAPE));
    assert.deepEqual(events, ["palette-close"]);
  });

  test("modal layer with closeOnEscape=true closes layer before palette handler", () => {
    const backend = createNoopBackend();
    const renderer = new WidgetRenderer<void>({
      backend,
      requestRender: () => {},
    });
    const events: string[] = [];

    const vnode = ui.layers([
      ui.layer({
        id: "modal",
        modal: true,
        closeOnEscape: true,
        onClose: () => events.push("layer-close"),
        content: ui.commandPalette({
          id: "cp",
          open: true,
          query: "",
          sources: Object.freeze([]),
          selectedIndex: 0,
          onQueryChange: () => {},
          onSelect: () => {},
          onClose: () => events.push("palette-close"),
        }),
      }),
    ]);

    const res = renderer.submitFrame(
      () => vnode,
      undefined,
      { cols: 60, rows: 10 },
      defaultTheme,
      noRenderHooks(),
    );
    assert.ok(res.ok);
    assert.equal(renderer.getFocusedId(), null);

    renderer.routeEngineEvent(keyEvent(ZR_KEY_TAB));
    assert.equal(renderer.getFocusedId(), "cp");

    renderer.routeEngineEvent(keyEvent(ZR_KEY_ESCAPE));
    assert.deepEqual(events, ["layer-close"]);
  });
});
