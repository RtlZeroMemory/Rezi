/**
 * packages/core/src/theme/presets.ts — Built-in theme presets.
 *
 * Why: Provides ready-to-use theme definitions for common color schemes.
 * Each theme follows the semantic token structure for consistent styling.
 *
 * Available themes:
 *   - darkTheme: Ayu-inspired dark theme (default)
 *   - lightTheme: Clean light theme
 *   - dimmedTheme: Reduced contrast dark theme
 *   - highContrastTheme: WCAG AAA compliant
 *   - nordTheme: Nord color palette
 *   - draculaTheme: Dracula color palette
 *
 * @see docs/styling/theme.md
 */

import { type ThemeDefinition, color, createThemeDefinition } from "./tokens.js";

/**
 * Dark theme - Ayu-inspired color palette.
 * Primary: Orange accent, blue secondary, teal tertiary.
 */
export const darkTheme: ThemeDefinition = createThemeDefinition("dark", {
  bg: {
    base: color(10, 14, 20), // #0a0e14
    elevated: color(15, 20, 25), // #0f1419
    overlay: color(26, 31, 38), // #1a1f26
    subtle: color(20, 25, 32), // #141920
  },
  fg: {
    primary: color(230, 225, 207), // #e6e1cf
    secondary: color(92, 103, 115), // #5c6773
    muted: color(62, 75, 89), // #3e4b59
    inverse: color(10, 14, 20), // #0a0e14
  },
  accent: {
    primary: color(255, 180, 84), // #ffb454 (orange)
    secondary: color(89, 194, 255), // #59c2ff (blue)
    tertiary: color(149, 230, 203), // #95e6cb (teal)
  },
  success: color(170, 217, 76), // #aad94c
  warning: color(255, 180, 84), // #ffb454
  error: color(240, 113, 120), // #f07178
  info: color(89, 194, 255), // #59c2ff
  focus: {
    ring: color(255, 180, 84), // #ffb454
    bg: color(26, 31, 38), // #1a1f26
  },
  selected: {
    bg: color(39, 55, 71), // #273747
    fg: color(230, 225, 207), // #e6e1cf
  },
  disabled: {
    fg: color(62, 75, 89), // #3e4b59
    bg: color(15, 20, 25), // #0f1419
  },
  diagnostic: {
    error: color(240, 113, 120), // #f07178
    warning: color(255, 180, 84), // #ffb454
    info: color(89, 194, 255), // #59c2ff
    hint: color(149, 230, 203), // #95e6cb
  },
  border: {
    subtle: color(26, 31, 38), // #1a1f26
    default: color(62, 75, 89), // #3e4b59
    strong: color(92, 103, 115), // #5c6773
  },
});

/**
 * Light theme - Clean and bright.
 * Primary: Blue accent, purple secondary.
 */
export const lightTheme: ThemeDefinition = createThemeDefinition("light", {
  bg: {
    base: color(255, 255, 255), // #ffffff
    elevated: color(250, 250, 250), // #fafafa
    overlay: color(245, 245, 245), // #f5f5f5
    subtle: color(240, 240, 240), // #f0f0f0
  },
  fg: {
    primary: color(36, 41, 46), // #24292e
    secondary: color(88, 96, 105), // #586069
    muted: color(149, 157, 165), // #959da5
    inverse: color(255, 255, 255), // #ffffff
  },
  accent: {
    primary: color(3, 102, 214), // #0366d6 (blue)
    secondary: color(111, 66, 193), // #6f42c1 (purple)
    tertiary: color(34, 134, 58), // #22863a (green)
  },
  success: color(34, 134, 58), // #22863a
  warning: color(227, 98, 9), // #e36209
  error: color(215, 58, 73), // #d73a49
  info: color(3, 102, 214), // #0366d6
  focus: {
    ring: color(3, 102, 214), // #0366d6
    bg: color(241, 248, 255), // #f1f8ff
  },
  selected: {
    bg: color(241, 248, 255), // #f1f8ff
    fg: color(36, 41, 46), // #24292e
  },
  disabled: {
    fg: color(149, 157, 165), // #959da5
    bg: color(250, 250, 250), // #fafafa
  },
  diagnostic: {
    error: color(215, 58, 73), // #d73a49
    warning: color(227, 98, 9), // #e36209
    info: color(3, 102, 214), // #0366d6
    hint: color(111, 66, 193), // #6f42c1
  },
  border: {
    subtle: color(234, 236, 239), // #eaecef
    default: color(209, 213, 218), // #d1d5da
    strong: color(149, 157, 165), // #959da5
  },
});

