/**
 * packages/core/src/theme/tokens.ts — Semantic color token system.
 *
 * Why: Provides a structured, semantic color system for consistent theming.
 * All colors are RGB objects { r, g, b } with values 0-255.
 *
 * Token categories:
 *   - bg: Surface/background colors
 *   - fg: Foreground/text colors
 *   - accent: Brand/accent colors
 *   - Semantic: success, warning, error, info
 *   - States: focus, selected, disabled
 *   - border: Border colors by intensity
 *
 * @see docs/styling/theme.md
 */

import type { Rgb } from "../widgets/style.js";

/**
 * Surface (background) color tokens.
 */
export type BgTokens = Readonly<{
  /** Main background color */
  base: Rgb;
  /** Elevated surfaces (cards, modals) */
  elevated: Rgb;
  /** Overlay surfaces (dropdowns, tooltips) */
  overlay: Rgb;
  /** Subtle hover/focus backgrounds */
  subtle: Rgb;
}>;

/**
 * Foreground (text) color tokens.
 */
export type FgTokens = Readonly<{
  /** Primary text color */
  primary: Rgb;
  /** Secondary/less important text */
  secondary: Rgb;
  /** Muted text (disabled, placeholders) */
  muted: Rgb;
  /** Inverse text (on accent backgrounds) */
  inverse: Rgb;
}>;

/**
 * Accent color tokens.
 */
export type AccentTokens = Readonly<{
  /** Primary accent (actions, focus) */
  primary: Rgb;
  /** Secondary accent (links, highlights) */
  secondary: Rgb;
  /** Tertiary accent (subtle accents) */
  tertiary: Rgb;
}>;

/**
 * Focus state tokens.
 */
export type FocusTokens = Readonly<{
  /** Focus ring/outline color */
  ring: Rgb;
  /** Focus background color */
  bg: Rgb;
}>;

/**
 * Selection state tokens.
 */
export type SelectedTokens = Readonly<{
  /** Selected item background */
  bg: Rgb;
  /** Selected item foreground */
  fg: Rgb;
}>;

/**
 * Disabled state tokens.
 */
export type DisabledTokens = Readonly<{
  /** Disabled foreground */
  fg: Rgb;
  /** Disabled background */
  bg: Rgb;
}>;

/**
 * Border color tokens.
 */
export type BorderTokens = Readonly<{
  /** Subtle borders (dividers) */
  subtle: Rgb;
  /** Default borders */
  default: Rgb;
  /** Strong/emphasized borders */
  strong: Rgb;
}>;

/**
 * Diagnostic underline/annotation colors.
 */
export type DiagnosticTokens = Readonly<{
  error: Rgb;
  warning: Rgb;
  info: Rgb;
  hint: Rgb;
}>;

/**
 * Complete semantic color token set.
 */
export type ColorTokens = Readonly<{
  // Surfaces
  bg: BgTokens;

  // Foreground
  fg: FgTokens;

  // Accent colors
  accent: AccentTokens;

  // Semantic colors
  success: Rgb;
  warning: Rgb;
  error: Rgb;
  info: Rgb;

  // Interactive states
  focus: FocusTokens;
  selected: SelectedTokens;
  disabled: DisabledTokens;

  // Borders
  border: BorderTokens;

  // Diagnostic tokens
  diagnostic?: DiagnosticTokens;
}>;

/**
 * Required spacing scale for semantic themes.
 *
 * Mirrors docs/styling/index.md spacing keys.
 */
export type ThemeSpacingTokens = Readonly<{
  xs: number;
  sm: number;
  md: number;
  lg: number;
  xl: number;
  "2xl": number;
}>;

/**
 * Focus indicator style tokens.
 *
 * Rezi default focus style is underline + bold.
 */
export type FocusIndicatorTokens = Readonly<{
  bold: boolean;
  underline: boolean;
}>;

/**
 * Theme definition with name and color tokens.
 */
export type ThemeDefinition = Readonly<{
  /** Theme display name */
  name: string;
  /** Complete color token set */
  colors: ColorTokens;
  /**
   * Optional spacing scale for forward compatibility.
   * Added by createThemeDefinition for built-in presets.
   */
  spacing?: ThemeSpacingTokens;
  /**
   * Optional focus indicator style tokens for forward compatibility.
   * Added by createThemeDefinition for built-in presets.
   */
  focusIndicator?: FocusIndicatorTokens;
}>;

/**
 * Default semantic spacing tokens used by createThemeDefinition.
 */
export const DEFAULT_THEME_SPACING: ThemeSpacingTokens = Object.freeze({
  xs: 1,
  sm: 1,
  md: 2,
  lg: 3,
  xl: 4,
  "2xl": 6,
});

/**
 * Default focus indicator style used by createThemeDefinition.
 */
export const DEFAULT_FOCUS_INDICATOR: FocusIndicatorTokens = Object.freeze({
  bold: true,
  underline: true,
});

/**
 * Helper to create a frozen RGB color.
 */
export function color(r: number, g: number, b: number): Rgb {
  return Object.freeze({ r, g, b });
}

/**
 * Helper to create a complete, frozen color token set.
 */
export function createColorTokens(tokens: ColorTokens): ColorTokens {
  const diagnostic: DiagnosticTokens =
    tokens.diagnostic ??
    Object.freeze({
      error: tokens.error,
      warning: tokens.warning,
      info: tokens.info,
      hint: tokens.accent.tertiary,
    });
  return Object.freeze({
    bg: Object.freeze({ ...tokens.bg }),
    fg: Object.freeze({ ...tokens.fg }),
    accent: Object.freeze({ ...tokens.accent }),
    success: tokens.success,
    warning: tokens.warning,
    error: tokens.error,
    info: tokens.info,
    focus: Object.freeze({ ...tokens.focus }),
    selected: Object.freeze({ ...tokens.selected }),
    disabled: Object.freeze({ ...tokens.disabled }),
    border: Object.freeze({ ...tokens.border }),
    diagnostic: Object.freeze({ ...diagnostic }),
  });
}

/**
 * Helper to create a complete theme definition.
 */
export function createThemeDefinition(name: string, colors: ColorTokens): ThemeDefinition {
  return Object.freeze({
    name,
    colors: createColorTokens(colors),
    spacing: DEFAULT_THEME_SPACING,
    focusIndicator: DEFAULT_FOCUS_INDICATOR,
  });
}
