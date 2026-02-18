import { assert, describe, test } from "@rezi-ui/testkit";
import { ensureCursorVisible, moveCursor, moveCursorByWord } from "../codeEditor.js";
import type { CursorPosition } from "../types.js";

function pos(line: number, column: number): CursorPosition {
  return { line, column };
}

describe("codeEditor.scroll - cursor follow and clamping", () => {
  const visibilityCases = [
    { name: "cursor above viewport", scrollTop: 5, cursor: pos(2, 0), viewport: 4, expected: 2 },
    { name: "cursor below viewport", scrollTop: 2, cursor: pos(8, 0), viewport: 4, expected: 5 },
    { name: "cursor inside viewport", scrollTop: 2, cursor: pos(3, 0), viewport: 4, expected: 2 },
    { name: "cursor on top boundary", scrollTop: 4, cursor: pos(4, 0), viewport: 6, expected: 4 },
    {
      name: "cursor on bottom boundary",
      scrollTop: 4,
      cursor: pos(9, 0),
      viewport: 6,
      expected: 4,
    },
    {
      name: "negative scrollTop is clamped",
      scrollTop: -3,
      cursor: pos(0, 0),
      viewport: 5,
      expected: 0,
    },
    {
      name: "viewportHeight <= 0 coerces to 1",
      scrollTop: 2,
      cursor: pos(4, 0),
      viewport: 0,
      expected: 4,
    },
    {
      name: "very large cursor line keeps deterministic math",
      scrollTop: 10,
      cursor: pos(9999, 0),
      viewport: 20,
      expected: 9980,
    },
  ] as const;

  for (const c of visibilityCases) {
    test(`ensureCursorVisible ${c.name}`, () => {
      assert.equal(ensureCursorVisible(c.scrollTop, c.cursor, c.viewport), c.expected);
    });
  }
});

describe("codeEditor.scroll - navigation driving scroll updates", () => {
  test("home and end stay on current line", () => {
    const lines = ["abcdef"];
    const home = moveCursor(lines, pos(0, 4), "home");
    const end = moveCursor(lines, pos(0, 1), "end");
    assert.deepEqual(home, pos(0, 0));
    assert.deepEqual(end, pos(0, 6));
  });

  test("docStart and docEnd clamp to document bounds", () => {
    const lines = ["a", "bb", "ccc"];
    assert.deepEqual(moveCursor(lines, pos(2, 3), "docStart"), pos(0, 0));
    assert.deepEqual(moveCursor(lines, pos(0, 0), "docEnd"), pos(2, 3));
  });

  test("up/down preserve preferred column where possible", () => {
    const lines = ["abcd", "xy", "uvwxyz"];
    const down = moveCursor(lines, pos(0, 3), "down");
    const downAgain = moveCursor(lines, down, "down");
    assert.deepEqual(down, pos(1, 2));
    assert.deepEqual(downAgain, pos(2, 2));
  });

  test("left from line start jumps to previous line end", () => {
    const lines = ["ab", "cd"];
    assert.deepEqual(moveCursor(lines, pos(1, 0), "left"), pos(0, 2));
  });

  test("right from line end jumps to next line start", () => {
    const lines = ["ab", "cd"];
    assert.deepEqual(moveCursor(lines, pos(0, 2), "right"), pos(1, 0));
  });

  test("word-right crosses to next line at end", () => {
    const lines = ["foo", "bar baz"];
    assert.deepEqual(moveCursorByWord(lines, pos(0, 3), "right"), pos(1, 0));
  });

  test("word-left crosses to previous line at start", () => {
    const lines = ["foo", "bar"];
    assert.deepEqual(moveCursorByWord(lines, pos(1, 0), "left"), pos(0, 3));
  });

  test("word movement clamps out-of-range cursor input", () => {
    const lines = ["abc def"];
    assert.deepEqual(moveCursorByWord(lines, pos(-10, -10), "right"), pos(0, 4));
    assert.deepEqual(moveCursorByWord(lines, pos(20, 20), "left"), pos(0, 4));
  });
});
