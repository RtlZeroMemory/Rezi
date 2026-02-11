import type { HostElement, HostLayoutRect, HostRoot } from "./reconciler/types.js";
import { ResizeObserverEntry } from "./resizeObserver.js";
import type { DOMElement } from "./types.js";

type CoreRect = Readonly<{ x: number; y: number; w: number; h: number }>;

type ResizeObserverLike = Readonly<{
  internalTrigger: (entries: ResizeObserverEntry[]) => void;
}>;

const ZERO_LAYOUT: HostLayoutRect = Object.freeze({ x: 0, y: 0, width: 0, height: 0 });

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

export function measureElementFromLayout(node: DOMElement): Readonly<{ width: number; height: number }> {
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
  let layout = node.type === "ink-box" ? toLayout(idRects.get(node.internal_id)) : ZERO_LAYOUT;

  let haveChildBounds = false;
  let minChildX = 0;
  let minChildY = 0;
  let maxChildX = 0;
  let maxChildY = 0;

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

    const relRight = childRect.x - layout.x + childRect.width;
    const relBottom = childRect.y - layout.y + childRect.height;
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

  const clientWidth = layout.width;
  const clientHeight = layout.height;
  node.internal_scrollState = {
    scrollHeight: Math.max(clientHeight, maxRelBottom),
    scrollWidth: Math.max(clientWidth, maxRelRight),
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

export function applyLayoutSnapshot(
  root: HostRoot,
  idRects: ReadonlyMap<string, CoreRect>,
): void {
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
