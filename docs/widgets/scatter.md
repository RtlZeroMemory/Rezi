# Scatter

Scatter plot widget rendered through the graphics canvas pipeline.

## Usage

```typescript
ui.scatter({
  width: 40,
  height: 12,
  points: [
    { x: 1, y: 2, color: "#4ecdc4" },
    { x: 3, y: 4 },
    { x: 8, y: 1, color: "#ff6b6b" },
  ],
  color: "#a0aec0",
})
```

## Props

| Prop | Type | Default | Description |
|------|------|---------|-------------|
| `width` | `number` | **required** | Width in terminal columns |
| `height` | `number` | **required** | Height in terminal rows |
| `points` | `{ x: number; y: number; color?: string }[]` | **required** | Data points |
| `axes` | `{ x?: { min?: number; max?: number; label?: string }; y?: { min?: number; max?: number; label?: string } }` | auto range | Optional axis bounds |
| `color` | `string` | theme primary | Default point color |
| `blitter` | `"auto" \| "braille" \| "sextant" \| "quadrant" \| "halfblock"` | `"auto"` | Sub-cell renderer |
| `id` | `string` | - | Optional widget id |
| `key` | `string` | - | Reconciliation key |

## Notes

- Axis range is auto-derived from point data unless explicit bounds are provided.
- Unsupported graphics builders render a placeholder box instead of raw bytes.

## Related

- [Line Chart](line-chart.md)
- [Heatmap](heatmap.md)
