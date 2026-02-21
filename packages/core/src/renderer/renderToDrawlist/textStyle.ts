import type { TextStyle } from "../../widgets/style.js";
import { sanitizeTextStyle } from "../../widgets/styleUtils.js";

export type ResolvedTextStyle = Readonly<
  {
    fg: NonNullable<TextStyle["fg"]>;
    bg: NonNullable<TextStyle["bg"]>;
  } & Pick<
    TextStyle,
    | "bold"
    | "dim"
    | "italic"
    | "underline"
    | "inverse"
    | "strikethrough"
    | "overline"
    | "blink"
    | "underlineStyle"
    | "underlineColor"
  >
>;

export const DEFAULT_BASE_STYLE: ResolvedTextStyle = Object.freeze({
  fg: Object.freeze({ r: 232, g: 238, b: 245 }),
  bg: Object.freeze({ r: 7, g: 10, b: 12 }),
});

// Fast path cache for `mergeTextStyle(DEFAULT_BASE_STYLE, override)` when override only toggles
// boolean attrs (no fg/bg). This is a hot path in large lists where style objects are frequently
// recreated but only take on a few distinct shapes.
const BASE_BOOL_STYLE_CACHE: Array<ResolvedTextStyle | null> = new Array(65536).fill(null);

function encTriBool(v: boolean | undefined): number {
  // 0 = inherit (undefined), 1 = false, 2 = true
  if (v === undefined) return 0;
  return v ? 2 : 1;
}

export function mergeTextStyle(
  base: ResolvedTextStyle,
  override: TextStyle | undefined,
): ResolvedTextStyle {
  if (!override) return base;
  const normalized = sanitizeTextStyle(override);
  if (
    base === DEFAULT_BASE_STYLE &&
    normalized.fg === undefined &&
    normalized.bg === undefined &&
    override.underlineStyle === undefined &&
    override.underlineColor === undefined
  ) {
    const b = encTriBool(normalized.bold);
    const d = encTriBool(normalized.dim);
    const i = encTriBool(normalized.italic);
    const u = encTriBool(normalized.underline);
    const inv = encTriBool(normalized.inverse);
    const s = encTriBool(normalized.strikethrough);
    const o = encTriBool(normalized.overline);
    const bl = encTriBool(normalized.blink);
    const key =
      b | (d << 2) | (i << 4) | (u << 6) | (inv << 8) | (s << 10) | (o << 12) | (bl << 14);
    if (key === 0) return base;
    const cached = BASE_BOOL_STYLE_CACHE[key];
    if (cached) return cached;

    const merged: {
      fg: NonNullable<TextStyle["fg"]>;
      bg: NonNullable<TextStyle["bg"]>;
      bold?: boolean;
      dim?: boolean;
      italic?: boolean;
      underline?: boolean;
      inverse?: boolean;
      strikethrough?: boolean;
      overline?: boolean;
      blink?: boolean;
      underlineStyle?: TextStyle["underlineStyle"];
      underlineColor?: TextStyle["underlineColor"];
    } = { fg: base.fg, bg: base.bg };

    if (normalized.bold !== undefined) merged.bold = normalized.bold;
    if (normalized.dim !== undefined) merged.dim = normalized.dim;
    if (normalized.italic !== undefined) merged.italic = normalized.italic;
    if (normalized.underline !== undefined) merged.underline = normalized.underline;
    if (normalized.inverse !== undefined) merged.inverse = normalized.inverse;
    if (normalized.strikethrough !== undefined) merged.strikethrough = normalized.strikethrough;
    if (normalized.overline !== undefined) merged.overline = normalized.overline;
    if (normalized.blink !== undefined) merged.blink = normalized.blink;

    const frozenMerged = Object.freeze(merged);
    BASE_BOOL_STYLE_CACHE[key] = frozenMerged;
    return frozenMerged;
  }
  if (
    normalized.fg === undefined &&
    normalized.bg === undefined &&
    normalized.bold === undefined &&
    normalized.dim === undefined &&
    normalized.italic === undefined &&
    normalized.underline === undefined &&
    normalized.inverse === undefined &&
    normalized.strikethrough === undefined &&
    normalized.overline === undefined &&
    normalized.blink === undefined &&
    override.underlineStyle === undefined &&
    override.underlineColor === undefined
  ) {
    return base;
  }
  const fg = normalized.fg ?? base.fg;
  const bg = normalized.bg ?? base.bg;
  const bold = normalized.bold ?? base.bold;
  const dim = normalized.dim ?? base.dim;
  const italic = normalized.italic ?? base.italic;
  const underline = normalized.underline ?? base.underline;
  const inverse = normalized.inverse ?? base.inverse;
  const strikethrough = normalized.strikethrough ?? base.strikethrough;
  const overline = normalized.overline ?? base.overline;
  const blink = normalized.blink ?? base.blink;
  const underlineStyle = override.underlineStyle ?? base.underlineStyle;
  const underlineColor = override.underlineColor ?? base.underlineColor;

  if (
    fg.r === base.fg.r &&
    fg.g === base.fg.g &&
    fg.b === base.fg.b &&
    bg.r === base.bg.r &&
    bg.g === base.bg.g &&
    bg.b === base.bg.b &&
    bold === base.bold &&
    dim === base.dim &&
    italic === base.italic &&
    underline === base.underline &&
    inverse === base.inverse &&
    strikethrough === base.strikethrough &&
    overline === base.overline &&
    blink === base.blink &&
    underlineStyle === base.underlineStyle &&
    underlineColor === base.underlineColor
  ) {
    return base;
  }

  const merged: {
    fg: NonNullable<TextStyle["fg"]>;
    bg: NonNullable<TextStyle["bg"]>;
    bold?: boolean;
    dim?: boolean;
    italic?: boolean;
    underline?: boolean;
    inverse?: boolean;
    strikethrough?: boolean;
    overline?: boolean;
    blink?: boolean;
    underlineStyle?: TextStyle["underlineStyle"];
    underlineColor?: TextStyle["underlineColor"];
  } = {
    fg,
    bg,
  };

  if (bold !== undefined) merged.bold = bold;
  if (dim !== undefined) merged.dim = dim;
  if (italic !== undefined) merged.italic = italic;
  if (underline !== undefined) merged.underline = underline;
  if (inverse !== undefined) merged.inverse = inverse;
  if (strikethrough !== undefined) merged.strikethrough = strikethrough;
  if (overline !== undefined) merged.overline = overline;
  if (blink !== undefined) merged.blink = blink;
  if (underlineStyle !== undefined) merged.underlineStyle = underlineStyle;
  if (underlineColor !== undefined) merged.underlineColor = underlineColor;
  return merged;
}

