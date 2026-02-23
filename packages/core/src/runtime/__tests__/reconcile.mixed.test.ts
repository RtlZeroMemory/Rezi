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

describe("reconcileChildren - mixed keyed and unkeyed", () => {
  test("keyed reorder can remount displaced unkeyed slot", () => {
    const allocator = createInstanceIdAllocator(1);
    const prevChildren = makePrevChildren(allocator, [
      textNode("A", "a"),
      textNode("plain-1"),
      textNode("B", "b"),
    ]);

    const res = expectOk(
      reconcileChildren(
        81,
        prevChildren,
        [textNode("plain-0"), textNode("B2", "b"), textNode("A2", "a")],
        allocator,
      ),
    );

    assert.deepEqual(res.reusedInstanceIds, [3, 1]);
    assert.deepEqual(res.newInstanceIds, [4]);
    assert.deepEqual(res.unmountedInstanceIds, [2]);
  });

  test("mixed insert adds keyed and unkeyed while preserving matched slots", () => {
    const allocator = createInstanceIdAllocator(1);
    const prevChildren = makePrevChildren(allocator, [
      textNode("plain-0"),
      textNode("A", "a"),
      textNode("plain-2"),
    ]);

    const res = expectOk(
      reconcileChildren(
        82,
        prevChildren,
        [
          textNode("plain-0-next"),
          textNode("B", "b"),
          textNode("A-next", "a"),
          textNode("plain-3"),
        ],
        allocator,
      ),
    );

    assert.deepEqual(res.reusedInstanceIds, [1, 2]);
    assert.deepEqual(res.newInstanceIds, [4, 5]);
    assert.deepEqual(res.unmountedInstanceIds, [3]);
  });

  test("removing a key while leaving unkeyed siblings keeps positional unkeyed reuse", () => {
    const allocator = createInstanceIdAllocator(1);
    const prevChildren = makePrevChildren(allocator, [
      textNode("A", "a"),
      textNode("plain-1"),
      textNode("plain-2"),
    ]);

    const res = expectOk(
      reconcileChildren(
        83,
        prevChildren,
        [textNode("plain-0"), textNode("plain-1"), textNode("plain-2")],
        allocator,
      ),
    );

    assert.deepEqual(res.reusedInstanceIds, [2, 3]);
    assert.deepEqual(res.newInstanceIds, [4]);
    assert.deepEqual(res.unmountedInstanceIds, [1]);
  });

  test("adding a key where slot was unkeyed remounts keyed slot", () => {
    const allocator = createInstanceIdAllocator(1);
    const prevChildren = makePrevChildren(allocator, [textNode("plain-0"), textNode("plain-1")]);

    const res = expectOk(
      reconcileChildren(
        84,
        prevChildren,
        [textNode("A", "a"), textNode("plain-1-next")],
        allocator,
      ),
    );

    assert.deepEqual(res.reusedInstanceIds, [2]);
    assert.deepEqual(res.newInstanceIds, [3]);
    assert.deepEqual(res.unmountedInstanceIds, [1]);
  });

  test("duplicate key fatal still triggers in mixed lists", () => {
    const allocator = createInstanceIdAllocator(1);

    const res = reconcileChildren(
      85,
      [],
      [textNode("A", "dup"), textNode("plain"), spacerNode("dup")],
      allocator,
    );

    assert.equal(res.ok, false);
    if (res.ok) return;

    assert.equal(res.fatal.code, "ZRUI_DUPLICATE_KEY");
    assert.equal(res.fatal.detail.includes('Duplicate key "dup"'), true);
    assert.equal(res.fatal.detail.includes("instanceId=85"), true);
    assert.equal(res.fatal.detail.includes("children=3"), true);
    assert.equal(res.fatal.detail.includes("child indices 0 and 2"), true);
  });

  test("keyed reorder can preserve all unkeyed nodes when indices remain stable", () => {
    const allocator = createInstanceIdAllocator(1);
    const prevChildren = makePrevChildren(allocator, [
      textNode("plain-0"),
      textNode("A", "a"),
      textNode("plain-2"),
      textNode("B", "b"),
      textNode("plain-4"),
    ]);

    const res = expectOk(
      reconcileChildren(
        86,
        prevChildren,
        [
          textNode("plain-0-next"),
          textNode("B-next", "b"),
          textNode("plain-2-next"),
          textNode("A-next", "a"),
          textNode("plain-4-next"),
        ],
        allocator,
      ),
    );

    assert.deepEqual(res.reusedInstanceIds, [1, 4, 3, 2, 5]);
    assert.deepEqual(res.newInstanceIds, []);
    assert.deepEqual(res.unmountedInstanceIds, []);
  });

  test("same key different kind remounts inside mixed lists", () => {
    const allocator = createInstanceIdAllocator(1);
    const prevChildren = makePrevChildren(allocator, [
      textNode("plain-0"),
      textNode("A", "a"),
      textNode("plain-2"),
    ]);

    const res = expectOk(
      reconcileChildren(
        87,
        prevChildren,
        [textNode("plain-0-next"), spacerNode("a"), textNode("plain-2-next")],
        allocator,
      ),
    );

    assert.deepEqual(res.reusedInstanceIds, [1, 3]);
    assert.deepEqual(res.newInstanceIds, [4]);
    assert.deepEqual(res.unmountedInstanceIds, [2]);
  });

  test("unkeyed kind mismatch in mixed mode remounts by index slot", () => {
    const allocator = createInstanceIdAllocator(1);
    const prevChildren = makePrevChildren(allocator, [textNode("A", "a"), textNode("plain")]);

    const res = expectOk(
      reconcileChildren(88, prevChildren, [textNode("A-next", "a"), spacerNode()], allocator),
    );

    assert.deepEqual(res.reusedInstanceIds, [1]);
    assert.deepEqual(res.newInstanceIds, [3]);
    assert.deepEqual(res.unmountedInstanceIds, [2]);
  });

  test("removing keyed child with undefined hole keeps stable unkeyed siblings", () => {
    const allocator = createInstanceIdAllocator(1);
    const prevChildren = makePrevChildren(allocator, [
      textNode("plain-0"),
      textNode("A", "a"),
      textNode("plain-2"),
    ]);
    const nextChildren = [
      textNode("plain-0-next"),
      undefined,
      textNode("plain-2-next"),
    ] as unknown as readonly VNode[];

    const res = expectOk(reconcileChildren(89, prevChildren, nextChildren, allocator));

    assert.deepEqual(res.reusedInstanceIds, [1, 3]);
    assert.deepEqual(res.newInstanceIds, []);
    assert.deepEqual(res.unmountedInstanceIds, [2]);
  });

  test("inserting unkeyed children around key keeps keyed identity", () => {
    const allocator = createInstanceIdAllocator(1);
    const prevChildren = makePrevChildren(allocator, [
      textNode("plain-0"),
      textNode("A", "a"),
      textNode("plain-2"),
    ]);

    const res = expectOk(
      reconcileChildren(
        90,
        prevChildren,
        [textNode("plain-x"), textNode("plain-y"), textNode("A-next", "a"), textNode("plain-z")],
        allocator,
      ),
    );

    assert.deepEqual(res.reusedInstanceIds, [1, 2]);
    assert.deepEqual(res.newInstanceIds, [4, 5]);
    assert.deepEqual(res.unmountedInstanceIds, [3]);
  });

  test("larger mixed change tracks keyed/unkeyed lifecycle deterministically", () => {
    const allocator = createInstanceIdAllocator(1);
    const prevChildren = makePrevChildren(allocator, [
      textNode("A", "a"),
      textNode("plain-1"),
      textNode("plain-2"),
      textNode("B", "b"),
      textNode("plain-4"),
      textNode("C", "c"),
    ]);

    const res = expectOk(
      reconcileChildren(
        91,
        prevChildren,
        [
          textNode("plain-0"),
          textNode("C-next", "c"),
          textNode("plain-2-next"),
          textNode("A-next", "a"),
          textNode("plain-4-next"),
          textNode("D", "d"),
        ],
        allocator,
      ),
    );

    assert.deepEqual(res.reusedInstanceIds, [6, 3, 1, 5]);
    assert.deepEqual(res.newInstanceIds, [7, 8]);
    assert.deepEqual(res.unmountedInstanceIds, [2, 4]);
  });

  test("mixed to all-keyed remounts prior unkeyed slots", () => {
    const allocator = createInstanceIdAllocator(1);
    const prevChildren = makePrevChildren(allocator, [
      textNode("plain-0"),
      textNode("A", "a"),
      textNode("plain-2"),
    ]);

    const res = expectOk(
      reconcileChildren(
        92,
        prevChildren,
        [textNode("X", "x"), textNode("A-next", "a"), textNode("Y", "y")],
        allocator,
      ),
    );

    assert.deepEqual(res.reusedInstanceIds, [2]);
    assert.deepEqual(res.newInstanceIds, [4, 5]);
    assert.deepEqual(res.unmountedInstanceIds, [1, 3]);
  });
});
