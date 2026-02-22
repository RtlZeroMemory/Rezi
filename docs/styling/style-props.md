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

### Style propagation pitfall

Because `style` on a container propagates to all descendants as `parentStyle`, setting text attributes like `fg`, `bold`, or `dim` on a `ui.box()` will affect every child widget -- including widgets with their own internal styling (code editors with syntax highlighting, file trees with status colors, etc.).

**Problem:**

```typescript
// BAD: fg and bold leak into the code editor, overriding syntax colors
ui.box(
  {
    title: " Editor ",
    border: "heavy",
    style: { fg: rgb(255, 160, 50), bold: true },
  },
  [ui.codeEditor({ id: "editor", language: "typescript", value: code })],
);
```

**Solution -- use `borderStyle`:**

```typescript
// GOOD: border is orange+bold, children inherit default styles
ui.box(
  {
    title: " Editor ",
    border: "heavy",
    borderStyle: { fg: rgb(255, 160, 50), bold: true },
  },
  [ui.codeEditor({ id: "editor", language: "typescript", value: code })],
);
```

`borderStyle` applies only to the box's border and title. Children receive the base `style` (typically just `bg`) without `borderStyle` mixed in. See [Box](../widgets/box.md#style-propagation) for details.

**Rule of thumb:**

| Intent | Use |
|--------|-----|
| Set background for the entire box and children | `style: { bg: ... }` |
| Style only the border/title (fg, bold, dim) | `borderStyle: { fg: ..., bold: true }` |
| Style both border and content the same way | `style: { ... }` (no `borderStyle`) |

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

## Container opacity and transitions

`ui.box(...)` also supports surface opacity and declarative transitions:

```typescript
import { ui } from "@rezi-ui/core";

ui.box(
  {
    width: state.open ? 40 : 24,
    opacity: state.open ? 1 : 0.6,
    transition: { duration: 180, easing: "easeOutCubic", properties: ["size", "opacity"] },
  },
  [ui.text("Panel")],
);
```

Notes:

- `opacity` is clamped to `[0..1]`.
- `transition.properties` defaults to `"all"` (`position`, `size`, `opacity`) when omitted.
- Use `properties: []` to disable animated tracks explicitly.

## Related

- [Theme](theme.md) - Theme structure and presets
- [Styling overview](index.md) - How themes and style props work together
- [Animation guide](../guide/animation.md) - Hook and transition patterns
- [Box](../widgets/box.md) - Box widget with `borderStyle` prop
- [Focus Styles](focus-styles.md) - Focus indicator control with `focusConfig`
