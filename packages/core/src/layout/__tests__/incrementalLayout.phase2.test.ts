import { assert, describe, test } from "@rezi-ui/testkit";
import type { VNode } from "../../index.js";
import { type LayoutTree, layout } from "../layout.js";

type Axis = "row" | "column";

type TrackedText = Readonly<{
  vnode: VNode;
  reads: () => number;
}>;

function mustLayout(
  node: VNode,
  maxW: number,
  maxH: number,
  axis: Axis = "column",
  measureCache?: WeakMap<VNode, unknown>,
  layoutCache?: WeakMap<VNode, unknown>,
): LayoutTree {
  const result = layout(node, 0, 0, maxW, maxH, axis, measureCache, layoutCache);
  if (!result.ok) {
    assert.fail(`layout failed: ${result.fatal.code}: ${result.fatal.detail}`);
  }
  return result.value;
}

function text(value: string, props: Record<string, unknown> = {}): VNode {
  return { kind: "text", props, text: value } as unknown as VNode;
}

function row(children: readonly VNode[], props: Record<string, unknown> = {}): VNode {
  return { kind: "row", props, children: Object.freeze([...children]) } as unknown as VNode;
}

function column(children: readonly VNode[], props: Record<string, unknown> = {}): VNode {
  return { kind: "column", props, children: Object.freeze([...children]) } as unknown as VNode;
}

function box(children: readonly VNode[], props: Record<string, unknown> = {}): VNode {
  return {
    kind: "box",
    props: { border: "none", ...props },
    children: Object.freeze([...children]),
  } as unknown as VNode;
}

function grid(children: readonly VNode[], props: Record<string, unknown> = {}): VNode {
  return {
    kind: "grid",
    props: { columns: 2, ...props },
    children: Object.freeze([...children]),
  } as unknown as VNode;
}

function focusZone(children: readonly VNode[], props: Record<string, unknown> = {}): VNode {
  return { kind: "focusZone", props, children: Object.freeze([...children]) } as unknown as VNode;
}

function layer(children: readonly VNode[], props: Record<string, unknown> = {}): VNode {
  return { kind: "layer", props, children: Object.freeze([...children]) } as unknown as VNode;
}

function layers(children: readonly VNode[], props: Record<string, unknown> = {}): VNode {
  return { kind: "layers", props, children: Object.freeze([...children]) } as unknown as VNode;
}

function createTrackedText(
  value: string,
  props: Record<string, unknown> = {},
): Readonly<{ vnode: VNode; reads: () => number }> {
  let reads = 0;
  const node = { kind: "text", props } as {
    kind: "text";
    props: Record<string, unknown>;
    text?: string;
  };
  Object.defineProperty(node, "text", {
    configurable: true,
    enumerable: true,
    get: () => {
      reads++;
      return value;
    },
  });
  return Object.freeze({ vnode: node as unknown as VNode, reads: () => reads });
}

function totalReads(nodes: readonly TrackedText[]): number {
  let total = 0;
  for (const node of nodes) total += node.reads();
  return total;
}

