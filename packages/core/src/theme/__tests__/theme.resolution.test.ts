import { assert, describe, test } from "@rezi-ui/testkit";
import { themePresets } from "../presets.js";
import {
  type ColorPath,
  isValidColorPath,
  resolveColorOrRgb,
  resolveColorToken,
  tryResolveColorToken,
} from "../resolve.js";

const ALL_COLOR_PATHS: readonly ColorPath[] = [
  "bg.base",
  "bg.elevated",
  "bg.overlay",
  "bg.subtle",
  "fg.primary",
  "fg.secondary",
  "fg.muted",
  "fg.inverse",
  "accent.primary",
  "accent.secondary",
  "accent.tertiary",
  "success",
  "warning",
  "error",
  "info",
  "focus.ring",
  "focus.bg",
  "selected.bg",
  "selected.fg",
  "disabled.fg",
  "disabled.bg",
  "diagnostic.error",
  "diagnostic.warning",
  "diagnostic.info",
  "diagnostic.hint",
  "border.subtle",
  "border.default",
  "border.strong",
];

describe("theme resolution", () => {
  test("every semantic token resolves to RGB in every built-in preset", () => {
    for (const [presetName, theme] of Object.entries(themePresets)) {
      for (const path of ALL_COLOR_PATHS) {
        const color = resolveColorToken(theme, path);
        assert.ok(
          color !== null,
          `Expected preset "${presetName}" token "${path}" to resolve, got null`,
        );
        assert.equal(typeof color?.r, "number");
        assert.equal(typeof color?.g, "number");
        assert.equal(typeof color?.b, "number");
      }
    }
  });

  test("top-level semantic tokens resolve to expected colors", () => {
    const theme = themePresets.dark;
    assert.deepEqual(resolveColorToken(theme, "success"), theme.colors.success);
    assert.deepEqual(resolveColorToken(theme, "warning"), theme.colors.warning);
    assert.deepEqual(resolveColorToken(theme, "error"), theme.colors.error);
    assert.deepEqual(resolveColorToken(theme, "info"), theme.colors.info);
  });

  test("diagnostic tokens resolve to expected colors", () => {
    const theme = themePresets.dark;
    assert.deepEqual(resolveColorToken(theme, "diagnostic.error"), theme.colors.diagnostic.error);
    assert.deepEqual(
      resolveColorToken(theme, "diagnostic.warning"),
      theme.colors.diagnostic.warning,
    );
    assert.deepEqual(resolveColorToken(theme, "diagnostic.info"), theme.colors.diagnostic.info);
    assert.deepEqual(resolveColorToken(theme, "diagnostic.hint"), theme.colors.diagnostic.hint);
  });

  test("resolveColorToken returns null for invalid token paths", () => {
    const theme = themePresets.dark;
    assert.equal(resolveColorToken(theme, "fg.unknown"), null);
    assert.equal(resolveColorToken(theme, "unknown"), null);
    assert.equal(resolveColorToken(theme, "bg.base.extra"), null);
  });

  test("tryResolveColorToken returns clear error for missing token", () => {
    const result = tryResolveColorToken(themePresets.dark, "bg.missing");
    assert.deepEqual(result, { ok: false, error: "Invalid color path: bg.missing" });
  });

  test("tryResolveColorToken returns resolved value for valid token", () => {
    const result = tryResolveColorToken(themePresets.dark, "accent.primary");
    assert.equal(result.ok, true);
    if (!result.ok) return;
    assert.deepEqual(result.value, themePresets.dark.colors.accent.primary);
  });

  test("resolveColorOrRgb returns direct RGB unchanged", () => {
    const rgb = { r: 1, g: 2, b: 3 } as const;
    const fallback = { r: 9, g: 9, b: 9 } as const;
    assert.deepEqual(resolveColorOrRgb(themePresets.dark, rgb, fallback), rgb);
  });

  test("resolveColorOrRgb uses fallback for invalid token paths", () => {
    const fallback = { r: 9, g: 8, b: 7 } as const;
    assert.deepEqual(resolveColorOrRgb(themePresets.dark, "not.valid", fallback), fallback);
  });

  test("resolveColorOrRgb uses fallback for undefined input", () => {
    const fallback = { r: 5, g: 4, b: 3 } as const;
    assert.deepEqual(resolveColorOrRgb(themePresets.dark, undefined, fallback), fallback);
  });

  test("isValidColorPath accepts all known semantic paths", () => {
    for (const path of ALL_COLOR_PATHS) {
      assert.equal(isValidColorPath(path), true, `Expected "${path}" to be valid`);
    }
  });

  test("isValidColorPath rejects invalid semantic paths", () => {
    assert.equal(isValidColorPath("bg"), false);
    assert.equal(isValidColorPath("fg.tertiary"), false);
    assert.equal(isValidColorPath("accent"), false);
    assert.equal(isValidColorPath("focus"), false);
  });

  test("resolution is deterministic for the same theme and path", () => {
    const theme = themePresets.nord;
    const a = resolveColorToken(theme, "fg.primary");
    const b = resolveColorToken(theme, "fg.primary");
    assert.deepEqual(a, b);
    assert.equal(a, b);
  });
});
