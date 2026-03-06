/**
 * packages/core/src/theme/interop.ts — Scoped theme override helpers.
 */

import { type ThemeOverrides, extendTheme } from "./extend.js";
import { type Theme, compileTheme } from "./theme.js";
import type { ThemeDefinition } from "./tokens.js";

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

type ThemeDefinitionCandidate = Readonly<{
  name?: unknown;
  colors?: unknown;
  spacing?: unknown;
  focusIndicator?: unknown;
  widget?: unknown;
}>;

function isThemeDefinition(value: unknown): value is ThemeDefinition {
  if (!isObject(value)) return false;
  const candidate = value as ThemeDefinitionCandidate;
  if (typeof candidate.name !== "string") return false;
  if (
    !isObject(candidate.colors) ||
    !isObject(candidate.spacing) ||
    !isObject(candidate.focusIndicator)
  ) {
    return false;
  }
  return isObject(candidate.widget);
}

export function mergeThemeOverride(parentTheme: Theme, override: unknown): Theme {
  if (!isObject(override)) return parentTheme;
  if (isThemeDefinition(override)) return compileTheme(override);
  return compileTheme(extendTheme(parentTheme.definition, override as ThemeOverrides));
}