describe("incremental layout phase 2", () => {
  describe("layout cache hit/miss behavior", () => {
    test("same tree and constraints returns cached LayoutTree instance", () => {
      const measureCache = new WeakMap<VNode, unknown>();
      const layoutCache = new WeakMap<VNode, unknown>();
      const root = row([text("a"), text("b")], { width: 20, gap: 1 });

      const first = mustLayout(root, 20, 5, "column", measureCache, layoutCache);
      const second = mustLayout(root, 20, 5, "column", measureCache, layoutCache);
      assert.equal(second, first);
    });

    test("changing one leaf only invalidates that subtree", () => {
      const measureCache = new WeakMap<VNode, unknown>();
      const layoutCache = new WeakMap<VNode, unknown>();
      const stableRight = column([text("right-a"), text("right-b")], { width: 18 });
      const left0 = column([text("left-v1")], { width: 18 });
      const left1 = column([text("left-v2")], { width: 18 });
      const root0 = row([left0, stableRight], { width: 40 });
      const root1 = row([left1, stableRight], { width: 40 });

      const first = mustLayout(root0, 40, 8, "column", measureCache, layoutCache);
      const second = mustLayout(root1, 40, 8, "column", measureCache, layoutCache);
      assert.notEqual(second.children[0], first.children[0]);
      assert.equal(second.children[1], first.children[1]);
    });

    test("changing root constraints misses cache", () => {
      const measureCache = new WeakMap<VNode, unknown>();
      const layoutCache = new WeakMap<VNode, unknown>();
      const root = box([row([text("alpha"), text("beta")], { gap: 1 })], { width: "100%" });

      const first = mustLayout(root, 30, 10, "column", measureCache, layoutCache);
      const second = mustLayout(root, 50, 10, "column", measureCache, layoutCache);
      assert.notEqual(second, first);
    });

    test("cached result preserves deterministic rect values", () => {
      const measureCache = new WeakMap<VNode, unknown>();
      const layoutCache = new WeakMap<VNode, unknown>();
      const root = row([text("a"), text("bbbb")], { width: 12, gap: 1 });

      const first = mustLayout(root, 12, 4, "column", measureCache, layoutCache);
      const second = mustLayout(root, 12, 4, "column", measureCache, layoutCache);
      assert.equal(first.rect.w, 12);
      assert.equal(first.children.length, 2);
      assert.equal(second, first);
      assert.deepEqual(second, first);
    });

    test("forcedH differences create independent cache keys", () => {
      const measureCache = new WeakMap<VNode, unknown>();
      const layoutCache = new WeakMap<VNode, unknown>();
      const child = text("z");

      const stretch = row([child], { height: 4, align: "stretch" });
      const normal = row([child], { height: 4, align: "start" });
      const stretchTree = mustLayout(stretch, 20, 4, "column", measureCache, layoutCache);
      const normalTree = mustLayout(normal, 20, 4, "column", measureCache, layoutCache);

      const stretchChild = stretchTree.children[0];
      const normalChild = normalTree.children[0];
      assert.ok(stretchChild !== undefined && normalChild !== undefined);
      if (!stretchChild || !normalChild) return;
      assert.equal(stretchChild.rect.h, 4);
      assert.ok(normalChild.rect.h <= 1);
    });

    test("forcedW differences create independent cache keys", () => {
      const measureCache = new WeakMap<VNode, unknown>();
      const layoutCache = new WeakMap<VNode, unknown>();
      const child = text("narrow");

      const stretch = column([child], { width: 10, align: "stretch" });
      const normal = column([child], { width: 10, align: "start" });
      const stretchTree = mustLayout(stretch, 10, 6, "column", measureCache, layoutCache);
      const normalTree = mustLayout(normal, 10, 6, "column", measureCache, layoutCache);

      const stretchChild = stretchTree.children[0];
      const normalChild = normalTree.children[0];
      assert.ok(stretchChild !== undefined && normalChild !== undefined);
      if (!stretchChild || !normalChild) return;
      assert.equal(stretchChild.rect.w, 10);
      assert.ok(normalChild.rect.w < 10);
    });

    test("axis differences create independent cache keys", () => {
      const measureCache = new WeakMap<VNode, unknown>();
      const layoutCache = new WeakMap<VNode, unknown>();
      const root = row([text("axis")], { width: 20 });

      const asRow = mustLayout(root, 20, 6, "row", measureCache, layoutCache);
      const asColumn = mustLayout(root, 20, 6, "column", measureCache, layoutCache);
      assert.notEqual(asRow, asColumn);
    });

    test("position x/y differences create independent cache keys", () => {
      const measureCache = new WeakMap<VNode, unknown>();
      const layoutCache = new WeakMap<VNode, unknown>();
      const root = row([text("moved")], { width: 20 });

      const first = layout(root, 0, 0, 20, 5, "column", measureCache, layoutCache);
      const second = layout(root, 3, 2, 20, 5, "column", measureCache, layoutCache);
      assert.equal(first.ok, true);
      assert.equal(second.ok, true);
      if (!first.ok || !second.ok) return;
      assert.notEqual(second.value, first.value);
      assert.equal(first.value.rect.x, 0);
      assert.equal(first.value.rect.y, 0);
      assert.equal(second.value.rect.x, 3);
      assert.equal(second.value.rect.y, 2);
      assert.equal(first.value.rect.w, second.value.rect.w);
      assert.equal(first.value.rect.h, second.value.rect.h);
    });
  });

  describe("cache correctness", () => {
    function assertCachedMatchesUncached(
      node: VNode,
      maxW: number,
      maxH: number,
      axis: Axis = "column",
    ): void {
      const measureCache = new WeakMap<VNode, unknown>();
      const layoutCache = new WeakMap<VNode, unknown>();

      const warm = layout(node, 0, 0, maxW, maxH, axis, measureCache, layoutCache);
      if (!warm.ok) {
        assert.fail(`warm layout failed: ${warm.fatal.code}: ${warm.fatal.detail}`);
      }

      const cached = layout(node, 0, 0, maxW, maxH, axis, measureCache, layoutCache);
      const uncached = layout(node, 0, 0, maxW, maxH, axis);
      if (!cached.ok || !uncached.ok) {
        assert.fail("cached and uncached layouts should both succeed");
      }
      assert.deepEqual(cached.value, uncached.value);
    }

    test("cached and uncached match for row/column/box composition", () => {
      const tree = box(
        [
          row([text("a", { flex: 1 }), text("b", { flex: 2 })], { width: 40, gap: 1 }),
          column([text("footer")], { align: "center" }),
        ],
        { width: 40, height: 8 },
      );
      assertCachedMatchesUncached(tree, 40, 8);
    });

    test("cached and uncached match for grid layout", () => {
      const tree = grid(
        [text("c1"), text("c2-long"), text("c3"), text("c4"), text("c5"), text("c6")],
        { columns: 3, rowGap: 1, columnGap: 2 },
      );
      assertCachedMatchesUncached(tree, 80, 20);
    });

    test("cached and uncached match for focusZone composition", () => {
      const tree = focusZone([column([text("x"), text("y")], { gap: 1 })]);
      assertCachedMatchesUncached(tree, 30, 10);
    });

    test("cached and uncached match for layers/layer composition", () => {
      const tree = layers([
        layer([box([text("base")], { width: 20, height: 4 })]),
        layer([box([text("overlay")], { width: 18, height: 3 })]),
      ]);
      assertCachedMatchesUncached(tree, 50, 12);
    });

    test("cached and uncached match for deeply nested trees", () => {
      let current: VNode = text("leaf");
      for (let i = 0; i < 15; i++) {
        current = box([current], { border: "none" });
      }
      assertCachedMatchesUncached(current, 100, 30);
    });
  });

  describe("cache invalidation behavior", () => {
    test("replacing one vnode identity invalidates only replaced branch", () => {
      const measureCache = new WeakMap<VNode, unknown>();
      const layoutCache = new WeakMap<VNode, unknown>();
      const stable = column([text("stable")]);
      const changing0 = column([text("v0")]);
      const changing1 = column([text("v1")]);

      const first = mustLayout(
        row([stable, changing0], { width: 30 }),
        30,
        8,
        "column",
        measureCache,
        layoutCache,
      );
      const second = mustLayout(
        row([stable, changing1], { width: 30 }),
        30,
        8,
        "column",
        measureCache,
        layoutCache,
      );

      assert.equal(second.children[0], first.children[0]);
      assert.notEqual(second.children[1], first.children[1]);
    });

    test("adding a child invalidates container layout cache entry", () => {
      const measureCache = new WeakMap<VNode, unknown>();
      const layoutCache = new WeakMap<VNode, unknown>();
      const c0 = row([text("a"), text("b")], { width: 20 });
      const c1 = row([text("a"), text("b"), text("c")], { width: 20 });

      const first = mustLayout(c0, 20, 6, "column", measureCache, layoutCache);
      const second = mustLayout(c1, 20, 6, "column", measureCache, layoutCache);
      assert.notEqual(second, first);
      assert.equal(second.children.length, 3);
    });

    test("removing a child invalidates container layout cache entry", () => {
      const measureCache = new WeakMap<VNode, unknown>();
      const layoutCache = new WeakMap<VNode, unknown>();
      const c0 = row([text("a"), text("b"), text("c")], { width: 20 });
      const c1 = row([text("a"), text("b")], { width: 20 });

      const first = mustLayout(c0, 20, 6, "column", measureCache, layoutCache);
      const second = mustLayout(c1, 20, 6, "column", measureCache, layoutCache);
      assert.notEqual(second, first);
      assert.equal(second.children.length, 2);
    });

    test("reordering children invalidates container layout cache entry", () => {
      const measureCache = new WeakMap<VNode, unknown>();
      const layoutCache = new WeakMap<VNode, unknown>();
      const a = text("a");
      const b = text("b");
      const c = text("c");
      const c0 = row([a, b, c], { width: 20, gap: 1 });
      const c1 = row([c, b, a], { width: 20, gap: 1 });

      const first = mustLayout(c0, 20, 6, "column", measureCache, layoutCache);
      const second = mustLayout(c1, 20, 6, "column", measureCache, layoutCache);
      assert.notEqual(second, first);
      assert.equal(second.children.length, 3);
      assert.notEqual(second.children[0], first.children[0]);
    });

    test("different layout caches do not cross-contaminate", () => {
      const measureCache = new WeakMap<VNode, unknown>();
      const cacheA = new WeakMap<VNode, unknown>();
      const cacheB = new WeakMap<VNode, unknown>();
      const tree = row([text("x"), text("y")], { width: 20 });

      const first = mustLayout(tree, 20, 6, "column", measureCache, cacheA);
      const second = mustLayout(tree, 20, 6, "column", measureCache, cacheB);
      assert.notEqual(second, first);
      assert.deepEqual(second, first);
    });
  });

  describe("performance characteristics", () => {
    test("cached path performs fewer text reads than uncached path", () => {
      const tracked: TrackedText[] = [];
      const children: VNode[] = [];
      for (let i = 0; i < 200; i++) {
        const t = createTrackedText(`node-${String(i)}`);
        tracked.push(t);
        children.push(t.vnode);
      }
      const tree = row(children, { width: 220, gap: 0 });

      const sharedMeasure = new WeakMap<VNode, unknown>();
      const sharedLayout = new WeakMap<VNode, unknown>();
      for (let i = 0; i < 60; i++) {
        mustLayout(tree, 220, 20, "column", sharedMeasure, sharedLayout);
      }
      const cachedReads = totalReads(tracked);

      const uncachedTracked: TrackedText[] = [];
      const uncachedChildren: VNode[] = [];
      for (let i = 0; i < 200; i++) {
        const t = createTrackedText(`node-${String(i)}`);
        uncachedTracked.push(t);
        uncachedChildren.push(t.vnode);
      }
      const uncachedTree = row(uncachedChildren, { width: 220, gap: 0 });
      for (let i = 0; i < 60; i++) {
        mustLayout(
          uncachedTree,
          220,
          20,
          "column",
          new WeakMap<VNode, unknown>(),
          new WeakMap<VNode, unknown>(),
        );
      }
      const uncachedReads = totalReads(uncachedTracked);

      assert.ok(cachedReads < uncachedReads);
    });

    test("stable tree keeps reads flat after warmup across 500 cached layouts", () => {
      const tracked = createTrackedText("stable");
      const tree = box([tracked.vnode], { width: 20, height: 4 });
      const measureCache = new WeakMap<VNode, unknown>();
      const layoutCache = new WeakMap<VNode, unknown>();

      mustLayout(tree, 20, 4, "column", measureCache, layoutCache);
      const warmed = tracked.reads();
      for (let i = 0; i < 500; i++) {
        mustLayout(tree, 20, 4, "column", measureCache, layoutCache);
      }
      assert.equal(tracked.reads(), warmed);
    });

    test("many ephemeral layouts do not break cache hits for a stable node", () => {
      const stable = createTrackedText("stable");
      const stableTree = row([stable.vnode], { width: 20 });
      const measureCache = new WeakMap<VNode, unknown>();
      const layoutCache = new WeakMap<VNode, unknown>();

      mustLayout(stableTree, 20, 6, "column", measureCache, layoutCache);
      const warmed = stable.reads();
      for (let i = 0; i < 300; i++) {
        const ephemeral = row([text(`ephemeral-${String(i)}`)], { width: 20 });
        mustLayout(ephemeral, 20, 6, "column", measureCache, layoutCache);
      }
      mustLayout(stableTree, 20, 6, "column", measureCache, layoutCache);
      assert.equal(stable.reads(), warmed);
    });
  });

  describe("worst-case and edge-case behavior", () => {
    test("all widgets changing every frame remains correct against uncached layout", () => {
      const measureCache = new WeakMap<VNode, unknown>();
      const layoutCache = new WeakMap<VNode, unknown>();

      for (let frame = 0; frame < 40; frame++) {
        const children: VNode[] = [];
        for (let i = 0; i < 40; i++) {
          children.push(text(`f${String(frame)}-${String(i)}`));
        }
        const tree = row(children, { width: 80, gap: 0 });
        const cached = layout(tree, 0, 0, 80, 10, "column", measureCache, layoutCache);
        const uncached = layout(tree, 0, 0, 80, 10, "column");
        if (!cached.ok || !uncached.ok) {
          assert.fail("cached and uncached should both succeed in changing-frame scenario");
        }
        assert.deepEqual(cached.value, uncached.value);
      }
    });

    test("trivial spacer tree caches correctly", () => {
      const measureCache = new WeakMap<VNode, unknown>();
      const layoutCache = new WeakMap<VNode, unknown>();
      const tree = { kind: "spacer", props: {} } as unknown as VNode;

      const first = mustLayout(tree, 10, 5, "column", measureCache, layoutCache);
      const second = mustLayout(tree, 10, 5, "column", measureCache, layoutCache);
      assert.equal(second, first);
      assert.deepEqual(second.rect, { x: 0, y: 0, w: 0, h: 1 });
    });

    test("large tree with 1000 nodes layouts successfully", () => {
      const children: VNode[] = [];
      for (let i = 0; i < 1000; i++) {
        children.push(text(`n-${String(i)}`));
      }
      const tree = column(children, { gap: 0 });
      const laidOut = mustLayout(tree, 200, 2000);
      assert.equal(laidOut.children.length, 1000);
    });

    test("error LayoutResult is cached and reused", () => {
      const measureCache = new WeakMap<VNode, unknown>();
      const layoutCache = new WeakMap<VNode, unknown>();
      const invalid = row([text("x")], { gap: -1 });

      const first = layout(invalid, 0, 0, 20, 5, "column", measureCache, layoutCache);
      const second = layout(invalid, 0, 0, 20, 5, "column", measureCache, layoutCache);
      assert.equal(first.ok, false);
      assert.equal(second.ok, false);
      assert.deepEqual(second, first);
      assert.equal(second, first);
    });
  });
});
