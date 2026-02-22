# `LogsConsole`

Scrollable log viewer for debug panels and tooling.

## Usage

```ts
ui.logsConsole({
  id: "logs",
  entries: state.logs,
  autoScroll: true,
  levelFilter: ["info", "warn", "error"],
  scrollTop: state.logsScrollTop,
  showTimestamps: true,
  onScroll: (top) => app.update((s) => ({ ...s, logsScrollTop: top })),
  onClear: () => app.update((s) => ({ ...s, logs: [] })),
})
```

## Props

| Prop | Type | Default | Description |
|------|------|---------|-------------|
| `id` | `string` | **required** | Widget identifier |
| `entries` | `LogEntry[]` | **required** | Log entries to render |
| `autoScroll` | `boolean` | - | Auto-scroll to newest entry |
| `levelFilter` | `LogLevel[]` | - | Filter by severity |
| `sourceFilter` | `string[]` | - | Filter by source/category |
| `searchQuery` | `string` | - | Text filter |
| `scrollTop` | `number` | **required** | Scroll offset (entries) |
| `showTimestamps` | `boolean` | `true` | Show timestamps |
| `showSource` | `boolean` | `true` | Show source labels |
| `expandedEntries` | `string[]` | - | Expanded entry IDs |
| `onScroll` | `(scrollTop) => void` | **required** | Scroll callback |
| `onEntryToggle` | `(id, expanded) => void` | - | Expand/collapse callback |
| `onClear` | `() => void` | - | Clear entries callback |
| `focusConfig` | `FocusConfig` | - | Control focus visuals; `{ indicator: "none" }` suppresses focus decoration |

## Mouse Behavior

- **Mouse scroll wheel** scrolls log entries, firing the `onScroll` callback.
- **Clicking** the console area focuses the widget.

## Notes

- `LogEntry` supports optional details, token usage, duration, and cost fields.
- `LogLevel` values: `"trace"`, `"debug"`, `"info"`, `"warn"`, `"error"`.
- Helper functions like `applyFilters` and `computeAutoScrollPosition` are exported from `@rezi-ui/core` for app-level logic.

## Related

- [Diff viewer](diff-viewer.md)
