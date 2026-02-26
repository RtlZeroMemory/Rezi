/**
 * packages/core/src/theme/theme.ts — Theme types and helpers.
 *
 * Why: Provides a minimal theming system for color and spacing tokens that
 * can be resolved deterministically at render time.
 */

import type { Rgb24 } from "../widgets/style.js";
import { defaultTheme } from "./defaultTheme.js";
import type { Theme, ThemeColors, ThemeSpacing } from "./types.js";
export type { Theme, ThemeColors, ThemeSpacing } from "./types.js";

export function createTheme(overrides: Partial<Theme>): Theme;
export function createTheme(
  overrides: Readonly<{ colors?: Partial<ThemeColors>; spacing?: ThemeSpacing }>,
): Theme;
export function createTheme(
  overrides: Partial<Theme> | Readonly<{ colors?: Partial<ThemeColors>; spacing?: ThemeSpacing }>,
): Theme {
  const base = defaultTheme;
  const raw = overrides as { colors?: Partial<ThemeColors>; spacing?: ThemeSpacing };
  const colors = Object.freeze({ ...base.colors, ...(raw.colors ?? {}) }) as ThemeColors;
  const spacing = Object.freeze([...(raw.spacing ?? base.spacing)]);
  return Object.freeze({ colors, spacing });
}

export function resolveColor(theme: Theme, color: string | Rgb24): Rgb24 {
  if (typeof color !== "string") return color;
  return theme.colors[color] ?? theme.colors.fg;
}

export function resolveSpacing(theme: Theme, space: number): number {
  if (!Number.isFinite(space)) return 0;
  if (Number.isInteger(space) && space >= 0 && space < theme.spacing.length) {
    return theme.spacing[space] ?? 0;
  }
  return space;
}
