import type { InkHostContainer, InkHostNode } from "../reconciler/types.js";

interface InkLayoutRect {
  x: number;
  y: number;
  w: number;
  h: number;
}

type LayoutHostNode = InkHostNode & {
  __inkLayout?: InkLayoutRect;
  __inkLayoutGen?: number;
};

export function advanceLayoutGeneration(container: InkHostContainer): number {
  container.__inkLayoutGeneration = (container.__inkLayoutGeneration ?? 0) + 1;
  return container.__inkLayoutGeneration;
}

export function writeCurrentLayout(
  node: InkHostNode,
  layout: InkLayoutRect,
  generation: number,
): void {
  const host = node as LayoutHostNode;
  host.__inkLayout = layout;
  host.__inkLayoutGen = generation;
}

export function readCurrentLayout(node: InkHostNode): InkLayoutRect | undefined {
  const host = node as LayoutHostNode;
  const layout = host.__inkLayout;
  if (!layout) return undefined;

  const container = node.__inkContainer;
  const generation = host.__inkLayoutGen;
  if (!container) {
    // Detached runtime nodes retain stale layout objects; consider generation-tagged
    // entries invalid once detached. Untagged layouts remain readable for tests
    // that manually assign __inkLayout without a render session.
    if (generation != null) return undefined;
    return layout;
  }
  if (generation == null) return layout;

  return generation === container.__inkLayoutGeneration ? layout : undefined;
}
