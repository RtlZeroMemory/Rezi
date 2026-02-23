/**
 * packages/core/src/layout/hitTest.ts — Mouse hit testing for focusable widgets.
 *
 * Why: Determines which focusable widget (if any) is under a given mouse
 * position. Used for mouse-based focus changes and click routing.
 *
 * Tie-break rule: When multiple focusable widgets overlap at a point, the
 * LAST node in depth-first preorder traversal wins.
 *
 * Explicit direction:
 * - Children are traversed left-to-right (tree order).
 * - Later tree-order nodes override earlier ones.
 * - Among siblings, later siblings win ties.
 *
 * @see docs/guide/layout.md
 */

import type { VNode } from "../index.js";
import type { LayoutTree } from "./layout.js";
import { resolveSpacing } from "./spacing.js";
import type { Rect } from "./types.js";

/** Check if point (x,y) is inside rect (exclusive of right/bottom edges). */
export function contains(rect: Rect, x: number, y: number): boolean {
  return x >= rect.x && x < rect.x + rect.w && y >= rect.y && y < rect.y + rect.h;
}

type OverflowMode = "visible" | "hidden" | "scroll";
type OverflowMetadata = Readonly<{
  scrollX: number;
  scrollY: number;
  contentWidth: number;
  contentHeight: number;
  viewportWidth: number;
  viewportHeight: number;
}>;

function clampNonNegativeInt(raw: unknown): number {
  if (typeof raw !== "number" || !Number.isFinite(raw)) return 0;
  const n = Math.trunc(raw);
  return n <= 0 ? 0 : n;
}

function readOverflowMode(vnode: VNode): OverflowMode {
  const props = vnode.props as { overflow?: unknown };
  if (props.overflow === "hidden" || props.overflow === "scroll") {
    return props.overflow;
  }
  return "visible";
}

function readOverflowMetadata(node: LayoutTree, fallbackViewport: Rect): OverflowMetadata | null {
  const raw = node.meta;
  if (typeof raw !== "object" || raw === null) return null;
  const meta = raw as {
    scrollX?: unknown;
    scrollY?: unknown;
    contentWidth?: unknown;
    contentHeight?: unknown;
    viewportWidth?: unknown;
    viewportHeight?: unknown;
  };
  const viewportWidthRaw = clampNonNegativeInt(meta.viewportWidth);
  const viewportHeightRaw = clampNonNegativeInt(meta.viewportHeight);
  const viewportWidth = viewportWidthRaw > 0 ? viewportWidthRaw : fallbackViewport.w;
  const viewportHeight = viewportHeightRaw > 0 ? viewportHeightRaw : fallbackViewport.h;
  const contentWidth = Math.max(clampNonNegativeInt(meta.contentWidth), viewportWidth);
  const contentHeight = Math.max(clampNonNegativeInt(meta.contentHeight), viewportHeight);
  const maxScrollX = Math.max(0, contentWidth - viewportWidth);
  const maxScrollY = Math.max(0, contentHeight - viewportHeight);
  return {
    scrollX: Math.min(clampNonNegativeInt(meta.scrollX), maxScrollX),
    scrollY: Math.min(clampNonNegativeInt(meta.scrollY), maxScrollY),
    contentWidth,
    contentHeight,
    viewportWidth,
    viewportHeight,
  };
}

function intersectRect(a: Rect, b: Rect): Rect | null {
  const x0 = Math.max(a.x, b.x);
  const y0 = Math.max(a.y, b.y);
  const x1 = Math.min(a.x + a.w, b.x + b.w);
  const y1 = Math.min(a.y + a.h, b.y + b.h);
  if (x1 <= x0 || y1 <= y0) return null;
  return { x: x0, y: y0, w: x1 - x0, h: y1 - y0 };
}

function resolveContentRect(vnode: VNode, rect: Rect): Rect {
  switch (vnode.kind) {
    case "row":
    case "column": {
      const spacing = resolveSpacing(vnode.props as never);
      return {
        x: rect.x + spacing.left,
        y: rect.y + spacing.top,
        w: Math.max(0, rect.w - spacing.left - spacing.right),
        h: Math.max(0, rect.h - spacing.top - spacing.bottom),
      };
    }
    case "box": {
      const props = vnode.props as {
        border?: unknown;
        borderTop?: unknown;
        borderRight?: unknown;
        borderBottom?: unknown;
        borderLeft?: unknown;
        p?: unknown;
        px?: unknown;
        py?: unknown;
        pt?: unknown;
        pb?: unknown;
        pl?: unknown;
        pr?: unknown;
        pad?: unknown;
      };
      const border = typeof props.border === "string" ? props.border : "single";
      const defaultSide = border !== "none";
      const borderTop = typeof props.borderTop === "boolean" ? props.borderTop : defaultSide;
      const borderRight = typeof props.borderRight === "boolean" ? props.borderRight : defaultSide;
      const borderBottom =
        typeof props.borderBottom === "boolean" ? props.borderBottom : defaultSide;
      const borderLeft = typeof props.borderLeft === "boolean" ? props.borderLeft : defaultSide;
      const bt = border === "none" || !borderTop ? 0 : 1;
      const br = border === "none" || !borderRight ? 0 : 1;
      const bb = border === "none" || !borderBottom ? 0 : 1;
      const bl = border === "none" || !borderLeft ? 0 : 1;
      const spacing = resolveSpacing(props as never);
      return {
        x: rect.x + bl + spacing.left,
        y: rect.y + bt + spacing.top,
        w: Math.max(0, rect.w - bl - br - spacing.left - spacing.right),
        h: Math.max(0, rect.h - bt - bb - spacing.top - spacing.bottom),
      };
    }
    default:
      return rect;
  }
}

