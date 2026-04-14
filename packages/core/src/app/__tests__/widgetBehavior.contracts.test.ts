import { assert, describe, test } from "@rezi-ui/testkit";
import type { RuntimeBackend } from "../../backend.js";
import type { ZrevEvent } from "../../events.js";
import { ui } from "../../index.js";
import {
  ZR_KEY_DOWN,
  ZR_KEY_END,
  ZR_KEY_ENTER,
  ZR_KEY_ESCAPE,
  ZR_KEY_RIGHT,
  ZR_KEY_TAB,
  ZR_KEY_UP,
} from "../../keybindings/keyCodes.js";
import { DEFAULT_TERMINAL_CAPS } from "../../terminalCaps.js";
import { createTestRenderer } from "../../testing/index.js";
import type { TestViewport } from "../../testing/renderer.js";
import { defaultTheme } from "../../theme/defaultTheme.js";
import type { VNode } from "../../widgets/types.js";
import { WidgetRenderer } from "../widgetRenderer.js";
import { flushMicrotasks } from "./helpers.js";

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

function keyEvent(key: number, mods = 0, timeMs = 0): ZrevEvent {
  return { kind: "key", timeMs, key, mods, action: "down" };
}

function mouseEvent(
  x: number,
  y: number,
  mouseKind: 1 | 2 | 3 | 4 | 5,
  opts: Readonly<{
    timeMs?: number;
    mods?: number;
    buttons?: number;
    wheelX?: number;
    wheelY?: number;
  }> = {},
): ZrevEvent {
  return {
    kind: "mouse",
    timeMs: opts.timeMs ?? 0,
    x,
    y,
    mouseKind,
    mods: opts.mods ?? 0,
    buttons: opts.buttons ?? 0,
    wheelX: opts.wheelX ?? 0,
    wheelY: opts.wheelY ?? 0,
  };
}

function submit(
  renderer: WidgetRenderer<void>,
  view: () => VNode,
  viewport: TestViewport = { cols: 40, rows: 12 },
): void {
  const res = renderer.submitFrame(view, undefined, viewport, defaultTheme, noRenderHooks());
  assert.ok(res.ok);
}

function centerOf(renderer: WidgetRenderer<void>, id: string): Readonly<{ x: number; y: number }> {
  const rect = renderer.getRectByIdIndex().get(id);
  assert.ok(rect !== undefined, `${id} rect should exist`);
  if (!rect) return { x: 0, y: 0 };
  return Object.freeze({
    x: rect.x + Math.max(0, Math.floor((rect.w - 1) / 2)),
    y: rect.y + Math.max(0, Math.floor((rect.h - 1) / 2)),
  });
}

describe("input and textarea behavior contracts", () => {
  test("disabled input and textarea stay out of tab order and ignore mouse focus", () => {
    const renderer = new WidgetRenderer<void>({
      backend: createNoopBackend(),
      requestRender: () => {},
    });

    const view = () =>
      ui.column({}, [
        ui.input({ id: "name", value: "", disabled: true, onInput: () => {} }),
        ui.textarea({ id: "notes", value: "", rows: 3, disabled: true, onInput: () => {} }),
        ui.button({ id: "save", label: "Save" }),
      ]);

    submit(renderer, view);

    renderer.routeEngineEvent(keyEvent(ZR_KEY_TAB));
    assert.equal(renderer.getFocusedId(), "save");

    const nameCenter = centerOf(renderer, "name");
    renderer.routeEngineEvent(mouseEvent(nameCenter.x, nameCenter.y, 3, { buttons: 1 }));
    renderer.routeEngineEvent(mouseEvent(nameCenter.x, nameCenter.y, 4));
    assert.equal(renderer.getFocusedId(), "save");

    const notesCenter = centerOf(renderer, "notes");
    renderer.routeEngineEvent(mouseEvent(notesCenter.x, notesCenter.y, 3, { buttons: 1 }));
    renderer.routeEngineEvent(mouseEvent(notesCenter.x, notesCenter.y, 4));
    assert.equal(renderer.getFocusedId(), "save");
  });
});

