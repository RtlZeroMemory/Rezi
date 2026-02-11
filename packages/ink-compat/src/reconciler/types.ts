import type { VNode } from "@rezi-ui/core";

export type HostType = "ink-box" | "ink-text" | "ink-virtual-text" | "ink-spacer";

export type HostLayoutRect = Readonly<{
  x: number;
  y: number;
  width: number;
  height: number;
}>;

export type HostScrollState = Readonly<{
  scrollTop: number;
  scrollLeft: number;
  scrollHeight: number;
  scrollWidth: number;
  clientHeight: number;
  clientWidth: number;
}>;

export type HostResizeObserverLike = Readonly<{
  internalTrigger: (entries: readonly unknown[]) => void;
}>;

export type HostText = {
  kind: "text";
  text: string;
  nodeName: "#text";
  nodeValue: string;
  parentNode?: HostElement;
};

export type HostElement = {
  kind: "element";
  type: HostType;
  nodeName: HostType;
  props: Record<string, unknown>;
  attributes: Record<string, unknown>;
  children: HostNode[];
  childNodes: HostNode[];
  parentNode?: HostElement;
  internal_id: string;
  internal_layout?: HostLayoutRect;
  internal_scrollState?: HostScrollState;
  resizeObservers?: Set<HostResizeObserverLike>;
  internal_lastMeasuredSize?: Readonly<{ width: number; height: number }>;
};

export type HostNode = HostElement | HostText;

export type HostRoot = {
  kind: "root";
  children: Array<HostElement | HostText>;
  /**
   * Persistent static output (Ink `<Static>` semantics).
   * Items are appended on each commit and remain for the lifetime of the render() root.
   */
  staticVNodes: VNode[];
  internal_nextNodeId?: number;
  onCommit: (vnode: VNode | null) => void;
};

export type HostContext = Readonly<{ isInsideText: boolean }>;

export function allocateNodeId(root: HostRoot): string {
  const next = root.internal_nextNodeId ?? 1;
  root.internal_nextNodeId = next + 1;
  return `ink-compat-${String(next)}`;
}

export function appendChildNode(
  parent: HostRoot | HostElement,
  child: HostElement | HostText,
): void {
  parent.children.push(child);
  if (parent.kind === "element") child.parentNode = parent;
  else Reflect.deleteProperty(child, "parentNode");
}

export function insertBeforeNode(
  parent: HostRoot | HostElement,
  child: HostElement | HostText,
  before: HostElement | HostText,
): void {
  const idx = parent.children.indexOf(before);
  if (idx < 0) {
    parent.children.push(child);
    if (parent.kind === "element") child.parentNode = parent;
    else Reflect.deleteProperty(child, "parentNode");
    return;
  }
  parent.children.splice(idx, 0, child);
  if (parent.kind === "element") child.parentNode = parent;
  else Reflect.deleteProperty(child, "parentNode");
}

export function removeChildNode(
  parent: HostRoot | HostElement,
  child: HostElement | HostText,
): void {
  const idx = parent.children.indexOf(child);
  if (idx < 0) return;
  parent.children.splice(idx, 1);
  Reflect.deleteProperty(child, "parentNode");
}
