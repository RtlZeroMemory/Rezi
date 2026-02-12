import { assert, describe, test } from "@rezi-ui/testkit";
import type { RuntimeBackend } from "../../backend.js";
import type { ZrevEvent } from "../../events.js";
import { type VNode, defineWidget, ui } from "../../index.js";
import { DEFAULT_TERMINAL_CAPS } from "../../terminalCaps.js";
import { defaultTheme } from "../../theme/defaultTheme.js";
import { TOAST_HEIGHT, getToastActionFocusId } from "../../widgets/toast.js";
import { createApp } from "../createApp.js";
import { WidgetRenderer } from "../widgetRenderer.js";
import { encodeZrevBatchV1, flushMicrotasks, makeBackendBatch } from "./helpers.js";
import { StubBackend } from "./stubBackend.js";

function noRenderHooks(): { enterRender: () => void; exitRender: () => void } {
  return { enterRender: () => {}, exitRender: () => {} };
}

function keyEvent(key: number, mods = 0): ZrevEvent {
  return { kind: "key", timeMs: 0, key, mods, action: "down" };
}

function mouseEvent(
  x: number,
  y: number,
  mouseKind: 1 | 2 | 3 | 4 | 5,
  opts: Readonly<{ timeMs?: number; buttons?: number; wheelX?: number; wheelY?: number }> = {},
): ZrevEvent {
  return {
    kind: "mouse",
    timeMs: opts.timeMs ?? 0,
    x,
    y,
    mouseKind,
    mods: 0,
    buttons: opts.buttons ?? 0,
    wheelX: opts.wheelX ?? 0,
    wheelY: opts.wheelY ?? 0,
  };
}

