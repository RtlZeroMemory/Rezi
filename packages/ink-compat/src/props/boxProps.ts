import type { BoxProps as ReziBoxProps, StackProps, TextStyle } from "@rezi-ui/core";
import { resolveInkColor } from "../color.js";
import { warnOnce } from "../internal/warn.js";
import type { BoxProps } from "../types.js";

export type MappedInkBox = Readonly<{
  hidden: boolean;
  // Optional wrapper used when Ink props require features Rezi stacks don't have.
  wrapper: ReziBoxProps | null;
  stackKind: "row" | "column";
  stackProps: StackProps;
  reverseChildren: boolean;
  overflow: "visible" | "hidden" | "scroll";
  overflowX: "visible" | "hidden" | "scroll";
  overflowY: "visible" | "hidden" | "scroll";
  scrollTop: number;
  scrollLeft: number;
  scrollbarThumbColor?: string;
}>;

type Mutable<T> = { -readonly [K in keyof T]: T[K] };

type ReziSizeConstraint = number | `${number}%` | "auto";

function coerceSizeConstraint(v: number | string | undefined): ReziSizeConstraint | undefined {
  if (v === undefined) return undefined;
  if (typeof v === "number") return v;
  if (v === "auto") return "auto";
  if (v.endsWith("%")) {
    const n = Number(v.slice(0, -1));
    if (!Number.isFinite(n)) return undefined;
    return `${n}%` as `${number}%`;
  }
  const n = Number(v);
  if (!Number.isFinite(n)) return undefined;
  return n;
}

function coerceNumber(v: number | string | undefined): number | undefined {
  if (v === undefined) return undefined;
  if (typeof v === "number") return v;
  const n = Number(v);
  if (!Number.isFinite(n)) return undefined;
  return n;
}

function normalizeOverflow(v: unknown): "visible" | "hidden" | "scroll" {
  return v === "hidden" || v === "scroll" ? v : "visible";
}

function coerceScrollOffset(v: unknown): number {
  if (typeof v !== "number" || !Number.isFinite(v)) return 0;
  return v <= 0 ? 0 : v;
}

function mapAlignItems(v: BoxProps["alignItems"]): StackProps["align"] | undefined {
  if (!v) return undefined;
  if (v === "flex-start") return "start";
  if (v === "flex-end") return "end";
  return v === "center" ? "center" : "stretch";
}

function mapJustifyContent(v: BoxProps["justifyContent"]): StackProps["justify"] | undefined {
  if (!v) return undefined;
  if (v === "flex-start") return "start";
  if (v === "flex-end") return "end";
  if (v === "center") return "center";
  if (v === "space-between") return "between";
  if (v === "space-around") return "around";
  return "evenly";
}

function mapBorderStyle(v: string | undefined): ReziBoxProps["border"] | undefined {
  if (!v) return undefined;
  if (v === "single") return "single";
  if (v === "double") return "double";
  if (v === "round") return "rounded";
  if (v === "bold") return "heavy";
  if (v === "dashed") return "dashed";
  if (v === "heavy-dashed") return "heavy-dashed";
  return "single";
}

function mergeStyle(a: TextStyle | undefined, b: TextStyle | undefined): TextStyle | undefined {
  if (!a) return b;
  if (!b) return a;
  return { ...a, ...b };
}

function mapMargin(p: BoxProps): Pick<ReziBoxProps, "m" | "mx" | "my" | "mt" | "mr" | "mb" | "ml"> {
  const out: Mutable<Partial<Pick<ReziBoxProps, "m" | "mx" | "my" | "mt" | "mr" | "mb" | "ml">>> =
    {};
  if (typeof p.margin === "number") out.m = p.margin;
  if (typeof p.marginX === "number") out.mx = p.marginX;
  if (typeof p.marginY === "number") out.my = p.marginY;
  if (typeof p.marginTop === "number") out.mt = p.marginTop;
  if (typeof p.marginRight === "number") out.mr = p.marginRight;
  if (typeof p.marginBottom === "number") out.mb = p.marginBottom;
  if (typeof p.marginLeft === "number") out.ml = p.marginLeft;
  return out as Pick<ReziBoxProps, "m" | "mx" | "my" | "mt" | "mr" | "mb" | "ml">;
}

function mapPadding(p: BoxProps): Pick<StackProps, "p" | "px" | "py" | "pt" | "pb" | "pl" | "pr"> {
  const out: Mutable<Partial<Pick<StackProps, "p" | "px" | "py" | "pt" | "pb" | "pl" | "pr">>> = {};
  if (typeof p.padding === "number") out.p = p.padding;
  if (typeof p.paddingX === "number") out.px = p.paddingX;
  if (typeof p.paddingY === "number") out.py = p.paddingY;
  if (typeof p.paddingTop === "number") out.pt = p.paddingTop;
  if (typeof p.paddingBottom === "number") out.pb = p.paddingBottom;
  if (typeof p.paddingLeft === "number") out.pl = p.paddingLeft;
  if (typeof p.paddingRight === "number") out.pr = p.paddingRight;
  return out as Pick<StackProps, "p" | "px" | "py" | "pt" | "pb" | "pl" | "pr">;
}

