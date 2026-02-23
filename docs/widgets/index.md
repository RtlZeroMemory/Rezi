# Widget API Reference

Rezi ships a comprehensive built-in widget catalog. Every widget is a plain TypeScript function that returns a `VNode` -- the virtual-DOM node Rezi reconciles, lays out, and renders to the terminal.

## Recommended Approach: `ui.*` Factory Functions

Always build your views through the `ui` namespace. These factories are the **safest, highest-level API** and are the only surface covered by deterministic VNode contract tests.

```typescript
import { ui } from "@rezi-ui/core";

app.view((state) =>
  ui.page({
    p: 1,
    gap: 1,
    header: ui.header({ title: "Hello, World!" }),
    body: ui.panel("Actions", [
      ui.actions([ui.button({ id: "ok", label: "OK", intent: "primary" })]),
    ]),
  })
);
```

Benefits of `ui.*` factories:

- Proper VNode construction with correct `kind` discriminants.
- Automatic filtering of `null`, `false`, and `undefined` children.
- Automatic flattening of nested child arrays.
- Default `gap: 1` applied to `row`/`column`/`hstack`/`vstack` when omitted.
- Interactive widget props validated before layout (e.g. `button` requires non-empty `id`).

## Beautiful Defaults

When the active theme provides semantic color tokens, core interactive widgets are recipe-styled by default (buttons, inputs, selects, checkboxes, progress bars, callouts). Use `intent` on buttons for common patterns (primary/danger/link), and use manual `style` props to override specific attributes (they do not disable recipes).

## Quick-Reference Table

### Layout

Container and spacing primitives for arranging widgets.

| Factory | Description | Focusable | Stability |
|---------|-------------|-----------|-----------|
| [`ui.box(props, children)`](box.md) | Container with border, padding, title, and optional transition/opacity props | No | `stable` |
| [`ui.row(props, children)`](stack.md) | Horizontal stack layout | No | `stable` |
| [`ui.column(props, children)`](stack.md) | Vertical stack layout | No | `stable` |
| [`ui.hstack(...)`](stack.md) | Shorthand horizontal stack (accepts gap number, props, or just children) | No | `stable` |
| [`ui.vstack(...)`](stack.md) | Shorthand vertical stack (accepts gap number, props, or just children) | No | `stable` |
| [`ui.grid(props, ...children)`](grid.md) | Two-dimensional grid layout | No | `stable` |
| [`ui.spacer(props?)`](spacer.md) | Fixed-size or flexible spacing | No | `stable` |
| [`ui.divider(props?)`](divider.md) | Visual separator line | No | `stable` |
| [`ui.layers(children)` / `ui.layers(props, children)`](layers.md) | Layer stack container (z-ordering) | No | `beta` |
| [`ui.splitPane(props, children)`](split-pane.md) | Resizable split layout with draggable dividers | No | `beta` |
| [`ui.panelGroup(props, children)`](panel-group.md) | Container for resizable panels | No | `beta` |
| [`ui.resizablePanel(props?, children?)`](resizable-panel.md) | Panel within a panel group | No | `beta` |

> **Convenience aliases:** `ui.spacedVStack(children)` and `ui.spacedHStack(children)` are shorthand for `vstack`/`hstack` with a default gap. They also accept an explicit gap number as the first argument: `ui.spacedVStack(2, children)`.

**Quick example:**

```typescript
ui.column({ p: 1, gap: 1 }, [
  ui.text("Title", { variant: "heading" }),
  ui.row({ gap: 2 }, [
    ui.button({ id: "ok", label: "OK" }),
    ui.button({ id: "cancel", label: "Cancel" }),
  ]),
])
```

### Text & Display

Content rendering, labels, and informational widgets.

| Factory | Description | Focusable | Stability |
|---------|-------------|-----------|-----------|
| [`ui.text(content, style?)`](text.md) | Display text with optional styling or variant | No | `stable` |
| [`ui.richText(spans, props?)`](rich-text.md) | Multi-styled text spans | No | `beta` |
| [`ui.icon(iconPath, props?)`](icon.md) | Single-character icon from the icon registry | No | `beta` |
| [`ui.badge(text, props?)`](badge.md) | Small status indicator label | No | `beta` |
| [`ui.status(status, props?)`](status.md) | Online/offline/away/busy status dot | No | `beta` |
| [`ui.tag(text, props?)`](tag.md) | Inline label with background | No | `beta` |
| [`ui.kbd(keys, props?)`](kbd.md) | Keyboard shortcut display | No | `beta` |
| [`ui.empty(title, props?)`](empty.md) | Empty state placeholder with optional icon/action | No | `beta` |
| [`ui.callout(message, props?)`](callout.md) | Alert/info message box with variants | No | `beta` |
| [`ui.errorDisplay(message, props?)`](error-display.md) | Error message with optional retry | No | `beta` |
| [`ui.errorBoundary(props)`](error-boundary.md) | Isolates subtree runtime errors with fallback UI | No | `beta` |

