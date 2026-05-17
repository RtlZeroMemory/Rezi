import { assert, type Rng, pick, randomInt, runFuzz, test } from "@rezi-ui/testkit";
import type { ZrevEvent, ZrevKeyAction, ZrevMouseKind } from "../../../events.js";
import { hitTestFocusable } from "../../../layout/hitTest.js";
import type { LayoutTree } from "../../../layout/layout.js";
import type { Rect } from "../../../layout/types.js";
import type { VNode } from "../../../widgets/types.js";
import { routeKey } from "../key.js";
import { routeMouse } from "../mouse.js";
import type { EnabledById, RoutingResult } from "../types.js";
import { type WheelRoutingCtx, type WheelRoutingResult, routeWheel } from "../wheel.js";

const KEY_ENTER = 2;
const KEY_TAB = 3;
const KEY_SPACE = 32;
const MOD_SHIFT = 1 << 0;

const MOUSE_MOVE = 1;
const MOUSE_DRAG = 2;
const MOUSE_DOWN = 3;
const MOUSE_UP = 4;
const MOUSE_WHEEL = 5;

const SCROLL_LINES = 3;

function idAt(ids: readonly string[], index: number): string {
  const id = ids[index];
  if (id === undefined) throw new Error(`missing id at index ${String(index)}`);
  return id;
}

function randomIds(rng: Rng, max: number): readonly string[] {
  const count = randomInt(rng, 0, max);
  return Object.freeze(Array.from({ length: count }, (_, index) => `id.${String(index)}`));
}

function randomKnownId(rng: Rng, ids: readonly string[]): string | null {
  if (ids.length === 0) return null;
  return idAt(ids, randomInt(rng, 0, ids.length - 1));
}

function randomKnownUnknownOrNull(rng: Rng, ids: readonly string[]): string | null {
  const choice = randomInt(rng, 0, 9);
  if (choice <= 1) return null;
  if (choice <= 6) return randomKnownId(rng, ids);
  return `missing.${String(randomInt(rng, 0, 7))}`;
}

function randomEnabledById(rng: Rng, ids: readonly string[]): ReadonlyMap<string, boolean> {
  const entries: Array<readonly [string, boolean]> = [];
  for (const id of ids) entries.push([id, (rng.u32() & 1) === 0]);
  return new Map(entries);
}

function randomPressableIds(rng: Rng, ids: readonly string[]): ReadonlySet<string> | undefined {
  if ((rng.u32() & 1) === 0) return undefined;
  const pressable = new Set<string>();
  for (const id of ids) {
    if ((rng.u32() & 1) === 0) pressable.add(id);
  }
  return pressable;
}

function isEnabled(enabledById: EnabledById, id: string): boolean {
  return enabledById.get(id) === true;
}

function isPressable(pressableIds: ReadonlySet<string> | undefined, id: string): boolean {
  return pressableIds === undefined || pressableIds.has(id);
}

function keyEvent(key: number, action: ZrevKeyAction, mods = 0): ZrevEvent {
  return { kind: "key", timeMs: 0, key, mods, action };
}

function mouseEvent(
  mouseKind: ZrevMouseKind,
  opts: Readonly<{ x?: number; y?: number; wheelX?: number; wheelY?: number }> = {},
): ZrevEvent {
  return {
    kind: "mouse",
    timeMs: 0,
    x: opts.x ?? 0,
    y: opts.y ?? 0,
    mouseKind,
    mods: 0,
    buttons: 0,
    wheelX: opts.wheelX ?? 0,
    wheelY: opts.wheelY ?? 0,
  };
}

