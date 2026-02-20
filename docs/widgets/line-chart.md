# Line Chart

Multi-series line chart rendered through the graphics drawlist pipeline.

## Usage

```typescript
ui.lineChart({
  width: 30,
  height: 10,
  series: [
    { label: "CPU", color: "#4ecdc4", data: [20, 40, 35, 55, 48] },
    { label: "MEM", color: "#ff6b6b", data: [60, 58, 62, 67, 65] },
  ],
  showLegend: true,
})
```

## Props

| Prop | Type | Default | Description |
|------|------|---------|-------------|
| `width` | `number` | **required** | Width in terminal columns |
| `height` | `number` | **required** | Height in terminal rows |
| `series` | `{ data: number[]; color: string; label?: string }[]` | **required** | Series definitions |
| `axes` | `{ x?: ChartAxis; y?: ChartAxis }` | auto range | Optional axis bounds/labels |
| `showLegend` | `boolean` | `true` when multiple series, else `false` | Draw series labels below chart |
| `blitter` | `"braille" \| "sextant" \| "quadrant" \| "halfblock" \| "auto"` | `"braille"` | Sub-cell renderer |
| `id` | `string` | - | Optional widget id |
| `key` | `string` | - | Reconciliation key |

## Notes

- Non-finite points are skipped/clamped by range resolution.
- Unsupported builders render a placeholder instead of graphics commands.

## Related

- [Sparkline](sparkline.md)
- [Bar Chart](bar-chart.md)
