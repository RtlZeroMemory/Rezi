/**
 * packages/core/src/theme/interop.ts — Interop between theme systems.
 *
 * Why: The app runtime and renderer operate on the legacy `Theme` shape
 * (flat color map + spacing array). Public docs and presets use the new
 * semantic token `ThemeDefinition`. This module provides a deterministic
 * conversion to keep the public API ergonomic.
 */

import type { Rgb } from "../widgets/style.js";
import { defaultTheme } from "./defaultTheme.js";
import type { Theme } from "./theme.js";
import type { ThemeDefinition } from "./tokens.js";

type BgOverride = {
  base?: unknown;
  elevated?: unknown;
  overlay?: unknown;
  subtle?: unknown;
};

type FgOverride = {
  primary?: unknown;
  secondary?: unknown;
  muted?: unknown;
  inverse?: unknown;
};

type AccentOverride = {
  primary?: unknown;
  secondary?: unknown;
  tertiary?: unknown;
};

type FocusOverride = {
  ring?: unknown;
  bg?: unknown;
};

type SelectedOverride = {
  bg?: unknown;
  fg?: unknown;
};

type DisabledOverride = {
  fg?: unknown;
  bg?: unknown;
};

type BorderOverride = {
  subtle?: unknown;
  default?: unknown;
  strong?: unknown;
};

type DiagnosticOverride = {
  error?: unknown;
  warning?: unknown;
  info?: unknown;
  hint?: unknown;
};

type ThemeDefinitionSpacingOverride = {
  xs?: unknown;
  sm?: unknown;
  md?: unknown;
  lg?: unknown;
  xl?: unknown;
  "2xl"?: unknown;
};

type LegacyColorOverrideSource = {
  bg?: unknown;
  fg?: unknown;
  accent?: unknown;
  error?: unknown;
  success?: unknown;
  warning?: unknown;
  info?: unknown;
  focus?: unknown;
  selected?: unknown;
  disabled?: unknown;
  border?: unknown;
  diagnostic?: unknown;
  [key: string]: unknown;
};

function isObject(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null;
}

function isRgb(v: unknown): v is Rgb {
  if (!isObject(v)) return false;
  const candidate = v as { r?: unknown; g?: unknown; b?: unknown };
  return (
    typeof candidate.r === "number" &&
    Number.isFinite(candidate.r) &&
    typeof candidate.g === "number" &&
    Number.isFinite(candidate.g) &&
    typeof candidate.b === "number" &&
    Number.isFinite(candidate.b)
  );
}

function readSpacingOverride(raw: unknown): Theme["spacing"] | undefined {
  if (!Array.isArray(raw)) return undefined;
  const spacing: number[] = [];
  for (const item of raw) {
    if (typeof item !== "number" || !Number.isFinite(item)) return undefined;
    spacing.push(item);
  }
  return Object.freeze(spacing);
}

function isSpacingToken(value: unknown): value is number {
  return (
    typeof value === "number" && Number.isFinite(value) && Number.isInteger(value) && value >= 0
  );
}

function readThemeDefinitionSpacing(raw: unknown): Theme["spacing"] | undefined {
  if (!isObject(raw)) return undefined;
  const spacing = raw as ThemeDefinitionSpacingOverride;
  const xs = spacing.xs;
  const sm = spacing.sm;
  const md = spacing.md;
  const lg = spacing.lg;
  const xl = spacing.xl;
  const x2xl = spacing["2xl"];
  if (
    !isSpacingToken(xs) ||
    !isSpacingToken(sm) ||
    !isSpacingToken(md) ||
    !isSpacingToken(lg) ||
    !isSpacingToken(xl) ||
    !isSpacingToken(x2xl)
  ) {
    return undefined;
  }
  return Object.freeze([0, xs, sm, md, lg, xl, x2xl]);
}

function spacingEquals(a: Theme["spacing"], b: Theme["spacing"]): boolean {
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i++) {
    if (a[i] !== b[i]) return false;
  }
  return true;
}

function setColor(out: Record<string, Rgb>, key: string, value: unknown): Rgb | undefined {
  if (!isRgb(value)) return undefined;
  out[key] = value;
  return value;
}

