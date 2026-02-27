import {
  type BadgeVariant,
  type Rgb,
  type Rgb24,
  type TextStyle,
  type ThemeDefinition,
  draculaTheme,
  extendTheme,
  nordTheme,
} from "@rezi-ui/core";
import type { AlertLevel, ThemeName } from "./types.js";

type ThemeSpec = Readonly<{
  label: string;
  badge: BadgeVariant;
  theme: ThemeDefinition;
}>;

export const PRODUCT_NAME = "__APP_NAME__";
export const TEMPLATE_LABEL = "__TEMPLATE_LABEL__";
export const PRODUCT_TAGLINE = "Multi-deck starship command console";
export const SPACE = Object.freeze({
  xs: 1,
  sm: 2,
  md: 4,
  lg: 6,
  xl: 8,
});

const THEME_ORDER: readonly ThemeName[] = Object.freeze(["night", "day", "alert"]);

const DAY_SHIFT_THEME = extendTheme(nordTheme, {
  name: "starship-day-shift",
  spacing: {
    xs: 1,
    sm: 2,
    md: 3,
    lg: 5,
    xl: 7,
    "2xl": 10,
  },
  focusIndicator: {
    bold: true,
    underline: false,
    focusRingColor: { r: 118, g: 208, b: 255 },
  },
  colors: {
    bg: {
      base: { r: 29, g: 42, b: 58 },
      elevated: { r: 40, g: 57, b: 76 },
      overlay: { r: 52, g: 72, b: 94 },
      subtle: { r: 34, g: 49, b: 67 },
    },
    fg: {
      primary: { r: 236, g: 243, b: 255 },
      secondary: { r: 190, g: 217, b: 242 },
      muted: { r: 108, g: 138, b: 168 },
      inverse: { r: 20, g: 30, b: 42 },
    },
    border: {
      subtle: { r: 74, g: 98, b: 126 },
      default: { r: 104, g: 136, b: 168 },
      strong: { r: 137, g: 171, b: 206 },
    },
    accent: {
      primary: { r: 106, g: 195, b: 255 },
      secondary: { r: 129, g: 217, b: 255 },
      tertiary: { r: 180, g: 231, b: 164 },
    },
    info: { r: 118, g: 208, b: 255 },
    success: { r: 166, g: 228, b: 149 },
    warning: { r: 255, g: 211, b: 131 },
    error: { r: 239, g: 118, b: 132 },
    selected: {
      bg: { r: 68, g: 105, b: 139 },
      fg: { r: 236, g: 243, b: 255 },
    },
    disabled: {
      fg: { r: 95, g: 121, b: 149 },
      bg: { r: 39, g: 55, b: 72 },
    },
    diagnostic: {
      error: { r: 239, g: 118, b: 132 },
      warning: { r: 255, g: 211, b: 131 },
      info: { r: 118, g: 208, b: 255 },
      hint: { r: 149, g: 187, b: 228 },
    },
    focus: {
      ring: { r: 118, g: 208, b: 255 },
      bg: { r: 63, g: 96, b: 126 },
    },
  },
});

const NIGHT_SHIFT_THEME = extendTheme(draculaTheme, {
  name: "starship-command-night",
  spacing: {
    xs: 1,
    sm: 2,
    md: 3,
    lg: 5,
    xl: 7,
    "2xl": 10,
  },
  focusIndicator: {
    bold: true,
    underline: false,
    focusRingColor: { r: 176, g: 133, b: 255 },
  },
  colors: {
    bg: {
      base: { r: 19, g: 22, b: 33 },
      elevated: { r: 28, g: 31, b: 46 },
      overlay: { r: 37, g: 41, b: 60 },
      subtle: { r: 24, g: 27, b: 40 },
    },
    fg: {
      primary: { r: 244, g: 246, b: 252 },
      secondary: { r: 202, g: 185, b: 252 },
      muted: { r: 131, g: 146, b: 186 },
      inverse: { r: 19, g: 22, b: 33 },
    },
    accent: {
      primary: { r: 176, g: 133, b: 255 },
      secondary: { r: 129, g: 235, b: 255 },
      tertiary: { r: 119, g: 255, b: 196 },
    },
    info: { r: 129, g: 235, b: 255 },
    success: { r: 110, g: 249, b: 174 },
    warning: { r: 255, g: 207, b: 124 },
    error: { r: 255, g: 118, b: 132 },
    selected: {
      bg: { r: 68, g: 76, b: 112 },
      fg: { r: 244, g: 246, b: 252 },
    },
    disabled: {
      fg: { r: 99, g: 111, b: 146 },
      bg: { r: 28, g: 31, b: 46 },
    },
    diagnostic: {
      error: { r: 255, g: 118, b: 132 },
      warning: { r: 255, g: 207, b: 124 },
      info: { r: 129, g: 235, b: 255 },
      hint: { r: 206, g: 158, b: 255 },
    },
    focus: {
      ring: { r: 176, g: 133, b: 255 },
      bg: { r: 64, g: 57, b: 96 },
    },
    border: {
      subtle: { r: 43, g: 49, b: 71 },
      default: { r: 72, g: 81, b: 116 },
      strong: { r: 104, g: 115, b: 156 },
    },
  },
});

