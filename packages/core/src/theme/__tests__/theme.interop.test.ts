import { assert, describe, test } from "@rezi-ui/testkit";
import { defaultTheme } from "../defaultTheme.js";
import { extendTheme } from "../extend.js";
import { mergeThemeOverride } from "../interop.js";
import { darkTheme } from "../presets.js";
import { compileTheme } from "../theme.js";
import type { ThemeDefinition } from "../tokens.js";

function cloneTheme(theme: ThemeDefinition): ThemeDefinition {
  return JSON.parse(JSON.stringify(theme)) as ThemeDefinition;
}

function withoutSpacing(theme: ThemeDefinition): ThemeDefinition {
  const clone = cloneTheme(theme) as { spacing?: unknown };
  clone.spacing = defaultTheme.definition.spacing;
  return clone as ThemeDefinition;
}

describe("theme overrides", () => {
  test("compileTheme preserves semantic spacing tokens", () => {
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

    const compiledTheme = compileTheme(semanticTheme);
    assert.deepEqual(compiledTheme.spacing, [0, 2, 3, 4, 5, 6, 7]);
  });

  test("mergeThemeOverride applies spacing and focusIndicator overrides", () => {
    const parentTheme = compileTheme(darkTheme);
    const merged = mergeThemeOverride(parentTheme, {
      spacing: {
        xs: 9,
        sm: 8,
        md: 7,
        lg: 6,
        xl: 5,
        "2xl": 4,
      },
      focusIndicator: {
        bold: false,
        underline: true,
      },
    });

    assert.deepEqual(merged.spacing, [0, 9, 8, 7, 6, 5, 4]);
    assert.equal(merged.focusIndicator.bold, false);
    assert.equal(merged.focusIndicator.underline, true);
  });

  test("full ThemeDefinition overrides replace subtree theme", () => {
    const override = extendTheme(darkTheme, {
      colors: {
        accent: {
          primary: (1 << 16) | (2 << 8) | 3,
        },
      },
    });

    const merged = mergeThemeOverride(compileTheme(darkTheme), override);
    assert.equal(merged.definition, override);
    assert.deepEqual(merged.colors["accent.primary"], (1 << 16) | (2 << 8) | 3);
  });

  test("mergeThemeOverride carries diagnostic colors through compiled aliases", () => {
    const merged = mergeThemeOverride(compileTheme(darkTheme), {
      colors: {
        diagnostic: {
          warning: (7 << 16) | (8 << 8) | 9,
        },
      },
    });

    assert.deepEqual(merged.colors["diagnostic.warning"], (7 << 16) | (8 << 8) | 9);
  });

  test("mergeThemeOverride preserves unrelated parent tokens", () => {
    const parentTheme = compileTheme(
      extendTheme(darkTheme, {
        spacing: {
          xs: 4,
          sm: 4,
          md: 4,
          lg: 4,
          xl: 4,
          "2xl": 4,
        },
      }),
    );
    const override = withoutSpacing(
      extendTheme(darkTheme, {
        colors: {
          accent: {
            primary: (1 << 16) | (2 << 8) | 3,
          },
        },
      }),
    );

    const merged = mergeThemeOverride(parentTheme, override);
    assert.deepEqual(merged.spacing, compileTheme(defaultTheme.definition).spacing);
    assert.deepEqual(merged.colors["accent.primary"], (1 << 16) | (2 << 8) | 3);
  });
});
