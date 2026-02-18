import { assert, describe, test } from "@rezi-ui/testkit";
import { type VNode, ui } from "../../index.js";
import { type RuntimeInstance, commitVNodeTree } from "../commit.js";
import { createInstanceIdAllocator } from "../instance.js";

function textNode(value: string, key?: string): VNode {
  return key === undefined ? ui.text(value) : ui.text(value, { key });
}

function nest(depth: number, leaf: VNode): VNode {
  let node = leaf;
  for (let i = 0; i < depth; i++) {
    node = i % 2 === 0 ? ui.box({}, [node]) : ui.column({}, [node]);
  }
  return node;
}

function keyedDeepBranch(key: string, label: string, depth = 8): VNode {
  return ui.column({ key }, [nest(depth, textNode(label, `${key}-leaf`))]);
}

function nodeAtPath(root: RuntimeInstance, path: readonly number[]): RuntimeInstance {
  let cursor: RuntimeInstance = root;
  for (const index of path) {
    const next = cursor.children[index];
    if (!next) {
      assert.fail(`expected child at index ${String(index)}`);
      throw new Error("unreachable");
    }
    cursor = next;
  }
  return cursor;
}

function collectSubtreeIds(root: RuntimeInstance): number[] {
  const out: number[] = [root.instanceId];
  for (const child of root.children) {
    out.push(...collectSubtreeIds(child));
  }
  return out;
}

function findByKey(root: RuntimeInstance, key: string): RuntimeInstance | null {
  const props = root.vnode.props as { key?: string } | undefined;
  if (props?.key === key) return root;

  for (const child of root.children) {
    const found = findByKey(child, key);
    if (found) return found;
  }

  return null;
}

function requireNode(node: RuntimeInstance | null, label: string): RuntimeInstance {
  if (!node) {
    assert.fail(`expected runtime node for ${label}`);
    throw new Error("unreachable");
  }
  return node;
}

function expectCommitOk(res: ReturnType<typeof commitVNodeTree>) {
  if (!res.ok) {
    assert.fail(`commit failed: ${res.fatal.code}: ${res.fatal.detail}`);
    throw new Error("unreachable");
  }
  return res.value;
}

