/**
 * packages/core/src/theme/defaultTheme.ts — Default theme values.
 *
 * Why: Provides the baseline theme used when the app does not supply one.
 * Kept separate from theme helpers to avoid accidental circular imports.
 */

import { rgb } from "../widgets/style.js";
import type { Theme } from "./types.js";

export const defaultTheme: Theme = Object.freeze({
  colors: Object.freeze({
    primary: rgb(0, 120, 215),
    secondary: rgb(108, 117, 125),
    success: rgb(40, 167, 69),
    danger: rgb(220, 53, 69),
    warning: rgb(255, 193, 7),
    info: rgb(23, 162, 184),
    muted: rgb(128, 128, 128),
    bg: rgb(30, 30, 30),
    fg: rgb(255, 255, 255),
    border: rgb(60, 60, 60),
    "diagnostic.error": rgb(220, 53, 69),
    "diagnostic.warning": rgb(255, 193, 7),
    "diagnostic.info": rgb(23, 162, 184),
    "diagnostic.hint": rgb(40, 167, 69),
    "syntax.keyword": rgb(255, 121, 198),
    "syntax.type": rgb(189, 147, 249),
    "syntax.string": rgb(241, 250, 140),
    "syntax.number": rgb(189, 147, 249),
    "syntax.comment": rgb(98, 114, 164),
    "syntax.operator": rgb(255, 121, 198),
    "syntax.punctuation": rgb(248, 248, 242),
    "syntax.function": rgb(80, 250, 123),
    "syntax.variable": rgb(139, 233, 253),
    "syntax.cursor.fg": rgb(40, 42, 54),
    "syntax.cursor.bg": rgb(139, 233, 253),
    "widget.diff.add.bg": rgb(35, 65, 35),
    "widget.diff.delete.bg": rgb(65, 35, 35),
    "widget.diff.add.fg": rgb(150, 255, 150),
    "widget.diff.delete.fg": rgb(255, 150, 150),
    "widget.diff.hunkHeader": rgb(100, 149, 237),
    "widget.diff.lineNumber": rgb(100, 100, 100),
    "widget.diff.border": rgb(80, 80, 80),
    "widget.logs.level.trace": rgb(100, 100, 100),
    "widget.logs.level.debug": rgb(150, 150, 150),
    "widget.logs.level.info": rgb(255, 255, 255),
    "widget.logs.level.warn": rgb(255, 200, 50),
    "widget.logs.level.error": rgb(255, 80, 80),
    "widget.toast.info": rgb(50, 150, 255),
    "widget.toast.success": rgb(50, 200, 100),
    "widget.toast.warning": rgb(255, 200, 50),
    "widget.toast.error": rgb(255, 80, 80),
  }),
  spacing: Object.freeze([0, 1, 2, 4, 8, 16]),
});
