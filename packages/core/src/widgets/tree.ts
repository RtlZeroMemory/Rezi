/**
 * packages/core/src/widgets/tree.ts — Tree widget core algorithms.
 *
 * Why: Implements the core logic for tree widgets including node flattening,
 * NodeState computation, tree line rendering, and lazy loading state.
 *
 * Algorithms:
 *   - Node flattening: DFS traversal respecting expanded state
 *   - NodeState: computed state for each visible node
 *   - Tree lines: ├── └── │ characters for visual hierarchy
 *   - Lazy loading: async children loading with loading state
 *
 * @see docs/widgets/tree.md
 */

import type { NodeState } from "./types.js";

/* ========== Flattened Node ========== */

/** A flattened node with depth and sibling information. */
export type FlattenedNode<T> = Readonly<{
  /** The original node data. */
  node: T;
  /** Depth in the tree (0 = root). */
  depth: number;
  /** Index in siblings array. */
  siblingIndex: number;
  /** Total siblings count. */
  siblingCount: number;
  /** Key of the node. */
  key: string;
  /** Key of parent node (null for roots). */
  parentKey: string | null;
  /** Whether this node has children. */
  hasChildren: boolean;
  /** Ancestor expanded states for tree line rendering. */
  ancestorIsLast: readonly boolean[];
}>;

/* ========== Node Flattening ========== */

/**
 * Flatten a tree into a list of visible nodes.
 *
 * Only includes nodes whose ancestors are all expanded.
 * Order is depth-first pre-order traversal.
 *
 * @param data - Root node(s)
 * @param getKey - Function to get node key
 * @param getChildren - Function to get node children
 * @param hasChildrenFn - Function to check if node has children
 * @param expanded - Set of expanded node keys
 * @returns Array of flattened nodes
 */
export function flattenTree<T>(
  data: T | readonly T[],
  getKey: (node: T) => string,
  getChildren: ((node: T) => readonly T[] | undefined) | undefined,
  hasChildrenFn: ((node: T) => boolean) | undefined,
  expanded: readonly string[],
  expandedSet?: ReadonlySet<string>,
): readonly FlattenedNode<T>[] {
  const result: FlattenedNode<T>[] = [];
  const expandedLookup = expandedSet ?? new Set(expanded);

  // Normalize to array of roots
  const roots: readonly T[] = Array.isArray(data) ? (data as readonly T[]) : [data as T];

  function traverse(
    nodes: readonly T[],
    depth: number,
    parentKey: string | null,
    ancestorIsLast: readonly boolean[],
  ): void {
    const siblingCount = nodes.length;

    for (let i = 0; i < siblingCount; i++) {
      const node = nodes[i];
      if (node === undefined) continue;

      const key = getKey(node);
      const children = getChildren?.(node);
      const hasChildren = hasChildrenFn ? hasChildrenFn(node) : (children?.length ?? 0) > 0;
      const isLast = i === siblingCount - 1;

      const flatNode: FlattenedNode<T> = Object.freeze({
        node,
        depth,
        siblingIndex: i,
        siblingCount,
        key,
        parentKey,
        hasChildren,
        ancestorIsLast: Object.freeze([...ancestorIsLast, isLast]),
      });

      result.push(flatNode);

      // Recurse into children if expanded
      if (hasChildren && expandedLookup.has(key) && children && children.length > 0) {
        traverse(children, depth + 1, key, flatNode.ancestorIsLast);
      }
    }
  }

  traverse(roots, 0, null, []);

  return Object.freeze(result);
}

/* ========== NodeState Computation ========== */

/**
 * Compute NodeState for a flattened node.
 *
 * @param flatNode - The flattened node
 * @param expanded - Set of expanded node keys
 * @param selected - Currently selected node key
 * @param focused - Currently focused node key
 * @param loading - Set of loading node keys
 * @returns NodeState for the node
 */
export function computeNodeState<T>(
  flatNode: FlattenedNode<T>,
  expanded: readonly string[],
  selected: string | undefined,
  focused: string | undefined,
  loading: ReadonlySet<string>,
  expandedSet?: ReadonlySet<string>,
): NodeState {
  const expandedLookup = expandedSet ?? new Set(expanded);

  return Object.freeze({
    expanded: expandedLookup.has(flatNode.key),
    selected: flatNode.key === selected,
    focused: flatNode.key === focused,
    loading: loading.has(flatNode.key),
    depth: flatNode.depth,
    isFirst: flatNode.siblingIndex === 0,
    isLast: flatNode.siblingIndex === flatNode.siblingCount - 1,
    hasChildren: flatNode.hasChildren,
  });
}

/* ========== Tree Line Characters ========== */

/** Tree line character set. */
export const TREE_CHARS = Object.freeze({
  /**
   * NOTE: Keep these ASCII.
   *
   * Some terminals/fonts render box-drawing characters with fallback glyphs or
   * ambiguous widths, which can produce "blocky" artifacts and break the visual
   * structure. ASCII is the most compatible and still reads well.
   */
  vertical: "|",
  branch: "+--",
  lastBranch: "\\--",
  horizontal: "--",
  space: "   ",
});

