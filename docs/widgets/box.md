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
| `preset` | `"card" \| "surface" \| "well" \| "elevated"` | - | Style preset applied before explicit props (e.g. `card` → rounded + `p: 1`) |
| `border` | `"none" \| "single" \| "double" \| "rounded" \| "heavy" \| "dashed" \| "heavy-dashed"` | `"single"` | Border style |
| `shadow` | `boolean \| { offsetX?: number; offsetY?: number; density?: \"light\" \| \"medium\" \| \"dense\" }` | - | Shadow effect for depth |
| `style` | `TextStyle` | - | Style applied to the box surface and inherited by children (bg fills the rect) |
| `borderStyle` | `TextStyle` | - | Style applied only to the border and title; decouples border appearance from child style inheritance (see [Style Propagation](#style-propagation)) |
| `opacity` | `number` | `1` | Surface opacity in `[0..1]` (values are clamped) |
| `transition` | `TransitionSpec` | - | Declarative render-time transition for `position`, `size`, and/or `opacity` |
| `p`, `px`, `py`, `pt`, `pr`, `pb`, `pl` | `SpacingValue` | - | Padding props |
| `gap` | `SpacingValue` | `0` | Vertical gap between children in the synthetic inner column layout |
| `m`, `mx`, `my` | `SpacingValue` | - | Margin props |
| `width`, `height` | `number \| \"auto\" \| \"${number}%\"` | - | Size constraints |
| `minWidth`, `maxWidth`, `minHeight`, `maxHeight` | `number` | - | Size bounds (cells) |
| `flex` | `number` | - | Main-axis flex in stacks |
| `flexShrink` | `number` | `0` | Overflow shrink factor when box is a stack child |
| `flexBasis` | `number \| \"auto\" \| \"full\" \| \"${number}%\"` | - | Initial main-axis basis before grow/shrink |
| `aspectRatio` | `number` | - | Enforce width/height ratio |
| `alignSelf` | `"auto" \| "start" \| "center" \| "end" \| "stretch"` | `"auto"` | Per-child cross-axis alignment override in parent stack |
| `position` | `"static" \| "absolute"` | `"static"` | Absolute positioning mode as a stack child |
| `top`, `right`, `bottom`, `left` | `number` | - | Absolute offsets when `position: "absolute"` |
| `gridColumn`, `gridRow` | `number` | - | 1-based explicit grid placement coordinates when parent is `ui.grid(...)` |
| `colSpan`, `rowSpan` | `number` | `1` | Grid span across columns/rows when parent is `ui.grid(...)` |

## Examples

### 0) Preset card (recommended)

```typescript
import { ui } from "@rezi-ui/core";

ui.box({ preset: "card" }, [
  ui.text("Card title", { variant: "heading" }),
  ui.text("Body text"),
]);
```

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

### 3) Decoupled border style

Use `borderStyle` to style the border and title independently from children. Without it, `style` attributes (e.g. `fg`, `bold`) propagate to all descendants via `parentStyle`, which can break child widget rendering (syntax highlighting, custom fg colors, etc.).

```typescript
import { ui, rgb } from "@rezi-ui/core";

// Border is bold orange, but children inherit default fg (not orange)
ui.box(
  {
    title: " Editor ",
    border: "heavy",
    borderStyle: { fg: rgb(255, 160, 50), bold: true },
    p: 0,
  },
  [ui.codeEditor({ id: "editor", /* ... */ })],
);
```

**Without `borderStyle`** (using only `style`), the `fg` and `bold` would propagate to the code editor and override syntax highlighting. `borderStyle` prevents this by keeping border/title appearance separate from child style inheritance.

### 4) Declarative transition (size + opacity)

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

### 5) Box child gap

```typescript
import { ui } from "@rezi-ui/core";

ui.box({ border: "single", p: 1, gap: 1, title: "Events" }, [
  ui.text("Connected"),
  ui.text("Sync complete"),
  ui.text("Watcher started"),
]);
```

## Style Propagation

`ui.box()` merges its resolved `style` into `parentStyle`, which is passed to all child widgets. This means any `fg`, `bg`, `bold`, `dim`, etc. set on `style` will be inherited by every descendant unless overridden.

**When `borderStyle` is set:**

- The border and title use `borderStyle` merged with the base parent style
- Children use `style` merged with the base parent style (without `borderStyle` mixed in)
- This cleanly separates border chrome from content styling

**When `borderStyle` is NOT set (default, backward compatible):**

- Both the border and children use the same merged `style`
- This is the traditional behavior and works well when the box style is purely `bg`-based

**Rule of thumb:** If your box `style` includes `fg`, `bold`, `dim`, or other text attributes intended only for the border/title, use `borderStyle` instead. If your box `style` is only `bg`, `style` alone is fine.

## Notes

- Borders consume 1 cell on each edge (unless `border: "none"`).
- Padding is applied inside the border and reduces child content area.
- `gap` is applied inside the content rect (after border + padding). Default `gap: 0` preserves contiguous child flow.
- Absolute-positioned children inside a box are removed from normal inner-column flow, then laid out in a second pass relative to the box content rect.
- `transition.properties` defaults to `"all"` when omitted (`position`, `size`, `opacity`).
- `transition.properties: []` disables animation tracks for that box.

## Mouse Wheel Scrolling

Boxes with `overflow: "scroll"` now respond to mouse wheel events.
The wheel scrolls the nearest scrollable ancestor under the cursor.

```typescript
ui.box({
  overflow: "scroll",
  scrollX: state.scrollX,
  scrollY: state.scrollY,
  height: 10,
}, [
  // content taller than 10 rows
]);
```

## Related

- [Layout](../guide/layout.md) - Borders, padding, nesting
- [Animation](../guide/animation.md) - Motion hooks and transition props
- [Row / Column](stack.md) - Stack layouts
- [Style Props](../styling/style-props.md) - TextStyle reference and inheritance rules
