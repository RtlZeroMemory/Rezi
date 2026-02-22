---
name: rezi-data-table
description: Add a data table with sorting, selection, and keyboard navigation. Use when displaying tabular data.
user-invocable: true
allowed-tools: Read, Glob, Grep, Edit, Write
argument-hint: "[data-source]"
metadata:
  short-description: Add data table
---

## When to use

Use this skill when:

- Displaying tabular data with rows and columns
- Need sorting, selection, or keyboard navigation on data
- Building dashboards or data-heavy screens

## Source of truth

- `packages/core/src/widgets/useTable.ts` — `useTable()` hook
- `packages/core/src/widgets/types.ts` — `TableProps`
- `packages/core/src/widgets/ui.ts` — `ui.table()`
- `packages/core/src/ui/recipes.ts` — `recipe.table()` for design-system-consistent table styling

## Steps

1. **Use the `useTable()` hook** inside a `defineWidget`:
   ```typescript
   import { defineWidget, ui, useTable } from "@rezi-ui/core";

   const DataTable = defineWidget<{ items: Item[] }>((props, ctx) => {
     const table = useTable(ctx, {
       rows: props.items,
       columns: [
         { key: "name", header: "Name", flex: 1 },
         { key: "size", header: "Size", width: 10, align: "right" },
       ],
       getRowKey: (row) => row.id,
       selectable: "multi",
     });
     return ui.table(table.props);
   }, { name: "DataTable" });
   ```

2. **Handle selection** via `table.selection` (array of selected row keys)

3. **Handle sorting** via `table.sortColumn` and `table.sortDirection`

4. **For large datasets**, consider `ui.virtualList()` instead

## Verification

- Correct columns render with headers
- Selection updates on keyboard/mouse interaction
- Sorting works in both directions
