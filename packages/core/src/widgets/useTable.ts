/**
 * packages/core/src/widgets/useTable.ts — Convenience hook for table state wiring.
 */

import type { WidgetContext } from "./composition.js";
import type { SortDirection, TableSelectionMode } from "./table.js";
import type { TableColumn, TableProps } from "./types.js";

export type UseTableOptions<T> = Readonly<
  Omit<
    TableProps<T>,
    | "id"
    | "columns"
    | "data"
    | "getRowKey"
    | "selection"
    | "selectionMode"
    | "onSelectionChange"
    | "sortColumn"
    | "sortDirection"
    | "onSort"
  > & {
    id?: string;
    rows: readonly T[];
    columns: readonly TableColumn<T>[];
    getRowKey?: (row: T, index: number) => string;
    selectable?: TableSelectionMode;
    sortable?: boolean;
    defaultSelection?: readonly string[];
    defaultSortColumn?: string;
    defaultSortDirection?: SortDirection;
    onSelectionChange?: (keys: readonly string[]) => void;
    onSortChange?: (column: string, direction: SortDirection) => void;
  }
>;

export type UseTableResult<T> = Readonly<{
  props: TableProps<T>;
  rows: readonly T[];
  selection: readonly string[];
  sortColumn: string | undefined;
  sortDirection: SortDirection | undefined;
  clearSelection: () => void;
  setSort: (column: string, direction: SortDirection) => void;
}>;

type RecordLike = Readonly<{ id?: unknown }> & Record<string, unknown>;

function defaultGetRowKey<T>(row: T, index: number): string {
  const record = row as RecordLike;
  const maybeId = record.id;
  if (typeof maybeId === "string" && maybeId.length > 0) return maybeId;
  if (typeof maybeId === "number") return String(maybeId);
  return String(index);
}

function getSortValue<T>(row: T, key: string): unknown {
  const record = row as RecordLike;
  return record[key];
}

function compareSortValues(a: unknown, b: unknown): number {
  if (a === b) return 0;
  if (a === undefined || a === null) return 1;
  if (b === undefined || b === null) return -1;

  if (typeof a === "number" && typeof b === "number") {
    if (Number.isNaN(a) && Number.isNaN(b)) return 0;
    if (Number.isNaN(a)) return 1;
    if (Number.isNaN(b)) return -1;
    return a - b;
  }

  if (typeof a === "boolean" && typeof b === "boolean") {
    return Number(a) - Number(b);
  }

  if (a instanceof Date && b instanceof Date) {
    return a.getTime() - b.getTime();
  }

  const as = String(a);
  const bs = String(b);
  if (as < bs) return -1;
  if (as > bs) return 1;
  return 0;
}

function sortRows<T>(
  rows: readonly T[],
  sortColumn: string,
  sortDirection: SortDirection,
): readonly T[] {
  const withIndex = rows.map((row, index) => ({
    row,
    index,
    value: getSortValue(row, sortColumn),
  }));

  withIndex.sort((a, b) => {
    const cmp = compareSortValues(a.value, b.value);
    if (cmp !== 0) return sortDirection === "asc" ? cmp : -cmp;
    return a.index - b.index;
  });

  return Object.freeze(withIndex.map((item) => item.row));
}

