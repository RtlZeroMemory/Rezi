# Canvas

Low-level graphics widget for drawing raster content into terminal cells.

## Usage

```typescript
ui.canvas({
  width: 24,
  height: 8,
  blitter: "braille",
  draw: (ctx) => {
    ctx.roundedRect(0, 0, ctx.width, ctx.height, 4, "#2a9d8f");
    ctx.line(0, 0, ctx.width - 1, ctx.height - 1, "#4ecdc4");
    ctx.polyline(
      [
        { x: 1, y: ctx.height - 2 },
        { x: 8, y: 6 },
        { x: 14, y: 9 },
      ],
      "#ffd166",
    );
    ctx.arc(12, 10, 5, 0, Math.PI, "#06d6a0");
    ctx.fillTriangle(18, 3, 22, 10, 14, 10, "#ef476f");
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

- `line`, `polyline`
- `fillRect`, `strokeRect`, `roundedRect`
- `circle`, `arc`, `fillCircle`
- `fillTriangle`
- `setPixel`, `text`, `clear`

Coordinates are in sub-cell pixel space (`ctx.width`/`ctx.height`), not terminal cell space.
Arc angles are in radians.

## Notes

- Color strings accept hex (`#rrggbb`) and theme color tokens.
- Graphics-capable builders emit `DRAW_CANVAS`; unsupported builders render a placeholder.

## Related

- [Image](image.md)
- [Line Chart](line-chart.md)
