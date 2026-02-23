import assert from "node:assert/strict";
import { describe, test } from "node:test";
import {
  ZR_MOUSE_DOWN,
  ZR_MOUSE_DRAG,
  ZR_MOUSE_MOVE,
  ZR_MOUSE_UP,
  ZR_MOUSE_WHEEL,
} from "../mouseKinds.js";

describe("mouseKinds ABI mapping", () => {
  test("matches zr_event.h values", () => {
    assert.equal(ZR_MOUSE_MOVE, 1);
    assert.equal(ZR_MOUSE_DRAG, 2);
    assert.equal(ZR_MOUSE_DOWN, 3);
    assert.equal(ZR_MOUSE_UP, 4);
    assert.equal(ZR_MOUSE_WHEEL, 5);
  });
});
