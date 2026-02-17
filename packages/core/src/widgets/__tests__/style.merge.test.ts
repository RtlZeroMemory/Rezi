import { assert, describe, test } from "@rezi-ui/testkit";
import type { TextStyle } from "../../index.js";
import {
  DEFAULT_BASE_STYLE,
  type ResolvedTextStyle,
  mergeTextStyle,
} from "../../renderer/renderToDrawlist/textStyle.js";
import { styled } from "../styled.js";

const BOOL_ATTRS = [
  "bold",
  "dim",
  "italic",
  "underline",
  "inverse",
  "strikethrough",
  "overline",
  "blink",
] as const;

type BoolAttr = (typeof BOOL_ATTRS)[number];

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

const ALL_FALSE_ATTRS: TextStyle = {
  bold: false,
  dim: false,
  italic: false,
  underline: false,
  inverse: false,
  strikethrough: false,
  overline: false,
  blink: false,
};

function boolOverride(attr: BoolAttr, value: boolean | undefined): TextStyle {
  return { [attr]: value } as TextStyle;
}

function boolOverrides(values: Partial<Record<BoolAttr, boolean | undefined>>): TextStyle {
  return values as TextStyle;
}

function attrAt(index: number): BoolAttr {
  const attr = BOOL_ATTRS[index];
  if (!attr) throw new Error(`missing attr at index ${String(index)}`);
  return attr;
}

function maskStyle(mask: number, value: boolean): TextStyle {
  const out: Partial<Record<BoolAttr, boolean>> = {};
  for (let bit = 0; bit < BOOL_ATTRS.length; bit++) {
    const attr = attrAt(bit);
    if ((mask & (1 << bit)) !== 0) out[attr] = value;
  }
  return out;
}

describe("mergeTextStyle boolean merge correctness", () => {
  for (let index = 0; index < BOOL_ATTRS.length; index++) {
    const attr = attrAt(index);
    const helperA = attrAt((index + 1) % BOOL_ATTRS.length);
    const helperB = attrAt((index + 2) % BOOL_ATTRS.length);

    test(`${attr}: independence from other attrs`, () => {
      const merged = mergeTextStyle(DEFAULT_BASE_STYLE, {
        [attr]: true,
        [helperA]: false,
      } as TextStyle);

      assert.equal(merged[attr], true);
      assert.equal(merged[helperA], false);
      for (const other of BOOL_ATTRS) {
        if (other !== attr && other !== helperA) assert.equal(merged[other], undefined);
      }
      assert.equal(merged.fg, DEFAULT_BASE_STYLE.fg);
      assert.equal(merged.bg, DEFAULT_BASE_STYLE.bg);
    });

    test(`${attr}: undefined inherits existing value`, () => {
      const base = mergeTextStyle(DEFAULT_BASE_STYLE, boolOverride(attr, true));
      const merged = mergeTextStyle(base, boolOverride(attr, undefined));
      assert.equal(merged === base, true);
      assert.equal(merged[attr], true);
    });

    test(`${attr}: false override wins over true`, () => {
      const base = mergeTextStyle(DEFAULT_BASE_STYLE, boolOverride(attr, true));
      const merged = mergeTextStyle(base, boolOverride(attr, false));
      assert.equal(merged[attr], false);
    });

    test(`${attr}: true override wins over false`, () => {
      const base = mergeTextStyle(DEFAULT_BASE_STYLE, boolOverride(attr, false));
      const merged = mergeTextStyle(base, boolOverride(attr, true));
      assert.equal(merged[attr], true);
    });

    test(`${attr}: deep chain (5 levels) remains deterministic`, () => {
      const root = mergeTextStyle(DEFAULT_BASE_STYLE, boolOverride(attr, true));
      const level1 = mergeTextStyle(root, boolOverride(helperA, true));
      const level2 = mergeTextStyle(level1, boolOverride(attr, false));
      const level3 = mergeTextStyle(level2, boolOverride(helperB, true));
      const level4 = mergeTextStyle(level3, boolOverride(attr, true));

      assert.equal(root[attr], true);
      assert.equal(level1[attr], true);
      assert.equal(level2[attr], false);
      assert.equal(level3[attr], false);
      assert.equal(level4[attr], true);
      assert.equal(level4[helperA], true);
      assert.equal(level4[helperB], true);
    });
  }

  test("full-all-attrs merge applies explicit overrides and undefined inheritance", () => {
    const base = mergeTextStyle(DEFAULT_BASE_STYLE, {
      bold: true,
      dim: false,
      italic: true,
      underline: false,
      inverse: true,
      strikethrough: false,
      overline: true,
      blink: false,
    });

    const merged = mergeTextStyle(
      base,
      boolOverrides({
        bold: false,
        dim: true,
        italic: undefined,
        underline: true,
        inverse: false,
        strikethrough: true,
        overline: undefined,
        blink: true,
      }),
    );

    assert.deepEqual(merged, {
      fg: DEFAULT_BASE_STYLE.fg,
      bg: DEFAULT_BASE_STYLE.bg,
      bold: false,
      dim: true,
      italic: true,
      underline: true,
      inverse: false,
      strikethrough: true,
      overline: true,
      blink: true,
    });
  });

  test("full-all-attrs merge supports all-false overrides", () => {
    const allTrue = mergeTextStyle(DEFAULT_BASE_STYLE, ALL_TRUE_ATTRS);
    const allFalse = mergeTextStyle(allTrue, ALL_FALSE_ATTRS);

    assert.deepEqual(allFalse, {
      fg: DEFAULT_BASE_STYLE.fg,
      bg: DEFAULT_BASE_STYLE.bg,
      bold: false,
      dim: false,
      italic: false,
      underline: false,
      inverse: false,
      strikethrough: false,
      overline: false,
      blink: false,
    });
  });
});

