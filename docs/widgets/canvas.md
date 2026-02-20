# Canvas

Low-level graphics widget for drawing raster content into terminal cells.

## Usage

```typescript
ui.canvas({
  width: 24,
  height: 8,
  blitter: "braille",
  draw: (ctx) => {
    ctx.line(0, 0, ctx.width - 1, ctx.height - 1, "#4ecdc4");
    ctx.fillRect(2, 2, 6, 3, "#ff6b6b");
  },
})
```

## Props

| Prop | Type | Default | Description |
|------|------|---------|-------------|
| `width` | `number` | **required** | Width in terminal columns |
| `height` | `number` | **required** | Height in terminal rows |
| `draw` | `(ctx: CanvasContext) => void` | **required** | Drawing callback |
| `blitter` | `"auto" \| "braille" \| "sextant" \| "quadrant" \| "halfblock" \| "ascii"` | `"auto"` | Pixel-to-cell encoding |
| `id` | `string` | - | Optional widget id |
| `key` | `string` | - | Reconciliation key |

## Canvas Context

`draw` receives a `CanvasContext` with:

- `line`, `fillRect`, `strokeRect`
- `circle`, `fillCircle`
- `setPixel`, `text`, `clear`

Coordinates are in sub-cell pixel space (`ctx.width`/`ctx.height`), not terminal cell space.

## Notes

- Color strings accept hex (`#rrggbb`) and theme color tokens.
- Graphics-capable builders emit `DRAW_CANVAS`; unsupported builders render a placeholder.

## Related

- [Image](image.md)
- [Line Chart](line-chart.md)
