/**
 * packages/core/src/widgets/style.ts — Text styling types and helpers.
 *
 * Why: Defines the visual styling options for text and widget content.
 * Styles are passed through to the drawlist builder and rendered by the
 * C engine using terminal escape sequences.
 *
 * @see docs/styling/style-props.md
 */

/** RGB color with components in range 0-255. */
export type Rgb = Readonly<{ r: number; g: number; b: number }>;

/** Theme color token path (e.g. "accent.primary", "diagnostic.error"). */
export type ThemeColor = string;

/** Underline style variants. */
export type UnderlineStyle = "none" | "straight" | "double" | "curly" | "dotted" | "dashed";

/**
 * Text styling options.
 *   - fg/bg: foreground/background colors
 *   - bold, dim, italic, underline, inverse, strikethrough, overline, blink: text attributes
 */
export type TextStyle = Readonly<{
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
  /**
   * Underline style variant.
   * Terminals that do not support underline variants should fall back to straight underline.
   */
  underlineStyle?: UnderlineStyle | undefined;
  /**
   * Underline color.
   * Accepts direct RGB or a theme token path.
   */
  underlineColor?: Rgb | ThemeColor | undefined;
}>;

/**
 * Create an RGB color value.
 */
export function rgb(r: number, g: number, b: number): Rgb {
  return { r, g, b };
}
