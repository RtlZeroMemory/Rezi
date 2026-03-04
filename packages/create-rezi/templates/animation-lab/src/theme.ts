import type { BadgeVariant, TextStyle, ThemeDefinition } from "@rezi-ui/core";
import {
  darkTheme,
  dimmedTheme,
  draculaTheme,
  highContrastTheme,
  lightTheme,
  nordTheme,
} from "@rezi-ui/core";
import type { ThemeName } from "./types.js";

type ThemeSpec = Readonly<{
  label: string;
  badge: BadgeVariant;
  theme: ThemeDefinition;
}>;

export const APP_NAME = "__APP_NAME__";
export const TEMPLATE_LABEL = "__TEMPLATE_LABEL__";
export const PRODUCT_TAGLINE = "Declarative animation starter with responsive reactor visuals";
export const DEFAULT_THEME_NAME: ThemeName = "nord";

const THEME_ORDER: readonly ThemeName[] = Object.freeze([
  "nord",
  "dracula",
  "dimmed",
  "dark",
  "light",
  "high-contrast",
]);

const THEME_BY_NAME: Record<ThemeName, ThemeSpec> = {
  nord: { label: "Nord", badge: "info", theme: nordTheme },
  dracula: { label: "Dracula", badge: "warning", theme: draculaTheme },
  dimmed: { label: "Dimmed", badge: "default", theme: dimmedTheme },
  dark: { label: "Dark", badge: "default", theme: darkTheme },
  light: { label: "Light", badge: "success", theme: lightTheme },
  "high-contrast": { label: "High Contrast", badge: "error", theme: highContrastTheme },
};

export function themeSpec(themeName: ThemeName): ThemeSpec {
  return THEME_BY_NAME[themeName];
}

export function cycleThemeName(themeName: ThemeName): ThemeName {
  const index = THEME_ORDER.indexOf(themeName);
  const next = index < 0 ? 0 : (index + 1) % THEME_ORDER.length;
  return THEME_ORDER[next] ?? DEFAULT_THEME_NAME;
}

export type AnimationLabStyles = Readonly<{
  rootStyle: TextStyle;
  panelStyle: TextStyle;
  mutedStyle: TextStyle;
  accentStyle: TextStyle;
}>;

export function stylesForTheme(themeName: ThemeName): AnimationLabStyles {
  const colors = themeSpec(themeName).theme.colors;
  return Object.freeze({
    rootStyle: { bg: colors.bg.base, fg: colors.fg.primary },
    panelStyle: { bg: colors.bg.elevated, fg: colors.fg.primary },
    mutedStyle: { fg: colors.fg.secondary, dim: true },
    accentStyle: { fg: colors.accent.primary, bold: true },
  });
}
