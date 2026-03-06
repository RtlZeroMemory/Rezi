/**
 * packages/core/src/theme/resolve.ts — Theme resolution system.
 */

import type { Rgb24 } from "../widgets/style.js";
import type { ThemeDefinition } from "./tokens.js";

const COLOR_PATHS = [
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

const VALID_COLOR_PATHS: ReadonlySet<string> = new Set(COLOR_PATHS);

export type ColorPath = (typeof COLOR_PATHS)[number];

export type ResolveColorResult = { ok: true; value: Rgb24 } | { ok: false; error: string };

function getPathValue(theme: ThemeDefinition, path: ColorPath): Rgb24 {
  switch (path) {
    case "bg.base":
      return theme.colors.bg.base;
    case "bg.elevated":
      return theme.colors.bg.elevated;
    case "bg.overlay":
      return theme.colors.bg.overlay;
    case "bg.subtle":
      return theme.colors.bg.subtle;
    case "fg.primary":
      return theme.colors.fg.primary;
    case "fg.secondary":
      return theme.colors.fg.secondary;
    case "fg.muted":
      return theme.colors.fg.muted;
    case "fg.inverse":
      return theme.colors.fg.inverse;
    case "accent.primary":
      return theme.colors.accent.primary;
    case "accent.secondary":
      return theme.colors.accent.secondary;
    case "accent.tertiary":
      return theme.colors.accent.tertiary;
    case "success":
      return theme.colors.success;
    case "warning":
      return theme.colors.warning;
    case "error":
      return theme.colors.error;
    case "info":
      return theme.colors.info;
    case "focus.ring":
      return theme.colors.focus.ring;
    case "focus.bg":
      return theme.colors.focus.bg;
    case "selected.bg":
      return theme.colors.selected.bg;
    case "selected.fg":
      return theme.colors.selected.fg;
    case "disabled.fg":
      return theme.colors.disabled.fg;
    case "disabled.bg":
      return theme.colors.disabled.bg;
    case "diagnostic.error":
      return theme.colors.diagnostic.error;
    case "diagnostic.warning":
      return theme.colors.diagnostic.warning;
    case "diagnostic.info":
      return theme.colors.diagnostic.info;
    case "diagnostic.hint":
      return theme.colors.diagnostic.hint;
    case "border.subtle":
      return theme.colors.border.subtle;
    case "border.default":
      return theme.colors.border.default;
    case "border.strong":
      return theme.colors.border.strong;
    case "widget.syntax.keyword":
      return theme.widget.syntax.keyword;
    case "widget.syntax.type":
      return theme.widget.syntax.type;
    case "widget.syntax.string":
      return theme.widget.syntax.string;
    case "widget.syntax.number":
      return theme.widget.syntax.number;
    case "widget.syntax.comment":
      return theme.widget.syntax.comment;
    case "widget.syntax.operator":
      return theme.widget.syntax.operator;
    case "widget.syntax.punctuation":
      return theme.widget.syntax.punctuation;
    case "widget.syntax.function":
      return theme.widget.syntax.function;
    case "widget.syntax.variable":
      return theme.widget.syntax.variable;
    case "widget.syntax.cursorFg":
      return theme.widget.syntax.cursorFg;
    case "widget.syntax.cursorBg":
      return theme.widget.syntax.cursorBg;
    case "widget.diff.addBg":
      return theme.widget.diff.addBg;
    case "widget.diff.deleteBg":
      return theme.widget.diff.deleteBg;
    case "widget.diff.addFg":
      return theme.widget.diff.addFg;
    case "widget.diff.deleteFg":
      return theme.widget.diff.deleteFg;
    case "widget.diff.hunkHeader":
      return theme.widget.diff.hunkHeader;
    case "widget.diff.lineNumber":
      return theme.widget.diff.lineNumber;
    case "widget.diff.border":
      return theme.widget.diff.border;
    case "widget.logs.trace":
      return theme.widget.logs.trace;
    case "widget.logs.debug":
      return theme.widget.logs.debug;
    case "widget.logs.info":
      return theme.widget.logs.info;
    case "widget.logs.warn":
      return theme.widget.logs.warn;
    case "widget.logs.error":
      return theme.widget.logs.error;
    case "widget.toast.info":
      return theme.widget.toast.info;
    case "widget.toast.success":
      return theme.widget.toast.success;
    case "widget.toast.warning":
      return theme.widget.toast.warning;
    case "widget.toast.error":
      return theme.widget.toast.error;
    case "widget.chart.primary":
      return theme.widget.chart.primary;
    case "widget.chart.accent":
      return theme.widget.chart.accent;
    case "widget.chart.muted":
      return theme.widget.chart.muted;
    case "widget.chart.success":
      return theme.widget.chart.success;
    case "widget.chart.warning":
      return theme.widget.chart.warning;
    case "widget.chart.danger":
      return theme.widget.chart.danger;
  }
}

export function resolveColorToken(theme: ThemeDefinition, path: ColorPath): Rgb24;
export function resolveColorToken(theme: ThemeDefinition, path: string): Rgb24 | null;
export function resolveColorToken(theme: ThemeDefinition, path: string): Rgb24 | null {
  if (!isValidColorPath(path)) return null;
  return getPathValue(theme, path);
}

export function tryResolveColorToken(theme: ThemeDefinition, path: string): ResolveColorResult {
  const result = resolveColorToken(theme, path);
  if (result === null) {
    return { ok: false, error: `Invalid color path: ${path}` };
  }
  return { ok: true, value: result };
}

export function resolveColorOrRgb(
  theme: ThemeDefinition,
  color: string | Rgb24 | undefined,
  fallback: Rgb24,
): Rgb24 {
  if (color === undefined) return fallback;
  if (typeof color !== "string") return color;
  return resolveColorToken(theme, color) ?? fallback;
}

export function isValidColorPath(path: string): path is ColorPath {
  return VALID_COLOR_PATHS.has(path);
}