**Quick example:**

```typescript
ui.column({ gap: 1 }, [
  ui.richText([
    { text: "Error: ", style: { fg: { r: 255, g: 0, b: 0 }, bold: true } },
    { text: "File not found" },
  ]),
  ui.callout("This action cannot be undone", { variant: "warning" }),
  ui.badge("New", { variant: "info" }),
])
```

### Indicators

Visual feedback for loading, progress, and data density.

| Factory | Description | Focusable | Stability |
|---------|-------------|-----------|-----------|
| [`ui.spinner(props?)`](spinner.md) | Animated loading indicator | No | `beta` |
| [`ui.progress(value, props?)`](progress.md) | Progress bar (value 0-1) with variants | No | `beta` |
| [`ui.skeleton(width, props?)`](skeleton.md) | Loading placeholder | No | `beta` |
| [`ui.gauge(value, props?)`](gauge.md) | Compact progress gauge with label and thresholds | No | `beta` |

**Quick example:**

```typescript
ui.column({ gap: 1 }, [
  ui.spinner({ variant: "dots", label: "Loading..." }),
  ui.progress(0.75, { showPercent: true }),
  ui.gauge(0.42, { label: "CPU" }),
])
```

### Charts

Data visualization for terminal dashboards.

| Factory | Description | Focusable | Stability |
|---------|-------------|-----------|-----------|
| [`ui.sparkline(data, props?)`](sparkline.md) | Inline mini chart using block characters | No | `beta` |
| [`ui.barChart(data, props?)`](bar-chart.md) | Horizontal/vertical bar chart | No | `beta` |
| [`ui.miniChart(values, props?)`](mini-chart.md) | Compact multi-value display | No | `beta` |
| [`ui.lineChart(props)`](line-chart.md) | Multi-series line visualization (canvas-based) | No | `beta` |
| [`ui.scatter(props)`](scatter.md) | Cartesian scatter plot (canvas-based) | No | `beta` |
| [`ui.heatmap(props)`](heatmap.md) | Matrix heat map with color scales (canvas-based) | No | `beta` |

**Quick example:**

```typescript
ui.row({ gap: 2 }, [
  ui.sparkline([10, 20, 15, 30, 25], { width: 10 }),
  ui.barChart([
    { label: "TypeScript", value: 60 },
    { label: "JavaScript", value: 30 },
    { label: "Python", value: 10 },
  ], { showValues: true }),
])
```

### Input & Forms

Interactive form controls. All form widgets require an `id` prop for focus management.

| Factory | Description | Focusable | Stability |
|---------|-------------|-----------|-----------|
| [`ui.button(id, label)` / `ui.button(props)`](button.md) | Clickable button with label | Yes | `beta` |
| [`ui.input(id, value)` / `ui.input(props)`](input.md) | Single-line text input | Yes | `stable` |
| [`ui.textarea(props)`](textarea.md) | Multi-line text input (multiline input variant) | Yes | `beta` |
| [`ui.slider(props)`](slider.md) | Numeric range input | Yes | `beta` |
| [`ui.checkbox(props)`](checkbox.md) | Toggle checkbox | Yes | `beta` |
| [`ui.radioGroup(props)`](radio-group.md) | Single-select option group | Yes | `beta` |
| [`ui.select(props)`](select.md) | Dropdown selection | Yes | `beta` |
| [`ui.field(props)`](field.md) | Form field wrapper with label, error, and hint | No | `beta` |

**Quick example:**

```typescript
ui.form([
  ui.field({
    label: "Username",
    required: true,
    error: errors.username,
    children: ui.input("username", state.username, {
      onInput: (v) => app.update({ username: v }),
    }),
  }),
  ui.checkbox({
    id: "remember",
    checked: state.remember,
    label: "Remember me",
    onChange: (c) => app.update({ remember: c }),
  }),
  ui.actions([
    ui.button("submit", "Submit", {
      onPress: () => handleSubmit(),
    }),
  ]),
])
```

