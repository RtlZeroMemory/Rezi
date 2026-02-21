/**
 * packages/core/src/theme/extend.ts — Extend semantic themes via deep merge.
 *
 * Why: Allows creating theme variants by overriding only selected tokens while
 * inheriting all other values from a base theme.
 */

import type { ThemeDefinition } from "./tokens.js";
import { validateTheme } from "./validate.js";

type Primitive = string | number | boolean | bigint | symbol | null | undefined;

type DeepPartial<T> = T extends Primitive
  ? T
  : T extends ReadonlyArray<infer U>
    ? ReadonlyArray<DeepPartial<U>>
    : { [K in keyof T]?: DeepPartial<T[K]> };

export type ThemeOverrides = DeepPartial<ThemeDefinition>;

function isMergeableObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function deepMerge(base: unknown, overrides: unknown): unknown {
  if (overrides === undefined) {
    if (Array.isArray(base)) {
      return [...base];
    }
    if (!isMergeableObject(base)) {
      return base;
    }

    const cloned: Record<string, unknown> = {};
    for (const key of Object.keys(base)) {
      cloned[key] = deepMerge(base[key], undefined);
    }
    return cloned;
  }

  if (Array.isArray(base)) {
    if (Array.isArray(overrides)) {
      return [...overrides];
    }
    return [...base];
  }

  if (!isMergeableObject(base) || !isMergeableObject(overrides)) {
    return overrides;
  }

  const merged: Record<string, unknown> = {};
  const keys = new Set<string>([...Object.keys(base), ...Object.keys(overrides)]);

  for (const key of keys) {
    const hasOverride = Object.prototype.hasOwnProperty.call(overrides, key);
    if (!hasOverride) {
      merged[key] = deepMerge(base[key], undefined);
      continue;
    }

    const overrideValue = overrides[key];
    if (overrideValue === undefined) {
      merged[key] = deepMerge(base[key], undefined);
      continue;
    }

    const baseValue = base[key];
    if (isMergeableObject(baseValue) && isMergeableObject(overrideValue)) {
      merged[key] = deepMerge(baseValue, overrideValue);
      continue;
    }

    if (Array.isArray(baseValue) && Array.isArray(overrideValue)) {
      merged[key] = [...overrideValue];
      continue;
    }

    merged[key] = overrideValue;
  }

  return merged;
}

function deepFreeze<T>(value: T): T {
  if (typeof value !== "object" || value === null) {
    return value;
  }

  if (Array.isArray(value)) {
    for (const item of value) {
      deepFreeze(item);
    }
    return Object.freeze(value);
  }

  const record = value as Record<string, unknown>;
  for (const key of Object.keys(record)) {
    deepFreeze(record[key]);
  }
  return Object.freeze(record) as T;
}

export function extendTheme(
  base: ThemeDefinition,
  overrides: ThemeOverrides = {},
): ThemeDefinition {
  const merged = deepMerge(base, overrides) as ThemeDefinition;
  const validated = validateTheme(merged);
  return deepFreeze(validated);
}