const RED_ALERT_THEME = extendTheme(draculaTheme, {
  name: "starship-red-alert",
  spacing: {
    xs: 1,
    sm: 2,
    md: 3,
    lg: 5,
    xl: 7,
    "2xl": 10,
  },
  focusIndicator: {
    bold: true,
    underline: false,
    focusRingColor: { r: 255, g: 112, b: 112 },
  },
  colors: {
    bg: {
      base: { r: 24, g: 12, b: 19 },
      elevated: { r: 34, g: 15, b: 24 },
      overlay: { r: 46, g: 21, b: 32 },
      subtle: { r: 29, g: 13, b: 22 },
    },
    fg: {
      primary: { r: 255, g: 238, b: 242 },
      secondary: { r: 244, g: 190, b: 205 },
      muted: { r: 170, g: 122, b: 139 },
      inverse: { r: 24, g: 12, b: 19 },
    },
    accent: {
      primary: { r: 255, g: 114, b: 144 },
      secondary: { r: 255, g: 182, b: 120 },
      tertiary: { r: 255, g: 220, b: 146 },
    },
    success: { r: 134, g: 247, b: 176 },
    warning: { r: 255, g: 181, b: 112 },
    error: { r: 255, g: 93, b: 117 },
    info: { r: 255, g: 141, b: 153 },
    selected: {
      bg: { r: 82, g: 34, b: 52 },
      fg: { r: 255, g: 238, b: 242 },
    },
    disabled: {
      fg: { r: 142, g: 96, b: 112 },
      bg: { r: 34, g: 15, b: 24 },
    },
    diagnostic: {
      error: { r: 255, g: 93, b: 117 },
      warning: { r: 255, g: 181, b: 112 },
      info: { r: 255, g: 141, b: 153 },
      hint: { r: 255, g: 203, b: 133 },
    },
    focus: {
      ring: { r: 255, g: 112, b: 112 },
      bg: { r: 76, g: 35, b: 50 },
    },
    border: {
      subtle: { r: 86, g: 45, b: 61 },
      default: { r: 124, g: 65, b: 86 },
      strong: { r: 172, g: 86, b: 112 },
    },
  },
});

const THEME_BY_NAME: Record<ThemeName, ThemeSpec> = {
  day: {
    label: "Day Shift",
    badge: "info",
    theme: DAY_SHIFT_THEME,
  },
  night: {
    label: "Night Shift",
    badge: "default",
    theme: NIGHT_SHIFT_THEME,
  },
  alert: {
    label: "Red Alert",
    badge: "error",
    theme: RED_ALERT_THEME,
  },
};

export function themeSpec(themeName: ThemeName): ThemeSpec {
  return THEME_BY_NAME[themeName];
}

function clampChannel(value: number): number {
  return Math.max(0, Math.min(255, Math.round(value)));
}

type ColorInput = Rgb | Rgb24;

function packRgb(value: Rgb): Rgb24 {
  return (
    ((clampChannel(value.r) & 0xff) << 16) |
    ((clampChannel(value.g) & 0xff) << 8) |
    (clampChannel(value.b) & 0xff)
  );
}

function rgbChannel(value: Rgb24, shift: 0 | 8 | 16): number {
  return (value >>> shift) & 0xff;
}

