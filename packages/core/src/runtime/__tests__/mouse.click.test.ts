import { assert, describe, test } from "@rezi-ui/testkit";
import type { ZrevEvent } from "../../events.js";
import type { VNode } from "../../index.js";
import { hitTestFocusable } from "../../layout/hitTest.js";
import type { LayoutTree } from "../../layout/layout.js";
import type { Rect } from "../../layout/types.js";
import { routeMouse } from "../router.js";

const MOUSE_KIND_MOVE = 1;
const MOUSE_KIND_DOWN = 3;
const MOUSE_KIND_UP = 4;

type RouteWithHitOpts = Readonly<{
  tree: VNode;
  layoutTree: LayoutTree;
  pressedId: string | null;
  enabledById: ReadonlyMap<string, boolean>;
  pressableIds?: ReadonlySet<string>;
}>;

function mouseEvent(mouseKind: 1 | 2 | 3 | 4 | 5, x = 0, y = 0): ZrevEvent {
  return {
    kind: "mouse",
    timeMs: 0,
    x,
    y,
    mouseKind,
    mods: 0,
    buttons: 0,
    wheelX: 0,
    wheelY: 0,
  };
}

function keyEvent(): ZrevEvent {
  return {
    kind: "key",
    timeMs: 0,
    key: 1,
    mods: 0,
    action: "down",
  };
}

function buttonNode(id: string, opts: Readonly<{ disabled?: boolean }> = {}): VNode {
  const props: { id: string; label: string; disabled?: boolean } = { id, label: id };
  if (opts.disabled === true) props.disabled = true;
  return { kind: "button", props } as unknown as VNode;
}

function inputNode(id: string): VNode {
  return { kind: "input", props: { id, value: "" } } as unknown as VNode;
}

