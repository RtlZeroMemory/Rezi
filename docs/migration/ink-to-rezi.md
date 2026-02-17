# Ink to Rezi Migration

This guide maps common Ink mental models to Rezi and gives practical migration recipes.

## Read this first

Rezi is not a drop-in replacement for Ink.

- Rezi does **not** promise API or behavior compatibility with Ink.
- Migration is intentional: move patterns, not component names.

This is by design. Rezi prioritizes deterministic rendering, deterministic input routing, and deterministic layout in terminal cells.

## Mental model map

| Ink mental model | Rezi mental model | Why this is different |
|---|---|---|
| `render(<App />)` starts a React tree | `createNodeApp(...)` + `app.view((state) => VNode)` + `app.start()` | Rezi runs a runtime-owned state/render pipeline instead of React reconciliation |
| Re-render timing follows React scheduling | Re-renders happen at deterministic commit points after `app.update(...)`/event batches | Same input + state transitions produce the same frame sequence |
| Hooks live in React components | Stateful reusable widgets use `defineWidget((props, ctx) => ...)` with `ctx.useState/useRef/useEffect/useAppState` | Keeps root view pure while still allowing local widget state |
| Input usually handled with `useInput` and component focus assumptions | Input routes through stable widget `id`s, focus order, `app.keys()`, `app.modes()`, `focusZone`, `focusTrap` | Event routing and focus are explicit and deterministic |
| Yoga/flexbox layout expectations | Cell-based layout via `ui.row`, `ui.column`, `ui.box`, `width/height/flex`, `p/m/gap` | Terminal layout is measured in character cells, not pixels |

## What's different (on purpose)

- **No compatibility promise**: Rezi does not emulate Ink internals or component semantics.
- **Deterministic scheduling**: queued updates are coalesced at commit points; render-time updates throw.
- **Deterministic focus/input**: stable `id` + documented routing order avoids timing-dependent behavior.
- **Cell-based layout**: widths/heights/overflow are resolved in terminal cells for predictable output.

## Recipes

### 1) Layout: Yoga-style intent to Rezi cell layout

Use stacks (`row`/`column`) plus explicit cell constraints.

```typescript
app.view((state) =>
  ui.row({ gap: 1 }, [
    ui.box({ width: 24, border: "rounded", p: 1, title: "Sidebar" }, [
      ui.column({ gap: 1 }, state.menu.map((item) => ui.text(item, { key: item }))),
    ]),
    ui.box({ flex: 1, border: "single", p: 1, title: "Content" }, [
      ui.text(state.title, { style: { bold: true } }),
      ui.text(state.body, { textOverflow: "ellipsis", maxWidth: 60 }),
    ]),
  ])
);
```

Migration notes:
- `width`/`height` numbers are terminal cells.
- `flex` distributes remaining space.
- `p`, `m`, and `gap` are cell-based spacing.

### 2) Lists and virtualization

Small lists: map into `ui.column` with stable `key`.

```typescript
ui.column({ gap: 0 }, state.items.map((it) => ui.text(it.label, { key: it.id })));
```

Large lists: switch to `ui.virtualList`.

```typescript
ui.virtualList({
  id: "results",
  items: state.rows,
  itemHeight: 1,
  overscan: 3,
  renderItem: (row, _i, focused) =>
    ui.text(`${focused ? ">" : " "} ${row.name}`, {
      key: row.id,
      style: focused ? { bold: true } : undefined,
    }),
});
```

### 3) Tables

Use `ui.table` for sorting, selection, and built-in virtualization.

```typescript
ui.table({
  id: "users",
  columns: [
    { key: "name", header: "Name", flex: 1, sortable: true, overflow: "middle" },
    { key: "role", header: "Role", width: 12 },
  ],
  data: state.users,
  getRowKey: (u) => u.id,
  selection: state.selection,
  selectionMode: "multi",
  onSelectionChange: (keys) => app.update((s) => ({ ...s, selection: keys })),
  onSort: (column, direction) => app.update((s) => ({ ...s, sortColumn: column, sortDirection: direction })),
  virtualized: true,
});
```

