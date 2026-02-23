import type { VNode } from "../../widgets/types.js";
import type { LayoutResult } from "../validateProps.js";
import { isI32 } from "./bounds.js";
import { ok } from "./result.js";
import type { LayoutTree } from "./types.js";

/** Create a LayoutTree leaf node (no children) with validated rect. */
export function layoutLeaf(
  vnode: VNode,
  x: number,
  y: number,
  w: number,
  h: number,
): LayoutResult<LayoutTree> {
  if (!isI32(x) || !isI32(y) || !isI32(w) || !isI32(h) || w < 0 || h < 0) {
    return {
      ok: false,
      fatal: {
        code: "ZRUI_INVALID_PROPS",
        detail: "layout: computed rect is not valid int32 cells",
      },
    };
  }
  return ok({ vnode, rect: { x, y, w, h }, children: Object.freeze([]) });
}