/**
 * Dimmed theme - Lower contrast dark theme.
 * Easier on the eyes for extended use.
 */
export const dimmedTheme: ThemeDefinition = createThemeDefinition("dimmed", {
  bg: {
    base: color(34, 39, 46), // #22272e
    elevated: color(45, 51, 59), // #2d333b
    overlay: color(56, 62, 71), // #383e47
    subtle: color(40, 46, 54), // #282e36
  },
  fg: {
    primary: color(173, 186, 199), // #adbac7
    secondary: color(118, 131, 144), // #768390
    muted: color(84, 96, 108), // #54606c
    inverse: color(34, 39, 46), // #22272e
  },
  accent: {
    primary: color(82, 156, 202), // #529cca (blue)
    secondary: color(174, 124, 199), // #ae7cc7 (purple)
    tertiary: color(87, 171, 90), // #57ab5a (green)
  },
  success: color(87, 171, 90), // #57ab5a
  warning: color(204, 139, 67), // #cc8b43
  error: color(229, 83, 75), // #e5534b
  info: color(82, 156, 202), // #529cca
  focus: {
    ring: color(82, 156, 202), // #529cca
    bg: color(45, 51, 59), // #2d333b
  },
  selected: {
    bg: color(56, 62, 71), // #383e47
    fg: color(173, 186, 199), // #adbac7
  },
  disabled: {
    fg: color(84, 96, 108), // #54606c
    bg: color(40, 46, 54), // #282e36
  },
  diagnostic: {
    error: color(229, 83, 75), // #e5534b
    warning: color(204, 139, 67), // #cc8b43
    info: color(82, 156, 202), // #529cca
    hint: color(174, 124, 199), // #ae7cc7
  },
  border: {
    subtle: color(56, 62, 71), // #383e47
    default: color(68, 76, 86), // #444c56
    strong: color(84, 96, 108), // #54606c
  },
});

/**
 * High contrast theme - WCAG AAA compliant.
 * Maximum readability for accessibility.
 */
export const highContrastTheme: ThemeDefinition = createThemeDefinition("high-contrast", {
  bg: {
    base: color(0, 0, 0), // #000000
    elevated: color(10, 10, 10), // #0a0a0a
    overlay: color(20, 20, 20), // #141414
    subtle: color(15, 15, 15), // #0f0f0f
  },
  fg: {
    primary: color(255, 255, 255), // #ffffff
    secondary: color(200, 200, 200), // #c8c8c8
    muted: color(150, 150, 150), // #969696
    inverse: color(0, 0, 0), // #000000
  },
  accent: {
    primary: color(0, 200, 255), // #00c8ff (cyan)
    secondary: color(255, 220, 0), // #ffdc00 (yellow)
    tertiary: color(0, 255, 150), // #00ff96 (green)
  },
  success: color(0, 255, 0), // #00ff00
  warning: color(255, 220, 0), // #ffdc00
  error: color(255, 80, 80), // #ff5050
  info: color(0, 200, 255), // #00c8ff
  focus: {
    ring: color(0, 200, 255), // #00c8ff
    bg: color(0, 40, 50), // #002832
  },
  selected: {
    bg: color(0, 80, 100), // #005064
    fg: color(255, 255, 255), // #ffffff
  },
  disabled: {
    fg: color(100, 100, 100), // #646464
    bg: color(20, 20, 20), // #141414
  },
  diagnostic: {
    error: color(255, 80, 80), // #ff5050
    warning: color(255, 220, 0), // #ffdc00
    info: color(0, 200, 255), // #00c8ff
    hint: color(0, 255, 150), // #00ff96
  },
  border: {
    subtle: color(50, 50, 50), // #323232
    default: color(100, 100, 100), // #646464
    strong: color(200, 200, 200), // #c8c8c8
  },
});

/**
 * Nord theme - Based on the Nord color palette.
 * Cool, arctic color scheme.
 */
