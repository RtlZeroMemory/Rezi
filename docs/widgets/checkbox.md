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
| `focusable` | `boolean` | `true` | Opt out of Tab focus while keeping id-based routing available |
| `accessibleLabel` | `string` | - | Semantic label used for accessibility and focus announcements |
| `label` | `string` | - | Optional label displayed next to the box |
| `onChange` | `(checked: boolean) => void` | - | Called when the user toggles the checkbox |
| `disabled` | `boolean` | `false` | Disable focus and interaction |
| `focusConfig` | `FocusConfig` | - | Custom focus appearance configuration |
| `dsTone` | `"default" \| "primary" \| "danger" \| "success" \| "warning"` | `"default"` | Design-system tone for checked/focus rendering |
| `dsSize` | `"sm" \| "md" \| "lg"` | `"md"` | Design-system size preset |
| `key` | `string` | - | Reconciliation key |

## Design System Styling

Checkboxes are design-system styled by default under the active
`ThemeDefinition`.
The indicator and label use `checkboxRecipe()` for checked/focus/disabled states.

## Behavior

- Focusable when enabled.
- Toggle with **Space** (and commonly **Enter** depending on terminal key mapping).
- **Mouse down** focuses the checkbox.
- **Mouse up on the same checkbox** toggles it when `onChange` is provided.
- **Tab / Shift+Tab** moves focus.

## Examples

### 1) Unlabeled checkbox (icon-only)

```typescript
import { ui } from "@rezi-ui/core";

ui.checkbox({
  id: "flag",
  checked: state.flag,
  accessibleLabel: "Feature flag",
  onChange: (c) => app.update((s) => ({ ...s, flag: c })),
});
```

When `label` is omitted or visually ambiguous, provide `accessibleLabel` so focus
announcements and other semantic affordances stay clear. Set `focusable: false`
only when you intentionally want the checkbox out of Tab order while keeping
id-based routing available.

### 2) Disabled

```typescript
import { ui } from "@rezi-ui/core";

ui.checkbox({ id: "tos", checked: true, label: "Accept terms", disabled: true });
```

## Related

- [Select](select.md) - Dropdown selection
- [Radio Group](radio-group.md) - Exclusive-choice options
- [Input & Focus](../guide/input-and-focus.md) - Focus model and navigation
