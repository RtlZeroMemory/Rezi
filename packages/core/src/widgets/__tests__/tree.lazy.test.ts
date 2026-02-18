import { assert, describe, test } from "@rezi-ui/testkit";
import type { ZrevEvent } from "../../events.js";
import { ZR_KEY_RIGHT, ZR_KEY_SPACE } from "../../keybindings/keyCodes.js";
import type { TreeLocalState } from "../../runtime/localState.js";
import { routeTreeKey } from "../../runtime/router.js";
import type { TreeRoutingCtx } from "../../runtime/router/types.js";
import { createLoadingState, flattenTree, getExpandIndicator } from "../tree.js";

type Node = { id: string; children?: Node[] };

function key(keyCode: number): ZrevEvent {
  return { kind: "key", key: keyCode, action: "down", mods: 0, timeMs: 0 };
}

function lazyCtx(expanded: readonly string[] = []): TreeRoutingCtx<Node> {
  const lazyNode: Node = { id: "lazy" };
  const flatNodes = flattenTree(
    [lazyNode],
    (n) => n.id,
    (n) => n.children,
    () => true,
    expanded,
  );
  const state: TreeLocalState = {
    focusedKey: "lazy",
    loadingKeys: new Set(),
    scrollTop: 0,
    viewportHeight: 5,
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
    keyboardNavigation: true,
  };
}

describe("tree.lazy - loading and async-state invariants", () => {
  test("createLoadingState starts empty", () => {
    const state = createLoadingState();
    assert.equal(state.isLoading("x"), false);
  });

  test("startLoading adds key", () => {
    const state = createLoadingState().startLoading("x");
    assert.equal(state.isLoading("x"), true);
  });

  test("startLoading is idempotent", () => {
    const state = createLoadingState(["x"]);
    assert.equal(state.startLoading("x"), state);
  });

  test("finishLoading removes key", () => {
    const state = createLoadingState(["x"]).finishLoading("x");
    assert.equal(state.isLoading("x"), false);
  });

  test("finishLoading missing key is idempotent", () => {
    const state = createLoadingState(["x"]);
    assert.equal(state.finishLoading("missing"), state);
  });

  test("ArrowRight on unloaded branch requests node load", () => {
    const result = routeTreeKey(key(ZR_KEY_RIGHT), lazyCtx());
    assert.equal(result.nodeToLoad, "lazy");
    assert.ok(result.nextExpanded?.includes("lazy"));
  });

  test("Space on unloaded branch requests node load", () => {
    const result = routeTreeKey(key(ZR_KEY_SPACE), lazyCtx());
    assert.equal(result.nodeToLoad, "lazy");
    assert.ok(result.nextExpanded?.includes("lazy"));
  });

  test("Space on expanded branch collapses without reloading", () => {
    const result = routeTreeKey(key(ZR_KEY_SPACE), lazyCtx(["lazy"]));
    assert.equal(result.nodeToLoad, undefined);
    assert.ok(!result.nextExpanded?.includes("lazy"));
  });

  test("getExpandIndicator shows loading indicator", () => {
    assert.equal(getExpandIndicator(true, false, true), "◌");
  });

  test("getExpandIndicator shows success/failure states deterministically", () => {
    assert.equal(getExpandIndicator(true, true, false), "▼");
    assert.equal(getExpandIndicator(true, false, false), "▶");
    assert.equal(getExpandIndicator(false, false, false), " ");
  });
});