function resolveScrollViewportRect(vnode: VNode, rect: Rect, meta: OverflowMetadata): Rect {
  const contentRect = resolveContentRect(vnode, rect);
  let showVertical = meta.contentHeight > contentRect.h;
  let showHorizontal = meta.contentWidth > contentRect.w;

  // Vertical and horizontal bars affect each other via the corner cell.
  for (let i = 0; i < 2; i++) {
    const nextViewportW = Math.max(0, contentRect.w - (showVertical ? 1 : 0));
    const nextViewportH = Math.max(0, contentRect.h - (showHorizontal ? 1 : 0));
    const nextVertical = meta.contentHeight > nextViewportH;
    const nextHorizontal = meta.contentWidth > nextViewportW;
    if (nextVertical === showVertical && nextHorizontal === showHorizontal) {
      break;
    }
    showVertical = nextVertical;
    showHorizontal = nextHorizontal;
  }

  return {
    x: contentRect.x,
    y: contentRect.y,
    w: Math.max(0, contentRect.w - (showVertical ? 1 : 0)),
    h: Math.max(0, contentRect.h - (showHorizontal ? 1 : 0)),
  };
}

/** Return the ID of a focusable widget, or null if not focusable/disabled. */
function isFocusable(v: VNode): string | null {
  switch (v.kind) {
    case "button":
    case "link":
    case "input":
    case "virtualList":
    case "table":
    case "tree":
    case "slider":
    case "select":
    case "checkbox":
    case "radioGroup":
    // Advanced widgets (GitHub issue #136)
    case "commandPalette":
    case "filePicker":
    case "fileTreeExplorer":
    case "codeEditor":
    case "diffViewer":
    case "toolApprovalDialog":
    case "logsConsole": {
      const id = (v.props as { id?: unknown }).id;
      if (typeof id !== "string" || id.length === 0) return null;

      if (v.kind === "commandPalette" || v.kind === "toolApprovalDialog") {
        const open = (v.props as { open?: unknown }).open;
        if (open !== true) return null;
      }

      if (
        v.kind === "button" ||
        v.kind === "link" ||
        v.kind === "input" ||
        v.kind === "slider" ||
        v.kind === "select" ||
        v.kind === "checkbox" ||
        v.kind === "radioGroup"
      ) {
        const disabled = (v.props as { disabled?: unknown }).disabled;
        if (disabled === true) return null;
      }
      return id;
    }
    default:
      return null;
  }
}

/**
 * Hit test focusable widgets (enabled interactive ids).
 *
 * Tie-break is deterministic: if multiple focusable widgets contain the point,
 * the winner is the LAST focusable widget in depth-first preorder tree order.
 */
export function hitTestFocusable(
  tree: VNode,
  layout: LayoutTree,
  x: number,
  y: number,
): string | null {
  void tree;

  let winner: string | null = null;
  const nodeStack: LayoutTree[] = [layout];
  const clipStack: Rect[] = [layout.rect];

  while (nodeStack.length > 0) {
    const node = nodeStack.pop();
    const clip = clipStack.pop();
    if (!node || !clip) continue;

    const nodeClip = intersectRect(clip, node.rect);
    if (!nodeClip) continue;

    const id = isFocusable(node.vnode);
    if (id !== null && contains(nodeClip, x, y)) {
      winner = id;
    }

    let childClip = nodeClip;
    const overflowMode = readOverflowMode(node.vnode);

    if (overflowMode === "scroll") {
      const contentRect = resolveContentRect(node.vnode, node.rect);
      const meta = readOverflowMetadata(node, contentRect);
      if (meta !== null) {
        const viewportRect = resolveScrollViewportRect(node.vnode, node.rect, meta);
        const clippedViewport = intersectRect(nodeClip, viewportRect);
        if (!clippedViewport) continue;
        childClip = clippedViewport;
      }
    } else if (overflowMode === "hidden") {
      const contentRect = resolveContentRect(node.vnode, node.rect);
      const clippedContent = intersectRect(nodeClip, contentRect);
      if (!clippedContent) continue;
      childClip = clippedContent;
    }

    for (let i = node.children.length - 1; i >= 0; i--) {
      const child = node.children[i];
      if (!child) continue;
      nodeStack.push(child);
      clipStack.push(childClip);
    }
  }

  return winner;
}
