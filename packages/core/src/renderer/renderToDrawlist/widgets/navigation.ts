import type { DrawlistBuilderV1 } from "../../../index.js";
import type { LayoutTree } from "../../../layout/layout.js";
import type { Rect } from "../../../layout/types.js";
import type { RuntimeInstance } from "../../../runtime/commit.js";
import { isVisibleRect } from "../indices.js";
import type { ResolvedTextStyle } from "../textStyle.js";

type ClipRect = Readonly<Rect>;

export function renderNavigationWidget(
  _builder: DrawlistBuilderV1,
  rect: Rect,
  parentStyle: ResolvedTextStyle,
  node: RuntimeInstance,
  layoutNode: LayoutTree,
  nodeStack: (RuntimeInstance | null)[],
  styleStack: ResolvedTextStyle[],
  layoutStack: LayoutTree[],
  clipStack: (ClipRect | undefined)[],
  currentClip: ClipRect | undefined,
): void {
  if (!isVisibleRect(rect)) return;

  const childCount = Math.min(node.children.length, layoutNode.children.length);
  for (let i = childCount - 1; i >= 0; i--) {
    const child = node.children[i];
    const childLayout = layoutNode.children[i];
    if (!child || !childLayout) continue;
    nodeStack.push(child);
    styleStack.push(parentStyle);
    layoutStack.push(childLayout);
    clipStack.push(currentClip);
  }
}
