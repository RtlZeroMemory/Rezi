# Image

Render binary image payloads (PNG or RGBA) with terminal image protocols.

## Usage

```typescript
ui.image({
  src: pngBytes,
  width: 20,
  height: 10,
  fit: "contain",
  protocol: "auto",
  alt: "Company logo",
})
```

## Props

| Prop | Type | Default | Description |
|------|------|---------|-------------|
| `src` | `Uint8Array` | **required** | PNG bytes or raw RGBA bytes |
| `sourceWidth` | `number` | - | Source pixel width (recommended for raw RGBA) |
| `sourceHeight` | `number` | - | Source pixel height (recommended for raw RGBA) |
| `width` | `number` | **required** | Width in terminal columns |
| `height` | `number` | **required** | Height in terminal rows |
| `fit` | `"fill" \| "contain" \| "cover"` | `"contain"` | Content fit mode |
| `protocol` | `"auto" \| "kitty" \| "sixel" \| "iterm2" \| "blitter"` | `"auto"` | Preferred transport protocol |
| `zLayer` | `-1 \| 0 \| 1` | `0` | Compositing layer |
| `imageId` | `number` | hash of `src` | Stable cache id for protocol backends |
| `alt` | `string` | - | Fallback text for unsupported/invalid images |
| `id` | `string` | - | Optional widget id |
| `key` | `string` | - | Reconciliation key |

## Notes

- PNG is auto-detected by signature; non-PNG payloads are treated as RGBA bytes.
- PNG payloads are routed through iTerm2 image protocol; kitty/sixel paths require RGBA.
- For raw RGBA payloads, providing `sourceWidth` + `sourceHeight` avoids heuristic dimension inference.
- Unsupported builders or invalid sources render a text placeholder (uses `alt` when present).
- In Node/Bun, use `loadImage(path)` from `@rezi-ui/node` to read file paths into `Uint8Array`.

## Related

- [Canvas](canvas.md)
