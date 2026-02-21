import type { BadgeVariant, ThemeDefinition } from "@rezi-ui/core";
import { darkTheme, lightTheme, nordTheme } from "@rezi-ui/core";
import type { ThemeName } from "./types.js";

type ThemeSpec = Readonly<{
  label: string;
  badge: BadgeVariant;
  theme: ThemeDefinition;
}>;

export const PRODUCT_NAME = "__APP_NAME__";
export const TEMPLATE_LABEL = "__TEMPLATE_LABEL__";
export const PRODUCT_TAGLINE = "Small utility template with practical defaults";

const ORDER: readonly ThemeName[] = Object.freeze(["nord", "dark", "light"]);

const THEMES: Record<ThemeName, ThemeSpec> = {
  nord: { label: "Nord", badge: "info", theme: nordTheme },
  dark: { label: "Dark", badge: "default", theme: darkTheme },
  light: { label: "Light", badge: "success", theme: lightTheme },
};

export function themeSpec(themeName: ThemeName): ThemeSpec {
  return THEMES[themeName];
}

export function cycleTheme(themeName: ThemeName): ThemeName {
  const index = ORDER.indexOf(themeName);
  const next = index < 0 ? 0 : (index + 1) % ORDER.length;
  return ORDER[next] ?? "nord";
}