describe("mergeTextStyle cache correctness for DEFAULT_BASE_STYLE", () => {
  for (let index = 0; index < BOOL_ATTRS.length; index++) {
    const attr = attrAt(index);
    const otherAttr = attrAt((index + 1) % BOOL_ATTRS.length);

    test(`${attr}: identical true key reuses cached object`, () => {
      const a = mergeTextStyle(DEFAULT_BASE_STYLE, boolOverride(attr, true));
      const b = mergeTextStyle(DEFAULT_BASE_STYLE, boolOverride(attr, true));
      assert.equal(a === b, true);
    });

    test(`${attr}: identical false key reuses cached object`, () => {
      const a = mergeTextStyle(DEFAULT_BASE_STYLE, boolOverride(attr, false));
      const b = mergeTextStyle(DEFAULT_BASE_STYLE, boolOverride(attr, false));
      assert.equal(a === b, true);
    });

    test(`${attr}: key is separated from ${otherAttr}`, () => {
      const a = mergeTextStyle(DEFAULT_BASE_STYLE, boolOverride(attr, true));
      const b = mergeTextStyle(DEFAULT_BASE_STYLE, boolOverride(otherAttr, true));
      assert.equal(a === b, false);
    });

    test(`${attr}: true and false map to different cache keys`, () => {
      const a = mergeTextStyle(DEFAULT_BASE_STYLE, boolOverride(attr, true));
      const b = mergeTextStyle(DEFAULT_BASE_STYLE, boolOverride(attr, false));
      assert.equal(a === b, false);
    });
  }

  test("all 256 true/unset 8-attr scenarios are stable and distinct", () => {
    const firstPass: ResolvedTextStyle[] = [];
    const seen = new Map<ResolvedTextStyle, number>();

    for (let mask = 0; mask < 256; mask++) {
      const merged = mergeTextStyle(DEFAULT_BASE_STYLE, maskStyle(mask, true));
      firstPass.push(merged);

      if (mask === 0) {
        assert.equal(merged === DEFAULT_BASE_STYLE, true);
      } else {
        assert.equal(merged === DEFAULT_BASE_STYLE, false);
      }

      const prior = seen.get(merged);
      assert.equal(prior, undefined);
      seen.set(merged, mask);
    }

    assert.equal(seen.size, 256);

    for (let mask = 0; mask < 256; mask++) {
      const again = mergeTextStyle(DEFAULT_BASE_STYLE, maskStyle(mask, true));
      assert.equal(again === firstPass[mask], true);
    }
  });

  test("true/unset and false/unset scenarios do not share stale cache entries", () => {
    for (let mask = 1; mask < 256; mask++) {
      const trueStyle = mergeTextStyle(DEFAULT_BASE_STYLE, maskStyle(mask, true));
      const falseStyleA = mergeTextStyle(DEFAULT_BASE_STYLE, maskStyle(mask, false));
      const falseStyleB = mergeTextStyle(DEFAULT_BASE_STYLE, maskStyle(mask, false));

      assert.equal(trueStyle === falseStyleA, false);
      assert.equal(falseStyleA === falseStyleB, true);
    }
  });

  test("non-default base path does not stale-reuse entries across differing colors", () => {
    const redBase = mergeTextStyle(DEFAULT_BASE_STYLE, { fg: { r: 200, g: 10, b: 20 } });
    const blueBase = mergeTextStyle(DEFAULT_BASE_STYLE, { fg: { r: 20, g: 10, b: 200 } });
    const redBoldA = mergeTextStyle(redBase, { bold: true });
    const redBoldB = mergeTextStyle(redBase, { bold: true });
    const blueBold = mergeTextStyle(blueBase, { bold: true });

    assert.equal(redBoldA === redBoldB, false);
    assert.equal(redBoldA === blueBold, false);
    assert.deepEqual(redBoldA.fg, { r: 200, g: 10, b: 20 });
    assert.deepEqual(redBoldB.fg, { r: 200, g: 10, b: 20 });
    assert.deepEqual(blueBold.fg, { r: 20, g: 10, b: 200 });
  });
});

describe("styled variant behavior for new text attrs", () => {
  test("variant applies strikethrough + overline + blink together", () => {
    const Button = styled("button", {
      base: { bold: true },
      variants: {
        mode: {
          emphasis: {
            strikethrough: true,
            overline: true,
            blink: true,
          },
          plain: {},
        },
      },
      defaults: { mode: "plain" },
    });

    const vnode = Button({ id: "emphasis", label: "Emphasis", mode: "emphasis" });
    assert.deepEqual((vnode.props as { style?: unknown }).style, {
      bold: true,
      strikethrough: true,
      overline: true,
      blink: true,
    });
  });

  test("variant override wins when base has blink=true and variant sets blink=false", () => {
    const Button = styled("button", {
      base: { blink: true, overline: true },
      variants: {
        tone: {
          calm: { blink: false },
          loud: { strikethrough: true },
        },
      },
      defaults: { tone: "calm" },
    });

    const vnode = Button({ id: "calm", label: "Calm" });
    assert.deepEqual((vnode.props as { style?: unknown }).style, {
      blink: false,
      overline: true,
    });
  });

  test("user style overrides variant values for new attrs", () => {
    const Button = styled("button", {
      base: { strikethrough: true },
      variants: {
        mode: {
          active: { overline: true, blink: true },
          idle: {},
        },
      },
      defaults: { mode: "active" },
    });

    const vnode = Button({
      id: "active",
      label: "Active",
      style: { strikethrough: false, blink: false },
    });
    assert.deepEqual((vnode.props as { style?: unknown }).style, {
      strikethrough: false,
      overline: true,
      blink: false,
    });
  });
});
