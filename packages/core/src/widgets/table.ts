/**
 * packages/core/src/widgets/table.ts — Table widget core algorithms.
 *
 * Why: Implements the core logic for table widgets including column width
 * distribution, row selection state management, and virtualization support.
 *
 * Algorithms:
 *   - Column width distribution: flex-based layout with min/max constraints
 *   - Selection: single/multi mode with shift-click range support
 *   - Virtualization: reuses virtualList algorithms for row windowing
 *
 * @see docs/widgets/table.md
 */

import type { TableColumn } from "./types.js";

// Re-export for convenience
export type { TableColumn } from "./types.js";

/* ========== Column Width Distribution ========== */

/** Result of distributing column widths. */
export type ColumnWidthResult = Readonly<{
  /** Computed width for each column. */
  widths: readonly number[];
  /** Total width of all columns. */
  totalWidth: number;
}>;

/**
 * Distribute available width among table columns.
 *
 * Algorithm:
 * 1. Assign fixed widths to columns with explicit width
 * 2. Calculate remaining space after fixed columns
 * 3. Distribute remaining space to flex columns proportionally
 * 4. Apply min/max constraints to flex columns
 * 5. Redistribute overflow from constrained columns
 *
 * @param columns - Column definitions
 * @param availableWidth - Total available width in cells
 * @returns Column widths and total width
 */
export function distributeColumnWidths<T>(
  columns: readonly TableColumn<T>[],
  availableWidth: number,
): ColumnWidthResult {
  const n = columns.length;
  if (n === 0) {
    return Object.freeze({ widths: Object.freeze([]), totalWidth: 0 });
  }

  const widths = new Array<number>(n).fill(0);
  let remainingWidth = availableWidth;
  let totalFlex = 0;
  const flexRemainders: Array<Readonly<{ index: number; remainder: number }>> = [];

  // Pass 1: Assign fixed widths and calculate total flex
  for (let i = 0; i < n; i++) {
    const col = columns[i];
    if (col === undefined) continue;

    if (col.width !== undefined) {
      // Fixed width column
      const width = Math.max(0, col.width);
      widths[i] = width;
      remainingWidth -= width;
    } else {
      // Flex column (default flex: 1)
      const flex = col.flex ?? 1;
      totalFlex += flex;
    }
  }

  // Pass 2: Distribute remaining width to flex columns
  if (totalFlex > 0 && remainingWidth > 0) {
    const widthPerFlex = remainingWidth / totalFlex;

    for (let i = 0; i < n; i++) {
      const col = columns[i];
      if (col === undefined) continue;

      if (col.width === undefined) {
        const flex = col.flex ?? 1;
        const rawWidth = widthPerFlex * flex;
        let width = Math.floor(rawWidth);

        // Apply min/max constraints
        if (col.minWidth !== undefined) {
          width = Math.max(width, col.minWidth);
        }
        if (col.maxWidth !== undefined) {
          width = Math.min(width, col.maxWidth);
        }

        widths[i] = Math.max(0, width);
        flexRemainders.push(
          Object.freeze({
            index: i,
            remainder: rawWidth - Math.floor(rawWidth),
          }),
        );
      }
    }

    let totalAssignedWidth = 0;
    for (let i = 0; i < n; i++) {
      const width = widths[i];
      if (width !== undefined) totalAssignedWidth += width;
    }

    let leftoverWidth = Math.max(0, availableWidth - totalAssignedWidth);
    if (leftoverWidth > 0 && flexRemainders.length > 0) {
      const remainderOrder = [...flexRemainders].sort((a, b) => {
        if (b.remainder !== a.remainder) return b.remainder - a.remainder;
        return a.index - b.index;
      });

      let distributed = true;
      while (leftoverWidth > 0 && distributed) {
        distributed = false;
        for (let i = 0; i < remainderOrder.length; i++) {
          const candidate = remainderOrder[i];
          if (!candidate) continue;

          const col = columns[candidate.index];
          if (!col || col.width !== undefined) continue;

          const currentWidth = widths[candidate.index] ?? 0;
          if (col.maxWidth !== undefined && currentWidth >= col.maxWidth) continue;

          widths[candidate.index] = currentWidth + 1;
          leftoverWidth--;
          distributed = true;
          if (leftoverWidth === 0) break;
        }
      }
    }
  }

  // Calculate total width
  let totalWidth = 0;
  for (let i = 0; i < n; i++) {
    const w = widths[i];
    if (w !== undefined) {
      totalWidth += w;
    }
  }

  return Object.freeze({
    widths: Object.freeze(widths),
    totalWidth,
  });
}

/* ========== Selection State ========== */

/** Selection mode for table rows. */
export type TableSelectionMode = "none" | "single" | "multi";

