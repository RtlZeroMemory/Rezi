import { assert, createRng, describe, test } from "@rezi-ui/testkit";
import type { TextStyle } from "../../index.js";
import {
  DEFAULT_BASE_STYLE,
  type ResolvedTextStyle,
  mergeTextStyle,
} from "../../renderer/renderToDrawlist/textStyle.js";

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
type Rng = ReturnType<typeof createRng>;

const ITERATIONS = 1024;

type MutableResolvedTextStyle = {
  fg: NonNullable<TextStyle["fg"]>;
  bg: NonNullable<TextStyle["bg"]>;
} & Partial<Record<BoolAttr, boolean>>;

type OverrideInput = {
  fg?: NonNullable<TextStyle["fg"]> | undefined;
  bg?: NonNullable<TextStyle["bg"]> | undefined;
} & Partial<Record<BoolAttr, boolean | undefined>>;

const ALL_UNDEFINED_OVERRIDE: OverrideInput = {
  fg: undefined,
  bg: undefined,
  bold: undefined,
  dim: undefined,
  italic: undefined,
  underline: undefined,
  inverse: undefined,
  strikethrough: undefined,
  overline: undefined,
  blink: undefined,
};

function randomBool(rng: Rng): boolean {
  return (rng.u32() & 1) === 1;
}

function randomRgb(rng: Rng): NonNullable<TextStyle["fg"]> {
  return {
    r: rng.u32() & 255,
    g: rng.u32() & 255,
    b: rng.u32() & 255,
  };
}

function randomBase(rng: Rng): ResolvedTextStyle {
  const base: MutableResolvedTextStyle = { fg: randomRgb(rng), bg: randomRgb(rng) };
  for (const attr of BOOL_ATTRS) {
    const state = rng.u32() % 3;
    if (state === 1) base[attr] = false;
    if (state === 2) base[attr] = true;
  }
  return base;
}

function randomTrueHeavyBase(rng: Rng): ResolvedTextStyle {
  const base: MutableResolvedTextStyle = { fg: randomRgb(rng), bg: randomRgb(rng) };
  for (const attr of BOOL_ATTRS) {
    const state = rng.u32() % 5;
    if (state === 1) base[attr] = false;
    if (state >= 2) base[attr] = true;
  }
  return base;
}

function setBoolOverride(out: OverrideInput, attr: BoolAttr, state: number, rng: Rng): void {
  if (state === 1) out[attr] = undefined;
  if (state === 2) out[attr] = false;
  if (state === 3) out[attr] = true;
  if (state === 4) out[attr] = randomBool(rng);
}

function setColorOverride(out: OverrideInput, key: "fg" | "bg", state: number, rng: Rng): void {
  if (state === 1) out[key] = undefined;
  if (state === 2) out[key] = randomRgb(rng);
}

function randomBalancedOverride(rng: Rng): OverrideInput {
  const out: OverrideInput = {};
  setColorOverride(out, "fg", rng.u32() % 3, rng);
  setColorOverride(out, "bg", rng.u32() % 3, rng);
  for (const attr of BOOL_ATTRS) {
    setBoolOverride(out, attr, rng.u32() % 4, rng);
  }
  return out;
}

function randomSparseOverride(rng: Rng): OverrideInput {
  const out: OverrideInput = {};
  const fgState = rng.u32() % 8;
  const bgState = rng.u32() % 8;
  if (fgState === 0) out.fg = undefined;
  if (fgState === 1) out.fg = randomRgb(rng);
  if (bgState === 0) out.bg = undefined;
  if (bgState === 1) out.bg = randomRgb(rng);

  for (const attr of BOOL_ATTRS) {
    const state = rng.u32() % 8;
    if (state === 0) out[attr] = undefined;
    if (state === 1) out[attr] = false;
    if (state === 2) out[attr] = true;
  }
  return out;
}

function randomDenseOverride(rng: Rng): OverrideInput {
  const out: OverrideInput = {};
  const fgState = rng.u32() % 5;
  const bgState = rng.u32() % 5;
  if (fgState === 1) out.fg = undefined;
  if (fgState >= 2) out.fg = randomRgb(rng);
  if (bgState === 1) out.bg = undefined;
  if (bgState >= 2) out.bg = randomRgb(rng);

  for (const attr of BOOL_ATTRS) {
    const state = rng.u32() % 8;
    if (state === 1) out[attr] = undefined;
    if (state >= 2) out[attr] = randomBool(rng);
  }
  return out;
}

