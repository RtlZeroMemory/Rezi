/**
 * packages/core/src/theme/interop.ts — Scoped theme override helpers.
 */

import { extendTheme, type ThemeOverrides } from "./extend.js";
import { compileTheme, type Theme } from "./theme.js";
import type { ThemeDefinition } from "./tokens.js";

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function isThemeDefinition(value: unknown): value is ThemeDefinition {
  if (!isObject(value)) return false;
  if (typeof value["name"] !== "string") return false;
  if (
    !isObject(value["colors"]) ||
    !isObject(value["spacing"]) ||
    !isObject(value["focusIndicator"])
  ) {
    return false;
  }
  return isObject(value["widget"]);
}

export function mergeThemeOverride(parentTheme: Theme, override: unknown): Theme {
  if (!isObject(override)) return parentTheme;
  if (isThemeDefinition(override)) return compileTheme(override);
  return compileTheme(extendTheme(parentTheme.definition, override as ThemeOverrides));
}
