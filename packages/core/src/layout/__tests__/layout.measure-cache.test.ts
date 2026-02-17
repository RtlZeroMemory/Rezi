import { assert, describe, test } from "@rezi-ui/testkit";
import type { VNode } from "../../index.js";
import { layout } from "../layout.js";

function mustLayout(
  node: VNode,
  maxW: number,
  maxH: number,
  axis: "row" | "column" = "column",
  measureCache?: WeakMap<VNode, unknown>,
): void {
  const result = layout(node, 0, 0, maxW, maxH, axis, measureCache);
  if (!result.ok) {
    assert.fail(`layout failed: ${result.fatal.code}: ${result.fatal.detail}`);
  }
}

function createCountingTextVNode(
  value: string,
  props: Record<string, unknown> = {},
): Readonly<{
  vnode: VNode;
  reads: () => number;
}> {
  let readCount = 0;
  const node = { kind: "text", props } as {
    kind: "text";
    props: Record<string, unknown>;
    text?: string;
  };
  Object.defineProperty(node, "text", {
    configurable: true,
    enumerable: true,
    get: () => {
      readCount++;
      return value;
    },
  });
  return Object.freeze({
    vnode: node as unknown as VNode,
    reads: () => readCount,
  });
}

function rowWithChildren(children: readonly VNode[]): VNode {
  return {
    kind: "row",
    props: {},
    children: Object.freeze([...children]),
  } as unknown as VNode;
}

describe("layout measure cache", () => {
  test("shared cache hits for same vnode and constraints", () => {
    const cache = new WeakMap<VNode, unknown>();
    const tracked = createCountingTextVNode("cache-hit");

    mustLayout(tracked.vnode, 40, 5, "column", cache);
    const firstReads = tracked.reads();
    assert.ok(firstReads > 0);

    mustLayout(tracked.vnode, 40, 5, "column", cache);
    assert.equal(tracked.reads(), firstReads);
  });

  test("different maxW causes cache miss", () => {
    const cache = new WeakMap<VNode, unknown>();
    const tracked = createCountingTextVNode("width-miss");

    mustLayout(tracked.vnode, 40, 5, "column", cache);
    const readsAfterFirst = tracked.reads();

    mustLayout(tracked.vnode, 39, 5, "column", cache);
    assert.ok(tracked.reads() > readsAfterFirst);
  });

  test("different maxH causes cache miss", () => {
    const cache = new WeakMap<VNode, unknown>();
    const tracked = createCountingTextVNode("height-miss");

    mustLayout(tracked.vnode, 40, 5, "column", cache);
    const readsAfterFirst = tracked.reads();

    mustLayout(tracked.vnode, 40, 4, "column", cache);
    assert.ok(tracked.reads() > readsAfterFirst);
  });

  test("axis change causes cache miss (row vs column)", () => {
    const cache = new WeakMap<VNode, unknown>();
    const tracked = createCountingTextVNode("axis-miss");

    mustLayout(tracked.vnode, 40, 5, "column", cache);
    const readsAfterFirst = tracked.reads();

    mustLayout(tracked.vnode, 40, 5, "row", cache);
    assert.ok(tracked.reads() > readsAfterFirst);
  });

  test("separate WeakMap instances do not share hits", () => {
    const cacheA = new WeakMap<VNode, unknown>();
    const cacheB = new WeakMap<VNode, unknown>();
    const tracked = createCountingTextVNode("separate-caches");

    mustLayout(tracked.vnode, 40, 5, "column", cacheA);
    const readsAfterA = tracked.reads();

    mustLayout(tracked.vnode, 40, 5, "column", cacheB);
    assert.ok(tracked.reads() > readsAfterA);
  });

  test("shared cache still hits after using a different cache", () => {
    const cacheA = new WeakMap<VNode, unknown>();
    const cacheB = new WeakMap<VNode, unknown>();
    const tracked = createCountingTextVNode("return-to-cache-a");

    mustLayout(tracked.vnode, 40, 5, "column", cacheA);
    const readsAfterA = tracked.reads();

    mustLayout(tracked.vnode, 40, 5, "column", cacheB);
    const readsAfterB = tracked.reads();
    assert.ok(readsAfterB > readsAfterA);

    mustLayout(tracked.vnode, 40, 5, "column", cacheA);
    assert.equal(tracked.reads(), readsAfterB);
  });

  test("structurally equal but distinct vnode identity misses", () => {
    const cache = new WeakMap<VNode, unknown>();
    const a = createCountingTextVNode("same-shape");
    const b = createCountingTextVNode("same-shape");

    mustLayout(a.vnode, 40, 5, "column", cache);
    assert.ok(a.reads() > 0);
    assert.equal(b.reads(), 0);

    mustLayout(b.vnode, 40, 5, "column", cache);
    assert.ok(b.reads() > 0);
  });

  test("shared cache keeps independent entries per vnode identity", () => {
    const cache = new WeakMap<VNode, unknown>();
    const a = createCountingTextVNode("A");
    const b = createCountingTextVNode("B");

    mustLayout(a.vnode, 30, 4, "column", cache);
    mustLayout(b.vnode, 30, 4, "column", cache);

    assert.ok(cache.get(a.vnode) !== undefined);
    assert.ok(cache.get(b.vnode) !== undefined);
  });

  test("without shared cache, repeated layout remeasures", () => {
    const tracked = createCountingTextVNode("no-shared-cache");

    mustLayout(tracked.vnode, 40, 5);
    const readsAfterFirst = tracked.reads();

    mustLayout(tracked.vnode, 40, 5);
    assert.ok(tracked.reads() > readsAfterFirst);
  });

  test("nested child measurements hit cache across repeated root layouts", () => {
    const cache = new WeakMap<VNode, unknown>();
    const child = createCountingTextVNode("child");
    const root = rowWithChildren([child.vnode]);

    mustLayout(root, 40, 5, "column", cache);
    const readsAfterFirst = child.reads();
    assert.ok(readsAfterFirst > 0);

    mustLayout(root, 40, 5, "column", cache);
    assert.equal(child.reads(), readsAfterFirst);
  });

  test("nested child remeasures when parent constraints change", () => {
    const cache = new WeakMap<VNode, unknown>();
    const child = createCountingTextVNode("child");
    const root = rowWithChildren([child.vnode]);

    mustLayout(root, 40, 5, "column", cache);
    const readsAfterFirst = child.reads();

    mustLayout(root, 39, 5, "column", cache);
    assert.ok(child.reads() > readsAfterFirst);
  });
});