function extractLegacyColorOverrides(raw: unknown): Partial<Theme["colors"]> {
  if (!isObject(raw)) return {};

  const source = raw as Readonly<LegacyColorOverrideSource>;
  const out: Record<string, Rgb> = {};

  const bg = isObject(source.bg) ? (source.bg as BgOverride) : null;
  if (bg) {
    const base = setColor(out, "bg.base", bg.base);
    setColor(out, "bg.elevated", bg.elevated);
    setColor(out, "bg.overlay", bg.overlay);
    setColor(out, "bg.subtle", bg.subtle);
    if (base) setColor(out, "bg", base);
  }

  const fg = isObject(source.fg) ? (source.fg as FgOverride) : null;
  if (fg) {
    const primary = setColor(out, "fg.primary", fg.primary);
    setColor(out, "fg.secondary", fg.secondary);
    const muted = setColor(out, "fg.muted", fg.muted);
    setColor(out, "fg.inverse", fg.inverse);
    if (primary) setColor(out, "fg", primary);
    if (muted) setColor(out, "muted", muted);
  }

  const accent = isObject(source.accent) ? (source.accent as AccentOverride) : null;
  if (accent) {
    const primary = setColor(out, "accent.primary", accent.primary);
    const secondary = setColor(out, "accent.secondary", accent.secondary);
    setColor(out, "accent.tertiary", accent.tertiary);
    if (primary) setColor(out, "primary", primary);
    if (secondary) setColor(out, "secondary", secondary);
  }

  const error = setColor(out, "error", source.error);
  if (error) setColor(out, "danger", error);
  setColor(out, "success", source.success);
  setColor(out, "warning", source.warning);
  setColor(out, "info", source.info);

  const focus = isObject(source.focus) ? (source.focus as FocusOverride) : null;
  if (focus) {
    setColor(out, "focus.ring", focus.ring);
    setColor(out, "focus.bg", focus.bg);
  }

  const selected = isObject(source.selected) ? (source.selected as SelectedOverride) : null;
  if (selected) {
    setColor(out, "selected.bg", selected.bg);
    setColor(out, "selected.fg", selected.fg);
  }

  const disabled = isObject(source.disabled) ? (source.disabled as DisabledOverride) : null;
  if (disabled) {
    setColor(out, "disabled.fg", disabled.fg);
    setColor(out, "disabled.bg", disabled.bg);
  }

  const border = isObject(source.border) ? (source.border as BorderOverride) : null;
  if (border) {
    setColor(out, "border.subtle", border.subtle);
    const borderDefault = setColor(out, "border.default", border.default);
    setColor(out, "border.strong", border.strong);
    if (borderDefault) setColor(out, "border", borderDefault);
  }

  const diagnostic = isObject(source.diagnostic) ? (source.diagnostic as DiagnosticOverride) : null;
  if (diagnostic) {
    setColor(out, "diagnostic.error", diagnostic.error);
    setColor(out, "diagnostic.warning", diagnostic.warning);
    setColor(out, "diagnostic.info", diagnostic.info);
    setColor(out, "diagnostic.hint", diagnostic.hint);
  }

  // Flat legacy colors and custom token keys override derived aliases.
  for (const [key, value] of Object.entries(source)) {
    if (isRgb(value)) out[key] = value;
  }

  return out;
}

function mergeLegacyTheme(
  parent: Theme,
  colorsOverride: Partial<Theme["colors"]>,
  spacingOverride: Theme["spacing"] | undefined,
): Theme {
  const colorEntries = Object.entries(colorsOverride) as Array<[string, Rgb]>;
  let colors = parent.colors;
  if (colorEntries.length > 0) {
    let colorChanged = false;
    for (const [key, value] of colorEntries) {
      if (parent.colors[key] !== value) {
        colorChanged = true;
        break;
      }
    }
    if (colorChanged) {
      colors = Object.freeze({ ...parent.colors, ...colorsOverride }) as Theme["colors"];
    }
  }

  let spacing = parent.spacing;
  if (spacingOverride !== undefined && !spacingEquals(parent.spacing, spacingOverride)) {
    spacing = spacingOverride;
  }

  if (colors === parent.colors && spacing === parent.spacing) {
    return parent;
  }
  return Object.freeze({ colors, spacing });
}

export function isThemeDefinition(v: Theme | ThemeDefinition): v is ThemeDefinition {
  if (!isObject(v)) return false;
  const candidate = v as unknown as { name?: unknown; colors?: unknown };
  if (typeof candidate.name !== "string") return false;
  if (!isObject(candidate.colors)) return false;
  const colors = candidate.colors as { bg?: unknown; fg?: unknown; accent?: unknown };
  return isObject(colors.bg) && isObject(colors.fg) && isObject(colors.accent);
}

const legacyThemeDefinitionCache = new WeakMap<ThemeDefinition, Theme>();

export function coerceToLegacyTheme(theme: Theme | ThemeDefinition): Theme {
  if (!isThemeDefinition(theme)) return theme;
  const cached = legacyThemeDefinitionCache.get(theme);
  if (cached) return cached;

  const c = theme.colors;
  const spacing = readThemeDefinitionSpacing(theme.spacing) ?? defaultTheme.spacing;

  const colors: Theme["colors"] = Object.freeze({
    // Legacy keys used by resolveColor(theme, key)
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

    // Semantic token paths (so widgets can use dot paths like "fg.primary")
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
    error: c.error,
    "focus.ring": c.focus.ring,
    "focus.bg": c.focus.bg,
    "selected.bg": c.selected.bg,
    "selected.fg": c.selected.fg,
    "disabled.fg": c.disabled.fg,
    "disabled.bg": c.disabled.bg,
    "border.subtle": c.border.subtle,
    "border.default": c.border.default,
    "border.strong": c.border.strong,
    "diagnostic.error": c.diagnostic?.error ?? c.error,
    "diagnostic.warning": c.diagnostic?.warning ?? c.warning,
    "diagnostic.info": c.diagnostic?.info ?? c.info,
    "diagnostic.hint": c.diagnostic?.hint ?? c.accent.tertiary,
  });

  const legacyTheme = Object.freeze({ colors, spacing });
  legacyThemeDefinitionCache.set(theme, legacyTheme);
  return legacyTheme;
}

export function mergeThemeOverride(parentTheme: Theme, override: unknown): Theme {
  if (!isObject(override)) return parentTheme;

  if (isThemeDefinition(override as Theme | ThemeDefinition)) {
    const definition = override as ThemeDefinition;
    const colors = coerceToLegacyTheme(definition).colors;
    const spacing = readThemeDefinitionSpacing(definition.spacing);
    return mergeLegacyTheme(parentTheme, colors, spacing);
  }

  const candidate = override as { colors?: unknown; spacing?: unknown };
  const colors = extractLegacyColorOverrides(candidate.colors ?? override);
  const spacing = readSpacingOverride(candidate.spacing);
  if (Object.keys(colors).length === 0 && spacing === undefined) return parentTheme;

  return mergeLegacyTheme(parentTheme, colors, spacing);
}