describe("reconciliation - deep trees", () => {
  test("10-level leaf update keeps instance ids stable and has no mounts/unmounts", () => {
    const allocator = createInstanceIdAllocator(1);

    const prevTree = ui.column({}, [nest(10, textNode("leaf-a"))]);
    const c0 = expectCommitOk(
      commitVNodeTree(null, prevTree, { allocator, collectLifecycleInstanceIds: true }),
    );

    const nextTree = ui.column({}, [nest(10, textNode("leaf-b"))]);
    const c1 = expectCommitOk(
      commitVNodeTree(c0.root, nextTree, { allocator, collectLifecycleInstanceIds: true }),
    );

    const path = Array.from({ length: 11 }, () => 0);
    assert.equal(nodeAtPath(c1.root, path).vnode.kind, "text");

    for (let depth = 0; depth <= path.length; depth++) {
      const partial = path.slice(0, depth);
      assert.equal(
        nodeAtPath(c1.root, partial).instanceId,
        nodeAtPath(c0.root, partial).instanceId,
      );
    }

    assert.deepEqual(c1.mountedInstanceIds, []);
    assert.deepEqual(c1.unmountedInstanceIds, []);
  });

  test("leaf update deep in branch keeps untouched sibling branch reference", () => {
    const allocator = createInstanceIdAllocator(1);

    const prevTree = ui.column({}, [nest(10, textNode("left-a")), ui.box({}, [ui.text("stable")])]);
    const c0 = expectCommitOk(
      commitVNodeTree(null, prevTree, { allocator, collectLifecycleInstanceIds: true }),
    );

    const nextTree = ui.column({}, [nest(10, textNode("left-b")), ui.box({}, [ui.text("stable")])]);
    const c1 = expectCommitOk(
      commitVNodeTree(c0.root, nextTree, { allocator, collectLifecycleInstanceIds: true }),
    );

    assert.equal(c1.root.children[1], c0.root.children[1]);
    assert.deepEqual(c1.unmountedInstanceIds, []);
  });

  test("swapping two keyed deep subtrees at root preserves keyed instances", () => {
    const allocator = createInstanceIdAllocator(1);

    const prevTree = ui.column({}, [keyedDeepBranch("a", "A"), keyedDeepBranch("b", "B")]);
    const c0 = expectCommitOk(
      commitVNodeTree(null, prevTree, { allocator, collectLifecycleInstanceIds: true }),
    );

    const a0 = requireNode(findByKey(c0.root, "a"), "a@c0");
    const b0 = requireNode(findByKey(c0.root, "b"), "b@c0");

    const nextTree = ui.column({}, [keyedDeepBranch("b", "B2"), keyedDeepBranch("a", "A2")]);
    const c1 = expectCommitOk(
      commitVNodeTree(c0.root, nextTree, { allocator, collectLifecycleInstanceIds: true }),
    );

    const a1 = requireNode(findByKey(c1.root, "a"), "a@c1");
    const b1 = requireNode(findByKey(c1.root, "b"), "b@c1");

    assert.equal(a1.instanceId, a0.instanceId);
    assert.equal(b1.instanceId, b0.instanceId);
    assert.deepEqual(c1.mountedInstanceIds, []);
    assert.deepEqual(c1.unmountedInstanceIds, []);
  });

  test("swapping keyed deep subtrees inside nested parent keeps deep identities", () => {
    const allocator = createInstanceIdAllocator(1);

    const prevTree = ui.column({}, [
      ui.box({}, [keyedDeepBranch("inner-a", "A", 5), keyedDeepBranch("inner-b", "B", 5)]),
      ui.text("tail"),
    ]);
    const c0 = expectCommitOk(
      commitVNodeTree(null, prevTree, { allocator, collectLifecycleInstanceIds: true }),
    );

    const a0 = requireNode(findByKey(c0.root, "inner-a"), "inner-a@c0");
    const b0 = requireNode(findByKey(c0.root, "inner-b"), "inner-b@c0");

    const nextTree = ui.column({}, [
      ui.box({}, [keyedDeepBranch("inner-b", "B2", 5), keyedDeepBranch("inner-a", "A2", 5)]),
      ui.text("tail"),
    ]);
    const c1 = expectCommitOk(
      commitVNodeTree(c0.root, nextTree, { allocator, collectLifecycleInstanceIds: true }),
    );

    const a1 = requireNode(findByKey(c1.root, "inner-a"), "inner-a@c1");
    const b1 = requireNode(findByKey(c1.root, "inner-b"), "inner-b@c1");

    assert.equal(a1.instanceId, a0.instanceId);
    assert.equal(b1.instanceId, b0.instanceId);
    assert.deepEqual(c1.unmountedInstanceIds, []);
  });

  test("simultaneous shallow remove and deep add produce separate lifecycle entries", () => {
    const allocator = createInstanceIdAllocator(1);

    const prevTree = ui.column({}, [
      ui.box({ key: "shallow" }, [textNode("keep", "keep"), textNode("remove", "remove")]),
      ui.column({ key: "deep" }, [
        nest(7, ui.column({ key: "deep-tail" }, [textNode("base", "base")])),
      ]),
    ]);
    const c0 = expectCommitOk(
      commitVNodeTree(null, prevTree, { allocator, collectLifecycleInstanceIds: true }),
    );

    const removeNode = requireNode(findByKey(c0.root, "remove"), "remove@c0");

    const nextTree = ui.column({}, [
      ui.box({ key: "shallow" }, [textNode("keep", "keep")]),
      ui.column({ key: "deep" }, [
        nest(
          7,
          ui.column({ key: "deep-tail" }, [textNode("base", "base"), textNode("added", "added")]),
        ),
      ]),
    ]);
    const c1 = expectCommitOk(
      commitVNodeTree(c0.root, nextTree, { allocator, collectLifecycleInstanceIds: true }),
    );

    const addedNode = requireNode(findByKey(c1.root, "added"), "added@c1");

    assert.equal(c1.unmountedInstanceIds.includes(removeNode.instanceId), true);
    assert.equal(c1.mountedInstanceIds.includes(addedNode.instanceId), true);
  });

  test("removing a deep keyed subtree unmounts that subtree ids in preorder", () => {
    const allocator = createInstanceIdAllocator(1);

    const prevTree = ui.column({}, [
      textNode("head", "head"),
      keyedDeepBranch("target", "TARGET", 6),
      textNode("tail", "tail"),
    ]);
    const c0 = expectCommitOk(
      commitVNodeTree(null, prevTree, { allocator, collectLifecycleInstanceIds: true }),
    );

    const target0 = requireNode(findByKey(c0.root, "target"), "target@c0");
    const expectedUnmounted = collectSubtreeIds(target0);

    const nextTree = ui.column({}, [textNode("head", "head"), textNode("tail", "tail")]);
    const c1 = expectCommitOk(
      commitVNodeTree(c0.root, nextTree, { allocator, collectLifecycleInstanceIds: true }),
    );

    assert.deepEqual(c1.unmountedInstanceIds, expectedUnmounted);
  });

  test("inserting a deep keyed subtree mounts only that new subtree ids", () => {
    const allocator = createInstanceIdAllocator(1);

    const prevTree = ui.column({}, [textNode("head", "head"), textNode("tail", "tail")]);
    const c0 = expectCommitOk(
      commitVNodeTree(null, prevTree, { allocator, collectLifecycleInstanceIds: true }),
    );

    const nextTree = ui.column({}, [
      textNode("head", "head"),
      keyedDeepBranch("target", "TARGET", 6),
      textNode("tail", "tail"),
    ]);
    const c1 = expectCommitOk(
      commitVNodeTree(c0.root, nextTree, { allocator, collectLifecycleInstanceIds: true }),
    );

    const target1 = requireNode(findByKey(c1.root, "target"), "target@c1");
    const expectedMounted = collectSubtreeIds(target1);

    assert.deepEqual(c1.mountedInstanceIds, expectedMounted);
  });

  test("deep same-key kind swap remounts swapped node", () => {
    const allocator = createInstanceIdAllocator(1);

    const prevTree = ui.column({}, [
      nest(5, ui.box({ key: "swap" }, [nest(2, textNode("leaf", "swap-leaf"))])),
    ]);
    const c0 = expectCommitOk(
      commitVNodeTree(null, prevTree, { allocator, collectLifecycleInstanceIds: true }),
    );

    const swap0 = requireNode(findByKey(c0.root, "swap"), "swap@c0");

    const nextTree = ui.column({}, [
      nest(5, ui.row({ key: "swap" }, [nest(2, textNode("leaf-next", "swap-leaf"))])),
    ]);
    const c1 = expectCommitOk(
      commitVNodeTree(c0.root, nextTree, { allocator, collectLifecycleInstanceIds: true }),
    );

    const swap1 = requireNode(findByKey(c1.root, "swap"), "swap@c1");

    assert.notEqual(swap1.instanceId, swap0.instanceId);
    assert.equal(c1.unmountedInstanceIds.includes(swap0.instanceId), true);
    assert.equal(c1.mountedInstanceIds.includes(swap1.instanceId), true);
  });

  test("deep mixed keyed/unkeyed reorder preserves keyed ids and remounts shifted unkeyed", () => {
    const allocator = createInstanceIdAllocator(1);

    const prevTree = ui.column({}, [
      nest(
        6,
        ui.column({ key: "mix" }, [textNode("A", "a"), textNode("plain"), textNode("B", "b")]),
      ),
    ]);
    const c0 = expectCommitOk(
      commitVNodeTree(null, prevTree, { allocator, collectLifecycleInstanceIds: true }),
    );

    const mix0 = requireNode(findByKey(c0.root, "mix"), "mix@c0");
    const a0 = requireNode(findByKey(c0.root, "a"), "a@c0");
    const b0 = requireNode(findByKey(c0.root, "b"), "b@c0");

    const oldUnkeyed = mix0.children[1];
    if (!oldUnkeyed) {
      assert.fail("expected unkeyed child at index 1");
      return;
    }

    const nextTree = ui.column({}, [
      nest(
        6,
        ui.column({ key: "mix" }, [
          textNode("plain-next"),
          textNode("B2", "b"),
          textNode("A2", "a"),
        ]),
      ),
    ]);
    const c1 = expectCommitOk(
      commitVNodeTree(c0.root, nextTree, { allocator, collectLifecycleInstanceIds: true }),
    );

    const mix1 = requireNode(findByKey(c1.root, "mix"), "mix@c1");
    const a1 = requireNode(findByKey(c1.root, "a"), "a@c1");
    const b1 = requireNode(findByKey(c1.root, "b"), "b@c1");

    const newUnkeyed = mix1.children[0];
    if (!newUnkeyed) {
      assert.fail("expected unkeyed child at index 0");
      return;
    }

    assert.equal(a1.instanceId, a0.instanceId);
    assert.equal(b1.instanceId, b0.instanceId);
    assert.equal(c1.unmountedInstanceIds.includes(oldUnkeyed.instanceId), true);
    assert.equal(c1.mountedInstanceIds.includes(newUnkeyed.instanceId), true);
  });

  test("simultaneous add/remove across different deep branches keeps branch roots reused", () => {
    const allocator = createInstanceIdAllocator(1);

    const prevTree = ui.column({}, [
      ui.column({ key: "left" }, [
        nest(6, ui.column({ key: "left-tail" }, [textNode("L", "left-remove")])),
      ]),
      ui.column({ key: "right" }, [
        nest(6, ui.column({ key: "right-tail" }, [textNode("R", "right-base")])),
      ]),
    ]);
    const c0 = expectCommitOk(
      commitVNodeTree(null, prevTree, { allocator, collectLifecycleInstanceIds: true }),
    );

    const leftRoot0 = requireNode(findByKey(c0.root, "left"), "left@c0");
    const rightRoot0 = requireNode(findByKey(c0.root, "right"), "right@c0");
    const leftRemoved = requireNode(findByKey(c0.root, "left-remove"), "left-remove@c0");

    const nextTree = ui.column({}, [
      ui.column({ key: "left" }, [nest(6, ui.column({ key: "left-tail" }, [textNode("L")]))]),
      ui.column({ key: "right" }, [
        nest(
          6,
          ui.column({ key: "right-tail" }, [
            textNode("R", "right-base"),
            textNode("new", "right-add"),
          ]),
        ),
      ]),
    ]);
    const c1 = expectCommitOk(
      commitVNodeTree(c0.root, nextTree, { allocator, collectLifecycleInstanceIds: true }),
    );

    const leftRoot1 = requireNode(findByKey(c1.root, "left"), "left@c1");
    const rightRoot1 = requireNode(findByKey(c1.root, "right"), "right@c1");
    const rightAdded = requireNode(findByKey(c1.root, "right-add"), "right-add@c1");

    assert.equal(leftRoot1.instanceId, leftRoot0.instanceId);
    assert.equal(rightRoot1.instanceId, rightRoot0.instanceId);
    assert.equal(c1.unmountedInstanceIds.includes(leftRemoved.instanceId), true);
    assert.equal(c1.mountedInstanceIds.includes(rightAdded.instanceId), true);
  });
});
