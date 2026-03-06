/**
 * packages/core/src/theme/theme.ts — Internal compiled runtime theme helpers.
 *
 * Why: The public contract is `ThemeDefinition`, but the renderer benefits from
 * a precompiled color index and resolved spacing array.
 */

import { blendRgb } from "./blend.js";
import type {
  ColorTokens,
  FocusIndicatorTokens,
  ThemeDefinition,
  ThemeSpacingTokens,
  WidgetTokens,
} from "./tokens.js";
import { validateTheme } from "./validate.js";
import type { Theme, ThemeColors, ThemeSpacing } from "./types.js";
export type { Theme, ThemeColors, ThemeSpacing } from "./types.js";

const compiledThemeCache = new WeakMap<ThemeDefinition, Theme>();

function buildSpacing(spacing: ThemeSpacingTokens): ThemeSpacing {
  return Object.freeze([0, spacing.xs, spacing.sm, spacing.md, spacing.lg, spacing.xl, spacing["2xl"]]);
}

function buildColorIndex(theme: ThemeDefinition): ThemeColors {
  const c = theme.colors;
  const widget = theme.widget;

  return Object.freeze({
    primary: c.accent.primary,
    secondary: c.accent.secondary,
    success: c.success,
    danger: c.error,
    warning: c.warning,
    info: c.info,
    muted: c.fg.muted,
    bg: c.bg.base,
    fg: c.fg.primary,
    border: c.border.default,
    error: c.error,
    "bg.base": c.bg.base,
    "bg.elevated": c.bg.elevated,
    "bg.overlay": c.bg.overlay,
    "bg.subtle": c.bg.subtle,
    "fg.primary": c.fg.primary,
    "fg.secondary": c.fg.secondary,
    "fg.muted": c.fg.muted,
    "fg.inverse": c.fg.inverse,
    "accent.primary": c.accent.primary,
    "accent.secondary": c.accent.secondary,
    "accent.tertiary": c.accent.tertiary,
    "focus.ring": c.focus.ring,
    "focus.bg": c.focus.bg,
    "selected.bg": c.selected.bg,
    "selected.fg": c.selected.fg,
    "disabled.fg": c.disabled.fg,
    "disabled.bg": c.disabled.bg,
    "diagnostic.error": c.diagnostic.error,
    "diagnostic.warning": c.diagnostic.warning,
    "diagnostic.info": c.diagnostic.info,
    "diagnostic.hint": c.diagnostic.hint,
    "border.subtle": c.border.subtle,
    "border.default": c.border.default,
    "border.strong": c.border.strong,
    "widget.syntax.keyword": widget.syntax.keyword,
    "widget.syntax.type": widget.syntax.type,
    "widget.syntax.string": widget.syntax.string,
    "widget.syntax.number": widget.syntax.number,
    "widget.syntax.comment": widget.syntax.comment,
    "widget.syntax.operator": widget.syntax.operator,
    "widget.syntax.punctuation": widget.syntax.punctuation,
    "widget.syntax.function": widget.syntax.function,
    "widget.syntax.variable": widget.syntax.variable,
    "widget.syntax.cursorFg": widget.syntax.cursorFg,
    "widget.syntax.cursorBg": widget.syntax.cursorBg,
    "widget.diff.addBg": widget.diff.addBg,
    "widget.diff.deleteBg": widget.diff.deleteBg,
    "widget.diff.addFg": widget.diff.addFg,
    "widget.diff.deleteFg": widget.diff.deleteFg,
    "widget.diff.hunkHeader": widget.diff.hunkHeader,
    "widget.diff.lineNumber": widget.diff.lineNumber,
    "widget.diff.border": widget.diff.border,
    "widget.logs.trace": widget.logs.trace,
    "widget.logs.debug": widget.logs.debug,
    "widget.logs.info": widget.logs.info,
    "widget.logs.warn": widget.logs.warn,
    "widget.logs.error": widget.logs.error,
    "widget.toast.info": widget.toast.info,
    "widget.toast.success": widget.toast.success,
    "widget.toast.warning": widget.toast.warning,
    "widget.toast.error": widget.toast.error,
    "widget.chart.primary": widget.chart.primary,
    "widget.chart.accent": widget.chart.accent,
    "widget.chart.muted": widget.chart.muted,
    "widget.chart.success": widget.chart.success,
    "widget.chart.warning": widget.chart.warning,
    "widget.chart.danger": widget.chart.danger,
  });
}