/**
 * Generate tree line prefix for a node.
 *
 * @param flatNode - The flattened node
 * @param showLines - Whether to show tree lines
 * @param indentSize - Characters per indent level
 * @returns String prefix for the node
 */
export function getTreeLinePrefix<T>(
  flatNode: FlattenedNode<T>,
  showLines: boolean,
  indentSize: number,
): string {
  if (flatNode.depth === 0) {
    return "";
  }

  if (!showLines) {
    // Simple indentation without lines
    return " ".repeat(flatNode.depth * indentSize);
  }

  // Build tree line prefix
  const parts: string[] = [];

  // Add ancestor lines (excluding the last which is for current node)
  for (let i = 0; i < flatNode.depth - 1; i++) {
    const isLast = flatNode.ancestorIsLast[i];
    if (isLast) {
      // Ancestor was last child, no continuing line
      parts.push(TREE_CHARS.space);
    } else {
      // Ancestor has siblings below, show continuing line
      parts.push(`${TREE_CHARS.vertical}  `);
    }
  }

  // Add branch for current node
  const isLast = flatNode.siblingIndex === flatNode.siblingCount - 1;
  parts.push(isLast ? TREE_CHARS.lastBranch : TREE_CHARS.branch);

  return parts.join("");
}

/* ========== Navigation ========== */

/**
 * Find the index of a node in the flattened list by key.
 *
 * @param flatNodes - Flattened node list
 * @param key - Node key to find
 * @returns Index or -1 if not found
 */
export function findNodeIndex<T>(flatNodes: readonly FlattenedNode<T>[], key: string): number {
  for (let i = 0; i < flatNodes.length; i++) {
    const node = flatNodes[i];
    if (node?.key === key) {
      return i;
    }
  }
  return -1;
}

/**
 * Find the parent node in the flattened list.
 *
 * @param flatNodes - Flattened node list
 * @param currentIndex - Current node index
 * @returns Parent node index or -1 if at root
 */
export function findParentIndex<T>(
  flatNodes: readonly FlattenedNode<T>[],
  currentIndex: number,
): number {
  const current = flatNodes[currentIndex];
  if (!current || current.parentKey === null) {
    return -1;
  }

  return findNodeIndex(flatNodes, current.parentKey);
}

/**
 * Find the first child node in the flattened list.
 *
 * @param flatNodes - Flattened node list
 * @param currentIndex - Current node index
 * @returns First child index or -1 if no children visible
 */
export function findFirstChildIndex<T>(
  flatNodes: readonly FlattenedNode<T>[],
  currentIndex: number,
): number {
  const current = flatNodes[currentIndex];
  if (!current) return -1;

  const nextIndex = currentIndex + 1;
  const next = flatNodes[nextIndex];

  // Check if next node is a child (depth is current + 1 and has current as parent)
  if (next && next.parentKey === current.key && next.depth === current.depth + 1) {
    return nextIndex;
  }

  return -1;
}

/* ========== Expand/Collapse Operations ========== */

/**
 * Add a key to the expanded set.
 *
 * @param expanded - Current expanded keys
 * @param key - Key to add
 * @returns New expanded set
 */
export function expandNode(expanded: readonly string[], key: string): readonly string[] {
  if (expanded.includes(key)) {
    return expanded;
  }
  return Object.freeze([...expanded, key]);
}

/**
 * Remove a key from the expanded set.
 *
 * @param expanded - Current expanded keys
 * @param key - Key to remove
 * @returns New expanded set
 */
export function collapseNode(expanded: readonly string[], key: string): readonly string[] {
  const index = expanded.indexOf(key);
  if (index === -1) {
    return expanded;
  }
  const result = expanded.filter((k) => k !== key);
  return Object.freeze(result);
}

/**
 * Toggle a node's expanded state.
 *
 * @param expanded - Current expanded keys
 * @param key - Key to toggle
 * @returns New expanded set and whether it's now expanded
 */
export function toggleExpanded(
  expanded: readonly string[],
  key: string,
): { expanded: readonly string[]; isExpanded: boolean } {
  const isCurrentlyExpanded = expanded.includes(key);

  if (isCurrentlyExpanded) {
    return {
      expanded: collapseNode(expanded, key),
      isExpanded: false,
    };
  }

  return {
    expanded: expandNode(expanded, key),
    isExpanded: true,
  };
}

/**
 * Expand all siblings of a node (nodes at the same depth with same parent).
 *
 * @param flatNodes - Flattened node list
 * @param currentIndex - Current node index
 * @param expanded - Current expanded keys
 * @returns New expanded set with all siblings expanded
 */
