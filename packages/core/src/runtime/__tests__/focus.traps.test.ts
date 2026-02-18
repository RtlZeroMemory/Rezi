import { assert, describe, test } from "@rezi-ui/testkit";
import type { VNode } from "../../index.js";
import { ZR_KEY_TAB, ZR_MOD_SHIFT } from "../../keybindings/keyCodes.js";
import { commitVNodeTree } from "../commit.js";
import {
  type FocusManagerState,
  type FocusZone,
  createFocusManagerState,
  finalizeFocusForCommittedTreeWithZones,
  finalizeFocusWithPreCollectedMetadata,
} from "../focus.js";
import { createInstanceIdAllocator } from "../instance.js";
import { routeKeyWithZones } from "../router.js";
import type { KeyRoutingCtxWithZones } from "../router.js";
import type { CollectedTrap, CollectedZone } from "../widgetMeta.js";

function commitTree(vnode: VNode) {
  const allocator = createInstanceIdAllocator(1);
  const res = commitVNodeTree(null, vnode, { allocator });
  if (!res.ok) {
    assert.fail(`commit failed: ${res.fatal.code}: ${res.fatal.detail}`);
  }
  return res.value.root;
}

function keyEvent(key: number, mods = 0) {
  return { kind: "key" as const, action: "down" as const, key, mods, timeMs: 0 };
}

function managerState(overrides: Partial<FocusManagerState> = {}): FocusManagerState {
  return Object.freeze({
    focusedId: null,
    activeZoneId: null,
    zones: new Map<string, FocusZone>(),
    trapStack: Object.freeze([]),
    lastFocusedByZone: new Map<string, string>(),
    ...overrides,
  });
}

function trap(args: {
  id: string;
  active: boolean;
  focusableIds: readonly string[];
  initialFocus?: string | null;
  returnFocusTo?: string | null;
}): CollectedTrap {
  return {
    id: args.id,
    active: args.active,
    returnFocusTo: args.returnFocusTo ?? null,
    initialFocus: args.initialFocus ?? null,
    focusableIds: args.focusableIds,
  };
}

function finalizeWith(
  state: FocusManagerState,
  focusList: readonly string[],
  traps: ReadonlyMap<string, CollectedTrap>,
  zones: ReadonlyMap<string, CollectedZone> = new Map<string, CollectedZone>(),
): FocusManagerState {
  return finalizeFocusWithPreCollectedMetadata(state, focusList, zones, traps);
}

function routingCtx(overrides: Partial<KeyRoutingCtxWithZones>): KeyRoutingCtxWithZones {
  const enabledById = new Map<string, boolean>();
  for (const id of overrides.focusList ?? []) {
    enabledById.set(id, true);
  }

  return {
    focusedId: null,
    activeZoneId: null,
    focusList: [],
    zones: new Map<string, FocusZone>(),
    lastFocusedByZone: new Map<string, string>(),
    traps: new Map<string, CollectedTrap>(),
    trapStack: [],
    enabledById,
    ...overrides,
  };
}

