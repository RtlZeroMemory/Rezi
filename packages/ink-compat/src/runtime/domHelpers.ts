import type { InkHostNode } from "../reconciler/types.js";

interface InkLayout {
  x: number;
  y: number;
  w: number;
  h: number;
}

type NodeWithLayout = InkHostNode & { __inkLayout?: InkLayout };

/**
 * Returns the inner (visible/viewport) height of an element.
 *
 * In Ink this corresponds to the computed CSS height minus borders/padding.
 * In our compat layer, the layout height stored on the node already represents
 * the content area, so we return it directly.
 *
 * Gemini CLI rounds the result and uses it for scroll calculations.
 */
export function getInnerHeight(element: InkHostNode): number {
  const layout = (element as NodeWithLayout).__inkLayout;
  return layout?.h ?? 0;
}

/**
 * Returns the scroll height (total content height) of an element.
 *
 * In Ink, this is the total height of all children even if they overflow
 * the visible area. We compute it by summing child layout heights.
 *
 * Gemini CLI rounds the result and compares with getInnerHeight for scroll logic.
 */
export function getScrollHeight(element: InkHostNode): number {
  let total = 0;
  for (const child of element.children) {
    const childLayout = (child as NodeWithLayout).__inkLayout;
    if (childLayout) {
      total = Math.max(total, (childLayout.y ?? 0) + childLayout.h);
    }
  }
  // If no children have layout, fall back to the element's own height
  if (total === 0) {
    const layout = (element as NodeWithLayout).__inkLayout;
    return layout?.h ?? 0;
  }
  // Scroll height is relative to the element's top, not absolute
  const elementY = (element as NodeWithLayout).__inkLayout?.y ?? 0;
  return total - elementY;
}
