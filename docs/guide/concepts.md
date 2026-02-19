# Concepts

Understanding Rezi's core concepts will help you build effective terminal applications.

## Widget Tree (VNode)

Rezi applications render a tree of **virtual nodes** (VNodes) through a pure `view(state)` function:

```typescript
app.view((state) =>
  ui.column({ gap: 1 }, [
    ui.text("Hello, World!"),
    ui.button({ id: "ok", label: "OK" }),
  ])
);
```

### Key Properties

**Widgets are plain objects**
: Each widget is a discriminated union with a `kind` field. The `ui.*` helpers are convenience functions that create these objects.

**`key` for reconciliation**
: When rendering dynamic lists, the `key` prop helps Rezi track which items changed, were added, or were removed:

```typescript
ui.column(
  items.map((item) => ui.text(item.name, { key: item.id }))
)
```

**`id` for interactivity**
: Focusable widgets require an `id` prop. This is used for:
- Focus management (Tab/Shift+Tab navigation)
- Event routing (which button was pressed)
- Focus restoration after modal closes

```typescript
ui.button({ id: "submit", label: "Submit" })
ui.input({ id: "email", value: state.email })
```

## State-Driven Rendering

Rezi follows a unidirectional data flow:

```
State → View → VNode Tree → Render
  ↑                           ↓
  └─── Events ← User Input ←──┘
```

### State Updates

State changes through `app.update()`:

```typescript
// Functional update (recommended)
app.update((prev) => ({ ...prev, count: prev.count + 1 }));

// Direct replacement
app.update({ count: 0 });
```

Updates are batched and coalesced. Multiple `update()` calls in the same event loop tick produce a single re-render.

### Pure View Function

The view function should be pure:

```typescript
// Good: Pure function, same input → same output
app.view((state) => ui.text(`Count: ${state.count}`));

// Bad: Side effects in view
app.view((state) => {
  console.log("Rendering..."); // Side effect
  fetchData(); // Side effect
  return ui.text(`Count: ${state.count}`);
});
```

## Deterministic Rendering

Rezi is designed so that:

- The same initial state
- Plus the same sequence of input events
- Produces the same frames and routed events

This determinism is achieved through:

### Version-Pinned Unicode

Text measurement and grapheme segmentation use a pinned Unicode version. The same string always measures to the same cell width.

### Strict Binary Protocols

The ZRDL (drawlist) and ZREV (event batch) protocols are versioned and validated. Invalid input fails deterministically with structured errors.

### Locked Update Contract

The update and scheduling contract is strictly defined:
- Updates during render throw `ZRUI_UPDATE_DURING_RENDER`
- Reentrant calls throw `ZRUI_REENTRANT_CALL`

## Package Architecture

Rezi uses a layered architecture with strict boundaries:

```
┌─────────────────────────────────────┐
│         Your Application            │
└─────────────────────────────────────┘
                  │
                  ▼
┌─────────────────────────────────────┐
│          @rezi-ui/core              │
│  (Runtime-agnostic TypeScript)      │
│  • Widgets, Layout, Themes          │
│  • Forms, Keybindings, Focus        │
│  • Protocol builders/parsers        │
└─────────────────────────────────────┘
                  │
                  ▼
┌─────────────────────────────────────┐
│          @rezi-ui/node              │
│  (Node.js/Bun Runtime Integration)      │
│  • Worker threads                   │
│  • Event loop integration           │
└─────────────────────────────────────┘
                  │
                  ▼
┌─────────────────────────────────────┐
│         @rezi-ui/native             │
│  (N-API Addon)                      │
│  • Zireael C engine binding         │
│  • Terminal I/O                     │
└─────────────────────────────────────┘
```

### Why This Structure?

**Portability**
: `@rezi-ui/core` contains no Node.js-specific APIs. It could theoretically run in any JavaScript runtime.

**Testability**
: Core logic can be tested without a terminal or native addon.

**Binary Boundary**
: The native engine communicates through versioned binary formats, enabling stable ABI and language interop.

## Widget Categories

Rezi widgets fall into several categories:

### Structural Widgets
Container and layout: `box`, `row`, `column`, `spacer`, `divider`

### Content Widgets
Display information: `text`, `richText`, `icon`, `badge`, `status`

### Interactive Widgets
Accept user input via keyboard and mouse: `button`, `input`, `checkbox`, `select`, `radioGroup`

### Data Widgets
Display structured data: `table`, `virtualList`, `tree`

### Overlay Widgets
Modal interfaces: `modal`, `dropdown`, `toast`, `layers`

### Feedback Widgets
Loading and error states: `spinner`, `progress`, `skeleton`, `errorDisplay`

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

## Event Handling

### Widget Events
Widgets receive events through callback props:

```typescript
ui.button({
  id: "submit",
  label: "Submit",
  onPress: () => handleSubmit(),
});

ui.input({
  id: "name",
  value: state.name,
  onInput: (value) => app.update({ ...state, name: value }),
  onBlur: () => validate("name"),
});
```

### Global Keybindings
Register application-wide keyboard shortcuts:

```typescript
app.keys({
  "ctrl+s": () => save(),
  "ctrl+q": () => app.stop(),
  "escape": () => closeModal(),
});
```

### Modal Keybindings
For Vim-style modes:

```typescript
app.modes({
  normal: {
    i: () => app.setMode("insert"),
    j: () => moveCursorDown(),
    k: () => moveCursorUp(),
  },
  insert: {
    escape: () => app.setMode("normal"),
  },
});
```

## Next Steps

- [Lifecycle & Updates](lifecycle-and-updates.md) - State management in depth
- [Layout](layout.md) - Spacing, alignment, and constraints
- [Input & Focus](input-and-focus.md) - Keyboard and mouse navigation
- [Mouse Support](mouse-support.md) - Click, scroll, and drag interactions
- [Widget Catalog](../widgets/index.md) - Complete widget reference
