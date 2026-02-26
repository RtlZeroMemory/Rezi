import { type Rgb24, type VNode, rgb, ui } from "@rezi-ui/core";

import type { InkHostContainer, InkHostNode } from "../reconciler/types.js";
import { mapBorderStyle } from "./borderMap.js";
import { parseColor } from "./colorMap.js";
import { mapAlign, mapJustify } from "./layoutMap.js";
import { isTranslationTraceEnabled, pushTranslationTrace } from "./traceCollector.js";

interface TextSpan {
  text: string;
  style: TextStyleMap;
}

interface TextStyleMap {
  fg?: Rgb24;
  bg?: Rgb24;
  bold?: boolean;
  italic?: boolean;
  underline?: boolean;
  strikethrough?: boolean;
  dim?: boolean;
  inverse?: boolean;
  [key: string]: unknown;
}

type LayoutDirection = "row" | "column";
type TranslationMode = "all" | "dynamic" | "static";
type BorderStyleValue = string | Record<string, string>;

interface VirtualNodeProps extends Record<string, unknown> {
  __inkType?: "spacer" | "newline" | "transform";
  count?: number;
  __inkTransform?: (line: string, index: number) => string;
}

interface BoxNodeProps extends Record<string, unknown> {
  __inkStatic?: boolean;
  __inkType?: string;
  display?: "flex" | "none";
  flexDirection?: "row" | "row-reverse" | "column" | "column-reverse";
  flexGrow?: number;
  flexShrink?: number;
  flexBasis?: number | string;
  flexWrap?: "nowrap" | "wrap" | "wrap-reverse";
  alignItems?: string;
  alignSelf?: string;
  justifyContent?: string;
  width?: number | string;
  height?: number | string;
  minWidth?: number | string;
  minHeight?: number | string;
  maxWidth?: number | string;
  maxHeight?: number | string;
  position?: "relative" | "absolute";
  top?: number;
  right?: number;
  bottom?: number;
  left?: number;
  padding?: number;
  paddingX?: number;
  paddingY?: number;
  paddingTop?: number;
  paddingRight?: number;
  paddingBottom?: number;
  paddingLeft?: number;
  margin?: number;
  marginX?: number;
  marginY?: number;
  marginTop?: number;
  marginRight?: number;
  marginBottom?: number;
  marginLeft?: number;
  gap?: number;
  rowGap?: number;
  columnGap?: number;
  borderStyle?: BorderStyleValue;
  borderColor?: string;
  borderTopColor?: string;
  borderRightColor?: string;
  borderBottomColor?: string;
  borderLeftColor?: string;
  borderDimColor?: boolean;
  borderTopDimColor?: boolean;
  borderRightDimColor?: boolean;
  borderBottomDimColor?: boolean;
  borderLeftDimColor?: boolean;
  borderTop?: boolean;
  borderRight?: boolean;
  borderBottom?: boolean;
  borderLeft?: boolean;
  backgroundColor?: string;
  overflow?: "visible" | "hidden" | "scroll";
  overflowX?: "visible" | "hidden" | "scroll";
  overflowY?: "visible" | "hidden" | "scroll";
  scrollLeft?: number;
  scrollTop?: number;
  scrollbarThumbColor?: string;
  ["aria-label"]?: string;
  ariaLabel?: string;
  accessibilityLabel?: string;
}

interface TextNodeProps extends Record<string, unknown> {
  color?: string;
  backgroundColor?: string;
  bold?: boolean;
  italic?: boolean;
  underline?: boolean;
  strikethrough?: boolean;
  dimColor?: boolean;
  inverse?: boolean;
  wrap?: string;
  ["aria-label"]?: string;
  ariaLabel?: string;
  accessibilityLabel?: string;
}

interface LayoutProps extends Record<string, unknown> {
  p?: number;
  px?: number;
  py?: number;
  pt?: number;
  pr?: number;
  pb?: number;
  pl?: number;
  m?: number;
  mx?: number;
  my?: number;
  mt?: number;
  mr?: number;
  mb?: number;
  ml?: number;
  gap?: number;
  width?: number | `${number}%`;
  height?: number | `${number}%`;
  minWidth?: number;
  minHeight?: number;
  maxWidth?: number;
  maxHeight?: number;
  flexBasis?: number | `${number}%`;
  flex?: number;
  flexShrink?: number;
  items?: string;
  justify?: string;
  alignSelf?: string;
  position?: "relative" | "absolute";
  top?: number;
  right?: number;
  bottom?: number;
  left?: number;
  overflow?: "hidden" | "scroll";
  scrollX?: number;
  scrollY?: number;
  scrollbarStyle?: Record<string, unknown>;
  wrap?: boolean;
  reverse?: boolean;
  border?: unknown;
  borderTop?: boolean;
  borderRight?: boolean;
  borderBottom?: boolean;
  borderLeft?: boolean;
  borderStyle?: Record<string, unknown>;
  borderStyleSides?: Record<string, unknown>;
  style?: Record<string, unknown>;
  accessibilityLabel?: string;
}

export interface TranslateTreeOptions {
  mode?: TranslationMode;
}

interface TranslateContext {
  parentDirection: LayoutDirection;
  parentMainDefinite: boolean;
  isRoot: boolean;
  mode: TranslationMode;
  inStaticSubtree: boolean;
}

let warnedWrapReverse = false;