function mouseDownEvent(x: number, y: number): ZrevEvent {
  return mouseEvent(x, y, 3);
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

describe("WidgetRenderer integration (composition/hooks)", () => {
  test("defineWidget + useState triggers re-render and useEffect cleanup runs on unmount", async () => {
    const backend = new StubBackend();
    const app = createApp({ backend, initialState: { show: true } });

    const seenCounts: number[] = [];
    let effectMounts = 0;
    let cleanups = 0;
    let viewCalls = 0;

    const Counter = defineWidget<{ key?: string }>((_props, ctx) => {
      const [count, setCount] = ctx.useState(0);
      seenCounts.push(count);
      ctx.useEffect(() => {
        effectMounts++;
        return () => {
          cleanups++;
        };
      }, []);
      return ui.button({
        id: ctx.id("btn"),
        label: `count:${String(count)}`,
        onPress: () => setCount((c) => c + 1),
      });
    });

    app.view((s) => {
      viewCalls++;
      return ui.column({}, [
        s.show ? Counter({ key: "counter" }) : ui.text("gone", { key: "gone" }),
      ]);
    });

    await app.start();

    // Provide viewport via RESIZE so widget mode can render.
    backend.pushBatch(
      makeBackendBatch({
        bytes: encodeZrevBatchV1({
          events: [{ kind: "resize", timeMs: 1, cols: 40, rows: 10 }],
        }),
      }),
    );
    await flushMicrotasks(10);

    assert.equal(backend.requestedFrames.length, 1);
    assert.equal(viewCalls, 1);
    assert.deepEqual(seenCounts, [0]);
    assert.equal(effectMounts, 1);
    assert.equal(cleanups, 0);

    backend.resolveNextFrame();
    await flushMicrotasks(10);

    // TAB focuses the first focusable widget (focus starts at null).
    // Focus change is render-only (DIRTY_RENDER): view function is NOT re-invoked
    // because the widget tree hasn't changed — only the focus highlight moves.
    backend.pushBatch(
      makeBackendBatch({
        bytes: encodeZrevBatchV1({
          events: [{ kind: "key", timeMs: 2, key: 3, action: "down" }],
        }),
      }),
    );
    await flushMicrotasks(10);

    assert.equal(backend.requestedFrames.length, 2);
    assert.equal(viewCalls, 1); // render-only: view not called
    assert.deepEqual(seenCounts, [0]);
    assert.equal(effectMounts, 1);
    assert.equal(cleanups, 0);

    backend.resolveNextFrame();
    await flushMicrotasks(10);

    // Enter (key=2) activates the focused button and increments local state.
    // setCount() triggers DIRTY_VIEW, so the full commit pipeline runs this time.
    backend.pushBatch(
      makeBackendBatch({
        bytes: encodeZrevBatchV1({
          events: [{ kind: "key", timeMs: 3, key: 2, action: "down" }],
        }),
      }),
    );
    await flushMicrotasks(10);

    assert.equal(backend.requestedFrames.length, 3);
    assert.equal(viewCalls, 2); // commit: view called (setCount triggered DIRTY_VIEW)
    assert.deepEqual(seenCounts, [0, 1]);
    assert.equal(effectMounts, 1);
    assert.equal(cleanups, 0);

    backend.resolveNextFrame();
    await flushMicrotasks(10);

    // Unmount the widget: cleanup must run exactly once.
    app.update((prev) => ({ ...prev, show: false }));
    await flushMicrotasks(20);
    assert.equal(backend.requestedFrames.length, 4);
    assert.equal(cleanups, 1);
  });
});

describe("WidgetRenderer integration battery", () => {
  test("focusTrap wraps TAB within active trap", () => {
    const backend = createNoopBackend();
    const renderer = new WidgetRenderer<void>({
      backend,
      requestRender: () => {},
    });

    const vnode = ui.column({}, [
      ui.focusTrap(
        {
          id: "trap",
          active: true,
          initialFocus: "a",
        },
        [ui.button({ id: "a", label: "A" }), ui.button({ id: "b", label: "B" })],
      ),
      ui.button({ id: "c", label: "C" }),
    ]);

    const res = renderer.submitFrame(
      () => vnode,
      undefined,
      { cols: 40, rows: 10 },
      defaultTheme,
      noRenderHooks(),
    );
    assert.ok(res.ok);
    assert.equal(renderer.getFocusedId(), "a");

    renderer.routeEngineEvent(keyEvent(3 /* TAB */));
    assert.equal(renderer.getFocusedId(), "b");

    renderer.routeEngineEvent(keyEvent(3 /* TAB */));
    assert.equal(renderer.getFocusedId(), "a");
  });

  test("focusZone linear navigation moves focus with arrows", () => {
    const backend = createNoopBackend();
    const renderer = new WidgetRenderer<void>({
      backend,
      requestRender: () => {},
    });

    const vnode = ui.column({}, [
      ui.focusZone({ id: "zone", navigation: "linear", wrapAround: true }, [
        ui.button({ id: "z1", label: "Z1" }),
        ui.button({ id: "z2", label: "Z2" }),
        ui.button({ id: "z3", label: "Z3" }),
      ]),
    ]);

    const res = renderer.submitFrame(
      () => vnode,
      undefined,
      { cols: 40, rows: 10 },
      defaultTheme,
      noRenderHooks(),
    );
    assert.ok(res.ok);
    assert.equal(renderer.getFocusedId(), null);

    renderer.routeEngineEvent(keyEvent(3 /* TAB */));
    assert.equal(renderer.getFocusedId(), "z1");

    renderer.routeEngineEvent(keyEvent(21 /* DOWN */));
    assert.equal(renderer.getFocusedId(), "z2");

    renderer.routeEngineEvent(keyEvent(21 /* DOWN */));
    assert.equal(renderer.getFocusedId(), "z3");
  });

  test("focusZone onEnter/onExit fire on zone transitions", () => {
    const backend = createNoopBackend();
    const renderer = new WidgetRenderer<void>({
      backend,
      requestRender: () => {},
    });

    const events: string[] = [];

    const vnode = ui.column({}, [
      ui.focusZone(
        {
          id: "zone-1",
          onEnter: () => events.push("enter:zone-1"),
          onExit: () => events.push("exit:zone-1"),
        },
        [ui.button({ id: "a", label: "A" })],
      ),
      ui.focusZone(
        {
          id: "zone-2",
          onEnter: () => events.push("enter:zone-2"),
          onExit: () => events.push("exit:zone-2"),
        },
        [ui.button({ id: "b", label: "B" })],
      ),
    ]);

    const res = renderer.submitFrame(
      () => vnode,
      undefined,
      { cols: 40, rows: 10 },
      defaultTheme,
      noRenderHooks(),
    );
    assert.ok(res.ok);
    assert.equal(renderer.getFocusedId(), null);

    renderer.routeEngineEvent(keyEvent(3 /* TAB */));
    assert.equal(renderer.getFocusedId(), "a");
    assert.deepEqual(events, ["enter:zone-1"]);

    renderer.routeEngineEvent(keyEvent(3 /* TAB */));
    assert.equal(renderer.getFocusedId(), "b");
    assert.deepEqual(events, ["enter:zone-1", "exit:zone-1", "enter:zone-2"]);
  });

  test("focusZone restores latest focused widget when leaving and returning in same cycle", () => {
    const backend = createNoopBackend();
    const renderer = new WidgetRenderer<void>({
      backend,
      requestRender: () => {},
    });

    const vnode = ui.column({}, [
      ui.focusZone({ id: "zone-1", navigation: "linear", wrapAround: true }, [
        ui.button({ id: "a", label: "A" }),
        ui.button({ id: "b", label: "B" }),
      ]),
      ui.focusZone({ id: "zone-2", navigation: "linear", wrapAround: true }, [
        ui.button({ id: "c", label: "C" }),
        ui.button({ id: "d", label: "D" }),
      ]),
    ]);

    const res = renderer.submitFrame(
      () => vnode,
      undefined,
      { cols: 40, rows: 10 },
      defaultTheme,
      noRenderHooks(),
    );
    assert.ok(res.ok);

    // Same interaction cycle: move within zone-1, leave to zone-2, then return via TAB wrap.
    renderer.routeEngineEvent(keyEvent(3 /* TAB */));
    assert.equal(renderer.getFocusedId(), "a");

    renderer.routeEngineEvent(keyEvent(21 /* DOWN */));
    assert.equal(renderer.getFocusedId(), "b");

    renderer.routeEngineEvent(keyEvent(3 /* TAB */));
    assert.equal(renderer.getFocusedId(), "c");

    renderer.routeEngineEvent(keyEvent(3 /* TAB */));
    assert.equal(renderer.getFocusedId(), "b");
  });

  test("focusZone onEnter/onExit swallow exceptions", () => {
    const backend = createNoopBackend();
    const renderer = new WidgetRenderer<void>({
      backend,
      requestRender: () => {},
    });

    const vnode = ui.column({}, [
      ui.focusZone(
        {
          id: "zone-1",
          onEnter: () => {
            throw new Error("boom");
          },
          onExit: () => {
            throw new Error("boom2");
          },
        },
        [ui.button({ id: "a", label: "A" })],
      ),
      ui.focusZone({ id: "zone-2" }, [ui.button({ id: "b", label: "B" })]),
    ]);

    const res = renderer.submitFrame(
      () => vnode,
      undefined,
      { cols: 40, rows: 10 },
      defaultTheme,
      noRenderHooks(),
    );
    assert.ok(res.ok);

    assert.doesNotThrow(() => renderer.routeEngineEvent(keyEvent(3 /* TAB */)));
    assert.equal(renderer.getFocusedId(), "a");

    assert.doesNotThrow(() => renderer.routeEngineEvent(keyEvent(3 /* TAB */)));
    assert.equal(renderer.getFocusedId(), "b");
  });

  test("focusZone callbacks use final state after toast focus reconciliation", () => {
    const backend = createNoopBackend();
    const renderer = new WidgetRenderer<void>({
      backend,
      requestRender: () => {},
    });

    const events: string[] = [];
    const viewport = { cols: 40, rows: 10 };
    const vnode = ui.column({}, [
      ui.focusZone(
        {
          id: "zone-1",
          onEnter: () => events.push("enter:zone-1"),
          onExit: () => events.push("exit:zone-1"),
        },
        [ui.button({ id: "a", label: "A" })],
      ),
      ui.toastContainer({
        toasts: [
          {
            id: "t0",
            message: "toast0",
            type: "info",
            action: { label: "Act", onAction: () => {} },
          },
        ],
        onDismiss: () => {},
      }),
    ]);

    const first = renderer.submitFrame(
      () => vnode,
      undefined,
      viewport,
      defaultTheme,
      noRenderHooks(),
    );
    assert.ok(first.ok);

    renderer.routeEngineEvent(mouseDownEvent(viewport.cols - 6, viewport.rows - TOAST_HEIGHT + 1));
    assert.equal(renderer.getFocusedId(), getToastActionFocusId("t0"));

    events.length = 0;
    const second = renderer.submitFrame(
      () => vnode,
      undefined,
      viewport,
      defaultTheme,
      noRenderHooks(),
    );
    assert.ok(second.ok);
    assert.equal(renderer.getFocusedId(), getToastActionFocusId("t0"));
    assert.deepEqual(events, []);
  });

  test("toast action mouse click emits focusZone onExit before early return", () => {
    const backend = createNoopBackend();
    const renderer = new WidgetRenderer<void>({
      backend,
      requestRender: () => {},
    });

    const events: string[] = [];
    const activated: string[] = [];
    const viewport = { cols: 40, rows: 10 };

    const vnode = ui.column({}, [
      ui.focusZone(
        {
          id: "zone-1",
          onEnter: () => events.push("enter:zone-1"),
          onExit: () => events.push("exit:zone-1"),
        },
        [ui.button({ id: "a", label: "A" })],
      ),
      ui.toastContainer({
        toasts: [
          {
            id: "t0",
            message: "toast0",
            type: "info",
            action: { label: "Act", onAction: () => activated.push("t0") },
          },
        ],
        onDismiss: () => {},
      }),
    ]);

    const res = renderer.submitFrame(
      () => vnode,
      undefined,
      viewport,
      defaultTheme,
      noRenderHooks(),
    );
    assert.ok(res.ok);

    renderer.routeEngineEvent(keyEvent(3 /* TAB */));
    assert.equal(renderer.getFocusedId(), "a");
    assert.deepEqual(events, ["enter:zone-1"]);

    events.length = 0;
    renderer.routeEngineEvent(mouseDownEvent(viewport.cols - 6, viewport.rows - TOAST_HEIGHT + 1));

    assert.equal(renderer.getFocusedId(), getToastActionFocusId("t0"));
    assert.deepEqual(events, ["exit:zone-1"]);
    assert.deepEqual(activated, ["t0"]);
  });

  test("dropdown mouse click selects item and closes", () => {
    const backend = createNoopBackend();
    const renderer = new WidgetRenderer<void>({
      backend,
      requestRender: () => {},
    });

    const events: string[] = [];

    const vnode = ui.layers([
      ui.column({}, [ui.button({ id: "anchor", label: "Menu" })]),
      ui.dropdown({
        id: "dd",
        anchorId: "anchor",
        position: "below-start",
        items: [
          { id: "one", label: "One" },
          { id: "two", label: "Two" },
        ],
        onSelect: (item) => events.push(`select:${item.id}`),
        onClose: () => events.push("close"),
      }),
    ]);

    const res = renderer.submitFrame(
      () => vnode,
      undefined,
      { cols: 40, rows: 10 },
      defaultTheme,
      noRenderHooks(),
    );
    assert.ok(res.ok);

    renderer.routeEngineEvent(mouseEvent(2, 3, 3));
    renderer.routeEngineEvent(mouseEvent(2, 3, 4));

    assert.deepEqual(events, ["select:two", "close"]);
  });

  test("dropdown mouse up does not select different item after reorder", () => {
    const backend = createNoopBackend();
    const renderer = new WidgetRenderer<void>({
      backend,
      requestRender: () => {},
    });

    const events: string[] = [];
    let items: readonly { id: string; label: string }[] = [
      { id: "one", label: "One" },
      { id: "two", label: "Two" },
    ];

    const view = () =>
      ui.layers([
        ui.column({}, [ui.button({ id: "anchor", label: "Menu" })]),
        ui.dropdown({
          id: "dd",
          anchorId: "anchor",
          position: "below-start",
          items,
          onSelect: (item) => events.push(`select:${item.id}`),
          onClose: () => events.push("close"),
        }),
      ]);

    const first = renderer.submitFrame(
      () => view(),
      undefined,
      { cols: 40, rows: 10 },
      defaultTheme,
      noRenderHooks(),
    );
    assert.ok(first.ok);

    renderer.routeEngineEvent(mouseEvent(2, 3, 3));

    items = [
      { id: "two", label: "Two" },
      { id: "one", label: "One" },
    ];
    const second = renderer.submitFrame(
      () => view(),
      undefined,
      { cols: 40, rows: 10 },
      defaultTheme,
      noRenderHooks(),
    );
    assert.ok(second.ok);

    renderer.routeEngineEvent(mouseEvent(2, 3, 4));
    assert.deepEqual(events, []);
  });

  test("splitPane double-click toggles collapse via onCollapse", () => {
    const backend = createNoopBackend();
    const renderer = new WidgetRenderer<void>({
      backend,
      requestRender: () => {},
    });

    const calls: string[] = [];

    const vnode = ui.splitPane(
      {
        id: "sp",
        direction: "horizontal",
        sizes: [50, 50],
        onResize: () => {},
        collapsible: true,
        collapsed: [],
        onCollapse: (index, collapsed) => {
          calls.push(`${String(index)}:${collapsed ? "1" : "0"}`);
        },
      },
      [ui.text("A"), ui.text("B")],
    );

    const res = renderer.submitFrame(
      () => vnode,
      undefined,
      { cols: 40, rows: 10 },
      defaultTheme,
      noRenderHooks(),
    );
    assert.ok(res.ok);

    // divider is at x=20; hit area includes x=19 (left) and x=21 (right)
    // Left-side double click -> panel 0
    renderer.routeEngineEvent(mouseEvent(19, 0, 3, { timeMs: 1, buttons: 1 }));
    renderer.routeEngineEvent(mouseEvent(19, 0, 4, { timeMs: 2, buttons: 0 }));
    renderer.routeEngineEvent(mouseEvent(19, 0, 3, { timeMs: 100, buttons: 1 }));
    renderer.routeEngineEvent(mouseEvent(19, 0, 4, { timeMs: 101, buttons: 0 }));

    // Right-side double click -> panel 1
    renderer.routeEngineEvent(mouseEvent(21, 0, 3, { timeMs: 200, buttons: 1 }));
    renderer.routeEngineEvent(mouseEvent(21, 0, 4, { timeMs: 201, buttons: 0 }));
    renderer.routeEngineEvent(mouseEvent(21, 0, 3, { timeMs: 250, buttons: 1 }));
    renderer.routeEngineEvent(mouseEvent(21, 0, 4, { timeMs: 251, buttons: 0 }));

    assert.deepEqual(calls, ["0:1", "1:1"]);
  });

  test("virtualList routing updates selection and activates on Enter", () => {
    const backend = createNoopBackend();
    const renderer = new WidgetRenderer<void>({
      backend,
      requestRender: () => {},
    });

    const selected: string[] = [];

    const vnode = ui.virtualList({
      id: "v",
      items: ["a", "b", "c"],
      itemHeight: 1,
      renderItem: (item, _i, _focused) => ui.text(item),
      onSelect: (item, index) => selected.push(`${item}:${String(index)}`),
    });

    const res = renderer.submitFrame(
      () => vnode,
      undefined,
      { cols: 20, rows: 3 },
      defaultTheme,
      noRenderHooks(),
    );
    assert.ok(res.ok);
    assert.equal(renderer.getFocusedId(), null);

    renderer.routeEngineEvent(keyEvent(3 /* TAB */));
    assert.equal(renderer.getFocusedId(), "v");

    renderer.routeEngineEvent(keyEvent(21 /* DOWN */));
    renderer.routeEngineEvent(keyEvent(2 /* ENTER */));
    assert.deepEqual(selected, ["b:1"]);
  });

  test("virtualList onScroll fires for wheel and key-driven scroll", () => {
    const backend = createNoopBackend();
    const renderer = new WidgetRenderer<void>({
      backend,
      requestRender: () => {},
    });

    const scrolled: Array<Readonly<{ scrollTop: number; range: [number, number] }>> = [];

    const vnode = ui.virtualList({
      id: "v",
      items: new Array<number>(100).fill(0).map((_, i) => i),
      itemHeight: 1,
      renderItem: (item) => ui.text(String(item)),
      onScroll: (scrollTop, range) => scrolled.push(Object.freeze({ scrollTop, range })),
    });

    const res = renderer.submitFrame(
      () => vnode,
      undefined,
      { cols: 20, rows: 10 },
      defaultTheme,
      noRenderHooks(),
    );
    assert.ok(res.ok);

    renderer.routeEngineEvent(mouseEvent(1, 1, 5, { wheelY: 1 }));
    renderer.routeEngineEvent(keyEvent(3 /* TAB */));
    renderer.routeEngineEvent(keyEvent(13 /* END */));

    assert.deepEqual(scrolled, [
      { scrollTop: 3, range: [0, 16] },
      { scrollTop: 90, range: [87, 100] },
    ]);
  });

  test("routing rebuild GC clears virtualList/table local state for removed ids", () => {
    const backend = createNoopBackend();
    const renderer = new WidgetRenderer<void>({
      backend,
      requestRender: () => {},
    });

    const vlistSelected: string[] = [];
    const tablePressed: string[] = [];

    const Virtual = () =>
      ui.virtualList({
        id: "v",
        items: ["a", "b"],
        itemHeight: 1,
        renderItem: (item) => ui.text(item),
        onSelect: (item, index) => vlistSelected.push(`${item}:${String(index)}`),
      });

    const Table = () =>
      ui.table({
        id: "t",
        columns: [{ key: "id", header: "ID", flex: 1 }],
        data: [{ id: "r0" }, { id: "r1" }],
        getRowKey: (row) => row.id,
        onRowPress: (row, index) => tablePressed.push(`${row.id}:${String(index)}`),
      });

    const submit = (vnode: VNode) => {
      const res = renderer.submitFrame(
        () => vnode,
        undefined,
        { cols: 40, rows: 10 },
        defaultTheme,
        noRenderHooks(),
      );
      assert.ok(res.ok);
    };

    submit(ui.column({}, [Virtual(), Table()]));

    // VirtualList: select item index=1.
    renderer.routeEngineEvent(keyEvent(3 /* TAB */));
    renderer.routeEngineEvent(keyEvent(21 /* DOWN */));
    renderer.routeEngineEvent(keyEvent(2 /* ENTER */));

    // Table: focus and press row index=1.
    renderer.routeEngineEvent(keyEvent(3 /* TAB */));
    renderer.routeEngineEvent(keyEvent(21 /* DOWN */));
    renderer.routeEngineEvent(keyEvent(2 /* ENTER */));

    assert.deepEqual(vlistSelected, ["b:1"]);
    assert.deepEqual(tablePressed, ["r1:1"]);

    // Unmount both widgets and force a routing rebuild GC pass.
    submit(ui.text("gone"));

    // Remount with same ids; state should start from defaults.
    submit(ui.column({}, [Virtual(), Table()]));

    renderer.routeEngineEvent(keyEvent(3 /* TAB */));
    renderer.routeEngineEvent(keyEvent(2 /* ENTER */));

    renderer.routeEngineEvent(keyEvent(3 /* TAB */));
    renderer.routeEngineEvent(keyEvent(2 /* ENTER */));

    assert.deepEqual(vlistSelected, ["b:1", "a:0"]);
    assert.deepEqual(tablePressed, ["r1:1", "r0:0"]);
  });

  test("table routing moves focused row and activates on Enter", () => {
    const backend = createNoopBackend();
    const renderer = new WidgetRenderer<void>({
      backend,
      requestRender: () => {},
    });

    const pressed: string[] = [];
    const data = [{ id: "r0" }, { id: "r1" }];

    const vnode = ui.table({
      id: "t",
      columns: [{ key: "id", header: "ID", flex: 1 }],
      data,
      getRowKey: (row) => row.id,
      selection: [],
      selectionMode: "none",
      onRowPress: (row) => pressed.push(row.id),
    });

    const res = renderer.submitFrame(
      () => vnode,
      undefined,
      { cols: 30, rows: 4 },
      defaultTheme,
      noRenderHooks(),
    );
    assert.ok(res.ok);
    assert.equal(renderer.getFocusedId(), null);

    renderer.routeEngineEvent(keyEvent(3 /* TAB */));
    assert.equal(renderer.getFocusedId(), "t");

    renderer.routeEngineEvent(keyEvent(21 /* DOWN */));
    renderer.routeEngineEvent(keyEvent(2 /* ENTER */));
    assert.deepEqual(pressed, ["r1"]);
  });

  test("tree routing selects nodes and supports lazy loading cache", async () => {
    const backend = createNoopBackend();
    let invalidateCount = 0;

    const renderer = new WidgetRenderer<void>({
      backend,
      requestRender: () => {
        invalidateCount++;
      },
    });

    type Node = Readonly<{ key: string; hasChildren?: boolean }>;
    const roots: readonly Node[] = Object.freeze([
      Object.freeze({ key: "root", hasChildren: true }),
      Object.freeze({ key: "lazy", hasChildren: true }),
    ]);

    let expanded: readonly string[] = Object.freeze([]);
    const selectedKeys: string[] = [];
    let loadCalls = 0;

    const view = () =>
      ui.tree<Node>({
        id: "tree",
        data: roots,
        getKey: (n) => n.key,
        getChildren: (_n) => undefined,
        hasChildren: (n) => n.hasChildren === true,
        expanded,
        renderNode: (n) => ui.text(n.key),
        onSelect: (n) => selectedKeys.push(n.key),
        onToggle: (n, next) => {
          expanded = next
            ? Object.freeze([...expanded, n.key])
            : Object.freeze(expanded.filter((k) => k !== n.key));
        },
        loadChildren: async (n) => {
          loadCalls++;
          if (n.key !== "lazy") return Object.freeze([]);
          await new Promise<void>((resolve) => queueMicrotask(resolve));
          return Object.freeze([Object.freeze({ key: "lazyChild", hasChildren: false })]);
        },
      });

    {
      const res = renderer.submitFrame(
        () => view(),
        undefined,
        { cols: 40, rows: 6 },
        defaultTheme,
        noRenderHooks(),
      );
      assert.ok(res.ok);
      assert.equal(renderer.getFocusedId(), null);
    }

    renderer.routeEngineEvent(keyEvent(3 /* TAB */));
    assert.equal(renderer.getFocusedId(), "tree");

    // Move selection to "lazy".
    renderer.routeEngineEvent(keyEvent(21 /* DOWN */)); // select root
    renderer.routeEngineEvent(keyEvent(21 /* DOWN */)); // select lazy
    assert.deepEqual(selectedKeys, ["root", "lazy"]);

    // Expand "lazy" (right arrow) triggers loadChildren.
    renderer.routeEngineEvent(keyEvent(23 /* RIGHT */));
    assert.equal(loadCalls, 1);

    // Re-render to pick up expanded state.
    renderer.submitFrame(
      () => view(),
      undefined,
      { cols: 40, rows: 6 },
      defaultTheme,
      noRenderHooks(),
    );

    // Wait for async load and invalidate.
    await new Promise<void>((resolve) => setTimeout(resolve, 0));
    assert.equal(invalidateCount, 1);

    // Re-render with loaded children cached; RIGHT now moves to first child.
    renderer.submitFrame(
      () => view(),
      undefined,
      { cols: 40, rows: 6 },
      defaultTheme,
      noRenderHooks(),
    );
    renderer.routeEngineEvent(keyEvent(23 /* RIGHT */));
    assert.deepEqual(selectedKeys, ["root", "lazy", "lazyChild"]);
  });

  test("toast action is focusable and activates on Enter", () => {
    const backend = createNoopBackend();
    const renderer = new WidgetRenderer<void>({
      backend,
      requestRender: () => {},
    });

    const activated: string[] = [];

    const vnode = ui.toastContainer({
      toasts: [
        {
          id: "t0",
          message: "toast0",
          type: "info",
          action: { label: "Act0", onAction: () => activated.push("t0") },
        },
        {
          id: "t1",
          message: "toast1",
          type: "success",
          action: { label: "Act1", onAction: () => activated.push("t1") },
        },
      ],
      onDismiss: () => {},
    });

    const res = renderer.submitFrame(
      () => vnode,
      undefined,
      { cols: 40, rows: 10 },
      defaultTheme,
      noRenderHooks(),
    );
    assert.ok(res.ok);
    assert.equal(renderer.getFocusedId(), null);

    renderer.routeEngineEvent(keyEvent(3 /* TAB */));
    assert.equal(renderer.getFocusedId(), getToastActionFocusId("t0"));

    renderer.routeEngineEvent(keyEvent(2 /* ENTER */));
    assert.deepEqual(activated, ["t0"]);

    renderer.routeEngineEvent(keyEvent(3 /* TAB */));
    assert.equal(renderer.getFocusedId(), getToastActionFocusId("t1"));

    renderer.routeEngineEvent(keyEvent(2 /* ENTER */));
    assert.deepEqual(activated, ["t0", "t1"]);
  });
});