export function expandAllSiblings<T>(
  flatNodes: readonly FlattenedNode<T>[],
  currentIndex: number,
  expanded: readonly string[],
): readonly string[] {
  const current = flatNodes[currentIndex];
  if (!current) return expanded;

  const siblingKeys: string[] = [];

  // Find all siblings (same parentKey and depth)
  for (let i = 0; i < flatNodes.length; i++) {
    const node = flatNodes[i];
    if (
      node &&
      node.parentKey === current.parentKey &&
      node.depth === current.depth &&
      node.hasChildren
    ) {
      siblingKeys.push(node.key);
    }
  }

  // Add all siblings to expanded set
  const expandedSet = new Set(expanded);
  const originalSize = expandedSet.size;
  for (const key of siblingKeys) {
    expandedSet.add(key);
  }

  // Return same reference if nothing changed
  if (expandedSet.size === originalSize) {
    return expanded;
  }

  return Object.freeze([...expandedSet]);
}

/* ========== Lazy Loading State ========== */

/**
 * Create a loading state tracker.
 */
export type LoadingState = Readonly<{
  /** Set of node keys currently loading. */
  loading: ReadonlySet<string>;
  /** Add a key to loading state. */
  startLoading: (key: string) => LoadingState;
  /** Remove a key from loading state. */
  finishLoading: (key: string) => LoadingState;
  /** Check if a key is loading. */
  isLoading: (key: string) => boolean;
}>;

/**
 * Create a new loading state.
 *
 * @param initial - Initial loading keys
 * @returns LoadingState object
 */
export function createLoadingState(initial: readonly string[] = []): LoadingState {
  const loading = new Set(initial);

  const state: LoadingState = Object.freeze({
    loading: loading as ReadonlySet<string>,
    startLoading: (key: string): LoadingState => {
      if (loading.has(key)) {
        return state;
      }
      return createLoadingState([...loading, key]);
    },
    finishLoading: (key: string): LoadingState => {
      if (!loading.has(key)) {
        return state;
      }
      return createLoadingState([...loading].filter((k) => k !== key));
    },
    isLoading: (key: string): boolean => loading.has(key),
  });

  return state;
}

/* ========== Expand/Collapse Indicators ========== */

/** Expand/collapse indicator characters. */
export const EXPAND_INDICATORS = Object.freeze({
  /** Expanded indicator ▼ */
  expanded: "▼",
  /** Collapsed indicator ▶ */
  collapsed: "▶",
  /** Leaf (no children) indicator */
  leaf: " ",
  /** Loading indicator */
  loading: "◌",
});

/**
 * Get expand/collapse indicator for a node.
 *
 * @param hasChildren - Whether node has children
 * @param isExpanded - Whether node is expanded
 * @param isLoading - Whether node is loading
 * @returns Indicator character
 */
export function getExpandIndicator(
  hasChildren: boolean,
  isExpanded: boolean,
  isLoading: boolean,
): string {
  if (isLoading) {
    return EXPAND_INDICATORS.loading;
  }
  if (!hasChildren) {
    return EXPAND_INDICATORS.leaf;
  }
  return isExpanded ? EXPAND_INDICATORS.expanded : EXPAND_INDICATORS.collapsed;
}

/* ========== Total Visible Nodes ========== */

/**
 * Count total visible nodes for virtualization.
 *
 * @param flatNodes - Flattened node list
 * @returns Total count
 */
export function getTotalVisibleNodes<T>(flatNodes: readonly FlattenedNode<T>[]): number {
  return flatNodes.length;
}

/* ========== Navigate to Sibling ========== */

/**
 * Find the next sibling node.
 *
 * @param flatNodes - Flattened node list
 * @param currentIndex - Current node index
 * @returns Next sibling index or -1 if none
 */
export function findNextSiblingIndex<T>(
  flatNodes: readonly FlattenedNode<T>[],
  currentIndex: number,
): number {
  const current = flatNodes[currentIndex];
  if (!current) return -1;

  // Scan forward for a sibling (same parent and depth)
  for (let i = currentIndex + 1; i < flatNodes.length; i++) {
    const node = flatNodes[i];
    if (!node) continue;

    // Stop if we go back up to a shallower depth
    if (node.depth < current.depth) {
      break;
    }

    // Found sibling
    if (node.depth === current.depth && node.parentKey === current.parentKey) {
      return i;
    }
  }

  return -1;
}

/**
 * Find the previous sibling node.
 *
 * @param flatNodes - Flattened node list
 * @param currentIndex - Current node index
 * @returns Previous sibling index or -1 if none
 */
export function findPrevSiblingIndex<T>(
  flatNodes: readonly FlattenedNode<T>[],
  currentIndex: number,
): number {
  const current = flatNodes[currentIndex];
  if (!current) return -1;

  // Scan backward for a sibling (same parent and depth)
  for (let i = currentIndex - 1; i >= 0; i--) {
    const node = flatNodes[i];
    if (!node) continue;

    // Found sibling
    if (node.depth === current.depth && node.parentKey === current.parentKey) {
      return i;
    }

    // Stop if we encounter a node at a shallower depth
    if (node.depth < current.depth) {
      break;
    }
  }

  return -1;
}