function randomNonRoutingEvent(rng: Rng): ZrevEvent {
  const kind = pick(rng, ["text", "paste", "resize", "tick", "user"] as const);
  if (kind === "text") {
    return { kind, timeMs: 0, codepoint: randomInt(rng, 0, 0x10ffff) };
  }
  if (kind === "paste") {
    return { kind, timeMs: 0, bytes: rng.bytes(randomInt(rng, 0, 8)) };
  }
  if (kind === "resize") {
    return { kind, timeMs: 0, cols: randomInt(rng, 0, 120), rows: randomInt(rng, 0, 40) };
  }
  if (kind === "tick") {
    return { kind, timeMs: 0, dtMs: randomInt(rng, 0, 1000) };
  }
  return { kind, timeMs: 0, tag: rng.u32(), payload: rng.bytes(randomInt(rng, 0, 8)) };
}

function randomKeyRoutingEvent(rng: Rng): ZrevEvent {
  const choice = randomInt(rng, 0, 9);
  if (choice <= 1) return keyEvent(KEY_TAB, "down", choice === 0 ? 0 : MOD_SHIFT);
  if (choice <= 3) return keyEvent(pick(rng, [KEY_ENTER, KEY_SPACE] as const), "down");
  if (choice <= 5) {
    return keyEvent(
      pick(rng, [KEY_TAB, KEY_ENTER, KEY_SPACE] as const),
      pick(rng, ["up", "repeat"] as const),
    );
  }
  if (choice <= 7) return keyEvent(randomInt(rng, -64, 256), "down", rng.u32());
  return randomNonRoutingEvent(rng);
}

function expectedTabFocus(
  focusList: readonly string[],
  focusedId: string | null,
  backwards: boolean,
): string | null {
  if (focusList.length === 0) return null;
  if (focusedId === null) {
    return backwards ? idAt(focusList, focusList.length - 1) : idAt(focusList, 0);
  }

  const index = focusList.indexOf(focusedId);
  if (index < 0) {
    return backwards ? idAt(focusList, focusList.length - 1) : idAt(focusList, 0);
  }

  const nextIndex = backwards
    ? (index - 1 + focusList.length) % focusList.length
    : (index + 1) % focusList.length;
  return idAt(focusList, nextIndex);
}

function expectedKeyRoute(
  event: ZrevEvent,
  focusedId: string | null,
  focusList: readonly string[],
  enabledById: EnabledById,
  pressableIds: ReadonlySet<string> | undefined,
): RoutingResult {
  if (event.kind !== "key" || event.action !== "down") return {};

  if (event.key === KEY_TAB) {
    return {
      nextFocusedId: expectedTabFocus(focusList, focusedId, (event.mods & MOD_SHIFT) !== 0),
    };
  }

  if (
    (event.key === KEY_ENTER || event.key === KEY_SPACE) &&
    focusedId !== null &&
    isEnabled(enabledById, focusedId) &&
    isPressable(pressableIds, focusedId)
  ) {
    return { action: { id: focusedId, action: "press" } };
  }

  return {};
}

function randomMouseRoutingEvent(rng: Rng): ZrevEvent {
  const choice = randomInt(rng, 0, 9);
  if (choice <= 6) {
    const mouseKind = pick(rng, [
      MOUSE_MOVE,
      MOUSE_DRAG,
      MOUSE_DOWN,
      MOUSE_UP,
      MOUSE_WHEEL,
    ] as const);
    return mouseEvent(mouseKind, {
      x: randomInt(rng, -4, 24),
      y: randomInt(rng, -2, 8),
      wheelX: randomInt(rng, -4, 4),
      wheelY: randomInt(rng, -4, 4),
    });
  }
  if (choice === 7)
    return keyEvent(randomInt(rng, -64, 256), pick(rng, ["down", "up", "repeat"] as const));
  return randomNonRoutingEvent(rng);
}

