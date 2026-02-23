import type { Rgb } from "../widgets/style.js";
import type { Theme } from "./theme.js";
import type { ColorTokens } from "./tokens.js";

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
    error: c.danger ?? (c as { error?: Rgb }).error ?? c.primary ?? c.fg ?? bgBase,
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
      error:
        (c["diagnostic.error"] as Rgb) ??
        c.danger ??
        (c as { error?: Rgb }).error ??
        c.primary ??
        c.fg ??
        bgBase,
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
 */
export function getColorTokens(theme: Theme): ColorTokens | null {
  const cached = colorTokensCache.get(theme.colors);
  if (cached !== undefined) return cached;
  const tokens = extractColorTokens(theme);
  colorTokensCache.set(theme.colors, tokens);
  return tokens;
}