function randomUndefinedOnlyOverride(rng: Rng): OverrideInput {
  const out: OverrideInput = {};
  if ((rng.u32() & 1) === 1) out.fg = undefined;
  if ((rng.u32() & 1) === 1) out.bg = undefined;
  for (const attr of BOOL_ATTRS) {
    if ((rng.u32() & 1) === 1) out[attr] = undefined;
  }
  return out;
}

function randomAllSetOverride(rng: Rng): OverrideInput {
  const out: OverrideInput = {
    fg: randomRgb(rng),
    bg: randomRgb(rng),
  };
  for (const attr of BOOL_ATTRS) out[attr] = randomBool(rng);
  return out;
}

function randomBoolOnlyBalancedOverride(rng: Rng): OverrideInput {
  const out: OverrideInput = {};
  if ((rng.u32() & 1) === 1) out.fg = undefined;
  if ((rng.u32() & 1) === 1) out.bg = undefined;
  for (const attr of BOOL_ATTRS) {
    setBoolOverride(out, attr, rng.u32() % 4, rng);
  }
  return out;
}

function randomFalseHeavyOverride(rng: Rng): OverrideInput {
  const out: OverrideInput = {};
  if ((rng.u32() & 1) === 1) out.fg = undefined;
  if ((rng.u32() & 1) === 1) out.bg = undefined;
  for (const attr of BOOL_ATTRS) {
    const state = rng.u32() % 5;
    if (state === 1) out[attr] = undefined;
    if (state >= 2) out[attr] = false;
  }
  return out;
}

function expectedMerge(
  base: ResolvedTextStyle,
  override: OverrideInput | undefined,
): ResolvedTextStyle {
  if (!override) return base;

  const merged: MutableResolvedTextStyle = {
    fg: override.fg === undefined ? base.fg : override.fg,
    bg: override.bg === undefined ? base.bg : override.bg,
  };

  for (const attr of BOOL_ATTRS) {
    const next = override[attr] === undefined ? base[attr] : override[attr];
    if (next !== undefined) merged[attr] = next;
  }

  return merged;
}

function assertResolvedStyle(actual: ResolvedTextStyle, expected: ResolvedTextStyle): void {
  assert.deepEqual(actual.fg, expected.fg);
  assert.deepEqual(actual.bg, expected.bg);
  for (const attr of BOOL_ATTRS) {
    assert.equal(actual[attr], expected[attr]);
    assert.equal(Object.prototype.hasOwnProperty.call(actual, attr), expected[attr] !== undefined);
  }
  assert.deepEqual(actual, expected);
}

function assertPairMerge(
  base: ResolvedTextStyle,
  override: OverrideInput,
  merged: ResolvedTextStyle,
): void {
  const expected = expectedMerge(base, override);
  assertResolvedStyle(merged, expected);
  if (override.fg === undefined) assert.equal(merged.fg === base.fg, true);
  if (override.bg === undefined) assert.equal(merged.bg === base.bg, true);
}

function runPairFuzz(
  seed: number,
  baseFactory: (rng: Rng) => ResolvedTextStyle,
  overrideFactory: (rng: Rng) => OverrideInput,
  extra?: (base: ResolvedTextStyle, override: OverrideInput, merged: ResolvedTextStyle) => void,
): void {
  const rng = createRng(seed);
  for (let i = 0; i < ITERATIONS; i++) {
    const base = baseFactory(rng);
    const override = overrideFactory(rng);
    const merged = mergeTextStyle(base, override as TextStyle);
    assertPairMerge(base, override, merged);
    extra?.(base, override, merged);
  }
}