export const nordTheme: ThemeDefinition = createThemeDefinition("nord", {
  bg: {
    base: color(46, 52, 64), // #2e3440 (nord0)
    elevated: color(59, 66, 82), // #3b4252 (nord1)
    overlay: color(67, 76, 94), // #434c5e (nord2)
    subtle: color(53, 59, 73), // #353b49
  },
  fg: {
    primary: color(236, 239, 244), // #eceff4 (nord6)
    secondary: color(216, 222, 233), // #d8dee9 (nord4)
    muted: color(76, 86, 106), // #4c566a (nord3)
    inverse: color(46, 52, 64), // #2e3440 (nord0)
  },
  accent: {
    primary: color(136, 192, 208), // #88c0d0 (nord8, frost)
    secondary: color(129, 161, 193), // #81a1c1 (nord9, frost)
    tertiary: color(163, 190, 140), // #a3be8c (nord14, aurora green)
  },
  success: color(163, 190, 140), // #a3be8c (nord14)
  warning: color(235, 203, 139), // #ebcb8b (nord13)
  error: color(191, 97, 106), // #bf616a (nord11)
  info: color(136, 192, 208), // #88c0d0 (nord8)
  focus: {
    ring: color(136, 192, 208), // #88c0d0 (nord8)
    bg: color(59, 66, 82), // #3b4252 (nord1)
  },
  selected: {
    bg: color(67, 76, 94), // #434c5e (nord2)
    fg: color(236, 239, 244), // #eceff4 (nord6)
  },
  disabled: {
    fg: color(76, 86, 106), // #4c566a (nord3)
    bg: color(53, 59, 73), // #353b49
  },
  diagnostic: {
    error: color(191, 97, 106), // #bf616a (nord11)
    warning: color(235, 203, 139), // #ebcb8b (nord13)
    info: color(136, 192, 208), // #88c0d0 (nord8)
    hint: color(129, 161, 193), // #81a1c1 (nord9)
  },
  border: {
    subtle: color(59, 66, 82), // #3b4252 (nord1)
    default: color(67, 76, 94), // #434c5e (nord2)
    strong: color(76, 86, 106), // #4c566a (nord3)
  },
});

/**
 * Dracula theme - Based on the Dracula color palette.
 * Dark theme with vibrant colors.
 */
export const draculaTheme: ThemeDefinition = createThemeDefinition("dracula", {
  bg: {
    base: color(40, 42, 54), // #282a36 (background)
    elevated: color(68, 71, 90), // #44475a (current line)
    overlay: color(55, 57, 72), // #373948
    subtle: color(48, 50, 63), // #30323f
  },
  fg: {
    primary: color(248, 248, 242), // #f8f8f2 (foreground)
    secondary: color(189, 147, 249), // #bd93f9 (purple)
    muted: color(98, 114, 164), // #6272a4 (comment)
    inverse: color(40, 42, 54), // #282a36 (background)
  },
  accent: {
    primary: color(189, 147, 249), // #bd93f9 (purple)
    secondary: color(139, 233, 253), // #8be9fd (cyan)
    tertiary: color(80, 250, 123), // #50fa7b (green)
  },
  success: color(80, 250, 123), // #50fa7b (green)
  warning: color(241, 250, 140), // #f1fa8c (yellow)
  error: color(255, 85, 85), // #ff5555 (red)
  info: color(139, 233, 253), // #8be9fd (cyan)
  focus: {
    ring: color(189, 147, 249), // #bd93f9 (purple)
    bg: color(68, 71, 90), // #44475a (current line)
  },
  selected: {
    bg: color(68, 71, 90), // #44475a (current line)
    fg: color(248, 248, 242), // #f8f8f2 (foreground)
  },
  disabled: {
    fg: color(98, 114, 164), // #6272a4 (comment)
    bg: color(48, 50, 63), // #30323f
  },
  diagnostic: {
    error: color(255, 85, 85), // #ff5555 (red)
    warning: color(241, 250, 140), // #f1fa8c (yellow)
    info: color(139, 233, 253), // #8be9fd (cyan)
    hint: color(189, 147, 249), // #bd93f9 (purple)
  },
  border: {
    subtle: color(55, 57, 72), // #373948
    default: color(68, 71, 90), // #44475a (current line)
    strong: color(98, 114, 164), // #6272a4 (comment)
  },
});

/**
 * All built-in theme presets.
 */
export const themePresets = {
  dark: darkTheme,
  light: lightTheme,
  dimmed: dimmedTheme,
  "high-contrast": highContrastTheme,
  nord: nordTheme,
  dracula: draculaTheme,
} as const;

/**
 * Type for theme preset names.
 */
export type ThemePresetName = keyof typeof themePresets;
