# Box

Draws a container (optionally bordered) and lays out its children inside a padded content area.

## Usage

```typescript
import { ui } from "@rezi-ui/core";

ui.box({ title: "Settings", border: "rounded", p: 1 }, [
  ui.text("Hello"),
]);
```

## Props

| Prop | Type | Default | Description |
|---|---|---|---|
| `id` | `string` | - | Optional identity (not focusable) |
| `key` | `string` | - | Reconciliation key |
| `title` | `string` | - | Optional title rendered in the top border |
| `titleAlign` | `"left" \| "center" \| "right"` | `"left"` | Title alignment |
| `border` | `"none" \| "single" \| "double" \| "rounded" \| "heavy" \| "dashed" \| "heavy-dashed"` | `"single"` | Border style |
| `shadow` | `boolean \| { offsetX?: number; offsetY?: number; density?: \"light\" \| \"medium\" \| \"dense\" }` | - | Shadow effect for depth |
| `style` | `TextStyle` | - | Style applied to the box surface (bg fills the rect) |
| `opacity` | `number` | `1` | Surface opacity in `[0..1]` (values are clamped) |
| `transition` | `TransitionSpec` | - | Declarative render-time transition for `position`, `size`, and/or `opacity` |
| `p`, `px`, `py`, `pt`, `pr`, `pb`, `pl` | `SpacingValue` | - | Padding props |
| `m`, `mx`, `my` | `SpacingValue` | - | Margin props |
| `width`, `height` | `number \| \"auto\" \| \"${number}%\"` | - | Size constraints |
| `minWidth`, `maxWidth`, `minHeight`, `maxHeight` | `number` | - | Size bounds (cells) |
| `flex` | `number` | - | Main-axis flex in stacks |
| `aspectRatio` | `number` | - | Enforce width/height ratio |

## Examples

### 1) Card-like panel with background

```typescript
import { ui, rgb } from "@rezi-ui/core";

ui.box({ border: "rounded", p: 1, style: { bg: rgb(18, 18, 24) } }, [
  ui.text("Card title", { style: { bold: true } }),
  ui.text("Body text"),
]);
```

### 2) Sidebar + content layout

```typescript
import { ui } from "@rezi-ui/core";

ui.row({ gap: 1 }, [
  ui.box({ width: 24, border: "single", p: 1, title: "Sidebar" }, [
    ui.column({ gap: 1 }, [ui.text("One"), ui.text("Two")]),
  ]),
  ui.box({ flex: 1, border: "single", p: 1, title: "Content" }, [
    ui.text("Main area"),
  ]),
]);
```

### 3) Declarative transition (size + opacity)

```typescript
import { ui } from "@rezi-ui/core";

ui.box(
  {
    id: "details-panel",
    width: state.expanded ? 48 : 28,
    opacity: state.expanded ? 1 : 0.65,
    border: "rounded",
    p: 1,
    transition: {
      duration: 220,
      easing: "easeInOutCubic",
      properties: ["size", "opacity"],
    },
  },
  [ui.text("Animated container")],
);
```

## Notes

- Borders consume 1 cell on each edge (unless `border: "none"`).
- Padding is applied inside the border and reduces child content area.
- `transition.properties` defaults to `"all"` when omitted (`position`, `size`, `opacity`).
- `transition.properties: []` disables animation tracks for that box.

## Related

- [Layout](../guide/layout.md) - Borders, padding, nesting
- [Animation](../guide/animation.md) - Motion hooks and transition props
- [Row / Column](stack.md) - Stack layouts
