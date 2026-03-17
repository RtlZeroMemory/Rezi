import type { FocusConfig } from "../../focus/styles.js";
import type { LayoutConstraints } from "../../layout/types.js";
import type { WidgetSize, WidgetTone } from "../../ui/designTokens.js";
import type { TextStyle } from "../style.js";
import type { VNode } from "../types.js";

/* ========== Table Widget (GitHub issue #118) ========== */

/** Overflow behavior for table header/cell text. */
export type TableColumnOverflow = "clip" | "ellipsis" | "middle";

/** Row stripe styling for table body backgrounds. */
export type TableStripeStyle = Readonly<{
  /** Background color for odd body rows (0-based index: 1, 3, 5, ...). */
  odd?: NonNullable<TextStyle["bg"]>;
  /** Background color for even body rows (0-based index: 0, 2, 4, ...). */
  even?: NonNullable<TextStyle["bg"]>;
}>;

/** Border glyph variants supported by table borders. */
export type TableBorderVariant =
  | "single"
  | "double"
  | "rounded"
  | "heavy"
  | "dashed"
  | "heavy-dashed";

/** Border styling options for tables. */
export type TableBorderStyle = Readonly<{
  /** Border glyph variant (default: "single"). */
  variant?: TableBorderVariant;
  /** Border foreground color override. */
  color?: NonNullable<TextStyle["fg"]>;
}>;

/** Column definition for table widget. */
export type TableColumn<T = unknown> = Readonly<{
  /** Unique column identifier. */
  key: string;
  /** Column header text. */
  header: string;
  /** Fixed width in cells. */
  width?: number;
  /** Minimum width in cells. */
  minWidth?: number;
  /** Maximum width in cells. */
  maxWidth?: number;
  /** Flex factor for distributing remaining space. */
  flex?: number;
  /** Custom render function for cell content. */
  render?: (value: unknown, row: T, index: number) => VNode;
  /** Cell content alignment. */
  align?: "left" | "center" | "right";
  /** Overflow handling for this column (default: "ellipsis"). */
  overflow?: TableColumnOverflow;
  /** Whether column is sortable. */
  sortable?: boolean;
}>;

/** Props for table widget. */
export type TableProps<T = unknown> = Readonly<{
  id: string;
  key?: string;
  /** Opt out of Tab focus order while keeping id-based routing available. */
  focusable?: boolean;
  /** Optional semantic label used for accessibility/debug announcements. */
  accessibleLabel?: string;
  /** Column definitions. */
  columns: readonly TableColumn<T>[];
  /** Row data array. */
  data: readonly T[];
  /** Function to get unique key for each row. */
  getRowKey: (row: T, index: number) => string;
  /** Height of each row in cells (default: 1). */
  rowHeight?: number;
  /** Height of header row in cells (default: 1). */
  headerHeight?: number;
  /** Currently selected row keys. */
  selection?: readonly string[];
  /** Selection mode (default: "none"). */
  selectionMode?: "none" | "single" | "multi";
  /** Callback when selection changes. */
  onSelectionChange?: (keys: readonly string[]) => void;
  /** Currently sorted column key. */
  sortColumn?: string;
  /** Sort direction. */
  sortDirection?: "asc" | "desc";
  /** Callback when sort changes. */
  onSort?: (column: string, direction: "asc" | "desc") => void;
  /** Callback when row is pressed (Enter key or click). */
  onRowPress?: (row: T, index: number) => void;
  /** Callback when row is double-pressed (double-click). */
  onRowDoublePress?: (row: T, index: number) => void;
  /** Enable virtualization for large datasets (default: true). */
  virtualized?: boolean;
  /** Number of rows to render outside viewport (default: 3). */
  overscan?: number;
  /** Legacy stripe toggle. */
  stripedRows?: boolean;
  /** Stripe background styling for body rows. */
  stripeStyle?: TableStripeStyle;
  /** Optional style override for selected rows. */
  selectionStyle?: TextStyle;
  /** Show header row (default: true). */
  showHeader?: boolean;
  /** Legacy border toggle. */
  border?: "none" | "single";
  /** Border styling for rendered table frame. */
  borderStyle?: TableBorderStyle;
  /** Optional focus appearance configuration. */
  focusConfig?: FocusConfig;
  /** Design system: size preset. */
  dsSize?: WidgetSize;
  /** Design system: tone (reserved for future table recipe variants). */
  dsTone?: WidgetTone;
}> &
  LayoutConstraints;
