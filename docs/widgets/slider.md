# Slider

A focusable range input for numeric values.

## Usage

```typescript
import { ui } from "@rezi-ui/core";

ui.slider({
  id: "volume",
  value: state.volume,
  min: 0,
  max: 100,
  step: 5,
  onChange: (value) => app.update((s) => ({ ...s, volume: value })),
});
```

## Props

| Prop | Type | Default | Description |
|---|---|---|---|
| `id` | `string` | **required** | Unique identifier for focus and routing |
| `value` | `number` | **required** | Current value |
| `focusable` | `boolean` | `true` | Remove the slider from Tab order while keeping id-based routing available |
| `accessibleLabel` | `string` | - | Optional semantic label for focus announcements and debugging |
| `min` | `number` | `0` | Minimum value |
| `max` | `number` | `100` | Maximum value |
| `step` | `number` | `1` | Keyboard increment/decrement step |
| `width` | `number` | auto | Track width in cells |
| `label` | `string` | - | Optional label before the slider |
| `showValue` | `boolean` | `true` | Show numeric value text |
| `onChange` | `(value: number) => void` | - | Called when value changes |
| `disabled` | `boolean` | `false` | Disable focus and interaction |
| `readOnly` | `boolean` | `false` | Keep focusable, but block value changes |
| `style` | `TextStyle` | - | Optional style override |
| `focusConfig` | `FocusConfig` | - | Control focus visuals; `{ indicator: "none" }` suppresses the focused slider highlight |
| `key` | `string` | - | Reconciliation key |

## Behavior

- Focusable when enabled.
- **Left/Down** decreases by `step`.
- **Right/Up** increases by `step`.
- **PageDown/PageUp** changes by 10 steps.
- **Home/End** jumps to min/max.
- `onChange` is optional; without it, the slider still renders and can receive focus, but it behaves as a non-editing control.
- `readOnly` sliders still receive focus but do not emit `onChange`.
- `focusConfig: { indicator: "none" }` keeps keyboard focus routing but suppresses the focused slider styling.

## Related

- [Input](input.md) - Free-form text input
- [Select](select.md) - Discrete option selection
- [Field](field.md) - Labels, hints, and error display
