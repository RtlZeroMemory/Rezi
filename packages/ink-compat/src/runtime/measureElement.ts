import type { InkHostNode } from "../reconciler/types.js";
import { readCurrentLayout } from "./layoutState.js";

export function measureElement(ref: InkHostNode): { width: number; height: number } {
  const layout = readCurrentLayout(ref);
  if (!layout) return { width: 0, height: 0 };

  return {
    width: layout.w,
    height: layout.h,
  };
}
