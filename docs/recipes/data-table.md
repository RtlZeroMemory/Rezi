# Data Table

Building sortable, filterable data tables in Rezi.

## Problem

You need to display tabular data with sorting and filtering capabilities.

## Solution

Use the built-in `ui.table` widget, and keep sort/filter state in your app state.

## Complete Example

```typescript
import { createApp, ui } from "@rezi-ui/core";
import { createNodeBackend } from "@rezi-ui/node";

type User = { id: string; name: string; email: string; role: string };
type SortDirection = "asc" | "desc";

type State = {
  users: User[];
  sort: { column: string; direction: SortDirection };
  filter: string;
  selection: string[];
};

function filterUsers(users: User[], filter: string): User[] {
  if (!filter) return users;
  const lower = filter.toLowerCase();
  return users.filter(
    (u) => u.name.toLowerCase().includes(lower) || u.email.toLowerCase().includes(lower)
  );
}

const app = createApp<State>({
  backend: createNodeBackend(),
  initialState: {
    users: [
      { id: "1", name: "Ada", email: "ada@example.com", role: "Admin" },
      { id: "2", name: "Linus", email: "linus@example.com", role: "User" },
      { id: "3", name: "Grace", email: "grace@example.com", role: "User" },
    ],
    sort: { column: "name", direction: "asc" },
    filter: "",
    selection: [],
  },
});

app.view((state) => {
  const filtered = filterUsers(state.users, state.filter);

  return ui.column({ flex: 1, gap: 1, p: 1 }, [
    ui.row({ gap: 1 }, [
      ui.text("Search:"),
      ui.input({
        id: "filter",
        value: state.filter,
        onInput: (value) => app.update((s) => ({ ...s, filter: value })),
      }),
    ]),

    ui.table({
      id: "users",
      data: filtered,
      getRowKey: (u) => u.id,
      columns: [
        { key: "name", header: "Name", flex: 1, sortable: true },
        { key: "email", header: "Email", flex: 2, sortable: true },
        { key: "role", header: "Role", width: 10, sortable: true },
      ],
      selectionMode: "multi",
      selection: state.selection,
      onSelectionChange: (keys) => app.update((s) => ({ ...s, selection: [...keys] })),
      sortColumn: state.sort.column,
      sortDirection: state.sort.direction,
      onSort: (column, direction) => app.update((s) => ({ ...s, sort: { column, direction } })),
      stripedRows: true,
    }),
  ]);
});

app.keys({ q: () => app.stop(), "ctrl+c": () => app.stop() });

await app.start();
```

## Explanation

- Filter state is kept in `state.filter` and applied before passing data to the table.
- Sorting is handled by the table (click a sortable header, or focus the header and press Enter; it emits `onSort(column, direction)` and you store that in state).
- Selection is stored as row keys and updated via `onSelectionChange`.

## Related

- [Divider](../widgets/divider.md) - Table separators
- [Loading States](loading-states.md) - Async data loading
