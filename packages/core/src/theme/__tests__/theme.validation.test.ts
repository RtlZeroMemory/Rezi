import { assert, describe, test } from "@rezi-ui/testkit";
import { darkTheme, themePresets } from "../presets.js";
import { validateTheme } from "../validate.js";

const REQUIRED_PATHS = [
  "colors.bg.base",
  "colors.bg.elevated",
  "colors.bg.overlay",
  "colors.bg.subtle",
  "colors.fg.primary",
  "colors.fg.secondary",
  "colors.fg.muted",
  "colors.fg.inverse",
  "colors.accent.primary",
  "colors.accent.secondary",
  "colors.accent.tertiary",
  "colors.success",
  "colors.warning",
  "colors.error",
  "colors.info",
  "colors.focus.ring",
  "colors.focus.bg",
  "colors.selected.bg",
  "colors.selected.fg",
  "colors.disabled.fg",
  "colors.disabled.bg",
  "colors.border.subtle",
  "colors.border.default",
  "colors.border.strong",
  "colors.diagnostic.error",
  "colors.diagnostic.warning",
  "colors.diagnostic.info",
  "colors.diagnostic.hint",
  "spacing.xs",
  "spacing.sm",
  "spacing.md",
  "spacing.lg",
  "spacing.xl",
  "spacing.2xl",
  "focusIndicator.bold",
  "focusIndicator.underline",
] as const;

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

  test("accepts darkTheme", () => {
    const validated = validateTheme(darkTheme);
    assert.equal(validated, darkTheme);
  });

  test("empty object lists all missing required token paths", () => {
    expectValidationError(
      {},
      `Theme validation failed: missing required token path(s): ${REQUIRED_PATHS.join(", ")}`,
    );
  });

  test("throws when a required semantic token is missing", () => {
    const theme = cloneDarkTheme();
    setPath(theme, ["colors", "error"], undefined);

    expectValidationError(
      theme,
      "Theme validation failed: missing required token path(s): colors.error",
    );
  });

  test("throws when a required nested semantic token is missing", () => {
    const theme = cloneDarkTheme();
    setPath(theme, ["colors", "bg", "base"], undefined);

    expectValidationError(
      theme,
      "Theme validation failed: missing required token path(s): colors.bg.base",
    );
  });

  test("throws when a required diagnostic semantic token is missing", () => {
    const theme = cloneDarkTheme();
    setPath(theme, ["colors", "diagnostic", "error"], undefined);

    expectValidationError(
      theme,
      "Theme validation failed: missing required token path(s): colors.diagnostic.error",
    );
  });

  test("throws when spacing.xs is missing", () => {
    const theme = cloneDarkTheme();
    setPath(theme, ["spacing", "xs"], undefined);

    expectValidationError(
      theme,
      "Theme validation failed: missing required token path(s): spacing.xs",
    );
  });

  test("throws when spacing.2xl is missing", () => {
    const theme = cloneDarkTheme();
    setPath(theme, ["spacing", "2xl"], undefined);

    expectValidationError(
      theme,
      "Theme validation failed: missing required token path(s): spacing.2xl",
    );
  });

  test("throws when focusIndicator.bold is missing", () => {
    const theme = cloneDarkTheme();
    setPath(theme, ["focusIndicator", "bold"], undefined);

    expectValidationError(
      theme,
      "Theme validation failed: missing required token path(s): focusIndicator.bold",
    );
  });

  test("throws when focusIndicator.underline is missing", () => {
    const theme = cloneDarkTheme();
    setPath(theme, ["focusIndicator", "underline"], undefined);

    expectValidationError(
      theme,
      "Theme validation failed: missing required token path(s): focusIndicator.underline",
    );
  });

  test("throws when RGB channel is greater than 255", () => {
    const theme = cloneDarkTheme();
    setPath(theme, ["colors", "accent", "primary", "r"], 256);

    expectValidationError(
      theme,
      'Theme validation failed at colors.accent.primary.r: channel "r" must be an integer 0..255 (received 256)',
    );
  });

  test("throws when RGB channel is less than 0", () => {
    const theme = cloneDarkTheme();
    setPath(theme, ["colors", "accent", "primary", "g"], -1);

    expectValidationError(
      theme,
      'Theme validation failed at colors.accent.primary.g: channel "g" must be an integer 0..255 (received -1)',
    );
  });

  test("throws when RGB channel is non-integer", () => {
    const theme = cloneDarkTheme();
    setPath(theme, ["colors", "accent", "primary", "b"], 1.5);

    expectValidationError(
      theme,
      'Theme validation failed at colors.accent.primary.b: channel "b" must be an integer 0..255 (received 1.5)',
    );
  });

  test("throws when RGB channel is not a number", () => {
    const theme = cloneDarkTheme();
    setPath(theme, ["colors", "accent", "primary", "r"], "255");

    expectValidationError(
      theme,
      'Theme validation failed at colors.accent.primary.r: channel "r" must be an integer 0..255 (received "255")',
    );
  });

  test("throws when RGB channel is missing", () => {
    const theme = cloneDarkTheme();
    setPath(theme, ["colors", "accent", "primary", "g"], undefined);

    expectValidationError(
      theme,
      'Theme validation failed at colors.accent.primary.g: channel "g" must be an integer 0..255 (received undefined)',
    );
  });

  test("throws when a color token is not an RGB object", () => {
    const theme = cloneDarkTheme();
    setPath(theme, ["colors", "info"], 7);

    expectValidationError(
      theme,
      "Theme validation failed at colors.info: expected RGB object { r, g, b } (received 7)",
    );
  });

  test("throws when spacing token is non-integer", () => {
    const theme = cloneDarkTheme();
    setPath(theme, ["spacing", "md"], 2.5);

    expectValidationError(
      theme,
      "Theme validation failed at spacing.md: spacing token must be a non-negative integer (received 2.5)",
    );
  });

  test("throws when spacing token is negative", () => {
    const theme = cloneDarkTheme();
    setPath(theme, ["spacing", "lg"], -1);

    expectValidationError(
      theme,
      "Theme validation failed at spacing.lg: spacing token must be a non-negative integer (received -1)",
    );
  });

  test("throws when focus indicator bold is not boolean", () => {
    const theme = cloneDarkTheme();
    setPath(theme, ["focusIndicator", "bold"], "yes");

    expectValidationError(
      theme,
      'Theme validation failed at focusIndicator.bold: focus indicator style must be a boolean (received "yes")',
    );
  });

  test("throws when focus indicator underline is not boolean", () => {
    const theme = cloneDarkTheme();
    setPath(theme, ["focusIndicator", "underline"], 1);

    expectValidationError(
      theme,
      "Theme validation failed at focusIndicator.underline: focus indicator style must be a boolean (received 1)",
    );
  });
});
