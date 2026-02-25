import type { InkHostNode } from "../reconciler/types.js";
import { readCurrentLayout } from "./layoutState.js";

export interface BoundingBox {
  x: number;
  y: number;
  width: number;
  height: number;
}

/**
 * Returns the bounding box (absolute position + size) of an Ink host node.
 *
 * Gemini CLI uses this for mouse hit-testing — destructuring { x, y, width, height }
 * and converting terminal coordinates to element-relative coordinates.
 *
 * Since we don't have a real Yoga layout attached to host nodes, we read the
 * cached layout rect that the testing/render pipeline writes onto nodes.
 */
export function getBoundingBox(element: InkHostNode): BoundingBox {
  const layout = readCurrentLayout(element);
  if (!layout) {
    return { x: 0, y: 0, width: 0, height: 0 };
  }
  return {
    x: layout.x ?? 0,
    y: layout.y ?? 0,
    width: layout.w,
    height: layout.h,
  };
}
