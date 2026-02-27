import {
  type BadgeVariant,
  type Rgb24,
  type TextStyle,
  type ThemeDefinition,
  draculaTheme,
  extendTheme,
  nordTheme,
  rgb,
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
    focusRingColor: rgb(118, 208, 255),
  },
  colors: {
    bg: {
      base: rgb(29, 42, 58),
      elevated: rgb(40, 57, 76),
      overlay: rgb(52, 72, 94),
      subtle: rgb(34, 49, 67),
    },
    fg: {
      primary: rgb(236, 243, 255),
      secondary: rgb(190, 217, 242),
      muted: rgb(108, 138, 168),
      inverse: rgb(20, 30, 42),
    },
    border: {
      subtle: rgb(74, 98, 126),
      default: rgb(104, 136, 168),
      strong: rgb(137, 171, 206),
    },
    accent: {
      primary: rgb(106, 195, 255),
      secondary: rgb(129, 217, 255),
      tertiary: rgb(180, 231, 164),
    },
    info: rgb(118, 208, 255),
    success: rgb(166, 228, 149),
    warning: rgb(255, 211, 131),
    error: rgb(239, 118, 132),
    selected: {
      bg: rgb(68, 105, 139),
      fg: rgb(236, 243, 255),
    },
    disabled: {
      fg: rgb(95, 121, 149),
      bg: rgb(39, 55, 72),
    },
    diagnostic: {
      error: rgb(239, 118, 132),
      warning: rgb(255, 211, 131),
      info: rgb(118, 208, 255),
      hint: rgb(149, 187, 228),
    },
    focus: {
      ring: rgb(118, 208, 255),
      bg: rgb(63, 96, 126),
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
    focusRingColor: rgb(176, 133, 255),
  },
  colors: {
    bg: {
      base: rgb(19, 22, 33),
      elevated: rgb(28, 31, 46),
      overlay: rgb(37, 41, 60),
      subtle: rgb(24, 27, 40),
    },
    fg: {
      primary: rgb(244, 246, 252),
      secondary: rgb(202, 185, 252),
      muted: rgb(131, 146, 186),
      inverse: rgb(19, 22, 33),
    },
    accent: {
      primary: rgb(176, 133, 255),
      secondary: rgb(129, 235, 255),
      tertiary: rgb(119, 255, 196),
    },
    info: rgb(129, 235, 255),
    success: rgb(110, 249, 174),
    warning: rgb(255, 207, 124),
    error: rgb(255, 118, 132),
    selected: {
      bg: rgb(68, 76, 112),
      fg: rgb(244, 246, 252),
    },
    disabled: {
      fg: rgb(99, 111, 146),
      bg: rgb(28, 31, 46),
    },
    diagnostic: {
      error: rgb(255, 118, 132),
      warning: rgb(255, 207, 124),
      info: rgb(129, 235, 255),
      hint: rgb(206, 158, 255),
    },
    focus: {
      ring: rgb(176, 133, 255),
      bg: rgb(64, 57, 96),
    },
    border: {
      subtle: rgb(43, 49, 71),
      default: rgb(72, 81, 116),
      strong: rgb(104, 115, 156),
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
    focusRingColor: rgb(255, 112, 112),
  },
  colors: {
    bg: {
      base: rgb(24, 12, 19),
      elevated: rgb(34, 15, 24),
      overlay: rgb(46, 21, 32),
      subtle: rgb(29, 13, 22),
    },
    fg: {
      primary: rgb(255, 238, 242),
      secondary: rgb(244, 190, 205),
      muted: rgb(170, 122, 139),
      inverse: rgb(24, 12, 19),
    },
    accent: {
      primary: rgb(255, 114, 144),
      secondary: rgb(255, 182, 120),
      tertiary: rgb(255, 220, 146),
    },
    success: rgb(134, 247, 176),
    warning: rgb(255, 181, 112),
    error: rgb(255, 93, 117),
    info: rgb(255, 141, 153),
    selected: {
      bg: rgb(82, 34, 52),
      fg: rgb(255, 238, 242),
    },
    disabled: {
      fg: rgb(142, 96, 112),
      bg: rgb(34, 15, 24),
    },
    diagnostic: {
      error: rgb(255, 93, 117),
      warning: rgb(255, 181, 112),
      info: rgb(255, 141, 153),
      hint: rgb(255, 203, 133),
    },
    focus: {
      ring: rgb(255, 112, 112),
      bg: rgb(76, 35, 50),
    },
    border: {
      subtle: rgb(86, 45, 61),
      default: rgb(124, 65, 86),
      strong: rgb(172, 86, 112),
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

type ColorInput = Rgb24;

function packRgb(value: Rgb24): Rgb24 {
  return (Math.round(value) >>> 0) & 0x00ff_ffff;
}

function rgbChannel(value: Rgb24, shift: 0 | 8 | 16): number {
  return (value >>> shift) & 0xff;
}

function unpackRgb(value: ColorInput): Readonly<{ r: number; g: number; b: number }> {
  return Object.freeze({
    r: rgbChannel(value, 16),
    g: rgbChannel(value, 8),
    b: rgbChannel(value, 0),
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
