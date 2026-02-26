/**
 * packages/core/src/theme/tokens.ts — Semantic color token system.
 *
 * Why: Provides a structured, semantic color system for consistent theming.
 * All colors are packed RGB values (0x00RRGGBB).
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

import { type Rgb24, rgb } from "../widgets/style.js";

/**
 * Surface (background) color tokens.
 */
export type BgTokens = Readonly<{
  /** Main background color */
  base: Rgb24;
  /** Elevated surfaces (cards, modals) */
  elevated: Rgb24;
  /** Overlay surfaces (dropdowns, tooltips) */
  overlay: Rgb24;
  /** Subtle hover/focus backgrounds */
  subtle: Rgb24;
}>;

/**
 * Foreground (text) color tokens.
 */
export type FgTokens = Readonly<{
  /** Primary text color */
  primary: Rgb24;
  /** Secondary/less important text */
  secondary: Rgb24;
  /** Muted text (disabled, placeholders) */
  muted: Rgb24;
  /** Inverse text (on accent backgrounds) */
  inverse: Rgb24;
}>;

/**
 * Accent color tokens.
 */
export type AccentTokens = Readonly<{
  /** Primary accent (actions, focus) */
  primary: Rgb24;
  /** Secondary accent (links, highlights) */
  secondary: Rgb24;
  /** Tertiary accent (subtle accents) */
  tertiary: Rgb24;
}>;

/**
 * Focus state tokens.
 */
export type FocusTokens = Readonly<{
  /** Focus ring/outline color */
  ring: Rgb24;
  /** Focus background color */
  bg: Rgb24;
}>;

/**
 * Selection state tokens.
 */
export type SelectedTokens = Readonly<{
  /** Selected item background */
  bg: Rgb24;
  /** Selected item foreground */
  fg: Rgb24;
}>;

/**
 * Disabled state tokens.
 */
export type DisabledTokens = Readonly<{
  /** Disabled foreground */
  fg: Rgb24;
  /** Disabled background */
  bg: Rgb24;
}>;

/**
 * Border color tokens.
 */
export type BorderTokens = Readonly<{
  /** Subtle borders (dividers) */
  subtle: Rgb24;
  /** Default borders */
  default: Rgb24;
  /** Strong/emphasized borders */
  strong: Rgb24;
}>;

/**
 * Diagnostic color tokens.
 */
export type DiagnosticTokens = Readonly<{
  /** Error diagnostics (squiggles, banners) */
  error: Rgb24;
  /** Warning diagnostics */
  warning: Rgb24;
  /** Informational diagnostics */
  info: Rgb24;
  /** Hint diagnostics */
  hint: Rgb24;
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
  success: Rgb24;
  warning: Rgb24;
  error: Rgb24;
  info: Rgb24;

  // Interactive states
  focus: FocusTokens;
  selected: SelectedTokens;
  disabled: DisabledTokens;

  // Diagnostics
  diagnostic: DiagnosticTokens;

  // Borders
  border: BorderTokens;
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
  focusRingColor?: Rgb24;
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
 * Helper to create a packed RGB color.
 */
export function color(r: number, g: number, b: number): Rgb24 {
  return rgb(r, g, b);
}

/**
 * Helper to create a complete, frozen color token set.
 */
export function createColorTokens(tokens: ColorTokens): ColorTokens {
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
    diagnostic: Object.freeze({ ...tokens.diagnostic }),
    border: Object.freeze({ ...tokens.border }),
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
