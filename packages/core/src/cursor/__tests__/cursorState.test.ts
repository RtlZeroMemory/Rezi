import { assert, describe, test } from "@rezi-ui/testkit";
import {
  CURSOR_DEFAULTS,
  computeInputCursorPosition,
  createCursorStateCollector,
} from "../cursorState.js";

describe("cursor state", () => {
  test("resolves null when no request was made", () => {
    const collector = createCursorStateCollector();
    assert.equal(collector.resolve(), null);
  });

  test("resolves last show request (last writer wins)", () => {
    const collector = createCursorStateCollector();
    collector.request({ kind: "show", x: 1, y: 2, shape: 0, blink: true });
    collector.request({ kind: "show", x: 5, y: 6, shape: 2, blink: false });

    const resolved = collector.resolve();
    assert.deepEqual(resolved, {
      x: 5,
      y: 6,
      shape: 2,
      visible: true,
      blink: false,
    });
  });

  test("hide request clears visibility with sentinel coordinates", () => {
    const collector = createCursorStateCollector(1, true);
    collector.request({ kind: "show", x: 2, y: 3, shape: 2, blink: true });
    collector.request({ kind: "hide" });

    const resolved = collector.resolve();
    assert.deepEqual(resolved, {
      x: -1,
      y: -1,
      shape: 1,
      visible: false,
      blink: false,
    });
  });

  test("reset clears last request", () => {
    const collector = createCursorStateCollector();
    collector.request({ kind: "show", x: 1, y: 1, shape: 0, blink: true });
    assert.notEqual(collector.resolve(), null);
    collector.reset();
    assert.equal(collector.resolve(), null);
  });

  test("computes input cursor position with prefix and cursor offset", () => {
    const pos = computeInputCursorPosition(10, 4, 3, 2);
    assert.deepEqual(pos, { x: 15, y: 4 });
  });

  test("exposes default cursor presets", () => {
    assert.deepEqual(CURSOR_DEFAULTS.input, { shape: 2, blink: true });
    assert.deepEqual(CURSOR_DEFAULTS.selection, { shape: 0, blink: true });
    assert.deepEqual(CURSOR_DEFAULTS.staticUnderline, { shape: 1, blink: false });
  });
});
