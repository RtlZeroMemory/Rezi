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
| `px` | `number` | `1` | Horizontal padding in cells |
| `style` | `TextStyle` | - | Custom styling (merged with focus/disabled state) |
| `onPress` | `() => void` | - | Callback when button is activated |
| `focusConfig` | `FocusConfig` | - | Control focus visuals; `{ indicator: "none" }` suppresses focused label style |
| `key` | `string` | - | Reconciliation key for dynamic lists |

## Design System Styling

Buttons support design-system-based styling via `ds*` props. When present, these override manual `style`/`px` props with theme-aware, recipe-computed styles.

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
ui.button({ id: "save", label: "Save", dsVariant: "solid", dsTone: "primary", dsSize: "md" })

// Destructive action
ui.button({ id: "delete", label: "Delete", dsVariant: "outline", dsTone: "danger" })

// Subtle action
ui.button({ id: "cancel", label: "Cancel", dsVariant: "ghost" })
```

When `ds*` props are present, styling is computed automatically by the theme's recipe system. The button adapts to theme changes, capability tiers, and focus/disabled states without manual styling.

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
