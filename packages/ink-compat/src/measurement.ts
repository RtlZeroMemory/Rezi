import type { HostElement, HostLayoutRect, HostNode, HostRoot } from "./reconciler/types.js";
import { ResizeObserverEntry } from "./resizeObserver.js";
import type { DOMElement } from "./types.js";

type CoreRect = Readonly<{ x: number; y: number; w: number; h: number }>;

type ResizeObserverLike = Readonly<{
  internalTrigger: (entries: ResizeObserverEntry[]) => void;
}>;
type MeasurementProps = Readonly<{
  overflow?: unknown;
  overflowX?: unknown;
  overflowY?: unknown;
  borderStyle?: unknown;
  border?: unknown;
  borderTop?: unknown;
  borderRight?: unknown;
  borderBottom?: unknown;
  borderLeft?: unknown;
  padding?: unknown;
  paddingY?: unknown;
  paddingTop?: unknown;
  paddingBottom?: unknown;
  scrollTop?: unknown;
  scrollLeft?: unknown;
  flexDirection?: unknown;
  height?: unknown;
}>;

const ZERO_LAYOUT: HostLayoutRect = Object.freeze({ x: 0, y: 0, width: 0, height: 0 });
const ZERO_INSETS = Object.freeze({ top: 0, right: 0, bottom: 0, left: 0 });

function toLayout(rect: CoreRect | undefined): HostLayoutRect {
  if (!rect) return ZERO_LAYOUT;
  const width = Number.isFinite(rect.w) ? Math.max(0, rect.w) : 0;
  const height = Number.isFinite(rect.h) ? Math.max(0, rect.h) : 0;
  return {
    x: Number.isFinite(rect.x) ? rect.x : 0,
    y: Number.isFinite(rect.y) ? rect.y : 0,
    width,
    height,
  };
}

function readLayout(node: DOMElement): HostLayoutRect {
  const layout = (node as HostElement).internal_layout;
  return layout ?? ZERO_LAYOUT;
}

function coerceNonNegativeNumber(v: unknown): number | undefined {
  if (typeof v === "number" && Number.isFinite(v) && v >= 0) return v;
  if (typeof v === "string") {
    const n = Number(v);
    if (Number.isFinite(n) && n >= 0) return n;
  }
  return undefined;
}

function readScrollOffset(v: unknown): number {
  if (typeof v !== "number" || !Number.isFinite(v) || v <= 0) return 0;
  return v;
}

function normalizeOverflow(v: unknown): "visible" | "hidden" | "scroll" {
  return v === "hidden" || v === "scroll" ? v : "visible";
}

function readOverflowFromProps(props: MeasurementProps): Readonly<{
  overflow: "visible" | "hidden" | "scroll";
  overflowX: "visible" | "hidden" | "scroll";
  overflowY: "visible" | "hidden" | "scroll";
}> {
  const overflow = normalizeOverflow(props.overflow);
  const overflowX = normalizeOverflow(props.overflowX ?? overflow);
  const overflowY = normalizeOverflow(props.overflowY ?? overflow);
  return { overflow, overflowX, overflowY };
}

function readBorderInsets(props: MeasurementProps): Readonly<{
  top: number;
  right: number;
  bottom: number;
  left: number;
}> {
  const hasAnyBorder = props.borderStyle !== undefined || props.border !== undefined;
  const borderStyle = props.borderStyle ?? props.border;
  const hasBorder = hasAnyBorder && borderStyle !== "none";

  if (!hasBorder) return ZERO_INSETS;

  const top = typeof props.borderTop === "boolean" ? props.borderTop : true;
  const right = typeof props.borderRight === "boolean" ? props.borderRight : true;
  const bottom = typeof props.borderBottom === "boolean" ? props.borderBottom : true;
  const left = typeof props.borderLeft === "boolean" ? props.borderLeft : true;
  return {
    top: top ? 1 : 0,
    right: right ? 1 : 0,
    bottom: bottom ? 1 : 0,
    left: left ? 1 : 0,
  };
}