function mapGap(p: BoxProps, isRow: boolean): number | undefined {
  if (typeof p.gap === "number") return p.gap;
  const mainAxisGap = isRow ? p.columnGap : p.rowGap;
  if (typeof mainAxisGap === "number") return mainAxisGap;
  const fallbackGap = isRow ? p.rowGap : p.columnGap;
  return typeof fallbackGap === "number" ? fallbackGap : undefined;
}

export function mapBoxProps(p: BoxProps): MappedInkBox {
  const hidden = p.display === "none";
  const overflow = normalizeOverflow(p.overflow);
  const overflowX = normalizeOverflow(p.overflowX ?? overflow);
  const overflowY = normalizeOverflow(p.overflowY ?? overflow);
  const scrollTop = coerceScrollOffset(p.scrollTop);
  const scrollLeft = coerceScrollOffset(p.scrollLeft);

  const dir = p.flexDirection ?? "row";
  const isRow = dir === "row" || dir === "row-reverse";
  const reverseChildren = dir === "row-reverse" || dir === "column-reverse";

  if (p.flexShrink !== undefined && p.flexShrink !== 1) {
    warnOnce("flexShrink is not supported by Rezi, using default behavior");
  }

  const gap = mapGap(p, isRow);
  const align = mapAlignItems(p.alignItems);
  const justify = mapJustifyContent(p.justifyContent);

  let width = coerceSizeConstraint(p.width);
  let height = coerceSizeConstraint(p.height);

  const flexBasis = coerceSizeConstraint(p.flexBasis);
  if (flexBasis !== undefined) {
    if (isRow) {
      if (width === undefined) width = flexBasis;
    } else {
      if (height === undefined) height = flexBasis;
    }
  }
  const minWidth = coerceNumber(p.minWidth);
  const maxWidth = coerceNumber(p.maxWidth);
  const minHeight = coerceNumber(p.minHeight);
  const maxHeight = coerceNumber(p.maxHeight);

  const flex = typeof p.flexGrow === "number" ? p.flexGrow : undefined;

  if (p.sticky === true) {
    warnOnce("sticky is not fully supported by Rezi yet; rendering as regular content");
  }
  if (p.stickyChildren !== undefined) {
    warnOnce("stickyChildren is not yet supported by Rezi; using regular children");
  }
  if (p.userSelect !== undefined && p.userSelect !== "auto") {
    warnOnce("userSelect is not supported by Rezi yet");
  }

  const border = mapBorderStyle(p.borderStyle);
  const backgroundColor = resolveInkColor(p.backgroundColor);
  const surfaceStyle = backgroundColor ? ({ bg: backgroundColor } as TextStyle) : undefined;
  if (p.opaque === true && !surfaceStyle) {
    warnOnce("opaque without backgroundColor is not supported by Rezi yet");
  }

  const borderColor =
    resolveInkColor(p.borderColor) ??
    resolveInkColor(p.borderTopColor) ??
    resolveInkColor(p.borderRightColor) ??
    resolveInkColor(p.borderBottomColor) ??
    resolveInkColor(p.borderLeftColor);
  const borderDim =
    p.borderDimColor === true ||
    p.borderTopDimColor === true ||
    p.borderRightDimColor === true ||
    p.borderBottomDimColor === true ||
    p.borderLeftDimColor === true;

  const wrapperStyle = mergeStyle(surfaceStyle, {
    ...(borderColor ? { fg: borderColor } : {}),
    ...(borderDim ? { dim: true } : {}),
  });
  const paddingProps = mapPadding(p);
  const marginProps = mapMargin(p);
  const constraintProps: Pick<
    StackProps,
    "width" | "height" | "minWidth" | "maxWidth" | "minHeight" | "maxHeight" | "flex"
  > = {
    ...(width === undefined ? {} : { width }),
    ...(height === undefined ? {} : { height }),
    ...(minWidth === undefined ? {} : { minWidth }),
    ...(maxWidth === undefined ? {} : { maxWidth }),
    ...(minHeight === undefined ? {} : { minHeight }),
    ...(maxHeight === undefined ? {} : { maxHeight }),
    ...(flex === undefined ? {} : { flex }),
  };

  const stackPropsBase: StackProps = {
    ...paddingProps,
    ...(gap === undefined ? {} : { gap }),
    ...(align === undefined ? {} : { align }),
    ...(justify === undefined ? {} : { justify }),
    ...(surfaceStyle ? { style: surfaceStyle } : {}),
  };

  const wrapper: ReziBoxProps | null = border
    ? {
        border,
        ...(p.borderTop === false ? { borderTop: false } : {}),
        ...(p.borderRight === false ? { borderRight: false } : {}),
        ...(p.borderBottom === false ? { borderBottom: false } : {}),
        ...(p.borderLeft === false ? { borderLeft: false } : {}),
        ...(wrapperStyle ? { style: wrapperStyle } : {}),
        ...constraintProps,
        ...marginProps,
      }
    : null;

  const stackProps: StackProps = wrapper
    ? stackPropsBase
    : { ...stackPropsBase, ...constraintProps, ...marginProps };

  return {
    hidden,
    wrapper,
    stackKind: isRow ? "row" : "column",
    stackProps,
    reverseChildren,
    overflow,
    overflowX,
    overflowY,
    scrollTop,
    scrollLeft,
    ...(p.scrollbarThumbColor === undefined ? {} : { scrollbarThumbColor: p.scrollbarThumbColor }),
  };
}
