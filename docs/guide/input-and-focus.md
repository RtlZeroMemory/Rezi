# Input & Focus

Rezi routes input deterministically through a focus system that manages keyboard and mouse navigation and event delivery. See also the dedicated [Mouse Support](mouse-support.md) guide.

## Identity: `id` vs `key`

Two identity systems serve different purposes:

| Prop | Purpose | Example |
|------|---------|---------|
| `id` | Focus management and event routing | `ui.button({ id: "save", label: "Save" })` |
| `key` | Reconciliation stability in lists | `ui.text(item.name, { key: item.id })` |

These must not be conflated:

- `id` must be unique across the committed widget tree
- `key` only needs to be unique among siblings
- Non-interactive widgets may omit `id`
- Dynamic lists should always provide `key`

## Focus Navigation

Focusable widgets (buttons, inputs, selects) participate in Tab and mouse navigation:

- **Tab** - Move focus forward
- **Shift+Tab** - Move focus backward
- **Enter/Space** - Activate focused widget
- **Arrow keys** - Navigate within widgets (lists, tables)
- **Mouse click** - Focus and activate the clicked widget

### Focus Order

Focus order follows document order (depth-first tree traversal):

```typescript
ui.column({}, [
  ui.button({ id: "first", label: "1" }),   // Tab stop 1
  ui.row({}, [
    ui.button({ id: "second", label: "2" }), // Tab stop 2
    ui.button({ id: "third", label: "3" }),  // Tab stop 3
  ]),
  ui.button({ id: "fourth", label: "4" }),  // Tab stop 4
])
```

Focus persistence is ID-based across commits:

- If the currently focused `id` still exists after re-render, focus stays on that `id` even if position changes.
- If that `id` disappears, focus falls back to the first focusable widget in traversal order (or `null` if none remain).
- Deferred/pending focus requests are resolved during finalize against the newly committed tree using the same rules.

### Focus Zones

Group related widgets with focus zones for organized Tab navigation:

```typescript
ui.column({}, [
  ui.focusZone({ id: "toolbar" }, [
    ui.button({ id: "new", label: "New" }),
    ui.button({ id: "open", label: "Open" }),
  ]),
  ui.focusZone({ id: "form" }, [
    ui.input({ id: "name", value: state.name }),
    ui.button({ id: "submit", label: "Submit" }),
  ]),
])
```

Tab moves between zones; arrow keys navigate within zones.

Zone traversal order is deterministic:

- Zones are traversed by ascending `tabIndex`.
- Ties on `tabIndex` preserve tree traversal order.
- Empty zones are skipped during Tab/Shift+Tab traversal.

### Focus Traps

Constrain focus within modals and overlays:

```typescript
ui.focusTrap({ id: "modal", active: state.showModal }, [
  ui.text("Confirm action?"),
  ui.button({ id: "ok", label: "OK" }),
  ui.button({ id: "cancel", label: "Cancel" }),
])
```

Trap activation focus rules:

- `initialFocus` should point to an element inside the trap for guaranteed containment.
- If `initialFocus` is not focusable in the committed tree, focus falls back to the first focusable element inside the trap.

## Keybinding System

### Key string syntax

- A binding string is one or more key parts separated by whitespace (for chords), for example `"g g"` or `"ctrl+x ctrl+s"`.
- Each key part uses `modifier+...+key`. The final segment must be a key, not a modifier.
- Parsing is case-insensitive for modifiers and named keys.
- Letter case does not imply `shift`: `"a"` and `"A"` parse the same; require `shift+...` explicitly when Shift must match.
- Supported modifiers: `shift`, `ctrl`/`control`, `alt`, `meta`/`cmd`/`command`/`win`/`super`.
- Supported named keys: `escape`/`esc`, `enter`/`return`, `tab`, `backspace`, `space`, `insert`, `delete`/`del`, `home`, `end`, `pageup`, `pagedown`, `up`, `down`, `left`, `right`, `f1`-`f12`.
- Single-character keys are supported for letters, digits, and most punctuation (`+` is reserved as the modifier separator). Use `space` (not a literal space) for the Space key.
- Invalid key strings are skipped during registration; they do not throw.

### Chord matching

- Matching only considers `key` events with `action: "down"`.
- A chord prefix enters pending state and consumes the key.
- Timeout is `1000ms` from the first key in the pending chord.
- If the next key does not continue the pending chord, pending state is cancelled and that same key is retried as a fresh start.
- Any full match or full miss resets chord pending state.
- Prefix conflicts are eager: if a sequence is both a complete match and a prefix of a longer sequence, the complete match fires immediately (no wait window for the longer sequence).

### Modes: definition, activation, inheritance

- `app.keys()` registers into the built-in `default` mode.
- `app.modes()` accepts either:
  - `{ modeName: { ...bindings } }`
  - `{ modeName: { parent?: string, bindings: { ... } } }`
