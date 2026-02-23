import { assert, describe, test } from "@rezi-ui/testkit";
import { extendStyle, mergeStyles, sanitizeTextStyle, styleWhen, styles } from "../styleUtils.js";

describe("styleUtils", () => {
  test("mergeStyles applies later overrides", () => {
    const a = { bold: true, fg: { r: 1, g: 1, b: 1 } } as const;
    const b = { bold: false } as const;
    const merged = mergeStyles(a, b);
    assert.equal(merged.bold, false);
    assert.deepEqual(merged.fg, { r: 1, g: 1, b: 1 });
  });

  test("extendStyle delegates to mergeStyles", () => {
    const base = { bold: true } as const;
    const ext = extendStyle(base, { dim: true });
    assert.equal(ext.bold, true);
    assert.equal(ext.dim, true);
  });

  test("styleWhen selects styles", () => {
    assert.deepEqual(styleWhen(true, styles.bold), styles.bold);
    assert.equal(styleWhen(false, styles.bold), undefined);
  });

  test("sanitizeTextStyle preserves valid underlineStyle values", () => {
    assert.equal(sanitizeTextStyle({ underlineStyle: "curly" }).underlineStyle, "curly");
    assert.equal(sanitizeTextStyle({ underlineStyle: "dashed" }).underlineStyle, "dashed");
  });

  test("sanitizeTextStyle drops invalid underlineStyle values", () => {
    assert.equal(sanitizeTextStyle({ underlineStyle: 42 }).underlineStyle, undefined);
    assert.equal(sanitizeTextStyle({ underlineStyle: {} }).underlineStyle, undefined);
    assert.equal(sanitizeTextStyle({ underlineStyle: "invalid" }).underlineStyle, undefined);
  });

  test("sanitizeTextStyle preserves underlineColor rgb", () => {
    assert.deepEqual(sanitizeTextStyle({ underlineColor: { r: 1, g: 2, b: 3 } }).underlineColor, {
      r: 1,
      g: 2,
      b: 3,
    });
  });

  test("sanitizeTextStyle preserves underlineColor theme token", () => {
    assert.equal(
      sanitizeTextStyle({ underlineColor: "accent.primary" }).underlineColor,
      "accent.primary",
    );
    assert.equal(
      sanitizeTextStyle({ underlineColor: "  accent.primary  " }).underlineColor,
      "accent.primary",
    );
  });

  test("sanitizeTextStyle drops invalid underlineColor values", () => {
    assert.equal(sanitizeTextStyle({ underlineColor: 42 }).underlineColor, undefined);
    assert.equal(sanitizeTextStyle({ underlineColor: null }).underlineColor, undefined);
    assert.equal(sanitizeTextStyle({ underlineColor: "" }).underlineColor, undefined);
    assert.equal(sanitizeTextStyle({ underlineColor: "   " }).underlineColor, undefined);
  });

  test("mergeStyles merges underlineStyle and underlineColor", () => {
    const merged = mergeStyles(
      { underlineStyle: "curly", underlineColor: { r: 255, g: 0, b: 0 } },
      { bold: true },
    );
    assert.equal(merged.underlineStyle, "curly");
    assert.deepEqual(merged.underlineColor, { r: 255, g: 0, b: 0 });
    assert.equal(merged.bold, true);
  });

  test("mergeStyles applies later underlineStyle override", () => {
    const merged = mergeStyles({ underlineStyle: "curly" }, { underlineStyle: "dashed" });
    assert.equal(merged.underlineStyle, "dashed");
  });
});
