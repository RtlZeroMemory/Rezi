# Checkbox

A focusable boolean toggle widget.

## Usage

```typescript
import { ui } from "@rezi-ui/core";

ui.checkbox({
  id: "opt-in",
  label: "Receive updates",
  checked: state.optIn,
  onChange: (checked) => app.update((s) => ({ ...s, optIn: checked })),
});
```

## Props

| Prop | Type | Default | Description |
|---|---|---|---|
| `id` | `string` | **required** | Unique identifier for focus and event routing |
| `checked` | `boolean` | **required** | Current checked state |
| `label` | `string` | - | Optional label displayed next to the box |
| `onChange` | `(checked: boolean) => void` | - | Called when the user toggles the checkbox |
| `disabled` | `boolean` | `false` | Disable focus and interaction |
| `key` | `string` | - | Reconciliation key |

## Design System Styling

Checkboxes are design-system styled by default when the active theme provides semantic color tokens. The indicator and label use the checkbox recipe for consistent checked/focus/disabled styling.

If the active theme does not provide semantic color tokens, checkboxes fall back to non-recipe rendering.

## Behavior

- Focusable when enabled.
- Toggle with **Space** (and commonly **Enter** depending on terminal key mapping).
- **Mouse click** focuses and toggles the checkbox.
- **Tab / Shift+Tab** moves focus.

## Examples

### 1) Unlabeled checkbox (icon-only)

```typescript
import { ui } from "@rezi-ui/core";

ui.checkbox({ id: "flag", checked: state.flag, onChange: (c) => app.update((s) => ({ ...s, flag: c })) });
```

### 2) Disabled

```typescript
import { ui } from "@rezi-ui/core";

ui.checkbox({ id: "tos", checked: true, label: "Accept terms", disabled: true });
```

## Related

- [Select](select.md) - Dropdown selection
- [Radio Group](radio-group.md) - Exclusive-choice options
- [Input & Focus](../guide/input-and-focus.md) - Focus model and navigation
