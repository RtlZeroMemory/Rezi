import { assert, describe, test } from "@rezi-ui/testkit";
import type { ZrevEvent } from "../../events.js";
import { charToKeyCode } from "../keyCodes.js";
import {
  CHORD_TIMEOUT_MS,
  DEFAULT_MODE,
  createManagerState,
  getMode,
  registerBindings,
  registerModes,
  routeKeyEvent,
  setMode,
} from "../manager.js";
import type { KeyContext } from "../types.js";

type TestState = { count: number };
type TestContext = KeyContext<TestState>;

function keyOf(char: string): number {
  const key = charToKeyCode(char);
  if (key === null) throw new Error(`invalid key char: ${char}`);
  return key;
}

function keyDown(key: number, timeMs: number, mods = 0): ZrevEvent {
  return { kind: "key", action: "down", key, mods, timeMs };
}

function ctx(focusedId: string | null = null): TestContext {
  return {
    state: { count: 0 },
    update: () => {},
    focusedId,
  };
}

const KEY_A = keyOf("a");
const KEY_G = keyOf("g");
const KEY_H = keyOf("h");
const KEY_I = keyOf("i");
const KEY_Q = keyOf("q");
const KEY_X = keyOf("x");
const KEY_Y = keyOf("y");
const KEY_Z = keyOf("z");

