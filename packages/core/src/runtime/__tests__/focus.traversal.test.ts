import { assert, describe, test } from "@rezi-ui/testkit";
import type { VNode } from "../../index.js";
import { commitVNodeTree } from "../commit.js";
import {
  applyPendingFocusChange,
  buildFocusIndexMap,
  computeFocusList,
  computeMovedFocusId,
  createFocusState,
  finalizeFocusForCommittedTree,
  requestPendingFocusChange,
} from "../focus.js";
import { createInstanceIdAllocator } from "../instance.js";

function commitTree(vnode: VNode) {
  const allocator = createInstanceIdAllocator(1);
  const res = commitVNodeTree(null, vnode, { allocator });
  if (!res.ok) {
    assert.fail(`commit failed: ${res.fatal.code}: ${res.fatal.detail}`);
  }
  return res.value.root;
}

describe("focus traversal - computeFocusList", () => {
  test("collects focusables in DFS preorder", () => {
    const tree: VNode = {
      kind: "column",
      props: {},
      children: [
        { kind: "button", props: { id: "a", label: "A" } },
        {
          kind: "row",
          props: {},
          children: [
            { kind: "button", props: { id: "b", label: "B" } },
            {
              kind: "column",
              props: {},
              children: [
                { kind: "input", props: { id: "c", value: "c" } },
                { kind: "button", props: { id: "d", label: "D" } },
              ],
            },
          ],
        },
        { kind: "button", props: { id: "e", label: "E" } },
      ],
    };

    const focusList = computeFocusList(commitTree(tree));
    assert.deepEqual(focusList, ["a", "b", "c", "d", "e"]);
  });

  test("preserves left-to-right child order", () => {
    const tree: VNode = {
      kind: "row",
      props: {},
      children: [
        { kind: "button", props: { id: "left", label: "L" } },
        { kind: "button", props: { id: "mid", label: "M" } },
        { kind: "button", props: { id: "right", label: "R" } },
      ],
    };

    const focusList = computeFocusList(commitTree(tree));
    assert.deepEqual(focusList, ["left", "mid", "right"]);
  });

  test("skips disabled button ids", () => {
    const tree: VNode = {
      kind: "column",
      props: {},
      children: [
        { kind: "button", props: { id: "a", label: "A", disabled: true } },
        { kind: "button", props: { id: "b", label: "B" } },
      ],
    };

    const focusList = computeFocusList(commitTree(tree));
    assert.deepEqual(focusList, ["b"]);
  });

  test("skips disabled input ids", () => {
    const tree: VNode = {
      kind: "column",
      props: {},
      children: [
        { kind: "input", props: { id: "i1", value: "ok" } },
        { kind: "input", props: { id: "i2", value: "no", disabled: true } },
      ],
    };

    const focusList = computeFocusList(commitTree(tree));
    assert.deepEqual(focusList, ["i1"]);
  });

  test("ignores hidden width=0 non-focusable widgets", () => {
    const tree: VNode = {
      kind: "column",
      props: {},
      children: [
        { kind: "button", props: { id: "a", label: "A" } },
        { kind: "skeleton", props: { width: 0, variant: "rect" } },
        { kind: "button", props: { id: "b", label: "B" } },
      ],
    };

    const focusList = computeFocusList(commitTree(tree));
    assert.deepEqual(focusList, ["a", "b"]);
  });

  test("returns empty list when tree has no focusables", () => {
    const tree: VNode = {
      kind: "column",
      props: {},
      children: [
        { kind: "text", text: "hello", props: {} },
        { kind: "spacer", props: { size: 1 } },
      ],
    };

    const focusList = computeFocusList(commitTree(tree));
    assert.deepEqual(focusList, []);
  });

  test("returns a single id for one focusable", () => {
    const tree: VNode = { kind: "button", props: { id: "only", label: "Only" } };
    const focusList = computeFocusList(commitTree(tree));
    assert.deepEqual(focusList, ["only"]);
  });
});

describe("focus traversal - computeMovedFocusId", () => {
  test("next from null focus starts at first", () => {
    assert.equal(computeMovedFocusId(["a", "b", "c"], null, "next"), "a");
  });

  test("prev from null focus starts at last", () => {
    assert.equal(computeMovedFocusId(["a", "b", "c"], null, "prev"), "c");
  });

  test("next advances by one", () => {
    assert.equal(computeMovedFocusId(["a", "b", "c"], "a", "next"), "b");
  });

  test("prev moves back by one", () => {
    assert.equal(computeMovedFocusId(["a", "b", "c"], "c", "prev"), "b");
  });

  test("next wraps from last to first", () => {
    assert.equal(computeMovedFocusId(["a", "b", "c"], "c", "next"), "a");
  });

  test("prev wraps from first to last", () => {
    assert.equal(computeMovedFocusId(["a", "b", "c"], "a", "prev"), "c");
  });

  test("unknown focused id on next falls back to first", () => {
    assert.equal(computeMovedFocusId(["a", "b", "c"], "missing", "next"), "a");
  });

  test("unknown focused id on prev falls back to last", () => {
    assert.equal(computeMovedFocusId(["a", "b", "c"], "missing", "prev"), "c");
  });

  test("empty focus list returns null", () => {
    assert.equal(computeMovedFocusId([], "a", "next"), null);
  });

  test("single focusable next stays on same id", () => {
    assert.equal(computeMovedFocusId(["only"], "only", "next"), "only");
  });

  test("single focusable prev stays on same id", () => {
    assert.equal(computeMovedFocusId(["only"], "only", "prev"), "only");
  });

  test("uses provided index map for lookups", () => {
    const focusList = ["a", "b", "c"];
    const indexMap = buildFocusIndexMap(focusList);
    assert.equal(computeMovedFocusId(focusList, "b", "next", indexMap), "c");
  });

  test("index map can be partial and fallback still works", () => {
    const focusList = ["a", "b", "c"];
    const partialMap = new Map<string, number>([["a", 0]]);
    assert.equal(computeMovedFocusId(focusList, "b", "next", partialMap), "c");
  });
});

