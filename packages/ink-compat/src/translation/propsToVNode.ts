import { rgb, ui, type Rgb, type VNode } from "@rezi-ui/core";

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
  fg?: Rgb;
  bg?: Rgb;
  bold?: boolean;
  italic?: boolean;
  underline?: boolean;
  strikethrough?: boolean;
  dim?: boolean;
  inverse?: boolean;
  [key: string]: unknown;
}

type LayoutDirection = "row" | "column";

interface TranslateContext {
  parentDirection: LayoutDirection;
  parentMainDefinite: boolean;
  isRoot: boolean;
}

let warnedWrapReverse = false;

const ANSI_SGR_REGEX = /\u001b\[([0-9;]*)m/g;

function toNonNegativeInt(value: unknown): number | undefined {
  if (typeof value !== "number" || !Number.isFinite(value)) return undefined;
  return Math.max(0, Math.trunc(value));
}

const ANSI_16_PALETTE: readonly Rgb[] = [
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
export function translateTree(container: InkHostContainer): VNode {
  const rootContext: TranslateContext = {
    parentDirection: "column",
    parentMainDefinite: true,
    isRoot: true,
  };
  const children = container.children
    .map((child) => translateNode(child, rootContext))
    .filter(Boolean) as VNode[];
  if (children.length === 0) return ui.text("");
  if (children.length === 1) return children[0]!;
  return ui.column({ gap: 0 }, children);
}

function translateNode(
  node: InkHostNode,
  context: TranslateContext = { parentDirection: "column", parentMainDefinite: true, isRoot: false },
): VNode | null {
  if (node.textContent != null) {
    return translateRawTextContent(node.textContent);
  }

  if (node.type === "ink-virtual") {
    const inkType = (node.props as any)["__inkType"];
    if (inkType === "spacer") {
      return ui.spacer({ flex: 1 });
    }
    if (inkType === "newline") {
      const count = (node.props as any)["count"] as number | undefined;
      return ui.text("\n".repeat(Math.max(1, count ?? 1)));
    }
    if (inkType === "transform" && typeof (node.props as any)["__inkTransform"] === "function") {
      return translateTransform(node, context);
    }
  }

  switch (node.type) {
    case "ink-box":
      return translateBox(node, context);
    case "ink-text":
      return translateText(node);
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

function translateTransform(node: InkHostNode, context: TranslateContext): VNode {
  const transform = (node.props as any)["__inkTransform"] as (
    line: string,
    index: number,
  ) => string;
  const children = node.children
    .map((child) => translateNode(child, context))
    .filter(Boolean) as VNode[];
  const raw = children.map((child) => vnodeToText(child as any)).join("");
  const transformed = raw
    .split("\n")
    .map((line, index) => transform(line, index))
    .join("\n");
  return ui.text(transformed);
}

function vnodeToText(node: any): string {
  if (!node || typeof node !== "object") return "";
  if (node.kind === "text") return typeof node.text === "string" ? node.text : "";
  if (node.kind === "richText") {
    const spans = node.props?.spans;
    if (!Array.isArray(spans)) return "";
    return spans.map((span: any) => (typeof span?.text === "string" ? span.text : "")).join("");
  }

  if (!Array.isArray(node.children)) return "";
  return node.children.map((child: any) => vnodeToText(child)).join("");
}

function translateBox(node: InkHostNode, context: TranslateContext): VNode | null {
  const p = node.props as any;
  const direction = (p.flexDirection as string | undefined) ?? "column";
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
  const hasGrowFromDefiniteParent =
    context.parentMainDefinite && typeof p.flexGrow === "number" && p.flexGrow > 0;
  const rootWillBeViewportHeightCoerced =
    context.isRoot && !isRow && !hasFixedHeight && (hasScrollOverflow || hasHiddenOverflow);

  // Propagate definiteness through same-direction chains: if a column's parent
  // is a definite-height column, the child's height will also be resolved by the
  // layout engine, making it definite for its own children.
  const inheritsMainDefinite =
    context.parentMainDefinite &&
    context.parentDirection === (isRow ? "row" : "column");

  const nodeMainDefinite =
    isRow
      ? hasFixedWidth || hasGrowFromDefiniteParent || inheritsMainDefinite
      : hasFixedHeight || hasGrowFromDefiniteParent || rootWillBeViewportHeightCoerced || inheritsMainDefinite;

  const childContext: TranslateContext = {
    parentDirection: isRow ? "row" : "column",
    parentMainDefinite: nodeMainDefinite,
    isRoot: false,
  };

  if (p.display === "none") return null;

  if (p.__inkStatic === true) {
    const children = node.children
      .map((child) => translateNode(child, childContext))
      .filter(Boolean) as VNode[];
    return children.length > 0 ? ui.column({ gap: 0 }, children) : null;
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

  const layoutProps: any = {};

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

  // Ink supports percentage widths (e.g. "100%") via Yoga; Rezi uses integers.
  // Skip string/percentage values — the default fill behavior handles them.
  if (typeof p.width === "number") layoutProps.width = p.width;
  else if (p.width != null && isTranslationTraceEnabled()) {
    pushTranslationTrace({
      kind: "dimension-skip",
      prop: "width",
      value: String(p.width),
      nodeType: node.type,
      childCount: node.children.length,
      textSnippet: node.textContent?.slice(0, 40) ?? "",
    });
  }
  if (typeof p.height === "number") layoutProps.height = p.height;
  else if (p.height != null && isTranslationTraceEnabled()) {
    pushTranslationTrace({
      kind: "dimension-skip",
      prop: "height",
      value: String(p.height),
      nodeType: node.type,
      childCount: node.children.length,
    });
  }
  if (typeof p.minWidth === "number") layoutProps.minWidth = p.minWidth;
  if (typeof p.minHeight === "number") layoutProps.minHeight = p.minHeight;
  if (typeof p.maxWidth === "number") layoutProps.maxWidth = p.maxWidth;
  if (typeof p.maxHeight === "number") layoutProps.maxHeight = p.maxHeight;

  if (p.flexGrow != null) layoutProps.flex = p.flexGrow;
  if (p.flexShrink != null) {
    layoutProps.flexShrink = p.flexShrink;
  } else {
    layoutProps.flexShrink = 1;
  }
  if (p.flexBasis != null) layoutProps.flexBasis = p.flexBasis;

  // Ink/Yoga defaults to alignItems: "stretch". For columns, this stretches
  // children's width (cross-axis) to match the column, which is essential for
  // elements like HorizontalLine that have no intrinsic width. For rows, the
  // stretch applies to height (cross-axis) which inflates Rezi's measurement
  // and should be skipped — the practical difference is negligible.
  const items = mapAlign(p.alignItems as string | undefined) ?? (isRow ? undefined : "stretch");
  if (items) layoutProps.items = items;

  const justify = mapJustify(p.justifyContent as string | undefined);
  if (justify) layoutProps.justify = justify;

  const alignSelf = p.alignSelf === "auto" ? "auto" : mapAlign(p.alignSelf as string | undefined);
  if (alignSelf) layoutProps.alignSelf = alignSelf;

  if (hasScrollOverflow) {
    layoutProps.overflow = "scroll";

    const scrollX = toNonNegativeInt(p.scrollLeft);
    if (scrollX != null) layoutProps.scrollX = scrollX;

    const scrollY = toNonNegativeInt(p.scrollTop);
    if (scrollY != null) layoutProps.scrollY = scrollY;

    const scrollbarThumbColor = parseColor(p.scrollbarThumbColor as string | undefined);
    if (scrollbarThumbColor) {
      layoutProps.scrollbarStyle = { fg: scrollbarThumbColor };
    }
  } else if (hasHiddenOverflow) {
    layoutProps.overflow = "hidden";
  }

  if (p.flexWrap === "wrap" || p.flexWrap === "wrap-reverse") {
    if (p.flexWrap === "wrap-reverse" && !warnedWrapReverse) {
      warnedWrapReverse = true;
      console.warn(
        "[@rezi-ui/ink-compat] flexWrap='wrap-reverse' is not supported by Rezi. Falling back to 'wrap'.",
      );
    }
    layoutProps.wrap = true;
  }

  const isReverse = direction === "column-reverse" || direction === "row-reverse";
  if (isReverse) layoutProps.reverse = true;

  if (layoutProps.gap == null) layoutProps.gap = 0;

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

    const style: any = {};
    const bg = parseColor(p.backgroundColor as string | undefined);
    if (bg) style.bg = bg;
    if (Object.keys(style).length > 0) layoutProps.style = style;

    const borderColor = parseColor(p.borderColor as string | undefined);
    if (borderColor) {
      layoutProps.borderStyle = { fg: borderColor };
    }
    if (p.borderDimColor === true) {
      layoutProps.borderStyle = {
        ...(typeof layoutProps.borderStyle === "object" && layoutProps.borderStyle !== null
          ? layoutProps.borderStyle
          : {}),
        dim: true,
      };
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
          style: layoutProps.style ?? null,
        },
        parsedBorderColor: borderColor ?? null,
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

      const innerRowProps: any = { gap: gap ?? 0 };
      if (itemsProp) innerRowProps.items = itemsProp;
      if (justifyProp) innerRowProps.justify = justifyProp;
      if (reverse) innerRowProps.reverse = reverse;
      if (wrap) innerRowProps.wrap = wrap;

      return ui.box(boxProps, [ui.row(innerRowProps, children)]);
    }

    return ui.box(layoutProps, children);
  }

  if (isRow) {
    return ui.row(layoutProps, children);
  }

  return ui.column(layoutProps, children);
}

function translateText(node: InkHostNode): VNode {
  const p = node.props as any;

  const style: any = {};
  const fg = parseColor(p.color as string | undefined);
  if (fg) style.fg = fg;
  const bg = parseColor(p.backgroundColor as string | undefined);
  if (bg) style.bg = bg;
  if (p.bold) style.bold = true;
  if (p.italic) style.italic = true;
  if (p.underline) style.underline = true;
  if (p.strikethrough) style.strikethrough = true;
  if (p.dimColor) style.dim = true;
  if (p.inverse) style.inverse = true;

  const { spans, isSingleSpan, fullText } = flattenTextChildren(node, style);

  const textProps: any = {};
  if (Object.keys(style).length > 0) textProps.style = style;

  const inkWrap = (p.wrap as string | undefined) ?? "wrap";
  if (inkWrap === "wrap") {
    textProps.wrap = true;
  } else if (inkWrap === "truncate" || inkWrap === "truncate-end") {
    textProps.textOverflow = "ellipsis";
  } else if (inkWrap === "truncate-middle") {
    textProps.textOverflow = "middle";
  } else if (inkWrap === "truncate-start") {
    textProps.textOverflow = "start";
  }

  if (fullText.includes("\n")) {
    return translateMultilineRichText(spans);
  }

  if (isSingleSpan) {
    return Object.keys(textProps).length > 0 ? ui.text(fullText, textProps) : ui.text(fullText);
  }

  return ui.richText(spans.map((span) => ({ text: span.text, style: span.style })));
}

function translateMultilineRichText(spans: readonly TextSpan[]): VNode {
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

  if (lineNodes.length === 1) return lineNodes[0]!;
  return ui.column({ gap: 0 }, lineNodes);
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
      const cp = child.props as any;
      const childStyle: any = { ...parentStyle };

      const fg = parseColor(cp.color as string | undefined);
      if (fg) childStyle.fg = fg;
      const bg = parseColor(cp.backgroundColor as string | undefined);
      if (bg) childStyle.bg = bg;
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

    if (child.type === "ink-virtual" && (child.props as any)["__inkType"] === "newline") {
      const count = (child.props as any)["count"] as number | undefined;
      const newlines = "\n".repeat(Math.max(1, count ?? 1));
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

  const spans: TextSpan[] = [];
  let fullText = "";
  let lastIndex = 0;
  let hadAnsiMatch = false;
  const activeStyle: TextStyleMap = { ...baseStyle };

  for (const match of text.matchAll(ANSI_SGR_REGEX)) {
    const index = match.index;
    if (index == null) continue;
    hadAnsiMatch = true;

    const plain = text.slice(lastIndex, index);
    if (plain.length > 0) {
      appendStyledText(spans, plain, activeStyle);
      fullText += plain;
    }

    const codes = parseSgrCodes(match[1] ?? "");
    applySgrCodes(codes, activeStyle, baseStyle);

    lastIndex = index + match[0].length;
  }

  const trailing = text.slice(lastIndex);
  if (trailing.length > 0) {
    appendStyledText(spans, trailing, activeStyle);
    fullText += trailing;
  }

  if (spans.length === 0 && !hadAnsiMatch) {
    appendStyledText(spans, text, baseStyle);
    fullText = text;
  }

  return { spans, fullText };
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
  for (const part of raw.split(";")) {
    if (part.length === 0) {
      out.push(0);
      continue;
    }

    const parsed = Number.parseInt(part, 10);
    if (Number.isFinite(parsed)) out.push(parsed);
  }

  return out.length > 0 ? out : [0];
}

function applySgrCodes(codes: readonly number[], activeStyle: TextStyleMap, baseStyle: TextStyleMap): void {
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
    if (typeof colorIndex === "number" && Number.isInteger(colorIndex) && colorIndex >= 0 && colorIndex <= 255) {
      activeStyle[channel] = decodeAnsi256Color(colorIndex);
    }
    return index + 2;
  }

  if (mode === 2) {
    const r = codes[index + 2];
    const g = codes[index + 3];
    const b = codes[index + 4];
    if (isByte(r) && isByte(g) && isByte(b)) {
      activeStyle[channel] = rgb(r, g, b);
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

function resetSgrColor(channel: "fg" | "bg", activeStyle: TextStyleMap, baseStyle: TextStyleMap): void {
  const inheritedColor = baseStyle[channel];
  if (inheritedColor !== undefined) {
    activeStyle[channel] = inheritedColor;
    return;
  }
  delete activeStyle[channel];
}

function decodeAnsi256Color(index: number): Rgb {
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
