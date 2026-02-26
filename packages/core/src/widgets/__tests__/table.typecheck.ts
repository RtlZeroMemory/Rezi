import type { TableBorderStyle, TableColumn, TableProps } from "../types.js";

type Row = Readonly<{ id: string; path: string }>;

const columnWithMiddleOverflow: TableColumn<Row> = {
  key: "path",
  header: "Path",
  overflow: "middle",
};

const columnWithInvalidOverflow: TableColumn<Row> = {
  key: "path",
  header: "Path",
  // @ts-expect-error invalid table column overflow mode
  overflow: "fade",
};

const stripeStyle: NonNullable<TableProps<Row>["stripeStyle"]> = {
  odd: ((1 << 16) | (2 << 8) | 3),
  even: ((4 << 16) | (5 << 8) | 6),
};

// @ts-expect-error missing b component
const stripeStyleInvalid: NonNullable<TableProps<Row>["stripeStyle"]> = { odd: { r: 1, g: 2 } };

const borderStyle: TableBorderStyle = {
  variant: "heavy-dashed",
  color: ((10 << 16) | (11 << 8) | 12),
};

// @ts-expect-error invalid border style variant
const borderStyleInvalid: TableBorderStyle = { variant: "triple" };

const tableWithStyleOnly: TableProps<Row> = {
  id: "table-typecheck",
  columns: [columnWithMiddleOverflow],
  data: [{ id: "r0", path: "/tmp/file.txt" }],
  getRowKey: (row) => row.id,
  stripeStyle,
  borderStyle: { variant: "double", color: ((20 << 16) | (21 << 8) | 22) },
};

void columnWithMiddleOverflow;
void columnWithInvalidOverflow;
void stripeStyle;
void stripeStyleInvalid;
void borderStyle;
void borderStyleInvalid;
void tableWithStyleOnly;
