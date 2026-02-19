# Style Props

This page is the reference for the styling-related props used across Rezi widgets.

## `Rgb` and `rgb()`

Colors are expressed as RGB triples with components in `0..255`:

```typescript
import { rgb } from "@rezi-ui/core";

const red = rgb(255, 0, 0);
const slate = rgb(20, 24, 32);
```

Type:

```typescript
type Rgb = Readonly<{ r: number; g: number; b: number }>;
```

## `TextStyle`

Most widgets that render text accept a `style` prop of type `TextStyle`:

```typescript
type TextStyle = Readonly<{
  fg?: Rgb;
  bg?: Rgb;
  bold?: boolean;
  dim?: boolean;
  italic?: boolean;
  underline?: boolean;
  inverse?: boolean;
  strikethrough?: boolean;
  overline?: boolean;
  blink?: boolean;
}>;
```

Example:

```typescript
import { ui, rgb } from "@rezi-ui/core";

ui.text("Title", { style: { fg: rgb(120, 200, 255), bold: true } });
```

### Background fills

Backgrounds behave differently depending on the widget:

- `ui.text(..., { style: { bg: ... } })` applies background only behind the text glyphs.
- Container widgets (`row`, `column`, `box`) will **fill their whole rect** if `style.bg` is provided.

```typescript
import { ui, rgb } from "@rezi-ui/core";

ui.box({ p: 1, border: "rounded", style: { bg: rgb(18, 18, 24) } }, [
  ui.text("Filled background"),
]);
```

## Style inheritance

Containers pass their resolved style to children. Child widgets merge their own `style` on top.

```typescript
import { ui, rgb } from "@rezi-ui/core";

ui.column({ p: 1, gap: 1, style: { fg: rgb(200, 200, 255) } }, [
  ui.text("Inherits fg"),
  ui.text("Overrides", { style: { fg: rgb(255, 180, 90), bold: true } }),
]);
```

## Spacing props (padding / margin)

Containers and some layout widgets accept spacing props:

| Prop | Meaning |
|---|---|
| `p` | Padding (all sides) |
| `px`, `py` | Padding horizontal / vertical |
| `pt`, `pr`, `pb`, `pl` | Padding per side |
| `m` | Margin (all sides) |
| `mx`, `my` | Margin horizontal / vertical |
| `mt`, `mr`, `mb`, `ml` | Margin per side |

Values are `SpacingValue`:

- a number (cell units), or
- a named key: `"none" | "xs" | "sm" | "md" | "lg" | "xl" | "2xl"`

Example:

```typescript
import { ui } from "@rezi-ui/core";

ui.box({ p: "md", border: "rounded" }, [
  ui.column({ gap: "sm" }, [ui.text("A"), ui.text("B")]),
]);
```

## Related

- [Theme](theme.md) - Theme structure and presets
- [Styling overview](index.md) - How themes and style props work together
