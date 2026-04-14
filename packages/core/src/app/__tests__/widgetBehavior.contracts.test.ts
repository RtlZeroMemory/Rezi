import { assert, describe, test } from "@rezi-ui/testkit";
import type { RuntimeBackend } from "../../backend.js";
import type { ZrevEvent } from "../../events.js";
import { defineWidget, ui, useModalStack } from "../../index.js";
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

  test("clicking a focusable input moves focus and blur fires when focus leaves", () => {
    const renderer = new WidgetRenderer<void>({
      backend: createNoopBackend(),
      requestRender: () => {},
    });

    let value = "";
    let blurCount = 0;
    let pressCount = 0;
    const view = () =>
      ui.column({}, [
        ui.input({
          id: "name",
          value,
          onInput: (next) => {
            value = next;
          },
          onBlur: () => {
            blurCount++;
          },
        }),
        ui.button({
          id: "save",
          label: "Save",
          onPress: () => {
            pressCount++;
          },
        }),
      ]);

    submit(renderer, view);

    const nameCenter = centerOf(renderer, "name");
    renderer.routeEngineEvent(mouseEvent(nameCenter.x, nameCenter.y, 3, { buttons: 1 }));
    renderer.routeEngineEvent(mouseEvent(nameCenter.x, nameCenter.y, 4));
    assert.equal(renderer.getFocusedId(), "name");

    const typed = renderer.routeEngineEvent({ kind: "text", timeMs: 1, codepoint: 120 });
    assert.deepEqual(typed.action, {
      id: "name",
      action: "input",
      value: "x",
      cursor: 1,
    });

    submit(renderer, view);

    const saveCenter = centerOf(renderer, "save");
    renderer.routeEngineEvent(mouseEvent(saveCenter.x, saveCenter.y, 3, { buttons: 1 }));
    const release = renderer.routeEngineEvent(mouseEvent(saveCenter.x, saveCenter.y, 4));

    assert.equal(renderer.getFocusedId(), "save");
    assert.equal(blurCount, 1);
    assert.equal(pressCount, 1);
    assert.deepEqual(release.action, { id: "save", action: "press" });
  });

  test("readOnly textarea still accepts mouse focus and fires blur without emitting edits", () => {
    const renderer = new WidgetRenderer<void>({
      backend: createNoopBackend(),
      requestRender: () => {},
    });

    const values: string[] = [];
    let blurCount = 0;
    const view = () =>
      ui.column({}, [
        ui.textarea({
          id: "notes",
          value: "line 1",
          rows: 3,
          readOnly: true,
          onInput: (next) => {
            values.push(next);
          },
          onBlur: () => {
            blurCount++;
          },
        }),
        ui.button({ id: "next", label: "Next" }),
      ]);

    submit(renderer, view);

    const notesCenter = centerOf(renderer, "notes");
    renderer.routeEngineEvent(mouseEvent(notesCenter.x, notesCenter.y, 3, { buttons: 1 }));
    renderer.routeEngineEvent(mouseEvent(notesCenter.x, notesCenter.y, 4));
    assert.equal(renderer.getFocusedId(), "notes");

    const enter = renderer.routeEngineEvent(keyEvent(ZR_KEY_ENTER));
    const typed = renderer.routeEngineEvent({ kind: "text", timeMs: 1, codepoint: 120 });
    assert.equal(enter.action, undefined);
    assert.equal(typed.action, undefined);
    assert.deepEqual(values, []);

    const nextCenter = centerOf(renderer, "next");
    renderer.routeEngineEvent(mouseEvent(nextCenter.x, nextCenter.y, 3, { buttons: 1 }));
    renderer.routeEngineEvent(mouseEvent(nextCenter.x, nextCenter.y, 4));

    assert.equal(renderer.getFocusedId(), "next");
    assert.equal(blurCount, 1);
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

  test("Escape closes a dialog and restores focus to returnFocusTo", () => {
    const renderer = new WidgetRenderer<void>({
      backend: createNoopBackend(),
      requestRender: () => {},
    });

    let open = true;
    let closeCount = 0;
    const view = () =>
      ui.layers([
        ui.column({}, [ui.button({ id: "trigger", label: "Open dialog" })]),
        ...(open
          ? [
              ui.dialog({
                id: "confirm-exit",
                title: "Discard changes",
                message: "Leave without saving?",
                initialFocus: "stay",
                returnFocusTo: "trigger",
                onClose: () => {
                  closeCount++;
                  open = false;
                },
                actions: [
                  { id: "stay", label: "Stay", onPress: () => {} },
                  { id: "leave", label: "Leave", intent: "danger", onPress: () => {} },
                ],
              }),
            ]
          : []),
      ]);

    submit(renderer, view);
    assert.equal(renderer.getFocusedId(), "stay");

    renderer.routeEngineEvent(keyEvent(ZR_KEY_ESCAPE));
    submit(renderer, view);

    assert.equal(closeCount, 1);
    assert.equal(renderer.getFocusedId(), "trigger");
    assert.equal(renderer.getRectByIdIndex().get("stay"), undefined);
  });

  test("useModalStack closes the top modal first and restores focus through the stack", () => {
    const renderer = new WidgetRenderer<void>({
      backend: createNoopBackend(),
      requestRender: () => {},
    });

    const ModalHarness = defineWidget<Record<string, never>>((_props, ctx) => {
      const modals = useModalStack(ctx);
      return ui.layers([
        ui.button({
          id: "open-login",
          label: "Open login",
          onPress: () => {
            modals.push("login", {
              title: "Login",
              initialFocus: "login-next",
              returnFocusTo: "open-login",
              content: ui.text("Primary login flow"),
              actions: [
                ui.button({
                  id: "login-next",
                  label: "Next",
                  onPress: () => {
                    modals.push("mfa", {
                      title: "Two-factor code",
                      initialFocus: "mfa-close",
                      content: ui.text("Enter one-time code"),
                      actions: [ui.button({ id: "mfa-close", label: "Close" })],
                    });
                  },
                }),
              ],
            });
          },
        }),
        ...modals.render(),
      ]);
    });

    const view = () => ModalHarness({});

    submit(renderer, view);

    const openCenter = centerOf(renderer, "open-login");
    renderer.routeEngineEvent(mouseEvent(openCenter.x, openCenter.y, 3, { buttons: 1 }));
    renderer.routeEngineEvent(mouseEvent(openCenter.x, openCenter.y, 4));
    submit(renderer, view);

    assert.equal(renderer.getFocusedId(), "login-next");

    renderer.routeEngineEvent(keyEvent(ZR_KEY_ENTER));
    submit(renderer, view);

    assert.equal(renderer.getFocusedId(), "mfa-close");

    renderer.routeEngineEvent(keyEvent(ZR_KEY_ESCAPE));
    submit(renderer, view);

    assert.equal(renderer.getFocusedId(), "login-next");
    assert.equal(renderer.getRectByIdIndex().get("mfa-close"), undefined);

    renderer.routeEngineEvent(keyEvent(ZR_KEY_ESCAPE));
    submit(renderer, view);

    assert.equal(renderer.getFocusedId(), "open-login");
    assert.equal(renderer.getRectByIdIndex().get("login-next"), undefined);
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
