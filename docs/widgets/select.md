# Select

A focusable dropdown selection widget for choosing one value from a list of options.

## Usage

```typescript
import { ui } from "@rezi-ui/core";

ui.select({
  id: "theme",
  value: state.theme,
  options: [
    { value: "dark", label: "Dark" },
    { value: "light", label: "Light" },
  ],
  onChange: (value) => app.update((s) => ({ ...s, theme: value })),
  placeholder: "Choose a theme…",
});
```

## Props

| Prop | Type | Default | Description |
|---|---|---|---|
| `id` | `string` | **required** | Unique identifier for focus and event routing |
| `value` | `string` | **required** | Currently selected value |
| `options` | `{ value: string; label: string }[]` | **required** | Available options |
| `onChange` | `(value: string) => void` | - | Called when selection changes |
| `disabled` | `boolean` | `false` | Disable focus and interaction |
| `placeholder` | `string` | - | Text shown when no matching option label is found |
| `focusConfig` | `FocusConfig` | - | Control focus visuals; `{ indicator: "none" }` suppresses focused select decoration |
| `key` | `string` | - | Reconciliation key |

## Behavior

- Focusable when enabled.
- **Mouse click** focuses the select widget.
- Navigate options with **ArrowUp/ArrowDown**.
- Confirm selection with **Enter**.
- **Tab / Shift+Tab** moves focus to the next/previous widget.

## Examples

### 1) With a `field` wrapper

```typescript
import { ui } from "@rezi-ui/core";

ui.field({
  label: "Theme",
  children: ui.select({
    id: "theme",
    value: state.theme,
    options: [
      { value: "dark", label: "Dark" },
      { value: "light", label: "Light" },
    ],
    onChange: (v) => app.update((s) => ({ ...s, theme: v })),
  }),
});
```

### 2) Disabled state

```typescript
import { ui } from "@rezi-ui/core";

ui.select({
  id: "country",
  value: "us",
  options: [{ value: "us", label: "United States" }],
  disabled: true,
});
```

## Related

- [Radio Group](radio-group.md) - Alternative single-choice input
- [Checkbox](checkbox.md) - Boolean toggle
- [Field](field.md) - Labels, hints, and error display