function expectedMouseRoute(
  event: ZrevEvent,
  pressedId: string | null,
  hitTestTargetId: string | null,
  enabledById: EnabledById,
  pressableIds: ReadonlySet<string> | undefined,
): RoutingResult {
  if (event.kind !== "mouse") return {};

  if (event.mouseKind === MOUSE_DOWN) {
    if (hitTestTargetId !== null && isEnabled(enabledById, hitTestTargetId)) {
      return {
        nextFocusedId: hitTestTargetId,
        nextPressedId: isPressable(pressableIds, hitTestTargetId) ? hitTestTargetId : null,
      };
    }
    return { nextPressedId: null };
  }

  if (event.mouseKind === MOUSE_UP) {
    if (
      pressedId !== null &&
      hitTestTargetId === pressedId &&
      isEnabled(enabledById, pressedId) &&
      isPressable(pressableIds, pressedId)
    ) {
      return { nextPressedId: null, action: { id: pressedId, action: "press" } };
    }
    return { nextPressedId: null };
  }

  return {};
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

function randomWheelCtx(rng: Rng): WheelRoutingCtx {
  const viewportWidth = randomInt(rng, 0, 40);
  const viewportHeight = randomInt(rng, 0, 20);
  const contentWidth = viewportWidth + randomInt(rng, 0, 80);
  const contentHeight = viewportHeight + randomInt(rng, 0, 60);
  const maxScrollX = Math.max(0, contentWidth - viewportWidth);
  const maxScrollY = Math.max(0, contentHeight - viewportHeight);
  return {
    scrollX: randomInt(rng, 0, maxScrollX),
    scrollY: randomInt(rng, 0, maxScrollY),
    contentWidth,
    contentHeight,
    viewportWidth,
    viewportHeight,
  };
}

function expectedWheelRoute(event: ZrevEvent, ctx: WheelRoutingCtx): WheelRoutingResult {
  if (event.kind !== "mouse" || event.mouseKind !== MOUSE_WHEEL) return {};

  const maxScrollX = Math.max(0, ctx.contentWidth - ctx.viewportWidth);
  const maxScrollY = Math.max(0, ctx.contentHeight - ctx.viewportHeight);
  const nextScrollX = clamp(ctx.scrollX + event.wheelX * SCROLL_LINES, 0, maxScrollX);
  const nextScrollY = clamp(ctx.scrollY + event.wheelY * SCROLL_LINES, 0, maxScrollY);

  if (nextScrollX === ctx.scrollX && nextScrollY === ctx.scrollY) return {};
  return { nextScrollX, nextScrollY };
}

type HitLeaf = Readonly<{
  id: string;
  vnode: VNode;
  rect: Rect;
  enabled: boolean;
  pressable: boolean;
  focusable: boolean;
}>;

function buttonNode(id: string, disabled: boolean, hidden: boolean): VNode {
  return {
    kind: "button",
    props: { id, label: id, disabled, ...(hidden ? { display: false } : {}) },
  } as unknown as VNode;
}

function inputNode(id: string): VNode {
  return { kind: "input", props: { id, value: "" } } as unknown as VNode;
}

function textNode(id: string): VNode {
  return { kind: "text", text: id, props: { id } } as unknown as VNode;
}

function rootNode(children: readonly VNode[]): VNode {
  return { kind: "row", props: {}, children: Object.freeze([...children]) } as unknown as VNode;
}

function layoutNode(vnode: VNode, rect: Rect, children: readonly LayoutTree[] = []): LayoutTree {
  return { vnode, rect, children: Object.freeze([...children]) };
}

function randomHitTree(
  rng: Rng,
): Readonly<{ root: VNode; layout: LayoutTree; leaves: readonly HitLeaf[] }> {
  const leafCount = randomInt(rng, 1, 7);
  const leaves: HitLeaf[] = [];
  const layoutChildren: LayoutTree[] = [];
  let x = 0;

  for (let i = 0; i < leafCount; i++) {
    const id = `hit.${String(i)}`;
    const kind = pick(rng, ["button", "disabledButton", "hiddenButton", "input", "text"] as const);
    const width = kind === "hiddenButton" ? 0 : randomInt(rng, 1, 5);
    const rect: Rect = { x, y: 0, w: width, h: width === 0 ? 0 : 1 };

    const leaf =
      kind === "input"
        ? { id, vnode: inputNode(id), rect, enabled: true, pressable: false, focusable: true }
        : kind === "text"
          ? { id, vnode: textNode(id), rect, enabled: false, pressable: false, focusable: false }
          : kind === "disabledButton"
            ? {
                id,
                vnode: buttonNode(id, true, false),
                rect,
                enabled: false,
                pressable: false,
                focusable: false,
              }
            : kind === "hiddenButton"
              ? {
                  id,
                  vnode: buttonNode(id, false, true),
                  rect,
                  enabled: false,
                  pressable: false,
                  focusable: false,
                }
              : {
                  id,
                  vnode: buttonNode(id, false, false),
                  rect,
                  enabled: true,
                  pressable: true,
                  focusable: true,
                };

    leaves.push(leaf);
    layoutChildren.push(layoutNode(leaf.vnode, rect));
    x += Math.max(1, width);
  }

  const root = rootNode(leaves.map((leaf) => leaf.vnode));
  return {
    root,
    layout: layoutNode(root, { x: 0, y: 0, w: Math.max(1, x), h: 1 }, layoutChildren),
    leaves: Object.freeze(leaves),
  };
}

function contains(rect: Rect, x: number, y: number): boolean {
  return x >= rect.x && x < rect.x + rect.w && y >= rect.y && y < rect.y + rect.h;
}

function expectedHitTarget(leaves: readonly HitLeaf[], x: number, y: number): string | null {
  for (const leaf of leaves) {
    if (leaf.focusable && leaf.enabled && contains(leaf.rect, x, y)) return leaf.id;
  }
  return null;
}

test("routeKey fuzz: bounded streams only tab-focus or press the enabled focused id", async () => {
  await runFuzz({ seed: 0x4655_5a4b, iterations: 512, label: "router-key" }, (ctx) => {
    const focusList = randomIds(ctx.rng, 6);
    const enabledById = randomEnabledById(ctx.rng, focusList);
    const pressableIds = randomPressableIds(ctx.rng, focusList);
    let focusedId = randomKnownUnknownOrNull(ctx.rng, focusList);
    const steps = randomInt(ctx.rng, 1, 32);
    ctx.note(`focusable=${String(focusList.length)} steps=${String(steps)}`);

    for (let step = 0; step < steps; step++) {
      const event = randomKeyRoutingEvent(ctx.rng);
      const expected = expectedKeyRoute(event, focusedId, focusList, enabledById, pressableIds);
      const actual = routeKey(event, {
        focusedId,
        focusList,
        enabledById,
        ...(pressableIds ? { pressableIds } : {}),
      });

      assert.deepEqual(actual, expected);

      if (actual.action) {
        assert.equal(actual.action.id, focusedId);
        assert.equal(isEnabled(enabledById, actual.action.id), true);
        assert.equal(isPressable(pressableIds, actual.action.id), true);
      }

      if (actual.nextFocusedId !== undefined) focusedId = actual.nextFocusedId;
    }
  });
});

test("routeMouse fuzz: bounded streams cannot activate disabled, unknown, or non-pressable targets", async () => {
  await runFuzz({ seed: 0x4655_5a4d, iterations: 512, label: "router-mouse" }, (ctx) => {
    const ids = randomIds(ctx.rng, 7);
    const enabledById = randomEnabledById(ctx.rng, ids);
    const pressableIds = randomPressableIds(ctx.rng, ids);
    let pressedId = randomKnownUnknownOrNull(ctx.rng, ids);
    const steps = randomInt(ctx.rng, 1, 40);
    ctx.note(`targets=${String(ids.length)} steps=${String(steps)}`);

    for (let step = 0; step < steps; step++) {
      const event = randomMouseRoutingEvent(ctx.rng);
      const hitTestTargetId = randomKnownUnknownOrNull(ctx.rng, ids);
      const expected = expectedMouseRoute(
        event,
        pressedId,
        hitTestTargetId,
        enabledById,
        pressableIds,
      );
      const actual = routeMouse(event, {
        pressedId,
        hitTestTargetId,
        enabledById,
        ...(pressableIds ? { pressableIds } : {}),
      });

      assert.deepEqual(actual, expected);

      if (actual.action) {
        assert.equal(event.kind, "mouse");
        assert.equal(event.kind === "mouse" ? event.mouseKind : null, MOUSE_UP);
        assert.equal(actual.action.id, pressedId);
        assert.equal(actual.action.id, hitTestTargetId);
        assert.equal(isEnabled(enabledById, actual.action.id), true);
        assert.equal(isPressable(pressableIds, actual.action.id), true);
      }

      if (actual.nextPressedId !== undefined) pressedId = actual.nextPressedId;
    }
  });
});

test("hit-tested mouse fuzz: hidden, disabled, and non-focusable cells do not route actions", async () => {
  await runFuzz({ seed: 0x4655_4854, iterations: 384, label: "router-hit-test" }, (ctx) => {
    const tree = randomHitTree(ctx.rng);
    const enabledById = new Map<string, boolean>();
    const pressableIds = new Set<string>();
    for (const leaf of tree.leaves) {
      if (leaf.enabled) enabledById.set(leaf.id, true);
      if (leaf.pressable) pressableIds.add(leaf.id);
    }

    const x = randomInt(ctx.rng, -2, tree.layout.rect.w + 2);
    const y = randomInt(ctx.rng, -1, 2);
    const expectedTarget = expectedHitTarget(tree.leaves, x, y);
    ctx.note(`leaves=${String(tree.leaves.length)} x=${String(x)} y=${String(y)}`);

    const hitTestTargetId = hitTestFocusable(tree.root, tree.layout, x, y);
    assert.equal(hitTestTargetId, expectedTarget);

    const down = routeMouse(mouseEvent(MOUSE_DOWN, { x, y }), {
      pressedId: null,
      hitTestTargetId,
      enabledById,
      pressableIds,
    });
    const up = routeMouse(mouseEvent(MOUSE_UP, { x, y }), {
      pressedId: down.nextPressedId ?? null,
      hitTestTargetId,
      enabledById,
      pressableIds,
    });

    if (expectedTarget === null || !pressableIds.has(expectedTarget)) {
      assert.equal(up.action, undefined);
      return;
    }

    assert.deepEqual(up.action, { id: expectedTarget, action: "press" });
  });
});

test("routeWheel fuzz: wheel deltas stay clamped and unsupported events are no-ops", async () => {
  await runFuzz({ seed: 0x4655_5a57, iterations: 768, label: "router-wheel" }, (ctx) => {
    const routingCtx = randomWheelCtx(ctx.rng);
    const event =
      randomInt(ctx.rng, 0, 3) === 0
        ? randomNonRoutingEvent(ctx.rng)
        : mouseEvent(
            pick(ctx.rng, [MOUSE_MOVE, MOUSE_DRAG, MOUSE_DOWN, MOUSE_UP, MOUSE_WHEEL] as const),
            {
              x: randomInt(ctx.rng, -4, 40),
              y: randomInt(ctx.rng, -4, 20),
              wheelX: randomInt(ctx.rng, -6, 6),
              wheelY: randomInt(ctx.rng, -6, 6),
            },
          );
    ctx.note(
      `viewport=${String(routingCtx.viewportWidth)}x${String(routingCtx.viewportHeight)} content=${String(
        routingCtx.contentWidth,
      )}x${String(routingCtx.contentHeight)}`,
    );

    const actual = routeWheel(event, routingCtx);
    const expected = expectedWheelRoute(event, routingCtx);
    assert.deepEqual(actual, expected);

    if (actual.nextScrollX !== undefined) {
      assert.ok(actual.nextScrollX >= 0);
      assert.ok(
        actual.nextScrollX <= Math.max(0, routingCtx.contentWidth - routingCtx.viewportWidth),
      );
    }
    if (actual.nextScrollY !== undefined) {
      assert.ok(actual.nextScrollY >= 0);
      assert.ok(
        actual.nextScrollY <= Math.max(0, routingCtx.contentHeight - routingCtx.viewportHeight),
      );
    }
  });
});
