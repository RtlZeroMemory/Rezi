import type { LayoutConstraints } from "../../layout/types.js";
import type { WidgetSize, WidgetTone, WidgetVariant } from "../../ui/designTokens.js";
import type { VNode } from "../types.js";

/* ========== Tree Widget (GitHub issue #122) ========== */

/** State information for a tree node during rendering. */
export type NodeState = Readonly<{
  /** Whether the node is expanded. */
  expanded: boolean;
  /** Whether the node is selected. */
  selected: boolean;
  /** Whether the node is focused. */
  focused: boolean;
  /** Whether the node is loading children. */
  loading: boolean;
  /** Depth level in the tree (0 = root). */
  depth: number;
  /** Whether this is the first sibling. */
  isFirst: boolean;
  /** Whether this is the last sibling. */
  isLast: boolean;
  /** Whether the node has children (or could have). */
  hasChildren: boolean;
}>;

/** Props for tree widget. */
export type TreeProps<T = unknown> = Readonly<{
  id: string;
  key?: string;
  /** Opt out of Tab focus order while keeping id-based routing available. */
  focusable?: boolean;
  /** Optional semantic label used for accessibility/debug announcements. */
  accessibleLabel?: string;
  /** Root node(s). Can be a single root or array of roots. */
  data: T | readonly T[];
  /** Function to get unique key for each node. */
  getKey: (node: T) => string;
  /** Function to get children of a node (undefined = leaf node). */
  getChildren?: (node: T) => readonly T[] | undefined;
  /** Function to check if node has children (for lazy loading). */
  hasChildren?: (node: T) => boolean;
  /** Set of expanded node keys. */
  expanded: readonly string[];
  /** Currently selected node key. */
  selected?: string;
  /** Callback when node expand/collapse state changes. */
  onChange: (node: T, expanded: boolean) => void;
  /** Callback when node is selected. */
  onSelect?: (node: T) => void;
  /** Callback when node is activated (Enter key or double-click). */
  onPress?: (node: T) => void;
  /** Custom render function for node content. */
  renderNode: (node: T, depth: number, state: NodeState) => VNode;
  /** Function to load children asynchronously. */
  loadChildren?: (node: T) => Promise<readonly T[]>;
  /** Indentation per depth level in cells (default: 2). */
  indentSize?: number;
  /** Show tree lines (├── └── │). */
  showLines?: boolean;
  /** Design system: visual variant. */
  dsVariant?: WidgetVariant;
  /** Design system: color tone. */
  dsTone?: WidgetTone;
  /** Design system: size preset. */
  dsSize?: WidgetSize;
}> &
  LayoutConstraints;