describe("modal, overlay, and focus behavior contracts", () => {
  test("Escape closes a modal and restores focus to returnFocusTo", () => {
    const renderer = new WidgetRenderer<void>({
      backend: createNoopBackend(),
      requestRender: () => {},
    });

    let open = true;
    let closeCount = 0;
    const view = () =>
      ui.layers([
        ui.column({}, [
          ui.button({ id: "trigger", label: "Open settings" }),
          ui.input({ id: "field", value: "ready", onInput: () => {} }),
        ]),
        ...(open
          ? [
              ui.modal({
                id: "settings",
                title: "Settings",
                initialFocus: "dismiss",
                returnFocusTo: "trigger",
                onClose: () => {
                  closeCount++;
                  open = false;
                },
                content: ui.text("Modal body"),
                actions: [ui.button({ id: "dismiss", label: "Dismiss" })],
              }),
            ]
          : []),
      ]);

    submit(renderer, view);
    assert.equal(renderer.getFocusedId(), "dismiss");

    renderer.routeEngineEvent(keyEvent(ZR_KEY_ESCAPE));
    submit(renderer, view);

    assert.equal(closeCount, 1);
    assert.equal(renderer.getFocusedId(), "trigger");

    const text = createTestRenderer({ viewport: { cols: 40, rows: 12 } })
      .render(view())
      .toText();
    assert.equal(text.includes("Settings"), false);
  });

  test("backdrop clicks can close the modal without leaking the background press", () => {
    const renderer = new WidgetRenderer<void>({
      backend: createNoopBackend(),
      requestRender: () => {},
    });

    let open = true;
    let closeCount = 0;
    let backgroundPresses = 0;
    const view = () =>
      ui.layers([
        ui.column({}, [
          ui.button({
            id: "background",
            label: "Background action",
            onPress: () => {
              backgroundPresses++;
            },
          }),
        ]),
        ...(open
          ? [
              ui.modal({
                id: "confirm",
                title: "Confirm",
                initialFocus: "cancel",
                closeOnBackdrop: true,
                onClose: () => {
                  closeCount++;
                  open = false;
                },
                content: ui.text("Confirm action"),
                actions: [ui.button({ id: "cancel", label: "Cancel" })],
              }),
            ]
          : []),
      ]);

    submit(renderer, view);
    const bgCenter = centerOf(renderer, "background");
    renderer.routeEngineEvent(mouseEvent(bgCenter.x, bgCenter.y, 3, { buttons: 1 }));
    renderer.routeEngineEvent(mouseEvent(bgCenter.x, bgCenter.y, 4));
    submit(renderer, view);

    assert.equal(closeCount, 1);
    assert.equal(backgroundPresses, 0);
  });

  test("backdrop clicks are blocked when closeOnBackdrop is false", () => {
    const renderer = new WidgetRenderer<void>({
      backend: createNoopBackend(),
      requestRender: () => {},
    });

    let closeCount = 0;
    let backgroundPresses = 0;
    const view = () =>
      ui.layers([
        ui.column({}, [
          ui.button({
            id: "background",
            label: "Background action",
            onPress: () => {
              backgroundPresses++;
            },
          }),
        ]),
        ui.modal({
          id: "confirm",
          title: "Confirm",
          initialFocus: "cancel",
          closeOnBackdrop: false,
          onClose: () => {
            closeCount++;
          },
          content: ui.text("Confirm action"),
          actions: [ui.button({ id: "cancel", label: "Cancel" })],
        }),
      ]);

    submit(renderer, view);
    const bgCenter = centerOf(renderer, "background");
    renderer.routeEngineEvent(mouseEvent(bgCenter.x, bgCenter.y, 3, { buttons: 1 }));
    renderer.routeEngineEvent(mouseEvent(bgCenter.x, bgCenter.y, 4));

    assert.equal(closeCount, 0);
    assert.equal(backgroundPresses, 0);
    assert.equal(renderer.getFocusedId(), "cancel");
  });
});

