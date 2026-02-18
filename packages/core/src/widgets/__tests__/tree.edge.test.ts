import { assert, describe, test } from "@rezi-ui/testkit";
import type { ZrevEvent } from "../../events.js";
import { ZR_KEY_DOWN } from "../../keybindings/keyCodes.js";
import type { TreeLocalState } from "../../runtime/localState.js";
import { routeTreeKey } from "../../runtime/router.js";
import type { TreeRoutingCtx } from "../../runtime/router/types.js";
import {
  findNextSiblingIndex,
  findParentIndex,
  findPrevSiblingIndex,
  flattenTree,
  getTotalVisibleNodes,
} from "../tree.js";

type Node = { id: string; children?: Node[] };

function keyDown(): ZrevEvent {
  return { kind: "key", key: ZR_KEY_DOWN, action: "down", mods: 0, timeMs: 0 };
}

function makeState(focusedKey: string | null): TreeLocalState {
  return {
    focusedKey,
    loadingKeys: new Set(),
    scrollTop: 0,
    viewportHeight: 10,
    flatCache: null,
    expandedSetRef: undefined,
    expandedSet: undefined,
    prefixCache: null,
  };
}

describe("tree.edge - structural extremes", () => {
  test("empty roots flatten to empty list", () => {
    const flat = flattenTree<Node>(
      [],
      (n) => n.id,
      (n) => n.children,
      (n) => !!n.children,
      [],
    );
    assert.equal(flat.length, 0);
  });

  test("single root without children flattens to one node", () => {
    const flat = flattenTree<Node>(
      { id: "root" },
      (n) => n.id,
      (n) => n.children,
      (n) => !!n.children,
      [],
    );
    assert.deepEqual(
      flat.map((n) => n.key),
      ["root"],
    );
  });

  test("deep tree collapsed shows only root", () => {
    let node: Node = { id: "n100" };
    for (let i = 99; i >= 0; i--) {
      node = { id: `n${i}`, children: [node] };
    }
    const flat = flattenTree(
      node,
      (n) => n.id,
      (n) => n.children,
      (n) => !!n.children,
      [],
    );
    assert.equal(flat.length, 1);
  });

  test("deep tree expanded to depth 100 remains deterministic", () => {
    let node: Node = { id: "n100" };
    const expanded: string[] = [];
    for (let i = 99; i >= 0; i--) {
      expanded.push(`n${i}`);
      node = { id: `n${i}`, children: [node] };
    }
    const flat = flattenTree(
      node,
      (n) => n.id,
      (n) => n.children,
      (n) => !!n.children,
      expanded,
    );
    assert.equal(flat.length, 101);
    assert.equal(flat[100]?.depth, 100);
  });

  test("1000 siblings flatten deterministically", () => {
    const roots: Node[] = Array.from({ length: 1000 }, (_, i) => ({ id: `r${i}` }));
    const flat = flattenTree(
      roots,
      (n) => n.id,
      (n) => n.children,
      (n) => !!n.children,
      [],
    );
    assert.equal(flat.length, 1000);
    assert.equal(flat[0]?.key, "r0");
    assert.equal(flat[999]?.key, "r999");
  });

  test("findNextSiblingIndex returns -1 for last sibling", () => {
    const roots: Node[] = [{ id: "a" }, { id: "b" }];
    const flat = flattenTree(
      roots,
      (n) => n.id,
      (n) => n.children,
      (n) => !!n.children,
      [],
    );
    assert.equal(findNextSiblingIndex(flat, 1), -1);
  });

  test("findPrevSiblingIndex returns -1 for first sibling", () => {
    const roots: Node[] = [{ id: "a" }, { id: "b" }];
    const flat = flattenTree(
      roots,
      (n) => n.id,
      (n) => n.children,
      (n) => !!n.children,
      [],
    );
    assert.equal(findPrevSiblingIndex(flat, 0), -1);
  });

  test("findParentIndex returns -1 for roots", () => {
    const roots: Node[] = [{ id: "a" }, { id: "b" }];
    const flat = flattenTree(
      roots,
      (n) => n.id,
      (n) => n.children,
      (n) => !!n.children,
      [],
    );
    assert.equal(findParentIndex(flat, 0), -1);
  });

  test("routing with empty flat nodes does not consume", () => {
    const ctx: TreeRoutingCtx<Node> = {
      treeId: "tree",
      flatNodes: [],
      expanded: [],
      state: makeState(null),
      keyboardNavigation: true,
    };
    const result = routeTreeKey(keyDown(), ctx);
    assert.equal(result.consumed, false);
  });

  test("getTotalVisibleNodes handles large lists", () => {
    const roots: Node[] = Array.from({ length: 1000 }, (_, i) => ({ id: `r${i}` }));
    const flat = flattenTree(
      roots,
      (n) => n.id,
      (n) => n.children,
      (n) => !!n.children,
      [],
    );
    assert.equal(getTotalVisibleNodes(flat), 1000);
  });
});
