# Button

An interactive widget that can receive focus and be activated by pressing Enter, Space, or clicking.

## Usage

```typescript
ui.button({ id: "save", label: "Save" })
ui.button({ id: "delete", label: "Delete", disabled: true })
ui.button({
  id: "submit",
  label: "Submit",
  onPress: () => handleSubmit(),
})
```

## Props

| Prop | Type | Default | Description |
|------|------|---------|-------------|
| `id` | `string` | **required** | Unique identifier for focus and event routing |
| `label` | `string` | **required** | Button text |
| `accessibleLabel` | `string` | - | Optional semantic label for focus announcements and debugging |
| `disabled` | `boolean` | `false` | Disable interaction and dim appearance |
| `px` | `number` | `dsSize` / `1` fallback | Horizontal padding in cells. When recipe styling is active, this overrides recipe padding; use `dsSize` for standard presets. |
| `style` | `TextStyle` | - | Custom styling (merged with focus/disabled state) |
| `intent` | `"primary" \| "secondary" \| "danger" \| "success" \| "warning" \| "link"` | - | Shorthand for design system styling. Explicit `dsVariant`/`dsTone` override it. |
| `onPress` | `() => void` | - | Callback when button is activated |
| `focusConfig` | `FocusConfig` | - | Control focus visuals; `{ indicator: "none" }` suppresses focused label style |
| `key` | `string` | - | Reconciliation key for dynamic lists |

## Design System Styling

Buttons are design-system styled by default when the active theme provides semantic color tokens. This means:

- `ui.button({ id, label })` renders with recipe-based styling (defaults to a `"soft"` look).
- `dsVariant` / `dsTone` / `dsSize` customize the recipe styling.
- `intent` is a shorthand for common `dsVariant`/`dsTone` combinations.
- `px` overrides recipe padding (use `dsSize` for standard presets).
- Manual `style` / `pressedStyle` props are merged on top of the recipe result (they do not disable recipes).
- If the active theme does not provide semantic color tokens, buttons fall back to non-recipe rendering.

| Prop | Type | Default | Description |
|------|------|---------|-------------|
| `dsVariant` | `"solid" \| "soft" \| "outline" \| "ghost"` | `"soft"` | Visual variant |
| `dsTone` | `"default" \| "primary" \| "danger" \| "success" \| "warning"` | `"default"` | Semantic tone |
| `dsSize` | `"sm" \| "md" \| "lg"` | `"md"` | Size preset (controls padding) |

## Behavior

Buttons are focusable when enabled. They can be activated by keyboard or mouse:

- **Enter** or **Space** activates the button
- **Mouse click** focuses and activates the button (press down + release on the same button)
- **Tab** moves focus to the next focusable widget
- **Shift+Tab** moves focus to the previous focusable widget

The `onPress` callback fires regardless of whether the button was activated by keyboard or mouse. Buttons can be handled either via callback props or in a global `app.onEvent` handler.

## Examples

### Design system buttons (recommended)

```typescript
// Primary action
ui.button({ id: "save", label: "Save", intent: "primary" })

// Destructive action
ui.button({ id: "delete", label: "Delete", intent: "danger" })

// Subtle action
ui.button({ id: "cancel", label: "Cancel" })
```

When recipe styling is active, the button adapts to theme changes, capability tiers, and focus/disabled states without manual styling.

### Callback props (recommended)

```typescript
ui.button({
  id: "inc",
  label: "+1",
  onPress: () => app.update((s) => ({ count: s.count + 1 })),
})
```

### Global event handler

```typescript
app.onEvent((ev) => {
  if (ev.kind === "action" && ev.id === "save" && ev.action === "press") {
    handleSave();
  }
});
```

### Styling

```typescript
import { rgb } from "@rezi-ui/core";

ui.button({
  id: "danger",
  label: "Delete",
  style: {
    fg: rgb(255, 100, 100),
    bold: true,
  },
})
```

The button's focus and disabled states are automatically applied and merged with custom styles.

## Related

- [Input](input.md) - Text input widget
- [Checkbox](checkbox.md) - Toggle checkbox
- [Focus Zones](focus-zone.md) - Group focusable widgets
