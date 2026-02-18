import { assert, describe, test } from "@rezi-ui/testkit";
import type { VNode } from "../../index.js";
import { createInstanceIdAllocator } from "../instance.js";
import { reconcileChildren } from "../reconcile.js";

function textNode(label: string): VNode {
  return {
    kind: "text",
    text: label,
    props: {},
  };
}

function spacerNode(): VNode {
  return {
    kind: "spacer",
    props: {},
  };
}

function boxNode(children: readonly VNode[]): VNode {
  return {
    kind: "box",
    props: {},
    children,
  };
}

function rowNode(children: readonly VNode[]): VNode {
  return {
    kind: "row",
    props: {},
    children,
  };
}

function makePrevChildren(
  allocator: ReturnType<typeof createInstanceIdAllocator>,
  vnodes: readonly VNode[],
) {
  return vnodes.map((vnode) => ({
    instanceId: allocator.allocate(),
    vnode,
  }));
}

function expectOk(res: ReturnType<typeof reconcileChildren>) {
  if (!res.ok) {
    assert.fail(`expected ok reconcile result, got ${res.fatal.code}: ${res.fatal.detail}`);
    throw new Error("unreachable");
  }
  return res.value;
}

describe("reconcileChildren - unkeyed reconciliation", () => {
  test("shrink 5 -> 3 unmounts trailing two", () => {
    const allocator = createInstanceIdAllocator(1);
    const prevChildren = makePrevChildren(allocator, [
      textNode("0"),
      textNode("1"),
      textNode("2"),
      textNode("3"),
      textNode("4"),
    ]);

    const res = expectOk(
      reconcileChildren(61, prevChildren, [textNode("a"), textNode("b"), textNode("c")], allocator),
    );

    assert.deepEqual(res.reusedInstanceIds, [1, 2, 3]);
    assert.deepEqual(res.newInstanceIds, []);
    assert.deepEqual(res.unmountedInstanceIds, [4, 5]);
  });

  test("shrink 3 -> 0 unmounts all previous children", () => {
    const allocator = createInstanceIdAllocator(1);
    const prevChildren = makePrevChildren(allocator, [textNode("0"), textNode("1"), textNode("2")]);

    const res = expectOk(reconcileChildren(62, prevChildren, [], allocator));

    assert.deepEqual(res.reusedInstanceIds, []);
    assert.deepEqual(res.newInstanceIds, []);
    assert.deepEqual(res.unmountedInstanceIds, [1, 2, 3]);
  });

  test("grow 3 -> 5 reuses first three and allocates two", () => {
    const allocator = createInstanceIdAllocator(1);
    const prevChildren = makePrevChildren(allocator, [textNode("0"), textNode("1"), textNode("2")]);

    const res = expectOk(
      reconcileChildren(
        63,
        prevChildren,
        [textNode("n0"), textNode("n1"), textNode("n2"), textNode("n3"), textNode("n4")],
        allocator,
      ),
    );

    assert.deepEqual(res.reusedInstanceIds, [1, 2, 3]);
    assert.deepEqual(res.newInstanceIds, [4, 5]);
    assert.deepEqual(res.unmountedInstanceIds, []);
  });

  test("grow 0 -> 4 allocates all new children", () => {
    const allocator = createInstanceIdAllocator(1);

    const res = expectOk(
      reconcileChildren(
        64,
        [],
        [textNode("0"), textNode("1"), textNode("2"), textNode("3")],
        allocator,
      ),
    );

    assert.deepEqual(res.reusedInstanceIds, []);
    assert.deepEqual(res.newInstanceIds, [1, 2, 3, 4]);
    assert.deepEqual(res.unmountedInstanceIds, []);
  });

  test("same count + same kinds reuses all", () => {
    const allocator = createInstanceIdAllocator(1);
    const prevChildren = makePrevChildren(allocator, [
      textNode("a"),
      spacerNode(),
      boxNode([textNode("leaf")]),
    ]);

    const res = expectOk(
      reconcileChildren(
        65,
        prevChildren,
        [textNode("b"), spacerNode(), boxNode([textNode("leaf-2")])],
        allocator,
      ),
    );

    assert.deepEqual(res.reusedInstanceIds, [1, 2, 3]);
    assert.deepEqual(res.newInstanceIds, []);
    assert.deepEqual(res.unmountedInstanceIds, []);
    assert.deepEqual(
      res.nextChildren.map((child) => child.kind),
      ["reused", "reused", "reused"],
    );
  });

  test("same count + all kinds changed remounts all", () => {
    const allocator = createInstanceIdAllocator(1);
    const prevChildren = makePrevChildren(allocator, [textNode("a"), spacerNode(), boxNode([])]);

    const res = expectOk(
      reconcileChildren(66, prevChildren, [spacerNode(), textNode("b"), rowNode([])], allocator),
    );

    assert.deepEqual(res.reusedInstanceIds, []);
    assert.deepEqual(res.newInstanceIds, [4, 5, 6]);
    assert.deepEqual(res.unmountedInstanceIds, [1, 2, 3]);
  });

  test("same count + mixed kind changes remounts only changed indices", () => {
    const allocator = createInstanceIdAllocator(1);
    const prevChildren = makePrevChildren(allocator, [
      textNode("a"),
      spacerNode(),
      boxNode([]),
      textNode("d"),
    ]);

    const res = expectOk(
      reconcileChildren(
        67,
        prevChildren,
        [textNode("x"), textNode("y"), boxNode([textNode("z")]), rowNode([])],
        allocator,
      ),
    );

    assert.deepEqual(res.reusedInstanceIds, [1, 3]);
    assert.deepEqual(res.newInstanceIds, [5, 6]);
    assert.deepEqual(res.unmountedInstanceIds, [2, 4]);
  });

  test("slot ids remain positional i:index", () => {
    const allocator = createInstanceIdAllocator(1);
    const prevChildren = makePrevChildren(allocator, [textNode("a"), textNode("b")]);

    const res = expectOk(
      reconcileChildren(68, prevChildren, [textNode("x"), textNode("y"), textNode("z")], allocator),
    );

    assert.deepEqual(
      res.nextChildren.map((child) => child.slotId),
      ["i:0", "i:1", "i:2"],
    );
  });

  test("undefined tail child unmounts matching previous slot", () => {
    const allocator = createInstanceIdAllocator(1);
    const prevChildren = makePrevChildren(allocator, [textNode("a"), textNode("b")]);
    const nextChildren = [textNode("x"), undefined] as unknown as readonly VNode[];

    const res = expectOk(reconcileChildren(69, prevChildren, nextChildren, allocator));

    assert.deepEqual(res.reusedInstanceIds, [1]);
    assert.deepEqual(res.newInstanceIds, []);
    assert.deepEqual(res.unmountedInstanceIds, [2]);
  });

  test("undefined middle child unmounts only middle slot", () => {
    const allocator = createInstanceIdAllocator(1);
    const prevChildren = makePrevChildren(allocator, [textNode("a"), textNode("b"), textNode("c")]);
    const nextChildren = [textNode("x"), undefined, textNode("z")] as unknown as readonly VNode[];

    const res = expectOk(reconcileChildren(70, prevChildren, nextChildren, allocator));

    assert.deepEqual(res.reusedInstanceIds, [1, 3]);
    assert.deepEqual(res.newInstanceIds, []);
    assert.deepEqual(res.unmountedInstanceIds, [2]);
  });

  test("undefined head child unmounts first slot", () => {
    const allocator = createInstanceIdAllocator(1);
    const prevChildren = makePrevChildren(allocator, [textNode("a"), textNode("b"), textNode("c")]);
    const nextChildren = [undefined, textNode("y"), textNode("z")] as unknown as readonly VNode[];

    const res = expectOk(reconcileChildren(71, prevChildren, nextChildren, allocator));

    assert.deepEqual(res.reusedInstanceIds, [2, 3]);
    assert.deepEqual(res.newInstanceIds, []);
    assert.deepEqual(res.unmountedInstanceIds, [1]);
  });

  test("two undefined entries can unmount two positions without touching reused slot", () => {
    const allocator = createInstanceIdAllocator(1);
    const prevChildren = makePrevChildren(allocator, [textNode("a"), textNode("b"), textNode("c")]);
    const nextChildren = [undefined, textNode("y"), undefined] as unknown as readonly VNode[];

    const res = expectOk(reconcileChildren(72, prevChildren, nextChildren, allocator));

    assert.deepEqual(res.reusedInstanceIds, [2]);
    assert.deepEqual(res.newInstanceIds, []);
    assert.deepEqual(res.unmountedInstanceIds, [1, 3]);
  });

  test("position-based identity does not follow content reorder", () => {
    const allocator = createInstanceIdAllocator(1);
    const prevChildren = makePrevChildren(allocator, [textNode("A"), textNode("B"), textNode("C")]);

    const res = expectOk(
      reconcileChildren(73, prevChildren, [textNode("C"), textNode("A"), textNode("B")], allocator),
    );

    assert.deepEqual(res.reusedInstanceIds, [1, 2, 3]);
    assert.deepEqual(
      res.nextChildren.map((child) => child.instanceId),
      [1, 2, 3],
    );
  });

  test("unkeyed leaf prop changes still reuse by kind and position", () => {
    const allocator = createInstanceIdAllocator(1);
    const prevChildren = makePrevChildren(allocator, [textNode("left"), textNode("right")]);

    const res = expectOk(
      reconcileChildren(74, prevChildren, [textNode("left-new"), textNode("right-new")], allocator),
    );

    assert.deepEqual(res.reusedInstanceIds, [1, 2]);
    assert.deepEqual(res.newInstanceIds, []);
    assert.deepEqual(res.unmountedInstanceIds, []);
  });

  test("container kind mismatch at same index remounts", () => {
    const allocator = createInstanceIdAllocator(1);
    const prevChildren = makePrevChildren(allocator, [
      boxNode([textNode("x")]),
      rowNode([textNode("y")]),
    ]);

    const res = expectOk(
      reconcileChildren(
        75,
        prevChildren,
        [rowNode([textNode("x")]), boxNode([textNode("y")])],
        allocator,
      ),
    );

    assert.deepEqual(res.reusedInstanceIds, []);
    assert.deepEqual(res.newInstanceIds, [3, 4]);
    assert.deepEqual(res.unmountedInstanceIds, [1, 2]);
  });

  test("unkeyed shrink with kind mismatch also tracks both unmount paths", () => {
    const allocator = createInstanceIdAllocator(1);
    const prevChildren = makePrevChildren(allocator, [textNode("a"), spacerNode(), textNode("c")]);

    const res = expectOk(
      reconcileChildren(76, prevChildren, [spacerNode(), textNode("b")], allocator),
    );

    assert.deepEqual(res.reusedInstanceIds, []);
    assert.deepEqual(res.newInstanceIds, [4, 5]);
    assert.deepEqual(res.unmountedInstanceIds, [1, 2, 3]);
  });

  test("unkeyed grow from sparse next list allocates only concrete vnodes", () => {
    const allocator = createInstanceIdAllocator(1);
    const prevChildren = makePrevChildren(allocator, [textNode("a")]);
    const nextChildren = [
      textNode("x"),
      undefined,
      textNode("z"),
      undefined,
      textNode("w"),
    ] as unknown as readonly VNode[];

    const res = expectOk(reconcileChildren(77, prevChildren, nextChildren, allocator));

    assert.deepEqual(res.reusedInstanceIds, [1]);
    assert.deepEqual(res.newInstanceIds, [2, 3]);
    assert.deepEqual(res.unmountedInstanceIds, []);
    assert.deepEqual(
      res.nextChildren.map((child) => child.slotId),
      ["i:0", "i:2", "i:4"],
    );
  });
});
