import { assert, describe, test } from "@rezi-ui/testkit";
import type { ZrevEvent } from "../../events.js";
import {
  ZR_KEY_DOWN,
  ZR_KEY_END,
  ZR_KEY_ENTER,
  ZR_KEY_HOME,
  ZR_KEY_LEFT,
  ZR_KEY_RIGHT,
  ZR_KEY_SPACE,
  ZR_KEY_UP,
} from "../../keybindings/keyCodes.js";
import type { TreeLocalState } from "../../runtime/localState.js";
import { routeTreeKey } from "../../runtime/router.js";
import type { TreeRoutingCtx } from "../../runtime/router/types.js";
import { flattenTree } from "../tree.js";

type Node = { id: string; children?: Node[] };
const ZR_KEY_ASTERISK = 42;

function tree(): Node {
  return {
    id: "root",
    children: [
      { id: "a", children: [{ id: "a1" }] },
      { id: "b", children: [{ id: "b1" }] },
      { id: "c" },
    ],
  };
}

function key(k: number): ZrevEvent {
  return { kind: "key", key: k, action: "down", mods: 0, timeMs: 0 };
}

function ctx(
  overrides: Partial<TreeRoutingCtx<Node>> & Partial<TreeLocalState> = {},
): TreeRoutingCtx<Node> {
  const expanded = overrides.expanded ?? ["root", "a"];
  const flatNodes =
    overrides.flatNodes ??
    flattenTree(
      tree(),
      (n) => n.id,
      (n) => n.children,
      (n) => (n.children?.length ?? 0) > 0,
      expanded,
    );

  const state: TreeLocalState = {
    focusedKey: overrides.focusedKey ?? "root",
    loadingKeys: overrides.loadingKeys ?? new Set(),
    scrollTop: overrides.scrollTop ?? 0,
    viewportHeight: overrides.viewportHeight ?? 8,
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

describe("tree.selection - keyboard selection and activation", () => {
  test("ArrowDown selects next visible node", () => {
    const result = routeTreeKey(key(ZR_KEY_DOWN), ctx({ focusedKey: "root" }));
    assert.equal(result.nextFocusedKey, "a");
    assert.equal(result.nodeToSelect, "a");
  });

  test("ArrowUp selects previous visible node", () => {
    const result = routeTreeKey(key(ZR_KEY_UP), ctx({ focusedKey: "b" }));
    assert.equal(result.nextFocusedKey, "a1");
    assert.equal(result.nodeToSelect, "a1");
  });

  test("ArrowRight on expanded branch selects first child", () => {
    const result = routeTreeKey(
      key(ZR_KEY_RIGHT),
      ctx({ focusedKey: "a", expanded: ["root", "a"] }),
    );
    assert.equal(result.nextFocusedKey, "a1");
  });

  test("ArrowLeft on child selects parent", () => {
    const result = routeTreeKey(key(ZR_KEY_LEFT), ctx({ focusedKey: "a1" }));
    assert.equal(result.nextFocusedKey, "a");
  });

  test("Home selects first node and resets scroll", () => {
    const result = routeTreeKey(key(ZR_KEY_HOME), ctx({ focusedKey: "b", scrollTop: 10 }));
    assert.equal(result.nextFocusedKey, "root");
    assert.equal(result.nextScrollTop, 0);
  });

  test("End selects last visible node", () => {
    const result = routeTreeKey(key(ZR_KEY_END), ctx({ focusedKey: "root" }));
    assert.equal(result.nextFocusedKey, "c");
  });

  test("Enter activates focused node", () => {
    const result = routeTreeKey(key(ZR_KEY_ENTER), ctx({ focusedKey: "b" }));
    assert.equal(result.nodeToActivate, "b");
  });

  test("Space toggles branch expansion", () => {
    const result = routeTreeKey(key(ZR_KEY_SPACE), ctx({ focusedKey: "b", expanded: ["root"] }));
    assert.ok(result.nextExpanded?.includes("b"));
  });

  test("Asterisk expands sibling branches", () => {
    const result = routeTreeKey(key(ZR_KEY_ASTERISK), ctx({ focusedKey: "a", expanded: ["root"] }));
    assert.ok(result.nextExpanded?.includes("a"));
    assert.ok(result.nextExpanded?.includes("b"));
  });

  test("keyboardNavigation=false does not consume", () => {
    const result = routeTreeKey(key(ZR_KEY_DOWN), ctx({ keyboardNavigation: false }));
    assert.equal(result.consumed, false);
  });
});
