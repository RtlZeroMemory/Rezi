import type { Rgb24 } from "../widgets/style.js";
import type { Theme } from "./theme.js";
import type { ColorTokens } from "./tokens.js";

function extractColorTokens(theme: Theme): ColorTokens | null {
  const c = theme.colors;
  const bgBase = c["bg.base"] as Rgb24 | undefined;
  if (bgBase === undefined) return null;

  return {
    bg: {
      base: bgBase,
      elevated: (c["bg.elevated"] as Rgb24) ?? bgBase,
      overlay: (c["bg.overlay"] as Rgb24) ?? bgBase,
      subtle: (c["bg.subtle"] as Rgb24) ?? bgBase,
    },
    fg: {
      primary: (c["fg.primary"] as Rgb24) ?? c.fg,
      secondary: (c["fg.secondary"] as Rgb24) ?? c.muted,
      muted: (c["fg.muted"] as Rgb24) ?? c.muted,
      inverse: (c["fg.inverse"] as Rgb24) ?? c.bg,
    },
    accent: {
      primary: (c["accent.primary"] as Rgb24) ?? c.primary,
      secondary: (c["accent.secondary"] as Rgb24) ?? c.secondary,
      tertiary: (c["accent.tertiary"] as Rgb24) ?? c.info,
    },
    success: c.success,
    warning: c.warning,
    error: c.danger ?? (c as { error?: Rgb24 }).error ?? c.primary ?? c.fg ?? bgBase,
    info: c.info,
    focus: {
      ring: (c["focus.ring"] as Rgb24) ?? c.primary,
      bg: (c["focus.bg"] as Rgb24) ?? c.bg,
    },
    selected: {
      bg: (c["selected.bg"] as Rgb24) ?? c.primary,
      fg: (c["selected.fg"] as Rgb24) ?? c.fg,
    },
    disabled: {
      fg: (c["disabled.fg"] as Rgb24) ?? c.muted,
      bg: (c["disabled.bg"] as Rgb24) ?? c.bg,
    },
    diagnostic: {
      error:
        (c["diagnostic.error"] as Rgb24) ??
        c.danger ??
        (c as { error?: Rgb24 }).error ??
        c.primary ??
        c.fg ??
        bgBase,
      warning: (c["diagnostic.warning"] as Rgb24) ?? c.warning,
      info: (c["diagnostic.info"] as Rgb24) ?? c.info,
      hint: (c["diagnostic.hint"] as Rgb24) ?? c.success,
    },
    border: {
      subtle: (c["border.subtle"] as Rgb24) ?? c.border,
      default: (c["border.default"] as Rgb24) ?? c.border,
      strong: (c["border.strong"] as Rgb24) ?? c.border,
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