/** Result of a selection operation. */
export type SelectionResult = Readonly<{
  /** New set of selected keys. */
  selection: readonly string[];
  /** Whether selection changed. */
  changed: boolean;
}>;

/**
 * Compute new selection state after clicking a row.
 *
 * @param currentSelection - Current selected keys
 * @param rowKey - Key of clicked row
 * @param mode - Selection mode
 * @param modifiers - Keyboard modifiers (shift, ctrl/cmd)
 * @param allRowKeys - All row keys for shift-select range
 * @param lastClickedKey - Previously clicked key for shift-select
 * @param rowKeyToIndex - Optional pre-built index map for O(1) lookup (recommended for large tables)
 * @returns New selection state
 */
export function computeSelection(
  currentSelection: readonly string[],
  rowKey: string,
  mode: TableSelectionMode,
  modifiers: { shift: boolean; ctrl: boolean },
  allRowKeys: readonly string[],
  lastClickedKey: string | null,
  rowKeyToIndex?: ReadonlyMap<string, number>,
): SelectionResult {
  if (mode === "none") {
    return Object.freeze({ selection: Object.freeze([]), changed: false });
  }

  if (mode === "single") {
    // Single mode: clicking selects only that row
    const isSelected = currentSelection.includes(rowKey);
    if (isSelected && currentSelection.length === 1) {
      return Object.freeze({ selection: currentSelection, changed: false });
    }
    return Object.freeze({
      selection: Object.freeze([rowKey]),
      changed: true,
    });
  }

  // Multi mode
  if (modifiers.shift && lastClickedKey !== null) {
    // Shift-click: select range from last clicked to current
    // Use O(1) map lookup if available, otherwise fall back to O(n) indexOf
    const startIdx = rowKeyToIndex?.get(lastClickedKey) ?? allRowKeys.indexOf(lastClickedKey);
    const endIdx = rowKeyToIndex?.get(rowKey) ?? allRowKeys.indexOf(rowKey);

    if (startIdx === -1 || endIdx === -1) {
      // Fallback: just toggle current row
      return toggleSelection(currentSelection, rowKey);
    }

    const minIdx = Math.min(startIdx, endIdx);
    const maxIdx = Math.max(startIdx, endIdx);

    // Build new selection including the range
    const rangeKeys = allRowKeys.slice(minIdx, maxIdx + 1);
    const newSelection = new Set(currentSelection);
    for (const key of rangeKeys) {
      newSelection.add(key);
    }

    const result = [...newSelection];
    return Object.freeze({
      selection: Object.freeze(result),
      changed: result.length !== currentSelection.length,
    });
  }

  if (modifiers.ctrl) {
    // Ctrl-click: toggle selection
    return toggleSelection(currentSelection, rowKey);
  }

  // Plain click: select only this row
  const isOnlySelected = currentSelection.length === 1 && currentSelection[0] === rowKey;
  if (isOnlySelected) {
    return Object.freeze({ selection: currentSelection, changed: false });
  }

  return Object.freeze({
    selection: Object.freeze([rowKey]),
    changed: true,
  });
}

/**
 * Toggle selection of a single row.
 */
function toggleSelection(currentSelection: readonly string[], rowKey: string): SelectionResult {
  const isSelected = currentSelection.includes(rowKey);

  if (isSelected) {
    const newSelection = currentSelection.filter((k) => k !== rowKey);
    return Object.freeze({
      selection: Object.freeze(newSelection),
      changed: true,
    });
  }

  const newSelection = [...currentSelection, rowKey];
  return Object.freeze({
    selection: Object.freeze(newSelection),
    changed: true,
  });
}

/**
 * Select all rows.
 *
 * @param allRowKeys - All row keys
 * @param currentSelection - Current selection
 * @returns New selection with all rows selected
 */
export function selectAll(
  allRowKeys: readonly string[],
  currentSelection: readonly string[],
): SelectionResult {
  if (currentSelection.length === allRowKeys.length) {
    // Check if already all selected - use Set for O(n) instead of O(n²)
    const selectionSet = new Set(currentSelection);
    const allSelected = allRowKeys.every((k) => selectionSet.has(k));
    if (allSelected) {
      return Object.freeze({ selection: currentSelection, changed: false });
    }
  }

  return Object.freeze({
    selection: allRowKeys,
    changed: true,
  });
}

/**
 * Clear all selection.
 *
 * @param currentSelection - Current selection
 * @returns Empty selection
 */
export function clearSelection(currentSelection: readonly string[]): SelectionResult {
  if (currentSelection.length === 0) {
    return Object.freeze({ selection: currentSelection, changed: false });
  }

  return Object.freeze({
    selection: Object.freeze([]),
    changed: true,
  });
}

/* ========== Sort State ========== */

