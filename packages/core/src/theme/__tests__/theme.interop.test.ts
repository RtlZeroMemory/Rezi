import { assert, describe, test } from "@rezi-ui/testkit";
import { defaultTheme } from "../defaultTheme.js";
import { extendTheme } from "../extend.js";
import { coerceToLegacyTheme, mergeThemeOverride } from "../interop.js";
import { darkTheme } from "../presets.js";
import { createTheme } from "../theme.js";
import type { ThemeDefinition } from "../tokens.js";

function cloneTheme(theme: ThemeDefinition): ThemeDefinition {
  return JSON.parse(JSON.stringify(theme)) as ThemeDefinition;
}

function withoutSpacing(theme: ThemeDefinition): ThemeDefinition {
  const clone = cloneTheme(theme) as { spacing?: unknown };
  clone.spacing = undefined;
  return clone as ThemeDefinition;
}

describe("theme.interop spacing", () => {
  test("coerceToLegacyTheme preserves ThemeDefinition spacing tokens", () => {
    const semanticTheme = extendTheme(darkTheme, {
      spacing: {
        xs: 2,
        sm: 3,
        md: 4,
        lg: 5,
        xl: 6,
        "2xl": 7,
      },
    });

    const legacyTheme = coerceToLegacyTheme(semanticTheme);
    assert.deepEqual(legacyTheme.spacing, [0, 2, 3, 4, 5, 6, 7]);
  });

  test("coerceToLegacyTheme falls back to default spacing when semantic spacing is absent", () => {
    const semanticThemeWithoutSpacing = withoutSpacing(darkTheme);
    const legacyTheme = coerceToLegacyTheme(semanticThemeWithoutSpacing);

    assert.equal(legacyTheme.spacing, defaultTheme.spacing);
  });

  test("mergeThemeOverride applies spacing from ThemeDefinition overrides", () => {
    const parentTheme = createTheme({
      spacing: [0, 10, 20, 30, 40, 50, 60],
    });
    const override = extendTheme(darkTheme, {
      spacing: {
        xs: 9,
        sm: 8,
        md: 7,
        lg: 6,
        xl: 5,
        "2xl": 4,
      },
    });

    const merged = mergeThemeOverride(parentTheme, override);
    assert.deepEqual(merged.spacing, [0, 9, 8, 7, 6, 5, 4]);
    assert.notEqual(merged.spacing, parentTheme.spacing);
  });

  test("mergeThemeOverride preserves parent spacing when ThemeDefinition spacing is absent", () => {
    const parentTheme = createTheme({
      spacing: [0, 11, 22, 33, 44, 55, 66],
    });
    const override = withoutSpacing(
      extendTheme(darkTheme, {
        colors: {
          accent: {
            primary: { r: 1, g: 2, b: 3 },
          },
        },
      }),
    );

    const merged = mergeThemeOverride(parentTheme, override);
    assert.equal(merged.spacing, parentTheme.spacing);
    assert.notEqual(merged, parentTheme);
  });
});