describe("focus traps - finalizeFocusWithPreCollectedMetadata", () => {
  test("adds newly active traps to trapStack", () => {
    const next = finalizeWith(
      managerState(),
      ["inside"],
      new Map<string, CollectedTrap>([
        ["modal", trap({ id: "modal", active: true, focusableIds: ["inside"] })],
      ]),
    );

    assert.deepEqual(next.trapStack, ["modal"]);
  });

  test("does not add inactive traps to trapStack", () => {
    const next = finalizeWith(
      managerState(),
      ["inside"],
      new Map<string, CollectedTrap>([
        ["modal", trap({ id: "modal", active: false, focusableIds: ["inside"] })],
      ]),
    );

    assert.deepEqual(next.trapStack, []);
  });

  test("uses valid trap initialFocus when it belongs to the trap", () => {
    const next = finalizeWith(
      managerState({ focusedId: "outside" }),
      ["outside", "first", "second"],
      new Map<string, CollectedTrap>([
        [
          "modal",
          trap({
            id: "modal",
            active: true,
            initialFocus: "second",
            focusableIds: ["first", "second"],
          }),
        ],
      ]),
    );

    assert.equal(next.focusedId, "second");
  });

  test("invalid initialFocus outside trap falls back to first trap focusable", () => {
    const next = finalizeWith(
      managerState({ focusedId: "outside" }),
      ["outside", "first", "second"],
      new Map<string, CollectedTrap>([
        [
          "modal",
          trap({
            id: "modal",
            active: true,
            initialFocus: "outside",
            focusableIds: ["first", "second"],
          }),
        ],
      ]),
    );

    assert.equal(next.focusedId, "first");
  });

  test("missing initialFocus falls back to first trap focusable", () => {
    const next = finalizeWith(
      managerState({ focusedId: "outside" }),
      ["outside", "first", "second"],
      new Map<string, CollectedTrap>([
        ["modal", trap({ id: "modal", active: true, focusableIds: ["first", "second"] })],
      ]),
    );

    assert.equal(next.focusedId, "first");
  });

  test("empty trap focusables do not force focus changes", () => {
    const next = finalizeWith(
      managerState({ focusedId: "outside" }),
      ["outside"],
      new Map<string, CollectedTrap>([
        ["modal", trap({ id: "modal", active: true, focusableIds: [] })],
      ]),
    );

    assert.equal(next.focusedId, "outside");
  });

  test("empty trap focusables still honor valid initialFocus", () => {
    const next = finalizeWith(
      managerState({ focusedId: "outside" }),
      ["outside", "nested-id"],
      new Map<string, CollectedTrap>([
        [
          "modal",
          trap({
            id: "modal",
            active: true,
            initialFocus: "nested-id",
            focusableIds: [],
          }),
        ],
      ]),
    );

    assert.equal(next.focusedId, "nested-id");
  });

  test("deactivation restores returnFocusTo when valid", () => {
    const prev = managerState({ focusedId: "inside", trapStack: Object.freeze(["modal"]) });

    const next = finalizeWith(
      prev,
      ["inside", "trigger"],
      new Map<string, CollectedTrap>([
        [
          "modal",
          trap({
            id: "modal",
            active: false,
            returnFocusTo: "trigger",
            focusableIds: ["inside"],
          }),
        ],
      ]),
    );

    assert.deepEqual(next.trapStack, []);
    assert.equal(next.focusedId, "trigger");
  });

  test("deactivation ignores invalid returnFocusTo", () => {
    const prev = managerState({ focusedId: "inside", trapStack: Object.freeze(["modal"]) });

    const next = finalizeWith(
      prev,
      ["inside", "other"],
      new Map<string, CollectedTrap>([
        [
          "modal",
          trap({
            id: "modal",
            active: false,
            returnFocusTo: "missing",
            focusableIds: ["inside"],
          }),
        ],
      ]),
    );

    assert.equal(next.focusedId, "inside");
  });

  test("filters stale trap ids out of trapStack", () => {
    const prev = managerState({ trapStack: Object.freeze(["stale", "keep"]) });

    const next = finalizeWith(
      prev,
      ["inside"],
      new Map<string, CollectedTrap>([
        ["keep", trap({ id: "keep", active: true, focusableIds: ["inside"] })],
      ]),
    );

    assert.deepEqual(next.trapStack, ["keep"]);
  });

  test("keeps existing active trap order and appends newly active traps", () => {
    const prev = managerState({ trapStack: Object.freeze(["keep"]) });

    const traps = new Map<string, CollectedTrap>([
      ["new-a", trap({ id: "new-a", active: true, focusableIds: ["a"] })],
      ["keep", trap({ id: "keep", active: true, focusableIds: ["k"] })],
      ["new-b", trap({ id: "new-b", active: true, focusableIds: ["b"] })],
    ]);

    const next = finalizeWith(prev, ["k", "a", "b"], traps);
    assert.deepEqual(next.trapStack, ["keep", "new-a", "new-b"]);
  });

  test("tracks nested active traps in deterministic order", () => {
    const next = finalizeWith(
      managerState(),
      ["outer", "inner"],
      new Map<string, CollectedTrap>([
        ["outer", trap({ id: "outer", active: true, focusableIds: ["outer"] })],
        ["inner", trap({ id: "inner", active: true, focusableIds: ["inner"] })],
      ]),
    );

    assert.deepEqual(next.trapStack, ["outer", "inner"]);
  });
});