/** Sort direction. */
export type SortDirection = "asc" | "desc";

/** Result of toggling sort. */
export type SortResult = Readonly<{
  column: string;
  direction: SortDirection;
}>;

/**
 * Compute next sort state when clicking a column header.
 *
 * Logic:
 * - Clicking unsorted column → sort ascending
 * - Clicking ascending column → sort descending
 * - Clicking descending column → sort ascending (cycle)
 *
 * @param currentColumn - Currently sorted column (or undefined)
 * @param currentDirection - Current sort direction
 * @param clickedColumn - Clicked column key
 * @returns New sort state
 */
export function toggleSort(
  currentColumn: string | undefined,
  currentDirection: SortDirection | undefined,
  clickedColumn: string,
): SortResult {
  if (currentColumn !== clickedColumn) {
    // New column: start ascending
    return Object.freeze({ column: clickedColumn, direction: "asc" });
  }

  // Same column: toggle direction
  const newDirection = currentDirection === "asc" ? "desc" : "asc";
  return Object.freeze({ column: clickedColumn, direction: newDirection });
}

/* ========== Row Key Extraction ========== */

/**
 * Extract row keys from data using getRowKey function.
 *
 * @param data - Row data array
 * @param getRowKey - Function to extract key from row
 * @returns Array of row keys
 */
export function extractRowKeys<T>(
  data: readonly T[],
  getRowKey: (row: T, index: number) => string,
): readonly string[] {
  const keys = new Array<string>(data.length);
  for (let i = 0; i < data.length; i++) {
    const row = data[i];
    if (row !== undefined) {
      keys[i] = getRowKey(row, i);
    } else {
      keys[i] = `__empty_${i}`;
    }
  }
  return Object.freeze(keys);
}

/**
 * Build an index map from row keys for O(1) lookups.
 *
 * This is an optimization for large tables to avoid O(n) indexOf() calls
 * during shift-click range selection. For tables with <1000 rows, the
 * overhead of building this map may not be worth it.
 *
 * @param rowKeys - Array of row keys (from extractRowKeys)
 * @returns Map from row key to index
 */
export function buildRowKeyIndex(rowKeys: readonly string[]): ReadonlyMap<string, number> {
  const map = new Map<string, number>();
  for (let i = 0; i < rowKeys.length; i++) {
    const key = rowKeys[i];
    if (key !== undefined) {
      map.set(key, i);
    }
  }
  return map;
}

/* ========== Sort Indicator ========== */

/** Sort indicator characters. */
export const SORT_INDICATOR_ASC = "▲";
export const SORT_INDICATOR_DESC = "▼";

/**
 * Get sort indicator for a column header.
 *
 * @param columnKey - Column key
 * @param sortColumn - Currently sorted column
 * @param sortDirection - Current sort direction
 * @returns Sort indicator string or empty string
 */
export function getSortIndicator(
  columnKey: string,
  sortColumn: string | undefined,
  sortDirection: SortDirection | undefined,
): string {
  if (sortColumn !== columnKey) {
    return "";
  }
  return sortDirection === "asc" ? SORT_INDICATOR_ASC : SORT_INDICATOR_DESC;
}

/* ========== Cell Alignment ========== */

/** Cell alignment type. */
export type CellAlign = "left" | "center" | "right";

/**
 * Pad text to fit within a cell with specified alignment.
 *
 * @param text - Text content
 * @param width - Cell width
 * @param align - Alignment
 * @returns Padded text
 */
export function alignCellText(text: string, width: number, align: CellAlign): string {
  const textLength = text.length;

  if (textLength >= width) {
    // Truncate if too long
    return text.slice(0, width);
  }

  const padding = width - textLength;

  switch (align) {
    case "right":
      return " ".repeat(padding) + text;
    case "center": {
      const leftPad = Math.floor(padding / 2);
      const rightPad = padding - leftPad;
      return " ".repeat(leftPad) + text + " ".repeat(rightPad);
    }
    case "left":
      return text + " ".repeat(padding);
  }
}

/* ========== Focused Row Navigation ========== */

/**
 * Compute row index from row key.
 *
 * @param rowKeys - All row keys
 * @param rowKey - Key to find
 * @returns Index or -1 if not found
 */
export function getRowIndex(rowKeys: readonly string[], rowKey: string): number {
  return rowKeys.indexOf(rowKey);
}

/**
 * Compute row key from row index.
 *
 * @param rowKeys - All row keys
 * @param index - Row index
 * @returns Row key or undefined if out of bounds
 */
export function getRowKeyAtIndex(rowKeys: readonly string[], index: number): string | undefined {
  if (index < 0 || index >= rowKeys.length) {
    return undefined;
  }
  return rowKeys[index];
}
