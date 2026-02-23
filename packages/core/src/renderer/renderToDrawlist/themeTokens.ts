import type { Theme } from "../../theme/theme.js";
import type { ColorTokens } from "../../theme/tokens.js";
import type { WidgetSize, WidgetTone, WidgetVariant } from "../../ui/designTokens.js";
import type { Rgb, TextStyle } from "../../widgets/style.js";

function extractColorTokens(theme: Theme): ColorTokens | null {
  const c = theme.colors;
  const bgBase = c["bg.base"] as Rgb | undefined;
  if (!bgBase) return null;

  return {
    bg: {
      base: bgBase,
      elevated: (c["bg.elevated"] as Rgb) ?? bgBase,
      overlay: (c["bg.overlay"] as Rgb) ?? bgBase,
      subtle: (c["bg.subtle"] as Rgb) ?? bgBase,
    },
    fg: {
      primary: (c["fg.primary"] as Rgb) ?? c.fg,
      secondary: (c["fg.secondary"] as Rgb) ?? c.muted,
      muted: (c["fg.muted"] as Rgb) ?? c.muted,
      inverse: (c["fg.inverse"] as Rgb) ?? c.bg,
    },
    accent: {
      primary: (c["accent.primary"] as Rgb) ?? c.primary,
      secondary: (c["accent.secondary"] as Rgb) ?? c.secondary,
      tertiary: (c["accent.tertiary"] as Rgb) ?? c.info,
    },
    success: c.success,
    warning: c.warning,
    error: c.danger ?? (c as { error?: Rgb }).error ?? { r: 220, g: 53, b: 69 },
    info: c.info,
    focus: {
      ring: (c["focus.ring"] as Rgb) ?? c.primary,
      bg: (c["focus.bg"] as Rgb) ?? c.bg,
    },
    selected: {
      bg: (c["selected.bg"] as Rgb) ?? c.primary,
      fg: (c["selected.fg"] as Rgb) ?? c.fg,
    },
    disabled: {
      fg: (c["disabled.fg"] as Rgb) ?? c.muted,
      bg: (c["disabled.bg"] as Rgb) ?? c.bg,
    },
    diagnostic: {
      error: (c["diagnostic.error"] as Rgb) ?? c.danger ?? { r: 220, g: 53, b: 69 },
      warning: (c["diagnostic.warning"] as Rgb) ?? c.warning,
      info: (c["diagnostic.info"] as Rgb) ?? c.info,
      hint: (c["diagnostic.hint"] as Rgb) ?? c.success,
    },
    border: {
      subtle: (c["border.subtle"] as Rgb) ?? c.border,
      default: (c["border.default"] as Rgb) ?? c.border,
      strong: (c["border.strong"] as Rgb) ?? c.border,
    },
  };
}

const colorTokensCache = new WeakMap<Theme["colors"], ColorTokens | null>();

/**
 * Extract structured ColorTokens from a legacy Theme.
 * Returns null if the theme lacks semantic token paths (pure legacy theme).
 *
 * Usage pattern in widget renderers:
 *   const colorTokens = getColorTokens(theme);
 *   if (colorTokens !== null) {
 *     // Design system path: use recipe functions
 *     const r = buttonRecipe(colorTokens, { variant, tone, size, state });
 *   } else {
 *     // Legacy path: use theme.colors.* directly
 *   }
 */
export function getColorTokens(theme: Theme): ColorTokens | null {
  const cached = colorTokensCache.get(theme.colors);
  if (cached !== undefined) return cached;
  const tokens = extractColorTokens(theme);
  colorTokensCache.set(theme.colors, tokens);
  return tokens;
}

export function readWidgetVariant(value: unknown): WidgetVariant | undefined {
  if (value === "solid" || value === "soft" || value === "outline" || value === "ghost") {
    return value;
  }
  return undefined;
}

export function readWidgetTone(value: unknown): WidgetTone | undefined {
  if (
    value === "default" ||
    value === "primary" ||
    value === "danger" ||
    value === "success" ||
    value === "warning"
  ) {
    return value;
  }
  return undefined;
}

export function readWidgetSize(value: unknown): WidgetSize | undefined {
  if (value === "sm" || value === "md" || value === "lg") {
    return value;
  }
  return undefined;
}

export function resolveWidgetFocusStyle(
  colorTokens: ColorTokens | null,
  focused: boolean,
  disabled: boolean,
): TextStyle | undefined {
  if (!focused || disabled) return undefined;
  if (colorTokens !== null) {
    return {
      underline: true,
      bold: true,
      fg: colorTokens.focus.ring,
    };
  }
  return { underline: true, bold: true };
}
