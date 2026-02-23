import { assert, describe, test } from "@rezi-ui/testkit";
import type { RuntimeBackend } from "../../backend.js";
import type { ZrevEvent } from "../../events.js";
import { ui } from "../../index.js";
import { ZR_MOD_CTRL } from "../../keybindings/keyCodes.js";
import { DEFAULT_TERMINAL_CAPS } from "../../terminalCaps.js";
import { defaultTheme } from "../../theme/defaultTheme.js";
import type { CommandItem, CommandSource } from "../../widgets/types.js";
import { createApp } from "../createApp.js";
import { WidgetRenderer } from "../widgetRenderer.js";
import { encodeZrevBatchV1, flushMicrotasks, makeBackendBatch } from "./helpers.js";
import { StubBackend } from "./stubBackend.js";

// Intentional WidgetRenderer-level harness: shortcut routing is an engine-level contract.
function noRenderHooks(): { enterRender: () => void; exitRender: () => void } {
  return { enterRender: () => {}, exitRender: () => {} };
}

function keyEvent(key: number, mods = 0, timeMs = 0): ZrevEvent {
  return { kind: "key", action: "down", key, mods, timeMs };
}

function textEvent(codepoint: number, timeMs = 0): ZrevEvent {
  return { kind: "text", codepoint, timeMs };
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

async function pushEvents(
  backend: StubBackend,
  events: NonNullable<Parameters<typeof encodeZrevBatchV1>[0]["events"]>,
): Promise<void> {
  backend.pushBatch(
    makeBackendBatch({
      bytes: encodeZrevBatchV1({ events }),
    }),
  );
  await flushMicrotasks(20);
}

async function settleNextFrame(backend: StubBackend): Promise<void> {
  backend.resolveNextFrame();
  await flushMicrotasks(20);
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

  test("onInput callback errors do not break text routing", () => {
    const backend = createNoopBackend();
    const callbackErrors: string[] = [];
    const renderer = new WidgetRenderer<void>({
      backend,
      requestRender: () => {},
      onUserCodeError: (detail) => callbackErrors.push(detail),
    });

    const frame = renderer.submitFrame(
      () =>
        ui.input({
          id: "name",
          value: "",
          onInput: () => {
            throw new Error("boom");
          },
        }),
      undefined,
      { cols: 40, rows: 6 },
      defaultTheme,
      noRenderHooks(),
    );
    assert.equal(frame.ok, true);

    renderer.routeEngineEvent(keyEvent(3 /* TAB */));
    const routed = renderer.routeEngineEvent(textEvent(97, 2));

    assert.deepEqual(routed.action, {
      id: "name",
      action: "input",
      value: "a",
      cursor: 1,
    });
    assert.equal(callbackErrors.length, 1);
    assert.equal(callbackErrors[0], "onInput handler threw: Error: boom");
  });

  test("onBlur callback errors do not prevent focus transitions", () => {
    const backend = createNoopBackend();
    const callbackErrors: string[] = [];
    const renderer = new WidgetRenderer<void>({
      backend,
      requestRender: () => {},
      onUserCodeError: (detail) => callbackErrors.push(detail),
    });

    const frame = renderer.submitFrame(
      () =>
        ui.column({}, [
          ui.input({
            id: "first",
            value: "1",
            onBlur: () => {
              throw new Error("blur-fail");
            },
          }),
          ui.input({ id: "second", value: "2" }),
        ]),
      undefined,
      { cols: 40, rows: 8 },
      defaultTheme,
      noRenderHooks(),
    );
    assert.equal(frame.ok, true);

    renderer.routeEngineEvent(keyEvent(3 /* TAB */));
    renderer.routeEngineEvent(keyEvent(3 /* TAB */));

    assert.equal(renderer.getFocusedId(), "second");
    assert.equal(callbackErrors.length, 1);
    assert.equal(callbackErrors[0], "onBlur handler threw: Error: blur-fail");
  });

  test("ctrl+letter keybindings are matched from text control characters", async () => {
    const backend = new StubBackend();
    let keybindingHits = 0;
    const app = createApp({ backend, initialState: 0 });

    app.keys({
      "ctrl+p": () => {
        keybindingHits++;
      },
    });
    app.view(() => ui.text("ready"));

    await app.start();
    try {
      await pushEvents(backend, [{ kind: "resize", timeMs: 1, cols: 40, rows: 12 }]);
      await settleNextFrame(backend);

      await pushEvents(backend, [{ kind: "text", timeMs: 2, codepoint: 16 }]); // Ctrl+P
      assert.equal(keybindingHits, 1);
    } finally {
      await app.stop();
    }
  });

  test("ctrl control-char text bindings still route while an overlay is active", async () => {
    const backend = new StubBackend();
    let keybindingHits = 0;
    const app = createApp({ backend, initialState: 0 });

    app.keys({
      "ctrl+p": () => {
        keybindingHits++;
      },
    });
    app.view(() =>
      ui.layers([
        ui.button({ id: "anchor", label: "Open" }),
        ui.dropdown({
          id: "dd",
          anchorId: "anchor",
          items: [{ id: "first", label: "First item" }],
          onSelect: () => {},
        }),
      ]),
    );

    await app.start();
    try {
      await pushEvents(backend, [{ kind: "resize", timeMs: 1, cols: 40, rows: 12 }]);
      await settleNextFrame(backend);

      await pushEvents(backend, [{ kind: "text", timeMs: 2, codepoint: 16 }]); // Ctrl+P
      assert.equal(keybindingHits, 1);
    } finally {
      await app.stop();
    }
  });

  test("tab/enter text control chars do not synthesize ctrl keybindings", async () => {
    const backend = new StubBackend();
    let keybindingHits = 0;
    const app = createApp({ backend, initialState: 0 });

    app.keys({
      "ctrl+i": () => {
        keybindingHits++;
      },
      "ctrl+m": () => {
        keybindingHits++;
      },
    });
    app.view(() =>
      ui.layers([
        ui.button({ id: "anchor", label: "Open" }),
        ui.dropdown({
          id: "dd",
          anchorId: "anchor",
          items: [{ id: "first", label: "First item" }],
          onSelect: () => {},
        }),
      ]),
    );

    await app.start();
    try {
      await pushEvents(backend, [{ kind: "resize", timeMs: 1, cols: 40, rows: 12 }]);
      await settleNextFrame(backend);

      await pushEvents(backend, [
        { kind: "text", timeMs: 2, codepoint: 9 }, // Tab
        { kind: "text", timeMs: 3, codepoint: 13 }, // Enter
      ]);
      assert.equal(keybindingHits, 0);
    } finally {
      await app.stop();
    }
  });

  test("text events bypass keybindings while dropdown overlay is active", async () => {
    const backend = new StubBackend();
    let keybindingHits = 0;
    const app = createApp({ backend, initialState: 0 });

    app.keys({
      x: () => {
        keybindingHits++;
      },
    });
    app.view(() =>
      ui.layers([
        ui.button({ id: "anchor", label: "Open" }),
        ui.dropdown({
          id: "dd",
          anchorId: "anchor",
          items: [{ id: "first", label: "First item" }],
          onSelect: () => {},
        }),
      ]),
    );

    await app.start();
    try {
      await pushEvents(backend, [{ kind: "resize", timeMs: 1, cols: 40, rows: 12 }]);
      await settleNextFrame(backend);

      await pushEvents(backend, [{ kind: "text", timeMs: 2, codepoint: 120 }]);
      assert.equal(keybindingHits, 0);
    } finally {
      await app.stop();
    }
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
