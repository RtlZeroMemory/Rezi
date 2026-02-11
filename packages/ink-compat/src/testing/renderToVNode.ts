import { type VNode, ui } from "@rezi-ui/core";
import type React from "react";
import reconciler, {
  createRootContainer,
  updateRootContainer,
  type HostRoot,
} from "../reconciler.js";

/**
 * Render a React element into a Rezi VNode using the ink-compat reconciler.
 *
 * This does not start a Rezi app/backend; it just runs the React commit pipeline.
 */
export function renderToVNode(element: React.ReactNode): VNode {
  let last: VNode | null = null;

  const root: HostRoot = {
    kind: "root",
    children: [],
    staticVNodes: [],
    onCommit(vnode) {
      last = vnode;
    },
  };

  const container = createRootContainer(root);
  updateRootContainer(container, element);

  return last ?? ui.text("");
}