describe("mergeTextStyle deterministic pair fuzz", () => {
  test("balanced random pairs: attr-by-attr merge semantics", () => {
    runPairFuzz(0x51ee_0001, randomBase, randomBalancedOverride);
  });

  test("sparse random pairs: inherited attrs remain stable", () => {
    runPairFuzz(0x51ee_0002, randomBase, randomSparseOverride);
  });

  test("dense random pairs: explicit attrs win for fg/bg + booleans", () => {
    runPairFuzz(0x51ee_0003, randomBase, randomDenseOverride);
  });

  test("undefined-only random overrides never change base (identity)", () => {
    runPairFuzz(0x51ee_0004, randomBase, randomUndefinedOnlyOverride, (base, _override, merged) => {
      assert.equal(merged === base, true);
    });
  });

  test("all attrs set in override always replace corresponding attrs", () => {
    runPairFuzz(0x51ee_0005, randomBase, randomAllSetOverride, (_base, override, merged) => {
      if (override.fg === undefined || override.bg === undefined) {
        throw new Error("all-set override unexpectedly produced undefined fg/bg");
      }
      assert.deepEqual(merged.fg, override.fg);
      assert.deepEqual(merged.bg, override.bg);
      for (const attr of BOOL_ATTRS) {
        const overrideValue = override[attr];
        if (overrideValue === undefined) {
          throw new Error(`all-set override unexpectedly produced undefined ${String(attr)}`);
        }
        assert.equal(merged[attr], overrideValue);
        assert.equal(Object.prototype.hasOwnProperty.call(merged, attr), true);
      }
    });
  });

  test("all-undefined override object is identity across random bases", () => {
    runPairFuzz(
      0x51ee_0006,
      randomBase,
      () => ALL_UNDEFINED_OVERRIDE,
      (base, _override, merged) => {
        assert.equal(merged === base, true);
      },
    );
  });

  test("DEFAULT_BASE_STYLE random pairs: full attr semantics", () => {
    runPairFuzz(0x51ee_0007, () => DEFAULT_BASE_STYLE, randomBalancedOverride);
  });

  test("DEFAULT_BASE_STYLE bool-only random pairs: deterministic cache behavior", () => {
    runPairFuzz(
      0x51ee_0008,
      () => DEFAULT_BASE_STYLE,
      randomBoolOnlyBalancedOverride,
      (base, override, merged) => {
        const again = mergeTextStyle(base, override as TextStyle);
        assert.equal(again === merged, true);
      },
    );
  });

  test("omitted vs explicit undefined attrs produce identical merge results", () => {
    const rng = createRng(0x51ee_0009);
    for (let i = 0; i < ITERATIONS; i++) {
      const base = randomBase(rng);
      const withUndefined: OverrideInput = {};
      const withOmitted: OverrideInput = {};

      const fgState = rng.u32() % 3;
      const bgState = rng.u32() % 3;
      if (fgState === 1) withUndefined.fg = undefined;
      if (fgState === 2) {
        const fg = randomRgb(rng);
        withUndefined.fg = fg;
        withOmitted.fg = fg;
      }
      if (bgState === 1) withUndefined.bg = undefined;
      if (bgState === 2) {
        const bg = randomRgb(rng);
        withUndefined.bg = bg;
        withOmitted.bg = bg;
      }

      for (const attr of BOOL_ATTRS) {
        const state = rng.u32() % 4;
        if (state === 1) withUndefined[attr] = undefined;
        if (state === 2) {
          withUndefined[attr] = false;
          withOmitted[attr] = false;
        }
        if (state === 3) {
          withUndefined[attr] = true;
          withOmitted[attr] = true;
        }
      }

      const mergedUndefined = mergeTextStyle(base, withUndefined as TextStyle);
      const mergedOmitted = mergeTextStyle(base, withOmitted as TextStyle);
      assertPairMerge(base, withUndefined, mergedUndefined);
      assertPairMerge(base, withOmitted, mergedOmitted);
      assertResolvedStyle(mergedUndefined, mergedOmitted);
    }
  });

  test("false-heavy overrides keep explicit false values intact", () => {
    runPairFuzz(
      0x51ee_000a,
      randomTrueHeavyBase,
      randomFalseHeavyOverride,
      (_base, override, merged) => {
        for (const attr of BOOL_ATTRS) {
          if (override[attr] === false) assert.equal(merged[attr], false);
        }
      },
    );
  });

  test("sequential random pair merges match manual two-step expectation", () => {
    const rng = createRng(0x51ee_000b);
    for (let i = 0; i < ITERATIONS; i++) {
      const base = randomBase(rng);
      const b = randomBalancedOverride(rng);
      const c = randomDenseOverride(rng);

      const afterB = mergeTextStyle(base, b as TextStyle);
      const finalMerged = mergeTextStyle(afterB, c as TextStyle);

      assertPairMerge(base, b, afterB);
      assertPairMerge(afterB, c, finalMerged);

      const expected = expectedMerge(expectedMerge(base, b), c);
      assertResolvedStyle(finalMerged, expected);
    }
  });
});
