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
 * Syntax highlighting token set for code-oriented widgets.
 */
export type SyntaxTokens = Readonly<{
  keyword: Rgb24;
  type: Rgb24;
  string: Rgb24;
  number: Rgb24;
  comment: Rgb24;
  operator: Rgb24;
  punctuation: Rgb24;
  function: Rgb24;
  variable: Rgb24;
  cursorFg: Rgb24;
  cursorBg: Rgb24;
}>;

/**
 * Diff viewer token set.
 */
export type DiffTokens = Readonly<{
  addBg: Rgb24;
  deleteBg: Rgb24;
  addFg: Rgb24;
  deleteFg: Rgb24;
  hunkHeader: Rgb24;
  lineNumber: Rgb24;
  border: Rgb24;
}>;

/**
 * Log console level token set.
 */
export type LogsTokens = Readonly<{
  trace: Rgb24;
  debug: Rgb24;
  info: Rgb24;
  warn: Rgb24;
  error: Rgb24;
}>;

/**
 * Toast style token set.
 */
export type ToastTokens = Readonly<{
  info: Rgb24;
  success: Rgb24;
  warning: Rgb24;
  error: Rgb24;
}>;

/**
 * Chart palette token set.
 */
export type ChartTokens = Readonly<{
  primary: Rgb24;
  accent: Rgb24;
  muted: Rgb24;
  success: Rgb24;
  warning: Rgb24;
  danger: Rgb24;
}>;

/**
 * Extended widget-specific theme tokens.
 */
export type WidgetTokens = Readonly<{
  syntax: SyntaxTokens;
  diff: DiffTokens;
  logs: LogsTokens;
  toast: ToastTokens;
  chart: ChartTokens;
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
  /** Required spacing scale used by design-system recipes. */
  spacing: ThemeSpacingTokens;
  /** Required default focus indicator styling. */
  focusIndicator: FocusIndicatorTokens;
  /** Widget-specific palettes for advanced surfaces. */
  widget: WidgetTokens;
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

function createWidgetTokens(tokens: WidgetTokens): WidgetTokens {
  return Object.freeze({
    syntax: Object.freeze({ ...tokens.syntax }),
    diff: Object.freeze({ ...tokens.diff }),
    logs: Object.freeze({ ...tokens.logs }),
    toast: Object.freeze({ ...tokens.toast }),
    chart: Object.freeze({ ...tokens.chart }),
  });
}

function createDefaultWidgetTokens(colors: ColorTokens): WidgetTokens {
  return Object.freeze({
    syntax: Object.freeze({
      keyword: colors.accent.secondary,
      type: colors.warning,
      string: colors.success,
      number: colors.warning,
      comment: colors.fg.muted,
      operator: colors.accent.primary,
      punctuation: colors.fg.primary,
      function: colors.accent.primary,
      variable: colors.accent.tertiary,
      cursorFg: colors.bg.base,
      cursorBg: colors.accent.primary,
    }),
    diff: Object.freeze({
      addBg: colors.success,
      deleteBg: colors.error,
      addFg: colors.fg.inverse,
      deleteFg: colors.fg.inverse,
      hunkHeader: colors.info,
      lineNumber: colors.fg.muted,
      border: colors.border.default,
    }),
    logs: Object.freeze({
      trace: colors.fg.muted,
      debug: colors.fg.secondary,
      info: colors.fg.primary,
      warn: colors.warning,
      error: colors.error,
    }),
    toast: Object.freeze({
      info: colors.info,
      success: colors.success,
      warning: colors.warning,
      error: colors.error,
    }),
    chart: Object.freeze({
      primary: colors.accent.primary,
      accent: colors.info,
      muted: colors.fg.muted,
      success: colors.success,
      warning: colors.warning,
      danger: colors.error,
    }),
  });
}

/**
 * Helper to create a complete theme definition.
 */
export function createThemeDefinition(
  name: string,
  colors: ColorTokens,
  options: Readonly<{
    spacing?: ThemeSpacingTokens;
    focusIndicator?: FocusIndicatorTokens;
    widget?: WidgetTokens;
  }> = {},
): ThemeDefinition {
  return Object.freeze({
    name,
    colors: createColorTokens(colors),
    spacing: Object.freeze({ ...(options.spacing ?? DEFAULT_THEME_SPACING) }),
    focusIndicator: Object.freeze({ ...(options.focusIndicator ?? DEFAULT_FOCUS_INDICATOR) }),
    widget: createWidgetTokens(options.widget ?? createDefaultWidgetTokens(colors)),
  });
}
