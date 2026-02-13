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
  odd: { r: 1, g: 2, b: 3 },
  even: { r: 4, g: 5, b: 6 },
};

// @ts-expect-error missing b component
const stripeStyleInvalid: NonNullable<TableProps<Row>["stripeStyle"]> = { odd: { r: 1, g: 2 } };

const borderStyle: TableBorderStyle = {
  variant: "heavy-dashed",
  color: { r: 10, g: 11, b: 12 },
};

// @ts-expect-error invalid border style variant
const borderStyleInvalid: TableBorderStyle = { variant: "triple" };

const tableWithStyleOnly: TableProps<Row> = {
  id: "table-typecheck",
  columns: [columnWithMiddleOverflow],
  data: [{ id: "r0", path: "/tmp/file.txt" }],
  getRowKey: (row) => row.id,
  stripeStyle,
  borderStyle: { variant: "double", color: { r: 20, g: 21, b: 22 } },
};

void columnWithMiddleOverflow;
void columnWithInvalidOverflow;
void stripeStyle;
void stripeStyleInvalid;
void borderStyle;
void borderStyleInvalid;
void tableWithStyleOnly;
