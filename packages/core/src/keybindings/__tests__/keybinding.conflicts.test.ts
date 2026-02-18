import { assert, describe, test } from "@rezi-ui/testkit";
import {
  encodeZrevBatchV1,
  flushMicrotasks,
  makeBackendBatch,
} from "../../app/__tests__/helpers.js";
import { StubBackend } from "../../app/__tests__/stubBackend.js";
import { createApp } from "../../app/createApp.js";
import type { ZrevEvent } from "../../events.js";
import { ui } from "../../index.js";
import { routeKey } from "../../runtime/router/key.js";
import { routeLayerEscape } from "../../runtime/router/layer.js";
import type { KeyRoutingCtx } from "../../runtime/router/types.js";
import { ZR_KEY_ENTER, ZR_KEY_ESCAPE, charToKeyCode } from "../keyCodes.js";
import {
  DEFAULT_MODE,
  createManagerState,
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

function keyEvent(
  key: number,
  timeMs: number,
  action: "down" | "up" | "repeat" = "down",
  mods = 0,
): ZrevEvent {
  return { kind: "key", key, mods, timeMs, action };
}

function ctx(focusedId: string | null = null): TestContext {
  return {
    state: { count: 0 },
    update: () => {},
    focusedId,
  };
}

function routingCtx(overrides: Partial<KeyRoutingCtx> = {}): KeyRoutingCtx {
  return {
    focusedId: "save",
    focusList: ["save"],
    enabledById: new Map([["save", true]]),
    pressableIds: new Set(["save"]),
    ...overrides,
  };
}

async function pushEvents(
  backend: StubBackend,
  events: NonNullable<Parameters<typeof encodeZrevBatchV1>[0]["events"]>,
): Promise<void> {
  backend.pushBatch(
    makeBackendBatch({
      bytes: encodeZrevBatchV1({ events }),
    }),
  );
  await flushMicrotasks(20);
}

async function settleNextFrame(backend: StubBackend): Promise<void> {
  backend.resolveNextFrame();
  await flushMicrotasks(20);
}

const KEY_A = keyOf("a");
const KEY_G = keyOf("g");
const KEY_X = keyOf("x");

describe("keybinding conflicts", () => {
  test("same-key re-registration with equal priority replaces the previous binding", () => {
    let firstHits = 0;
    let secondHits = 0;
    let state = createManagerState<TestContext>();

    state = registerBindings(state, {
      a: () => {
        firstHits++;
      },
    }).state;
    state = registerBindings(state, {
      a: () => {
        secondHits++;
      },
    }).state;

    const result = routeKeyEvent(state, keyEvent(KEY_A, 1), ctx());

    assert.equal(result.consumed, true);
    assert.equal(firstHits, 0);
    assert.equal(secondHits, 1);
  });

  test("same-key re-registration with higher priority takes over", () => {
    let firstHits = 0;
    let secondHits = 0;
    let state = createManagerState<TestContext>();

    state = registerBindings(state, {
      a: {
        handler: () => {
          firstHits++;
        },
        priority: 1,
      },
    }).state;
    state = registerBindings(state, {
      a: {
        handler: () => {
          secondHits++;
        },
        priority: 10,
      },
    }).state;

    const result = routeKeyEvent(state, keyEvent(KEY_A, 1), ctx());

    assert.equal(result.consumed, true);
    assert.equal(firstHits, 0);
    assert.equal(secondHits, 1);
  });

  test("same-key re-registration with lower priority still replaces existing binding", () => {
    let firstHits = 0;
    let secondHits = 0;
    let state = createManagerState<TestContext>();

    state = registerBindings(state, {
      a: {
        handler: () => {
          firstHits++;
        },
        priority: 20,
      },
    }).state;
    state = registerBindings(state, {
      a: {
        handler: () => {
          secondHits++;
        },
        priority: 0,
      },
    }).state;

    const result = routeKeyEvent(state, keyEvent(KEY_A, 1), ctx());

    assert.equal(result.consumed, true);
    assert.equal(firstHits, 0);
    assert.equal(secondHits, 1);
  });

  test("mode precedence beats parent priority when keys conflict", () => {
    let parentHits = 0;
    let childHits = 0;
    let state = createManagerState<TestContext>();

    state = registerBindings(state, {
      a: {
        handler: () => {
          parentHits++;
        },
        priority: 100,
      },
    }).state;
    state = registerModes(state, {
      child: {
        parent: DEFAULT_MODE,
        bindings: {
          a: {
            handler: () => {
              childHits++;
            },
            priority: -100,
          },
        },
      },
    }).state;
    state = setMode(state, "child");

    const result = routeKeyEvent(state, keyEvent(KEY_A, 1), ctx());

    assert.equal(result.consumed, true);
    assert.equal(childHits, 1);
    assert.equal(parentHits, 0);
  });

  test("latest same-key registration replaces older when-guarded bindings", () => {
    let lowHits = 0;
    let state = createManagerState<TestContext>();

    state = registerBindings(state, {
      a: {
        handler: () => {
          throw new Error("unreachable");
        },
        priority: 10,
        when: () => false,
      },
    }).state;
    state = registerBindings(state, {
      a: {
        handler: () => {
          lowHits++;
        },
        priority: 0,
      },
    }).state;

    const result = routeKeyEvent(state, keyEvent(KEY_A, 1), ctx());

    assert.equal(result.consumed, true);
    assert.equal(lowHits, 1);
  });

  test("mode re-registration replaces previous same-key binding in the same mode", () => {
    let firstHits = 0;
    let secondHits = 0;
    let state = createManagerState<TestContext>();

    state = registerModes(state, {
      normal: {
        a: () => {
          firstHits++;
        },
      },
    }).state;
    state = registerModes(state, {
      normal: {
        a: () => {
          secondHits++;
        },
      },
    }).state;
    state = setMode(state, "normal");

    const result = routeKeyEvent(state, keyEvent(KEY_A, 1), ctx());

    assert.equal(result.consumed, true);
    assert.equal(firstHits, 0);
    assert.equal(secondHits, 1);
  });

  test("same-level single-key binding wins immediately over longer chord", () => {
    let singleHits = 0;
    let chordHits = 0;
    let state = createManagerState<TestContext>();

    state = registerBindings(state, {
      g: () => {
        singleHits++;
      },
      "g g": () => {
        chordHits++;
      },
    }).state;

    const result = routeKeyEvent(state, keyEvent(KEY_G, 1), ctx());

    assert.equal(result.consumed, true);
    assert.equal(result.nextState.chordState.pendingKeys.length, 0);
    assert.equal(singleHits, 1);
    assert.equal(chordHits, 0);
  });
});

describe("routing semantics", () => {
  test("focused widget routing maps Enter to press action", () => {
    const result = routeKey(keyEvent(ZR_KEY_ENTER, 1), routingCtx());

    assert.deepEqual(result, {
      action: { id: "save", action: "press" },
    });
  });

  test("no-focus behavior: Enter does nothing", () => {
    const result = routeKey(
      keyEvent(ZR_KEY_ENTER, 1),
      routingCtx({ focusedId: null, focusList: ["save"] }),
    );

    assert.deepEqual(result, {});
  });

  test("focused but disabled widget does not receive Enter action", () => {
    const result = routeKey(
      keyEvent(ZR_KEY_ENTER, 1),
      routingCtx({ enabledById: new Map([["save", false]]) }),
    );

    assert.deepEqual(result, {});
  });

  test("key repeat events are ignored by widget key router", () => {
    const result = routeKey(keyEvent(ZR_KEY_ENTER, 1, "repeat"), routingCtx());

    assert.deepEqual(result, {});
  });

  test("unmatched key is not consumed in keybinding manager routing", () => {
    const state = createManagerState<TestContext>();

    const result = routeKeyEvent(state, keyEvent(KEY_X, 1), ctx());

    assert.equal(result.consumed, false);
  });

  test("key repeat events are ignored by keybinding manager routing", () => {
    let hits = 0;
    let state = createManagerState<TestContext>();
    state = registerBindings(state, {
      a: () => {
        hits++;
      },
    }).state;

    const result = routeKeyEvent(state, keyEvent(KEY_A, 1, "repeat"), ctx());

    assert.equal(result.consumed, false);
    assert.equal(hits, 0);
  });

  test("layer escape closes the topmost closable layer", () => {
    const closed: string[] = [];

    const result = routeLayerEscape(keyEvent(ZR_KEY_ESCAPE, 1), {
      layerStack: ["base", "modal"],
      closeOnEscape: new Map([
        ["base", true],
        ["modal", true],
      ]),
      onClose: new Map([
        ["base", () => closed.push("base")],
        ["modal", () => closed.push("modal")],
      ]),
    });

    assert.equal(result.consumed, true);
    assert.equal(result.closedLayerId, "modal");
    assert.deepEqual(closed, ["modal"]);
  });

  test("layer escape skips non-closable top layer and closes next layer", () => {
    const closed: string[] = [];

    const result = routeLayerEscape(keyEvent(ZR_KEY_ESCAPE, 1), {
      layerStack: ["base", "top"],
      closeOnEscape: new Map([
        ["base", true],
        ["top", false],
      ]),
      onClose: new Map([
        ["base", () => closed.push("base")],
        ["top", () => closed.push("top")],
      ]),
    });

    assert.equal(result.consumed, true);
    assert.equal(result.closedLayerId, "base");
    assert.deepEqual(closed, ["base"]);
  });

  test("layer escape is not consumed when closable layer has no callback", () => {
    const result = routeLayerEscape(keyEvent(ZR_KEY_ESCAPE, 1), {
      layerStack: ["modal"],
      closeOnEscape: new Map([["modal", true]]),
      onClose: new Map(),
    });

    assert.equal(result.consumed, false);
  });
});

describe("app routing precedence", () => {
  test("mouse click clears pending chord before the next key", async () => {
    const backend = new StubBackend();
    let chordHits = 0;

    const app = createApp({ backend, initialState: 0 });
    app.keys({
      "g g": () => {
        chordHits++;
      },
    });
    app.view(() => ui.text("No focusable widgets"));

    await app.start();
    await pushEvents(backend, [{ kind: "resize", timeMs: 1, cols: 40, rows: 10 }]);
    await settleNextFrame(backend);

    await pushEvents(backend, [{ kind: "key", timeMs: 2, key: KEY_G, action: "down" }]);
    await pushEvents(backend, [
      { kind: "mouse", timeMs: 3, x: 0, y: 0, mouseKind: 3, buttons: 1 },
      { kind: "mouse", timeMs: 4, x: 0, y: 0, mouseKind: 4, buttons: 0 },
    ]);
    await pushEvents(backend, [{ kind: "key", timeMs: 5, key: KEY_G, action: "down" }]);

    assert.equal(chordHits, 0);
  });

  test("mouse up does not clear chord started after mouse down", async () => {
    const backend = new StubBackend();
    let chordHits = 0;

    const app = createApp({ backend, initialState: 0 });
    app.keys({
      "g g": () => {
        chordHits++;
      },
    });
    app.view(() => ui.text("No focusable widgets"));

    await app.start();
    await pushEvents(backend, [{ kind: "resize", timeMs: 1, cols: 40, rows: 10 }]);
    await settleNextFrame(backend);

    await pushEvents(backend, [{ kind: "mouse", timeMs: 2, x: 0, y: 0, mouseKind: 3, buttons: 1 }]);
    await pushEvents(backend, [{ kind: "key", timeMs: 3, key: KEY_G, action: "down" }]);
    await pushEvents(backend, [{ kind: "mouse", timeMs: 4, x: 0, y: 0, mouseKind: 4, buttons: 0 }]);
    await pushEvents(backend, [{ kind: "key", timeMs: 5, key: KEY_G, action: "down" }]);

    assert.equal(chordHits, 1);
  });

  test("app-level keybinding consumes Enter before widget-level button routing", async () => {
    const backend = new StubBackend();
    let keybindingHits = 0;
    let buttonPresses = 0;
    const actionEvents: Array<Readonly<{ id: string; action: string }>> = [];

    const app = createApp({ backend, initialState: 0 });
    app.keys({
      enter: () => {
        keybindingHits++;
      },
    });
    app.onEvent((ev) => {
      if (ev.kind === "action") actionEvents.push({ id: ev.id, action: ev.action });
    });
    app.view(() =>
      ui.focusTrap(
        {
          id: "trap",
          active: true,
          initialFocus: "save",
        },
        [
          ui.button({
            id: "save",
            label: "Save",
            onPress: () => {
              buttonPresses++;
            },
          }),
        ],
      ),
    );

    await app.start();
    await pushEvents(backend, [{ kind: "resize", timeMs: 1, cols: 40, rows: 10 }]);
    await settleNextFrame(backend);

    await pushEvents(backend, [{ kind: "key", timeMs: 2, key: ZR_KEY_ENTER, action: "down" }]);

    assert.equal(keybindingHits, 1);
    assert.equal(buttonPresses, 0);
    assert.deepEqual(actionEvents, []);
  });

  test("widget routing handles Enter when app keybinding does not match", async () => {
    const backend = new StubBackend();
    let keybindingHits = 0;
    let buttonPresses = 0;
    const actionEvents: Array<Readonly<{ id: string; action: string }>> = [];

    const app = createApp({ backend, initialState: 0 });
    app.keys({
      x: () => {
        keybindingHits++;
      },
    });
    app.onEvent((ev) => {
      if (ev.kind === "action") actionEvents.push({ id: ev.id, action: ev.action });
    });
    app.view(() =>
      ui.focusTrap(
        {
          id: "trap",
          active: true,
          initialFocus: "save",
        },
        [
          ui.button({
            id: "save",
            label: "Save",
            onPress: () => {
              buttonPresses++;
            },
          }),
        ],
      ),
    );

    await app.start();
    await pushEvents(backend, [{ kind: "resize", timeMs: 1, cols: 40, rows: 10 }]);
    await settleNextFrame(backend);

    await pushEvents(backend, [{ kind: "key", timeMs: 2, key: ZR_KEY_ENTER, action: "down" }]);

    assert.equal(keybindingHits, 0);
    assert.equal(buttonPresses, 1);
    assert.deepEqual(actionEvents, [{ id: "save", action: "press" }]);
  });

  test("app-level keybinding fires even when no widget is focused", async () => {
    const backend = new StubBackend();
    let keybindingHits = 0;

    const app = createApp({ backend, initialState: 0 });
    app.keys({
      enter: () => {
        keybindingHits++;
      },
    });
    app.view(() => ui.text("No focusable widgets"));

    await app.start();
    await pushEvents(backend, [{ kind: "resize", timeMs: 1, cols: 40, rows: 10 }]);
    await settleNextFrame(backend);

    await pushEvents(backend, [{ kind: "key", timeMs: 2, key: ZR_KEY_ENTER, action: "down" }]);

    assert.equal(keybindingHits, 1);
  });

  test("active modal Escape handling bypasses app-level Escape keybinding", async () => {
    const backend = new StubBackend();
    let keybindingHits = 0;
    let closed = 0;

    const app = createApp({ backend, initialState: 0 });
    app.keys({
      escape: () => {
        keybindingHits++;
      },
    });
    app.view(() =>
      ui.layers([
        ui.layer({
          id: "modal",
          modal: true,
          closeOnEscape: true,
          onClose: () => {
            closed++;
          },
          content: ui.text("Modal"),
        }),
      ]),
    );

    await app.start();
    await pushEvents(backend, [{ kind: "resize", timeMs: 1, cols: 40, rows: 10 }]);
    await settleNextFrame(backend);

    await pushEvents(backend, [{ kind: "key", timeMs: 2, key: ZR_KEY_ESCAPE, action: "down" }]);

    assert.equal(closed, 1);
    assert.equal(keybindingHits, 0);
  });
});
