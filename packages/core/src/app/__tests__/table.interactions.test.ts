import { assert, describe, test } from "@rezi-ui/testkit";
import type { RuntimeBackend } from "../../backend.js";
import type { ZrevEvent } from "../../events.js";
import { ui } from "../../index.js";
import { DEFAULT_TERMINAL_CAPS } from "../../terminalCaps.js";
import { defaultTheme } from "../../theme/defaultTheme.js";
import { WidgetRenderer } from "../widgetRenderer.js";

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
  opts: Readonly<{ timeMs?: number; mods?: number; wheelX?: number; wheelY?: number }> = {},
): ZrevEvent {
  return {
    kind: "mouse",
    timeMs: opts.timeMs ?? 0,
    x,
    y,
    mouseKind,
    mods: opts.mods ?? 0,
    buttons: 0,
    wheelX: opts.wheelX ?? 0,
    wheelY: opts.wheelY ?? 0,
  };
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

describe("table interactions", () => {
  test("keyboard header focus toggles sort", () => {
    const backend = createNoopBackend();
    const renderer = new WidgetRenderer<void>({
      backend,
      requestRender: () => {},
    });

    let sortColumn: string | undefined;
    let sortDirection: "asc" | "desc" | undefined;
    const sortEvents: string[] = [];

    const view = () =>
      ui.table({
        id: "t",
        border: "none",
        columns: [
          { key: "name", header: "Name", flex: 1, sortable: true },
          { key: "id", header: "ID", width: 4, sortable: true },
        ],
        data: [
          { id: "r0", name: "A" },
          { id: "r1", name: "B" },
        ],
        getRowKey: (r) => r.id,
        ...(sortColumn !== undefined ? { sortColumn } : {}),
        ...(sortDirection !== undefined ? { sortDirection } : {}),
        onSort: (col, dir) => {
          sortEvents.push(`${col}:${dir}`);
          sortColumn = col;
          sortDirection = dir;
        },
      });

    const res = renderer.submitFrame(
      () => view(),
      undefined,
      { cols: 20, rows: 6 },
      defaultTheme,
      noRenderHooks(),
    );
    assert.ok(res.ok);
    assert.equal(renderer.getFocusedId(), null);

    renderer.routeEngineEvent(keyEvent(3 /* TAB */));
    assert.equal(renderer.getFocusedId(), "t");

    // Focus header, then toggle sort on the first column.
    renderer.routeEngineEvent(keyEvent(20 /* UP */));
    renderer.routeEngineEvent(keyEvent(2 /* ENTER */));

    const res2 = renderer.submitFrame(
      () => view(),
      undefined,
      { cols: 20, rows: 6 },
      defaultTheme,
      noRenderHooks(),
    );
    assert.ok(res2.ok);

    // Toggle sort direction.
    renderer.routeEngineEvent(keyEvent(2 /* ENTER */));

    assert.deepEqual(sortEvents, ["name:asc", "name:desc"]);
  });

  test("mouse header click toggles sort", () => {
    const backend = createNoopBackend();
    const renderer = new WidgetRenderer<void>({
      backend,
      requestRender: () => {},
    });

    let sortColumn: string | undefined;
    let sortDirection: "asc" | "desc" | undefined;
    const sortEvents: string[] = [];

    const view = () =>
      ui.table({
        id: "t",
        border: "none",
        columns: [
          { key: "name", header: "Name", flex: 1, sortable: true },
          { key: "id", header: "ID", width: 4, sortable: true },
        ],
        data: [
          { id: "r0", name: "A" },
          { id: "r1", name: "B" },
        ],
        getRowKey: (r) => r.id,
        ...(sortColumn !== undefined ? { sortColumn } : {}),
        ...(sortDirection !== undefined ? { sortDirection } : {}),
        onSort: (col, dir) => {
          sortEvents.push(`${col}:${dir}`);
          sortColumn = col;
          sortDirection = dir;
        },
      });

    const res = renderer.submitFrame(
      () => view(),
      undefined,
      { cols: 20, rows: 6 },
      defaultTheme,
      noRenderHooks(),
    );
    assert.ok(res.ok);

    // Header is at y=0 when border=none and headerHeight=1.
    renderer.routeEngineEvent(mouseEvent(1, 0, 3));
    renderer.routeEngineEvent(mouseEvent(1, 0, 4));

    const res2 = renderer.submitFrame(
      () => view(),
      undefined,
      { cols: 20, rows: 6 },
      defaultTheme,
      noRenderHooks(),
    );
    assert.ok(res2.ok);

    // Toggle again.
    renderer.routeEngineEvent(mouseEvent(1, 0, 3));
    renderer.routeEngineEvent(mouseEvent(1, 0, 4));

    assert.deepEqual(sortEvents, ["name:asc", "name:desc"]);
  });

  test("double click fires onRowDoublePress", () => {
    const backend = createNoopBackend();
    const renderer = new WidgetRenderer<void>({
      backend,
      requestRender: () => {},
    });

    const calls: string[] = [];

    const vnode = ui.table({
      id: "t",
      border: "none",
      columns: [{ key: "id", header: "ID", flex: 1 }],
      data: [{ id: "r0" }, { id: "r1" }],
      getRowKey: (r) => r.id,
      onRowPress: (_row, idx) => calls.push(`press:${String(idx)}`),
      onRowDoublePress: (_row, idx) => calls.push(`double:${String(idx)}`),
    });

    const res = renderer.submitFrame(
      () => vnode,
      undefined,
      { cols: 20, rows: 6 },
      defaultTheme,
      noRenderHooks(),
    );
    assert.ok(res.ok);

    // Row 1 is at y=2 when border=none and headerHeight=1.
    renderer.routeEngineEvent(mouseEvent(1, 2, 3, { timeMs: 100 }));
    renderer.routeEngineEvent(mouseEvent(1, 2, 4, { timeMs: 120 }));
    renderer.routeEngineEvent(mouseEvent(1, 2, 3, { timeMs: 200 }));
    renderer.routeEngineEvent(mouseEvent(1, 2, 4, { timeMs: 220 }));

    assert.deepEqual(calls, ["press:1", "double:1"]);
  });

  test("header click between row clicks resets double-click state", () => {
    const backend = createNoopBackend();
    const renderer = new WidgetRenderer<void>({
      backend,
      requestRender: () => {},
    });

    const calls: string[] = [];

    const vnode = ui.table({
      id: "t",
      border: "none",
      columns: [{ key: "id", header: "ID", flex: 1, sortable: true }],
      data: [{ id: "r0" }, { id: "r1" }],
      getRowKey: (r) => r.id,
      onSort: (col, dir) => calls.push(`sort:${col}:${dir}`),
      onRowPress: (_row, idx) => calls.push(`press:${String(idx)}`),
      onRowDoublePress: (_row, idx) => calls.push(`double:${String(idx)}`),
    });

    const res = renderer.submitFrame(
      () => vnode,
      undefined,
      { cols: 20, rows: 6 },
      defaultTheme,
      noRenderHooks(),
    );
    assert.ok(res.ok);

    // First row click.
    renderer.routeEngineEvent(mouseEvent(1, 2, 3, { timeMs: 100 }));
    renderer.routeEngineEvent(mouseEvent(1, 2, 4, { timeMs: 120 }));

    // Intervening header click (y=0 with border=none/headerHeight=1).
    renderer.routeEngineEvent(mouseEvent(1, 0, 3, { timeMs: 180 }));
    renderer.routeEngineEvent(mouseEvent(1, 0, 4, { timeMs: 200 }));

    // Second row click within 500ms should be a normal press, not double.
    renderer.routeEngineEvent(mouseEvent(1, 2, 3, { timeMs: 260 }));
    renderer.routeEngineEvent(mouseEvent(1, 2, 4, { timeMs: 280 }));

    assert.deepEqual(calls, ["press:1", "sort:id:asc", "press:1"]);
  });
});