function blendColorTokens(from: ColorTokens, to: ColorTokens, t: number): ColorTokens {
  return Object.freeze({
    bg: Object.freeze({
      base: blendRgb(from.bg.base, to.bg.base, t),
      elevated: blendRgb(from.bg.elevated, to.bg.elevated, t),
      overlay: blendRgb(from.bg.overlay, to.bg.overlay, t),
      subtle: blendRgb(from.bg.subtle, to.bg.subtle, t),
    }),
    fg: Object.freeze({
      primary: blendRgb(from.fg.primary, to.fg.primary, t),
      secondary: blendRgb(from.fg.secondary, to.fg.secondary, t),
      muted: blendRgb(from.fg.muted, to.fg.muted, t),
      inverse: blendRgb(from.fg.inverse, to.fg.inverse, t),
    }),
    accent: Object.freeze({
      primary: blendRgb(from.accent.primary, to.accent.primary, t),
      secondary: blendRgb(from.accent.secondary, to.accent.secondary, t),
      tertiary: blendRgb(from.accent.tertiary, to.accent.tertiary, t),
    }),
    success: blendRgb(from.success, to.success, t),
    warning: blendRgb(from.warning, to.warning, t),
    error: blendRgb(from.error, to.error, t),
    info: blendRgb(from.info, to.info, t),
    focus: Object.freeze({
      ring: blendRgb(from.focus.ring, to.focus.ring, t),
      bg: blendRgb(from.focus.bg, to.focus.bg, t),
    }),
    selected: Object.freeze({
      bg: blendRgb(from.selected.bg, to.selected.bg, t),
      fg: blendRgb(from.selected.fg, to.selected.fg, t),
    }),
    disabled: Object.freeze({
      fg: blendRgb(from.disabled.fg, to.disabled.fg, t),
      bg: blendRgb(from.disabled.bg, to.disabled.bg, t),
    }),
    diagnostic: Object.freeze({
      error: blendRgb(from.diagnostic.error, to.diagnostic.error, t),
      warning: blendRgb(from.diagnostic.warning, to.diagnostic.warning, t),
      info: blendRgb(from.diagnostic.info, to.diagnostic.info, t),
      hint: blendRgb(from.diagnostic.hint, to.diagnostic.hint, t),
    }),
    border: Object.freeze({
      subtle: blendRgb(from.border.subtle, to.border.subtle, t),
      default: blendRgb(from.border.default, to.border.default, t),
      strong: blendRgb(from.border.strong, to.border.strong, t),
    }),
  });
}

