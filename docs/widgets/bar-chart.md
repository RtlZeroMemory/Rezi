# `BarChart`

Bar chart widget for categorical data.

## Usage

```ts
ui.barChart([
  { label: "A", value: 12 },
  { label: "B", value: 5 },
  { label: "C", value: 18 },
], { orientation: "horizontal", showValues: true })
```

## Props

| Prop | Type | Default | Description |
|------|------|---------|-------------|
| `data` | `{ label: string; value: number; variant?: BadgeVariant }[]` | **required** | Data items to render |
| `orientation` | `"horizontal" \| "vertical"` | `"horizontal"` | Chart orientation |
| `showValues` | `boolean` | `true` | Render numeric values |
| `showLabels` | `boolean` | `true` | Render labels |
| `maxBarLength` | `number` | auto | Max bar length in cells |
| `highRes` | `boolean` | `false` | Render bars via graphics drawlists when supported |
| `blitter` | `"braille" \| "sextant" \| "quadrant" \| "halfblock"` | `"braille"` | Sub-cell renderer used in `highRes` mode |
| `style` | `TextStyle` | - | Optional style override |

`BadgeVariant` values: `"default"`, `"success"`, `"warning"`, `"error"`, `"info"`.

`highRes` mode is best for bar-only views (`showLabels: false`, `showValues: false`) and falls back to text rendering on non-graphics builders.

## Related

- [Mini chart](mini-chart.md)
- [Sparkline](sparkline.md)
