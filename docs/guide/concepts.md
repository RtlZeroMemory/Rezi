# Concepts

Understanding Rezi's core concepts will help you build effective terminal applications. This page covers the mental model, the key abstractions, and how they fit together.

## VNode Trees (Declarative UI)

Rezi applications describe their UI as a tree of **virtual nodes** (VNodes). You never write terminal escape codes or manage cursor positions directly. Instead, you declare _what_ the UI should look like, and Rezi figures out _how_ to render it.

```typescript
app.view(state =>
  ui.column({ gap: 1 }, [
    ui.text("Hello, World!"),
    ui.button({ id: "ok", label: "OK" }),
  ])
);
```

Each call to a `ui.*` function returns a VNode -- a lightweight plain object with a `kind` field and typed `props`. The `ui.*` helpers are the recommended way to build VNode trees. They provide type safety and a clean API without requiring you to construct discriminated union objects by hand.

### Key Properties

**`key` for reconciliation**
: When rendering dynamic lists, the `key` prop helps Rezi track which items changed, were added, or were removed. Always provide keys for list items derived from data:

```typescript
ui.column(
  items.map(item => ui.text(item.name, { key: item.id }))
)
```

**`id` for interactivity**
: Focusable widgets require an `id` prop. This is used for focus management (Tab/Shift+Tab navigation), event routing (which button was pressed), and focus restoration after modal closes:

```typescript
ui.button({ id: "submit", label: "Submit" })
ui.input({ id: "email", value: state.email })
```

## State-Driven Rendering

Rezi follows a strict unidirectional data flow:

```
State --> View --> VNode Tree --> Render
  ^                                 |
  +--- Events <-- User Input <------+
```

Your application state is the single source of truth. The view function transforms state into a VNode tree. User interactions produce events that update state, which triggers a new render cycle.

### State Updates

State changes through `app.update()`:

```typescript
// Functional update (recommended -- avoids stale closures)
app.update(prev => ({ ...prev, count: prev.count + 1 }));

// Direct replacement
app.update({ count: 0 });
```

Updates are batched and coalesced. Multiple `update()` calls in the same event loop tick produce a single re-render, so you do not need to worry about redundant renders when dispatching several updates in a row.

### Pure View Functions

The view function should be **pure** -- given the same state, it should return the same VNode tree:

```typescript
// Good: Pure function, same input produces same output
app.view(state => ui.text(`Count: ${state.count}`));

// Bad: Side effects in view
app.view(state => {
  console.log("Rendering..."); // Side effect
  fetchData();                 // Side effect
  return ui.text(`Count: ${state.count}`);
});
```

Side effects belong in event handlers, keybinding callbacks, or `useEffect` hooks inside `defineWidget()`.

### Reducer Pattern (Recommended)

For non-trivial apps, use a **reducer pattern** to manage state transitions. This keeps your state logic pure, testable, and separate from your UI:

```typescript
type State = { count: number; items: string[] };
type Action =
  | { type: "increment" }
  | { type: "addItem"; text: string }
  | { type: "removeItem"; index: number };

function reduce(state: State, action: Action): State {
  switch (action.type) {
    case "increment":  return { ...state, count: state.count + 1 };
    case "addItem":    return { ...state, items: [...state.items, action.text] };
    case "removeItem": return { ...state, items: state.items.filter((_, i) => i !== action.index) };
  }
}

function dispatch(action: Action) {
  app.update(s => reduce(s, action));
}
```

The reducer is a plain function. You can test it in isolation with no framework dependencies.

## Widget Composition via `ui.*`

The `ui` namespace provides factory functions for every built-in widget. These are organized into categories:

### Structural Widgets
Container and layout: `ui.box()`, `ui.row()`, `ui.column()`, `ui.spacer()`, `ui.divider()`, `ui.grid()`

### Content Widgets
Display information: `ui.text()`, `ui.richText()`, `ui.icon()`, `ui.badge()`, `ui.callout()`

### Interactive Widgets
Accept user input: `ui.button()`, `ui.input()`, `ui.checkbox()`, `ui.select()`, `ui.radioGroup()`, `ui.slider()`

### Data Widgets
Display structured data: `ui.table()`, `ui.virtualList()`, `ui.tree()`

### Overlay Widgets
Modal interfaces: `ui.modal()`, `ui.dropdown()`, `ui.toast()`, `ui.layers()`

