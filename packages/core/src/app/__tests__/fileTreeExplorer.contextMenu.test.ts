import { assert, describe, test } from "@rezi-ui/testkit";
import type { RuntimeBackend } from "../../backend.js";
import type { ZrevEvent } from "../../events.js";
import { ui } from "../../index.js";
import { DEFAULT_TERMINAL_CAPS } from "../../terminalCaps.js";
import { defaultTheme } from "../../theme/defaultTheme.js";
import type { FileNode } from "../../widgets/types.js";
import { WidgetRenderer } from "../widgetRenderer.js";

function noRenderHooks(): { enterRender: () => void; exitRender: () => void } {
  return { enterRender: () => {}, exitRender: () => {} };
}

function mouseEvent(
  x: number,
  y: number,
  mouseKind: 1 | 2 | 3 | 4 | 5,
  opts: Readonly<{ buttons?: number; timeMs?: number }> = {},
): ZrevEvent {
  return {
    kind: "mouse",
    timeMs: opts.timeMs ?? 0,
    x,
    y,
    mouseKind,
    mods: 0,
    buttons: opts.buttons ?? 0,
    wheelX: 0,
    wheelY: 0,
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

describe("FileTreeExplorer context menu", () => {
  test("right click calls onContextMenu for the node under cursor", () => {
    const backend = createNoopBackend();
    const renderer = new WidgetRenderer<void>({
      backend,
      requestRender: () => {},
    });

    const calls: string[] = [];

    const data: readonly FileNode[] = Object.freeze([
      Object.freeze({ name: "a", path: "/a", type: "file" }),
      Object.freeze({ name: "b", path: "/b", type: "file" }),
    ]);

    const vnode = ui.fileTreeExplorer({
      id: "fte",
      data,
      expanded: [],
      onToggle: () => {},
      onSelect: () => {},
      onActivate: () => {},
      onContextMenu: (node) => calls.push(node.path),
    });

    const res = renderer.submitFrame(
      () => vnode,
      undefined,
      { cols: 20, rows: 5 },
      defaultTheme,
      noRenderHooks(),
    );
    assert.ok(res.ok);

    // Right-click (buttons bit 4) on the second row (index 1).
    renderer.routeEngineEvent(mouseEvent(0, 1, 3, { buttons: 4 }));
    assert.deepEqual(calls, ["/b"]);

    // Middle click should not fire context menu.
    renderer.routeEngineEvent(mouseEvent(0, 0, 3, { buttons: 2 }));
    assert.deepEqual(calls, ["/b"]);

    // Left click should not fire context menu.
    renderer.routeEngineEvent(mouseEvent(0, 0, 3, { buttons: 1 }));
    assert.deepEqual(calls, ["/b"]);
  });

  test("right click mapping is row-stable and ignores rows with no backing node", () => {
    const backend = createNoopBackend();
    const renderer = new WidgetRenderer<void>({
      backend,
      requestRender: () => {},
    });

    const calls: string[] = [];

    const data: FileNode = Object.freeze({
      name: "root",
      path: "/",
      type: "directory",
      children: Object.freeze([
        Object.freeze({ name: "a", path: "/a", type: "file" }),
        Object.freeze({ name: "b", path: "/b", type: "file" }),
      ]),
    });

    const vnode = ui.fileTreeExplorer({
      id: "fte",
      data,
      expanded: ["/"],
      onToggle: () => {},
      onSelect: () => {},
      onActivate: () => {},
      onContextMenu: (node) => calls.push(node.path),
    });

    const res = renderer.submitFrame(
      () => vnode,
      undefined,
      { cols: 20, rows: 5 },
      defaultTheme,
      noRenderHooks(),
    );
    assert.ok(res.ok);

    renderer.routeEngineEvent(mouseEvent(0, 1, 3, { buttons: 4 }));
    renderer.routeEngineEvent(mouseEvent(0, 2, 3, { buttons: 4 }));
    renderer.routeEngineEvent(mouseEvent(0, 4, 3, { buttons: 4 }));

    assert.deepEqual(calls, ["/a", "/b"]);
  });
});
