import type { InkHostNode } from "../reconciler/types.js";

export function measureElement(ref: InkHostNode): { width: number; height: number } {
  const layout = (ref as InkHostNode & { __inkLayout?: { w: number; h: number } }).__inkLayout;
  if (!layout) return { width: 0, height: 0 };

  return {
    width: layout.w,
    height: layout.h,
  };
}
