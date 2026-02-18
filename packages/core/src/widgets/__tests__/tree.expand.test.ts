import { assert, describe, test } from "@rezi-ui/testkit";
import type { ZrevEvent } from "../../events.js";
import { ZR_KEY_LEFT, ZR_KEY_RIGHT } from "../../keybindings/keyCodes.js";
import type { TreeLocalState } from "../../runtime/localState.js";
import { routeTreeKey } from "../../runtime/router.js";
import type { TreeRoutingCtx } from "../../runtime/router/types.js";
import {
  collapseNode,
  expandAllSiblings,
  expandNode,
  findNodeIndex,
  flattenTree,
  toggleExpanded,
} from "../tree.js";

type Node = {
  id: string;
  children?: Node[];
};

function sampleTree(): Node {
  return {
    id: "root",
    children: [
      { id: "a", children: [{ id: "a1" }, { id: "a2" }] },
      { id: "b", children: [{ id: "b1" }] },
      { id: "c" },
    ],
  };
}

function key(keyCode: number): ZrevEvent {
  return { kind: "key", key: keyCode, action: "down", mods: 0, timeMs: 0 };
}

function makeCtx(
  overrides: Partial<TreeRoutingCtx<Node>> & Partial<TreeLocalState> = {},
): TreeRoutingCtx<Node> {
  const expanded = overrides.expanded ?? ["root"];
  const flatNodes =
    overrides.flatNodes ??
    flattenTree(
      sampleTree(),
      (n) => n.id,
      (n) => n.children,
      (n) => (n.children?.length ?? 0) > 0,
      expanded,
    );

  const state: TreeLocalState = {
    focusedKey: overrides.focusedKey ?? "root",
    loadingKeys: overrides.loadingKeys ?? new Set(),
    scrollTop: overrides.scrollTop ?? 0,
    viewportHeight: overrides.viewportHeight ?? 20,
    flatCache: null,
    expandedSetRef: undefined,
    expandedSet: undefined,
    prefixCache: null,
  };

  return {
    treeId: "tree",
    flatNodes,
    expanded,
    state,
    keyboardNavigation: overrides.keyboardNavigation ?? true,
  };
}

describe("tree.expand - expand/collapse traversal", () => {
  test("flattenTree with no expanded keys shows only root", () => {
    const flat = flattenTree(
      sampleTree(),
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

  test("flattenTree with root expanded shows root children", () => {
    const flat = flattenTree(
      sampleTree(),
      (n) => n.id,
      (n) => n.children,
      (n) => !!n.children,
      ["root"],
    );
    assert.deepEqual(
      flat.map((n) => n.key),
      ["root", "a", "b", "c"],
    );
  });

  test("flattenTree with nested expansion shows grandchildren", () => {
    const flat = flattenTree(
      sampleTree(),
      (n) => n.id,
      (n) => n.children,
      (n) => !!n.children,
      ["root", "a"],
    );
    assert.deepEqual(
      flat.map((n) => n.key),
      ["root", "a", "a1", "a2", "b", "c"],
    );
  });

  test("expandNode adds key once", () => {
    assert.deepEqual(expandNode(["root"], "a"), ["root", "a"]);
  });

  test("expandNode is idempotent", () => {
    const current = ["root", "a"] as const;
    assert.equal(expandNode(current, "a"), current);
  });

  test("collapseNode removes key", () => {
    assert.deepEqual(collapseNode(["root", "a"], "a"), ["root"]);
  });

  test("collapseNode is idempotent when key missing", () => {
    const current = ["root"] as const;
    assert.equal(collapseNode(current, "missing"), current);
  });

  test("toggleExpanded expands missing key", () => {
    const result = toggleExpanded(["root"], "a");
    assert.equal(result.isExpanded, true);
    assert.deepEqual(result.expanded, ["root", "a"]);
  });

  test("toggleExpanded collapses existing key", () => {
    const result = toggleExpanded(["root", "a"], "a");
    assert.equal(result.isExpanded, false);
    assert.deepEqual(result.expanded, ["root"]);
  });

  test("expandAllSiblings expands all sibling branches with children", () => {
    const flat = flattenTree(
      sampleTree(),
      (n) => n.id,
      (n) => n.children,
      (n) => !!n.children,
      ["root"],
    );
    const index = findNodeIndex(flat, "a");
    const next = expandAllSiblings(flat, index, ["root"]);
    assert.ok(next.includes("a"));
    assert.ok(next.includes("b"));
    assert.ok(!next.includes("c"));
  });

  test("ArrowRight expands collapsed branch", () => {
    const result = routeTreeKey(
      key(ZR_KEY_RIGHT),
      makeCtx({ focusedKey: "a", expanded: ["root"] }),
    );
    assert.ok(result.nextExpanded?.includes("a"));
    assert.equal(result.consumed, true);
  });

  test("ArrowRight on expanded branch moves focus to first child", () => {
    const result = routeTreeKey(
      key(ZR_KEY_RIGHT),
      makeCtx({ focusedKey: "a", expanded: ["root", "a"] }),
    );
    assert.equal(result.nextFocusedKey, "a1");
    assert.equal(result.nodeToSelect, "a1");
  });

  test("ArrowLeft on expanded branch collapses branch", () => {
    const result = routeTreeKey(
      key(ZR_KEY_LEFT),
      makeCtx({ focusedKey: "a", expanded: ["root", "a"] }),
    );
    assert.ok(!result.nextExpanded?.includes("a"));
  });

  test("ArrowLeft on collapsed child moves focus to parent", () => {
    const result = routeTreeKey(
      key(ZR_KEY_LEFT),
      makeCtx({ focusedKey: "a1", expanded: ["root", "a"] }),
    );
    assert.equal(result.nextFocusedKey, "a");
    assert.equal(result.nodeToSelect, "a");
  });

  test("collapsing parent from focused child path shifts focus to parent", () => {
    const first = routeTreeKey(
      key(ZR_KEY_LEFT),
      makeCtx({ focusedKey: "a1", expanded: ["root", "a"] }),
    );
    assert.equal(first.nextFocusedKey, "a");

    const second = routeTreeKey(
      key(ZR_KEY_LEFT),
      makeCtx({ focusedKey: "a", expanded: ["root", "a"] }),
    );
    assert.ok(!second.nextExpanded?.includes("a"));
  });
});
