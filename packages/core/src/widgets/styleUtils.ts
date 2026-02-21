/**
 * packages/core/src/widgets/styleUtils.ts — Style helpers.
 *
 * Why: Provides small, deterministic helpers for composing TextStyle objects.
 */

import type { TextStyle } from "./style.js";
import type { Rgb } from "./style.js";

type RgbInput = {
  r?: unknown;
  g?: unknown;
  b?: unknown;
};

type TextStyleInput = {
  fg?: unknown;
  bg?: unknown;
  bold?: unknown;
  dim?: unknown;
  italic?: unknown;
  underline?: unknown;
  inverse?: unknown;
  strikethrough?: unknown;
  overline?: unknown;
  blink?: unknown;
};

function parseChannel(value: unknown): number | undefined {
  let n: number | undefined;
  if (typeof value === "number" && Number.isFinite(value)) {
    n = value;
  } else if (typeof value === "string") {
    const trimmed = value.trim();
    if (trimmed.length === 0) return undefined;
    const parsed = Number(trimmed);
    if (Number.isFinite(parsed)) n = parsed;
  }
  if (n === undefined) return undefined;
  const rounded = Math.round(n);
  return Math.min(255, Math.max(0, rounded));
}

function parseBoolean(value: unknown): boolean | undefined {
  if (typeof value === "boolean") return value;
  if (typeof value !== "string") return undefined;
  const normalized = value.trim().toLowerCase();
  if (normalized === "true") return true;
  if (normalized === "false") return false;
  return undefined;
}

/**
 * Clamp/normalize RGB channels into valid byte range.
 */
export function sanitizeRgb(value: unknown): Rgb | undefined {
  if (typeof value !== "object" || value === null || Array.isArray(value)) return undefined;
  const source = value as RgbInput;
  const r = parseChannel(source.r);
  const g = parseChannel(source.g);
  const b = parseChannel(source.b);
  if (r === undefined || g === undefined || b === undefined) return undefined;
  return { r, g, b };
}

/**
 * Normalize style objects from dynamic inputs (e.g., agent-generated props).
 * Invalid keys/values are dropped; RGB channels are clamped to 0..255.
 */
export function sanitizeTextStyle(style: unknown): TextStyle {
  if (typeof style !== "object" || style === null || Array.isArray(style)) {
    return {};
  }

  const src = style as TextStyleInput;
  const sanitized: {
    fg?: Rgb;
    bg?: Rgb;
    bold?: boolean;
    dim?: boolean;
    italic?: boolean;
    underline?: boolean;
    inverse?: boolean;
    strikethrough?: boolean;
    overline?: boolean;
    blink?: boolean;
  } = {};

  const fg = sanitizeRgb(src.fg);
  if (fg !== undefined) sanitized.fg = fg;
  const bg = sanitizeRgb(src.bg);
  if (bg !== undefined) sanitized.bg = bg;

  const bold = parseBoolean(src.bold);
  if (bold !== undefined) sanitized.bold = bold;
  const dim = parseBoolean(src.dim);
  if (dim !== undefined) sanitized.dim = dim;
  const italic = parseBoolean(src.italic);
  if (italic !== undefined) sanitized.italic = italic;
  const underline = parseBoolean(src.underline);
  if (underline !== undefined) sanitized.underline = underline;
  const inverse = parseBoolean(src.inverse);
  if (inverse !== undefined) sanitized.inverse = inverse;
  const strikethrough = parseBoolean(src.strikethrough);
  if (strikethrough !== undefined) sanitized.strikethrough = strikethrough;
  const overline = parseBoolean(src.overline);
  if (overline !== undefined) sanitized.overline = overline;
  const blink = parseBoolean(src.blink);
  if (blink !== undefined) sanitized.blink = blink;

  return sanitized;
}

/**
 * Merge multiple styles; later styles override earlier.
 */
export function mergeStyles(...styles: (TextStyle | undefined)[]): TextStyle {
  let out: TextStyle = {};
  for (const s of styles) {
    if (!s) continue;
    out = { ...out, ...sanitizeTextStyle(s) };
  }
  return out;
}

/**
 * Extend a base style with overrides.
 */
export function extendStyle(base: TextStyle, overrides: TextStyle): TextStyle {
  return mergeStyles(base, overrides);
}

/**
 * Conditional style selection.
 */
export function styleWhen<T extends TextStyle>(
  condition: boolean,
  trueStyle: T,
  falseStyle?: T,
): T | undefined {
  if (condition) return trueStyle;
  return falseStyle;
}

/**
 * Style presets.
 */
export const styles = {
  bold: { bold: true } as const,
  dim: { dim: true } as const,
  italic: { italic: true } as const,
  underline: { underline: true } as const,
  inverse: { inverse: true } as const,
  strikethrough: { strikethrough: true } as const,
  overline: { overline: true } as const,
  blink: { blink: true } as const,
} as const;