### 4) Text styling and truncation

`ui.text` handles style + deterministic cell-aware truncation.

```typescript
import { rgb } from "@rezi-ui/core";

ui.column({ gap: 1 }, [
  ui.text("Build failed", { style: { fg: rgb(255, 110, 110), bold: true } }),
  ui.text(state.path, { textOverflow: "middle", maxWidth: 40 }),
]);
```

### 5) Forms

Use controlled `input` widgets and validate in update handlers, not during render.

```typescript
ui.field({
  label: "Email",
  required: true,
  error: state.touched.email ? state.errors.email : undefined,
  children: ui.input({
    id: "email",
    value: state.email,
    onInput: (value) =>
      app.update((s) => {
        const next = { ...s, email: value };
        return { ...next, errors: validate(next) };
      }),
    onBlur: () => app.update((s) => ({ ...s, touched: { ...s.touched, email: true } })),
  }),
});
```

### 6) Keybindings: global, modes, and chords

Use `app.keys()` for global bindings and chord sequences; use `app.modes()` for contextual maps.

```typescript
app.keys({
  "ctrl+s": () => save(),
  "g g": () => jumpTop(),
  "ctrl+x ctrl+s": () => save(),
});

app.modes({
  normal: {
    i: () => app.setMode("insert"),
    "d d": () => deleteLine(),
  },
  insert: {
    escape: () => app.setMode("normal"),
  },
});

app.setMode("normal");
```

### 7) Overlays: modals and toasts

Render overlays in `ui.layers(...)`; later children are on top.

```typescript
ui.layers([
  MainScreen(state),
  state.showConfirm &&
    ui.modal({
      id: "confirm",
      title: "Delete file?",
      content: ui.text("This action cannot be undone."),
      actions: [
        ui.button({ id: "cancel", label: "Cancel" }),
        ui.button({ id: "delete", label: "Delete" }),
      ],
      onClose: () => app.update((s) => ({ ...s, showConfirm: false })),
    }),
  ui.toastContainer({
    toasts: state.toasts,
    position: "bottom-right",
    onDismiss: (id) => app.update((s) => ({ ...s, toasts: s.toasts.filter((t) => t.id !== id) })),
  }),
]);
```

### 8) Debugging and inspector

Use the debug controller for traces and the inspector overlay for live frame/focus inspection.

```typescript
import { createAppWithInspectorOverlay, createDebugController } from "@rezi-ui/core";
import { createNodeBackend } from "@rezi-ui/node";

const backend = createNodeBackend();
const debug = createDebugController({
  backend: backend.debug,
  terminalCapsProvider: () => backend.getCaps(),
});

await debug.enable({ minSeverity: "info" });

const app = createAppWithInspectorOverlay({
  backend,
  initialState,
  inspector: {
    hotkey: "ctrl+shift+i",
    debug,
  },
});
```

### 9) Performance

Use Rezi's deterministic performance model directly:

- Keep `app.view(state)` pure and cheap.
- Keep `key` stable in dynamic lists.
- Precompute expensive derived data during `app.update(...)`.
- Use `ui.virtualList`/`ui.table` for large datasets.
- Turn on debug `perf`/`frame` categories to inspect hotspots.

## Quick migration checklist

1. Replace `render(...)` entrypoint with `createNodeApp` + `app.view` + `app.start`.
2. Move React component local state to app state or `defineWidget` context hooks.
3. Replace `useInput`-style handlers with `app.keys`, `app.modes`, and widget callbacks.
4. Convert Yoga assumptions to cell-based layout (`row`/`column`/`box`, `flex`, cell spacing).
5. Add stable `id` (focus/routing) and stable `key` (list reconciliation).
6. Verify behavior with debug traces and inspector overlay before parity signoff.

## Related docs

- [Composition](../guide/composition.md)
- [Lifecycle & Updates](../guide/lifecycle-and-updates.md)
- [Layout](../guide/layout.md)
- [Input & Focus](../guide/input-and-focus.md)
- [Performance](../guide/performance.md)
- [Debugging](../guide/debugging.md)
