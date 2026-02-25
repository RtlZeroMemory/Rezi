/**
 * InkHostNode — mutable tree managed by the React reconciler.
 * Each node corresponds to one Ink component instance (<Box>, <Text>, etc.).
 */

export type InkNodeType = "ink-box" | "ink-text" | "ink-root" | "ink-virtual";

export interface InkHostNode {
  type: InkNodeType;
  props: Record<string, unknown>;
  children: InkHostNode[];
  parent: InkHostNode | null;
  /** Text content for text nodes (string children of <Text>) */
  textContent: string | null;
}

export interface InkHostContainer {
  type: "ink-root";
  children: InkHostNode[];
  /** Callback invoked after every React commit phase */
  onCommit: (() => void) | null;
}

export function createHostNode(type: InkNodeType, props: Record<string, unknown>): InkHostNode {
  return { type, props, children: [], parent: null, textContent: null };
}

export function createHostContainer(): InkHostContainer {
  return { type: "ink-root", children: [], onCommit: null };
}

function isContainer(parent: InkHostNode | InkHostContainer): parent is InkHostContainer {
  return parent.type === "ink-root" && "onCommit" in parent;
}

export function appendChild(parent: InkHostNode | InkHostContainer, child: InkHostNode): void {
  child.parent = isContainer(parent) ? null : parent;
  parent.children.push(child);
}

export function removeChild(parent: InkHostNode | InkHostContainer, child: InkHostNode): void {
  const idx = parent.children.indexOf(child);
  if (idx === -1) return;

  parent.children.splice(idx, 1);
  child.parent = null;
}

export function insertBefore(
  parent: InkHostNode | InkHostContainer,
  child: InkHostNode,
  before: InkHostNode,
): void {
  child.parent = isContainer(parent) ? null : parent;

  const idx = parent.children.indexOf(before);
  if (idx === -1) {
    parent.children.push(child);
    return;
  }

  parent.children.splice(idx, 0, child);
}