describe("select and dropdown behavior contracts", () => {
  test("disabled select stays out of focus order and ignores pointer focus", () => {
    const renderer = new WidgetRenderer<void>({
      backend: createNoopBackend(),
      requestRender: () => {},
    });

    let value = "dark";
    const view = () =>
      ui.column({}, [
        ui.select({
          id: "disabled-theme",
          value,
          disabled: true,
          options: [
            { value: "dark", label: "Dark" },
            { value: "system", label: "System" },
          ],
          onChange: (next) => {
            value = next;
          },
        }),
        ui.select({
          id: "enabled-theme",
          value,
          options: [
            { value: "dark", label: "Dark" },
            { value: "system", label: "System" },
          ],
          onChange: (next) => {
            value = next;
          },
        }),
      ]);

    submit(renderer, view);
    renderer.routeEngineEvent(keyEvent(ZR_KEY_TAB));
    assert.equal(renderer.getFocusedId(), "enabled-theme");

    const disabledCenter = centerOf(renderer, "disabled-theme");
    renderer.routeEngineEvent(mouseEvent(disabledCenter.x, disabledCenter.y, 3, { buttons: 1 }));
    renderer.routeEngineEvent(mouseEvent(disabledCenter.x, disabledCenter.y, 4));
    assert.equal(renderer.getFocusedId(), "enabled-theme");
    assert.equal(value, "dark");
  });

  test("dropdown item click selects the item and closes the overlay", () => {
    const renderer = new WidgetRenderer<void>({
      backend: createNoopBackend(),
      requestRender: () => {},
    });

    let open = true;
    let selected = "none";
    const events: string[] = [];
    const view = () =>
      ui.layers([
        ui.column({}, [
          ui.button({ id: "anchor", label: "Menu" }),
          ui.text(`Selected:${selected}`),
        ]),
        ...(open
          ? [
              ui.dropdown({
                id: "dd",
                anchorId: "anchor",
                position: "below-start",
                items: [
                  { id: "one", label: "One" },
                  { id: "two", label: "Two" },
                ],
                onSelect: (item) => {
                  selected = item.id;
                  events.push(`select:${item.id}`);
                },
                onClose: () => {
                  open = false;
                  events.push("close");
                },
              }),
            ]
          : []),
      ]);

    submit(renderer, view);
    renderer.routeEngineEvent(mouseEvent(2, 3, 3, { buttons: 1 }));
    renderer.routeEngineEvent(mouseEvent(2, 3, 4));
    submit(renderer, view);

    assert.deepEqual(events, ["select:two", "close"]);
    const text = createTestRenderer({ viewport: { cols: 40, rows: 12 } })
      .render(view())
      .toText();
    assert.equal(text.includes("Selected:two"), true);
    assert.equal(text.includes("One"), false);
  });
});

