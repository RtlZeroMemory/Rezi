# Layout

Rezi uses a **cell-based** layout system: all sizes and coordinates are measured in terminal character cells (not pixels). This makes layout deterministic across platforms and terminal emulators.

This page covers the core layout primitives and the props that control sizing and positioning.

## Cell coordinates

Every widget is laid out into a rectangle:

- `x`, `y` — top-left corner in cells (0,0 is the top-left of the terminal)
- `w`, `h` — width/height in cells

```
(0,0) ───────────────────────────► x
  │
  │  ┌────────────── w ──────────────┐
  │  │                                │
  ▼  │               h                │
 y  │                                │
    └────────────────────────────────┘
```

## Stack layouts

The primary layout containers are **stacks**:

- `ui.row(props, children)` — horizontal stacking
- `ui.column(props, children)` — vertical stacking

Key props:

- `gap` — spacing between children (cells or spacing key)
- `align` — cross-axis alignment: `"start" | "center" | "end" | "stretch"`
- `justify` — main-axis distribution: `"start" | "end" | "center" | "between" | "around" | "evenly"`

### Example: Row + Column

```typescript
import { ui } from "@rezi-ui/core";
import { createNodeApp } from "@rezi-ui/node";

const app = createNodeApp({
    initialState: {},
});

app.view(() =>
  ui.column({ p: 1, gap: 1 }, [
    ui.text("Header"),
    ui.row({ gap: 2, justify: "between" }, [
      ui.text("Left"),
      ui.text("Right"),
    ]),
  ])
);

await app.start();
```

## Padding and margins

Container widgets accept spacing props (values are **cells**, or named keys like `"sm"`, `"md"`, `"lg"`):

### Padding (inside)

- `p` (all), `px`/`py`, `pt`/`pr`/`pb`/`pl`
- Must be non-negative (`>= 0`) when provided as numbers.

### Margin (outside)

- `m` (all), `mx`/`my`, `mt`/`mr`/`mb`/`ml`
- May be negative (signed int32), which allows intentional overlap.

Example:

```typescript
import { ui } from "@rezi-ui/core";

ui.box({ p: "md", mx: "lg", border: "rounded", title: "Panel" }, [
  ui.text("Content"),
]);
```

Notes:

- Padding reduces the available content area for children.
- Margin affects how the widget is positioned inside its parent stack.
- Negative margins can move a child outside the parent's origin and can cause overlap.

### Negative margin examples

Example 1: overlap siblings in a row

```typescript
import { ui } from "@rezi-ui/core";

ui.row({}, [
  ui.box({ border: "none", width: 12, p: 1 }, [ui.text("Base")]),
  ui.box({ border: "rounded", width: 10, ml: -6, p: 1 }, [ui.text("Overlay")]),
]);
```

Example 2: pull content upward in a column

```typescript
import { ui } from "@rezi-ui/core";

ui.column({ gap: 1 }, [
  ui.box({ border: "single", p: 1 }, [ui.text("Header block")]),
  ui.box({ border: "rounded", mt: -1, p: 1 }, [ui.text("Raised panel")]),
]);
```

Rules summary:

- `m/mx/my/mt/mr/mb/ml` accept signed int32 numbers (and spacing keys).
- `p/px/py/pt/pr/pb/pl`, legacy `pad`, and `gap` must stay non-negative.
- Computed `w/h` are always clamped to non-negative values.
- Computed `x/y` can be negative when margins pull widgets outward.

## Alignment

Alignment depends on the stack direction:

- In a `row`, `align` controls **vertical** alignment; `justify` controls **horizontal** distribution.
- In a `column`, `align` controls **horizontal** alignment; `justify` controls **vertical** distribution.

Example:

```typescript
import { ui } from "@rezi-ui/core";

ui.row({ height: 3, align: "center", justify: "between" }, [
  ui.text("A"),
  ui.text("B"),
]);
```

## Size constraints

Most container widgets accept layout constraints:

- `width` / `height`: number of cells, percentage string (`"50%"`), or `"auto"`
- `minWidth` / `maxWidth`, `minHeight` / `maxHeight`
- `flex`: main-axis space distribution inside `row`/`column`
- `aspectRatio`: enforce `w/h`

Example: fixed + flex children in a row

```typescript
import { ui } from "@rezi-ui/core";

ui.row({ gap: 1 }, [
  ui.box({ width: 20, border: "single" }, [ui.text("Fixed 20")]),
  ui.box({ flex: 1, border: "single" }, [ui.text("Flex fill")]),
]);
```

## Borders

`ui.box` can draw a border around its content:

- `border`: `"none" | "single" | "double" | "rounded" | "heavy" | "dashed" | "heavy-dashed"`
- `title`: optional title rendered in the top border
- `titleAlign`: `"left" | "center" | "right"`

Border thickness is **1 cell** on each edge (unless `border: "none"`). Padding is applied inside the border.

Example:

```typescript
import { ui } from "@rezi-ui/core";

ui.box({ title: "Settings", titleAlign: "center", border: "double", p: 1 }, [
  ui.text("Option A"),
  ui.text("Option B"),
]);
```

## Nested layouts

Nesting is just composition: put stacks/boxes inside stacks/boxes.

Example: sidebar + content column

```typescript
import { ui } from "@rezi-ui/core";

ui.row({ gap: 1 }, [
  ui.box({ width: 24, border: "rounded", p: 1, title: "Sidebar" }, [
    ui.column({ gap: 1 }, [ui.text("One"), ui.text("Two")]),
  ]),
  ui.box({ flex: 1, border: "rounded", p: 1, title: "Content" }, [
    ui.text("Main area"),
  ]),
]);
```

## Overflow

Rezi clips rendering to each widget’s allocated rect. Overflow is handled per-widget:

- `ui.text` supports `textOverflow: "clip" | "ellipsis" | "middle"` (and `maxWidth`)
- Containers clip their children to the padded/bordered content area

Example: ellipsis truncation

```typescript
import { ui } from "@rezi-ui/core";

ui.box({ width: 20, border: "single", p: 1 }, [
  ui.text("This is a long line that will truncate", { textOverflow: "ellipsis" }),
]);
```

## Overlap hit-testing

When widgets overlap, input routing is deterministic:

- Layers: higher `zIndex` wins.
- Layers with equal `zIndex`: later registration wins.
- Regular layout tree (no layer distinction): the last focusable widget in depth-first preorder tree order wins.
  - This means later siblings win ties.

## Gotchas

- Negative margins can make `x/y` negative; this is expected and supported.
- Large negative margins can significantly increase overlap. Keep fixtures for critical layouts.
- `pad` and `gap` do not allow negatives; use margins when you need pull/overlap effects.
- In overlap regions, tie-breaks follow deterministic order, not visual styling alone.

## Related

- [Concepts](concepts.md) - How VNodes and reconciliation work
- [Lifecycle & Updates](lifecycle-and-updates.md) - When layout runs and why updates are committed
- [Styling](styling.md) - Background fills, borders, and style inheritance

Next: [Input & focus](input-and-focus.md).