function unpackRgb(value: ColorInput): Readonly<{ r: number; g: number; b: number }> {
  if (typeof value === "number") {
    return Object.freeze({
      r: rgbChannel(value, 16),
      g: rgbChannel(value, 8),
      b: rgbChannel(value, 0),
    });
  }
  return Object.freeze({
    r: clampChannel(value.r),
    g: clampChannel(value.g),
    b: clampChannel(value.b),
  });
}

function blend(a: ColorInput, b: ColorInput, weight: number): Rgb24 {
  const safe = Math.max(0, Math.min(1, weight));
  const left = unpackRgb(a);
  const right = unpackRgb(b);
  return (
    ((clampChannel(left.r + (right.r - left.r) * safe) & 0xff) << 16) |
    ((clampChannel(left.g + (right.g - left.g) * safe) & 0xff) << 8) |
    (clampChannel(left.b + (right.b - left.b) * safe) & 0xff)
  );
}

export function toHex(color: Rgb24): string {
  const channel = (value: number) => clampChannel(value).toString(16).padStart(2, "0");
  return `#${channel(rgbChannel(color, 16))}${channel(rgbChannel(color, 8))}${channel(rgbChannel(color, 0))}`;
}

export function cycleThemeName(current: ThemeName): ThemeName {
  const index = THEME_ORDER.indexOf(current);
  const next = index < 0 ? 0 : (index + 1) % THEME_ORDER.length;
  return THEME_ORDER[next] ?? "day";
}

export function alertBadgeVariant(level: AlertLevel): BadgeVariant {
  if (level === "green") return "success";
  if (level === "yellow") return "warning";
  return "error";
}

export type StarshipStyles = Readonly<{
  rootStyle: TextStyle;
  panelStyle: TextStyle;
  panelMutedStyle: TextStyle;
  stripStyle: TextStyle;
  mutedStyle: TextStyle;
  accentStyle: TextStyle;
  codeStyle: TextStyle;
  statusStyle: TextStyle;
  focusStyle: TextStyle;
  dangerStyle: TextStyle;
}>;

export type StarshipThemeTokens = Readonly<{
  bg: Readonly<{
    app: Rgb24;
    panel: Readonly<{
      base: Rgb24;
      inset: Rgb24;
      elevated: Rgb24;
    }>;
    modal: Rgb24;
  }>;
  border: Readonly<{
    default: Rgb24;
    muted: Rgb24;
    focus: Rgb24;
    danger: Rgb24;
  }>;
  text: Readonly<{
    primary: Rgb24;
    muted: Rgb24;
    dim: Rgb24;
  }>;
  accent: Readonly<{
    info: Rgb24;
    success: Rgb24;
    warn: Rgb24;
    danger: Rgb24;
    brand: Rgb24;
  }>;
  state: Readonly<{
    selectedBg: Rgb24;
    selectedText: Rgb24;
    hoverBg: Rgb24;
    focusRing: Rgb24;
  }>;
  progress: Readonly<{
    track: Rgb24;
    fill: Rgb24;
  }>;
  table: Readonly<{
    headerBg: Rgb24;
    rowAltBg: Rgb24;
    rowHoverBg: Rgb24;
    rowSelectedBg: Rgb24;
  }>;
  log: Readonly<{
    info: Rgb24;
    warn: Rgb24;
    error: Rgb24;
  }>;
}>;