function blendWidgetTokens(from: WidgetTokens, to: WidgetTokens, t: number): WidgetTokens {
  return Object.freeze({
    syntax: Object.freeze({
      keyword: blendRgb(from.syntax.keyword, to.syntax.keyword, t),
      type: blendRgb(from.syntax.type, to.syntax.type, t),
      string: blendRgb(from.syntax.string, to.syntax.string, t),
      number: blendRgb(from.syntax.number, to.syntax.number, t),
      comment: blendRgb(from.syntax.comment, to.syntax.comment, t),
      operator: blendRgb(from.syntax.operator, to.syntax.operator, t),
      punctuation: blendRgb(from.syntax.punctuation, to.syntax.punctuation, t),
      function: blendRgb(from.syntax.function, to.syntax.function, t),
      variable: blendRgb(from.syntax.variable, to.syntax.variable, t),
      cursorFg: blendRgb(from.syntax.cursorFg, to.syntax.cursorFg, t),
      cursorBg: blendRgb(from.syntax.cursorBg, to.syntax.cursorBg, t),
    }),
    diff: Object.freeze({
      addBg: blendRgb(from.diff.addBg, to.diff.addBg, t),
      deleteBg: blendRgb(from.diff.deleteBg, to.diff.deleteBg, t),
      addFg: blendRgb(from.diff.addFg, to.diff.addFg, t),
      deleteFg: blendRgb(from.diff.deleteFg, to.diff.deleteFg, t),
      hunkHeader: blendRgb(from.diff.hunkHeader, to.diff.hunkHeader, t),
      lineNumber: blendRgb(from.diff.lineNumber, to.diff.lineNumber, t),
      border: blendRgb(from.diff.border, to.diff.border, t),
    }),
    logs: Object.freeze({
      trace: blendRgb(from.logs.trace, to.logs.trace, t),
      debug: blendRgb(from.logs.debug, to.logs.debug, t),
      info: blendRgb(from.logs.info, to.logs.info, t),
      warn: blendRgb(from.logs.warn, to.logs.warn, t),
      error: blendRgb(from.logs.error, to.logs.error, t),
    }),
    toast: Object.freeze({
      info: blendRgb(from.toast.info, to.toast.info, t),
      success: blendRgb(from.toast.success, to.toast.success, t),
      warning: blendRgb(from.toast.warning, to.toast.warning, t),
      error: blendRgb(from.toast.error, to.toast.error, t),
    }),
    chart: Object.freeze({
      primary: blendRgb(from.chart.primary, to.chart.primary, t),
      accent: blendRgb(from.chart.accent, to.chart.accent, t),
      muted: blendRgb(from.chart.muted, to.chart.muted, t),
      success: blendRgb(from.chart.success, to.chart.success, t),
      warning: blendRgb(from.chart.warning, to.chart.warning, t),
      danger: blendRgb(from.chart.danger, to.chart.danger, t),
    }),
  });
}

export function compileTheme(themeDefinition: ThemeDefinition): Theme {
  const validated = validateTheme(themeDefinition);
  const cached = compiledThemeCache.get(validated);
  if (cached) return cached;

  const compiled = Object.freeze({
    definition: validated,
    colors: buildColorIndex(validated),
    spacing: buildSpacing(validated.spacing),
    focusIndicator: Object.freeze({ ...validated.focusIndicator }) as FocusIndicatorTokens,
  });
  compiledThemeCache.set(validated, compiled);
  return compiled;
}

export function blendTheme(from: Theme, to: Theme, t: number): Theme {
  const clampedT = Math.max(0, Math.min(1, t));
  if (clampedT <= 0) return from;
  if (clampedT >= 1) return to;

  const blended = validateTheme(
    Object.freeze({
      name: to.definition.name,
      colors: blendColorTokens(from.definition.colors, to.definition.colors, clampedT),
      spacing: Object.freeze({ ...to.definition.spacing }),
      focusIndicator: Object.freeze({ ...to.definition.focusIndicator }),
      widget: blendWidgetTokens(from.definition.widget, to.definition.widget, clampedT),
    }),
  );
  return Object.freeze({
    definition: blended,
    colors: buildColorIndex(blended),
    spacing: buildSpacing(blended.spacing),
    focusIndicator: Object.freeze({ ...blended.focusIndicator }) as FocusIndicatorTokens,
  });
}

export function resolveColor(theme: Theme, color: string | number): number {
  if (typeof color !== "string") return color;
  return theme.colors[color] ?? theme.colors.fg ?? theme.definition.colors.fg.primary;
}

export function resolveSpacing(theme: Theme, space: number): number {
  if (!Number.isFinite(space)) return 0;
  if (Number.isInteger(space) && space >= 0 && space < theme.spacing.length) {
    return theme.spacing[space] ?? 0;
  }
  return space;
}
