import { assert, describe, test } from "@rezi-ui/testkit";
import { measureTextCells, truncateMiddle, truncateWithEllipsis } from "../textMeasure.js";

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
});