### Navigation

Widgets for navigating between views, sections, and pages.

| Factory | Description | Focusable | Stability |
|---------|-------------|-----------|-----------|
| [`ui.tabs(props)`](tabs.md) | Tab switcher with scoped content | Yes | `beta` |
| [`ui.accordion(props)`](accordion.md) | Expand/collapse stacked sections | Yes | `beta` |
| [`ui.breadcrumb(props)`](breadcrumb.md) | Hierarchical location path with jumps | Optional (`id`) | `beta` |
| [`ui.link(url, label?)` / `ui.link(props)`](link.md) | Hyperlink text with optional press behavior | Optional (`id`) | `beta` |
| [`ui.pagination(props)`](pagination.md) | Navigate paged datasets | Yes | `beta` |
| [`ui.routerBreadcrumb(router, routes, props?)`](../guide/routing.md) | Breadcrumbs derived from current router history | No | `beta` |
| [`ui.routerTabs(router, routes, props?)`](../guide/routing.md) | Tabs derived from registered routes with current route selection | No | `beta` |

**Quick example:**

```typescript
ui.tabs({
  id: "main-tabs",
  tabs: [
    { key: "overview", label: "Overview", content: OverviewPanel() },
    { key: "details", label: "Details", content: DetailsPanel() },
    { key: "logs", label: "Logs", content: LogsPanel() },
  ],
  activeTab: state.activeTab,
  onChange: (tab) => app.update({ activeTab: tab }),
})
```

### Data

Tables, lists, and trees for structured data display.

| Factory | Description | Focusable | Stability |
|---------|-------------|-----------|-----------|
| [`ui.table(props)`](table.md) | Tabular data with sorting, selection, virtualization | Yes | `stable` |
| [`ui.virtualList(props)`](virtual-list.md) | Efficiently render large lists with virtualized scrolling | Yes | `stable` |
| [`ui.tree(props)`](tree.md) | Hierarchical data with expand/collapse and selection | Yes | `beta` |

**Quick example:**

```typescript
ui.table({
  id: "files",
  columns: [
    { key: "name", header: "Name", flex: 1, sortable: true },
    { key: "size", header: "Size", width: 10, align: "right" },
  ],
  data: files,
  getRowKey: (f) => f.id,
  selection: state.selected,
  selectionMode: "multi",
  onSelectionChange: (keys) => app.update({ selected: keys }),
})
```

### Overlays

Modal dialogs, dropdown menus, toast notifications, and focus management.

| Factory | Description | Focusable | Stability |
|---------|-------------|-----------|-----------|
| [`ui.modal(props)`](modal.md) | Centered modal dialog with backdrop and focus trap | No | `beta` |
| [`ui.dialog(props)`](dialog.md) | Declarative dialog sugar over modal (multi-action) | No | `beta` |
| [`ui.dropdown(props)`](dropdown.md) | Positioned dropdown menu with auto-flip | No | `beta` |
| [`ui.layer(props)`](layer.md) | Generic overlay layer with z-order control | No | `beta` |
| [`ui.toastContainer(props)`](toast.md) | Non-blocking notification stack | No | `beta` |
| [`ui.commandPalette(props)`](command-palette.md) | Quick command search with async sources | Yes | `stable` |
| [`ui.focusZone(props, children?)`](focus-zone.md) | Focus group for Tab navigation | No | `beta` |
| [`ui.focusTrap(props, children?)`](focus-trap.md) | Constrain focus to region | No | `beta` |
| [`ui.focusAnnouncer(props?)`](focus-announcer.md) | Live text summary of the currently focused widget | No | `beta` |

**Quick example:**

```typescript
ui.layers([
  MainContent(),
  state.showConfirm && ui.dialog({
    id: "confirm",
    title: "Confirm Delete",
    message: "Are you sure you want to delete this item?",
    actions: [
      { label: "Delete", intent: "danger", onPress: () => deleteItem() },
      { label: "Cancel", onPress: () => app.update({ showConfirm: false }) },
    ],
    onClose: () => app.update({ showConfirm: false }),
  }),
])
```

### Advanced

Rich, specialized widgets for IDE-like experiences.

