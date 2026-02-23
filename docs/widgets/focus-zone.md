# Focus Zone

Groups focusable widgets into a logical unit for Tab traversal. Focus zones help organize complex UIs by creating focus "islands" that users navigate between with Tab.

## Usage

```typescript
ui.focusZone(
  { id: "toolbar", tabIndex: 0 },
  [
    ui.button({ id: "new", label: "New" }),
    ui.button({ id: "open", label: "Open" }),
    ui.button({ id: "save", label: "Save" }),
  ]
)
```

## Layout behavior

`focusZone` is layout-transparent when it wraps exactly one child: the child keeps its own layout behavior (for example, a `row` stays horizontal).

When you pass multiple direct children, current behavior falls back to legacy column stacking for backward compatibility. Prefer wrapping multi-child content in an explicit layout container:

```typescript
ui.focusZone(
  { id: "toolbar" },
  [
    ui.row({ gap: 1 }, [
      ui.button({ id: "a", label: "A" }),
      ui.button({ id: "b", label: "B" }),
    ]),
  ]
)
```

## Props

| Prop | Type | Default | Description |
|------|------|---------|-------------|
| `id` | `string` | **required** | Unique identifier for the zone |
| `tabIndex` | `number` | `0` | Order in which zones receive focus (lower = earlier) |
| `navigation` | `"linear" \| "grid" \| "none"` | `"linear"` | How focus moves within the zone |
| `columns` | `number` | `1` | Number of columns for grid navigation |
| `wrapAround` | `boolean` | `true` | Wrap from last to first item |
| `onEnter` | `() => void` | - | Callback when zone receives focus |
| `onExit` | `() => void` | - | Callback when focus leaves zone |
| `key` | `string` | - | Reconciliation key |

## Navigation Modes

### Linear (Default)

Arrow keys move through items in document order:

```typescript
ui.focusZone({ id: "list", navigation: "linear" }, [
  ui.button({ id: "a", label: "A" }),
  ui.button({ id: "b", label: "B" }),
  ui.button({ id: "c", label: "C" }),
])
// Up/Down or Left/Right moves A -> B -> C
```

### Grid

Arrow keys navigate a 2D grid layout:

```typescript
ui.focusZone({ id: "grid", navigation: "grid", columns: 3 }, [
  ui.button({ id: "1", label: "1" }),
  ui.button({ id: "2", label: "2" }),
  ui.button({ id: "3", label: "3" }),
  ui.button({ id: "4", label: "4" }),
  ui.button({ id: "5", label: "5" }),
  ui.button({ id: "6", label: "6" }),
])
// Left/Right moves horizontally
// Up/Down moves between rows
```

### None

Disables internal arrow key navigation (Tab still works):

```typescript
ui.focusZone({ id: "custom", navigation: "none" }, [...])
```

## Zone Ordering

Use `tabIndex` to control the order zones receive focus:

```typescript
ui.column({}, [
  // User presses Tab: sidebar -> main -> footer
  ui.focusZone({ id: "sidebar", tabIndex: 0 }, [...]),
  ui.focusZone({ id: "main", tabIndex: 1 }, [...]),
  ui.focusZone({ id: "footer", tabIndex: 2 }, [...]),
])
```

## Enter/Exit Callbacks

Track when focus enters or leaves a zone:

```typescript
ui.focusZone({
  id: "search",
  onEnter: () => showSearchHint(),
  onExit: () => hideSearchHint(),
}, [
  ui.input({ id: "query", value: state.query }),
  ui.button({ id: "search", label: "Search" }),
])
```

## Form Example

Organize a form into logical sections:

```typescript
ui.column({ gap: 2 }, [
  ui.focusZone({ id: "credentials", tabIndex: 0 }, [
    ui.field({ label: "Username", children:
      ui.input({ id: "user", value: state.user })
    }),
    ui.field({ label: "Password", children:
      ui.input({ id: "pass", value: state.pass })
    }),
  ]),

  ui.focusZone({ id: "actions", tabIndex: 1 }, [
    ui.button({ id: "login", label: "Login" }),
    ui.button({ id: "cancel", label: "Cancel" }),
  ]),
])
```

## Mouse Behavior

Clicking any focusable widget inside a focus zone moves focus to that widget, just like Tab navigation. The zone's `onEnter` callback fires when focus enters the zone via mouse click.

## Related

- [Focus Trap](focus-trap.md) - Constrain focus within a region
- [Modal](modal.md) - Modal dialog with focus trap
- [Button](button.md) - Focusable button
- [Mouse Support](../guide/mouse-support.md) - Mouse interaction details
