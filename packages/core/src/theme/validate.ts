/**
 * packages/core/src/theme/validate.ts — Strict semantic theme validation.
 *
 * Why: Ensures custom theme definitions provide all required semantic tokens
 * with deterministic, path-specific error messages.
 */

import type { ThemeDefinition } from "./tokens.js";

type UnknownRecord = Record<string, unknown>;

const REQUIRED_COLOR_PATHS = [
  "name",
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
  "colors.diagnostic.error",
  "colors.diagnostic.warning",
  "colors.diagnostic.info",
  "colors.diagnostic.hint",
  "colors.border.subtle",
  "colors.border.default",
  "colors.border.strong",
] as const;

const REQUIRED_WIDGET_COLOR_PATHS = [
  "widget.syntax.keyword",
  "widget.syntax.type",
  "widget.syntax.string",
  "widget.syntax.number",
  "widget.syntax.comment",
  "widget.syntax.operator",
  "widget.syntax.punctuation",
  "widget.syntax.function",
  "widget.syntax.variable",
  "widget.syntax.cursorFg",
  "widget.syntax.cursorBg",
  "widget.diff.addBg",
  "widget.diff.deleteBg",
  "widget.diff.addFg",
  "widget.diff.deleteFg",
  "widget.diff.hunkHeader",
  "widget.diff.lineNumber",
  "widget.diff.border",
  "widget.logs.trace",
  "widget.logs.debug",
  "widget.logs.info",
  "widget.logs.warn",
  "widget.logs.error",
  "widget.toast.info",
  "widget.toast.success",
  "widget.toast.warning",
  "widget.toast.error",
  "widget.chart.primary",
  "widget.chart.accent",
  "widget.chart.muted",
  "widget.chart.success",
  "widget.chart.warning",
  "widget.chart.danger",
] as const;

const REQUIRED_SPACING_PATHS = [
  "spacing.xs",
  "spacing.sm",
  "spacing.md",
  "spacing.lg",
  "spacing.xl",
  "spacing.2xl",
] as const;

const REQUIRED_FOCUS_STYLE_PATHS = ["focusIndicator.bold", "focusIndicator.underline"] as const;

const REQUIRED_THEME_PATHS = [
  ...REQUIRED_COLOR_PATHS,
  ...REQUIRED_WIDGET_COLOR_PATHS,
  ...REQUIRED_SPACING_PATHS,
  ...REQUIRED_FOCUS_STYLE_PATHS,
] as const;

function isRecord(value: unknown): value is UnknownRecord {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function getPathValue(root: unknown, path: string): unknown {
  const parts = path.split(".");
  let cursor: unknown = root;
  for (const part of parts) {
    if (!isRecord(cursor) || !(part in cursor)) return undefined;
    cursor = cursor[part];
  }
  return cursor;
}

function formatValue(value: unknown): string {
  if (typeof value === "string") return JSON.stringify(value);
  if (
    typeof value === "number" ||
    typeof value === "boolean" ||
    value === null ||
    value === undefined
  ) {
    return String(value);
  }
  if (Array.isArray(value)) return "[array]";
  return "[object]";
}

function throwMissingPaths(theme: unknown): void {
  const missing = REQUIRED_THEME_PATHS.filter((path) => getPathValue(theme, path) === undefined);
  if (missing.length === 0) return;
  throw new Error(`Theme validation failed: missing required token path(s): ${missing.join(", ")}`);
}

function validateName(path: string, value: unknown): void {
  if (typeof value !== "string" || value.length === 0) {
    throw new Error(
      `Theme validation failed at ${path}: expected non-empty string (received ${formatValue(value)})`,
    );
  }
}

function validateRgb(path: string, value: unknown): void {
  if (typeof value !== "number" || !Number.isInteger(value) || value < 0 || value > 0x00ffffff) {
    throw new Error(
      `Theme validation failed at ${path}: expected packed Rgb24 integer 0..0x00FFFFFF (received ${formatValue(value)})`,
    );
  }
}

function validateSpacingValue(path: string, value: unknown): void {
  if (typeof value !== "number" || !Number.isInteger(value) || value < 0) {
    throw new Error(
      `Theme validation failed at ${path}: spacing token must be a non-negative integer (received ${formatValue(value)})`,
    );
  }
}

function validateFocusStyle(path: string, value: unknown): void {
  if (typeof value !== "boolean") {
    throw new Error(
      `Theme validation failed at ${path}: focus indicator style must be a boolean (received ${formatValue(value)})`,
    );
  }
}

/**
 * Validate a semantic theme definition.
 *
 * Throws on first invalid value with deterministic path-specific errors.
 * Missing required paths are reported together in deterministic order.
 */
export function validateTheme(theme: unknown): ThemeDefinition {
  throwMissingPaths(theme);

  validateName("name", getPathValue(theme, "name"));

  for (const path of REQUIRED_COLOR_PATHS) {
    if (path === "name") continue;
    validateRgb(path, getPathValue(theme, path));
  }

  for (const path of REQUIRED_WIDGET_COLOR_PATHS) {
    validateRgb(path, getPathValue(theme, path));
  }

  for (const path of REQUIRED_SPACING_PATHS) {
    validateSpacingValue(path, getPathValue(theme, path));
  }

  for (const path of REQUIRED_FOCUS_STYLE_PATHS) {
    validateFocusStyle(path, getPathValue(theme, path));
  }

  return theme as ThemeDefinition;
}