| Factory | Description | Focusable | Stability |
|---------|-------------|-----------|-----------|
| [`ui.codeEditor(props)`](code-editor.md) | Multi-line code editing with selections, undo/redo | Yes | `beta` |
| [`ui.diffViewer(props)`](diff-viewer.md) | Unified/side-by-side diff display with hunk staging | Yes | `beta` |
| [`ui.filePicker(props)`](file-picker.md) | File browser with selection and git status | Yes | `stable` |
| [`ui.fileTreeExplorer(props)`](file-tree-explorer.md) | File system tree view with expand/collapse | Yes | `stable` |
| [`ui.logsConsole(props)`](logs-console.md) | Streaming log output with filtering | Yes | `beta` |
| [`ui.toolApprovalDialog(props)`](tool-approval-dialog.md) | Tool execution review dialog | Yes | `experimental` |

**Quick example:**

```typescript
ui.codeEditor({
  id: "editor",
  lines: state.lines,
  cursor: state.cursor,
  selection: state.selection,
  scrollTop: state.scrollTop,
  scrollLeft: state.scrollLeft,
  lineNumbers: true,
  tabSize: 2,
  onChange: (lines, cursor) => app.update({ lines, cursor }),
  onScroll: (top, left) => app.update({ scrollTop: top, scrollLeft: left }),
})
```

### Graphics

Pixel-level drawing and image rendering for the terminal.

| Factory | Description | Focusable | Stability |
|---------|-------------|-----------|-----------|
| [`ui.canvas(props)`](canvas.md) | Pixel-level drawing surface | No | `beta` |
| [`ui.image(props)`](image.md) | Binary image rendering (PNG/RGBA) | No | `beta` |

**Quick example:**

```typescript
ui.canvas({
  width: 40,
  height: 20,
  draw: (ctx) => {
    ctx.fillRect(0, 0, 40, 20, "#000000");
    ctx.line(0, 0, 39, 19, "#ffffff");
  },
})
```

## High-Level Composition Helpers

The `ui` namespace includes convenience wrappers that compose lower-level widgets:

| Helper | Expands to | Purpose |
|--------|-----------|---------|
| `ui.panel(titleOrOptions, children)` | `ui.box({ border: "rounded", p: 1, title }, ...)` | Bordered panel with title; options support `id`, `key`, `title`, `gap`, `p`, `variant`, `style` |
| `ui.form(children)` / `ui.form(options, children)` | `ui.column({ gap: 1 }, children)` | Vertically stacked form layout; options support `id`, `key`, `gap` |
| `ui.actions(children)` / `ui.actions(options, children)` | `ui.row({ justify: "end", gap: 1 }, children)` | Right-aligned action button row; options support `id`, `key`, `gap` |
| `ui.center(child, options?)` | `ui.column({ width: "100%", height: "100%", align: "center", justify: "center" }, ...)` | Center a single widget; options support `id`, `key`, `p` |
| `ui.page(options)` | `ui.column(...)` with optional header/body/footer | Full-page layout scaffold |
| `ui.appShell(options)` | `ui.page(...)` with standard header/sidebar/body/footer layout | Full app scaffold (header + optional sidebar + body + footer) |
| `ui.card(titleOrOptions, children)` | `ui.box({ border: "rounded", p: 1 }, ...)` | Elevated content block with optional title/subtitle/actions |
| `ui.toolbar(children)` / `ui.toolbar(options, children)` | `ui.row({ items: "center", wrap: true }, ...)` | Inline action bar |
| `ui.statusBar(options)` | `ui.row({ width: "100%" }, [...left, spacer(1), ...right])` | Left/right status strip |
| `ui.header(options)` | `ui.box({ border: "rounded", px: 1 }, ...)` | Standard header bar (title/subtitle/actions) |
| `ui.sidebar(options)` | `ui.box({ border: \"rounded\", width, p: 1 }, ...)` | Navigation panel with selectable buttons |
| `ui.masterDetail(options)` | `ui.row([...master, detail])` | Split master/detail layout |
| `ui.keybindingHelp(bindings, options?)` | Formatted table of keyboard shortcuts | Keyboard shortcut reference; options: `title` (`"Keyboard Shortcuts"`), `emptyText` (`"No shortcuts registered."`), `showMode` (auto), `sort` (`true`) |

```typescript
ui.page({
  header: ui.header({ title: "My App" }),
  body: ui.panel("Content", [
    ui.text("Main content goes here"),
    ui.form([
      ui.field({ label: "Name", children: ui.input("name", state.name) }),
      ui.actions([
        ui.button("save", "Save", { intent: "primary" }),
        ui.button("cancel", "Cancel"),
      ]),
    ]),
  ]),
  footer: ui.text("Press Ctrl+Q to quit", { dim: true }),
})
```