describe("focus traps - routeKeyWithZones", () => {
  test("TAB wraps within innermost active trap", () => {
    const traps = new Map<string, CollectedTrap>([
      ["outer", trap({ id: "outer", active: true, focusableIds: ["o1", "o2"] })],
      ["inner", trap({ id: "inner", active: true, focusableIds: ["i1", "i2"] })],
    ]);

    const res = routeKeyWithZones(
      keyEvent(ZR_KEY_TAB),
      routingCtx({
        focusedId: "i2",
        focusList: ["o1", "o2", "i1", "i2", "after"],
        traps,
        trapStack: ["outer", "inner"],
      }),
    );

    assert.equal(res.nextFocusedId, "i1");
  });

  test("Shift+TAB wraps backward within active trap", () => {
    const traps = new Map<string, CollectedTrap>([
      ["modal", trap({ id: "modal", active: true, focusableIds: ["i1", "i2"] })],
    ]);

    const res = routeKeyWithZones(
      keyEvent(ZR_KEY_TAB, ZR_MOD_SHIFT),
      routingCtx({
        focusedId: "i1",
        focusList: ["before", "i1", "i2", "after"],
        traps,
        trapStack: ["modal"],
      }),
    );

    assert.equal(res.nextFocusedId, "i2");
  });

  test("inactive trap does not constrain TAB traversal", () => {
    const traps = new Map<string, CollectedTrap>([
      ["modal", trap({ id: "modal", active: false, focusableIds: ["i1", "i2"] })],
    ]);

    const res = routeKeyWithZones(
      keyEvent(ZR_KEY_TAB),
      routingCtx({
        focusedId: "before",
        focusList: ["before", "after"],
        traps,
        trapStack: ["modal"],
      }),
    );

    assert.equal(res.nextFocusedId, "after");
  });

  test("active trap with empty focusables leaves focus unchanged", () => {
    const traps = new Map<string, CollectedTrap>([
      ["modal", trap({ id: "modal", active: true, focusableIds: [] })],
    ]);

    const res = routeKeyWithZones(
      keyEvent(ZR_KEY_TAB),
      routingCtx({
        focusedId: "before",
        focusList: ["before", "after"],
        traps,
        trapStack: ["modal"],
      }),
    );

    assert.equal(res.nextFocusedId, undefined);
  });
});

describe("focus traps - finalizeFocusForCommittedTreeWithZones integration", () => {
  test("invalid initialFocus outside trap falls back to first trap focusable", () => {
    const tree: VNode = {
      kind: "column",
      props: {},
      children: [
        { kind: "button", props: { id: "outside", label: "Outside" } },
        {
          kind: "focusTrap",
          props: { id: "modal", active: true, initialFocus: "outside" },
          children: [
            { kind: "button", props: { id: "in-1", label: "One" } },
            { kind: "button", props: { id: "in-2", label: "Two" } },
          ],
        },
      ],
    };

    const next = finalizeFocusForCommittedTreeWithZones(
      createFocusManagerState(),
      commitTree(tree),
    );
    assert.equal(next.focusedId, "in-1");
    assert.deepEqual(next.trapStack, ["modal"]);
  });

  test("empty trap focusables can still focus a valid nested initialFocus id", () => {
    const tree: VNode = {
      kind: "column",
      props: {},
      children: [
        { kind: "button", props: { id: "outside", label: "Outside" } },
        {
          kind: "focusTrap",
          props: { id: "modal", active: true, initialFocus: "nested-id" },
          children: [
            {
              kind: "focusZone",
              props: { id: "nested-zone", navigation: "linear" },
              children: [{ kind: "button", props: { id: "nested-id", label: "Nested" } }],
            },
          ],
        },
      ],
    };

    const next = finalizeFocusForCommittedTreeWithZones(
      createFocusManagerState(),
      commitTree(tree),
    );
    assert.equal(next.focusedId, "nested-id");
    assert.deepEqual(next.trapStack, ["modal"]);
  });

  test("inactive trap does not capture focus", () => {
    const tree: VNode = {
      kind: "column",
      props: {},
      children: [
        { kind: "button", props: { id: "outside", label: "Outside" } },
        {
          kind: "focusTrap",
          props: { id: "modal", active: false, initialFocus: "in-1" },
          children: [{ kind: "button", props: { id: "in-1", label: "One" } }],
        },
      ],
    };

    const prev = managerState({ focusedId: "outside" });
    const next = finalizeFocusForCommittedTreeWithZones(prev, commitTree(tree));
    assert.equal(next.focusedId, "outside");
    assert.deepEqual(next.trapStack, []);
  });

  test("active empty trap keeps current focus when no trap focusables exist", () => {
    const tree: VNode = {
      kind: "column",
      props: {},
      children: [
        { kind: "button", props: { id: "outside", label: "Outside" } },
        {
          kind: "focusTrap",
          props: { id: "modal", active: true, initialFocus: "missing" },
          children: [{ kind: "text", text: "no controls", props: {} }],
        },
      ],
    };

    const prev = managerState({ focusedId: "outside" });
    const next = finalizeFocusForCommittedTreeWithZones(prev, commitTree(tree));
    assert.equal(next.focusedId, "outside");
    assert.deepEqual(next.trapStack, ["modal"]);
  });
});
