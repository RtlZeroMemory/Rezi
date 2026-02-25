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

function detachChildIfPresent(parent: InkHostNode | InkHostContainer, child: InkHostNode): number {
  if (child.parent != null && child.parent !== parent) {
    const previousIndex = child.parent.children.indexOf(child);
    if (previousIndex >= 0) {
      child.parent.children.splice(previousIndex, 1);
    }
  }

  const existingIndex = parent.children.indexOf(child);
  if (existingIndex >= 0) {
    parent.children.splice(existingIndex, 1);
  }
  return existingIndex;
}

export function appendChild(parent: InkHostNode | InkHostContainer, child: InkHostNode): void {
  detachChildIfPresent(parent, child);
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
  detachChildIfPresent(parent, child);
  child.parent = isContainer(parent) ? null : parent;

  const idx = parent.children.indexOf(before);
  if (idx === -1) {
    parent.children.push(child);
    return;
  }

  parent.children.splice(idx, 0, child);
}