## Composition Patterns

### `each()` for Lists

Render a list of items with automatic key injection and optional empty state:

```typescript
import { each } from "@rezi-ui/core";

each(
  state.items,
  (item, index) => ui.text(`${index + 1}. ${item.name}`),
  {
    key: (item) => item.id,
    container: "column",  // default; also accepts "row"
    empty: () => ui.text("No items yet", { dim: true }),
  },
)
```

For inline usage within a children array (returns `VNode[]` instead of a container):

```typescript
import { eachInline } from "@rezi-ui/core";

ui.column({ gap: 1 }, [
  ui.text("Items:"),
  ...eachInline(
    state.items,
    (item) => ui.text(item.name),
    { key: (item) => item.id },
  ),
])
```

### `show()` / `when()` / `maybe()` / `match()` for Conditionals

```typescript
import { show, when, maybe, match } from "@rezi-ui/core";

ui.column({}, [
  // show(condition, vnode, fallback?) -- eagerly evaluated
  show(state.isLoggedIn, ui.text("Welcome back!")),
  show(state.isLoggedIn, ui.text("Welcome!"), ui.text("Please log in")),

  // when(condition, trueFn, falseFn?) -- lazily evaluated
  when(
    state.items.length > 0,
    () => ItemList(),
    () => ui.empty("No items"),
  ),

  // maybe(value, render) -- null-safe rendering
  maybe(state.currentUser, (user) =>
    ui.text(`Logged in as ${user.name}`),
  ),

  // match(value, cases) -- pattern matching with _ default
  match(state.status, {
    loading: () => ui.spinner(),
    error: () => ui.errorDisplay("Something went wrong"),
    _: () => ui.text("Ready"),
  }),
])
```

You can also use plain JavaScript expressions -- falsy values (`false`, `null`, `undefined`) are automatically filtered from children arrays:

```typescript
ui.column({}, [
  ui.text("Always visible"),
  state.showDetails && ui.text("Conditionally visible"),
])
```

### `defineWidget()` for Reusable Components

Create stateful, reusable components with local state and lifecycle hooks:

```typescript
import { defineWidget, ui } from "@rezi-ui/core";

const Counter = defineWidget<{ initial: number; key?: string }>(
  (props, ctx) => {
    const [count, setCount] = ctx.useState(props.initial);

    ctx.useEffect(() => {
      console.log(`Counter mounted with initial=${props.initial}`);
      return () => console.log("Counter unmounted");
    }, []);

    return ui.row({ gap: 1 }, [
      ui.text(`Count: ${count}`),
      ui.button({
        id: ctx.id("inc"),
        label: "+",
        onPress: () => setCount((c) => c + 1),
      }),
      ui.button({
        id: ctx.id("dec"),
        label: "-",
        onPress: () => setCount((c) => c - 1),
      }),
    ]);
  },
  { name: "Counter" },
);

// Usage in a view:
ui.column([
  Counter({ initial: 0 }),
  Counter({ initial: 10, key: "counter-2" }),
]);
```

See the [Composition Guide](../guide/composition.md) for full details on `defineWidget`, `WidgetContext`, and hook usage.

## Stability Tiers

Widget stability tiers and guarantees are documented in [Widget Stability](stability.md).

| Tier | Meaning |
|------|---------|
| `stable` | Semver-protected behavior contract with deterministic regression tests. No breaking changes in minor/patch releases. |
| `beta` | Core invariants tested; contract may evolve in minor releases. |
| `experimental` | No compatibility guarantees; APIs can change at any time. |

## Common Props Reference

### Identity and Reconciliation

```typescript
// Unique key for reconciliation (required for dynamic lists)
key?: string

// Interactive widget ID (required for all focusable widgets)
id: string

// Optional semantic label for accessibility / focus announcements
accessibleLabel?: string

// Whether this widget can receive focus (default depends on widget kind)
focusable?: boolean
```

### Spacing Props

`box`, `row`, `column`, `hstack`, and `vstack` all accept spacing props. Values are either a number (terminal cells) or a named key.

```typescript
// Padding
p?: SpacingValue    // All sides
px?: SpacingValue   // Horizontal (left + right)
py?: SpacingValue   // Vertical (top + bottom)
pt?: SpacingValue   // Top
pr?: SpacingValue   // Right
pb?: SpacingValue   // Bottom
pl?: SpacingValue   // Left

// Margin
m?: SpacingValue
mx?: SpacingValue
my?: SpacingValue
mt?: SpacingValue
mr?: SpacingValue
mb?: SpacingValue
ml?: SpacingValue
```

