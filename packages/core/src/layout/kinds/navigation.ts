import type { VNode } from "../../index.js";
import { ok } from "../engine/result.js";
import type { LayoutTree } from "../engine/types.js";
import type { Axis, Size } from "../types.js";
import type { LayoutResult } from "../validateProps.js";

type MeasureNodeFn = (vnode: VNode, maxW: number, maxH: number, axis: Axis) => LayoutResult<Size>;

type LayoutNodeFn = (
  vnode: VNode,
  x: number,
  y: number,
  maxW: number,
  maxH: number,
  axis: Axis,
  forcedW?: number | null,
  forcedH?: number | null,
) => LayoutResult<LayoutTree>;

type NavigationVNode = Extract<
  VNode,
  | Readonly<{ kind: "tabs"; children: readonly VNode[] }>
  | Readonly<{ kind: "accordion"; children: readonly VNode[] }>
  | Readonly<{ kind: "breadcrumb"; children: readonly VNode[] }>
  | Readonly<{ kind: "pagination"; children: readonly VNode[] }>
>;

function toSyntheticContainer(vnode: NavigationVNode): VNode {
  if (vnode.kind === "tabs" || vnode.kind === "accordion") {
    return { kind: "column", props: {}, children: vnode.children };
  }
  return { kind: "row", props: {}, children: vnode.children };
}

function syntheticAxis(vnode: NavigationVNode): Axis {
  return vnode.kind === "tabs" || vnode.kind === "accordion" ? "column" : "row";
}

export function measureNavigationKinds(
  vnode: VNode,
  maxW: number,
  maxH: number,
  measureNode: MeasureNodeFn,
): LayoutResult<Size> {
  switch (vnode.kind) {
    case "tabs":
    case "accordion":
    case "breadcrumb":
    case "pagination": {
      const navVnode = vnode as NavigationVNode;
      const synthetic = toSyntheticContainer(navVnode);
      return measureNode(synthetic, maxW, maxH, syntheticAxis(navVnode));
    }
    default:
      return {
        ok: false,
        fatal: {
          code: "ZRUI_INVALID_PROPS",
          detail: "measureNavigationKinds: unexpected vnode kind",
        },
      };
  }
}

export function layoutNavigationKinds(
  vnode: VNode,
  x: number,
  y: number,
  rectW: number,
  rectH: number,
  layoutNode: LayoutNodeFn,
): LayoutResult<LayoutTree> {
  switch (vnode.kind) {
    case "tabs":
    case "accordion":
    case "breadcrumb":
    case "pagination": {
      const navVnode = vnode as NavigationVNode;
      const synthetic = toSyntheticContainer(navVnode);
      const axis = syntheticAxis(navVnode);
      const res = layoutNode(synthetic, x, y, rectW, rectH, axis, rectW, rectH);
      if (!res.ok) return res;
      return ok({
        vnode,
        rect: { x, y, w: rectW, h: rectH },
        children: res.value.children,
      });
    }
    default:
      return {
        ok: false,
        fatal: {
          code: "ZRUI_INVALID_PROPS",
          detail: "layoutNavigationKinds: unexpected vnode kind",
        },
      };
  }
}
