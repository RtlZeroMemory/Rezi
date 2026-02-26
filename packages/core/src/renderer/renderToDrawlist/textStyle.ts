import { perfCount } from "../../perf/perf.js";
import { rgb, rgbBlend, type TextStyle } from "../../widgets/style.js";
import { sanitizeTextStyle } from "../../widgets/styleUtils.js";

const ATTR_BOLD = 1 << 0;
const ATTR_ITALIC = 1 << 1;
const ATTR_UNDERLINE = 1 << 2;
const ATTR_INVERSE = 1 << 3;
const ATTR_DIM = 1 << 4;
const ATTR_STRIKETHROUGH = 1 << 5;
const ATTR_OVERLINE = 1 << 6;
const ATTR_BLINK = 1 << 7;

export type ResolvedTextStyle = Readonly<
  {
    fg: NonNullable<TextStyle["fg"]>;
    bg: NonNullable<TextStyle["bg"]>;
    attrs: number;
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
  fg: rgb(232, 238, 245),
  bg: rgb(7, 10, 12),
  attrs: 0,
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

function computeAttrs(
  bold: boolean | undefined,
  dim: boolean | undefined,
  italic: boolean | undefined,
  underline: boolean | undefined,
  inverse: boolean | undefined,
  strikethrough: boolean | undefined,
  overline: boolean | undefined,
  blink: boolean | undefined,
  underlineStyle: TextStyle["underlineStyle"] | undefined,
): number {
  let attrs = 0;
  if (bold) attrs |= ATTR_BOLD;
  if (italic) attrs |= ATTR_ITALIC;
  if (underline || (underlineStyle !== undefined && underlineStyle !== "none")) {
    attrs |= ATTR_UNDERLINE;
  }
  if (inverse) attrs |= ATTR_INVERSE;
  if (dim) attrs |= ATTR_DIM;
  if (strikethrough) attrs |= ATTR_STRIKETHROUGH;
  if (overline) attrs |= ATTR_OVERLINE;
  if (blink) attrs |= ATTR_BLINK;
  return attrs >>> 0;
}

function freezeResolved(
  merged: Omit<ResolvedTextStyle, "attrs"> & { attrs?: number },
): ResolvedTextStyle {
  const out: ResolvedTextStyle = Object.freeze({
    ...merged,
    attrs:
      merged.attrs ??
      computeAttrs(
        merged.bold,
        merged.dim,
        merged.italic,
        merged.underline,
        merged.inverse,
        merged.strikethrough,
        merged.overline,
        merged.blink,
        merged.underlineStyle,
      ),
  });
  perfCount("style_objects_created", 1);
  return out;
}

export function mergeTextStyle(
  base: ResolvedTextStyle,
  override: TextStyle | undefined,
): ResolvedTextStyle {
  perfCount("style_merges_performed", 1);
  perfCount("packRgb_calls", 0);
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
      attrs?: number;
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

    merged.attrs = computeAttrs(
      merged.bold,
      merged.dim,
      merged.italic,
      merged.underline,
      merged.inverse,
      merged.strikethrough,
      merged.overline,
      merged.blink,
      undefined,
    );

    const frozenMerged = freezeResolved(merged);
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
  const attrs = computeAttrs(
    bold,
    dim,
    italic,
    underline,
    inverse,
    strikethrough,
    overline,
    blink,
    underlineStyle,
  );

  if (
    fg === base.fg &&
    bg === base.bg &&
    bold === base.bold &&
    dim === base.dim &&
    italic === base.italic &&
    underline === base.underline &&
    inverse === base.inverse &&
    strikethrough === base.strikethrough &&
    overline === base.overline &&
    blink === base.blink &&
    underlineStyle === base.underlineStyle &&
    underlineColor === base.underlineColor &&
    attrs === base.attrs
  ) {
    return base;
  }

  const merged: {
    fg: NonNullable<TextStyle["fg"]>;
    bg: NonNullable<TextStyle["bg"]>;
    attrs?: number;
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
    attrs,
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
  return freezeResolved(merged);
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

  const fg = rgbBlend(backdrop, style.fg, clamped);
  const bg = rgbBlend(backdrop, style.bg, clamped);

  if (fg === style.fg && bg === style.bg) {
    return style;
  }

  return freezeResolved({
    ...style,
    fg,
    bg,
  });
}