describe("focus traversal - pending and finalize", () => {
  test("createFocusState initializes with no focus", () => {
    const state = createFocusState();
    assert.equal(state.focusedId, null);
    assert.equal(state.pendingFocusedId, undefined);
  });

  test("requestPendingFocusChange records pending id", () => {
    const state = requestPendingFocusChange(Object.freeze({ focusedId: "a" }), "b");
    assert.equal(state.focusedId, "a");
    assert.equal(state.pendingFocusedId, "b");
  });

  test("applyPendingFocusChange returns same object when no pending", () => {
    const state = Object.freeze({ focusedId: "a" as string | null });
    const next = applyPendingFocusChange(state);
    assert.equal(next, state);
  });

  test("applyPendingFocusChange applies pending and clears pending field", () => {
    const state = Object.freeze({ focusedId: "a" as string | null, pendingFocusedId: "b" });
    const next = applyPendingFocusChange(state);
    assert.equal(next.focusedId, "b");
    assert.equal(next.pendingFocusedId, undefined);
  });

  test("finalize keeps focused id when still present", () => {
    const tree: VNode = {
      kind: "row",
      props: {},
      children: [
        { kind: "button", props: { id: "a", label: "A" } },
        { kind: "button", props: { id: "b", label: "B" } },
      ],
    };

    const next = finalizeFocusForCommittedTree(Object.freeze({ focusedId: "b" }), commitTree(tree));
    assert.equal(next.focusedId, "b");
  });

  test("finalize reassigns stale focused id to first focusable", () => {
    const tree: VNode = {
      kind: "row",
      props: {},
      children: [
        { kind: "button", props: { id: "a", label: "A" } },
        { kind: "button", props: { id: "b", label: "B" } },
      ],
    };

    const next = finalizeFocusForCommittedTree(
      Object.freeze({ focusedId: "missing" as string | null }),
      commitTree(tree),
    );
    assert.equal(next.focusedId, "a");
  });

  test("finalize applies pending focus when pending id exists", () => {
    const tree: VNode = {
      kind: "column",
      props: {},
      children: [
        { kind: "button", props: { id: "a", label: "A" } },
        { kind: "button", props: { id: "b", label: "B" } },
      ],
    };

    const next = finalizeFocusForCommittedTree(
      Object.freeze({ focusedId: "a" as string | null, pendingFocusedId: "b" }),
      commitTree(tree),
    );
    assert.equal(next.focusedId, "b");
  });

  test("finalize pending missing id falls back to first focusable", () => {
    const tree: VNode = {
      kind: "column",
      props: {},
      children: [
        { kind: "button", props: { id: "a", label: "A" } },
        { kind: "button", props: { id: "b", label: "B" } },
      ],
    };

    const next = finalizeFocusForCommittedTree(
      Object.freeze({ focusedId: "a" as string | null, pendingFocusedId: "missing" }),
      commitTree(tree),
    );
    assert.equal(next.focusedId, "a");
  });

  test("finalize pending null clears focus", () => {
    const tree: VNode = {
      kind: "button",
      props: { id: "a", label: "A" },
    };

    const next = finalizeFocusForCommittedTree(
      Object.freeze({ focusedId: "a" as string | null, pendingFocusedId: null }),
      commitTree(tree),
    );
    assert.equal(next.focusedId, null);
  });

  test("finalize returns null when no focusables exist", () => {
    const tree: VNode = { kind: "text", text: "x", props: {} };
    const next = finalizeFocusForCommittedTree(
      Object.freeze({ focusedId: "stale" as string | null }),
      commitTree(tree),
    );
    assert.equal(next.focusedId, null);
  });

  test("finalize remains deterministic for the same transition sequence", () => {
    const treeA: VNode = {
      kind: "column",
      props: {},
      children: [
        { kind: "button", props: { id: "a", label: "A" } },
        { kind: "button", props: { id: "b", label: "B" } },
      ],
    };
    const treeB: VNode = {
      kind: "column",
      props: {},
      children: [
        { kind: "button", props: { id: "c", label: "C" } },
        { kind: "button", props: { id: "d", label: "D" } },
      ],
    };

    const run = () => {
      let state = Object.freeze({ focusedId: "a" as string | null });
      state = finalizeFocusForCommittedTree(state, commitTree(treeA));
      state = requestPendingFocusChange(state, "b");
      state = finalizeFocusForCommittedTree(state, commitTree(treeA));
      state = requestPendingFocusChange(state, "missing");
      state = finalizeFocusForCommittedTree(state, commitTree(treeB));
      return state.focusedId;
    };

    assert.equal(run(), "c");
    assert.equal(run(), "c");
  });
});
