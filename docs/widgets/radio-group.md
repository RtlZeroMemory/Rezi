# Radio Group

An exclusive-choice group (one selection at a time).

## Usage

```typescript
import { ui } from "@rezi-ui/core";

ui.radioGroup({
  id: "color",
  value: state.color,
  options: [
    { value: "red", label: "Red" },
    { value: "blue", label: "Blue" },
  ],
  onChange: (value) => app.update((s) => ({ ...s, color: value })),
  direction: "vertical",
});
```

## Props

| Prop | Type | Default | Description |
|---|---|---|---|
| `id` | `string` | **required** | Unique identifier for focus and event routing |
| `value` | `string` | **required** | Currently selected value |
| `options` | `{ value: string; label: string; disabled?: boolean }[]` | **required** | Available options; disabled entries stay visible but are skipped by keyboard selection |
| `onChange` | `(value: string) => void` | - | Called when arrow-key navigation changes the selected value |
| `direction` | `"horizontal" \| "vertical"` | `"vertical"` | Layout direction |
| `disabled` | `boolean` | `false` | Disable focus and interaction |
| `focusable` | `boolean` | `true` | Opt out of Tab order while keeping id-based routing available |
| `accessibleLabel` | `string` | - | Optional semantic label for announcements and debugging |
| `focusConfig` | `FocusConfig` | theme default | Optional focus-indicator configuration |
| `dsTone` | `"default" \| "primary" \| "danger" \| "success" \| "warning"` | `"default"` | Design-system tone for selected/focus rendering |
| `dsSize` | `"sm" \| "md" \| "lg"` | `"md"` | Design-system size preset |
| `key` | `string` | - | Reconciliation key |

## Behavior

- Focusable when enabled.
- Disabled options remain rendered with disabled styling and are skipped by arrow-key navigation.
- **Mouse click** focuses the radio group but does not select an option.
- Navigate choices with **ArrowUp/ArrowDown** in vertical groups or **ArrowLeft/ArrowRight** in horizontal groups.
- **Enter** does not change the current selection.
- **Tab / Shift+Tab** moves focus in/out.

## Examples

### 1) Horizontal layout

```typescript
import { ui } from "@rezi-ui/core";

ui.radioGroup({
  id: "plan",
  value: state.plan,
  direction: "horizontal",
  options: [
    { value: "free", label: "Free" },
    { value: "pro", label: "Pro" },
  ],
  onChange: (v) => app.update((s) => ({ ...s, plan: v })),
});
```

### 2) Disabled

```typescript
import { ui } from "@rezi-ui/core";

ui.radioGroup({
  id: "size",
  value: "m",
  options: [{ value: "m", label: "Medium" }],
  disabled: true,
});
```

## Related

- [Select](select.md) - Inline single-choice cycler
- [Checkbox](checkbox.md) - Boolean toggle
- [Input & Focus](../guide/input-and-focus.md) - Focus navigation rules
