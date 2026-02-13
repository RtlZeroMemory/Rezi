# Widget Catalog

Rezi provides a comprehensive set of widgets for building terminal UIs. Widgets are plain TypeScript functions that return VNode objects.

```typescript
app.view((state) =>
  ui.column({ gap: 1 }, [
    ui.text("Hello, World!"),
    ui.button({ id: "ok", label: "OK" }),
  ])
);
```

## Widget Categories

### Primitives

Foundation widgets for layout and content:

| Widget | Description | Focusable |
|--------|-------------|-----------|
| [Text](text.md) | Display text with optional styling | No |
| [Box](box.md) | Container with border, padding, and title | No |
| [Row / Column](stack.md) | Horizontal and vertical stack layouts | No |
| [Spacer](spacer.md) | Fixed-size or flexible spacing | No |
| [Divider](divider.md) | Visual separator line | No |

### Indicators

Visual feedback and status display:

| Widget | Description | Focusable |
|--------|-------------|-----------|
| [Icon](icon.md) | Single-character icon from registry | No |
| [Spinner](spinner.md) | Animated loading indicator | No |
| [Progress](progress.md) | Progress bar with variants | No |
| [Skeleton](skeleton.md) | Loading placeholder | No |
| [RichText](rich-text.md) | Multi-styled text spans | No |
| [Kbd](kbd.md) | Keyboard shortcut display | No |
| [Badge](badge.md) | Small status indicator | No |
| [Status](status.md) | Online/offline status dot | No |
| [Tag](tag.md) | Inline label with background | No |

### Form Inputs

Interactive form controls:

| Widget | Description | Focusable |
|--------|-------------|-----------|
| [Button](button.md) | Clickable button with label | Yes |
| [Input](input.md) | Single-line text input | Yes |
| [Slider](slider.md) | Numeric range input | Yes |
| [Checkbox](checkbox.md) | Toggle checkbox | Yes |
| [Radio Group](radio-group.md) | Single-select options | Yes |
| [Select](select.md) | Dropdown selection | Yes |
| [Field](field.md) | Form field wrapper with label/error | No |

### Data Display

Tables, lists, and trees:

| Widget | Description | Focusable |
|--------|-------------|-----------|
| [Table](table.md) | Tabular data with sorting and selection | Yes |
| [Virtual List](virtual-list.md) | Efficiently render large lists | Yes |
| [Tree](tree.md) | Hierarchical data with expand/collapse | Yes |

### Overlays

Modal and popup interfaces:

| Widget | Description | Focusable |
|--------|-------------|-----------|
| [Layers](layers.md) | Layer stack container | No |
| [Modal](modal.md) | Centered modal dialog | Yes |
| [Dropdown](dropdown.md) | Positioned dropdown menu | Yes |
| [Layer](layer.md) | Generic overlay layer | Varies |
| [Toast](toast.md) | Non-blocking notifications | No |
| [Focus Zone](focus-zone.md) | Focus group for Tab navigation | No |
| [Focus Trap](focus-trap.md) | Constrain focus to region | No |

### Layout

Complex layout components:

| Widget | Description | Focusable |
|--------|-------------|-----------|
| [Split Pane](split-pane.md) | Resizable split layout | Yes |
| [Panel Group](panel-group.md) | Container for resizable panels | No |
| [Resizable Panel](resizable-panel.md) | Panel within group | No |

### Advanced

Rich, specialized widgets:

| Widget | Description | Focusable |
|--------|-------------|-----------|
| [Command Palette](command-palette.md) | Quick command search | Yes |
| [File Picker](file-picker.md) | File browser with selection | Yes |
| [File Tree Explorer](file-tree-explorer.md) | File system tree view | Yes |
| [Code Editor](code-editor.md) | Multi-line code editing | Yes |
| [Diff Viewer](diff-viewer.md) | Unified/side-by-side diff | Yes |
| [Logs Console](logs-console.md) | Streaming log output | Yes |
| [Tool Approval Dialog](tool-approval-dialog.md) | Tool execution review | Yes |

### Charts

Data visualization:

| Widget | Description | Focusable |
|--------|-------------|-----------|
| [Gauge](gauge.md) | Compact progress with label | No |
| [Sparkline](sparkline.md) | Inline mini chart | No |
| [Bar Chart](bar-chart.md) | Horizontal/vertical bars | No |
| [Mini Chart](mini-chart.md) | Compact multi-value display | No |

### Feedback

User feedback and states:

| Widget | Description | Focusable |
|--------|-------------|-----------|
| [Callout](callout.md) | Alert/info message box | No |
| [Error Display](error-display.md) | Error message with retry | Yes |
| [Empty](empty.md) | Empty state placeholder | No |

## Common Patterns

### Widget Props

All widgets accept a props object. Common properties include:

```typescript
// Unique key for reconciliation (required for dynamic lists)
key?: string

// Interactive widget ID (required for focusable widgets)
id: string

// Visual styling
style?: TextStyle
```

### Layout Props

Container widgets support layout properties:

```typescript
// Padding (all sides, or specific)
p?: SpacingValue    // All sides
px?: SpacingValue   // Horizontal
py?: SpacingValue   // Vertical
pt?: SpacingValue   // Top
pb?: SpacingValue   // Bottom
pl?: SpacingValue   // Left
pr?: SpacingValue   // Right

// Gap between children
gap?: SpacingValue

// Alignment
align?: "start" | "center" | "end" | "stretch"
justify?: "start" | "end" | "center" | "between" | "around" | "evenly"
```

### Spacing Values

Spacing accepts numbers (cells) or named keys:

| Key | Value |
|-----|-------|
| `"none"` | 0 |
| `"xs"` | 1 |
| `"sm"` | 1 |
| `"md"` | 2 |
| `"lg"` | 3 |
| `"xl"` | 4 |
| `"2xl"` | 6 |

```typescript
ui.box({ p: "md" }, [
  ui.column({ gap: "sm" }, [...]),
])
ui.column({ p: 2, gap: 1 }, [...])
```

### Conditional Rendering

Use JavaScript expressions for conditional widgets:

```typescript
ui.column({}, [
  ui.text("Always visible"),
  state.showDetails && ui.text("Conditional"),
  state.items.length === 0 && ui.text("No items"),
])
```

Falsy values (`false`, `null`, `undefined`) are filtered from children.

### Dynamic Lists

When rendering lists, provide a `key` prop for efficient reconciliation:

```typescript
ui.column(
  {},
  state.items.map((item) => ui.text(item.name, { key: item.id }))
)
```

### Event Handlers

Interactive widgets support event callbacks. These fire for both keyboard and mouse input:

```typescript
ui.button({
  id: "submit",
  label: "Submit",
  onPress: () => handleSubmit(), // Fires on Enter, Space, or mouse click
})

ui.input({
  id: "name",
  value: state.name,
  onInput: (value) => app.update({ ...state, name: value }),
  onBlur: () => validateField("name"),
})
```

### Mouse Support

All focusable widgets can be clicked with the mouse to receive focus. Scrollable widgets (VirtualList, CodeEditor, LogsConsole, DiffViewer) respond to the mouse scroll wheel. SplitPane dividers can be dragged to resize panels. See the [Mouse Support guide](../guide/mouse-support.md) for details.

## API Reference

For complete type definitions, see the [API Reference](../api.md).
