import { assert, describe, test } from "@rezi-ui/testkit";
import { darkTheme, themePresets } from "../presets.js";
import { validateTheme } from "../validate.js";

function cloneDarkTheme(): Record<string, unknown> {
  return JSON.parse(JSON.stringify(darkTheme)) as Record<string, unknown>;
}

function getRecord(
  root: Record<string, unknown>,
  path: readonly string[],
): Record<string, unknown> {
  let cursor: Record<string, unknown> = root;
  for (const segment of path) {
    cursor = cursor[segment] as Record<string, unknown>;
  }
  return cursor;
}

function setPath(root: Record<string, unknown>, path: readonly string[], value: unknown): void {
  const parent = getRecord(root, path.slice(0, -1));
  const key = path[path.length - 1];
  if (key === undefined) return;
  parent[key] = value;
}

function expectValidationError(input: unknown, expectedMessage: string): void {
  assert.throws(
    () => validateTheme(input),
    (err: unknown) => {
      assert.ok(err instanceof Error);
      assert.equal(err.message, expectedMessage);
      return true;
    },
  );
}

describe("theme.validateTheme", () => {
  test("accepts every built-in preset", () => {
    for (const theme of Object.values(themePresets)) {
      const validated = validateTheme(theme);
      assert.equal(validated, theme);
    }
  });

  test("rejects missing widget token paths", () => {
    const theme = cloneDarkTheme();
    setPath(theme, ["widget", "toast", "info"], undefined);

    expectValidationError(
      theme,
      "Theme validation failed: missing required token path(s): widget.toast.info",
    );
  });

  test("rejects invalid name", () => {
    const theme = cloneDarkTheme();
    theme["name"] = "";

    expectValidationError(
      theme,
      'Theme validation failed at name: expected non-empty string (received "")',
    );
  });

  test("rejects invalid semantic color value", () => {
    const theme = cloneDarkTheme();
    setPath(theme, ["colors", "accent", "primary"], "255");

    expectValidationError(
      theme,
      'Theme validation failed at colors.accent.primary: expected packed Rgb24 integer 0..0x00FFFFFF (received "255")',
    );
  });

  test("rejects invalid widget color value", () => {
    const theme = cloneDarkTheme();
    setPath(theme, ["widget", "syntax", "keyword"], -1);

    expectValidationError(
      theme,
      "Theme validation failed at widget.syntax.keyword: expected packed Rgb24 integer 0..0x00FFFFFF (received -1)",
    );
  });

  test("rejects invalid spacing token", () => {
    const theme = cloneDarkTheme();
    setPath(theme, ["spacing", "md"], 2.5);

    expectValidationError(
      theme,
      "Theme validation failed at spacing.md: spacing token must be a non-negative integer (received 2.5)",
    );
  });

  test("rejects invalid focus indicator style token", () => {
    const theme = cloneDarkTheme();
    setPath(theme, ["focusIndicator", "bold"], "yes");

    expectValidationError(
      theme,
      'Theme validation failed at focusIndicator.bold: focus indicator style must be a boolean (received "yes")',
    );
  });
});
