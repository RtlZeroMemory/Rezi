/**
 * packages/core/src/layout/spacing-scale.ts — Named spacing scale.
 *
 * Why: Provides semantic spacing tokens for consistent layouts.
 * Values are in terminal cell units (1 cell = 1 character width/height).
 *
 * Scale rationale:
 *   - none: 0 - No spacing
 *   - xs: 1 - Minimal spacing (tight)
 *   - sm: 1 - Small spacing (compact elements)
 *   - md: 2 - Medium spacing (default)
 *   - lg: 3 - Large spacing (sections)
 *   - xl: 4 - Extra large spacing (major sections)
 *   - 2xl: 6 - Double extra large (page margins)
 *
 * @see docs/guide/layout.md
 */
import { type ResponsiveValue, resolveResponsiveValue } from "./responsive.js";

/**
 * Named spacing scale keys.
 */
export type SpacingKey = "none" | "xs" | "sm" | "md" | "lg" | "xl" | "2xl";

/**
 * Spacing scale values in terminal cell units.
 * Optimized for terminal UIs where space is limited.
 */
export const SPACING_SCALE: Readonly<Record<SpacingKey, number>> = Object.freeze({
  none: 0,
  xs: 1,
  sm: 1,
  md: 2,
  lg: 3,
  xl: 4,
  "2xl": 6,
});

/**
 * Type for spacing values - either a number or a scale key.
 */
type BaseSpacingValue = number | SpacingKey;
export type SpacingValue = ResponsiveValue<BaseSpacingValue>;

/**
 * Check if a value is a valid spacing key.
 */
export function isSpacingKey(value: unknown): value is SpacingKey {
  return (
    value === "none" ||
    value === "xs" ||
    value === "sm" ||
    value === "md" ||
    value === "lg" ||
    value === "xl" ||
    value === "2xl"
  );
}

/**
 * Resolve a spacing value to a number.
 * Accepts either a direct number or a scale key.
 *
 * @param value - Number or spacing key
 * @returns Resolved spacing in cell units
 *
 * @example
 * ```typescript
 * resolveSpacingValue("md")  // 2
 * resolveSpacingValue("lg")  // 3
 * resolveSpacingValue(5)     // 5
 * resolveSpacingValue("xs")  // 1
 * ```
 */
export function resolveSpacingValue(value: SpacingValue | undefined): number {
  const resolved = resolveResponsiveValue(value);
  if (resolved === undefined) return 0;
  if (typeof resolved === "number") return resolved;
  if (isSpacingKey(resolved)) return SPACING_SCALE[resolved];
  return 0;
}

/**
 * Resolve spacing with a default fallback.
 *
 * @param value - Spacing value or undefined
 * @param fallback - Default value if undefined
 * @returns Resolved spacing
 */
export function resolveSpacingWithDefault(
  value: SpacingValue | undefined,
  fallback: number,
): number {
  const resolved = resolveResponsiveValue(value);
  if (resolved === undefined) return fallback;
  if (typeof resolved === "number") return resolved;
  if (isSpacingKey(resolved)) return SPACING_SCALE[resolved];
  return fallback;
}
