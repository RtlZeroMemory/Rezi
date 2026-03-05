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
      base: rgb(18, 31, 46),
      elevated: rgb(24, 40, 60),
      overlay: rgb(31, 52, 77),
      subtle: rgb(21, 35, 53),
    },
    fg: {
      primary: rgb(238, 246, 255),
      secondary: rgb(180, 214, 244),
      muted: rgb(105, 138, 171),
      inverse: rgb(15, 25, 38),
    },
    border: {
      subtle: rgb(52, 83, 116),
      default: rgb(79, 120, 163),
      strong: rgb(112, 162, 217),
    },
    accent: {
      primary: rgb(78, 206, 255),
      secondary: rgb(119, 164, 255),
      tertiary: rgb(113, 233, 202),
    },
    info: rgb(92, 216, 255),
    success: rgb(110, 228, 189),
    warning: rgb(255, 191, 120),
    error: rgb(255, 110, 133),
    selected: {
      bg: rgb(52, 93, 137),
      fg: rgb(238, 246, 255),
    },
    disabled: {
      fg: rgb(84, 113, 144),
      bg: rgb(22, 36, 54),
    },
    diagnostic: {
      error: rgb(255, 110, 133),
      warning: rgb(255, 191, 120),
      info: rgb(92, 216, 255),
      hint: rgb(126, 176, 236),
    },
    focus: {
      ring: rgb(92, 216, 255),
      bg: rgb(45, 81, 118),
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
      base: rgb(12, 16, 27),
      elevated: rgb(17, 24, 40),
      overlay: rgb(23, 33, 53),
      subtle: rgb(15, 21, 35),
    },
    fg: {
      primary: rgb(236, 243, 255),
      secondary: rgb(170, 194, 228),
      muted: rgb(99, 122, 159),
      inverse: rgb(12, 16, 27),
    },
    accent: {
      primary: rgb(96, 215, 255),
      secondary: rgb(137, 156, 255),
      tertiary: rgb(108, 238, 216),
    },
    info: rgb(110, 226, 255),
    success: rgb(125, 232, 204),
    warning: rgb(255, 188, 116),
    error: rgb(255, 103, 132),
    selected: {
      bg: rgb(37, 70, 111),
      fg: rgb(236, 243, 255),
    },
    disabled: {
      fg: rgb(82, 102, 137),
      bg: rgb(14, 20, 33),
    },
    diagnostic: {
      error: rgb(255, 103, 132),
      warning: rgb(255, 188, 116),
      info: rgb(110, 226, 255),
      hint: rgb(155, 170, 255),
    },
    focus: {
      ring: rgb(110, 226, 255),
      bg: rgb(29, 59, 93),
    },
    border: {
      subtle: rgb(35, 51, 79),
      default: rgb(54, 78, 119),
      strong: rgb(77, 110, 166),
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
      base: rgb(22, 8, 14),
      elevated: rgb(31, 12, 21),
      overlay: rgb(42, 18, 30),
      subtle: rgb(26, 10, 18),
    },
    fg: {
      primary: rgb(255, 238, 243),
      secondary: rgb(244, 189, 201),
      muted: rgb(176, 121, 138),
      inverse: rgb(22, 8, 14),
    },
    accent: {
      primary: rgb(255, 102, 128),
      secondary: rgb(255, 146, 112),
      tertiary: rgb(255, 190, 130),
    },
    success: rgb(255, 170, 139),
    warning: rgb(255, 186, 118),
    error: rgb(255, 86, 112),
    info: rgb(255, 137, 153),
    selected: {
      bg: rgb(86, 32, 49),
      fg: rgb(255, 238, 243),
    },
    disabled: {
      fg: rgb(146, 93, 111),
      bg: rgb(30, 11, 19),
    },
    diagnostic: {
      error: rgb(255, 86, 112),
      warning: rgb(255, 186, 118),
      info: rgb(255, 137, 153),
      hint: rgb(255, 196, 130),
    },
    focus: {
      ring: rgb(255, 102, 128),
      bg: rgb(78, 29, 46),
    },
    border: {
      subtle: rgb(91, 42, 59),
      default: rgb(134, 59, 83),
      strong: rgb(182, 82, 112),
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
  const panelBase = blend(colors.bg.elevated, colors.bg.base, 0.14);
  const panelInset = blend(colors.bg.subtle, panelBase, 0.3);
  const panelElevated = blend(colors.bg.overlay, panelBase, 0.22);
  const selectedBg = blend(
    colors.selected.bg,
    colors.accent.primary,
    mode === "alert" ? 0.22 : 0.16,
  );
  const hoverBg = blend(panelBase, colors.accent.primary, mode === "alert" ? 0.14 : 0.1);
  const accentBrand = packRgb(colors.accent.primary);
  const accentInfo = blend(colors.accent.primary, colors.accent.secondary, 0.34);
  const accentSuccess = blend(colors.accent.primary, colors.accent.tertiary, 0.2);
  const accentWarn = blend(colors.accent.primary, colors.warning, mode === "alert" ? 0.34 : 0.42);
  const accentDanger = packRgb(colors.error);
  const progressFill = mode === "alert" ? accentDanger : accentBrand;
  const tableHeader = blend(panelInset, panelBase, 0.48);
  const rowAltBg = blend(panelBase, panelInset, 0.42);
  const rowHoverBg = blend(rowAltBg, selectedBg, 0.28);
  return Object.freeze({
    bg: Object.freeze({
      app: packRgb(panelBase),
      panel: Object.freeze({
        base: packRgb(panelBase),
        inset: packRgb(panelInset),
        elevated: packRgb(panelElevated),
      }),
      modal: packRgb(panelElevated),
    }),
    border: Object.freeze({
      default: blend(colors.border.default, colors.accent.primary, mode === "alert" ? 0.14 : 0.08),
      muted: blend(colors.border.subtle, colors.bg.base, 0.22),
      focus: mode === "alert" ? packRgb(colors.error) : packRgb(colors.focus.ring),
      danger: packRgb(colors.error),
    }),
    text: Object.freeze({
      primary: packRgb(colors.fg.primary),
      muted: packRgb(colors.fg.secondary),
      dim: packRgb(colors.fg.muted),
    }),
    accent: Object.freeze({
      info: accentInfo,
      success: accentSuccess,
      warn: accentWarn,
      danger: accentDanger,
      brand: accentBrand,
    }),
    state: Object.freeze({
      selectedBg: packRgb(selectedBg),
      selectedText: packRgb(colors.selected.fg),
      hoverBg: packRgb(hoverBg),
      focusRing: mode === "alert" ? packRgb(colors.error) : packRgb(colors.focus.ring),
    }),
    progress: Object.freeze({
      track: blend(
        colors.bg.subtle,
        colors.border.subtle,
        mode === "day" ? 0.58 : mode === "alert" ? 0.62 : 0.66,
      ),
      fill: progressFill,
    }),
    table: Object.freeze({
      headerBg: packRgb(tableHeader),
      rowAltBg: packRgb(rowAltBg),
      rowHoverBg: packRgb(rowHoverBg),
      rowSelectedBg: packRgb(selectedBg),
    }),
    log: Object.freeze({
      info: accentInfo,
      warn: accentWarn,
      error: accentDanger,
    }),
  });
}

export function stylesForTheme(themeName: ThemeName): StarshipStyles {
  const tokens = themeTokens(themeName);
  return Object.freeze({
    rootStyle: { bg: tokens.bg.app, fg: tokens.text.primary },
    panelStyle: { bg: tokens.bg.panel.base, fg: tokens.text.primary },
    panelMutedStyle: { bg: tokens.bg.panel.inset, fg: tokens.text.primary },
    stripStyle: { bg: tokens.bg.panel.base, fg: tokens.text.primary },
    mutedStyle: { fg: tokens.text.muted, dim: true },
    accentStyle: { fg: tokens.accent.brand, bold: true },
    codeStyle: { fg: tokens.accent.info, bold: true },
    statusStyle: { fg: tokens.text.primary, bg: tokens.bg.panel.base },
    focusStyle: { fg: tokens.text.primary, bg: tokens.state.selectedBg, bold: true },
    dangerStyle: { fg: tokens.accent.danger, bg: tokens.bg.panel.base, bold: true },
  });
}
