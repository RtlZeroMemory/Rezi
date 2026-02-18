import { assert, describe, test } from "@rezi-ui/testkit";
import type { ZrevEvent } from "../../events.js";
import {
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

function makeKeyDownEvent(key: number, mods: number, timeMs = 0): ZrevEvent {
  return { kind: "key", timeMs, key, mods, action: "down" };
}

function makeContext(state: TestState = { count: 0 }): TestContext {
  return {
    state,
    update: () => {},
    focusedId: null,
  };
}

describe("createManagerState", () => {
  test("creates initial state with default mode", () => {
    const state = createManagerState<TestContext>();

    assert.equal(state.currentMode, DEFAULT_MODE);
    assert.equal(state.chordState.pendingKeys.length, 0);
    assert.equal(state.modes.has(DEFAULT_MODE), true);
  });
});

describe("registerBindings", () => {
  test("registers binding in default mode", () => {
    let called = false;
    const state = createManagerState<TestContext>();

    const result = registerBindings(state, {
      "ctrl+s": () => {
        called = true;
      },
    });

    const mode = result.state.modes.get(DEFAULT_MODE);
    assert.ok(mode);
    if (!mode) return;

    assert.equal(mode.bindings.length, 1);
    assert.equal(result.invalidKeys.length, 0);
  });

  test("registers multiple bindings", () => {
    const state = createManagerState<TestContext>();

    const result = registerBindings(state, {
      a: () => {},
      b: () => {},
      "ctrl+s": () => {},
    });

    const mode = result.state.modes.get(DEFAULT_MODE);
    assert.ok(mode);
    if (!mode) return;

    assert.equal(mode.bindings.length, 3);
  });

  test("registers in specified mode", () => {
    const state = createManagerState<TestContext>();

    const result = registerBindings(state, { a: () => {} }, { mode: "custom" });

    assert.equal(result.state.modes.has("custom"), true);
    const mode = result.state.modes.get("custom");
    assert.ok(mode);
    if (!mode) return;

    assert.equal(mode.bindings.length, 1);
  });

  test("merges bindings with existing mode", () => {
    let state = createManagerState<TestContext>();

    state = registerBindings(state, { a: () => {} }).state;
    state = registerBindings(state, { b: () => {} }).state;

    const mode = state.modes.get(DEFAULT_MODE);
    assert.ok(mode);
    if (!mode) return;

    assert.equal(mode.bindings.length, 2);
  });

  test("supports priority and when options", () => {
    const state = createManagerState<TestContext>();

    const result = registerBindings(state, {
      a: {
        handler: () => {},
        priority: 10,
        when: (ctx) => ctx.focusedId !== null,
      },
    });

    const mode = result.state.modes.get(DEFAULT_MODE);
    assert.ok(mode);
    if (!mode) return;

    const binding = mode.bindings[0];
    assert.ok(binding);
    if (!binding) return;

    assert.equal(binding.priority, 10);
    assert.ok(binding.when);
  });

  test("returns invalid keys without throwing", () => {
    const state = createManagerState<TestContext>();

    const result = registerBindings(state, {
      a: () => {},
      "invalid+++key": () => {},
      b: () => {},
    });

    // Valid bindings should still be registered
    const mode = result.state.modes.get(DEFAULT_MODE);
    assert.ok(mode);
    if (!mode) return;
    assert.equal(mode.bindings.length, 2);

    // Invalid key should be reported
    assert.equal(result.invalidKeys.length, 1);
    const inv = result.invalidKeys[0];
    assert.ok(inv);
    if (!inv) return;
    assert.equal(inv.key, "invalid+++key");
  });
});

describe("registerModes", () => {
  test("registers multiple modes", () => {
    const state = createManagerState<TestContext>();

    const result = registerModes(state, {
      normal: {
        i: () => {},
        j: () => {},
      },
      insert: {
        escape: () => {},
      },
    });

    assert.equal(result.state.modes.has("normal"), true);
    assert.equal(result.state.modes.has("insert"), true);
    assert.equal(result.invalidKeys.length, 0);

    const normal = result.state.modes.get("normal");
    const insert = result.state.modes.get("insert");
    assert.ok(normal);
    assert.ok(insert);
    if (!normal || !insert) return;

    assert.equal(normal.bindings.length, 2);
    assert.equal(insert.bindings.length, 1);
  });

  test("supports parent mode", () => {
    const state = createManagerState<TestContext>();

    const result = registerModes(state, {
      child: {
        parent: DEFAULT_MODE,
        bindings: { a: () => {} },
      },
    });

    const child = result.state.modes.get("child");
    assert.ok(child);
    if (!child) return;

    assert.equal(child.parent, DEFAULT_MODE);
  });

  test("collects invalid keys from all modes", () => {
    const state = createManagerState<TestContext>();

    const result = registerModes(state, {
      mode1: {
        a: () => {},
        "bad++key1": () => {},
      },
      mode2: {
        b: () => {},
        "bad++key2": () => {},
      },
    });

    // Both valid bindings should be registered
    const mode1 = result.state.modes.get("mode1");
    const mode2 = result.state.modes.get("mode2");
    assert.ok(mode1);
    assert.ok(mode2);
    if (!mode1 || !mode2) return;
    assert.equal(mode1.bindings.length, 1);
    assert.equal(mode2.bindings.length, 1);

    // Both invalid keys should be reported
    assert.equal(result.invalidKeys.length, 2);
  });
});

describe("setMode", () => {
  test("switches to existing mode", () => {
    let state = createManagerState<TestContext>();
    state = registerModes(state, { custom: { a: () => {} } }).state;

    state = setMode(state, "custom");

    assert.equal(state.currentMode, "custom");
  });

  test("throws for unknown mode", () => {
    const state = createManagerState<TestContext>();

    assert.throws(() => setMode(state, "newmode"));
  });

  test("resets chord state when switching", () => {
    let state = createManagerState<TestContext>();

    // Register a chord binding
    state = registerBindings(state, { "g g": () => {} }).state;

    // Start the chord
    const event = makeKeyDownEvent(71, 0); // 'G'
    const result = routeKeyEvent(state, event, makeContext());
    state = result.nextState;

    // Should have pending keys
    assert.equal(state.chordState.pendingKeys.length, 1);

    state = registerModes(state, { other: { a: () => {} } }).state;

    // Switch mode
    state = setMode(state, "other");

    // Chord should be reset
    assert.equal(state.chordState.pendingKeys.length, 0);
  });

  test("does nothing if already in mode", () => {
    let state = createManagerState<TestContext>();
    const original = state;

    state = setMode(state, DEFAULT_MODE);

    assert.equal(state, original);
  });
});

describe("getMode", () => {
  test("returns current mode", () => {
    let state = createManagerState<TestContext>();
    assert.equal(getMode(state), DEFAULT_MODE);

    state = registerModes(state, { custom: { a: () => {} } }).state;
    state = setMode(state, "custom");
    assert.equal(getMode(state), "custom");
  });
});

describe("routeKeyEvent", () => {
  test("ignores non-key events", () => {
    const state = createManagerState<TestContext>();
    const event: ZrevEvent = { kind: "tick", timeMs: 0, dtMs: 16 };

    const result = routeKeyEvent(state, event, makeContext());

    assert.equal(result.consumed, false);
    assert.equal(result.nextState, state);
  });

  test("ignores key up events", () => {
    const state = createManagerState<TestContext>();
    const event: ZrevEvent = { kind: "key", timeMs: 0, key: 65, mods: 0, action: "up" };

    const result = routeKeyEvent(state, event, makeContext());

    assert.equal(result.consumed, false);
  });

  test("matches and executes binding", () => {
    let called = false;
    let state = createManagerState<TestContext>();

    state = registerBindings(state, {
      a: () => {
        called = true;
      },
    }).state;

    const event = makeKeyDownEvent(65, 0); // 'A'
    const result = routeKeyEvent(state, event, makeContext());

    assert.equal(result.consumed, true);
    assert.equal(called, true);
  });

  test("passes context to handler", () => {
    let receivedState: TestState | null = null;
    let state = createManagerState<TestContext>();

    state = registerBindings(state, {
      a: (ctx) => {
        receivedState = ctx.state;
      },
    }).state;

    const event = makeKeyDownEvent(65, 0);
    routeKeyEvent(state, event, makeContext({ count: 42 }));

    assert.ok(receivedState);
    assert.equal((receivedState as TestState).count, 42);
  });

  test("consumes pending chord keys", () => {
    let state = createManagerState<TestContext>();

    state = registerBindings(state, { "g g": () => {} }).state;

    const event = makeKeyDownEvent(71, 0); // 'G'
    const result = routeKeyEvent(state, event, makeContext());

    assert.equal(result.consumed, true);
    assert.equal(result.nextState.chordState.pendingKeys.length, 1);
  });

  test("returns consumed=false for unbound key", () => {
    const state = createManagerState<TestContext>();

    const event = makeKeyDownEvent(65, 0);
    const result = routeKeyEvent(state, event, makeContext());

    assert.equal(result.consumed, false);
  });

  test("checks when condition", () => {
    let called = false;
    let state = createManagerState<TestContext>();

    state = registerBindings(state, {
      a: {
        handler: () => {
          called = true;
        },
        when: (ctx) => ctx.focusedId !== null,
      },
    }).state;

    // Without focus - should not match
    const event = makeKeyDownEvent(65, 0);
    const result1 = routeKeyEvent(state, event, {
      state: { count: 0 },
      update: () => {},
      focusedId: null,
    });

    assert.equal(result1.consumed, false);
    assert.equal(called, false);

    // With focus - should match
    const result2 = routeKeyEvent(state, event, {
      state: { count: 0 },
      update: () => {},
      focusedId: "button1",
    });

    assert.equal(result2.consumed, true);
    assert.equal(called, true);
  });

  test("mode-specific bindings only match in correct mode", () => {
    let normalCalled = false;
    let insertCalled = false;
    let state = createManagerState<TestContext>();

    state = registerModes(state, {
      normal: {
        i: () => {
          normalCalled = true;
        },
      },
      insert: {
        i: () => {
          insertCalled = true;
        },
      },
    }).state;

    state = setMode(state, "normal");
    const event = makeKeyDownEvent(73, 0); // 'I'

    const result = routeKeyEvent(state, event, makeContext());

    assert.equal(result.consumed, true);
    assert.equal(normalCalled, true);
    assert.equal(insertCalled, false);
  });

  test("falls back to parent mode", () => {
    let parentCalled = false;
    let state = createManagerState<TestContext>();

    state = registerBindings(state, {
      q: () => {
        parentCalled = true;
      },
    }).state;

    state = registerModes(state, {
      child: {
        parent: DEFAULT_MODE,
        bindings: {
          a: () => {},
        },
      },
    }).state;

    state = setMode(state, "child");

    // 'q' is not in child but is in parent (default)
    const event = makeKeyDownEvent(81, 0); // 'Q'
    const result = routeKeyEvent(state, event, makeContext());

    assert.equal(result.consumed, true);
    assert.equal(parentCalled, true);
  });

  test("returns handlerError when handler throws", () => {
    let state = createManagerState<TestContext>();

    state = registerBindings(state, {
      a: () => {
        throw new Error("Handler error");
      },
    }).state;

    const event = makeKeyDownEvent(65, 0);

    // Should not throw, but return handlerError
    const result = routeKeyEvent(state, event, makeContext());

    assert.equal(result.consumed, true);
    assert.ok(result.handlerError);
    assert.ok(result.handlerError instanceof Error);
    assert.equal((result.handlerError as Error).message, "Handler error");
  });

  test("processes modifiers correctly", () => {
    let called = false;
    let state = createManagerState<TestContext>();

    state = registerBindings(state, {
      "ctrl+s": () => {
        called = true;
      },
    }).state;

    // ctrl+s (mods=2 is ctrl)
    const event = makeKeyDownEvent(83, 2);
    const result = routeKeyEvent(state, event, makeContext());

    assert.equal(result.consumed, true);
    assert.equal(called, true);
  });
});
