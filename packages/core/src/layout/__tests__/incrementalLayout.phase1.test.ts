import { assert, describe, test } from "@rezi-ui/testkit";
import type { VNode } from "../../index.js";
import { type LayoutTree, layout } from "../layout.js";

type Axis = "row" | "column";

function mustLayout(
  node: VNode,
  maxW: number,
  maxH: number,
  axis: Axis = "column",
  measureCache?: WeakMap<VNode, unknown>,
): LayoutTree {
  const result = layout(node, 0, 0, maxW, maxH, axis, measureCache);
  if (!result.ok) {
    assert.fail(`layout failed: ${result.fatal.code}: ${result.fatal.detail}`);
  }
  return result.value;
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

function focusZone(children: readonly VNode[], props: Record<string, unknown> = {}): VNode {
  return { kind: "focusZone", props, children: Object.freeze([...children]) } as unknown as VNode;
}

function grid(children: readonly VNode[], props: Record<string, unknown> = {}): VNode {
  return {
    kind: "grid",
    props: { columns: 2, ...props },
    children: Object.freeze([...children]),
  } as unknown as VNode;
}

function createTrackedText(
  text: string,
  props: Record<string, unknown> = {},
): Readonly<{
  vnode: VNode;
  reads: () => number;
}> {
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
      return text;
    },
  });
  return Object.freeze({ vnode: node as unknown as VNode, reads: () => reads });
}