### Feedback Widgets
Loading and error states: `ui.spinner()`, `ui.progress()`, `ui.skeleton()`, `ui.errorDisplay()`, `ui.errorBoundary()`

### Custom Widgets with `defineWidget()`

For reusable components with local state and lifecycle, use `defineWidget()`:

```typescript
import { defineWidget, ui } from "@rezi-ui/core";

type CounterProps = { initial: number; key?: string };

const Counter = defineWidget<CounterProps>(
  (props, ctx) => {
    const [count, setCount] = ctx.useState(props.initial);

    return ui.row({ gap: 1 }, [
      ui.text(`Count: ${count}`),
      ui.button({
        id: ctx.id("inc"),
        label: "+1",
        onPress: () => setCount(c => c + 1),
      }),
    ]);
  },
  { name: "Counter" }
);

// Usage in a view:
app.view(() =>
  ui.column([
    Counter({ initial: 0 }),
    Counter({ initial: 10, key: "counter-2" }),
  ])
);
```

`defineWidget()` gives each instance its own `WidgetContext` with hooks:

- `ctx.useState()` -- Local state that persists across renders
- `ctx.useRef()` -- Mutable ref without triggering re-render
- `ctx.useMemo()` -- Memoize expensive computations
- `ctx.useCallback()` -- Stable callback references
- `ctx.useEffect()` -- Side effects with cleanup
- `ctx.useAppState()` -- Select a slice of app state
- `ctx.id()` -- Generate scoped IDs to prevent collisions

## The Render Pipeline

When state changes, Rezi runs through a multi-phase pipeline:

```
State --> view(state) --> VNode Tree --> Reconcile --> Layout --> Render --> Drawlist --> Backend
```

1. **View** -- Your view function produces a new VNode tree
2. **Reconcile** -- The new tree is diffed against the previous tree using keys and structural matching
3. **Layout** -- Widget sizes and positions are computed (flexbox-inspired model)
4. **Render** -- The layout tree is walked to produce draw commands
5. **Drawlist** -- Commands are encoded into the ZRDL binary format
6. **Backend** -- The native engine processes the drawlist and paints the terminal

You rarely need to think about these phases directly. The framework handles them automatically, including optimizations like layout stability detection (skip relayout when the tree structure has not changed) and update batching.

## Hooks for Stateful Widgets

Hooks are available inside `defineWidget()` render functions through the `WidgetContext`. They follow the same rules as React hooks -- call them unconditionally and in the same order every render.

```typescript
const SearchList = defineWidget<SearchListProps, AppState>(
  (props, ctx) => {
    const [query, setQuery] = ctx.useState("");
    const items = ctx.useAppState(s => s.items);

    // Memoize filtered results
    const filtered = ctx.useMemo(
      () => items.filter(item => item.name.includes(query)),
      [items, query]
    );

    // Stable callback for input handler
    const onInput = ctx.useCallback(
      (value: string) => setQuery(value),
      []
    );

    return ui.column({ gap: 1 }, [
      ui.input({ id: ctx.id("search"), value: query, onInput }),
      ...filtered.map(item =>
        ui.text(item.name, { key: item.id })
      ),
    ]);
  },
  { name: "SearchList" }
);
```

Additional utility hooks are exported from `@rezi-ui/core`:

- `useDebounce(ctx, value, delayMs)` -- Debounce a value
- `usePrevious(ctx, value)` -- Track the previous render's value
- `useAsync(ctx, asyncFn, deps)` -- Manage async data loading
- `useStream(ctx, asyncIterable, deps?)` -- Consume async iterables and stream updates
- `useEventSource(ctx, url, options?)` -- Subscribe to SSE streams with reconnect
- `useWebSocket(ctx, url, protocol?, options?)` -- Subscribe to websocket streams with parsing
- `useInterval(ctx, fn, ms)` -- Interval callbacks with automatic cleanup
- `useTail(ctx, filePath, options?)` -- Tail file streams with bounded line buffers

## Keybinding System

Rezi provides two layers of keyboard handling:

### Global Keybindings

Register application-wide shortcuts with `app.keys()`:

```typescript
app.keys({
  "ctrl+s": () => save(),
  "ctrl+q": () => app.stop(),
  q: () => app.stop(),
  "g g": () => scrollToTop(),    // Chord: press g twice
});
```

