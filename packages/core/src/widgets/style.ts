/**
 * packages/core/src/widgets/style.ts — Text styling types and helpers.
 */

/** Packed RGB color (0x00RRGGBB). Value 0 is reserved as default/unset sentinel. */
export type Rgb24 = number;

/** Theme color token path (e.g. "accent.primary", "diagnostic.error"). */
export type ThemeColor = string;

/** Underline style variants. */
export type UnderlineStyle = "none" | "straight" | "double" | "curly" | "dotted" | "dashed";

/** Text styling options. */
export type TextStyle = Readonly<{
  fg?: Rgb24;
  bg?: Rgb24;
  bold?: boolean;
  dim?: boolean;
  italic?: boolean;
  underline?: boolean;
  inverse?: boolean;
  strikethrough?: boolean;
  overline?: boolean;
  blink?: boolean;
  underlineStyle?: UnderlineStyle | undefined;
  underlineColor?: Rgb24 | ThemeColor | undefined;
}>;

function clampChannel(value: number): number {
  if (!Number.isFinite(value)) return 0;
  if (value <= 0) return 0;
  if (value >= 255) return 255;
  return Math.round(value);
}

/** Create a packed RGB color value. Note: `rgb(0, 0, 0)` encodes sentinel `0`. */
export function rgb(r: number, g: number, b: number): Rgb24 {
  const rr = clampChannel(r);
  const gg = clampChannel(g);
  const bb = clampChannel(b);
  return ((rr & 0xff) << 16) | ((gg & 0xff) << 8) | (bb & 0xff);
}

export function rgbR(value: Rgb24): number {
  return (value >>> 16) & 0xff;
}

export function rgbG(value: Rgb24): number {
  return (value >>> 8) & 0xff;
}

export function rgbB(value: Rgb24): number {
  return value & 0xff;
}

export function rgbBlend(backdrop: Rgb24, value: Rgb24, opacity: number): Rgb24 {
  const a = Number.isFinite(opacity) ? Math.min(1, Math.max(0, opacity)) : 1;
  if (a >= 1) return value >>> 0;
  if (a <= 0) return backdrop >>> 0;
  const r = Math.round(rgbR(backdrop) + (rgbR(value) - rgbR(backdrop)) * a);
  const g = Math.round(rgbG(backdrop) + (rgbG(value) - rgbG(backdrop)) * a);
  const b = Math.round(rgbB(backdrop) + (rgbB(value) - rgbB(backdrop)) * a);
  return rgb(r, g, b);
}