const ANSI_SGR_REGEX = /\u001b\[([0-9:;]*)m/g;
const PERCENT_VALUE_REGEX = /^(-?\d+(?:\.\d+)?)%$/;

function toNonNegativeInt(value: unknown): number | undefined {
  if (typeof value !== "number" || !Number.isFinite(value)) return undefined;
  return Math.max(0, Math.trunc(value));
}

function parsePercentValue(value: unknown): number | undefined {
  if (typeof value !== "string") return undefined;
  const match = value.trim().match(PERCENT_VALUE_REGEX);
  if (!match) return undefined;
  const parsed = Number.parseFloat(match[1]!);
  return Number.isFinite(parsed) ? parsed : undefined;
}

function attachHostNode(vnode: VNode | null, node: InkHostNode): VNode | null {
  if (!vnode || typeof vnode !== "object") return vnode;
  const candidate = vnode as { props?: unknown };
  const props =
    typeof candidate.props === "object" && candidate.props !== null
      ? (candidate.props as Record<string, unknown>)
      : {};
  return {
    ...(vnode as Record<string, unknown>),
    props: {
      ...props,
      __inkHostNode: node,
    },
  } as unknown as VNode;
}

function readAccessibilityLabel(props: Record<string, unknown>): string | undefined {
  const candidates = [props["aria-label"], props["ariaLabel"], props["accessibilityLabel"]];
  for (const candidate of candidates) {
    if (typeof candidate === "string" && candidate.length > 0) {
      return candidate;
    }
  }
  return undefined;
}

const ANSI_16_PALETTE: readonly Rgb24[] = [
  rgb(0, 0, 0),
  rgb(205, 0, 0),
  rgb(0, 205, 0),
  rgb(205, 205, 0),
  rgb(0, 0, 238),
  rgb(205, 0, 205),
  rgb(0, 205, 205),
  rgb(229, 229, 229),
  rgb(127, 127, 127),
  rgb(255, 0, 0),
  rgb(0, 255, 0),
  rgb(255, 255, 0),
  rgb(92, 92, 255),
  rgb(255, 0, 255),
  rgb(0, 255, 255),
  rgb(255, 255, 255),
];

/**
 * Translate the entire InkHostNode tree into a Rezi VNode tree.
 */
export function translateTree(
  container: InkHostContainer,
  options: TranslateTreeOptions = {},
): VNode {
  const mode = options.mode ?? "all";
  const rootContext: TranslateContext = {
    parentDirection: "column",
    parentMainDefinite: true,
    isRoot: true,
    mode,
    inStaticSubtree: false,
  };
  const children = container.children
    .map((child) => translateNode(child, rootContext))
    .filter(Boolean) as VNode[];
  if (children.length === 0) return ui.text("");
  if (children.length === 1) return children[0]!;
  return ui.column({ gap: 0 }, children);
}

export function translateDynamicTree(container: InkHostContainer): VNode {
  return translateTree(container, { mode: "dynamic" });
}

export function translateStaticTree(container: InkHostContainer): VNode {
  return translateTree(container, { mode: "static" });
}

function translateNode(
  node: InkHostNode,
  context: TranslateContext = {
    parentDirection: "column",
    parentMainDefinite: true,
    isRoot: false,
    mode: "all",
    inStaticSubtree: false,
  },
): VNode | null {
  const props = (node.props ?? {}) as Record<string, unknown>;
  const isStaticNode = node.type === "ink-box" && props["__inkStatic"] === true;

  if (context.mode === "dynamic" && isStaticNode) {
    return null;
  }

  if (context.mode === "static" && !context.inStaticSubtree && !isStaticNode) {
    if (node.children.length === 0) return null;
    return translateChildren(node, context);
  }

  if (node.textContent != null) {
    return translateRawTextContent(node.textContent);
  }

  if (node.type === "ink-virtual") {
    const virtualProps = node.props as VirtualNodeProps;
    const inkType = virtualProps.__inkType;
    if (inkType === "spacer") {
      return ui.spacer({ flex: 1 });
    }
    if (inkType === "newline") {
      const count = virtualProps.count;
      const repeatCount = count == null ? 1 : Math.max(0, Math.trunc(count));
      return ui.text("\n".repeat(repeatCount));
    }
    if (inkType === "transform" && typeof virtualProps.__inkTransform === "function") {
      return translateTransform(node);
    }
  }

  switch (node.type) {
    case "ink-box":
      return attachHostNode(translateBox(node, context), node);
    case "ink-text":
      return attachHostNode(translateText(node), node);
    default:
      return translateChildren(node, context);
  }
}

function translateRawTextContent(textContent: string): VNode {
  const { spans, fullText } = parseAnsiText(textContent, {});

  if (fullText.length === 0) return ui.text("");

  if (fullText.includes("\n")) {
    return translateMultilineRichText(spans);
  }

  if (spans.length === 1) {
    const only = spans[0]!;
    return Object.keys(only.style).length > 0
      ? ui.text(only.text, { style: only.style })
      : ui.text(only.text);
  }

  return ui.richText(spans.map((span) => ({ text: span.text, style: span.style })));
}

function translateTransform(node: InkHostNode): VNode {
  const props = node.props as VirtualNodeProps;
  const transform = props.__inkTransform;
  if (typeof transform !== "function") {
    return ui.text("");
  }
  const accessibilityLabel = readAccessibilityLabel(props);
  const raw = node.children.map((child) => collectTransformText(child)).join("");
  const textProps: Record<string, unknown> = {
    wrap: true,
    __inkTransform: transform,
  };
  if (accessibilityLabel) {
    textProps["accessibilityLabel"] = accessibilityLabel;
  }
  return ui.text(raw, textProps);
}

function collectTransformText(node: InkHostNode): string {
  if (node.textContent != null) {
    return node.textContent;
  }

  const virtualProps = node.props as VirtualNodeProps;
  if (node.type === "ink-virtual" && virtualProps.__inkType === "newline") {
    const count = virtualProps.count;
    const repeatCount = count == null ? 1 : Math.max(0, Math.trunc(count));
    return "\n".repeat(repeatCount);
  }

  return node.children.map((child) => collectTransformText(child)).join("");
}

function translateBox(node: InkHostNode, context: TranslateContext): VNode | null {
  const p = node.props as BoxNodeProps;
  const accessibilityLabel = readAccessibilityLabel(p);
  const direction = (p.flexDirection as string | undefined) ?? "row";
  const isRow = direction === "row" || direction === "row-reverse";

  const overflow = p.overflow as string | undefined;
  const overflowX = p.overflowX as string | undefined;
  const overflowY = p.overflowY as string | undefined;
  const hasScrollOverflow =
    overflow === "scroll" || overflowX === "scroll" || overflowY === "scroll";
  const hasHiddenOverflow =
    overflow === "hidden" || overflowX === "hidden" || overflowY === "hidden";

  const hasFixedWidth = typeof p.width === "number";
  const hasFixedHeight = typeof p.height === "number";
  const effectiveFlexShrink = typeof p.flexShrink === "number" ? p.flexShrink : 1;
  const hasGrowFromDefiniteParent =
    context.parentMainDefinite && typeof p.flexGrow === "number" && p.flexGrow > 0;
  const rootWillBeViewportHeightCoerced =
    context.isRoot && !isRow && !hasFixedHeight && (hasScrollOverflow || hasHiddenOverflow);

  // Propagate definiteness through same-direction chains: if a column's parent
  // is a definite-height column and the child still participates in shrink/flex
  // resolution, the child's main size will also be resolved by layout.
  // If a node opts out with flexShrink:0, treat it as potentially auto-sized.
  const inheritsMainDefinite =
    context.parentMainDefinite &&
    context.parentDirection === (isRow ? "row" : "column") &&
    effectiveFlexShrink > 0;

  const nodeMainDefinite = isRow
    ? hasFixedWidth || hasGrowFromDefiniteParent || inheritsMainDefinite
    : hasFixedHeight ||
      hasGrowFromDefiniteParent ||
      rootWillBeViewportHeightCoerced ||
      inheritsMainDefinite;
  const inStaticSubtree = context.inStaticSubtree || p.__inkStatic === true;

  const childContext: TranslateContext = {
    parentDirection: isRow ? "row" : "column",
    parentMainDefinite: nodeMainDefinite,
    isRoot: false,
    mode: context.mode,
    inStaticSubtree,
  };

  if (p.display === "none") return null;

  if (p.__inkStatic === true) {
    const staticProps: Record<string, unknown> = {
      ...p,
      __inkStatic: false,
      flexDirection: "column",
    };

    if (staticProps["position"] === "absolute") {
      delete staticProps["position"];
      delete staticProps["top"];
      delete staticProps["right"];
      delete staticProps["bottom"];
      delete staticProps["left"];
    }

    const staticNode: InkHostNode = {
      ...node,
      props: staticProps,
    };
    const staticContext = context.inStaticSubtree
      ? context
      : {
          ...context,
          inStaticSubtree: true,
        };

    return translateBox(staticNode, staticContext);
  }

  if (p.__inkType === "spacer") {
    return ui.spacer({
      flex: typeof p.flexGrow === "number" ? p.flexGrow : 1,
      ...(typeof p.width === "number" ? { size: p.width } : {}),
    });
  }

  const children = node.children
    .map((child) => translateNode(child, childContext))
    .filter(Boolean) as VNode[];
  const hasBorder = p.borderStyle != null;
  const hasBg = p.backgroundColor != null;

  const layoutProps: LayoutProps = {};

  if (p.padding != null) layoutProps.p = p.padding;
  if (p.paddingX != null) layoutProps.px = p.paddingX;
  if (p.paddingY != null) layoutProps.py = p.paddingY;
  if (p.paddingTop != null) layoutProps.pt = p.paddingTop;
  if (p.paddingBottom != null) layoutProps.pb = p.paddingBottom;
  if (p.paddingLeft != null) layoutProps.pl = p.paddingLeft;
  if (p.paddingRight != null) layoutProps.pr = p.paddingRight;

  if (p.margin != null) layoutProps.m = p.margin;
  if (p.marginX != null) layoutProps.mx = p.marginX;
  if (p.marginY != null) layoutProps.my = p.marginY;
  if (p.marginTop != null) layoutProps.mt = p.marginTop;
  if (p.marginBottom != null) layoutProps.mb = p.marginBottom;
  if (p.marginLeft != null) layoutProps.ml = p.marginLeft;
  if (p.marginRight != null) layoutProps.mr = p.marginRight;

  if (p.gap != null) layoutProps.gap = p.gap;
  if (p.columnGap != null && direction.startsWith("row") && layoutProps.gap == null) {
    layoutProps.gap = p.columnGap;
  }
  if (p.rowGap != null && direction.startsWith("column") && layoutProps.gap == null) {
    layoutProps.gap = p.rowGap;
  }

  // Rezi core's layout engine natively resolves percent strings (e.g. "50%")
  // for width, height, and flexBasis via resolveConstraint(). Pass them through
  // directly instead of creating __inkPercent* markers that trigger a costly
  // two-pass layout in renderFrame().
  // minWidth/minHeight only accept numbers in Rezi core, so those still use
  // the marker approach (but gemini-cli doesn't use percent values for those).
  const NATIVE_PERCENT_PROPS = new Set(["width", "height", "flexBasis"]);

  const applyNumericOrPercentDimension = (
    prop: "width" | "height" | "minWidth" | "minHeight" | "flexBasis",
    value: unknown,
  ): void => {
    if (typeof value === "number") {
      layoutProps[prop] = value;
      return;
    }

    const percent = parsePercentValue(value);
    if (percent != null) {
      if (NATIVE_PERCENT_PROPS.has(prop)) {
        // Pass percent string directly — layout engine resolves it natively
        (layoutProps as Record<string, unknown>)[prop] = `${percent}%`;
      } else {
        // minWidth/minHeight: layout engine only accepts numbers, use marker
        const markerKey = `__inkPercent${prop.charAt(0).toUpperCase()}${prop.slice(1)}`;
        layoutProps[markerKey] = percent;
      }
      return;
    }

    if (value != null && isTranslationTraceEnabled()) {
      pushTranslationTrace({
        kind: "dimension-skip",
        prop,
        value: String(value),
        nodeType: node.type,
        childCount: node.children.length,
        textSnippet: node.textContent?.slice(0, 40) ?? "",
      });
    }
  };

  applyNumericOrPercentDimension("width", p.width);
  applyNumericOrPercentDimension("height", p.height);
  applyNumericOrPercentDimension("minWidth", p.minWidth);
  applyNumericOrPercentDimension("minHeight", p.minHeight);

  if (typeof p.maxWidth === "number") layoutProps.maxWidth = p.maxWidth;
  if (typeof p.maxHeight === "number") layoutProps.maxHeight = p.maxHeight;

  const shouldSkipAutoMainFlexGrow =
    typeof p.flexGrow === "number" &&
    p.flexGrow > 0 &&
    context.parentDirection === "column" &&
    !context.parentMainDefinite;
  if (p.flexGrow != null && !shouldSkipAutoMainFlexGrow) {
    layoutProps.flex = p.flexGrow;
  }
  if (shouldSkipAutoMainFlexGrow && isTranslationTraceEnabled()) {
    pushTranslationTrace({
      kind: "flex-grow-skip",
      reason: "auto-main-parent",
      nodeType: node.type,
      childCount: node.children.length,
      props: {
        flexGrow: p.flexGrow ?? null,
        flexShrink: p.flexShrink ?? null,
        flexDirection: p.flexDirection ?? "row",
        width: p.width ?? null,
        height: p.height ?? null,
      },
      context: {
        parentDirection: context.parentDirection,
        parentMainDefinite: context.parentMainDefinite,
      },
    });
  }

  // Targeted compat for a known Yoga/Rezi difference: only force flex fill for
  // clip/scroll containers. Broadly applying this to every width-constrained
  // column child (including regular control stacks) causes tall empty regions.
  const shouldApplyForcedFlexCompat =
    !isRow &&
    p.flexGrow === 0 &&
    p.flexShrink === 0 &&
    hasFixedWidth &&
    !hasFixedHeight &&
    context.parentDirection === "column" &&
    context.parentMainDefinite &&
    (hasScrollOverflow || hasHiddenOverflow);
  if (shouldApplyForcedFlexCompat) {
    layoutProps.flex = 1;
  }

  const isForcedFlexCompatCandidate =
    !isRow &&
    p.flexGrow === 0 &&
    p.flexShrink === 0 &&
    hasFixedWidth &&
    !hasFixedHeight &&
    context.parentDirection === "column" &&
    context.parentMainDefinite;
  if (isForcedFlexCompatCandidate && isTranslationTraceEnabled()) {
    pushTranslationTrace({
      kind: "forced-flex-compat",
      applied: shouldApplyForcedFlexCompat,
      hasScrollOverflow,
      hasHiddenOverflow,
      nodeType: node.type,
      childCount: node.children.length,
      props: {
        width: p.width ?? null,
        height: p.height ?? null,
        flexDirection: p.flexDirection ?? "row",
        flexGrow: p.flexGrow ?? null,
        flexShrink: p.flexShrink ?? null,
        overflow: p.overflow ?? null,
        overflowX: p.overflowX ?? null,
        overflowY: p.overflowY ?? null,
      },
    });
  }

  if (p.flexShrink != null) {
    layoutProps.flexShrink = p.flexShrink;
  } else {
    layoutProps.flexShrink = 1;
  }
  if (p.flexBasis != null) {
    applyNumericOrPercentDimension("flexBasis", p.flexBasis);
  }

  // Ink/Yoga default is alignItems: "stretch" for both row and column stacks.
  const items = mapAlign(p.alignItems as string | undefined) ?? (isRow ? undefined : "stretch");
  if (items) layoutProps.items = items;

  const justify = mapJustify(p.justifyContent as string | undefined);
  if (justify) layoutProps.justify = justify;

  const alignSelf = p.alignSelf === "auto" ? "auto" : mapAlign(p.alignSelf as string | undefined);
  if (alignSelf) layoutProps.alignSelf = alignSelf;

  if (p.position === "absolute" || p.position === "relative") {
    layoutProps.position = p.position;
    if (typeof p.top === "number") layoutProps.top = p.top;
    if (typeof p.right === "number") layoutProps.right = p.right;
    if (typeof p.bottom === "number") layoutProps.bottom = p.bottom;
    if (typeof p.left === "number") layoutProps.left = p.left;
  }

  if (hasScrollOverflow) {
    layoutProps.overflow = "scroll";

    const scrollX = toNonNegativeInt(p.scrollLeft);
    if (scrollX != null) layoutProps.scrollX = scrollX;

    const scrollY = toNonNegativeInt(p.scrollTop);
    if (scrollY != null) layoutProps.scrollY = scrollY;

    const scrollbarThumbColor = parseColor(p.scrollbarThumbColor as string | undefined);
    if (scrollbarThumbColor !== undefined) {
      layoutProps.scrollbarStyle = { fg: scrollbarThumbColor };
    }
  } else if (hasHiddenOverflow) {
    layoutProps.overflow = "hidden";
  }

  if (p.flexWrap === "wrap" || p.flexWrap === "wrap-reverse") {
    if (p.flexWrap === "wrap-reverse" && !warnedWrapReverse) {
      warnedWrapReverse = true;
      console.warn(
        "[@rezi-ui/ink-compat] flexWrap='wrap-reverse' is approximated via wrap + reverse in compat mode.",
      );
    }
    layoutProps.wrap = true;
    if (p.flexWrap === "wrap-reverse") {
      layoutProps.reverse = !(layoutProps.reverse === true);
    }
  }

  const isReverse = direction === "column-reverse" || direction === "row-reverse";
  if (isReverse) layoutProps.reverse = true;

  if (layoutProps.gap == null) layoutProps.gap = 0;
  if (accessibilityLabel) layoutProps.accessibilityLabel = accessibilityLabel;

  if (hasBorder || hasBg) {
    if (!hasBorder) {
      layoutProps.border = "none";
    }

    const border = mapBorderStyle(p.borderStyle as string | Record<string, string> | undefined);
    if (border) layoutProps.border = border;

    if (p.borderTop === false) layoutProps.borderTop = false;
    if (p.borderRight === false) layoutProps.borderRight = false;
    if (p.borderBottom === false) layoutProps.borderBottom = false;
    if (p.borderLeft === false) layoutProps.borderLeft = false;

    const style: Record<string, unknown> = {};
    const bg = parseColor(p.backgroundColor as string | undefined);
    if (bg !== undefined) style["bg"] = bg;
    if (Object.keys(style).length > 0) layoutProps.style = style;

    const explicitBorderColor = parseColor(p.borderColor as string | undefined);
    const edgeBorderColors: Record<"top" | "right" | "bottom" | "left", Rgb24 | undefined> = {
      top: parseColor(p.borderTopColor as string | undefined),
      right: parseColor(p.borderRightColor as string | undefined),
      bottom: parseColor(p.borderBottomColor as string | undefined),
      left: parseColor(p.borderLeftColor as string | undefined),
    };
    const globalBorderDim = p.borderDimColor === true;
    const edgeBorderDim: Record<"top" | "right" | "bottom" | "left", boolean> = {
      top: p.borderTopDimColor === true,
      right: p.borderRightDimColor === true,
      bottom: p.borderBottomDimColor === true,
      left: p.borderLeftDimColor === true,
    };

    const borderColor = explicitBorderColor;
    if (borderColor !== undefined) {
      layoutProps.borderStyle = {
        ...(typeof layoutProps.borderStyle === "object" && layoutProps.borderStyle !== null
          ? layoutProps.borderStyle
          : {}),
        fg: borderColor,
      };
    }

    if (globalBorderDim) {
      layoutProps.borderStyle = {
        ...(typeof layoutProps.borderStyle === "object" && layoutProps.borderStyle !== null
          ? layoutProps.borderStyle
          : {}),
        dim: true,
      };
    }

    const borderStyleSides: Record<string, unknown> = {};
    for (const side of ["top", "right", "bottom", "left"] as const) {
      const hasColorOverride = edgeBorderColors[side] != null;
      const hasDimOverride = edgeBorderDim[side];
      if (!hasColorOverride && !hasDimOverride) continue;
      const sideStyle: Record<string, unknown> = {};
      const resolvedColor = edgeBorderColors[side] ?? explicitBorderColor;
      if (resolvedColor !== undefined) sideStyle["fg"] = resolvedColor;
      if (globalBorderDim || hasDimOverride) sideStyle["dim"] = true;
      if (Object.keys(sideStyle).length > 0) {
        borderStyleSides[side] = sideStyle;
      }
    }
    if (Object.keys(borderStyleSides).length > 0) {
      layoutProps.borderStyleSides = borderStyleSides;
    }
    if (accessibilityLabel) {
      layoutProps.accessibilityLabel = accessibilityLabel;
    }

    if (isTranslationTraceEnabled()) {
      pushTranslationTrace({
        kind: "border-translate",
        nodeType: node.type,
        childCount: node.children.length,
        textSnippet: node.textContent?.slice(0, 40) ?? "",
        inkProps: {
          borderStyle: p.borderStyle ?? null,
          borderTop: p.borderTop ?? null,
          borderRight: p.borderRight ?? null,
          borderBottom: p.borderBottom ?? null,
          borderLeft: p.borderLeft ?? null,
          borderColor: p.borderColor ?? null,
          borderDimColor: p.borderDimColor ?? null,
          backgroundColor: p.backgroundColor ?? null,
          width: p.width ?? null,
          height: p.height ?? null,
        },
        reziProps: {
          border: layoutProps.border ?? null,
          borderTop: layoutProps.borderTop ?? null,
          borderRight: layoutProps.borderRight ?? null,
          borderBottom: layoutProps.borderBottom ?? null,
          borderLeft: layoutProps.borderLeft ?? null,
          borderStyle: layoutProps.borderStyle ?? null,
          borderStyleSides: layoutProps.borderStyleSides ?? null,
          style: layoutProps.style ?? null,
        },
        parsedBorderColor: borderColor ?? null,
        parsedEdgeBorderColors: edgeBorderColors,
        parsedBg: bg ?? null,
      });
    }

    if (isRow && children.length > 0) {
      const {
        gap,
        items: itemsProp,
        justify: justifyProp,
        reverse,
        wrap,
        ...boxProps
      } = layoutProps;

      const innerRowProps: Record<string, unknown> = { gap: gap ?? 0 };
      if (itemsProp) innerRowProps["items"] = itemsProp;
      if (justifyProp) innerRowProps["justify"] = justifyProp;
      if (reverse) innerRowProps["reverse"] = reverse;
      if (wrap) innerRowProps["wrap"] = wrap;

      return ui.box(boxProps as Parameters<typeof ui.box>[0], [
        ui.row(innerRowProps as Parameters<typeof ui.row>[0], children),
      ]);
    }

    return ui.box(layoutProps as Parameters<typeof ui.box>[0], children);
  }

  if (isRow) {
    return ui.row(layoutProps as Parameters<typeof ui.row>[0], children);
  }

  return ui.column(layoutProps as Parameters<typeof ui.column>[0], children);
}

function translateText(node: InkHostNode): VNode {
  const p = node.props as TextNodeProps;

  const style: TextStyleMap = {};
  const fg = parseColor(p.color as string | undefined);
  if (fg !== undefined) style.fg = fg;
  const bg = parseColor(p.backgroundColor as string | undefined);
  if (bg !== undefined) style.bg = bg;
  if (p.bold) style.bold = true;
  if (p.italic) style.italic = true;
  if (p.underline) style.underline = true;
  if (p.strikethrough) style.strikethrough = true;
  if (p.dimColor) style.dim = true;
  if (p.inverse) style.inverse = true;

  const { spans, isSingleSpan, fullText } = flattenTextChildren(node, style);

  const textProps: Record<string, unknown> = {};
  if (Object.keys(style).length > 0) textProps["style"] = style;
  const accessibilityLabel = readAccessibilityLabel(p);
  if (accessibilityLabel) {
    textProps["accessibilityLabel"] = accessibilityLabel;
  }

  const inkWrap = (p.wrap as string | undefined) ?? "wrap";
  if (inkWrap === "wrap") {
    textProps["wrap"] = true;
  } else if (inkWrap === "truncate" || inkWrap === "truncate-end") {
    textProps["textOverflow"] = "ellipsis";
  } else if (inkWrap === "truncate-middle") {
    textProps["textOverflow"] = "middle";
  } else if (inkWrap === "truncate-start") {
    textProps["textOverflow"] = "start";
  }

  if (fullText.includes("\n")) {
    return translateMultilineRichText(
      spans,
      accessibilityLabel ? { accessibilityLabel } : undefined,
    );
  }

  if (isSingleSpan) {
    return Object.keys(textProps).length > 0 ? ui.text(fullText, textProps) : ui.text(fullText);
  }

  return ui.richText(spans.map((span) => ({ text: span.text, style: span.style })));
}

function translateMultilineRichText(
  spans: readonly TextSpan[],
  rootProps?: Record<string, unknown>,
): VNode {
  const lines: TextSpan[][] = [[]];

  for (const span of spans) {
    if (span.text.length === 0) continue;
    const parts = span.text.split("\n");
    for (let i = 0; i < parts.length; i += 1) {
      const part = parts[i] ?? "";
      if (part.length > 0) {
        lines[lines.length - 1]!.push({ text: part, style: span.style });
      }
      if (i < parts.length - 1) {
        lines.push([]);
      }
    }
  }

  const lineNodes = lines.map((line) => {
    if (line.length === 0) return ui.text("");
    if (line.length === 1) {
      const only = line[0]!;
      return Object.keys(only.style).length > 0
        ? ui.text(only.text, { style: only.style })
        : ui.text(only.text);
    }
    return ui.richText(line.map((span) => ({ text: span.text, style: span.style })));
  });

  const hasRootProps = rootProps != null && Object.keys(rootProps).length > 0;
  if (lineNodes.length === 1) {
    const only = lineNodes[0]!;
    if (!hasRootProps) return only;
    return ui.column({ gap: 0, ...(rootProps ?? {}) }, [only]);
  }
  return ui.column({ gap: 0, ...(rootProps ?? {}) }, lineNodes);
}

function flattenTextChildren(
  node: InkHostNode,
  parentStyle: TextStyleMap,
): { spans: TextSpan[]; isSingleSpan: boolean; fullText: string } {
  const spans: TextSpan[] = [];
  let fullText = "";

  for (const child of node.children) {
    if (child.textContent != null) {
      const parsed = parseAnsiText(child.textContent, parentStyle);
      spans.push(...parsed.spans);
      fullText += parsed.fullText;
      continue;
    }

    if (child.type === "ink-text") {
      const cp = child.props as TextNodeProps;
      const childStyle: TextStyleMap = { ...parentStyle };

      const fg = parseColor(cp.color as string | undefined);
      if (fg !== undefined) childStyle.fg = fg;
      const bg = parseColor(cp.backgroundColor as string | undefined);
      if (bg !== undefined) childStyle.bg = bg;
      if (cp.bold) childStyle.bold = true;
      if (cp.italic) childStyle.italic = true;
      if (cp.underline) childStyle.underline = true;
      if (cp.strikethrough) childStyle.strikethrough = true;
      if (cp.dimColor) childStyle.dim = true;
      if (cp.inverse) childStyle.inverse = true;

      const nested = flattenTextChildren(child, childStyle);
      spans.push(...nested.spans);
      fullText += nested.fullText;
      continue;
    }

    const virtualProps = child.props as VirtualNodeProps;
    if (child.type === "ink-virtual" && virtualProps.__inkType === "newline") {
      const count = virtualProps.count;
      const repeatCount = count == null ? 1 : Math.max(0, Math.trunc(count));
      const newlines = "\n".repeat(repeatCount);
      spans.push({ text: newlines, style: { ...parentStyle } });
      fullText += newlines;
    }
  }

  if (spans.length === 0) {
    return { spans, isSingleSpan: true, fullText: "" };
  }

  const allSameStyle = spans.every((span) => stylesEqual(span.style, parentStyle));
  return { spans, isSingleSpan: allSameStyle, fullText };
}

function stylesEqual(a: TextStyleMap, b: TextStyleMap): boolean {
  const keysA = Object.keys(a).sort();
  const keysB = Object.keys(b).sort();
  if (keysA.length !== keysB.length) return false;

  for (let i = 0; i < keysA.length; i += 1) {
    const key = keysA[i]!;
    if (key !== keysB[i]) return false;
    if (JSON.stringify(a[key]) !== JSON.stringify(b[key])) return false;
  }

  return true;
}

function parseAnsiText(
  text: string,
  baseStyle: TextStyleMap,
): { spans: TextSpan[]; fullText: string } {
  if (text.length === 0) {
    return { spans: [], fullText: "" };
  }

  const sanitized = sanitizeAnsiInput(text);
  if (sanitized.length === 0) {
    return { spans: [], fullText: "" };
  }

  const spans: TextSpan[] = [];
  let fullText = "";
  let lastIndex = 0;
  let hadAnsiMatch = false;
  const activeStyle: TextStyleMap = { ...baseStyle };

  for (const match of sanitized.matchAll(ANSI_SGR_REGEX)) {
    const index = match.index;
    if (index == null) continue;
    hadAnsiMatch = true;

    const plain = sanitized.slice(lastIndex, index);
    if (plain.length > 0) {
      appendStyledText(spans, plain, activeStyle);
      fullText += plain;
    }

    const codes = parseSgrCodes(match[1] ?? "");
    applySgrCodes(codes, activeStyle, baseStyle);

    lastIndex = index + match[0].length;
  }

  const trailing = sanitized.slice(lastIndex);
  if (trailing.length > 0) {
    appendStyledText(spans, trailing, activeStyle);
    fullText += trailing;
  }

  if (spans.length === 0 && !hadAnsiMatch) {
    appendStyledText(spans, sanitized, baseStyle);
    fullText = sanitized;
  }

  return { spans, fullText };
}

function sanitizeAnsiInput(input: string): string {
  let output = "";
  let index = 0;

  while (index < input.length) {
    const codePoint = input.codePointAt(index);
    if (codePoint == null) break;
    const char = String.fromCodePoint(codePoint);
    const width = char.length;

    if (char !== "\u001b") {
      if (codePoint === 0x09 || codePoint === 0x0a || codePoint === 0x0d || codePoint >= 0x20) {
        output += char;
      }
      index += width;
      continue;
    }

    const next = input[index + 1];
    if (next === "[") {
      const csiEnd = findCsiEndIndex(input, index + 2);
      if (csiEnd === -1) break;
      if (input[csiEnd] === "m") {
        output += input.slice(index, csiEnd + 1);
      }
      index = csiEnd + 1;
      continue;
    }

    if (next === "]") {
      const oscEnd = findOscEndIndex(input, index + 2);
      if (oscEnd === -1) break;
      output += input.slice(index, oscEnd);
      index = oscEnd;
      continue;
    }

    // Drop unsupported escape sequence starter.
    index += next == null ? 1 : 2;
  }

  return output;
}

function findCsiEndIndex(input: string, start: number): number {
  for (let index = start; index < input.length; index += 1) {
    const code = input.charCodeAt(index);
    if (code >= 0x40 && code <= 0x7e) {
      return index;
    }
  }
  return -1;
}

function findOscEndIndex(input: string, start: number): number {
  for (let index = start; index < input.length; index += 1) {
    const code = input.charCodeAt(index);
    if (code === 0x07) {
      return index + 1;
    }
    if (code === 0x1b && input[index + 1] === "\\") {
      return index + 2;
    }
  }
  return -1;
}

function appendStyledText(spans: TextSpan[], text: string, style: TextStyleMap): void {
  if (text.length === 0) return;

  const styleCopy = { ...style };
  const prev = spans[spans.length - 1];
  if (prev && stylesEqual(prev.style, styleCopy)) {
    prev.text += text;
    return;
  }

  spans.push({ text, style: styleCopy });
}

function parseSgrCodes(raw: string): number[] {
  if (raw.length === 0) return [0];

  const out: number[] = [];
  // SGR also supports colon-delimited parameters.
  // Normalize known extended color forms first to avoid ambiguity with
  // semicolon SGR sequences where additional trailing codes are valid.
  const normalizedRaw = raw
    // 38:2::R:G:B / 48:2::R:G:B (omitted color-space id)
    .replace(/([34]8):2::(\d{1,3}):(\d{1,3}):(\d{1,3})/g, "$1;2;$2;$3;$4")
    // 38:2:CS:R:G:B / 48:2:CS:R:G:B (explicit color-space id; ignore CS)
    .replace(/([34]8):2:\d{1,3}:(\d{1,3}):(\d{1,3}):(\d{1,3})/g, "$1;2;$2;$3;$4")
    // 38:5:IDX / 48:5:IDX
    .replace(/([34]8):5:(\d{1,3})/g, "$1;5;$2")
    // Fallback: remaining colon delimiters behave like semicolons.
    .replaceAll(":", ";");
  for (const part of normalizedRaw.split(";")) {
    if (part.length === 0) {
      out.push(0);
      continue;
    }

    const parsed = Number.parseInt(part, 10);
    if (Number.isFinite(parsed)) out.push(parsed);
  }

  return out.length > 0 ? out : [0];
}

function applySgrCodes(
  codes: readonly number[],
  activeStyle: TextStyleMap,
  baseStyle: TextStyleMap,
): void {
  const normalizedCodes = codes.length > 0 ? codes : [0];

  for (let index = 0; index < normalizedCodes.length; index += 1) {
    const code = normalizedCodes[index]!;

    if (code === 0) {
      resetSgrStyle(activeStyle, baseStyle);
      continue;
    }

    if (code === 1) {
      activeStyle.bold = true;
      continue;
    }
    if (code === 2) {
      activeStyle.dim = true;
      continue;
    }
    if (code === 3) {
      activeStyle.italic = true;
      continue;
    }
    if (code === 4) {
      activeStyle.underline = true;
      continue;
    }
    if (code === 7) {
      activeStyle.inverse = true;
      continue;
    }
    if (code === 9) {
      activeStyle.strikethrough = true;
      continue;
    }

    if (code === 22) {
      delete activeStyle.bold;
      delete activeStyle.dim;
      continue;
    }
    if (code === 23) {
      delete activeStyle.italic;
      continue;
    }
    if (code === 24) {
      delete activeStyle.underline;
      continue;
    }
    if (code === 27) {
      delete activeStyle.inverse;
      continue;
    }
    if (code === 29) {
      delete activeStyle.strikethrough;
      continue;
    }

    if (code === 39) {
      resetSgrColor("fg", activeStyle, baseStyle);
      continue;
    }
    if (code === 49) {
      resetSgrColor("bg", activeStyle, baseStyle);
      continue;
    }

    if (code >= 30 && code <= 37) {
      activeStyle.fg = ANSI_16_PALETTE[code - 30]!;
      continue;
    }
    if (code >= 40 && code <= 47) {
      activeStyle.bg = ANSI_16_PALETTE[code - 40]!;
      continue;
    }
    if (code >= 90 && code <= 97) {
      activeStyle.fg = ANSI_16_PALETTE[code - 90 + 8]!;
      continue;
    }
    if (code >= 100 && code <= 107) {
      activeStyle.bg = ANSI_16_PALETTE[code - 100 + 8]!;
      continue;
    }

    if (code === 38 || code === 48) {
      index = applyExtendedColor(
        code === 38 ? "fg" : "bg",
        normalizedCodes,
        index,
        activeStyle,
        baseStyle,
      );
    }
  }
}

function applyExtendedColor(
  channel: "fg" | "bg",
  codes: readonly number[],
  index: number,
  activeStyle: TextStyleMap,
  baseStyle: TextStyleMap,
): number {
  const mode = codes[index + 1];
  if (mode === 5) {
    const colorIndex = codes[index + 2];
    if (
      typeof colorIndex === "number" &&
      Number.isInteger(colorIndex) &&
      colorIndex >= 0 &&
      colorIndex <= 255
    ) {
      activeStyle[channel] = decodeAnsi256Color(colorIndex);
    }
    return index + 2;
  }

  if (mode === 2) {
    // Canonical: 38;2;R;G;B / 48;2;R;G;B
    const directR = codes[index + 2];
    const directG = codes[index + 3];
    const directB = codes[index + 4];
    if (isByte(directR) && isByte(directG) && isByte(directB)) {
      activeStyle[channel] = rgb(directR, directG, directB);
      return index + 4;
    }

    // Colon form may include an optional color-space slot:
    // 38:2::R:G:B -> normalized to 38;2;0;R;G;B
    const maybeColorSpace = codes[index + 2];
    const r = codes[index + 3];
    const g = codes[index + 4];
    const b = codes[index + 5];
    if (
      (maybeColorSpace == null ||
        (typeof maybeColorSpace === "number" &&
          Number.isInteger(maybeColorSpace) &&
          maybeColorSpace >= 0)) &&
      isByte(r) &&
      isByte(g) &&
      isByte(b)
    ) {
      activeStyle[channel] = rgb(r, g, b);
      return index + 5;
    }

    return index + 4;
  }

  if (mode === 0) {
    resetSgrColor(channel, activeStyle, baseStyle);
    return index + 1;
  }

  return index;
}

function resetSgrStyle(activeStyle: TextStyleMap, baseStyle: TextStyleMap): void {
  for (const key of Object.keys(activeStyle)) {
    delete activeStyle[key];
  }
  Object.assign(activeStyle, baseStyle);
}

function resetSgrColor(
  channel: "fg" | "bg",
  activeStyle: TextStyleMap,
  baseStyle: TextStyleMap,
): void {
  const inheritedColor = baseStyle[channel];
  if (inheritedColor !== undefined) {
    activeStyle[channel] = inheritedColor;
    return;
  }
  delete activeStyle[channel];
}

function decodeAnsi256Color(index: number): Rgb24 {
  if (index < 16) return ANSI_16_PALETTE[index]!;

  if (index <= 231) {
    const offset = index - 16;
    const rLevel = Math.floor(offset / 36);
    const gLevel = Math.floor((offset % 36) / 6);
    const bLevel = offset % 6;

    const toChannel = (level: number): number => (level === 0 ? 0 : 55 + level * 40);
    return rgb(toChannel(rLevel), toChannel(gLevel), toChannel(bLevel));
  }

  const gray = 8 + (index - 232) * 10;
  return rgb(gray, gray, gray);
}

function isByte(value: unknown): value is number {
  return typeof value === "number" && Number.isInteger(value) && value >= 0 && value <= 255;
}

function translateChildren(node: InkHostNode, context: TranslateContext): VNode | null {
  const children = node.children
    .map((child) => translateNode(child, context))
    .filter(Boolean) as VNode[];
  if (children.length === 0) return null;
  if (children.length === 1) return children[0]!;
  return ui.column({ gap: 0 }, children);
}
