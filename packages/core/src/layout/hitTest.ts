/**
 * packages/core/src/layout/hitTest.ts — Mouse hit testing for focusable widgets.
 *
 * Why: Determines which focusable widget (if any) is under a given mouse
 * position. Used for mouse-based focus changes and click routing.
 *
 * Tie-break rule: When multiple focusable widgets overlap at a point, the
 * LAST one in depth-first preorder traversal wins (typically the "topmost"
 * visually, though stacking is logical not visual in terminal UI).
 *
 * @see docs/guide/layout.md
 */

import type { VNode } from "../index.js";
import type { LayoutTree } from "./layout.js";
import type { Rect } from "./types.js";

/** Check if point (x,y) is inside rect (exclusive of right/bottom edges). */
export function contains(rect: Rect, x: number, y: number): boolean {
  return x >= rect.x && x < rect.x + rect.w && y >= rect.y && y < rect.y + rect.h;
}

/** Return the ID of a focusable widget, or null if not focusable/disabled. */
function isFocusable(v: VNode): string | null {
  switch (v.kind) {
    case "button":
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
 * the winner is the LAST focusable widget in depth-first preorder traversal order.
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
  const clipXStack: number[] = [layout.rect.x];
  const clipYStack: number[] = [layout.rect.y];
  const clipWStack: number[] = [layout.rect.w];
  const clipHStack: number[] = [layout.rect.h];

  while (nodeStack.length > 0) {
    const node = nodeStack.pop();
    const clipX = clipXStack.pop();
    const clipY = clipYStack.pop();
    const clipW = clipWStack.pop();
    const clipH = clipHStack.pop();
    if (
      node === undefined ||
      clipX === undefined ||
      clipY === undefined ||
      clipW === undefined ||
      clipH === undefined
    ) {
      continue;
    }

    const nodeRect = node.rect;
    const ix0 = Math.max(clipX, nodeRect.x);
    const iy0 = Math.max(clipY, nodeRect.y);
    const ix1 = Math.min(clipX + clipW, nodeRect.x + nodeRect.w);
    const iy1 = Math.min(clipY + clipH, nodeRect.y + nodeRect.h);
    if (ix1 <= ix0 || iy1 <= iy0) continue;

    const id = isFocusable(node.vnode);
    if (id !== null && x >= ix0 && x < ix1 && y >= iy0 && y < iy1) {
      winner = id;
    }

    // Depth-first preorder: push children in reverse so left-to-right is visited first.
    for (let i = node.children.length - 1; i >= 0; i--) {
      const child = node.children[i];
      if (!child) continue;
      nodeStack.push(child);
      clipXStack.push(ix0);
      clipYStack.push(iy0);
      clipWStack.push(ix1 - ix0);
      clipHStack.push(iy1 - iy0);
    }
  }

  return winner;
}
