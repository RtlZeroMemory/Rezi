import { assert, describe, test } from "@rezi-ui/testkit";
import {
  encodeZrevBatchV1,
  flushMicrotasks,
  makeBackendBatch,
} from "../../app/__tests__/helpers.js";
import { StubBackend } from "../../app/__tests__/stubBackend.js";
import { createApp } from "../../app/createApp.js";
import type { ZrevEvent } from "../../events.js";
import { type VNode, ui } from "../../index.js";
import { ZR_KEY_ENTER, ZR_KEY_TAB, ZR_MOD_CTRL, ZR_MOD_SHIFT } from "../../keybindings/keyCodes.js";
import { createManagerState, registerBindings, routeKeyEvent } from "../../keybindings/manager.js";
import type { KeyContext } from "../../keybindings/types.js";
import { hitTestFocusable } from "../../layout/hitTest.js";
import type { LayoutTree } from "../../layout/layout.js";
import type { Rect } from "../../layout/types.js";
import { type FocusState, applyPendingFocusChange, requestPendingFocusChange } from "../focus.js";
import { applyInputEditEvent } from "../inputEditor.js";
import { createLayerRegistry, hitTestLayers } from "../layers.js";
import { routeKey, routeMouse } from "../router.js";

const MOUSE_KIND_MOVE = 1;
const MOUSE_KIND_DRAG = 2;
const MOUSE_KIND_DOWN = 3;
const MOUSE_KIND_UP = 4;
const MOUSE_KIND_WHEEL = 5;
const KEY_G = "G".charCodeAt(0);

type MixedRoutingState = Readonly<{
  focusState: FocusState;
  pressedId: string | null;
}>;

type ChordStateModel = Readonly<{ count: number }>;
type ChordContext = KeyContext<ChordStateModel>;

function keyDownEvent(key: number, mods = 0, timeMs = 0): ZrevEvent {
  return { kind: "key", timeMs, key, mods, action: "down" };
}

function textEvent(codepoint: number, timeMs = 0): ZrevEvent {
  return { kind: "text", timeMs, codepoint };
}

