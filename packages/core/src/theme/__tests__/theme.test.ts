import { assert, describe, test } from "@rezi-ui/testkit";
import { darkTheme } from "../presets.js";
import { resolveColorToken } from "../resolve.js";
import { compileTheme, resolveColor, resolveSpacing } from "../theme.js";

describe("theme runtime compilation", () => {
  test("compileTheme exposes semantic aliases and spacing", () => {
    const theme = compileTheme(darkTheme);

    assert.equal(theme.colors.primary, darkTheme.colors.accent.primary);
    assert.equal(theme.colors["accent.primary"], darkTheme.colors.accent.primary);
    assert.deepEqual(theme.spacing, [0, 1, 1, 2, 3, 4, 6]);
  });

  test("resolveColor returns indexed theme color or fg fallback", () => {
    const theme = compileTheme(darkTheme);
    assert.deepEqual(resolveColor(theme, "primary"), theme.colors.primary);
    assert.deepEqual(resolveColor(theme, "missing"), theme.colors.fg);
    assert.deepEqual(resolveColor(theme, (9 << 16) | (8 << 8) | 7), (9 << 16) | (8 << 8) | 7);
  });

  test("resolveSpacing maps indices and allows raw values", () => {
    const theme = compileTheme(darkTheme);
    assert.equal(resolveSpacing(theme, 0), 0);
    assert.equal(resolveSpacing(theme, 1), 1);
    assert.equal(resolveSpacing(theme, 6), 6);
    assert.equal(resolveSpacing(theme, 9), 9);
  });

  test("resolveColorToken covers widget extension paths", () => {
    assert.equal(resolveColorToken(darkTheme, "widget.toast.info"), darkTheme.widget.toast.info);
    assert.equal(
      resolveColorToken(darkTheme, "widget.syntax.keyword"),
      darkTheme.widget.syntax.keyword,
    );
  });
});