- `app.setMode(name)` activates a previously-registered mode; unknown mode names throw.
- `app.getMode()` returns the active mode name.
- Mode lookup is current mode first, then `parent` chain fallback (cycle-safe).
- Switching to a different mode resets pending chord state. Calling `setMode()` with the current mode is a no-op.

### Binding conflicts and re-registration

- Registration is additive by mode, but re-registering the same sequence replaces the previous binding for that sequence.
- For distinct sequences in one mode, higher `priority` wins (`priority` default is `0`).
- Parent modes are only consulted when the active mode does not produce a usable match (or the active-mode winner's `when(ctx)` predicate returns `false`).
- Handlers receive `ctx` with `state`, `update(...)`, and `focusedId`.

### Key event routing order

In widget mode, key routing is:

1. App keybindings (`app.keys` / `app.modes`) run first.
2. Escape bypass: if key is `Escape` and a dropdown is open or any modal layer exists, app keybindings are skipped for that event.
3. If keybindings consume the event (matched or pending chord), widget routing is skipped.
4. Otherwise widget routing runs, in this order: top dropdown key handling, layer Escape close handling, focused-widget-specific key handlers, then generic focus/press/input routing.

## Mouse Input

Mouse input shares the same focus state as keyboard navigation:

- Mouse down transfers focus immediately to the hit, enabled focusable widget.
- Button activation is press/release based (down + up on the same enabled button).
- Wheel routing prefers a `VirtualList` under cursor, then focused scrollables; wheel deltas are step-based and clamped.
- `SplitPane` dividers use dedicated drag routing (split panes are not focusable targets).
- Mouse events do not run keybinding chord matching directly.

For complete click/scroll/drag and hit-testing invariants, see [Mouse Support](mouse-support.md).

## Event Handling

### Widget Events

Interactive widgets receive events through callback props:

```typescript
ui.button({
  id: "submit",
  label: "Submit",
  onPress: () => handleSubmit(),
})

ui.input({
  id: "name",
  value: state.name,
  onInput: (value) => app.update((s) => ({ ...s, name: value })),
  onBlur: () => validateName(),
})

ui.select({
  id: "country",
  value: state.country,
  options: countries,
  onChange: (value) => app.update((s) => ({ ...s, country: value })),
})
```

### Global Event Handler

For centralized event handling, use `app.onEvent()`:

```typescript
const unsubscribe = app.onEvent((ev) => {
  if (ev.kind === "action") {
    console.log(`Action: ${ev.id} / ${ev.action}`);
  }
});

// Later: unsubscribe();
```

### Event Types

Rezi exposes two event layers:

**Engine Events** - Low-level events decoded from the ZREV protocol:

- Key events with modifiers and key codes
- Mouse events with position and button state
- Resize events
- Tick events for animations

**Routed UI Events** - High-level actions:

- `{ kind: "action", id: "btn", action: "press" }` - Button activation
- `{ kind: "action", id: "input", action: "input", value, cursor }` - Text input
- `{ kind: "action", id: "select", action: "change", value }` - Selection change

## Input Editor

Single-line input editing is deterministic and grapheme-aware:

- Cursor and selection offsets are snapped to grapheme cluster boundaries.
- `Left/Right` move by grapheme; `Ctrl+Left/Ctrl+Right` move by word boundaries.
- `Home/End` move to start/end; Shift-modified movement extends selection.
- `Ctrl+A` selects the full input value.
- Typing/paste with active selection replaces the selected range.
- Backspace/Delete with active selection remove the selected range.
- Paste decodes UTF-8 with replacement for invalid bytes, strips `\r`/`\n`, and keeps tabs.

### Selection Model

- No selection: `selectionStart = null`, `selectionEnd = null`.
- Active selection: `selectionStart` is the anchor and `selectionEnd` is the active end (cursor).
- Backward selections are represented by `selectionStart > selectionEnd`.
- Non-shift movement collapses the active selection to an edge.

### Renderer-Facing State API

`applyInputEditEvent(...)` returns:

- `nextValue`
- `nextCursor`
- `nextSelectionStart`
- `nextSelectionEnd`
- optional `action` (only when the value changes)

Renderers can use `nextSelectionStart/nextSelectionEnd` to draw selection highlights.

## Determinism

Rezi's focus and event routing is deterministic:

- Same widget tree produces the same focus order
- Same input sequence produces the same routed events
- No timing-dependent behavior in the core

This enables:

- Reproducible testing with event sequences
- Predictable user experience
- Debuggable event flows

## Next Steps

- [Mouse Support](mouse-support.md) - Click, scroll, and drag interactions
- [Styling](styling.md) - Colors, themes, and visual customization
- [Focus Zone](../widgets/focus-zone.md) - Focus zone widget reference
- [Focus Trap](../widgets/focus-trap.md) - Focus trap widget reference