function textNode(text: string): VNode {
  return { kind: "text", text, props: {} } as unknown as VNode;
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

function routeWithHit(event: ZrevEvent, opts: RouteWithHitOpts) {
  const hitTestTargetId =
    event.kind === "mouse" ? hitTestFocusable(opts.tree, opts.layoutTree, event.x, event.y) : null;

  const baseCtx = {
    pressedId: opts.pressedId,
    hitTestTargetId,
    enabledById: opts.enabledById,
  };

  const ctx = opts.pressableIds ? { ...baseCtx, pressableIds: opts.pressableIds } : baseCtx;
  return { hitTestTargetId, result: routeMouse(event, ctx) };
}

describe("mouse click lifecycle edges", () => {
  test("press/release on same target activates", () => {
    const enabledById = new Map<string, boolean>([["a", true]]);
    const down = routeMouse(mouseEvent(MOUSE_KIND_DOWN), {
      pressedId: null,
      hitTestTargetId: "a",
      enabledById,
    });
    assert.equal(down.nextFocusedId, "a");
    assert.equal(down.nextPressedId, "a");
    assert.equal(down.action, undefined);

    const up = routeMouse(mouseEvent(MOUSE_KIND_UP), {
      pressedId: down.nextPressedId ?? null,
      hitTestTargetId: "a",
      enabledById,
    });
    assert.equal(up.nextPressedId, null);
    assert.deepEqual(up.action, { id: "a", action: "press" });
  });

  test("press A/release B does not activate", () => {
    const enabledById = new Map<string, boolean>([
      ["a", true],
      ["b", true],
    ]);
    const down = routeMouse(mouseEvent(MOUSE_KIND_DOWN), {
      pressedId: null,
      hitTestTargetId: "a",
      enabledById,
    });
    assert.equal(down.nextPressedId, "a");

    const up = routeMouse(mouseEvent(MOUSE_KIND_UP), {
      pressedId: down.nextPressedId ?? null,
      hitTestTargetId: "b",
      enabledById,
    });
    assert.equal(up.nextPressedId, null);
    assert.equal(up.action, undefined);
  });

  test("press A/release outside does not activate", () => {
    const enabledById = new Map<string, boolean>([["a", true]]);
    const down = routeMouse(mouseEvent(MOUSE_KIND_DOWN), {
      pressedId: null,
      hitTestTargetId: "a",
      enabledById,
    });
    assert.equal(down.nextPressedId, "a");

    const up = routeMouse(mouseEvent(MOUSE_KIND_UP), {
      pressedId: down.nextPressedId ?? null,
      hitTestTargetId: null,
      enabledById,
    });
    assert.equal(up.nextPressedId, null);
    assert.equal(up.action, undefined);
  });

  test("disabled target on down does not press or focus", () => {
    const down = routeMouse(mouseEvent(MOUSE_KIND_DOWN), {
      pressedId: null,
      hitTestTargetId: "disabled-btn",
      enabledById: new Map<string, boolean>([["disabled-btn", false]]),
    });
    assert.equal(down.nextPressedId, null);
    assert.equal("nextFocusedId" in down, false);
    assert.equal(down.action, undefined);
  });

  test("disabled target on up does not activate", () => {
    const up = routeMouse(mouseEvent(MOUSE_KIND_UP), {
      pressedId: "disabled-btn",
      hitTestTargetId: "disabled-btn",
      enabledById: new Map<string, boolean>([["disabled-btn", false]]),
    });
    assert.equal(up.nextPressedId, null);
    assert.equal(up.action, undefined);
  });

  test("non-mouse events are ignored", () => {
    const res = routeMouse(keyEvent(), {
      pressedId: "a",
      hitTestTargetId: "a",
      enabledById: new Map<string, boolean>([["a", true]]),
    });
    assert.deepEqual(res, {});
  });

  test("mouse move is ignored and does not mutate pressed state", () => {
    const res = routeMouse(mouseEvent(MOUSE_KIND_MOVE, 3, 2), {
      pressedId: "a",
      hitTestTargetId: "a",
      enabledById: new Map<string, boolean>([["a", true]]),
    });
    assert.deepEqual(res, {});
  });

  test("non-focusable hit area yields no click focus/press", () => {
    const title = textNode("title");
    const button = buttonNode("btn");
    const root = containerNode([title, button]);
    const layoutTree = layoutNode(root, { x: 0, y: 0, w: 10, h: 1 }, [
      layoutNode(title, { x: 0, y: 0, w: 4, h: 1 }),
      layoutNode(button, { x: 4, y: 0, w: 3, h: 1 }),
    ]);

    const down = routeWithHit(mouseEvent(MOUSE_KIND_DOWN, 1, 0), {
      tree: root,
      layoutTree,
      pressedId: null,
      enabledById: new Map<string, boolean>([["btn", true]]),
    });
    assert.equal(down.hitTestTargetId, null);
    assert.equal(down.result.nextPressedId, null);
    assert.equal("nextFocusedId" in down.result, false);
  });

  test("focusable hit area yields click focus/press", () => {
    const title = textNode("title");
    const button = buttonNode("btn");
    const root = containerNode([title, button]);
    const layoutTree = layoutNode(root, { x: 0, y: 0, w: 10, h: 1 }, [
      layoutNode(title, { x: 0, y: 0, w: 4, h: 1 }),
      layoutNode(button, { x: 4, y: 0, w: 3, h: 1 }),
    ]);

    const down = routeWithHit(mouseEvent(MOUSE_KIND_DOWN, 4, 0), {
      tree: root,
      layoutTree,
      pressedId: null,
      enabledById: new Map<string, boolean>([["btn", true]]),
    });
    assert.equal(down.hitTestTargetId, "btn");
    assert.equal(down.result.nextFocusedId, "btn");
    assert.equal(down.result.nextPressedId, "btn");
  });

  test("pressableIds gates down: focusable target can focus but cannot press", () => {
    const down = routeMouse(mouseEvent(MOUSE_KIND_DOWN), {
      pressedId: null,
      hitTestTargetId: "input-1",
      enabledById: new Map<string, boolean>([["input-1", true]]),
      pressableIds: new Set<string>(["btn"]),
    });
    assert.equal(down.nextFocusedId, "input-1");
    assert.equal(down.nextPressedId, null);
    assert.equal(down.action, undefined);
  });

  test("pressableIds gates up: same target does not activate when not pressable", () => {
    const up = routeMouse(mouseEvent(MOUSE_KIND_UP), {
      pressedId: "input-1",
      hitTestTargetId: "input-1",
      enabledById: new Map<string, boolean>([["input-1", true]]),
      pressableIds: new Set<string>(["btn"]),
    });
    assert.equal(up.nextPressedId, null);
    assert.equal(up.action, undefined);
  });

  test("pressableIds allowlisted target activates on same-target release", () => {
    const enabledById = new Map<string, boolean>([["btn", true]]);
    const pressableIds = new Set<string>(["btn"]);
    const down = routeMouse(mouseEvent(MOUSE_KIND_DOWN), {
      pressedId: null,
      hitTestTargetId: "btn",
      enabledById,
      pressableIds,
    });
    assert.equal(down.nextPressedId, "btn");

    const up = routeMouse(mouseEvent(MOUSE_KIND_UP), {
      pressedId: down.nextPressedId ?? null,
      hitTestTargetId: "btn",
      enabledById,
      pressableIds,
    });
    assert.equal(up.nextPressedId, null);
    assert.deepEqual(up.action, { id: "btn", action: "press" });
  });

  test("omitting pressableIds keeps MVP behavior (enabled target is pressable)", () => {
    const enabledById = new Map<string, boolean>([["input-1", true]]);
    const down = routeMouse(mouseEvent(MOUSE_KIND_DOWN), {
      pressedId: null,
      hitTestTargetId: "input-1",
      enabledById,
    });
    assert.equal(down.nextFocusedId, "input-1");
    assert.equal(down.nextPressedId, "input-1");

    const up = routeMouse(mouseEvent(MOUSE_KIND_UP), {
      pressedId: down.nextPressedId ?? null,
      hitTestTargetId: "input-1",
      enabledById,
    });
    assert.deepEqual(up.action, { id: "input-1", action: "press" });
  });

  test("overlap hit test picks topmost (later sibling)", () => {
    const first = buttonNode("first");
    const second = buttonNode("second");
    const root = containerNode([first, second]);
    const layoutTree = layoutNode(root, { x: 0, y: 0, w: 6, h: 2 }, [
      layoutNode(first, { x: 1, y: 0, w: 4, h: 1 }),
      layoutNode(second, { x: 2, y: 0, w: 4, h: 1 }),
    ]);

    assert.equal(hitTestFocusable(root, layoutTree, 2, 0), "second");
  });

  test("overlap click activates the topmost hit target", () => {
    const first = buttonNode("first");
    const second = buttonNode("second");
    const root = containerNode([first, second]);
    const layoutTree = layoutNode(root, { x: 0, y: 0, w: 6, h: 2 }, [
      layoutNode(first, { x: 1, y: 0, w: 4, h: 1 }),
      layoutNode(second, { x: 2, y: 0, w: 4, h: 1 }),
    ]);
    const enabledById = new Map<string, boolean>([
      ["first", true],
      ["second", true],
    ]);

    const down = routeWithHit(mouseEvent(MOUSE_KIND_DOWN, 2, 0), {
      tree: root,
      layoutTree,
      pressedId: null,
      enabledById,
    });
    const up = routeWithHit(mouseEvent(MOUSE_KIND_UP, 2, 0), {
      tree: root,
      layoutTree,
      pressedId: down.result.nextPressedId ?? null,
      enabledById,
    });
    assert.deepEqual(up.result.action, { id: "second", action: "press" });
  });

  test("clipped-out hit area returns null and does not focus on down", () => {
    const child = buttonNode("clipped-btn");
    const root = containerNode([child]);
    const layoutTree = layoutNode(root, { x: 0, y: 0, w: 3, h: 1 }, [
      layoutNode(child, { x: 2, y: 0, w: 6, h: 1 }),
    ]);

    const down = routeWithHit(mouseEvent(MOUSE_KIND_DOWN, 4, 0), {
      tree: root,
      layoutTree,
      pressedId: null,
      enabledById: new Map<string, boolean>([["clipped-btn", true]]),
    });
    assert.equal(down.hitTestTargetId, null);
    assert.equal(down.result.nextPressedId, null);
    assert.equal("nextFocusedId" in down.result, false);
  });

  test("clipped visible intersection can still activate", () => {
    const child = buttonNode("clipped-btn");
    const root = containerNode([child]);
    const layoutTree = layoutNode(root, { x: 0, y: 0, w: 3, h: 1 }, [
      layoutNode(child, { x: 2, y: 0, w: 6, h: 1 }),
    ]);
    const enabledById = new Map<string, boolean>([["clipped-btn", true]]);

    const down = routeWithHit(mouseEvent(MOUSE_KIND_DOWN, 2, 0), {
      tree: root,
      layoutTree,
      pressedId: null,
      enabledById,
    });
    const up = routeWithHit(mouseEvent(MOUSE_KIND_UP, 2, 0), {
      tree: root,
      layoutTree,
      pressedId: down.result.nextPressedId ?? null,
      enabledById,
    });
    assert.deepEqual(up.result.action, { id: "clipped-btn", action: "press" });
  });

  test("coordinate forwarding: left coordinate routes to left button", () => {
    const left = buttonNode("left");
    const right = buttonNode("right");
    const root = containerNode([left, right]);
    const layoutTree = layoutNode(root, { x: 0, y: 0, w: 8, h: 1 }, [
      layoutNode(left, { x: 0, y: 0, w: 4, h: 1 }),
      layoutNode(right, { x: 4, y: 0, w: 4, h: 1 }),
    ]);
    const enabledById = new Map<string, boolean>([
      ["left", true],
      ["right", true],
    ]);

    const down = routeWithHit(mouseEvent(MOUSE_KIND_DOWN, 1, 0), {
      tree: root,
      layoutTree,
      pressedId: null,
      enabledById,
    });
    const up = routeWithHit(mouseEvent(MOUSE_KIND_UP, 1, 0), {
      tree: root,
      layoutTree,
      pressedId: down.result.nextPressedId ?? null,
      enabledById,
    });
    assert.equal(down.hitTestTargetId, "left");
    assert.deepEqual(up.result.action, { id: "left", action: "press" });
  });

  test("coordinate forwarding: right coordinate routes to right button", () => {
    const left = buttonNode("left");
    const right = buttonNode("right");
    const root = containerNode([left, right]);
    const layoutTree = layoutNode(root, { x: 0, y: 0, w: 8, h: 1 }, [
      layoutNode(left, { x: 0, y: 0, w: 4, h: 1 }),
      layoutNode(right, { x: 4, y: 0, w: 4, h: 1 }),
    ]);
    const enabledById = new Map<string, boolean>([
      ["left", true],
      ["right", true],
    ]);

    const down = routeWithHit(mouseEvent(MOUSE_KIND_DOWN, 5, 0), {
      tree: root,
      layoutTree,
      pressedId: null,
      enabledById,
    });
    const up = routeWithHit(mouseEvent(MOUSE_KIND_UP, 5, 0), {
      tree: root,
      layoutTree,
      pressedId: down.result.nextPressedId ?? null,
      enabledById,
    });
    assert.equal(down.hitTestTargetId, "right");
    assert.deepEqual(up.result.action, { id: "right", action: "press" });
  });

  test("boundary: left/top edges are inclusive", () => {
    const edge = buttonNode("edge");
    const root = containerNode([edge]);
    const layoutTree = layoutNode(root, { x: 0, y: 0, w: 12, h: 6 }, [
      layoutNode(edge, { x: 2, y: 1, w: 3, h: 2 }),
    ]);
    const enabledById = new Map<string, boolean>([["edge", true]]);

    const down = routeWithHit(mouseEvent(MOUSE_KIND_DOWN, 2, 1), {
      tree: root,
      layoutTree,
      pressedId: null,
      enabledById,
    });
    const up = routeWithHit(mouseEvent(MOUSE_KIND_UP, 2, 1), {
      tree: root,
      layoutTree,
      pressedId: down.result.nextPressedId ?? null,
      enabledById,
    });
    assert.equal(down.hitTestTargetId, "edge");
    assert.deepEqual(up.result.action, { id: "edge", action: "press" });
  });

  test("boundary: right edge is exclusive", () => {
    const edge = buttonNode("edge");
    const root = containerNode([edge]);
    const layoutTree = layoutNode(root, { x: 0, y: 0, w: 12, h: 6 }, [
      layoutNode(edge, { x: 2, y: 1, w: 3, h: 2 }),
    ]);

    const down = routeWithHit(mouseEvent(MOUSE_KIND_DOWN, 5, 1), {
      tree: root,
      layoutTree,
      pressedId: null,
      enabledById: new Map<string, boolean>([["edge", true]]),
    });
    assert.equal(down.hitTestTargetId, null);
    assert.equal(down.result.nextPressedId, null);
  });

  test("boundary: bottom edge is exclusive", () => {
    const edge = buttonNode("edge");
    const root = containerNode([edge]);
    const layoutTree = layoutNode(root, { x: 0, y: 0, w: 12, h: 6 }, [
      layoutNode(edge, { x: 2, y: 1, w: 3, h: 2 }),
    ]);

    const down = routeWithHit(mouseEvent(MOUSE_KIND_DOWN, 2, 3), {
      tree: root,
      layoutTree,
      pressedId: null,
      enabledById: new Map<string, boolean>([["edge", true]]),
    });
    assert.equal(down.hitTestTargetId, null);
    assert.equal(down.result.nextPressedId, null);
  });

  test("input target can be focused without being pressable", () => {
    const input = inputNode("name");
    const root = containerNode([input]);
    const layoutTree = layoutNode(root, { x: 0, y: 0, w: 6, h: 1 }, [
      layoutNode(input, { x: 0, y: 0, w: 6, h: 1 }),
    ]);

    const down = routeWithHit(mouseEvent(MOUSE_KIND_DOWN, 0, 0), {
      tree: root,
      layoutTree,
      pressedId: null,
      enabledById: new Map<string, boolean>([["name", true]]),
      pressableIds: new Set<string>(),
    });
    assert.equal(down.hitTestTargetId, "name");
    assert.equal(down.result.nextFocusedId, "name");
    assert.equal(down.result.nextPressedId, null);
  });
});
