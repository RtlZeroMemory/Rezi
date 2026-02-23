import type { VNode } from "../../widgets/types.js";
import type { LayoutOverflowMetadata } from "../constraints.js";
import type { Rect } from "../types.js";

export type LayoutMetadata = LayoutOverflowMetadata;

/**
 * Tree of layout results mirroring VNode structure.
 * Each node contains its positioned rectangle and children.
 */
export type LayoutTree = Readonly<{
  vnode: VNode;
  rect: Rect;
  children: readonly LayoutTree[];
  meta?: LayoutMetadata;
}>;