describe("keybinding modes", () => {
  test("starts in default mode and exposes it via getMode", () => {
    const state = createManagerState<TestContext>();

    assert.equal(state.currentMode, DEFAULT_MODE);
    assert.equal(getMode(state), DEFAULT_MODE);
    assert.equal(state.modes.has(DEFAULT_MODE), true);
  });

  test("matches default mode bindings without switching", () => {
    let hits = 0;
    let state = createManagerState<TestContext>();
    state = registerBindings(state, {
      a: () => {
        hits++;
      },
    }).state;

    const result = routeKeyEvent(state, keyDown(KEY_A, 1), ctx());

    assert.equal(result.consumed, true);
    assert.equal(hits, 1);
  });

  test("switches between existing modes deterministically", () => {
    let normalHits = 0;
    let insertHits = 0;
    let state = createManagerState<TestContext>();

    state = registerModes(state, {
      normal: {
        i: () => {
          normalHits++;
        },
      },
      insert: {
        i: () => {
          insertHits++;
        },
      },
    }).state;

    state = setMode(state, "normal");
    const normalResult = routeKeyEvent(state, keyDown(KEY_I, 1), ctx());

    state = setMode(state, "insert");
    const insertResult = routeKeyEvent(state, keyDown(KEY_I, 2), ctx());

    assert.equal(normalResult.consumed, true);
    assert.equal(insertResult.consumed, true);
    assert.equal(normalHits, 1);
    assert.equal(insertHits, 1);
  });

  test("switching back to default restores default bindings", () => {
    let defaultHits = 0;
    let modeHits = 0;
    let state = createManagerState<TestContext>();

    state = registerBindings(state, {
      a: () => {
        defaultHits++;
      },
    }).state;
    state = registerModes(state, {
      custom: {
        a: () => {
          modeHits++;
        },
      },
    }).state;

    state = setMode(state, "custom");
    const customResult = routeKeyEvent(state, keyDown(KEY_A, 1), ctx());
    state = setMode(customResult.nextState, DEFAULT_MODE);
    const defaultResult = routeKeyEvent(state, keyDown(KEY_A, 2), ctx());

    assert.equal(customResult.consumed, true);
    assert.equal(defaultResult.consumed, true);
    assert.equal(modeHits, 1);
    assert.equal(defaultHits, 1);
  });

  test("setting the same mode preserves object identity and pending chord", () => {
    let state = createManagerState<TestContext>();
    state = registerBindings(state, { "g g": () => {} }).state;

    const first = routeKeyEvent(state, keyDown(KEY_G, 1), ctx());
    assert.equal(first.nextState.chordState.pendingKeys.length, 1);

    const same = setMode(first.nextState, DEFAULT_MODE);
    assert.equal(same, first.nextState);
    assert.equal(same.chordState.pendingKeys.length, 1);
  });

  test("switching to an unknown mode throws a clear error", () => {
    const state = createManagerState<TestContext>();

    assert.throws(() => setMode(state, "unknown"), /unknown keybinding mode/);
  });

  test("child mode inherits bindings from parent", () => {
    let parentHits = 0;
    let state = createManagerState<TestContext>();

    state = registerBindings(state, {
      q: () => {
        parentHits++;
      },
    }).state;
    state = registerModes(state, {
      child: {
        parent: DEFAULT_MODE,
        bindings: { a: () => {} },
      },
    }).state;
    state = setMode(state, "child");

    const result = routeKeyEvent(state, keyDown(KEY_Q, 1), ctx());

    assert.equal(result.consumed, true);
    assert.equal(parentHits, 1);
  });

  test("child mode overrides same key from parent", () => {
    let parentHits = 0;
    let childHits = 0;
    let state = createManagerState<TestContext>();

    state = registerBindings(state, {
      q: () => {
        parentHits++;
      },
    }).state;
    state = registerModes(state, {
      child: {
        parent: DEFAULT_MODE,
        bindings: {
          q: () => {
            childHits++;
          },
        },
      },
    }).state;
    state = setMode(state, "child");

    const result = routeKeyEvent(state, keyDown(KEY_Q, 1), ctx());

    assert.equal(result.consumed, true);
    assert.equal(childHits, 1);
    assert.equal(parentHits, 0);
  });

  test("child when-condition failure falls back to parent", () => {
    let parentHits = 0;
    let childHits = 0;
    let state = createManagerState<TestContext>();

    state = registerBindings(state, {
      q: () => {
        parentHits++;
      },
    }).state;
    state = registerModes(state, {
      child: {
        parent: DEFAULT_MODE,
        bindings: {
          q: {
            handler: () => {
              childHits++;
            },
            when: (c) => c.focusedId === "editor",
          },
        },
      },
    }).state;
    state = setMode(state, "child");

    const noFocusResult = routeKeyEvent(state, keyDown(KEY_Q, 1), ctx());
    const focusedResult = routeKeyEvent(state, keyDown(KEY_Q, 2), ctx("editor"));

    assert.equal(noFocusResult.consumed, true);
    assert.equal(focusedResult.consumed, true);
    assert.equal(parentHits, 1);
    assert.equal(childHits, 1);
  });

  test("resolves nested parent chains across multiple levels", () => {
    let defaultHits = 0;
    let parentHits = 0;
    let childHits = 0;
    let state = createManagerState<TestContext>();

    state = registerBindings(state, {
      x: () => {
        defaultHits++;
      },
    }).state;
    state = registerModes(state, {
      parent: {
        parent: DEFAULT_MODE,
        bindings: {
          y: () => {
            parentHits++;
          },
        },
      },
      child: {
        parent: "parent",
        bindings: {
          z: () => {
            childHits++;
          },
        },
      },
    }).state;
    state = setMode(state, "child");

    const r1 = routeKeyEvent(state, keyDown(KEY_X, 1), ctx());
    const r2 = routeKeyEvent(state, keyDown(KEY_Y, 2), ctx());
    const r3 = routeKeyEvent(state, keyDown(KEY_Z, 3), ctx());

    assert.equal(r1.consumed, true);
    assert.equal(r2.consumed, true);
    assert.equal(r3.consumed, true);
    assert.equal(defaultHits, 1);
    assert.equal(parentHits, 1);
    assert.equal(childHits, 1);
  });

  test("middle ancestor override wins over deeper ancestors", () => {
    let defaultHits = 0;
    let parentHits = 0;
    let state = createManagerState<TestContext>();

    state = registerBindings(state, {
      x: () => {
        defaultHits++;
      },
    }).state;
    state = registerModes(state, {
      parent: {
        parent: DEFAULT_MODE,
        bindings: {
          x: () => {
            parentHits++;
          },
        },
      },
      child: {
        parent: "parent",
        bindings: {},
      },
    }).state;
    state = setMode(state, "child");

    const result = routeKeyEvent(state, keyDown(KEY_X, 1), ctx());

    assert.equal(result.consumed, true);
    assert.equal(parentHits, 1);
    assert.equal(defaultHits, 0);
  });

  test("mode-parent cycles are guarded and return no match", () => {
    let state = createManagerState<TestContext>();

    state = registerModes(state, {
      a: {
        parent: "b",
        bindings: {},
      },
      b: {
        parent: "a",
        bindings: {},
      },
    }).state;
    state = setMode(state, "a");

    const result = routeKeyEvent(state, keyDown(KEY_A, 1), ctx());

    assert.equal(result.consumed, false);
  });

  test("inherited parent chord can start and complete in child mode", () => {
    let parentChordHits = 0;
    let state = createManagerState<TestContext>();

    state = registerBindings(state, {
      "g g": () => {
        parentChordHits++;
      },
    }).state;
    state = registerModes(state, {
      child: {
        parent: DEFAULT_MODE,
        bindings: {},
      },
    }).state;
    state = setMode(state, "child");

    const first = routeKeyEvent(state, keyDown(KEY_G, 1), ctx());
    const second = routeKeyEvent(first.nextState, keyDown(KEY_G, 2), ctx());

    assert.equal(first.consumed, true);
    assert.equal(first.nextState.chordState.pendingKeys.length, 1);
    assert.equal(second.consumed, true);
    assert.equal(parentChordHits, 1);
    assert.equal(second.nextState.chordState.pendingKeys.length, 0);
  });

  test("mode-local chord overrides parent chord for the same sequence", () => {
    let parentChordHits = 0;
    let childChordHits = 0;
    let state = createManagerState<TestContext>();

    state = registerBindings(state, {
      "g g": () => {
        parentChordHits++;
      },
    }).state;
    state = registerModes(state, {
      child: {
        parent: DEFAULT_MODE,
        bindings: {
          "g g": () => {
            childChordHits++;
          },
        },
      },
    }).state;
    state = setMode(state, "child");

    const first = routeKeyEvent(state, keyDown(KEY_G, 1), ctx());
    const second = routeKeyEvent(first.nextState, keyDown(KEY_G, 2), ctx());

    assert.equal(second.consumed, true);
    assert.equal(childChordHits, 1);
    assert.equal(parentChordHits, 0);
  });

  test("mode-local chord prefixes shadow parent chord completion", () => {
    let parentChordHits = 0;
    let childChordHits = 0;
    let state = createManagerState<TestContext>();

    state = registerBindings(state, {
      "g g": () => {
        parentChordHits++;
      },
    }).state;
    state = registerModes(state, {
      child: {
        parent: DEFAULT_MODE,
        bindings: {
          "g h": () => {
            childChordHits++;
          },
        },
      },
    }).state;
    state = setMode(state, "child");

    const first = routeKeyEvent(state, keyDown(KEY_G, 1), ctx());
    const second = routeKeyEvent(first.nextState, keyDown(KEY_G, 2), ctx());
    const third = routeKeyEvent(second.nextState, keyDown(KEY_H, 3), ctx());

    assert.equal(first.consumed, true);
    assert.equal(second.consumed, true);
    assert.equal(second.nextState.chordState.pendingKeys.length, 1);
    assert.equal(parentChordHits, 0);
    assert.equal(third.consumed, true);
    assert.equal(childChordHits, 1);
  });

  test("mode switch resets pending chord so previous mode cannot complete", () => {
    let chordHits = 0;
    let state = createManagerState<TestContext>();

    state = registerBindings(state, {
      "g g": () => {
        chordHits++;
      },
    }).state;
    state = registerModes(state, { other: {} }).state;

    const first = routeKeyEvent(state, keyDown(KEY_G, 1), ctx());
    assert.equal(first.nextState.chordState.pendingKeys.length, 1);

    const switched = setMode(first.nextState, "other");
    assert.equal(switched.chordState.pendingKeys.length, 0);

    const second = routeKeyEvent(switched, keyDown(KEY_G, 2), ctx());
    assert.equal(second.consumed, false);
    assert.equal(chordHits, 0);
  });

  test("mode switching restarts chord timing from the new mode", () => {
    let otherChordHits = 0;
    let state = createManagerState<TestContext>();

    state = registerBindings(state, { "g g": () => {} }).state;
    state = registerModes(state, {
      other: {
        bindings: {
          "x x": () => {
            otherChordHits++;
          },
        },
      },
    }).state;

    const first = routeKeyEvent(state, keyDown(KEY_G, 100), ctx());
    const switched = setMode(first.nextState, "other");

    const second = routeKeyEvent(switched, keyDown(KEY_X, 5_000), ctx());
    assert.equal(second.consumed, true);
    assert.equal(second.nextState.chordState.startTimeMs, 5_000);

    // Timeout in the new mode should restart the chord instead of matching.
    const timedOut = routeKeyEvent(
      second.nextState,
      keyDown(KEY_X, 5_000 + CHORD_TIMEOUT_MS + 1),
      ctx(),
    );
    assert.equal(timedOut.consumed, true);
    assert.equal(timedOut.nextState.chordState.pendingKeys.length, 1);
    assert.equal(otherChordHits, 0);

    const completed = routeKeyEvent(
      timedOut.nextState,
      keyDown(KEY_X, 5_000 + CHORD_TIMEOUT_MS + 2),
      ctx(),
    );
    assert.equal(completed.consumed, true);
    assert.equal(otherChordHits, 1);
  });
});