function resolveVerticalInsets(props: MeasurementProps): number {
  const padding = coerceNonNegativeNumber(props.padding) ?? 0;
  const paddingY = coerceNonNegativeNumber(props.paddingY) ?? padding;
  const paddingTop = coerceNonNegativeNumber(props.paddingTop) ?? paddingY;
  const paddingBottom = coerceNonNegativeNumber(props.paddingBottom) ?? paddingY;
  const border = readBorderInsets(props);
  return paddingTop + paddingBottom + border.top + border.bottom;
}

function estimateTextNodeHeight(node: HostElement): number {
  let lines = 0;
  for (const child of node.children) {
    if (child.kind !== "text") continue;
    lines += Math.max(1, child.text.split("\n").length);
  }
  return Math.max(1, lines);
}

function estimateNodeHeight(node: HostNode): number {
  if (node.kind === "text") return Math.max(1, node.text.split("\n").length);

  const props = node.props as MeasurementProps;
  const explicitHeight = coerceNonNegativeNumber(props.height);
  if (explicitHeight !== undefined) return explicitHeight;

  if (node.type === "ink-spacer") return 1;
  if (node.type === "ink-text" || node.type === "ink-virtual-text")
    return estimateTextNodeHeight(node);

  const direction = props.flexDirection;
  const isColumn = direction === "column" || direction === "column-reverse";
  const insets = resolveVerticalInsets(props);

  if (node.children.length === 0) return insets;

  if (isColumn) {
    let total = insets;
    for (const child of node.children) {
      total += estimateNodeHeight(child);
    }
    return total;
  }

  let max = 0;
  for (const child of node.children) {
    const next = estimateNodeHeight(child);
    if (next > max) max = next;
  }
  return insets + max;
}

function estimateScrollHeight(node: HostElement): number {
  const props = node.props as MeasurementProps;
  if (node.children.length === 0) return resolveVerticalInsets(props);

  const direction = props.flexDirection;
  const isColumn = direction === "column" || direction === "column-reverse";
  const insets = resolveVerticalInsets(props);

  if (isColumn) {
    let total = insets;
    for (const child of node.children) {
      total += estimateNodeHeight(child);
    }
    return total;
  }

  let max = 0;
  for (const child of node.children) {
    const next = estimateNodeHeight(child);
    if (next > max) max = next;
  }
  return insets + max;
}

export function measureElementFromLayout(
  node: DOMElement,
): Readonly<{ width: number; height: number }> {
  const layout = readLayout(node);
  return { width: layout.width, height: layout.height };
}

export function getBoundingBox(node: DOMElement): Readonly<{
  x: number;
  y: number;
  width: number;
  height: number;
}> {
  const layout = readLayout(node);
  return {
    x: layout.x,
    y: layout.y,
    width: layout.width,
    height: layout.height,
  };
}

export function getInnerHeight(node: DOMElement): number {
  const element = node as HostElement;
  const scrollState = element.internal_scrollState;
  if (scrollState) return scrollState.clientHeight;

  const layout = readLayout(node);
  const border = readBorderInsets(element.props as MeasurementProps);
  return Math.max(0, layout.height - border.top - border.bottom);
}

export function getScrollHeight(node: DOMElement): number {
  const st = (node as HostElement).internal_scrollState;
  return st?.scrollHeight ?? 0;
}

export function getScrollWidth(node: DOMElement): number {
  const st = (node as HostElement).internal_scrollState;
  return st?.scrollWidth ?? 0;
}

function collectObserverEntry(
  batches: Map<ResizeObserverLike, ResizeObserverEntry[]>,
  observer: ResizeObserverLike,
  entry: ResizeObserverEntry,
): void {
  const prev = batches.get(observer);
  if (prev) {
    prev.push(entry);
    return;
  }
  batches.set(observer, [entry]);
}

