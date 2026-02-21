import { resolveResponsiveValue } from "../../layout/responsive.js";
import { isSpacingKey, resolveSpacingValue } from "../../layout/spacing-scale.js";

type ResolvedSpacing = Readonly<{ top: number; right: number; bottom: number; left: number }>;

/** Shared constant for the common zero-padding case. */
const ZERO_SPACING: ResolvedSpacing = Object.freeze({ top: 0, right: 0, bottom: 0, left: 0 });

export function clampNonNegative(n: number): number {
  return n < 0 ? 0 : n;
}

/**
 * Read a spacing value (number or scale key) and resolve to non-negative integer.
 */
export function readSpacingValue(v: unknown, def: number): number {
  const resolved = resolveResponsiveValue(v);
  if (typeof resolved === "string" && isSpacingKey(resolved)) {
    return resolveSpacingValue(resolved);
  }
  if (typeof resolved !== "number" || !Number.isInteger(resolved) || resolved < 0) return def;
  return resolved;
}

/**
 * Read an optional spacing value.
 */
export function readOptionalSpacingValue(v: unknown): number | undefined {
  const resolved = resolveResponsiveValue(v);
  if (typeof resolved === "string" && isSpacingKey(resolved)) {
    return resolveSpacingValue(resolved);
  }
  if (typeof resolved !== "number" || !Number.isInteger(resolved) || resolved < 0) {
    return undefined;
  }
  return resolved;
}

// Legacy aliases for backwards compatibility
export const readIntNonNegative = readSpacingValue;
export const readOptionalIntNonNegative = readOptionalSpacingValue;

export function resolveSpacingFromProps(props: {
  pad?: unknown;
  p?: unknown;
  px?: unknown;
  py?: unknown;
  pt?: unknown;
  pb?: unknown;
  pl?: unknown;
  pr?: unknown;
}): ResolvedSpacing {
  // Fast path: no padding props at all → return shared constant (avoids allocation).
  if (
    props.pad === undefined &&
    props.p === undefined &&
    props.px === undefined &&
    props.py === undefined &&
    props.pt === undefined &&
    props.pb === undefined &&
    props.pl === undefined &&
    props.pr === undefined
  ) {
    return ZERO_SPACING;
  }

  const pad = readSpacingValue(props.pad, 0);
  const p = readOptionalSpacingValue(props.p) ?? pad;
  const px = readOptionalSpacingValue(props.px) ?? p;
  const py = readOptionalSpacingValue(props.py) ?? p;

  const top = readOptionalSpacingValue(props.pt) ?? py;
  const right = readOptionalSpacingValue(props.pr) ?? px;
  const bottom = readOptionalSpacingValue(props.pb) ?? py;
  const left = readOptionalSpacingValue(props.pl) ?? px;

  if (top === 0 && right === 0 && bottom === 0 && left === 0) return ZERO_SPACING;
  return { top, right, bottom, left };
}

export function resolveMarginFromProps(props: {
  m?: unknown;
  mx?: unknown;
  my?: unknown;
}): ResolvedSpacing {
  const m = readOptionalSpacingValue(props.m) ?? 0;
  const mx = readOptionalSpacingValue(props.mx) ?? m;
  const my = readOptionalSpacingValue(props.my) ?? m;
  return {
    top: my,
    right: mx,
    bottom: my,
    left: mx,
  };
}
