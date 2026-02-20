# Heatmap

Heatmap widget for 2D numeric matrices using deterministic color scales.

## Usage

```typescript
ui.heatmap({
  width: 32,
  height: 10,
  data: [
    [0.1, 0.2, 0.3, 0.4],
    [0.9, 0.7, 0.5, 0.2],
    [0.0, 0.2, 0.6, 1.0],
  ],
  colorScale: "viridis",
})
```

## Props

| Prop | Type | Default | Description |
|------|------|---------|-------------|
| `width` | `number` | **required** | Width in terminal columns |
| `height` | `number` | **required** | Height in terminal rows |
| `data` | `number[][]` | **required** | Matrix indexed as `[row][col]` |
| `colorScale` | `"viridis" \| "plasma" \| "inferno" \| "magma" \| "turbo" \| "grayscale"` | `"viridis"` | Color lookup table |
| `min` | `number` | auto from data | Explicit minimum value |
| `max` | `number` | auto from data | Explicit maximum value |
| `id` | `string` | - | Optional widget id |
| `key` | `string` | - | Reconciliation key |

## Notes

- Cells are mapped to canvas regions and rendered with `quadrant`-grade sub-cell detail.
- Invalid/empty data resolves to a stable fallback range to preserve determinism.

## Related

- [Scatter](scatter.md)
- [Line Chart](line-chart.md)