Key names support modifiers (`ctrl`, `alt`, `shift`, `meta`) and chord sequences (space-separated keys pressed in sequence).

### Modal / Vim-Style Modes

For applications with distinct input modes, use `app.modes()`:

```typescript
app.modes({
  normal: {
    i: () => app.setMode("insert"),
    j: () => moveCursorDown(),
    k: () => moveCursorUp(),
    "/": () => app.setMode("search"),
  },
  insert: {
    escape: () => app.setMode("normal"),
  },
  search: {
    escape: () => app.setMode("normal"),
    enter: () => executeSearch(),
  },
});
```

### Widget-Level Events

Individual widgets handle input through callback props:

```typescript
ui.button({
  id: "submit",
  label: "Submit",
  onPress: () => handleSubmit(),
});

ui.input({
  id: "name",
  value: state.name,
  onInput: value => app.update(s => ({ ...s, name: value })),
  onBlur: () => validate("name"),
});
```

### Recommended Practice

Centralize keybindings in a dedicated file and dispatch actions rather than performing logic inline. See [Recommended Patterns](recommended-patterns.md) for the full pattern.

## Focus Model

Rezi manages focus automatically through keyboard and mouse input:

### Tab and Mouse Navigation
Tab moves focus forward through focusable widgets. Shift+Tab moves backward. Clicking any focusable widget with the mouse also moves focus to it. See [Mouse Support](mouse-support.md) for details.

### Focus Zones
Group widgets into focus zones for organized Tab navigation:

```typescript
ui.column({}, [
  ui.focusZone({ id: "toolbar" }, [
    ui.button({ id: "save", label: "Save" }),
    ui.button({ id: "load", label: "Load" }),
  ]),
  ui.focusZone({ id: "content" }, [
    ui.input({ id: "name", value: "" }),
    ui.input({ id: "email", value: "" }),
  ]),
])
```

### Focus Traps
Constrain focus within a region (useful for modals):

```typescript
ui.focusTrap({ id: "modal-trap", active: true }, [
  ui.button({ id: "ok", label: "OK" }),
  ui.button({ id: "cancel", label: "Cancel" }),
])
```

## Deterministic Rendering

Rezi is designed so that the same initial state plus the same sequence of input events produces the same frames and routed events. This determinism is achieved through:

- **Version-pinned Unicode** -- Text measurement uses a pinned Unicode version; the same string always measures to the same cell width
- **Strict binary protocols** -- The ZRDL (drawlist) and ZREV (event batch) formats are versioned and validated
- **Locked update contract** -- Updates during render throw `ZRUI_UPDATE_DURING_RENDER`; reentrant calls throw `ZRUI_REENTRANT_CALL`

## Package Architecture

Rezi uses a layered architecture with strict boundaries:

```
+-------------------------------------+
|         Your Application            |
+-------------------------------------+
                  |
                  v
+-------------------------------------+
|          @rezi-ui/core              |
|  (Runtime-agnostic TypeScript)      |
|  Widgets, Layout, Themes            |
|  Forms, Keybindings, Focus          |
|  Protocol builders/parsers          |
+-------------------------------------+
                  |
                  v
+-------------------------------------+
|          @rezi-ui/node              |
|  (Node.js/Bun Runtime Integration)  |
|  Worker threads, Event loop         |
+-------------------------------------+
                  |
                  v
+-------------------------------------+
|         @rezi-ui/native             |
|  (N-API Addon)                      |
|  Zireael C engine binding           |
|  Terminal I/O                       |
+-------------------------------------+
```

**Portability**: `@rezi-ui/core` contains no Node.js-specific APIs. It could theoretically run in any JavaScript runtime.

**Testability**: Core logic can be tested without a terminal or native addon.

**Binary Boundary**: The native engine communicates through versioned binary formats, enabling a stable ABI and language interop.

## Next Steps

- [Recommended Patterns](recommended-patterns.md) - Best practices for production apps
- [Lifecycle & Updates](lifecycle-and-updates.md) - State management in depth
- [Layout](layout.md) - Spacing, alignment, and constraints
- [Input & Focus](input-and-focus.md) - Keyboard and mouse navigation
- [Mouse Support](mouse-support.md) - Click, scroll, and drag interactions
- [Widget Catalog](../widgets/index.md) - Complete widget reference