export function shouldFillForStyleOverride(override: TextStyle | undefined): boolean {
  if (!override) return false;
  return override.bg !== undefined;
}

function clampOpacity(opacity: number): number {
  if (!Number.isFinite(opacity)) return 1;
  if (opacity <= 0) return 0;
  if (opacity >= 1) return 1;
  return opacity;
}

function blendChannel(from: number, to: number, opacity: number): number {
  return Math.round(from + (to - from) * opacity);
}

/**
 * Apply opacity to a resolved style by blending fg/bg toward the provided backdrop color.
 */
export function applyOpacityToStyle(
  style: ResolvedTextStyle,
  opacity: number,
  backdrop: ResolvedTextStyle["bg"] = DEFAULT_BASE_STYLE.bg,
): ResolvedTextStyle {
  const clamped = clampOpacity(opacity);
  if (clamped >= 1) return style;

  const fg = Object.freeze({
    r: blendChannel(backdrop.r, style.fg.r, clamped),
    g: blendChannel(backdrop.g, style.fg.g, clamped),
    b: blendChannel(backdrop.b, style.fg.b, clamped),
  });
  const bg = Object.freeze({
    r: blendChannel(backdrop.r, style.bg.r, clamped),
    g: blendChannel(backdrop.g, style.bg.g, clamped),
    b: blendChannel(backdrop.b, style.bg.b, clamped),
  });

  if (
    fg.r === style.fg.r &&
    fg.g === style.fg.g &&
    fg.b === style.fg.b &&
    bg.r === style.bg.r &&
    bg.g === style.bg.g &&
    bg.b === style.bg.b
  ) {
    return style;
  }

  return Object.freeze({
    ...style,
    fg,
    bg,
  });
}
