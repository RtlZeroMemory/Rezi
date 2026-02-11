import { assert, describe, test } from "@rezi-ui/testkit";
import {
  type RenderOptions,
  ResizeObserver,
  getBoundingBox,
  getInnerHeight,
  getInnerWidth,
  getScrollHeight,
  render,
  styledCharsToString,
  styledCharsWidth,
  toStyledCharacters,
  widestLineFromStyledChars,
  wordBreakStyledChars,
  wrapStyledChars,
} from "../index.js";

describe("api surface", () => {
  test("exports measurement and observer APIs", () => {
    assert.equal(typeof getBoundingBox, "function");
    assert.equal(typeof getInnerHeight, "function");
    assert.equal(typeof getInnerWidth, "function");
    assert.equal(typeof getScrollHeight, "function");
    assert.equal(typeof ResizeObserver, "function");
  });

  test("exports styled text helpers used by Ink ecosystem packages", () => {
    const chars = toStyledCharacters("hello world");
    assert.equal(styledCharsToString(chars), "hello world");
    assert.equal(styledCharsWidth(chars), 11);
    assert.equal(widestLineFromStyledChars([chars]), 11);
    assert.equal(wordBreakStyledChars(chars).length > 0, true);
    assert.equal(wrapStyledChars(chars, 5).length >= 2, true);
  });

  test("RenderOptions includes Ink-like parity fields", () => {
    const opts: RenderOptions = {
      onRender: (metrics) => {
        assert.ok(metrics.renderTime >= 0);
      },
      isScreenReaderEnabled: true,
      alternateBuffer: true,
      incrementalRendering: true,
    };

    assert.equal(opts.isScreenReaderEnabled, true);
    assert.equal(typeof render, "function");
  });
});
