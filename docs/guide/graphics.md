# Graphics Guide

Rezi graphics widgets progressively enhance from plain text placeholders to sub-cell and protocol image rendering.

## Terminal capabilities

Use `app.getTerminalProfile()` to inspect runtime capabilities:

- `supportsKittyGraphics`, `supportsSixel`, `supportsIterm2Images`
- `supportsUnderlineStyles`, `supportsColoredUnderlines`, `supportsHyperlinks`
- terminal identity/version and optional cell pixel size hints

This allows explicit capability gating in your own render logic.

## Progressive enhancement strategy

1. Start with semantic content that works as text (`ui.text`, placeholder labels).
2. Upgrade to `ui.canvas()`/chart widgets when drawlist v3 graphics is available.
3. Upgrade to `ui.image()` protocol rendering when image protocol support is present.

When graphics are unavailable, Rezi widgets render deterministic placeholder boxes instead of failing.

## Canvas vs image vs charts

- Use `ui.canvas()` for custom primitives and one-off visuals.
- Use `ui.lineChart()`, `ui.scatter()`, and `ui.heatmap()` for data visualization.
- Use `ui.image()` for binary PNG/RGBA assets and protocol-backed rendering.

## Performance notes

- Canvas `draw` callbacks run every frame and should stay synchronous and stateless.
- Reuse input data structures where possible to reduce per-frame allocations.
- Use `imageId` for stable image caching across frames.
- Lower-detail blitters (`quadrant`, `halfblock`) trade precision for throughput.

## Example

```typescript
const profile = app.getTerminalProfile();
const logoNode =
  profile.supportsKittyGraphics || profile.supportsSixel || profile.supportsIterm2Images
    ? ui.image({ src: logoBytes, width: 20, height: 8, alt: "Logo" })
    : ui.text("[Logo]");
```
