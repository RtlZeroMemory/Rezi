import { assert, describe, test } from "@rezi-ui/testkit";
import type { TextStyle } from "../style.js";
import { mergeStyles, styleWhen, styles } from "../styleUtils.js";

describe("style utils contracts", () => {
  test("mergeStyles performs a deterministic 3-way left-to-right merge", () => {
    const a = { bold: true, underline: false, fg: { r: 1, g: 2, b: 3 } } as const;
    const b = { bold: false, italic: true } as const;
    const c = { fg: { r: 9, g: 8, b: 7 }, dim: true } as const;

    const merged = mergeStyles(a, b, c);

    assert.deepEqual(merged, {
      bold: false,
      underline: false,
      italic: true,
      dim: true,
      fg: { r: 9, g: 8, b: 7 },
    });
  });

  test("styleWhen returns trueStyle for true and undefined for false without falseStyle", () => {
    const trueStyle = { underline: true } as const;

    assert.equal(styleWhen(true, trueStyle), trueStyle);
    assert.equal(styleWhen(false, trueStyle), undefined);
  });

  test("styleWhen returns falseStyle when condition is false", () => {
    const trueStyle: TextStyle = { bold: true };
    const falseStyle: TextStyle = { dim: true };

    assert.equal(styleWhen(false, trueStyle, falseStyle), falseStyle);
    assert.equal(styleWhen(true, trueStyle, falseStyle), trueStyle);
  });

  test("mergeStyles skips undefined entries", () => {
    const merged = mergeStyles(undefined, { bold: true }, undefined, { italic: true }, undefined);

    assert.deepEqual(merged, { bold: true, italic: true });
  });

  test("composition via styleWhen + mergeStyles does not mutate inputs", () => {
    const base = { bold: true, fg: { r: 5, g: 6, b: 7 } } as const;
    const conditional: TextStyle = { italic: true };
    const fallback: TextStyle = { dim: true };

    const merged = mergeStyles(
      base,
      styleWhen(true, conditional, fallback),
      styleWhen(false, styles.underline),
    );

    assert.deepEqual(base, { bold: true, fg: { r: 5, g: 6, b: 7 } });
    assert.deepEqual(conditional, { italic: true });
    assert.deepEqual(fallback, { dim: true });
    assert.deepEqual(merged, {
      bold: true,
      fg: { r: 5, g: 6, b: 7 },
      italic: true,
    });
  });

  test("falseStyle composition remains deterministic across repeated merges", () => {
    const base = { inverse: true } as const;
    const trueStyle: TextStyle = { bold: true };
    const falseStyle: TextStyle = { inverse: false, blink: true };

    const first = mergeStyles(base, styleWhen(false, trueStyle, falseStyle));
    const second = mergeStyles(base, styleWhen(false, trueStyle, falseStyle));

    assert.deepEqual(first, { inverse: false, blink: true });
    assert.deepEqual(second, { inverse: false, blink: true });
  });
});