export function themeTokens(themeName: ThemeName): StarshipThemeTokens {
  const colors = themeSpec(themeName).theme.colors;
  const mode = themeName === "alert" ? "alert" : themeName === "day" ? "day" : "night";
  const panelAccent = mode === "alert" ? colors.accent.primary : colors.accent.secondary;
  const panelBaseSeed = blend(
    colors.bg.elevated,
    colors.bg.base,
    mode === "day" ? 0.22 : mode === "alert" ? 0.18 : 0.16,
  );
  const panelInsetSeed = blend(
    colors.bg.subtle,
    colors.bg.base,
    mode === "day" ? 0.26 : mode === "alert" ? 0.2 : 0.24,
  );
  const panelElevatedSeed = blend(
    colors.bg.overlay,
    mode === "alert" ? colors.error : colors.focus.bg,
    mode === "day" ? 0.18 : mode === "alert" ? 0.18 : 0.24,
  );
  const panelBase = blend(
    panelBaseSeed,
    panelAccent,
    mode === "day" ? 0.06 : mode === "alert" ? 0.08 : 0.07,
  );
  const panelInset = blend(
    panelInsetSeed,
    panelAccent,
    mode === "day" ? 0.05 : mode === "alert" ? 0.07 : 0.06,
  );
  const panelElevated = blend(
    panelElevatedSeed,
    mode === "alert" ? colors.error : colors.focus.bg,
    mode === "day" ? 0.08 : mode === "alert" ? 0.12 : 0.1,
  );
  const selectedBg = blend(
    colors.selected.bg,
    colors.accent.primary,
    mode === "alert" ? 0.26 : mode === "day" ? 0.24 : 0.3,
  );
  const hoverBg = blend(
    colors.bg.subtle,
    colors.accent.secondary,
    mode === "alert" ? 0.14 : mode === "day" ? 0.18 : 0.2,
  );
  const progressFill =
    mode === "alert"
      ? blend(colors.error, colors.accent.secondary, 0.22)
      : blend(colors.accent.primary, colors.accent.secondary, mode === "day" ? 0.18 : 0.1);
  return Object.freeze({
    bg: Object.freeze({
      app: packRgb(colors.bg.base),
      panel: Object.freeze({
        base: panelBase,
        inset: panelInset,
        elevated: panelElevated,
      }),
      modal: packRgb(colors.bg.overlay),
    }),
    border: Object.freeze({
      default: packRgb(colors.border.default),
      muted: packRgb(colors.border.subtle),
      focus: mode === "alert" ? packRgb(colors.error) : packRgb(colors.focus.ring),
      danger: packRgb(colors.error),
    }),
    text: Object.freeze({
      primary: packRgb(colors.fg.primary),
      muted: packRgb(colors.fg.secondary),
      dim: packRgb(colors.fg.muted),
    }),
    accent: Object.freeze({
      info: packRgb(colors.info),
      success: packRgb(colors.success),
      warn: packRgb(colors.warning),
      danger: packRgb(colors.error),
      brand: packRgb(colors.accent.primary),
    }),
    state: Object.freeze({
      selectedBg,
      selectedText: packRgb(colors.selected.fg),
      hoverBg,
      focusRing: mode === "alert" ? packRgb(colors.error) : packRgb(colors.focus.ring),
    }),
    progress: Object.freeze({
      track: blend(
        colors.bg.subtle,
        colors.border.default,
        mode === "day" ? 0.44 : mode === "alert" ? 0.46 : 0.52,
      ),
      fill: progressFill,
    }),
    table: Object.freeze({
      headerBg: blend(
        colors.bg.overlay,
        colors.accent.primary,
        mode === "day" ? 0.18 : mode === "alert" ? 0.1 : 0.14,
      ),
      rowAltBg: blend(colors.bg.subtle, colors.bg.elevated, mode === "day" ? 0.42 : 0.5),
      rowHoverBg: blend(hoverBg, selectedBg, 0.16),
      rowSelectedBg: selectedBg,
    }),
    log: Object.freeze({
      info: blend(colors.info, colors.accent.secondary, 0.22),
      warn: blend(colors.warning, colors.accent.secondary, mode === "alert" ? 0.14 : 0.1),
      error: blend(colors.error, colors.accent.primary, mode === "alert" ? 0.18 : 0.14),
    }),
  });
}

export function stylesForTheme(themeName: ThemeName): StarshipStyles {
  const tokens = themeTokens(themeName);
  return Object.freeze({
    rootStyle: { bg: tokens.bg.app, fg: tokens.text.primary },
    panelStyle: { bg: tokens.bg.panel.base, fg: tokens.text.primary },
    panelMutedStyle: { bg: tokens.bg.panel.inset, fg: tokens.text.primary },
    stripStyle: { bg: tokens.bg.panel.inset, fg: tokens.text.primary },
    mutedStyle: { fg: tokens.text.muted, dim: true },
    accentStyle: { fg: tokens.accent.brand, bold: true },
    codeStyle: { fg: tokens.accent.info, bg: tokens.bg.panel.elevated },
    statusStyle: { fg: tokens.text.primary, bg: tokens.bg.panel.inset },
    focusStyle: { fg: tokens.text.primary, bg: tokens.state.selectedBg, bold: true },
    dangerStyle: { fg: tokens.accent.danger, bg: tokens.bg.panel.inset, bold: true },
  });
}
