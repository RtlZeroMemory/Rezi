import { assert, describe, test } from "@rezi-ui/testkit";
import { rgbBlend } from "../../widgets/style.js";
import {
  DEFAULT_BASE_STYLE,
  applyOpacityToStyle,
  mergeTextStyle,
} from "../renderToDrawlist/textStyle.js";

describe("renderer/textStyle opacity blending", () => {
  test("opacity >= 1 returns the original style reference", () => {
    const style = mergeTextStyle(DEFAULT_BASE_STYLE, {
      fg: ((255 << 16) | (0 << 8) | 0),
      bg: ((0 << 16) | (0 << 8) | 80),
      bold: true,
    });
    assert.equal(applyOpacityToStyle(style, 1), style);
    assert.equal(applyOpacityToStyle(style, Number.POSITIVE_INFINITY), style);
  });

  test("opacity <= 0 collapses fg/bg to base background", () => {
    const style = mergeTextStyle(DEFAULT_BASE_STYLE, {
      fg: ((240 << 16) | (120 << 8) | 60),
      bg: ((30 << 16) | (40 << 8) | 50),
      italic: true,
    });

    const applied = applyOpacityToStyle(style, 0);
    assert.deepEqual(applied.fg, DEFAULT_BASE_STYLE.bg);
    assert.deepEqual(applied.bg, DEFAULT_BASE_STYLE.bg);
    assert.equal(applied.italic, true);
  });

  test("blends channels with rounding and preserves non-color attrs", () => {
    const style = mergeTextStyle(DEFAULT_BASE_STYLE, {
      fg: ((107 << 16) | (203 << 8) | 31),
      bg: ((90 << 16) | (40 << 8) | 200),
      underline: true,
    });

    const applied = applyOpacityToStyle(style, 0.5);
    assert.equal(applied.underline, true);
    assert.equal(applied.fg, rgbBlend(DEFAULT_BASE_STYLE.bg, style.fg, 0.5));
    assert.equal(applied.bg, rgbBlend(DEFAULT_BASE_STYLE.bg, style.bg, 0.5));
  });

  test("non-finite opacity is treated as fully opaque", () => {
    const style = mergeTextStyle(DEFAULT_BASE_STYLE, {
      fg: ((200 << 16) | (100 << 8) | 90),
      bg: ((10 << 16) | (40 << 8) | 80),
    });
    assert.equal(applyOpacityToStyle(style, Number.NaN), style);
    assert.equal(applyOpacityToStyle(style, Number.NEGATIVE_INFINITY), style);
  });

  test("blends against custom backdrop when provided", () => {
    const backdrop = ((90 << 16) | (100 << 8) | 110);
    const style = mergeTextStyle(DEFAULT_BASE_STYLE, {
      fg: ((240 << 16) | (80 << 8) | 20),
      bg: ((10 << 16) | (30 << 8) | 50),
    });

    const hidden = applyOpacityToStyle(style, 0, backdrop);
    assert.deepEqual(hidden.fg, backdrop);
    assert.deepEqual(hidden.bg, backdrop);

    const half = applyOpacityToStyle(style, 0.5, backdrop);
    assert.equal(half.fg, rgbBlend(backdrop, style.fg, 0.5));
    assert.equal(half.bg, rgbBlend(backdrop, style.bg, 0.5));
  });
});
