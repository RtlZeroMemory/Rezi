import { assert, describe, test } from "@rezi-ui/testkit";
import type { VNode } from "../../index.js";
import { createInstanceIdAllocator } from "../instance.js";
import { reconcileChildren } from "../reconcile.js";

function textNode(label: string, key?: string): VNode {
  return {
    kind: "text",
    text: label,
    props: key === undefined ? {} : { key },
  };
}

function spacerNode(key?: string): VNode {
  return {
    kind: "spacer",
    props: key === undefined ? {} : { key },
  };
}

function boxNode(children: readonly VNode[], key?: string): VNode {
  return {
    kind: "box",
    props: key === undefined ? {} : { key },
    children,
  };
}

function rowNode(children: readonly VNode[], key?: string): VNode {
  return {
    kind: "row",
    props: key === undefined ? {} : { key },
    children,
  };
}

function dividerNode(key?: string): VNode {
  return {
    kind: "divider",
    props: key === undefined ? {} : { key },
  } as unknown as VNode;
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

function expectOk(
  res: ReturnType<typeof reconcileChildren>,
): Extract<ReturnType<typeof reconcileChildren>, { ok: true }>["value"] {
  if (!res.ok) {
    assert.fail(`expected ok reconcile result, got ${res.fatal.code}: ${res.fatal.detail}`);
    throw new Error("unreachable");
  }
  return res.value;
}

describe("reconcileChildren - keyed reconciliation", () => {
  test("reorders keyed children while preserving instances", () => {
    const allocator = createInstanceIdAllocator(1);
    const prevChildren = makePrevChildren(allocator, [
      textNode("A0", "a"),
      textNode("B0", "b"),
      textNode("C0", "c"),
    ]);

    const res = expectOk(
      reconcileChildren(
        11,
        prevChildren,
        [textNode("C1", "c"), textNode("A1", "a"), textNode("B1", "b")],
        allocator,
      ),
    );

    assert.deepEqual(
      res.nextChildren.map((child) => child.instanceId),
      [3, 1, 2],
    );
    assert.deepEqual(res.reusedInstanceIds, [3, 1, 2]);
    assert.deepEqual(res.newInstanceIds, []);
    assert.deepEqual(res.unmountedInstanceIds, []);
    assert.deepEqual(
      res.nextChildren.map((child) => child.prevIndex),
      [2, 0, 1],
    );
  });

  test("reorders keyed children in reverse order", () => {
    const allocator = createInstanceIdAllocator(1);
    const prevChildren = makePrevChildren(allocator, [
      textNode("A0", "a"),
      textNode("B0", "b"),
      textNode("C0", "c"),
      textNode("D0", "d"),
    ]);

    const res = expectOk(
      reconcileChildren(
        12,
        prevChildren,
        [textNode("D1", "d"), textNode("C1", "c"), textNode("B1", "b"), textNode("A1", "a")],
        allocator,
      ),
    );

    assert.deepEqual(res.reusedInstanceIds, [4, 3, 2, 1]);
    assert.deepEqual(res.newInstanceIds, []);
    assert.deepEqual(res.unmountedInstanceIds, []);
  });

  test("non-text keyed kinds (divider) participate in keyed reorder", () => {
    const allocator = createInstanceIdAllocator(1);
    const prevChildren = makePrevChildren(allocator, [dividerNode("left"), dividerNode("right")]);

    const res = expectOk(
      reconcileChildren(12_1, prevChildren, [dividerNode("right"), dividerNode("left")], allocator),
    );

    assert.deepEqual(
      res.nextChildren.map((child) => child.instanceId),
      [2, 1],
    );
    assert.deepEqual(res.reusedInstanceIds, [2, 1]);
    assert.deepEqual(res.newInstanceIds, []);
    assert.deepEqual(res.unmountedInstanceIds, []);
  });

  test("inserts keyed child in middle", () => {
    const allocator = createInstanceIdAllocator(1);
    const prevChildren = makePrevChildren(allocator, [textNode("A0", "a"), textNode("C0", "c")]);

    const res = expectOk(
      reconcileChildren(
        13,
        prevChildren,
        [textNode("A1", "a"), textNode("B1", "b"), textNode("C1", "c")],
        allocator,
      ),
    );

    assert.deepEqual(res.reusedInstanceIds, [1, 2]);
    assert.deepEqual(res.newInstanceIds, [3]);
    assert.deepEqual(res.unmountedInstanceIds, []);
    assert.deepEqual(
      res.nextChildren.map((child) => child.slotId),
      ["k:a", "k:b", "k:c"],
    );
  });

  test("inserts keyed child at front", () => {
    const allocator = createInstanceIdAllocator(1);
    const prevChildren = makePrevChildren(allocator, [textNode("B0", "b"), textNode("C0", "c")]);

    const res = expectOk(
      reconcileChildren(
        14,
        prevChildren,
        [textNode("A1", "a"), textNode("B1", "b"), textNode("C1", "c")],
        allocator,
      ),
    );

    assert.deepEqual(
      res.nextChildren.map((child) => child.instanceId),
      [3, 1, 2],
    );
    assert.deepEqual(res.newInstanceIds, [3]);
    assert.deepEqual(res.unmountedInstanceIds, []);
  });

  test("inserts keyed child at end", () => {
    const allocator = createInstanceIdAllocator(1);
    const prevChildren = makePrevChildren(allocator, [textNode("A0", "a"), textNode("B0", "b")]);

    const res = expectOk(
      reconcileChildren(
        15,
        prevChildren,
        [textNode("A1", "a"), textNode("B1", "b"), textNode("C1", "c")],
        allocator,
      ),
    );

    assert.deepEqual(res.reusedInstanceIds, [1, 2]);
    assert.deepEqual(res.newInstanceIds, [3]);
    assert.deepEqual(res.unmountedInstanceIds, []);
  });

  test("removes keyed child from middle", () => {
    const allocator = createInstanceIdAllocator(1);
    const prevChildren = makePrevChildren(allocator, [
      textNode("A0", "a"),
      textNode("B0", "b"),
      textNode("C0", "c"),
    ]);

    const res = expectOk(
      reconcileChildren(16, prevChildren, [textNode("A1", "a"), textNode("C1", "c")], allocator),
    );

    assert.deepEqual(res.reusedInstanceIds, [1, 3]);
    assert.deepEqual(res.newInstanceIds, []);
    assert.deepEqual(res.unmountedInstanceIds, [2]);
  });

  test("removes keyed child from front", () => {
    const allocator = createInstanceIdAllocator(1);
    const prevChildren = makePrevChildren(allocator, [
      textNode("A0", "a"),
      textNode("B0", "b"),
      textNode("C0", "c"),
    ]);

    const res = expectOk(
      reconcileChildren(17, prevChildren, [textNode("B1", "b"), textNode("C1", "c")], allocator),
    );

    assert.deepEqual(res.reusedInstanceIds, [2, 3]);
    assert.deepEqual(res.newInstanceIds, []);
    assert.deepEqual(res.unmountedInstanceIds, [1]);
  });

  test("removes keyed child from end", () => {
    const allocator = createInstanceIdAllocator(1);
    const prevChildren = makePrevChildren(allocator, [
      textNode("A0", "a"),
      textNode("B0", "b"),
      textNode("C0", "c"),
    ]);

    const res = expectOk(
      reconcileChildren(18, prevChildren, [textNode("A1", "a"), textNode("B1", "b")], allocator),
    );

    assert.deepEqual(res.reusedInstanceIds, [1, 2]);
    assert.deepEqual(res.newInstanceIds, []);
    assert.deepEqual(res.unmountedInstanceIds, [3]);
  });

  test("same key with different leaf kind remounts", () => {
    const allocator = createInstanceIdAllocator(1);
    const prevChildren = makePrevChildren(allocator, [textNode("leaf", "x")]);

    const res = expectOk(reconcileChildren(19, prevChildren, [spacerNode("x")], allocator));

    assert.deepEqual(res.reusedInstanceIds, []);
    assert.deepEqual(res.newInstanceIds, [2]);
    assert.deepEqual(res.unmountedInstanceIds, [1]);
    assert.equal(res.nextChildren[0]?.kind, "new");
  });

  test("same key with different container kind remounts", () => {
    const allocator = createInstanceIdAllocator(1);
    const prevChildren = makePrevChildren(allocator, [boxNode([textNode("x")], "swap")]);

    const res = expectOk(
      reconcileChildren(20, prevChildren, [rowNode([textNode("x")], "swap")], allocator),
    );

    assert.deepEqual(res.reusedInstanceIds, []);
    assert.deepEqual(res.newInstanceIds, [2]);
    assert.deepEqual(res.unmountedInstanceIds, [1]);
  });

  test("duplicate keyed children in next list is fatal", () => {
    const allocator = createInstanceIdAllocator(1);

    const res = reconcileChildren(42, [], [textNode("x", "dup"), spacerNode("dup")], allocator);
    assert.equal(res.ok, false);
    if (res.ok) return;

    assert.equal(res.fatal.code, "ZRUI_DUPLICATE_KEY");
    assert.equal(
      res.fatal.detail,
      'duplicate sibling key "dup" under parent instanceId=42 (child indices 0 and 1)',
    );
  });

  test("duplicate keyed children in prev list is fatal", () => {
    const allocator = createInstanceIdAllocator(1);
    const prevChildren = makePrevChildren(allocator, [textNode("x", "dup"), spacerNode("dup")]);

    const res = reconcileChildren(43, prevChildren, [textNode("x2", "dup")], allocator);
    assert.equal(res.ok, false);
    if (res.ok) return;

    assert.equal(res.fatal.code, "ZRUI_DUPLICATE_KEY");
    assert.equal(
      res.fatal.detail,
      'duplicate sibling key "dup" under parent instanceId=43 (child indices 0 and 1)',
    );
  });

  test("large keyed reorder with 25 children reuses all instances", () => {
    const allocator = createInstanceIdAllocator(1);
    const prevVChildren = Array.from({ length: 25 }, (_, index) =>
      textNode(`prev-${String(index)}`, `k${String(index)}`),
    );
    const prevChildren = makePrevChildren(allocator, prevVChildren);
    const order = [
      24, 0, 12, 5, 19, 1, 23, 8, 4, 13, 2, 22, 10, 7, 21, 3, 20, 6, 18, 9, 17, 11, 16, 14, 15,
    ];
    const nextChildren = order.map((index) =>
      textNode(`next-${String(index)}`, `k${String(index)}`),
    );

    const res = expectOk(reconcileChildren(44, prevChildren, nextChildren, allocator));

    assert.deepEqual(
      res.nextChildren.map((child) => child.instanceId),
      order.map((index) => index + 1),
    );
    assert.deepEqual(
      res.reusedInstanceIds,
      order.map((index) => index + 1),
    );
    assert.deepEqual(res.newInstanceIds, []);
    assert.deepEqual(res.unmountedInstanceIds, []);
  });

  test("keyed update with same keys keeps instances despite text changes", () => {
    const allocator = createInstanceIdAllocator(1);
    const prevChildren = makePrevChildren(allocator, [
      textNode("old-a", "a"),
      textNode("old-b", "b"),
    ]);

    const res = expectOk(
      reconcileChildren(
        45,
        prevChildren,
        [textNode("new-a", "a"), textNode("new-b", "b")],
        allocator,
      ),
    );

    assert.deepEqual(res.reusedInstanceIds, [1, 2]);
    assert.deepEqual(res.newInstanceIds, []);
    assert.deepEqual(res.unmountedInstanceIds, []);
  });

  test("keyed drop-all unmounts every previous instance", () => {
    const allocator = createInstanceIdAllocator(1);
    const prevChildren = makePrevChildren(allocator, [
      textNode("A0", "a"),
      textNode("B0", "b"),
      textNode("C0", "c"),
    ]);

    const res = expectOk(reconcileChildren(46, prevChildren, [], allocator));

    assert.deepEqual(res.reusedInstanceIds, []);
    assert.deepEqual(res.newInstanceIds, []);
    assert.deepEqual(res.unmountedInstanceIds, [1, 2, 3]);
  });

  test("keyed add-all from empty mounts every next child", () => {
    const allocator = createInstanceIdAllocator(1);

    const res = expectOk(
      reconcileChildren(
        47,
        [],
        [textNode("A", "a"), textNode("B", "b"), textNode("C", "c")],
        allocator,
      ),
    );

    assert.deepEqual(res.reusedInstanceIds, []);
    assert.deepEqual(res.newInstanceIds, [1, 2, 3]);
    assert.deepEqual(res.unmountedInstanceIds, []);
  });

  test("keyed remove one and insert one in same pass", () => {
    const allocator = createInstanceIdAllocator(1);
    const prevChildren = makePrevChildren(allocator, [
      textNode("A0", "a"),
      textNode("B0", "b"),
      textNode("C0", "c"),
    ]);

    const res = expectOk(
      reconcileChildren(
        48,
        prevChildren,
        [textNode("B1", "b"), textNode("D1", "d"), textNode("C1", "c")],
        allocator,
      ),
    );

    assert.deepEqual(res.reusedInstanceIds, [2, 3]);
    assert.deepEqual(res.newInstanceIds, [4]);
    assert.deepEqual(res.unmountedInstanceIds, [1]);
  });

  test("keyed mode can unmount keyed previous child when next slot is undefined", () => {
    const allocator = createInstanceIdAllocator(1);
    const prevChildren = makePrevChildren(allocator, [textNode("A0", "a"), textNode("B0", "b")]);
    const nextChildren = [textNode("A1", "a"), undefined] as unknown as readonly VNode[];

    const res = expectOk(reconcileChildren(49, prevChildren, nextChildren, allocator));

    assert.deepEqual(res.reusedInstanceIds, [1]);
    assert.deepEqual(res.newInstanceIds, []);
    assert.deepEqual(res.unmountedInstanceIds, [2]);
  });

  test("keyed matching reports stable prevIndex values after reorder", () => {
    const allocator = createInstanceIdAllocator(1);
    const prevChildren = makePrevChildren(allocator, [
      textNode("A0", "a"),
      textNode("B0", "b"),
      textNode("C0", "c"),
      textNode("D0", "d"),
    ]);

    const res = expectOk(
      reconcileChildren(
        50,
        prevChildren,
        [textNode("B1", "b"), textNode("D1", "d"), textNode("A1", "a"), textNode("C1", "c")],
        allocator,
      ),
    );

    assert.deepEqual(
      res.nextChildren.map((child) => child.prevIndex),
      [1, 3, 0, 2],
    );
    assert.deepEqual(res.reusedInstanceIds, [2, 4, 1, 3]);
  });

  test("keyed reconciliation keeps non-keyed siblings indexed by slot", () => {
    const allocator = createInstanceIdAllocator(1);
    const prevChildren = makePrevChildren(allocator, [
      textNode("plain-0"),
      textNode("keyed", "k"),
      textNode("plain-2"),
    ]);

    const res = expectOk(
      reconcileChildren(
        51,
        prevChildren,
        [textNode("plain-0-next"), textNode("keyed-next", "k"), textNode("plain-2-next")],
        allocator,
      ),
    );

    assert.deepEqual(
      res.nextChildren.map((child) => child.slotId),
      ["i:0", "k:k", "i:2"],
    );
    assert.deepEqual(res.reusedInstanceIds, [1, 2, 3]);
  });

  test("keyed kind mismatch does not leak reuse for same key", () => {
    const allocator = createInstanceIdAllocator(1);
    const prevChildren = makePrevChildren(allocator, [textNode("old", "a"), textNode("keep", "b")]);

    const res = expectOk(
      reconcileChildren(52, prevChildren, [spacerNode("a"), textNode("keep-next", "b")], allocator),
    );

    assert.deepEqual(res.reusedInstanceIds, [2]);
    assert.deepEqual(res.newInstanceIds, [3]);
    assert.deepEqual(res.unmountedInstanceIds, [1]);
    assert.deepEqual(
      res.nextChildren.map((child) => child.kind),
      ["new", "reused"],
    );
  });

  test("keyed replacement with same slot preserves deterministic ordering of lifecycle arrays", () => {
    const allocator = createInstanceIdAllocator(1);
    const prevChildren = makePrevChildren(allocator, [
      textNode("A0", "a"),
      textNode("B0", "b"),
      textNode("C0", "c"),
    ]);

    const res = expectOk(
      reconcileChildren(
        53,
        prevChildren,
        [textNode("A1", "a"), spacerNode("b"), textNode("C1", "c")],
        allocator,
      ),
    );

    assert.deepEqual(res.reusedInstanceIds, [1, 3]);
    assert.deepEqual(res.newInstanceIds, [4]);
    assert.deepEqual(res.unmountedInstanceIds, [2]);
  });
});