#### Spacing Value Scale

| Key | Cells |
|-----|-------|
| `"none"` | 0 |
| `"xs"` | 1 |
| `"sm"` | 1 |
| `"md"` | 2 |
| `"lg"` | 3 |
| `"xl"` | 4 |
| `"2xl"` | 6 |

Numbers are also accepted directly:

```typescript
ui.box({ p: "md" }, [...])   // 2 cells of padding on all sides
ui.column({ p: 2, gap: 1 }, [...])  // equivalent numeric form
```

### Layout Props

```typescript
// Dimensions
width?: number | string    // Fixed width or percentage ("100%")
height?: number | string   // Fixed height or percentage
minWidth?: number
maxWidth?: number
minHeight?: number
maxHeight?: number
flex?: number              // Flex grow factor
flexShrink?: number        // Overflow shrink factor (default 0)
flexBasis?: number | string // Initial main-axis basis ("auto", "%", "full", number)
alignSelf?: "auto" | "start" | "center" | "end" | "stretch"
position?: "static" | "absolute"
top?: number
right?: number
bottom?: number
left?: number

// Gap between children (row, column, hstack, vstack)
gap?: SpacingValue

// Alignment
align?: "start" | "center" | "end" | "stretch"
justify?: "start" | "end" | "center" | "between" | "around" | "evenly"
items?: "start" | "center" | "end" | "stretch"

// Grid child placement (row/column/box children inside ui.grid)
gridColumn?: number // 1-based
gridRow?: number    // 1-based
colSpan?: number    // default 1
rowSpan?: number    // default 1
```

`width`/`height` and related layout scalar props also support responsive values, including `fluid(min, max, options?)` from `@rezi-ui/core`.

### Visual Props

```typescript
// Border style (box)
border?: "none" | "single" | "double" | "rounded" | "heavy" | "dashed"

// Box title (displayed in border)
title?: string
titleAlign?: "left" | "center" | "right"

// Text style (text, richText)
style?: TextStyle
```

### Grid-Specific Props

`grid` uses its own layout system and does **not** accept spacing props like `p`/`m`:

```typescript
ui.grid({
  columns: 3,           // Number of columns or explicit sizes
  rows: 2,              // Number of rows or explicit sizes
  gap: 1,               // Uniform gap
  rowGap: 1,            // Row-specific gap
  columnGap: 2,         // Column-specific gap
}, child1, child2, child3, child4, child5, child6)
```

Grid placement props are set on children (`gridColumn`, `gridRow`, `colSpan`, `rowSpan`).

## Event Handlers

Interactive widgets fire event callbacks for both keyboard and mouse input:

```typescript
ui.button({
  id: "submit",
  label: "Submit",
  onPress: () => handleSubmit(),   // Fires on Enter, Space, or mouse click
})

ui.input({
  id: "name",
  value: state.name,
  onInput: (value) => app.update({ name: value }),
  onBlur: () => validateField("name"),
})
```

## Mouse Support

All focusable widgets can be clicked with the mouse to receive focus. Scrollable widgets (`virtualList`, `codeEditor`, `logsConsole`, `diffViewer`) respond to the mouse scroll wheel. `splitPane` dividers can be dragged to resize panels. See the [Mouse Support Guide](../guide/mouse-support.md) for details.

## VNode Factory Guarantees

`ui.*` factories are contract-tested for deterministic VNode creation:

- Factories that expose a `key` prop forward it to the resulting VNode for reconciliation.
- Container-style child arrays filter `null`, `false`, and `undefined` values.
- Nested child arrays are flattened before VNode children are stored.
- Interactive widgets validate required runtime props before layout:
  - `button`: non-empty `id`; `label` must be a string (empty allowed).
  - `input`: non-empty `id`; `value` must be a string.
  - `textarea`: non-empty `id`; `value` must be a string; optional `rows` controls visible height.
  - `select`: non-empty `id`; `value` must be a string; `options` must be an array (empty allowed).
  - `slider`: non-empty `id`, finite numeric range with `min <= max`, `step > 0`.
  - `checkbox`: non-empty `id`, boolean `checked`.
  - `radioGroup`: non-empty `id`; `value` must be a string; `options` must be non-empty.

## API Reference

For complete type definitions, see the [API Reference](../api.md).