export function useTable<T, State = void>(
  ctx: WidgetContext<State>,
  options: UseTableOptions<T>,
): UseTableResult<T> {
  const {
    id,
    rows,
    columns: inputColumns,
    getRowKey: getRowKeyInput,
    selectable = "none",
    sortable = false,
    defaultSelection = [],
    defaultSortColumn,
    defaultSortDirection = "asc",
    onSelectionChange,
    onSortChange,
    ...rest
  } = options;

  const generatedIdRef = ctx.useRef<string>(id ?? ctx.id("table"));
  const tableId = id ?? generatedIdRef.current;

  const getRowKey = ctx.useCallback(
    (row: T, index: number) =>
      getRowKeyInput ? getRowKeyInput(row, index) : defaultGetRowKey(row, index),
    [getRowKeyInput],
  );

  const [selection, setSelection] = ctx.useState<readonly string[]>(() =>
    Object.freeze(defaultSelection.slice()),
  );
  const [sortColumn, setSortColumn] = ctx.useState<string | undefined>(defaultSortColumn);
  const [sortDirection, setSortDirection] = ctx.useState<SortDirection | undefined>(
    defaultSortColumn ? defaultSortDirection : undefined,
  );

  const columns = ctx.useMemo<readonly TableColumn<T>[]>(() => {
    if (!sortable) return inputColumns;
    let changed = false;
    const next = inputColumns.map((column) => {
      if (column.sortable !== undefined) return column;
      changed = true;
      return { ...column, sortable: true };
    });
    return changed ? Object.freeze(next) : inputColumns;
  }, [inputColumns, sortable]);

  const sortedRows = ctx.useMemo<readonly T[]>(() => {
    if (!sortable || sortColumn === undefined || sortDirection === undefined) {
      return rows;
    }
    const col = columns.find((c) => c.key === sortColumn);
    if (!col || col.sortable === false) return rows;
    return sortRows(rows, sortColumn, sortDirection);
  }, [rows, columns, sortable, sortColumn, sortDirection]);

  ctx.useEffect(() => {
    const liveKeys = new Set(rows.map((row, index) => getRowKey(row, index)));
    let prunedSelection: readonly string[] | null = null;
    setSelection((prev) => {
      if (prev.length === 0) return prev;
      const next = prev.filter((key) => liveKeys.has(key));
      if (next.length === prev.length) return prev;
      const frozen = Object.freeze(next);
      prunedSelection = frozen;
      return frozen;
    });
    if (prunedSelection) {
      onSelectionChange?.(prunedSelection);
    }
  }, [rows, getRowKey, onSelectionChange]);

  ctx.useEffect(() => {
    if (!sortable) {
      if (sortColumn !== undefined || sortDirection !== undefined) {
        setSortColumn(undefined);
        setSortDirection(undefined);
      }
      return;
    }
    if (sortColumn === undefined) return;
    if (!columns.some((column) => column.key === sortColumn)) {
      setSortColumn(undefined);
      setSortDirection(undefined);
    }
  }, [sortable, columns, sortColumn, sortDirection]);

  const handleSelectionChange = ctx.useCallback(
    (keys: readonly string[]) => {
      const next = Object.freeze(keys.slice());
      setSelection(next);
      onSelectionChange?.(next);
    },
    [onSelectionChange],
  );

  const handleSort = ctx.useCallback(
    (column: string, direction: SortDirection) => {
      setSortColumn(column);
      setSortDirection(direction);
      onSortChange?.(column, direction);
    },
    [onSortChange],
  );

  const clearSelection = ctx.useCallback(() => {
    setSelection((prev) => (prev.length === 0 ? prev : Object.freeze([])));
  }, []);

  const setSort = ctx.useCallback(
    (column: string, direction: SortDirection) => {
      setSortColumn(column);
      setSortDirection(direction);
      onSortChange?.(column, direction);
    },
    [onSortChange],
  );

  const props = ctx.useMemo<TableProps<T>>(
    () =>
      Object.freeze({
        ...rest,
        id: tableId,
        columns,
        data: sortedRows,
        getRowKey,
        ...(selectable === "none"
          ? {}
          : {
              selection,
              selectionMode: selectable,
              onSelectionChange: handleSelectionChange,
            }),
        ...(sortable
          ? {
              onSort: handleSort,
            }
          : {}),
        ...(sortable && sortColumn !== undefined ? { sortColumn } : {}),
        ...(sortable && sortDirection !== undefined ? { sortDirection } : {}),
      }),
    [
      rest,
      tableId,
      columns,
      sortedRows,
      getRowKey,
      selectable,
      selection,
      handleSelectionChange,
      sortable,
      sortColumn,
      sortDirection,
      handleSort,
    ],
  );

  return Object.freeze({
    props,
    rows: sortedRows,
    selection,
    sortColumn,
    sortDirection,
    clearSelection,
    setSort,
  });
}