function mouseEvent(
  x: number,
  y: number,
  mouseKind: 1 | 2 | 3 | 4 | 5,
  opts: Readonly<{
    timeMs?: number;
    mods?: number;
    buttons?: number;
    wheelX?: number;
    wheelY?: number;
  }> = {},
): ZrevEvent {
  return {
    kind: "mouse",
    timeMs: opts.timeMs ?? 0,
    x,
    y,
    mouseKind,
    mods: opts.mods ?? 0,
    buttons: opts.buttons ?? 0,
    wheelX: opts.wheelX ?? 0,
    wheelY: opts.wheelY ?? 0,
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

function buttonNode(id: string): VNode {
  return { kind: "button", props: { id, label: id } } as unknown as VNode;
}

function inputNode(id: string): VNode {
  return { kind: "input", props: { id } } as unknown as VNode;
}

function containerNode(children: readonly VNode[]): VNode {
  return {
    kind: "column",
    props: {},
    children: Object.freeze([...children]),
  } as unknown as VNode;
}

function layoutNode(vnode: VNode, rect: Rect, children: readonly LayoutTree[] = []): LayoutTree {
  return {
    vnode,
    rect,
    children: Object.freeze([...children]),
  };
}

function createRoutingState(
  focusedId: string | null,
  pressedId: string | null = null,
): MixedRoutingState {
  return Object.freeze({
    focusState: Object.freeze({ focusedId }),
    pressedId,
  });
}

function applyFocusRoutingResult(
  focusState: FocusState,
  result: Readonly<{ nextFocusedId?: string | null }>,
): FocusState {
  let next = focusState;
  if (result.nextFocusedId !== undefined) {
    next = requestPendingFocusChange(next, result.nextFocusedId);
  }
  return applyPendingFocusChange(next);
}

function routeMouseStep(
  state: MixedRoutingState,
  event: ZrevEvent,
  root: VNode,
  layout: LayoutTree,
  enabledById: ReadonlyMap<string, boolean>,
  pressableIds?: ReadonlySet<string>,
): Readonly<{
  state: MixedRoutingState;
  hitTestTargetId: string | null;
  actionId: string | null;
}> {
  assert.equal(event.kind, "mouse");

  const hitTestTargetId = hitTestFocusable(root, layout, event.x, event.y);
  const res = routeMouse(event, {
    pressedId: state.pressedId,
    hitTestTargetId,
    enabledById,
    ...(pressableIds ? { pressableIds } : {}),
  });

  const nextState: MixedRoutingState = Object.freeze({
    focusState: applyFocusRoutingResult(state.focusState, res),
    pressedId: res.nextPressedId !== undefined ? res.nextPressedId : state.pressedId,
  });

  return Object.freeze({
    state: nextState,
    hitTestTargetId,
    actionId: res.action?.id ?? null,
  });
}

function routeKeyStep(
  state: MixedRoutingState,
  event: ZrevEvent,
  focusList: readonly string[],
  enabledById: ReadonlyMap<string, boolean>,
  pressableIds?: ReadonlySet<string>,
): Readonly<{
  state: MixedRoutingState;
  actionId: string | null;
}> {
  assert.equal(event.kind, "key");

  const res = routeKey(event, {
    focusedId: state.focusState.focusedId,
    focusList,
    enabledById,
    ...(pressableIds ? { pressableIds } : {}),
  });

  const nextState: MixedRoutingState = Object.freeze({
    focusState: applyFocusRoutingResult(state.focusState, res),
    pressedId: state.pressedId,
  });

  return Object.freeze({
    state: nextState,
    actionId: res.action?.id ?? null,
  });
}

function chordContext(focusedId: string | null): ChordContext {
  return {
    state: Object.freeze({ count: 0 }),
    update: () => {},
    focusedId,
  };
}

function maybeCloseOnBackdrop(
  hit: ReturnType<typeof hitTestLayers>,
  event: ZrevEvent,
  closeOnBackdropByLayerId: ReadonlyMap<string, boolean>,
  onCloseByLayerId: ReadonlyMap<string, () => void>,
): boolean {
  if (event.kind !== "mouse" || event.mouseKind !== MOUSE_KIND_DOWN) return false;
  if (!hit.blocked || hit.blockingLayer === null) return false;
  if ((closeOnBackdropByLayerId.get(hit.blockingLayer.id) ?? false) !== true) return false;

  const cb = onCloseByLayerId.get(hit.blockingLayer.id);
  if (!cb) return false;

  cb();
  return true;
}

function buildTwoButtonScene(): Readonly<{
  root: VNode;
  layout: LayoutTree;
  focusList: readonly string[];
  enabledById: ReadonlyMap<string, boolean>;
  pressableIds: ReadonlySet<string>;
}> {
  const a = buttonNode("a");
  const b = buttonNode("b");
  const root = containerNode([a, b]);

  const layout = layoutNode(root, { x: 0, y: 0, w: 12, h: 3 }, [
    layoutNode(a, { x: 0, y: 0, w: 5, h: 1 }),
    layoutNode(b, { x: 6, y: 0, w: 5, h: 1 }),
  ]);

  const enabledById = new Map<string, boolean>([
    ["a", true],
    ["b", true],
  ]);

  return Object.freeze({
    root,
    layout,
    focusList: Object.freeze(["a", "b"]),
    enabledById,
    pressableIds: new Set<string>(["a", "b"]),
  });
}

function buildInputScene(): Readonly<{
  root: VNode;
  layout: LayoutTree;
  focusList: readonly string[];
  enabledById: ReadonlyMap<string, boolean>;
  pressableIds: ReadonlySet<string>;
}> {
  const input = inputNode("input");
  const save = buttonNode("save");
  const root = containerNode([input, save]);

  const layout = layoutNode(root, { x: 0, y: 0, w: 20, h: 3 }, [
    layoutNode(input, { x: 0, y: 0, w: 8, h: 1 }),
    layoutNode(save, { x: 10, y: 0, w: 6, h: 1 }),
  ]);

  const enabledById = new Map<string, boolean>([
    ["input", true],
    ["save", true],
  ]);

  return Object.freeze({
    root,
    layout,
    focusList: Object.freeze(["input", "save"]),
    enabledById,
    pressableIds: new Set<string>(["save"]),
  });
}

describe("mouse mixed routing integration", () => {
  test("click to focus then key routes to clicked widget", () => {
    const scene = buildTwoButtonScene();
    let state = createRoutingState(null);

    const down = routeMouseStep(
      state,
      mouseEvent(7, 0, MOUSE_KIND_DOWN, { buttons: 1 }),
      scene.root,
      scene.layout,
      scene.enabledById,
      scene.pressableIds,
    );
    state = down.state;
    assert.equal(down.hitTestTargetId, "b");
    assert.equal(state.focusState.focusedId, "b");
    assert.equal(state.pressedId, "b");

    const up = routeMouseStep(
      state,
      mouseEvent(7, 0, MOUSE_KIND_UP, { buttons: 0 }),
      scene.root,
      scene.layout,
      scene.enabledById,
      scene.pressableIds,
    );
    state = up.state;
    assert.equal(up.actionId, "b");
    assert.equal(state.pressedId, null);

    const enter = routeKeyStep(
      state,
      keyDownEvent(ZR_KEY_ENTER),
      scene.focusList,
      scene.enabledById,
      scene.pressableIds,
    );
    assert.equal(enter.actionId, "b");
  });

  test("keyboard focus on A then click B moves focus then key routes to B", () => {
    const scene = buildTwoButtonScene();
    let state = createRoutingState(null);

    const tab = routeKeyStep(
      state,
      keyDownEvent(ZR_KEY_TAB),
      scene.focusList,
      scene.enabledById,
      scene.pressableIds,
    );
    state = tab.state;
    assert.equal(state.focusState.focusedId, "a");

    const down = routeMouseStep(
      state,
      mouseEvent(7, 0, MOUSE_KIND_DOWN),
      scene.root,
      scene.layout,
      scene.enabledById,
      scene.pressableIds,
    );
    state = down.state;
    assert.equal(state.focusState.focusedId, "b");

    const up = routeMouseStep(
      state,
      mouseEvent(7, 0, MOUSE_KIND_UP),
      scene.root,
      scene.layout,
      scene.enabledById,
      scene.pressableIds,
    );
    state = up.state;
    assert.equal(up.actionId, "b");

    const enter = routeKeyStep(
      state,
      keyDownEvent(ZR_KEY_ENTER),
      scene.focusList,
      scene.enabledById,
      scene.pressableIds,
    );
    assert.equal(enter.actionId, "b");
  });

  test("click during active chord resets pending chord before next key", async () => {
    const backend = new StubBackend();
    let chordHits = 0;

    const app = createApp({ backend, initialState: 0 });
    app.keys({
      "g g": () => {
        chordHits++;
      },
    });
    app.view(() => ui.text("Mixed input chord reset test"));

    await app.start();
    await pushEvents(backend, [{ kind: "resize", timeMs: 1, cols: 40, rows: 10 }]);
    await settleNextFrame(backend);

    await pushEvents(backend, [{ kind: "key", timeMs: 2, key: KEY_G, action: "down" }]);
    await pushEvents(backend, [
      { kind: "mouse", timeMs: 3, x: 0, y: 0, mouseKind: MOUSE_KIND_DOWN, buttons: 1 },
      { kind: "mouse", timeMs: 4, x: 0, y: 0, mouseKind: MOUSE_KIND_UP, buttons: 0 },
    ]);
    await pushEvents(backend, [{ kind: "key", timeMs: 5, key: KEY_G, action: "down" }]);

    assert.equal(chordHits, 0);
    await app.stop();
  });

  test("tab-focus then click same widget does not corrupt focus state", () => {
    const scene = buildTwoButtonScene();
    let state = createRoutingState(null);

    const tab = routeKeyStep(
      state,
      keyDownEvent(ZR_KEY_TAB),
      scene.focusList,
      scene.enabledById,
      scene.pressableIds,
    );
    state = tab.state;
    assert.equal(state.focusState.focusedId, "a");

    const down = routeMouseStep(
      state,
      mouseEvent(1, 0, MOUSE_KIND_DOWN),
      scene.root,
      scene.layout,
      scene.enabledById,
      scene.pressableIds,
    );
    state = down.state;
    assert.equal(state.focusState.focusedId, "a");
    assert.equal(state.pressedId, "a");

    const up = routeMouseStep(
      state,
      mouseEvent(1, 0, MOUSE_KIND_UP),
      scene.root,
      scene.layout,
      scene.enabledById,
      scene.pressableIds,
    );
    state = up.state;
    assert.equal(up.actionId, "a");
    assert.equal(state.focusState.focusedId, "a");
    assert.equal(state.pressedId, null);

    const enter = routeKeyStep(
      state,
      keyDownEvent(ZR_KEY_ENTER),
      scene.focusList,
      scene.enabledById,
      scene.pressableIds,
    );
    assert.equal(enter.actionId, "a");
  });

  test("scroll while keyboard-active input does not corrupt input/chord/focus state", () => {
    const scene = buildInputScene();

    let state = createRoutingState(null);
    const tab = routeKeyStep(
      state,
      keyDownEvent(ZR_KEY_TAB),
      scene.focusList,
      scene.enabledById,
      scene.pressableIds,
    );
    state = tab.state;
    assert.equal(state.focusState.focusedId, "input");

    let inputValue = "";
    let inputCursor = 0;

    const insertX = applyInputEditEvent(textEvent("x".codePointAt(0) ?? 120), {
      id: "input",
      value: inputValue,
      cursor: inputCursor,
    });
    assert.ok(insertX !== null);
    if (!insertX) return;
    inputValue = insertX.nextValue;
    inputCursor = insertX.nextCursor;
    assert.equal(inputValue, "x");

    const chordHits: string[] = [];
    let keybindingState = createManagerState<ChordContext>();
    keybindingState = registerBindings(keybindingState, {
      "g g": () => {
        chordHits.push("gg");
      },
    }).state;

    const chordStart = routeKeyEvent(
      keybindingState,
      keyDownEvent(KEY_G, 0, 100),
      chordContext(state.focusState.focusedId),
    );
    keybindingState = chordStart.nextState;
    assert.equal(chordStart.consumed, true);
    assert.equal(keybindingState.chordState.pendingKeys.length, 1);

    const wheel = routeMouseStep(
      state,
      mouseEvent(1, 0, MOUSE_KIND_WHEEL, { wheelY: 1, mods: ZR_MOD_CTRL }),
      scene.root,
      scene.layout,
      scene.enabledById,
      scene.pressableIds,
    );
    state = wheel.state;

    assert.equal(wheel.actionId, null);
    assert.equal(state.focusState.focusedId, "input");
    assert.equal(state.pressedId, null);
    assert.equal(inputValue, "x");
    assert.equal(inputCursor, 1);
    assert.equal(keybindingState.chordState.pendingKeys.length, 1);

    const insertY = applyInputEditEvent(textEvent("y".codePointAt(0) ?? 121), {
      id: "input",
      value: inputValue,
      cursor: inputCursor,
    });
    assert.ok(insertY !== null);
    if (!insertY) return;
    inputValue = insertY.nextValue;
    inputCursor = insertY.nextCursor;
    assert.equal(inputValue, "xy");

    const chordEnd = routeKeyEvent(
      keybindingState,
      keyDownEvent(KEY_G, 0, 120),
      chordContext(state.focusState.focusedId),
    );
    keybindingState = chordEnd.nextState;

    assert.equal(chordEnd.consumed, true);
    assert.deepEqual(chordHits, ["gg"]);
    assert.equal(keybindingState.chordState.pendingKeys.length, 0);
  });

  test("modifier+click payload passes through to focus/press routing", () => {
    const scene = buildTwoButtonScene();
    let state = createRoutingState(null);

    const mods = ZR_MOD_SHIFT | ZR_MOD_CTRL;

    const down = routeMouseStep(
      state,
      mouseEvent(7, 0, MOUSE_KIND_DOWN, { mods, buttons: 1 }),
      scene.root,
      scene.layout,
      scene.enabledById,
      scene.pressableIds,
    );
    state = down.state;
    assert.equal(state.focusState.focusedId, "b");
    assert.equal(state.pressedId, "b");

    const up = routeMouseStep(
      state,
      mouseEvent(7, 0, MOUSE_KIND_UP, { mods, buttons: 0 }),
      scene.root,
      scene.layout,
      scene.enabledById,
      scene.pressableIds,
    );
    state = up.state;
    assert.equal(up.actionId, "b");
    assert.equal(state.pressedId, null);
  });

  test("modifier+drag payload is ignored by core mouse router", () => {
    const scene = buildTwoButtonScene();
    let state = createRoutingState(null);

    const down = routeMouseStep(
      state,
      mouseEvent(1, 0, MOUSE_KIND_DOWN, { mods: ZR_MOD_CTRL, buttons: 1 }),
      scene.root,
      scene.layout,
      scene.enabledById,
      scene.pressableIds,
    );
    state = down.state;
    assert.equal(state.focusState.focusedId, "a");
    assert.equal(state.pressedId, "a");

    const drag = routeMouseStep(
      state,
      mouseEvent(8, 0, MOUSE_KIND_DRAG, {
        mods: ZR_MOD_CTRL | ZR_MOD_SHIFT,
        buttons: 1,
      }),
      scene.root,
      scene.layout,
      scene.enabledById,
      scene.pressableIds,
    );
    state = drag.state;
    assert.equal(state.focusState.focusedId, "a");
    assert.equal(state.pressedId, "a");

    const up = routeMouseStep(
      state,
      mouseEvent(1, 0, MOUSE_KIND_UP, { mods: ZR_MOD_CTRL, buttons: 0 }),
      scene.root,
      scene.layout,
      scene.enabledById,
      scene.pressableIds,
    );
    state = up.state;
    assert.equal(up.actionId, "a");
    assert.equal(state.pressedId, null);
  });

  test("move events are ignored and do not mutate pressed state", () => {
    const scene = buildTwoButtonScene();

    const moved = routeMouseStep(
      createRoutingState("a", "a"),
      mouseEvent(7, 0, MOUSE_KIND_MOVE, { buttons: 1 }),
      scene.root,
      scene.layout,
      scene.enabledById,
      scene.pressableIds,
    );

    assert.equal(moved.state.focusState.focusedId, "a");
    assert.equal(moved.state.pressedId, "a");
    assert.equal(moved.actionId, null);
  });
});

describe("overlay/modal hit priority integration", () => {
  test("topmost non-modal overlay wins hit test in overlapping region", () => {
    const registry = createLayerRegistry();

    registry.register({
      id: "base",
      zIndex: 100,
      rect: { x: 0, y: 0, w: 20, h: 10 },
      backdrop: "none",
      modal: false,
      closeOnEscape: true,
    });

    registry.register({
      id: "overlay",
      zIndex: 200,
      rect: { x: 5, y: 2, w: 10, h: 5 },
      backdrop: "none",
      modal: false,
      closeOnEscape: true,
    });

    const overlap = hitTestLayers(registry, 6, 3);
    assert.equal(overlap.layer?.id, "overlay");
    assert.equal(overlap.blocked, false);

    const baseOnly = hitTestLayers(registry, 1, 1);
    assert.equal(baseOnly.layer?.id, "base");
    assert.equal(baseOnly.blocked, false);
  });

  test("modal blocks lower layers and exposes blocking layer for backdrop policy", () => {
    const registry = createLayerRegistry();

    registry.register({
      id: "base",
      zIndex: 100,
      rect: { x: 0, y: 0, w: 20, h: 10 },
      backdrop: "none",
      modal: false,
      closeOnEscape: true,
    });

    registry.register({
      id: "modal",
      zIndex: 300,
      rect: { x: 8, y: 3, w: 6, h: 4 },
      backdrop: "dim",
      modal: true,
      closeOnEscape: true,
    });

    const blocked = hitTestLayers(registry, 1, 1);
    assert.equal(blocked.layer, null);
    assert.equal(blocked.blocked, true);
    assert.equal(blocked.blockingLayer?.id, "modal");

    const insideModal = hitTestLayers(registry, 9, 4);
    assert.equal(insideModal.layer?.id, "modal");
    assert.equal(insideModal.blocked, false);
  });

  test("backdrop click close behavior is configurable via closeOnBackdrop flag", () => {
    const registry = createLayerRegistry();

    registry.register({
      id: "modal",
      zIndex: 300,
      rect: { x: 8, y: 3, w: 6, h: 4 },
      backdrop: "dim",
      modal: true,
      closeOnEscape: true,
    });

    const blocked = hitTestLayers(registry, 0, 0);
    assert.equal(blocked.blocked, true);
    assert.equal(blocked.blockingLayer?.id, "modal");

    let closeCalls = 0;

    const consumedWhenEnabled = maybeCloseOnBackdrop(
      blocked,
      mouseEvent(0, 0, MOUSE_KIND_DOWN),
      new Map<string, boolean>([["modal", true]]),
      new Map<string, () => void>([["modal", () => closeCalls++]]),
    );
    assert.equal(consumedWhenEnabled, true);
    assert.equal(closeCalls, 1);

    const consumedWhenDisabled = maybeCloseOnBackdrop(
      blocked,
      mouseEvent(0, 0, MOUSE_KIND_DOWN),
      new Map<string, boolean>([["modal", false]]),
      new Map<string, () => void>([["modal", () => closeCalls++]]),
    );
    assert.equal(consumedWhenDisabled, false);
    assert.equal(closeCalls, 1);
  });
});

describe("hit-test integration boundaries", () => {
  test("nested clip intersections include point at (0,0) and exclude clipped overflow", () => {
    const leaf = buttonNode("leaf");
    const mid = containerNode([leaf]);
    const root = containerNode([mid]);

    const tree = layoutNode(root, { x: 0, y: 0, w: 5, h: 3 }, [
      layoutNode(mid, { x: 0, y: 0, w: 3, h: 2 }, [layoutNode(leaf, { x: 0, y: 0, w: 4, h: 2 })]),
    ]);

    assert.equal(hitTestFocusable(root, tree, 0, 0), "leaf");
    assert.equal(hitTestFocusable(root, tree, 2, 1), "leaf");
    assert.equal(hitTestFocusable(root, tree, 3, 1), null);
  });

  test("overlap priority is deterministic: later sibling wins", () => {
    const first = buttonNode("first");
    const second = buttonNode("second");
    const root = containerNode([first, second]);

    const tree = layoutNode(root, { x: 0, y: 0, w: 6, h: 2 }, [
      layoutNode(first, { x: 0, y: 0, w: 4, h: 2 }),
      layoutNode(second, { x: 2, y: 0, w: 4, h: 2 }),
    ]);

    assert.equal(hitTestFocusable(root, tree, 2, 0), "second");
    assert.equal(hitTestFocusable(root, tree, 1, 0), "first");
  });

  test("max-edge boundaries: left/top inclusive, right/bottom exclusive", () => {
    const edge = buttonNode("edge");
    const root = containerNode([edge]);

    const tree = layoutNode(root, { x: 0, y: 0, w: 5, h: 4 }, [
      layoutNode(edge, { x: 0, y: 0, w: 3, h: 2 }),
    ]);

    assert.equal(hitTestFocusable(root, tree, 0, 0), "edge");
    assert.equal(hitTestFocusable(root, tree, 2, 1), "edge");
    assert.equal(hitTestFocusable(root, tree, 3, 1), null);
    assert.equal(hitTestFocusable(root, tree, 2, 2), null);
  });
});
