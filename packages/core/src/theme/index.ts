/**
 * packages/core/src/theme/index.ts — Theme public exports.
 */

export {
  color,
  createColorTokens,
  createThemeDefinition,
  DEFAULT_FOCUS_INDICATOR,
  DEFAULT_THEME_SPACING,
  type AccentTokens,
  type BgTokens,
  type BorderTokens,
  type ChartTokens,
  type ColorTokens,
  type DiagnosticTokens,
  type DiffTokens,
  type DisabledTokens,
  type FocusIndicatorTokens,
  type FgTokens,
  type FocusTokens,
  type LogsTokens,
  type SelectedTokens,
  type SyntaxTokens,
  type ThemeDefinition,
  type ThemeSpacingTokens,
  type ToastTokens,
  type WidgetTokens,
} from "./tokens.js";
export {
  darkTheme,
  lightTheme,
  dimmedTheme,
  highContrastTheme,
  nordTheme,
  draculaTheme,
  themePresets,
  type ThemePresetName,
} from "./presets.js";
export {
  resolveColorToken,
  tryResolveColorToken,
  resolveColorOrRgb,
  isValidColorPath,
  type ColorPath,
  type ResolveColorResult,
} from "./resolve.js";
export { validateTheme } from "./validate.js";
export { extendTheme, type ThemeOverrides } from "./extend.js";
export { contrastRatio } from "./contrast.js";
