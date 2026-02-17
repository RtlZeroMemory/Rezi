import { assert, describe, test } from "@rezi-ui/testkit";
import type { TextStyle } from "../../index.js";
import { mergeStyles, styles } from "../styleUtils.js";

const ATTRS = [
  "bold",
  "dim",
  "italic",
  "underline",
  "inverse",
  "strikethrough",
  "overline",
  "blink",
] as const;

type AttrName = (typeof ATTRS)[number];

const ALL_TRUE_ATTRS: TextStyle = {
  bold: true,
  dim: true,
  italic: true,
  underline: true,
  inverse: true,
  strikethrough: true,
  overline: true,
  blink: true,
};

function attrStyle(attr: AttrName, value: boolean): TextStyle {
  return { [attr]: value } as TextStyle;
}

describe("TextStyle attributes", () => {
  for (const attr of ATTRS) {
    test(`supports ${attr} on TextStyle`, () => {
      const style: TextStyle = attrStyle(attr, true);
      assert.equal(style[attr], true);
    });
  }

  for (const attr of ATTRS) {
    test(`style presets include ${attr}`, () => {
      assert.deepEqual(styles[attr], { [attr]: true });
      assert.equal(Object.keys(styles[attr]).length, 1);
    });
  }

  for (const attr of ATTRS) {
    test(`mergeStyles keeps ${attr} independent from other attrs`, () => {
      const merged = mergeStyles(ALL_TRUE_ATTRS, attrStyle(attr, false));

      for (const key of ATTRS) {
        assert.equal(merged[key], key !== attr);
      }
    });
  }

  test("mergeStyles ignores undefined style entries", () => {
    const merged = mergeStyles(undefined, { bold: true }, undefined, { italic: true });
    assert.deepEqual(merged, { bold: true, italic: true });
  });

  test("mergeStyles preserves fg/bg while updating attrs", () => {
    const merged = mergeStyles(
      { fg: { r: 1, g: 2, b: 3 }, bg: { r: 4, g: 5, b: 6 }, bold: true },
      { bold: false, underline: true },
    );
    assert.deepEqual(merged, {
      fg: { r: 1, g: 2, b: 3 },
      bg: { r: 4, g: 5, b: 6 },
      bold: false,
      underline: true,
    });
  });

  test("mergeStyles allows later style to re-enable attr after false", () => {
    const merged = mergeStyles({ blink: true }, { blink: false }, { blink: true });
    assert.deepEqual(merged, { blink: true });
  });

  test("mergeStyles deterministic full-all-attrs merge", () => {
    const merged = mergeStyles(
      {
        bold: true,
        dim: true,
        italic: false,
        underline: false,
        inverse: true,
        strikethrough: true,
        overline: false,
        blink: false,
      },
      {
        bold: false,
        dim: false,
        italic: true,
        underline: true,
        inverse: false,
        strikethrough: false,
        overline: true,
        blink: true,
      },
    );
    assert.deepEqual(merged, {
      bold: false,
      dim: false,
      italic: true,
      underline: true,
      inverse: false,
      strikethrough: false,
      overline: true,
      blink: true,
    });
  });
});
