# `Sparkline`

Tiny inline chart for showing trends.

## Usage

```ts
ui.sparkline(state.series, { width: 24, min: 0, max: 100 })
```

## Props

| Prop | Type | Default | Description |
|------|------|---------|-------------|
| `data` | `number[]` | **required** | Raw numeric data points |
| `width` | `number` | `data.length` | Width in cells |
| `min` | `number` | auto (`Math.min(...data)`) | Minimum value for scaling |
| `max` | `number` | auto (`Math.max(...data)`) | Maximum value for scaling |
| `style` | `TextStyle` | - | Optional style override |

## Notes

- Values are normalized internally using `(value - min) / (max - min)`.
- Use `min`/`max` to pin the scale when comparing multiple sparklines.
- For multi-series data, render multiple sparklines in a `row`.

## Related

- [Mini chart](mini-chart.md)
- [Bar chart](bar-chart.md)
