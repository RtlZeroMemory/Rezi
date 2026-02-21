/**
 * packages/core/src/theme/resolve.ts — Theme resolution system.
 *
 * Why: Resolves color token paths to RGB values using dot notation.
 * Supports paths like "fg.primary", "accent.secondary", "error".
 *
 * @see docs/styling/theme.md
 */

import type { Rgb } from "../widgets/style.js";
import type { ColorTokens, ThemeDefinition } from "./tokens.js";

/**
 * Type-safe color path union.
 * Supports all valid paths into the ColorTokens structure.
 */
export type ColorPath =
  // Background paths
  | "bg.base"
  | "bg.elevated"
  | "bg.overlay"
  | "bg.subtle"
  // Foreground paths
  | "fg.primary"
  | "fg.secondary"
  | "fg.muted"
  | "fg.inverse"
  // Accent paths
  | "accent.primary"
  | "accent.secondary"
  | "accent.tertiary"
  // Semantic (top-level)
  | "success"
  | "warning"
  | "error"
  | "info"
  // Focus paths
  | "focus.ring"
  | "focus.bg"
  // Selected paths
  | "selected.bg"
  | "selected.fg"
  // Disabled paths
  | "disabled.fg"
  | "disabled.bg"
  // Diagnostic paths
  | "diagnostic.error"
  | "diagnostic.warning"
  | "diagnostic.info"
  | "diagnostic.hint"
  // Border paths
  | "border.subtle"
  | "border.default"
  | "border.strong";

/**
 * Result of color resolution.
 */
export type ResolveColorResult = { ok: true; value: Rgb } | { ok: false; error: string };

/**
 * Resolve a color token path to an RGB value.
 *
 * @param theme - The theme definition containing color tokens
 * @param path - Dot-notation path (e.g., "fg.primary", "error")
 * @returns The resolved RGB color, or null if path is invalid
 *
 * @example
 * ```typescript
 * const color = resolveColorToken(darkTheme, "fg.primary");
 * // { r: 230, g: 225, b: 207 }
 *
 * const error = resolveColorToken(darkTheme, "error");
 * // { r: 240, g: 113, b: 120 }
 * ```
 */
export function resolveColorToken(theme: ThemeDefinition, path: ColorPath): Rgb;
export function resolveColorToken(theme: ThemeDefinition, path: string): Rgb | null;
export function resolveColorToken(theme: ThemeDefinition, path: string): Rgb | null {
  const colors = theme.colors;
  const parts = path.split(".");

  if (parts.length === 1) {
    // Top-level semantic colors
    const key = parts[0];
    if (key === "success") return colors.success;
    if (key === "warning") return colors.warning;
    if (key === "error") return colors.error;
    if (key === "info") return colors.info;
    return null;
  }

  if (parts.length === 2) {
    const [group, key] = parts as [string, string];
    return resolveNestedToken(colors, group, key);
  }

  return null;
}

/**
 * Resolve a nested color token (two-level path).
 * @internal
 */
function resolveNestedToken(colors: ColorTokens, group: string, key: string): Rgb | null {
  switch (group) {
    case "bg":
      if (key === "base") return colors.bg.base;
      if (key === "elevated") return colors.bg.elevated;
      if (key === "overlay") return colors.bg.overlay;
      if (key === "subtle") return colors.bg.subtle;
      break;
    case "fg":
      if (key === "primary") return colors.fg.primary;
      if (key === "secondary") return colors.fg.secondary;
      if (key === "muted") return colors.fg.muted;
      if (key === "inverse") return colors.fg.inverse;
      break;
    case "accent":
      if (key === "primary") return colors.accent.primary;
      if (key === "secondary") return colors.accent.secondary;
      if (key === "tertiary") return colors.accent.tertiary;
      break;
    case "focus":
      if (key === "ring") return colors.focus.ring;
      if (key === "bg") return colors.focus.bg;
      break;
    case "selected":
      if (key === "bg") return colors.selected.bg;
      if (key === "fg") return colors.selected.fg;
      break;
    case "disabled":
      if (key === "fg") return colors.disabled.fg;
      if (key === "bg") return colors.disabled.bg;
      break;
    case "diagnostic":
      if (key === "error") return colors.diagnostic.error;
      if (key === "warning") return colors.diagnostic.warning;
      if (key === "info") return colors.diagnostic.info;
      if (key === "hint") return colors.diagnostic.hint;
      break;
    case "border":
      if (key === "subtle") return colors.border.subtle;
      if (key === "default") return colors.border.default;
      if (key === "strong") return colors.border.strong;
      break;
  }
  return null;
}

/**
 * Try to resolve a color token path, returning a Result type.
 *
 * @param theme - The theme definition
 * @param path - Color path to resolve
 * @returns Result with resolved color or error message
 */
export function tryResolveColorToken(theme: ThemeDefinition, path: string): ResolveColorResult {
  const result = resolveColorToken(theme, path);
  if (result === null) {
    return { ok: false, error: `Invalid color path: ${path}` };
  }
  return { ok: true, value: result };
}

/**
 * Resolve a color value that may be either a path string or direct RGB.
 * Falls back to a default color if resolution fails.
 *
 * @param theme - The theme definition
 * @param color - Either a color path string or direct RGB value
 * @param fallback - Fallback color if resolution fails
 * @returns Resolved RGB color
 */
export function resolveColorOrRgb(
  theme: ThemeDefinition,
  color: string | Rgb | undefined,
  fallback: Rgb,
): Rgb {
  if (color === undefined) return fallback;
  if (typeof color !== "string") return color;
  return resolveColorToken(theme, color) ?? fallback;
}

/**
 * Check if a string is a valid color path.
 *
 * @param path - String to check
 * @returns True if path is a valid ColorPath
 */
export function isValidColorPath(path: string): path is ColorPath {
  const validPaths: ReadonlySet<string> = new Set([
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
  ]);
  return validPaths.has(path);
}
