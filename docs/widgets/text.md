# Text

Renders text with optional styling, overflow handling, and optional multiline wrapping.

## Usage

```typescript
import { ui, rgb } from "@rezi-ui/core";

ui.text("Hello");
ui.text("Title", { fg: rgb(120, 200, 255), bold: true }); // pass a TextStyle
ui.text("Caption", { variant: "caption", textOverflow: "ellipsis" }); // pass TextProps
```

## Props

`ui.text(content, styleOrProps?)` accepts either a `TextStyle` or `TextProps`.

| Prop | Type | Default | Description |
|---|---|---|---|
| `id` | `string` | - | Optional identity (not focusable) |
| `key` | `string` | - | Reconciliation key for lists |
| `style` | `TextStyle` | - | Style applied to this text |
| `variant` | `"body" \| "heading" \| "caption" \| "code" \| "label"` | `"body"` | Predefined styling intent |
| `textOverflow` | `"clip" \| "ellipsis" \| "middle"` | `"clip"` | How to handle overflow |
| `maxWidth` | `number` | - | Maximum width (cells) for overflow handling |
| `wrap` | `boolean` | `false` | Wrap text into multiple lines using cell-width-aware line breaking |

## Examples

### 1) Heading + caption

```typescript
import { ui, rgb } from "@rezi-ui/core";

ui.column({ gap: 1 }, [
  ui.text("Rezi", { variant: "heading", style: { fg: rgb(120, 200, 255), bold: true } }),
  ui.text("Deterministic terminal UI", { variant: "caption", style: { dim: true } }),
]);
```

### 2) Ellipsis truncation

```typescript
import { ui } from "@rezi-ui/core";

ui.box({ width: 20, border: "single", p: 1 }, [
  ui.text("This will truncate with ellipsis", { textOverflow: "ellipsis" }),
]);
```

### 3) Middle truncation

```typescript
import { ui } from "@rezi-ui/core";

ui.box({ width: 24, border: "single", p: 1 }, [
  ui.text("/home/user/documents/project/src/index.ts", { textOverflow: "middle" }),
]);
```

### 4) Wrapped multiline text

```typescript
import { ui } from "@rezi-ui/core";

ui.box({ width: 14, border: "single", p: 1 }, [
  ui.text("hello world from rezi", { wrap: true }),
]);
```

## Notes

- Text is not focusable and does not emit events.
- Measurement and truncation are cell-based and deterministic.
- `maxWidth` caps both measurement (layout) and truncation width.
- `wrap` defaults to `false`. When `true`, wrapping is grapheme-safe, respects `\n` paragraph breaks, and hard-breaks oversized words at grapheme boundaries.
- In wrapped mode, overflow policy still applies to the last visible line if the layout height clips wrapped output.
- `variant` applies a small default style (heading/label: bold, caption: dim, code: inverse) which can be overridden via `style`.

## Related

- [Box](box.md) - Container with borders/padding
- [Layout](../guide/layout.md) - Cell coordinates, overflow, constraints
