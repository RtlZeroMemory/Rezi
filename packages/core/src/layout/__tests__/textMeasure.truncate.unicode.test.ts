import { assert, describe, test } from "@rezi-ui/testkit";
import {
  measureTextCells,
  truncateMiddle,
  truncateStart,
  truncateWithEllipsis,
} from "../textMeasure.js";

function hasUnpairedSurrogate(text: string): boolean {
  for (let i = 0; i < text.length; i++) {
    const code = text.charCodeAt(i);
    const isHigh = code >= 0xd800 && code <= 0xdbff;
    const isLow = code >= 0xdc00 && code <= 0xdfff;
    if (!isHigh && !isLow) continue;

    if (isHigh) {
      const next = text.charCodeAt(i + 1);
      const nextIsLow = next >= 0xdc00 && next <= 0xdfff;
      if (!nextIsLow) return true;
      i++;
      continue;
    }

    return true;
  }
  return false;
}

describe("unicode-safe truncation", () => {
  test("truncateWithEllipsis does not split surrogate pairs", () => {
    const result = truncateWithEllipsis("A😀B", 3);
    assert.equal(result, "A…");
    assert.equal(hasUnpairedSurrogate(result), false);
    assert.ok(measureTextCells(result) <= 3);
  });

  test("truncateWithEllipsis does not split ZWJ emoji clusters", () => {
    const family = "👨‍👩‍👧‍👦";
    const result = truncateWithEllipsis(`${family}Z`, 2);
    assert.equal(result, "…");
    assert.equal(hasUnpairedSurrogate(result), false);
    assert.ok(measureTextCells(result) <= 2);
  });

  test("truncateMiddle does not split surrogate pairs", () => {
    const result = truncateMiddle("abc😀", 4);
    assert.equal(result, "ab…");
    assert.equal(hasUnpairedSurrogate(result), false);
    assert.ok(measureTextCells(result) <= 4);
  });

  test("truncateMiddle does not split ZWJ emoji clusters", () => {
    const family = "👨‍👩‍👧‍👦";
    const result = truncateMiddle(`abc${family}`, 4);
    assert.equal(result, "ab…");
    assert.equal(hasUnpairedSurrogate(result), false);
    assert.ok(measureTextCells(result) <= 4);
  });

  test("truncateStart does not split surrogate pairs", () => {
    const result = truncateStart("A😀B", 3);
    assert.equal(result, "…B");
    assert.equal(hasUnpairedSurrogate(result), false);
    assert.ok(measureTextCells(result) <= 3);
  });

  test("truncateStart does not split ZWJ emoji clusters", () => {
    const family = "👨‍👩‍👧‍👦";
    const result = truncateStart(`Z${family}`, 2);
    assert.equal(hasUnpairedSurrogate(result), false);
    assert.ok(measureTextCells(result) <= 2);
  });
});

describe("truncateStart", () => {
  test("returns full text when it fits", () => {
    assert.equal(truncateStart("abcd", 4), "abcd");
    assert.equal(truncateStart("abcd", 10), "abcd");
  });

  test("empty string returns empty", () => {
    assert.equal(truncateStart("", 5), "");
  });

  test("width=0 returns empty", () => {
    assert.equal(truncateStart("abcdef", 0), "");
  });

  test("width=1 returns only ellipsis", () => {
    assert.equal(truncateStart("abcdef", 1), "…");
  });

  test("width=2 keeps one trailing char", () => {
    assert.equal(truncateStart("abcdef", 2), "…f");
  });

  test("width=3 keeps two trailing chars", () => {
    assert.equal(truncateStart("abcdef", 3), "…ef");
  });

  test("width=5 keeps four trailing chars", () => {
    assert.equal(truncateStart("abcdef", 5), "…cdef");
  });

  test("CJK wide chars counted as 2 cells", () => {
    // "你好世界" = 4 chars, 8 cells
    const result = truncateStart("你好世界", 5);
    assert.equal(result, "…世界");
    assert.ok(measureTextCells(result) <= 5);
  });

  test("mixed ASCII and CJK", () => {
    const result = truncateStart("ab你好cd", 5);
    assert.equal(result, "…好cd");
    assert.ok(measureTextCells(result) <= 5);
  });
});
