import { assert, describe, test } from "@rezi-ui/testkit";
import type { VNode } from "../../index.js";
import { commitVNodeTree } from "../commit.js";
import {
  computeZoneTraversal,
  finalizeFocusForCommittedTree,
  finalizeFocusForCommittedTreeWithZones,
  requestPendingFocusChange,
} from "../focus.js";
import type { FocusManagerState, FocusState, FocusZone } from "../focus.js";
import { createInstanceIdAllocator } from "../instance.js";
import type { CollectedTrap } from "../widgetMeta.js";

function commitTree(vnode: VNode) {
  const allocator = createInstanceIdAllocator(1);
  const res = commitVNodeTree(null, vnode, { allocator });
  if (!res.ok) {
    assert.fail(`commit failed: ${res.fatal.code}: ${res.fatal.detail}`);
  }
  return res.value.root;
}

function button(id: string): VNode {
  return { kind: "button", props: { id, label: id } };
}

function text(value: string): VNode {
  return { kind: "text", text: value, props: {} };
}

function spacer(): VNode {
  return { kind: "spacer", props: {} };
}

function column(children: readonly VNode[]): VNode {
  return { kind: "column", props: {}, children };
}

function zone(id: string, children: readonly VNode[], tabIndex = 0): VNode {
  return { kind: "focusZone", props: { id, tabIndex }, children };
}

function trap(
  id: string,
  children: readonly VNode[],
  options: Readonly<{
    active?: boolean;
    initialFocus?: string;
    returnFocusTo?: string;
  }> = {},
): VNode {
  return {
    kind: "focusTrap",
    props: {
      id,
      active: options.active ?? false,
      ...(options.initialFocus === undefined ? {} : { initialFocus: options.initialFocus }),
      ...(options.returnFocusTo === undefined ? {} : { returnFocusTo: options.returnFocusTo }),
    },
    children,
  };
}

function focusState(focusedId: string | null, pendingFocusedId?: string | null): FocusState {
  if (pendingFocusedId === undefined) {
    return Object.freeze({ focusedId });
  }
  return Object.freeze({ focusedId, pendingFocusedId });
}

function focusManagerState(
  options: Readonly<{
    focusedId: string | null;
    activeZoneId?: string | null;
    pendingFocusedId?: string | null;
    trapStack?: readonly string[];
    lastFocusedByZone?: ReadonlyMap<string, string>;
  }>,
): FocusManagerState {
  const base = {
    focusedId: options.focusedId,
    activeZoneId: options.activeZoneId ?? null,
    zones: new Map<string, FocusZone>(),
    trapStack: Object.freeze([...(options.trapStack ?? [])]),
    lastFocusedByZone: new Map<string, string>(options.lastFocusedByZone),
  };
  if (options.pendingFocusedId === undefined) {
    return Object.freeze(base);
  }
  return Object.freeze({ ...base, pendingFocusedId: options.pendingFocusedId });
}

describe("focus persistence - finalizeFocusForCommittedTree", () => {
  test("focused widget persists across rerender", () => {
    const renderA = column([button("a"), button("target"), button("c")]);
    const renderB = column([button("a"), button("target"), button("c")]);

    let state = focusState("target");
    state = finalizeFocusForCommittedTree(state, commitTree(renderA));
    state = finalizeFocusForCommittedTree(state, commitTree(renderB));

    assert.equal(state.focusedId, "target");
  });

  test("focused widget removed falls back to first focusable", () => {
    const nextTree = column([button("first"), button("other")]);
    const nextState = finalizeFocusForCommittedTree(focusState("target"), commitTree(nextTree));
    assert.equal(nextState.focusedId, "first");
  });

  test("focused widget moved in tree keeps focus by id", () => {
    const renderA = column([button("a"), button("target"), button("b")]);
    const renderB = column([button("b"), button("a"), button("target")]);

    let state = focusState("target");
    state = finalizeFocusForCommittedTree(state, commitTree(renderA));
    state = finalizeFocusForCommittedTree(state, commitTree(renderB));

    assert.equal(state.focusedId, "target");
  });

  test("same id recreated can be restored via pending focus", () => {
    const withoutTarget = column([button("alpha"), button("beta")]);
    const withRecreatedTarget = column([button("alpha"), button("target"), button("beta")]);

    const afterRemoval = finalizeFocusForCommittedTree(
      focusState("target"),
      commitTree(withoutTarget),
    );
    assert.equal(afterRemoval.focusedId, "alpha");

    const withPending = requestPendingFocusChange(afterRemoval, "target");
    const restored = finalizeFocusForCommittedTree(withPending, commitTree(withRecreatedTarget));
    assert.equal(restored.focusedId, "target");
  });

  test("pending focus to existing id is applied on finalize", () => {
    const tree = column([button("a"), button("b"), button("c")]);
    const pending = requestPendingFocusChange(focusState("a"), "c");
    const nextState = finalizeFocusForCommittedTree(pending, commitTree(tree));
    assert.equal(nextState.focusedId, "c");
  });

  test("pending focus to missing id falls back to first focusable", () => {
    const tree = column([button("a"), button("b"), button("c")]);
    const pending = requestPendingFocusChange(focusState("b"), "missing");
    const nextState = finalizeFocusForCommittedTree(pending, commitTree(tree));
    assert.equal(nextState.focusedId, "a");
  });

  test("pending focus null clears focus deterministically", () => {
    const tree = column([button("a"), button("b")]);
    const pending = requestPendingFocusChange(focusState("a"), null);
    const nextState = finalizeFocusForCommittedTree(pending, commitTree(tree));
    assert.equal(nextState.focusedId, null);
  });

  test("no focusables clears stale focused id", () => {
    const noFocusableTree = column([text("static"), spacer()]);
    const nextState = finalizeFocusForCommittedTree(
      focusState("stale"),
      commitTree(noFocusableTree),
    );
    assert.equal(nextState.focusedId, null);
  });
});

