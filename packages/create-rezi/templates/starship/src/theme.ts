import {
  type BadgeVariant,
  type TextStyle,
  type ThemeDefinition,
  darkTheme,
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

const THEME_ORDER: readonly ThemeName[] = Object.freeze(["day", "night", "alert"]);

const DAY_SHIFT_THEME = extendTheme(nordTheme, {
  name: "starship-day-shift",
  colors: {
    accent: {
      primary: { r: 126, g: 214, b: 255 },
      secondary: { r: 112, g: 189, b: 245 },
      tertiary: { r: 175, g: 226, b: 163 },
    },
    info: { r: 118, g: 206, b: 255 },
    success: { r: 159, g: 222, b: 146 },
    warning: { r: 244, g: 210, b: 121 },
    focus: {
      ring: { r: 118, g: 206, b: 255 },
      bg: { r: 63, g: 73, b: 92 },
    },
  },
});

const NIGHT_SHIFT_THEME = extendTheme(darkTheme, {
  name: "starship-night-shift",
  colors: {
    bg: {
      base: { r: 8, g: 14, b: 26 },
      elevated: { r: 12, g: 20, b: 34 },
      overlay: { r: 19, g: 30, b: 48 },
      subtle: { r: 10, g: 18, b: 30 },
    },
    accent: {
      primary: { r: 103, g: 168, b: 245 },
      secondary: { r: 114, g: 204, b: 250 },
      tertiary: { r: 122, g: 218, b: 201 },
    },
    info: { r: 114, g: 204, b: 250 },
    border: {
      subtle: { r: 36, g: 52, b: 72 },
      default: { r: 60, g: 84, b: 112 },
      strong: { r: 88, g: 112, b: 146 },
    },
  },
});

const RED_ALERT_THEME = extendTheme(draculaTheme, {
  name: "starship-red-alert",
  colors: {
    accent: {
      primary: { r: 255, g: 102, b: 118 },
      secondary: { r: 255, g: 166, b: 94 },
      tertiary: { r: 255, g: 220, b: 125 },
    },
    error: { r: 255, g: 97, b: 113 },
    warning: { r: 255, g: 162, b: 98 },
    info: { r: 255, g: 125, b: 136 },
    focus: {
      ring: { r: 255, g: 114, b: 114 },
      bg: { r: 78, g: 33, b: 44 },
    },
    border: {
      subtle: { r: 98, g: 42, b: 56 },
      default: { r: 144, g: 62, b: 81 },
      strong: { r: 194, g: 83, b: 108 },
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
  stripStyle: TextStyle;
  mutedStyle: TextStyle;
  accentStyle: TextStyle;
  codeStyle: TextStyle;
  statusStyle: TextStyle;
}>;

export function stylesForTheme(themeName: ThemeName): StarshipStyles {
  const colors = themeSpec(themeName).theme.colors;
  return Object.freeze({
    rootStyle: { bg: colors.bg.base, fg: colors.fg.primary },
    panelStyle: { bg: colors.bg.elevated, fg: colors.fg.primary },
    stripStyle: { bg: colors.bg.subtle, fg: colors.fg.primary },
    mutedStyle: { fg: colors.fg.secondary, dim: true },
    accentStyle: { fg: colors.accent.primary, bold: true },
    codeStyle: { fg: colors.accent.secondary, bg: colors.bg.subtle },
    statusStyle: { fg: colors.fg.primary, bg: colors.bg.overlay },
  });
}