describe("incremental layout phase 1", () => {
  describe("synthetic vnode reuse behavior", () => {
    test("box with unchanged children reuses cached leaf measurements across frames", () => {
      const cache = new WeakMap<VNode, unknown>();
      const tracked = createTrackedText("box-stable");
      const node = box([tracked.vnode], { width: 40, height: 8 });

      mustLayout(node, 40, 8, "column", cache);
      const readsAfterFirst = tracked.reads();
      mustLayout(node, 40, 8, "column", cache);
      assert.equal(tracked.reads(), readsAfterFirst);
    });

    test("box with changed child identity measures only the new child", () => {
      const cache = new WeakMap<VNode, unknown>();
      const a = createTrackedText("a");
      const b = createTrackedText("b");
      const node0 = box([a.vnode], { width: 40, height: 8 });
      const node1 = box([b.vnode], { width: 40, height: 8 });

      mustLayout(node0, 40, 8, "column", cache);
      const readsA = a.reads();
      mustLayout(node1, 40, 8, "column", cache);
      assert.equal(a.reads(), readsA);
      assert.ok(b.reads() > 0);
    });

    test("focusZone with unchanged children reuses cached leaf measurements", () => {
      const cache = new WeakMap<VNode, unknown>();
      const tracked = createTrackedText("zone-stable");
      const node = focusZone([tracked.vnode]);

      mustLayout(node, 50, 10, "column", cache);
      const readsAfterFirst = tracked.reads();
      mustLayout(node, 50, 10, "column", cache);
      assert.equal(tracked.reads(), readsAfterFirst);
    });

    test("nested boxes preserve cached reads for stable deep leaves", () => {
      const cache = new WeakMap<VNode, unknown>();
      const tracked = createTrackedText("nested-stable");
      const node = box([box([tracked.vnode], { width: 30 })], { width: 40, height: 10 });

      mustLayout(node, 40, 10, "column", cache);
      const readsAfterFirst = tracked.reads();
      mustLayout(node, 40, 10, "column", cache);
      assert.equal(tracked.reads(), readsAfterFirst);
    });

    test("box with empty children is deterministic and does not crash", () => {
      const cache = new WeakMap<VNode, unknown>();
      const node = box(Object.freeze([]), { width: 20, height: 4 });

      const first = mustLayout(node, 20, 4, "column", cache);
      const second = mustLayout(node, 20, 4, "column", cache);
      assert.deepEqual(first, second);
    });
  });

  describe("flex measurement reuse", () => {
    test("row with 3 flex children stays at 2 leaf reads each", () => {
      const a = createTrackedText("a", { flex: 1 });
      const b = createTrackedText("b", { flex: 1 });
      const c = createTrackedText("c", { flex: 1 });
      mustLayout(row([a.vnode, b.vnode, c.vnode], { width: 30 }), 30, 6);
      assert.deepEqual([a.reads(), b.reads(), c.reads()], [2, 2, 2]);
    });

    test("row with mixed fixed and flex children stays at 2 leaf reads each", () => {
      const fixed = createTrackedText("fixed", { width: 6 });
      const flexA = createTrackedText("flexA", { flex: 1 });
      const flexB = createTrackedText("flexB", { flex: 2 });
      mustLayout(row([fixed.vnode, flexA.vnode, flexB.vnode], { width: 40 }), 40, 6);
      assert.deepEqual([fixed.reads(), flexA.reads(), flexB.reads()], [2, 2, 2]);
    });

    test("column with flex children stays at 2 leaf reads each", () => {
      const a = createTrackedText("top", { flex: 1 });
      const b = createTrackedText("mid", { flex: 2 });
      const c = createTrackedText("bot", { flex: 1 });
      mustLayout(column([a.vnode, b.vnode, c.vnode], { height: 15 }), 40, 15);
      assert.deepEqual([a.reads(), b.reads(), c.reads()], [2, 2, 2]);
    });

    test("row with percentage widths stays at 2 leaf reads each", () => {
      const a = createTrackedText("left", { width: "25%" });
      const b = createTrackedText("mid", { width: "50%" });
      const c = createTrackedText("right", { width: "25%" });
      mustLayout(row([a.vnode, b.vnode, c.vnode], { width: 40 }), 40, 6);
      assert.deepEqual([a.reads(), b.reads(), c.reads()], [2, 2, 2]);
    });

    test("nested flex containers keep deterministic bounded read counts", () => {
      const a = createTrackedText("a", { flex: 1 });
      const b = createTrackedText("b", { flex: 1 });
      const c = createTrackedText("c", { flex: 1 });
      const inner = row([a.vnode, b.vnode], { flex: 1, width: "50%" });
      const root = row([inner, c.vnode], { width: 60 });
      mustLayout(root, 60, 8);
      assert.deepEqual([a.reads(), b.reads(), c.reads()], [2, 2, 3]);
    });
  });

  describe("measure cache persistence across frames", () => {
    test("single leaf replacement preserves hits for unchanged leaves", () => {
      const cache = new WeakMap<VNode, unknown>();
      const leftA = createTrackedText("left-a");
      const leftB = createTrackedText("left-b");
      const rightA = createTrackedText("right-a");
      const rightB = createTrackedText("right-b");

      const rightBranch = column([rightA.vnode, rightB.vnode], { width: 20 });
      const leftBranch0 = column([leftA.vnode, leftB.vnode], { width: 20 });
      const root0 = row([leftBranch0, rightBranch], { width: 40, height: 6 });
      mustLayout(root0, 40, 6, "column", cache);

      const before = [leftA.reads(), rightA.reads(), rightB.reads()] as const;
      const leftBChanged = createTrackedText("left-b-updated");
      const leftBranch1 = column([leftA.vnode, leftBChanged.vnode], { width: 20 });
      const root1 = row([leftBranch1, rightBranch], { width: 40, height: 6 });
      mustLayout(root1, 40, 6, "column", cache);

      assert.deepEqual([leftA.reads(), rightA.reads(), rightB.reads()], before);
      assert.ok(leftBChanged.reads() > 0);
    });

    test("changed vnode always gets a fresh measurement", () => {
      const cache = new WeakMap<VNode, unknown>();
      const stable = createTrackedText("stable");
      const changed0 = createTrackedText("first");
      const changed1 = createTrackedText("second");

      mustLayout(row([stable.vnode, changed0.vnode], { width: 40 }), 40, 5, "column", cache);
      const stableReads = stable.reads();
      mustLayout(row([stable.vnode, changed1.vnode], { width: 40 }), 40, 5, "column", cache);

      assert.equal(stable.reads(), stableReads);
      assert.ok(changed1.reads() > 0);
    });

    test("viewport resize invalidates cached measurements via new constraints", () => {
      const cache = new WeakMap<VNode, unknown>();
      const tracked = createTrackedText("resize-sensitive");
      const node = row([tracked.vnode], { width: "100%" });

      mustLayout(node, 40, 8, "column", cache);
      const readsAfterSmall = tracked.reads();
      mustLayout(node, 80, 16, "column", cache);
      assert.ok(tracked.reads() > readsAfterSmall);
    });

    test("repeating same tree 100 times keeps tracked reads stable after warmup", () => {
      const cache = new WeakMap<VNode, unknown>();
      const tracked = createTrackedText("steady");
      const node = row([tracked.vnode], { width: 20, height: 3 });

      mustLayout(node, 20, 3, "column", cache);
      const warmed = tracked.reads();
      for (let i = 0; i < 100; i++) {
        mustLayout(node, 20, 3, "column", cache);
      }
      assert.equal(tracked.reads(), warmed);
    });

    test("mix of reused and new leaves keeps deterministic hit/miss pattern", () => {
      const cache = new WeakMap<VNode, unknown>();
      const stableA = createTrackedText("stable-a");
      const stableB = createTrackedText("stable-b");
      const dynamics: Array<ReturnType<typeof createTrackedText>> = [];

      for (let i = 0; i < 8; i++) {
        const dynamic = createTrackedText(`dyn-${String(i)}`);
        dynamics.push(dynamic);
        mustLayout(
          row([stableA.vnode, stableB.vnode, dynamic.vnode], { width: 60 }),
          60,
          8,
          "column",
          cache,
        );
      }

      assert.ok(stableA.reads() > 0);
      assert.ok(stableB.reads() > 0);
      for (const dynamic of dynamics) {
        assert.ok(dynamic.reads() > 0);
      }
    });
  });

  describe("cache consistency", () => {
    function assertCachedAndUncachedEqual(
      node: VNode,
      maxW: number,
      maxH: number,
      axis: Axis = "column",
    ): void {
      const cache = new WeakMap<VNode, unknown>();
      const warm = layout(node, 0, 0, maxW, maxH, axis, cache);
      if (!warm.ok) {
        assert.fail(`warm layout failed: ${warm.fatal.code}: ${warm.fatal.detail}`);
      }

      const cached = layout(node, 0, 0, maxW, maxH, axis, cache);
      const uncached = layout(node, 0, 0, maxW, maxH, axis);
      if (!cached.ok || !uncached.ok) {
        assert.fail("cached/uncached layout should both succeed");
      }
      assert.deepEqual(cached.value, uncached.value);
    }

    test("cached and uncached layout match for text + flex + box trees", () => {
      const tree = box(
        [
          row(
            [
              createTrackedText("left", { flex: 1 }).vnode,
              createTrackedText("right", { flex: 2 }).vnode,
            ],
            { width: 40 },
          ),
          column([createTrackedText("footer").vnode]),
        ],
        { width: 40, height: 8 },
      );
      assertCachedAndUncachedEqual(tree, 40, 8);
    });

    test("cached and uncached layout match for grids and overlays", () => {
      const tree = focusZone([
        grid(
          [
            createTrackedText("g1").vnode,
            createTrackedText("g2").vnode,
            createTrackedText("g3").vnode,
          ],
          { columns: 2, columnGap: 1, rowGap: 1 },
        ),
      ]);
      assertCachedAndUncachedEqual(tree, 50, 12);
    });

    test("cached and uncached layout match for deeply nested trees", () => {
      let current: VNode = createTrackedText("leaf").vnode;
      for (let i = 0; i < 12; i++) {
        current = box([current], { border: "none" });
      }
      assertCachedAndUncachedEqual(current, 80, 20);
    });
  });
});
