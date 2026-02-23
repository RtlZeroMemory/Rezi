import { assert, describe, test } from "@rezi-ui/testkit";
import { WidgetRenderer } from "../../app/widgetRenderer.js";
import type { RuntimeBackend } from "../../backend.js";
import type { ZrevEvent } from "../../events.js";
import type { LayoutOverflowMetadata } from "../../layout/constraints.js";
import type { LayoutTree } from "../../layout/layout.js";
import type { Rect } from "../../layout/types.js";
import { DEFAULT_TERMINAL_CAPS } from "../../terminalCaps.js";
import { defaultTheme } from "../../theme/defaultTheme.js";
import type { VNode } from "../../widgets/types.js";
import { ui } from "../../widgets/ui.js";
import { routeWheel } from "../router.js";

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

function wheelEvent(
  x: number,
  y: number,
  wheelY: number,
  opts: Readonly<{ wheelX?: number; mouseKind?: 1 | 2 | 3 | 4 | 5 }> = {},
): ZrevEvent {
  return {
    kind: "mouse",
    timeMs: 1,
    x,
    y,
    mouseKind: opts.mouseKind ?? 5,
    mods: 0,
    buttons: 0,
    wheelX: opts.wheelX ?? 0,
    wheelY,
  };
}

function submit(
  renderer: WidgetRenderer<void>,
  vnode: VNode,
  plan: Readonly<{ commit: boolean; layout: boolean; checkLayoutStability: boolean }> = {
    commit: true,
    layout: true,
    checkLayoutStability: true,
  },
  viewport: Readonly<{ cols: number; rows: number }> = { cols: 80, rows: 24 },
): void {
  const res = renderer.submitFrame(
    () => vnode,
    undefined,
    viewport,
    defaultTheme,
    noRenderHooks(),
    plan,
  );
  assert.ok(res.ok);
}

function getRectById(renderer: WidgetRenderer<void>, id: string): Rect {
  const internal = renderer as unknown as Readonly<{ rectById: ReadonlyMap<string, Rect> }>;
  const rect = internal.rectById.get(id);
  if (!rect) throw new Error(`missing rect for id ${id}`);
  return rect;
}

function findLayoutNodeById(layoutTree: LayoutTree, id: string): LayoutTree | null {
  const stack: LayoutTree[] = [layoutTree];
  while (stack.length > 0) {
    const node = stack.pop();
    if (!node) continue;
    const nodeId = (node.vnode.props as { id?: unknown }).id;
    if (nodeId === id) return node;
    for (let i = node.children.length - 1; i >= 0; i--) {
      const child = node.children[i];
      if (child) stack.push(child);
    }
  }
  return null;
}

function getOverflowMetaById(renderer: WidgetRenderer<void>, id: string): LayoutOverflowMetadata {
  const internal = renderer as unknown as Readonly<{ layoutTree: LayoutTree | null }>;
  const root = internal.layoutTree;
  if (!root) throw new Error("missing layout tree");
  const node = findLayoutNodeById(root, id);
  if (!node || !node.meta) throw new Error(`missing overflow metadata for id ${id}`);
  return node.meta;
}

