import { assert, describe, test } from "@rezi-ui/testkit";
import type { ZrevEvent } from "../../events.js";
import { type VirtualListWheelCtx, routeVirtualListWheel } from "../router.js";

function wheelEvent(
  wheelY: number,
  opts: Readonly<{
    wheelX?: number;
    mouseKind?: 1 | 2 | 3 | 4 | 5;
  }> = {},
): ZrevEvent {
  return {
    kind: "mouse",
    timeMs: 0,
    x: 0,
    y: 0,
    mouseKind: opts.mouseKind ?? 5,
    mods: 0,
    buttons: 0,
    wheelX: opts.wheelX ?? 0,
    wheelY,
  };
}

function keyEvent(): ZrevEvent {
  return {
    kind: "key",
    timeMs: 0,
    key: 21,
    mods: 0,
    action: "down",
  };
}

function applyWheelSequence(
  ctx: VirtualListWheelCtx,
  wheelYs: readonly number[],
): Readonly<{ finalScrollTop: number; emitted: readonly number[] }> {
  let scrollTop = ctx.scrollTop;
  const emitted: number[] = [];
  for (const wheelY of wheelYs) {
    const wheelCtx: VirtualListWheelCtx = {
      scrollTop,
      totalHeight: ctx.totalHeight,
      viewportHeight: ctx.viewportHeight,
      ...(ctx.scrollDirection === undefined ? {} : { scrollDirection: ctx.scrollDirection }),
    };
    const res = routeVirtualListWheel(wheelEvent(wheelY), wheelCtx);
    if (res.nextScrollTop !== undefined) {
      scrollTop = res.nextScrollTop;
      emitted.push(res.nextScrollTop);
    }
  }
  return Object.freeze({
    finalScrollTop: scrollTop,
    emitted: Object.freeze(emitted),
  });
}

describe("mouse scroll routing (deterministic)", () => {
  test("non-mouse events are ignored (non-consumed semantics)", () => {
    const res = routeVirtualListWheel(keyEvent(), {
      scrollTop: 10,
      totalHeight: 100,
      viewportHeight: 20,
    });
    assert.deepEqual(res, {});
  });

  test("mouse events that are not wheel are ignored", () => {
    const res = routeVirtualListWheel(wheelEvent(2, { mouseKind: 3 }), {
      scrollTop: 10,
      totalHeight: 100,
      viewportHeight: 20,
    });
    assert.deepEqual(res, {});
  });

  test("wheel down routes to positive vertical scroll delta", () => {
    const res = routeVirtualListWheel(wheelEvent(1), {
      scrollTop: 10,
      totalHeight: 100,
      viewportHeight: 20,
    });
    assert.equal(res.nextScrollTop, 13);
  });

  test("wheel up routes to negative vertical scroll delta", () => {
    const res = routeVirtualListWheel(wheelEvent(-2), {
      scrollTop: 20,
      totalHeight: 100,
      viewportHeight: 20,
    });
    assert.equal(res.nextScrollTop, 14);
  });

  test("natural scroll direction flips wheel sign", () => {
    const res = routeVirtualListWheel(wheelEvent(1), {
      scrollTop: 10,
      totalHeight: 100,
      viewportHeight: 20,
      scrollDirection: "natural",
    });
    assert.equal(res.nextScrollTop, 7);
  });

  test("traditional scroll direction stays default when explicit", () => {
    const res = routeVirtualListWheel(wheelEvent(1), {
      scrollTop: 10,
      totalHeight: 100,
      viewportHeight: 20,
      scrollDirection: "traditional",
    });
    assert.equal(res.nextScrollTop, 13);
  });

  test("scroll result clamps at lower bound", () => {
    const res = routeVirtualListWheel(wheelEvent(-5), {
      scrollTop: 4,
      totalHeight: 100,
      viewportHeight: 20,
    });
    assert.equal(res.nextScrollTop, 0);
  });

  test("scroll result clamps at upper bound", () => {
    const res = routeVirtualListWheel(wheelEvent(20), {
      scrollTop: 70,
      totalHeight: 100,
      viewportHeight: 20,
    });
    assert.equal(res.nextScrollTop, 80);
  });

  test("already at top + wheel up produces no change", () => {
    const res = routeVirtualListWheel(wheelEvent(-1), {
      scrollTop: 0,
      totalHeight: 100,
      viewportHeight: 20,
    });
    assert.deepEqual(res, {});
  });

  test("already at bottom + wheel down produces no change", () => {
    const res = routeVirtualListWheel(wheelEvent(1), {
      scrollTop: 80,
      totalHeight: 100,
      viewportHeight: 20,
    });
    assert.deepEqual(res, {});
  });

  test("rapid wheel events apply deterministically in order", () => {
    const sequence = applyWheelSequence(
      {
        scrollTop: 50,
        totalHeight: 500,
        viewportHeight: 20,
      },
      Object.freeze([1, 1, -2, 5, -1]),
    );

    // (1 + 1 - 2 + 5 - 1) * 3 = +12 from initial 50.
    assert.equal(sequence.finalScrollTop, 62);
    assert.deepEqual(sequence.emitted, [53, 56, 50, 65, 62]);
  });

  test("empty/zero-height content does not scroll", () => {
    const res = routeVirtualListWheel(wheelEvent(3), {
      scrollTop: 0,
      totalHeight: 0,
      viewportHeight: 20,
    });
    assert.deepEqual(res, {});
  });

  test("viewport larger than content does not scroll", () => {
    const res = routeVirtualListWheel(wheelEvent(3), {
      scrollTop: 0,
      totalHeight: 10,
      viewportHeight: 20,
    });
    assert.deepEqual(res, {});
  });

  test("same wheelY yields consistent delta when unclamped", () => {
    const a = routeVirtualListWheel(wheelEvent(2), {
      scrollTop: 10,
      totalHeight: 200,
      viewportHeight: 20,
    });
    const b = routeVirtualListWheel(wheelEvent(2), {
      scrollTop: 90,
      totalHeight: 200,
      viewportHeight: 20,
    });
    assert.equal((a.nextScrollTop ?? 0) - 10, 6);
    assert.equal((b.nextScrollTop ?? 0) - 90, 6);
  });

  test("horizontal wheel is currently ignored when wheelY is zero", () => {
    const res = routeVirtualListWheel(wheelEvent(0, { wheelX: 7 }), {
      scrollTop: 10,
      totalHeight: 200,
      viewportHeight: 20,
    });
    assert.deepEqual(res, {});
  });
});
