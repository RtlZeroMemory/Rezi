import type { BadgeVariant, TextStyle, ThemeDefinition } from "@rezi-ui/core";
import { darkTheme, lightTheme, nordTheme } from "@rezi-ui/core";
import type { ThemeName } from "./types.js";

type ThemeSpec = Readonly<{
  label: string;
  badge: BadgeVariant;
  theme: ThemeDefinition;
}>;

export const PRODUCT_NAME = "__APP_NAME__";
export const TEMPLATE_LABEL = "__TEMPLATE_LABEL__";
export const PRODUCT_TAGLINE = "Deterministic incident dashboard starter";
export const DEFAULT_THEME_NAME: ThemeName = "nord";

const THEME_ORDER: readonly ThemeName[] = Object.freeze(["nord", "dark", "light"]);

const THEME_BY_NAME: Record<ThemeName, ThemeSpec> = {
  nord: { label: "Nord", badge: "info", theme: nordTheme },
  dark: { label: "Dark", badge: "default", theme: darkTheme },
  light: { label: "Light", badge: "success", theme: lightTheme },
};

export function themeSpec(themeName: ThemeName): ThemeSpec {
  return THEME_BY_NAME[themeName];
}

export function cycleThemeName(current: ThemeName): ThemeName {
  const index = THEME_ORDER.indexOf(current);
  const next = index < 0 ? 0 : (index + 1) % THEME_ORDER.length;
  return THEME_ORDER[next] ?? DEFAULT_THEME_NAME;
}

export type DashboardStyles = Readonly<{
  rootStyle: TextStyle;
  panelStyle: TextStyle;
  stripStyle: TextStyle;
  mutedStyle: TextStyle;
  accentStyle: TextStyle;
}>;

export function stylesForTheme(themeName: ThemeName): DashboardStyles {
  const colors = themeSpec(themeName).theme.colors;
  return Object.freeze({
    rootStyle: { bg: colors.bg.base, fg: colors.fg.primary },
    panelStyle: { bg: colors.bg.elevated, fg: colors.fg.primary },
    stripStyle: { bg: colors.bg.subtle, fg: colors.fg.primary },
    mutedStyle: { fg: colors.fg.secondary, dim: true },
    accentStyle: { fg: colors.accent.primary, bold: true },
  });
}
