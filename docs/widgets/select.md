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
| `options` | `{ value: string; label: string; disabled?: boolean }[]` | **required** | Available options |
| `onChange` | `(value: string) => void` | - | Called when selection changes |
| `disabled` | `boolean` | `false` | Disable focus and interaction |
| `placeholder` | `string` | - | Text shown when no matching option label is found |
| `focusConfig` | `FocusConfig` | - | Control focus visuals; `{ indicator: "none" }` suppresses focused select decoration |
| `dsSize` | `"sm" \| "md" \| "lg"` | `"md"` | Design system size preset (controls padding) |
| `key` | `string` | - | Reconciliation key |

## Design System Styling

Selects are design-system styled by default when the active theme provides semantic color tokens. Use `dsSize` to adjust padding.

If the active theme does not provide semantic color tokens, selects fall back to non-recipe rendering.

> Note: like inputs, framed select chrome (border + interior) needs at least 3 rows of height. In a 1-row layout, the select still renders with recipe text/background styling, but without a box border.

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