function updateNodeLayout(
  node: HostElement,
  idRects: ReadonlyMap<string, CoreRect>,
  observerBatches: Map<ResizeObserverLike, ResizeObserverEntry[]>,
): HostLayoutRect {
  const props = node.props as MeasurementProps;
  let layout = node.type === "ink-box" ? toLayout(idRects.get(node.internal_id)) : ZERO_LAYOUT;

  let haveChildBounds = false;
  let minChildX = 0;
  let minChildY = 0;
  let maxChildX = 0;
  let maxChildY = 0;

  const borderInsets = readBorderInsets(props);
  const contentOriginX = layout.x + borderInsets.left;
  const contentOriginY = layout.y + borderInsets.top;
  let maxRelRight = 0;
  let maxRelBottom = 0;

  for (const child of node.children) {
    if (child.kind !== "element") continue;

    const childRect = updateNodeLayout(child, idRects, observerBatches);

    if (!haveChildBounds) {
      haveChildBounds = true;
      minChildX = childRect.x;
      minChildY = childRect.y;
      maxChildX = childRect.x + childRect.width;
      maxChildY = childRect.y + childRect.height;
    } else {
      minChildX = Math.min(minChildX, childRect.x);
      minChildY = Math.min(minChildY, childRect.y);
      maxChildX = Math.max(maxChildX, childRect.x + childRect.width);
      maxChildY = Math.max(maxChildY, childRect.y + childRect.height);
    }

    const relRight = childRect.x - contentOriginX + childRect.width;
    const relBottom = childRect.y - contentOriginY + childRect.height;
    if (relRight > maxRelRight) maxRelRight = relRight;
    if (relBottom > maxRelBottom) maxRelBottom = relBottom;
  }

  if (node.type !== "ink-box") {
    layout = haveChildBounds
      ? {
          x: minChildX,
          y: minChildY,
          width: Math.max(0, maxChildX - minChildX),
          height: Math.max(0, maxChildY - minChildY),
        }
      : ZERO_LAYOUT;
  }

  node.internal_layout = layout;

  const overflow = readOverflowFromProps(props);
  const clientWidth = Math.max(0, layout.width - borderInsets.left - borderInsets.right);
  const clientHeight = Math.max(0, layout.height - borderInsets.top - borderInsets.bottom);

  let scrollHeight = Math.max(clientHeight, maxRelBottom);
  let scrollWidth = Math.max(clientWidth, maxRelRight);
  const rawScrollTop = readScrollOffset(props.scrollTop);
  const rawScrollLeft = readScrollOffset(props.scrollLeft);

  if (overflow.overflowY === "scroll") {
    const estimated = estimateScrollHeight(node);
    scrollHeight = Math.max(scrollHeight, estimated, maxRelBottom + rawScrollTop);
  }

  if (overflow.overflowX === "scroll") {
    scrollWidth = Math.max(scrollWidth, maxRelRight + rawScrollLeft);
  }

  const scrollTopMax = Math.max(0, scrollHeight - clientHeight);
  const scrollLeftMax = Math.max(0, scrollWidth - clientWidth);
  const scrollTop = overflow.overflowY === "scroll" ? Math.min(rawScrollTop, scrollTopMax) : 0;
  const scrollLeft = overflow.overflowX === "scroll" ? Math.min(rawScrollLeft, scrollLeftMax) : 0;

  node.internal_scrollState = {
    scrollTop,
    scrollLeft,
    scrollHeight,
    scrollWidth,
    clientHeight,
    clientWidth,
  };

  const nextSize = { width: layout.width, height: layout.height };
  const lastSize = node.internal_lastMeasuredSize;
  if (!lastSize || lastSize.width !== nextSize.width || lastSize.height !== nextSize.height) {
    node.internal_lastMeasuredSize = nextSize;

    if (node.resizeObservers && node.resizeObservers.size > 0) {
      const entry = new ResizeObserverEntry(node as unknown as DOMElement, nextSize);
      for (const observer of node.resizeObservers) {
        collectObserverEntry(observerBatches, observer as unknown as ResizeObserverLike, entry);
      }
    }
  }

  return layout;
}

export function applyLayoutSnapshot(root: HostRoot, idRects: ReadonlyMap<string, CoreRect>): void {
  const observerBatches = new Map<ResizeObserverLike, ResizeObserverEntry[]>();

  for (const child of root.children) {
    if (child.kind !== "element") continue;
    updateNodeLayout(child, idRects, observerBatches);
  }

  for (const [observer, entries] of observerBatches) {
    try {
      observer.internalTrigger(entries);
    } catch {
      // ignore observer callback failures
    }
  }
}
