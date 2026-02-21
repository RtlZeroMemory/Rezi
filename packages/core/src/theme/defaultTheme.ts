/**
 * packages/core/src/theme/defaultTheme.ts — Default theme values.
 *
 * Why: Provides the baseline theme used when the app does not supply one.
 * Kept separate from theme helpers to avoid accidental circular imports.
 */

import type { Theme } from "./theme.js";

export const defaultTheme: Theme = Object.freeze({
  colors: Object.freeze({
    primary: Object.freeze({ r: 0, g: 120, b: 215 }),
    secondary: Object.freeze({ r: 108, g: 117, b: 125 }),
    success: Object.freeze({ r: 40, g: 167, b: 69 }),
    danger: Object.freeze({ r: 220, g: 53, b: 69 }),
    warning: Object.freeze({ r: 255, g: 193, b: 7 }),
    info: Object.freeze({ r: 23, g: 162, b: 184 }),
    muted: Object.freeze({ r: 128, g: 128, b: 128 }),
    bg: Object.freeze({ r: 30, g: 30, b: 30 }),
    fg: Object.freeze({ r: 255, g: 255, b: 255 }),
    border: Object.freeze({ r: 60, g: 60, b: 60 }),
    "diagnostic.error": Object.freeze({ r: 220, g: 53, b: 69 }),
    "diagnostic.warning": Object.freeze({ r: 255, g: 193, b: 7 }),
    "diagnostic.info": Object.freeze({ r: 23, g: 162, b: 184 }),
    "diagnostic.hint": Object.freeze({ r: 40, g: 167, b: 69 }),
    "syntax.keyword": Object.freeze({ r: 255, g: 121, b: 198 }),
    "syntax.type": Object.freeze({ r: 189, g: 147, b: 249 }),
    "syntax.string": Object.freeze({ r: 241, g: 250, b: 140 }),
    "syntax.number": Object.freeze({ r: 189, g: 147, b: 249 }),
    "syntax.comment": Object.freeze({ r: 98, g: 114, b: 164 }),
    "syntax.operator": Object.freeze({ r: 255, g: 121, b: 198 }),
    "syntax.punctuation": Object.freeze({ r: 248, g: 248, b: 242 }),
    "syntax.function": Object.freeze({ r: 80, g: 250, b: 123 }),
    "syntax.variable": Object.freeze({ r: 139, g: 233, b: 253 }),
    "syntax.cursor.fg": Object.freeze({ r: 40, g: 42, b: 54 }),
    "syntax.cursor.bg": Object.freeze({ r: 139, g: 233, b: 253 }),
  }),
  spacing: Object.freeze([0, 1, 2, 4, 8, 16]),
});
