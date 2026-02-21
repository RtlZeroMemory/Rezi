import { assert, describe, test } from "@rezi-ui/testkit";
import {
  DEFAULT_BASE_STYLE,
  applyOpacityToStyle,
  mergeTextStyle,
} from "../renderToDrawlist/textStyle.js";

describe("renderer/textStyle opacity blending", () => {
  test("opacity >= 1 returns the original style reference", () => {
    const style = mergeTextStyle(DEFAULT_BASE_STYLE, {
      fg: { r: 255, g: 0, b: 0 },
      bg: { r: 0, g: 0, b: 80 },
      bold: true,
    });
    assert.equal(applyOpacityToStyle(style, 1), style);
    assert.equal(applyOpacityToStyle(style, Number.POSITIVE_INFINITY), style);
  });

  test("opacity <= 0 collapses fg/bg to base background", () => {
    const style = mergeTextStyle(DEFAULT_BASE_STYLE, {
      fg: { r: 240, g: 120, b: 60 },
      bg: { r: 30, g: 40, b: 50 },
      italic: true,
    });

    const applied = applyOpacityToStyle(style, 0);
    assert.deepEqual(applied.fg, DEFAULT_BASE_STYLE.bg);
    assert.deepEqual(applied.bg, DEFAULT_BASE_STYLE.bg);
    assert.equal(applied.italic, true);
  });

  test("blends channels with rounding and preserves non-color attrs", () => {
    const style = mergeTextStyle(DEFAULT_BASE_STYLE, {
      fg: { r: 107, g: 203, b: 31 },
      bg: { r: 90, g: 40, b: 200 },
      underline: true,
    });

    const applied = applyOpacityToStyle(style, 0.5);
    assert.equal(applied.underline, true);
    assert.deepEqual(applied.fg, {
      r: Math.round(DEFAULT_BASE_STYLE.bg.r + (style.fg.r - DEFAULT_BASE_STYLE.bg.r) * 0.5),
      g: Math.round(DEFAULT_BASE_STYLE.bg.g + (style.fg.g - DEFAULT_BASE_STYLE.bg.g) * 0.5),
      b: Math.round(DEFAULT_BASE_STYLE.bg.b + (style.fg.b - DEFAULT_BASE_STYLE.bg.b) * 0.5),
    });
    assert.deepEqual(applied.bg, {
      r: Math.round(DEFAULT_BASE_STYLE.bg.r + (style.bg.r - DEFAULT_BASE_STYLE.bg.r) * 0.5),
      g: Math.round(DEFAULT_BASE_STYLE.bg.g + (style.bg.g - DEFAULT_BASE_STYLE.bg.g) * 0.5),
      b: Math.round(DEFAULT_BASE_STYLE.bg.b + (style.bg.b - DEFAULT_BASE_STYLE.bg.b) * 0.5),
    });
  });

  test("non-finite opacity is treated as fully opaque", () => {
    const style = mergeTextStyle(DEFAULT_BASE_STYLE, {
      fg: { r: 200, g: 100, b: 90 },
      bg: { r: 10, g: 40, b: 80 },
    });
    assert.equal(applyOpacityToStyle(style, Number.NaN), style);
    assert.equal(applyOpacityToStyle(style, Number.NEGATIVE_INFINITY), style);
  });
});