describe("focus persistence - zones and traps", () => {
  test("zone-aware finalize keeps focused id when widget order changes", () => {
    const renderA = column([
      zone("zone-a", [button("a"), button("target")], 0),
      zone("zone-b", [button("other")], 1),
    ]);
    const renderB = column([
      zone("zone-a", [button("target"), button("a")], 0),
      zone("zone-b", [button("other")], 1),
    ]);

    let state = focusManagerState({
      focusedId: "target",
      activeZoneId: "zone-a",
      lastFocusedByZone: new Map([["zone-a", "target"]]),
    });
    state = finalizeFocusForCommittedTreeWithZones(state, commitTree(renderA));
    state = finalizeFocusForCommittedTreeWithZones(state, commitTree(renderB));

    assert.equal(state.focusedId, "target");
    assert.equal(state.activeZoneId, "zone-a");
    assert.equal(state.lastFocusedByZone.get("zone-a"), "target");
    assert.equal(state.zones.get("zone-a")?.lastFocusedId, "target");
  });

  test("zone-aware finalize applies pending missing id then falls back to first focusable", () => {
    const tree = column([zone("zone-a", [button("a-1")], 0), zone("zone-b", [button("b-1")], 1)]);

    const state = focusManagerState({
      focusedId: "b-1",
      activeZoneId: "zone-b",
      pendingFocusedId: "missing",
      lastFocusedByZone: new Map([["zone-b", "b-1"]]),
    });
    const nextState = finalizeFocusForCommittedTreeWithZones(state, commitTree(tree));

    assert.equal(nextState.focusedId, "a-1");
    assert.equal(nextState.activeZoneId, "zone-a");
    assert.equal(nextState.lastFocusedByZone.get("zone-a"), "a-1");
    assert.equal(nextState.lastFocusedByZone.get("zone-b"), "b-1");
  });

  test("zone traversal ties on tabIndex are deterministic by traversal order", () => {
    const zones = new Map<string, FocusZone>([
      [
        "zone-b",
        {
          id: "zone-b",
          tabIndex: 0,
          navigation: "linear",
          columns: 1,
          wrapAround: true,
          focusableIds: ["b-1"],
          lastFocusedId: null,
        },
      ],
      [
        "zone-a",
        {
          id: "zone-a",
          tabIndex: 0,
          navigation: "linear",
          columns: 1,
          wrapAround: true,
          focusableIds: ["a-1"],
          lastFocusedId: null,
        },
      ],
    ]);

    const next = computeZoneTraversal(
      zones,
      null,
      "next",
      Object.freeze([]),
      new Map<string, CollectedTrap>(),
    );
    const prev = computeZoneTraversal(
      zones,
      null,
      "prev",
      Object.freeze([]),
      new Map<string, CollectedTrap>(),
    );

    assert.equal(next.nextZoneId, "zone-b");
    assert.equal(next.nextFocusedId, "b-1");
    assert.equal(prev.nextZoneId, "zone-a");
    assert.equal(prev.nextFocusedId, "a-1");
  });

  test("trap activation uses initialFocus when valid", () => {
    const tree = column([
      button("outside"),
      trap("modal", [button("confirm"), button("cancel")], {
        active: true,
        initialFocus: "cancel",
      }),
    ]);

    const state = focusManagerState({ focusedId: "outside" });
    const nextState = finalizeFocusForCommittedTreeWithZones(state, commitTree(tree));

    assert.equal(nextState.focusedId, "cancel");
    assert.deepEqual(nextState.trapStack, ["modal"]);
  });

  test("trap activation falls back to first trap focusable when initialFocus is missing", () => {
    const tree = column([
      button("outside"),
      trap("modal", [button("confirm"), button("cancel")], {
        active: true,
        initialFocus: "missing",
      }),
    ]);

    const state = focusManagerState({ focusedId: "outside" });
    const nextState = finalizeFocusForCommittedTreeWithZones(state, commitTree(tree));

    assert.equal(nextState.focusedId, "confirm");
    assert.deepEqual(nextState.trapStack, ["modal"]);
  });

  test("newly activated trap override takes priority over pending outside focus", () => {
    const tree = column([
      button("outside"),
      trap("modal", [button("confirm"), button("cancel")], {
        active: true,
        initialFocus: "cancel",
      }),
    ]);

    const state = focusManagerState({
      focusedId: "outside",
      pendingFocusedId: "outside",
    });
    const nextState = finalizeFocusForCommittedTreeWithZones(state, commitTree(tree));

    assert.equal(nextState.focusedId, "cancel");
    assert.deepEqual(nextState.trapStack, ["modal"]);
  });
});