describe("table, tree, and virtual list behavior contracts", () => {
  test("table sort changes visible row order and row activation follows that order", () => {
    const renderer = new WidgetRenderer<void>({
      backend: createNoopBackend(),
      requestRender: () => {},
    });

    let sortColumn: string | undefined;
    let sortDirection: "asc" | "desc" | undefined;
    let pressed = "-";
    const rows = [
      { id: "b", name: "Bravo" },
      { id: "c", name: "Charlie" },
      { id: "a", name: "Alpha" },
    ];
    const visibleRows = () => {
      if (sortColumn !== "name" || sortDirection === undefined) return rows;
      const sorted = [...rows].sort((left, right) => left.name.localeCompare(right.name));
      return sortDirection === "desc" ? sorted.reverse() : sorted;
    };

    const view = () =>
      ui.column({}, [
        ui.text(`Pressed:${pressed}`),
        ui.table({
          id: "table",
          border: "none",
          columns: [
            {
              key: "name",
              header: "Name",
              flex: 1,
              sortable: true,
              render: (value) => ui.text(String(value)),
            },
          ],
          data: visibleRows(),
          getRowKey: (row) => row.id,
          ...(sortColumn !== undefined ? { sortColumn } : {}),
          ...(sortDirection !== undefined ? { sortDirection } : {}),
          onSort: (column, direction) => {
            sortColumn = column;
            sortDirection = direction;
          },
          onRowPress: (row) => {
            pressed = row.id;
          },
        }),
      ]);

    submit(renderer, view, { cols: 30, rows: 6 });
    renderer.routeEngineEvent(keyEvent(ZR_KEY_TAB));
    renderer.routeEngineEvent(keyEvent(ZR_KEY_UP));
    renderer.routeEngineEvent(keyEvent(ZR_KEY_ENTER));
    submit(renderer, view, { cols: 30, rows: 6 });

    const sortedText = createTestRenderer({ viewport: { cols: 30, rows: 6 } })
      .render(view())
      .toText();
    assert.equal(sortedText.indexOf("Alpha") !== -1, true);
    assert.equal(sortedText.indexOf("Bravo") !== -1, true);
    assert.equal(sortedText.indexOf("Charlie") !== -1, true);
    assert.equal(sortedText.indexOf("Alpha") < sortedText.indexOf("Bravo"), true);
    assert.equal(sortedText.indexOf("Bravo") < sortedText.indexOf("Charlie"), true);

    renderer.routeEngineEvent(keyEvent(ZR_KEY_DOWN));
    renderer.routeEngineEvent(keyEvent(ZR_KEY_ENTER));
    submit(renderer, view, { cols: 30, rows: 6 });

    const text = createTestRenderer({ viewport: { cols: 30, rows: 6 } })
      .render(view())
      .toText();
    assert.equal(text.includes("Pressed:a"), true);
  });

  test("virtualList keeps selection and scroll callbacks aligned with keyboard and wheel input", () => {
    const renderer = new WidgetRenderer<void>({
      backend: createNoopBackend(),
      requestRender: () => {},
    });

    const selected: string[] = [];
    const scrolled: Array<Readonly<{ scrollTop: number; range: [number, number] }>> = [];

    const view = () =>
      ui.virtualList({
        id: "list",
        items: new Array<number>(100).fill(0).map((_, index) => index),
        itemHeight: 1,
        renderItem: (item, _index, focused) =>
          ui.text(focused ? `> ${String(item)}` : String(item)),
        onSelect: (item, index) => {
          selected.push(`${String(item)}:${String(index)}`);
        },
        onScroll: (scrollTop, range) => {
          scrolled.push(Object.freeze({ scrollTop, range }));
        },
      });

    submit(renderer, view, { cols: 20, rows: 10 });
    renderer.routeEngineEvent(keyEvent(ZR_KEY_TAB));
    renderer.routeEngineEvent(keyEvent(ZR_KEY_DOWN));
    renderer.routeEngineEvent(keyEvent(ZR_KEY_ENTER));
    renderer.routeEngineEvent(mouseEvent(1, 1, 5, { wheelY: 1 }));
    renderer.routeEngineEvent(keyEvent(ZR_KEY_END));

    assert.deepEqual(selected, ["1:1"]);
    assert.deepEqual(scrolled, [
      { scrollTop: 3, range: [0, 16] },
      { scrollTop: 90, range: [87, 100] },
    ]);
  });

  test("tree expansion renders loaded children before activating them", async () => {
    const renderer = new WidgetRenderer<void>({
      backend: createNoopBackend(),
      requestRender: () => {},
    });

    type Node = Readonly<{ key: string; hasChildren?: boolean }>;
    const roots: readonly Node[] = Object.freeze([
      Object.freeze({ key: "root", hasChildren: true }),
      Object.freeze({ key: "lazy", hasChildren: true }),
    ]);

    let expanded: readonly string[] = Object.freeze([]);
    const selectedKeys: string[] = [];
    const activatedKeys: string[] = [];
    const loadedChildren = new Map<string, readonly Node[]>();

    const view = () =>
      ui.tree<Node>({
        id: "tree",
        data: roots,
        getKey: (node) => node.key,
        getChildren: (node) => loadedChildren.get(node.key),
        hasChildren: (node) => node.hasChildren === true,
        expanded,
        renderNode: (node) => ui.text(node.key),
        onSelect: (node) => {
          selectedKeys.push(node.key);
        },
        onPress: (node) => {
          activatedKeys.push(node.key);
        },
        onChange: (node, next) => {
          expanded = next
            ? Object.freeze([...expanded, node.key])
            : Object.freeze(expanded.filter((key) => key !== node.key));
        },
        loadChildren: async (node) => {
          if (node.key !== "lazy") return Object.freeze([]);
          await new Promise<void>((resolve) => queueMicrotask(resolve));
          const children = Object.freeze([Object.freeze({ key: "lazyChild", hasChildren: false })]);
          loadedChildren.set(node.key, children);
          return children;
        },
      });

    submit(renderer, view, { cols: 40, rows: 6 });
    renderer.routeEngineEvent(keyEvent(ZR_KEY_TAB));
    renderer.routeEngineEvent(keyEvent(ZR_KEY_DOWN));
    renderer.routeEngineEvent(keyEvent(ZR_KEY_DOWN));
    renderer.routeEngineEvent(keyEvent(ZR_KEY_RIGHT));
    await flushMicrotasks(20);
    submit(renderer, view, { cols: 40, rows: 6 });

    renderer.routeEngineEvent(keyEvent(ZR_KEY_RIGHT));
    submit(renderer, view, { cols: 40, rows: 6 });

    const text = createTestRenderer({ viewport: { cols: 40, rows: 6 } })
      .render(view())
      .toText();
    assert.equal(text.includes("lazyChild"), true);

    renderer.routeEngineEvent(keyEvent(ZR_KEY_ENTER));

    assert.deepEqual(selectedKeys, ["root", "lazy", "lazyChild"]);
    assert.deepEqual(activatedKeys, ["lazyChild"]);
  });
});
