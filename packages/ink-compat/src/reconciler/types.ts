/**
 * InkHostNode — mutable tree managed by the React reconciler.
 * Each node corresponds to one Ink component instance (<Box>, <Text>, etc.).
 */

export type InkNodeType = "ink-box" | "ink-text" | "ink-root" | "ink-virtual";

const ANSI_SGR_DETECT_REGEX = /\u001b\[[0-9:;]*m/;

let globalInkRevision = 0;

function nextInkRevision(): number {
  globalInkRevision += 1;
  return globalInkRevision;
}

export interface InkHostNode {
  type: InkNodeType;
  props: Record<string, unknown>;
  children: InkHostNode[];
  parent: InkHostNode | null;
  /** Text content for text nodes (string children of <Text>) */
  textContent: string | null;
  /** Compatibility surface for libraries that expect Ink DOM elements to expose yogaNode. */
  yogaNode?: unknown;
  /** Monotonically increasing revision for translation cache invalidation. */
  __inkRevision: number;
  /** Root container this node is currently attached to, if any. */
  __inkContainer: InkHostContainer | null;
  /** Local marker contributions (self only). */
  __inkSelfHasStatic: boolean;
  __inkSelfHasAnsiSgr: boolean;
  /** Aggregated marker contributions (self + subtree). */
  __inkSubtreeStaticCount: number;
  __inkSubtreeAnsiSgrCount: number;
  __inkSubtreeHasStatic: boolean;
  __inkSubtreeHasAnsiSgr: boolean;
  /** Layout generation validity marker for runtime layout caches. */
  __inkLayoutGen?: number;
}

export interface InkHostContainer {
  type: "ink-root";
  children: InkHostNode[];
  /** Callback invoked after every React commit phase */
  onCommit: (() => void) | null;
  /** Aggregated marker contributions across all root children. */
  __inkSubtreeStaticCount: number;
  __inkSubtreeAnsiSgrCount: number;
  __inkSubtreeHasStatic: boolean;
  __inkSubtreeHasAnsiSgr: boolean;
  /** Current layout generation assigned by runtime render. */
  __inkLayoutGeneration: number;
}

function updateNodeMarkerBooleans(node: InkHostNode): void {
  node.__inkSubtreeHasStatic = node.__inkSubtreeStaticCount > 0;
  node.__inkSubtreeHasAnsiSgr = node.__inkSubtreeAnsiSgrCount > 0;
}

function updateContainerMarkerBooleans(container: InkHostContainer): void {
  container.__inkSubtreeHasStatic = container.__inkSubtreeStaticCount > 0;
  container.__inkSubtreeHasAnsiSgr = container.__inkSubtreeAnsiSgrCount > 0;
}

function detectNodeSelfStatic(type: InkNodeType, props: Record<string, unknown>): boolean {
  return type === "ink-box" && props["__inkStatic"] === true;
}

function detectNodeSelfAnsi(textContent: string | null): boolean {
  if (typeof textContent !== "string" || textContent.length === 0) return false;
  return ANSI_SGR_DETECT_REGEX.test(textContent);
}

function recomputeSubtreeMarkers(node: InkHostNode): { staticCount: number; ansiCount: number } {
  const stack: Array<{ node: InkHostNode; visited: boolean }> = [{ node, visited: false }];

  while (stack.length > 0) {
    const current = stack.pop();
    if (!current) continue;

    if (!current.visited) {
      stack.push({ node: current.node, visited: true });
      for (let i = current.node.children.length - 1; i >= 0; i -= 1) {
        const child = current.node.children[i];
        if (child) stack.push({ node: child, visited: false });
      }
      continue;
    }

    const selfStatic = detectNodeSelfStatic(current.node.type, current.node.props);
    const selfAnsi = detectNodeSelfAnsi(current.node.textContent);

    let staticCount = selfStatic ? 1 : 0;
    let ansiCount = selfAnsi ? 1 : 0;

    for (const child of current.node.children) {
      staticCount += child.__inkSubtreeStaticCount;
      ansiCount += child.__inkSubtreeAnsiSgrCount;
    }

    current.node.__inkSelfHasStatic = selfStatic;
    current.node.__inkSelfHasAnsiSgr = selfAnsi;
    current.node.__inkSubtreeStaticCount = staticCount;
    current.node.__inkSubtreeAnsiSgrCount = ansiCount;
    updateNodeMarkerBooleans(current.node);
  }

  return { staticCount: node.__inkSubtreeStaticCount, ansiCount: node.__inkSubtreeAnsiSgrCount };
}

function setContainerRecursive(node: InkHostNode, container: InkHostContainer | null): void {
  const stack: InkHostNode[] = [node];
  while (stack.length > 0) {
    const current = stack.pop();
    if (!current) continue;
    current.__inkContainer = container;
    for (let i = current.children.length - 1; i >= 0; i -= 1) {
      const child = current.children[i];
      if (child) stack.push(child);
    }
  }
}

function applyDeltaToNodeTree(
  parent: InkHostNode,
  staticDelta: number,
  ansiDelta: number,
  shouldBumpRevision: boolean,
): void {
  let current: InkHostNode | null = parent;
  while (current) {
    if (staticDelta !== 0) {
      current.__inkSubtreeStaticCount += staticDelta;
    }
    if (ansiDelta !== 0) {
      current.__inkSubtreeAnsiSgrCount += ansiDelta;
    }
    if (staticDelta !== 0 || ansiDelta !== 0) {
      updateNodeMarkerBooleans(current);
    }
    if (shouldBumpRevision) {
      current.__inkRevision = nextInkRevision();
    }
    current = current.parent;
  }
}

function applyDeltaToContainer(
  container: InkHostContainer,
  staticDelta: number,
  ansiDelta: number,
): void {
  if (staticDelta !== 0) {
    container.__inkSubtreeStaticCount += staticDelta;
  }
  if (ansiDelta !== 0) {
    container.__inkSubtreeAnsiSgrCount += ansiDelta;
  }
  if (staticDelta !== 0 || ansiDelta !== 0) {
    updateContainerMarkerBooleans(container);
  }
}

function applyDeltaForAttachedNode(
  node: InkHostNode,
  staticDelta: number,
  ansiDelta: number,
  shouldBumpRevision: boolean,
): void {
  if (node.parent) {
    applyDeltaToNodeTree(node.parent, staticDelta, ansiDelta, shouldBumpRevision);
  }
  if (node.__inkContainer) {
    applyDeltaToContainer(node.__inkContainer, staticDelta, ansiDelta);
  }
  if (shouldBumpRevision) {
    node.__inkRevision = nextInkRevision();
  }
}

function attachToParent(
  parent: InkHostNode | InkHostContainer,
  child: InkHostNode,
  index: number | null,
): void {
  recomputeSubtreeMarkers(child);

  const container = isContainer(parent) ? parent : parent.__inkContainer;
  child.parent = isContainer(parent) ? null : parent;
  setContainerRecursive(child, container ?? null);

  if (index == null || index < 0 || index > parent.children.length) {
    parent.children.push(child);
  } else {
    parent.children.splice(index, 0, child);
  }

  if (isContainer(parent)) {
    applyDeltaToContainer(parent, child.__inkSubtreeStaticCount, child.__inkSubtreeAnsiSgrCount);
    return;
  }

  applyDeltaToNodeTree(parent, child.__inkSubtreeStaticCount, child.__inkSubtreeAnsiSgrCount, true);
  if (container) {
    applyDeltaToContainer(container, child.__inkSubtreeStaticCount, child.__inkSubtreeAnsiSgrCount);
  }
}

function detachFromCurrentParent(child: InkHostNode): void {
  if (child.parent) {
    const oldParent = child.parent;
    const oldContainer = child.__inkContainer;
    const oldIndex = oldParent.children.indexOf(child);
    if (oldIndex >= 0) {
      oldParent.children.splice(oldIndex, 1);
      applyDeltaToNodeTree(
        oldParent,
        -child.__inkSubtreeStaticCount,
        -child.__inkSubtreeAnsiSgrCount,
        true,
      );
      if (oldContainer) {
        applyDeltaToContainer(
          oldContainer,
          -child.__inkSubtreeStaticCount,
          -child.__inkSubtreeAnsiSgrCount,
        );
      }
    }
    child.parent = null;
    setContainerRecursive(child, null);
    return;
  }

  const oldContainer = child.__inkContainer;
  if (!oldContainer) return;
  const oldIndex = oldContainer.children.indexOf(child);
  if (oldIndex >= 0) {
    oldContainer.children.splice(oldIndex, 1);
    applyDeltaToContainer(
      oldContainer,
      -child.__inkSubtreeStaticCount,
      -child.__inkSubtreeAnsiSgrCount,
    );
  }
  setContainerRecursive(child, null);
}

export function createHostNode(type: InkNodeType, props: Record<string, unknown>): InkHostNode {
  const selfStatic = detectNodeSelfStatic(type, props);
  return {
    type,
    props,
    children: [],
    parent: null,
    textContent: null,
    __inkRevision: nextInkRevision(),
    __inkContainer: null,
    __inkSelfHasStatic: selfStatic,
    __inkSelfHasAnsiSgr: false,
    __inkSubtreeStaticCount: selfStatic ? 1 : 0,
    __inkSubtreeAnsiSgrCount: 0,
    __inkSubtreeHasStatic: selfStatic,
    __inkSubtreeHasAnsiSgr: false,
  };
}

export function createHostContainer(): InkHostContainer {
  return {
    type: "ink-root",
    children: [],
    onCommit: null,
    __inkSubtreeStaticCount: 0,
    __inkSubtreeAnsiSgrCount: 0,
    __inkSubtreeHasStatic: false,
    __inkSubtreeHasAnsiSgr: false,
    __inkLayoutGeneration: 0,
  };
}

function isContainer(parent: InkHostNode | InkHostContainer): parent is InkHostContainer {
  return parent.type === "ink-root" && "onCommit" in parent;
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  if (typeof value !== "object" || value === null) return false;
  const proto = Object.getPrototypeOf(value);
  return proto === Object.prototype || proto === null;
}

function deepEqual(valueA: unknown, valueB: unknown, depth: number): boolean {
  if (valueA === valueB) return true;
  if (depth <= 0) return false;

  if (Array.isArray(valueA) && Array.isArray(valueB)) {
    if (valueA.length !== valueB.length) return false;
    for (let index = 0; index < valueA.length; index += 1) {
      if (!deepEqual(valueA[index], valueB[index], depth - 1)) return false;
    }
    return true;
  }

  if (isPlainObject(valueA) && isPlainObject(valueB)) {
    const keysA = Object.keys(valueA);
    const keysB = Object.keys(valueB);
    if (keysA.length !== keysB.length) return false;
    for (const key of keysA) {
      if (!Object.hasOwn(valueB, key)) return false;
      if (!deepEqual(valueA[key], valueB[key], depth - 1)) return false;
    }
    return true;
  }

  return false;
}

function propsSemanticallyEqual(
  previousProps: Record<string, unknown>,
  nextProps: Record<string, unknown>,
): boolean {
  if (previousProps === nextProps) return true;
  const previousKeys = Object.keys(previousProps);
  const nextKeys = Object.keys(nextProps);
  if (previousKeys.length !== nextKeys.length) return false;
  for (const key of previousKeys) {
    if (!Object.hasOwn(nextProps, key)) return false;
    const previousValue = previousProps[key];
    const nextValue = nextProps[key];
    if (previousValue === nextValue) continue;
    if (deepEqual(previousValue, nextValue, 3)) continue;
    return false;
  }
  return true;
}

export function appendChild(parent: InkHostNode | InkHostContainer, child: InkHostNode): void {
  detachFromCurrentParent(child);
  attachToParent(parent, child, null);
}

export function removeChild(parent: InkHostNode | InkHostContainer, child: InkHostNode): void {
  const idx = parent.children.indexOf(child);
  if (idx === -1) return;

  parent.children.splice(idx, 1);
  child.parent = null;
  setContainerRecursive(child, null);

  if (isContainer(parent)) {
    applyDeltaToContainer(parent, -child.__inkSubtreeStaticCount, -child.__inkSubtreeAnsiSgrCount);
    return;
  }

  applyDeltaToNodeTree(
    parent,
    -child.__inkSubtreeStaticCount,
    -child.__inkSubtreeAnsiSgrCount,
    true,
  );
  if (parent.__inkContainer) {
    applyDeltaToContainer(
      parent.__inkContainer,
      -child.__inkSubtreeStaticCount,
      -child.__inkSubtreeAnsiSgrCount,
    );
  }
}

export function insertBefore(
  parent: InkHostNode | InkHostContainer,
  child: InkHostNode,
  before: InkHostNode,
): void {
  const idx = parent.children.indexOf(before);
  if (idx === -1) {
    throw new Error("ZRUI_INSERT_BEFORE_TARGET_MISSING");
  }

  detachFromCurrentParent(child);
  attachToParent(parent, child, idx);
}

export function setNodeProps(node: InkHostNode, props: Record<string, unknown>): void {
  if (propsSemanticallyEqual(node.props, props)) {
    return;
  }

  const previousSelfStatic = node.__inkSelfHasStatic;
  node.props = props;

  const nextSelfStatic = detectNodeSelfStatic(node.type, props);
  const staticDelta = previousSelfStatic === nextSelfStatic ? 0 : nextSelfStatic ? 1 : -1;
  if (staticDelta !== 0) {
    node.__inkSelfHasStatic = nextSelfStatic;
    node.__inkSubtreeStaticCount += staticDelta;
    updateNodeMarkerBooleans(node);
  }
  applyDeltaForAttachedNode(node, staticDelta, 0, true);
}

export function setNodeTextContent(node: InkHostNode, textContent: string | null): void {
  if (node.textContent === textContent) return;

  const previousSelfAnsi = node.__inkSelfHasAnsiSgr;
  node.textContent = textContent;

  const nextSelfAnsi = detectNodeSelfAnsi(textContent);
  const ansiDelta = previousSelfAnsi === nextSelfAnsi ? 0 : nextSelfAnsi ? 1 : -1;
  if (ansiDelta !== 0) {
    node.__inkSelfHasAnsiSgr = nextSelfAnsi;
    node.__inkSubtreeAnsiSgrCount += ansiDelta;
    updateNodeMarkerBooleans(node);
  }
  applyDeltaForAttachedNode(node, 0, ansiDelta, true);
}