describe("wheel routing", () => {
  test("routeWheel returns nextScrollY when vertical overflow exists", () => {
    const r = routeWheel(wheelEvent(0, 0, 1), {
      scrollX: 0,
      scrollY: 0,
      contentWidth: 10,
      contentHeight: 20,
      viewportWidth: 10,
      viewportHeight: 5,
    });
    assert.equal(r.nextScrollY, 3);
  });

  test("routeWheel clamps scroll range", () => {
    const r = routeWheel(wheelEvent(0, 0, 10), {
      scrollX: 0,
      scrollY: 7,
      contentWidth: 10,
      contentHeight: 20,
      viewportWidth: 10,
      viewportHeight: 5,
    });
    assert.equal(r.nextScrollY, 15);
  });

  test("routeWheel returns empty result when no overflow exists", () => {
    const r = routeWheel(wheelEvent(0, 0, 1), {
      scrollX: 0,
      scrollY: 0,
      contentWidth: 8,
      contentHeight: 4,
      viewportWidth: 10,
      viewportHeight: 5,
    });
    assert.deepEqual(r, {});
  });

  test("routeWheel supports horizontal wheel deltas", () => {
    const r = routeWheel(wheelEvent(0, 0, 0, { wheelX: 2 }), {
      scrollX: 1,
      scrollY: 0,
      contentWidth: 40,
      contentHeight: 5,
      viewportWidth: 10,
      viewportHeight: 5,
    });
    assert.equal(r.nextScrollX, 7);
  });

  test("generic overflow:scroll container responds to wheel", () => {
    const renderer = new WidgetRenderer<void>({
      backend: createNoopBackend(),
      requestRender: () => {},
    });

    const vnode = ui.box(
      {
        id: "scroll.box",
        border: "none",
        width: 20,
        height: 3,
        overflow: "scroll",
      },
      [
        ui.box({ border: "none", mb: -2 }, [
          ui.button({ id: "inside.btn", label: "Inside" }),
          ui.text("line-2"),
          ui.text("line-3"),
          ui.text("line-4"),
          ui.text("line-5"),
        ]),
      ],
    );

    submit(
      renderer,
      vnode,
      { commit: true, layout: true, checkLayoutStability: true },
      { cols: 10, rows: 5 },
    );
    const before = getOverflowMetaById(renderer, "scroll.box");
    assert.equal(before.scrollY, 0);
    assert.ok(before.contentHeight > before.viewportHeight);

    const rect = getRectById(renderer, "inside.btn");
    const routed = renderer.routeEngineEvent(wheelEvent(rect.x, rect.y, 1));
    assert.equal(routed.needsRender, true);

    submit(renderer, vnode, { commit: false, layout: false, checkLayoutStability: true });
    const after = getOverflowMetaById(renderer, "scroll.box");
    assert.ok(after.scrollY > 0);
  });

  test("virtualList wheel routing still works", () => {
    const renderer = new WidgetRenderer<void>({
      backend: createNoopBackend(),
      requestRender: () => {},
    });

    const scrolled: number[] = [];
    const vnode = ui.virtualList({
      id: "list.v",
      items: new Array<number>(100).fill(0).map((_, i) => i),
      itemHeight: 1,
      renderItem: (item) => ui.text(String(item)),
      onScroll: (scrollTop) => scrolled.push(scrollTop),
    });

    submit(
      renderer,
      vnode,
      { commit: true, layout: true, checkLayoutStability: true },
      { cols: 10, rows: 5 },
    );
    const rect = getRectById(renderer, "list.v");
    renderer.routeEngineEvent(wheelEvent(rect.x, rect.y, 1));

    assert.deepEqual(scrolled, [3]);
  });

  test("codeEditor wheel routing still works", () => {
    const renderer = new WidgetRenderer<void>({
      backend: createNoopBackend(),
      requestRender: () => {},
    });

    const scrolls: Array<Readonly<{ top: number; left: number }>> = [];
    const lines = new Array<string>(20).fill("0123456789abcdef0123456789");
    const vnode = ui.codeEditor({
      id: "editor.main",
      lines,
      cursor: { line: 0, column: 0 },
      selection: null,
      scrollTop: 0,
      scrollLeft: 0,
      onChange: () => {},
      onSelectionChange: () => {},
      onScroll: (top, left) => scrolls.push({ top, left }),
    });

    submit(
      renderer,
      vnode,
      { commit: true, layout: true, checkLayoutStability: true },
      { cols: 10, rows: 5 },
    );
    const rect = getRectById(renderer, "editor.main");
    renderer.routeEngineEvent(wheelEvent(rect.x, rect.y, 1, { wheelX: 1 }));

    assert.deepEqual(scrolls, [{ top: 3, left: 3 }]);
  });

  test("nested scroll containers route wheel to the nearest scrollable ancestor", () => {
    const renderer = new WidgetRenderer<void>({
      backend: createNoopBackend(),
      requestRender: () => {},
    });

    const vnode = ui.box(
      {
        id: "outer.scroll",
        border: "none",
        width: 30,
        height: 6,
        overflow: "scroll",
      },
      [
        ui.box({ border: "none", mb: -2 }, [
          ui.box(
            {
              id: "inner.scroll",
              border: "none",
              width: 20,
              height: 3,
              overflow: "scroll",
            },
            [
              ui.box({ border: "none", mb: -2 }, [
                ui.button({ id: "inner.btn", label: "Inner" }),
                ui.text("inner-2"),
                ui.text("inner-3"),
                ui.text("inner-4"),
                ui.text("inner-5"),
              ]),
            ],
          ),
          ui.text("outer-1"),
          ui.text("outer-2"),
          ui.text("outer-3"),
          ui.text("outer-4"),
          ui.text("outer-5"),
          ui.text("outer-6"),
        ]),
      ],
    );

    submit(renderer, vnode);
    const buttonRect = getRectById(renderer, "inner.btn");
    renderer.routeEngineEvent(wheelEvent(buttonRect.x, buttonRect.y, 1));
    submit(renderer, vnode, { commit: false, layout: false, checkLayoutStability: true });

    const innerMeta = getOverflowMetaById(renderer, "inner.scroll");
    const outerMeta = getOverflowMetaById(renderer, "outer.scroll");
    assert.ok(innerMeta.scrollY > 0);
    assert.equal(outerMeta.scrollY, 0);
  });
});
