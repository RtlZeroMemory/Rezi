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
- `wrap` — line wrapping for stacks (`false` by default)
- `flexShrink` — shrink factor during overflow (`0` by default)
- `flexBasis` — initial main-axis size before grow/shrink (`"auto"` uses intrinsic max-content)
- `alignSelf` (child prop) — per-child cross-axis override: `"auto" | "start" | "center" | "end" | "stretch"`

### Stack wrap (`wrap`)

- `wrap` defaults to `false` (`row`/`column` stay single-line).
- Set `wrap: true` to enable greedy line breaking in child order.
- `row`: children wrap to the next visual line when adding the next child (`lineMain + gap + childWidth`) would exceed the row content width.
- `column`: children wrap to the next visual column when adding the next child (`lineMain + gap + childHeight`) would exceed the column content height.
- `gap` is used both between siblings in a line and between wrapped lines.
- `justify` and `align` apply per line (not across the full wrapped block).
- In wrap mode, flex distribution is line-local: each line distributes only its own remaining main-axis space.
- In wrap mode, percentage child sizes resolve against the stack content box (container inner width/height), not per-line remainder. Line packing may still clamp a child to remaining line space.
- Wrapped stacks run a bounded cross-axis feedback protocol (max two measure passes per child when needed) so wrapped text/flex allocations can update line cross-size deterministically.

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

## Grid layout

Use `ui.grid(...)` for 2D, dashboard-style TUIs (cards, stats, panels, and compact control surfaces).

Key props:

- `columns` (required): positive number or track string
- `rows` (optional): non-negative number or track string
- `gap`: default gap for both axes
- `rowGap`: row gap override
- `columnGap`: column gap override

Track syntax (`columns` / `rows` strings):

- Fixed numbers (cells): `12`, `24`
- `auto`
- `fr` fractions: `1fr`, `2fr`

Behavior:

- Numeric `columns` (for example `columns: 3`) create equal-width columns.
- Child placement props on `row`/`column`/`box` children:
  - `gridColumn`, `gridRow` are 1-based start coordinates.
  - `colSpan`, `rowSpan` default to `1`.
- Placement runs in two phases: explicit placements first, then auto-placement (row-major) that skips occupied cells.
- If an explicit target cell is occupied, placement advances to the next available slot from that start position.
- Spans include internal track gaps when computing child rect size.
- Overspans are clamped to remaining track capacity from the chosen start cell.
- When `rows` is explicit (`rows: 2` or a row track string), grid capacity is fixed; extra children are not rendered.
- Measurement note: `fr` tracks have natural size `0` and grow from remaining space.

### Example: Dashboard cards

```typescript
import { ui } from "@rezi-ui/core";

ui.grid(
  { columns: 3, gap: 1 },
  ui.box({ border: "rounded", p: 1 }, [ui.text("CPU 42%")]),
  ui.box({ border: "rounded", p: 1 }, [ui.text("Mem 68%")]),
  ui.box({ border: "rounded", p: 1 }, [ui.text("Disk 71%")]),
  ui.box({ border: "rounded", p: 1 }, [ui.text("Net 12MB/s")]),
  ui.box({ border: "rounded", p: 1 }, [ui.text("Queue 9")]),
);
```

### Example: Explicit rows + mixed tracks

```typescript
import { ui } from "@rezi-ui/core";

ui.grid(
  { columns: "14 auto 1fr", rows: 2, columnGap: 2, rowGap: 1 },
  ui.text("Host"),
  ui.text("rezi-prod-01"),
  ui.text("healthy"),
  ui.text("Region"),
  ui.text("us-east-1"),
  ui.text("ok"),
  ui.text("Not rendered (overflow)"),
);
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
- `flexShrink`: overflow shrink factor (`0` default)
- `flexBasis`: initial main-axis size (`number | "<n>%" | "auto"`)
- `aspectRatio`: enforce `w/h`
- `position`: `"static"` (default) or `"absolute"` with `top` / `right` / `bottom` / `left`

Responsive layout values:

- Numeric layout constraints can also use responsive values.
- Use `fluid(min, max, options?)` to interpolate between breakpoints (`sm`, `md`, `lg`, `xl`) with floor semantics and clamped bounds.

```typescript
import { fluid, ui } from "@rezi-ui/core";

ui.box({ width: fluid(20, 40), height: 3, border: "single" }, [ui.text("Fluid width")]);
```

Example: fixed + flex children in a row

```typescript
import { ui } from "@rezi-ui/core";

ui.row({ gap: 1 }, [
  ui.box({ width: 20, border: "single" }, [ui.text("Fixed 20")]),
  ui.box({ flex: 1, border: "single" }, [ui.text("Flex fill")]),
]);
```

## Absolute positioning

Children with `position: "absolute"` are removed from normal stack/box flow and laid out in a second pass relative to the parent content rect.

- In-flow siblings ignore absolute children for size and cursor advancement.
- `top/left/right/bottom` offsets use integer cell coordinates.
- Opposing edges stretch when explicit size is not provided:
- `left + right` without explicit width stretches width.
- `top + bottom` without explicit height stretches height.
- Explicit `width`/`height` take precedence over edge-based stretch.

## Overlay sizing constraints

Overlay widgets expose constraint-driven sizing props and clamp to the current viewport:

- `modal`: `width`, `height`, `minWidth`, `minHeight`, `maxWidth`
- `commandPalette`: `width` (`height` derives from `maxVisible`)
- `toolApprovalDialog`: `width`, `height`
- `toastContainer`: `width` (`height` derives from `maxVisible`)

## Layout Invariants

These behaviors are guaranteed by the current layout engine and validation pipeline.

### Coordinate system and int32 bounds

- Rects are in terminal cell units: `x`, `y`, `w`, `h` with origin at top-left.
- `layout(node, x, y, maxW, maxH, axis)` requires `x/y` to be int32 and `maxW/maxH` to be int32 `>= 0`.
- `measure(node, maxW, maxH, axis)` requires `maxW/maxH` to be int32 `>= 0`.
- Integer-valued size/spacing inputs are int32-bounded (signed for margins, non-negative where required). Out-of-range values fail with deterministic `ZRUI_INVALID_PROPS` rather than being wrapped.
- Computed leaf rects are validated as int32 cells.

### Non-negative dimension clamping

- Width/height never go negative; dimension math uses non-negative clamps after subtraction steps (margin, border, padding, remaining space).
- Final node sizes are bounded by available `maxW/maxH` and clamped to `>= 0`.

### Two-phase measure -> layout behavior

- `measure(...)` computes size only; it does not assign positions.
- `layout(...)` measures first, then places nodes using the measured/forced size.
- In `row`/`column`, if any child has main-axis `%` sizing or `flex > 0`, layout runs a constraint pass first (resolve main sizes, then place children with resolved sizes).
- If that trigger is absent, stacks use the greedy path (measure in child order and place directly).
- Even when remaining space reaches zero, the subtree is still measured with zero constraints for deterministic validation.
- For children whose cross-size depends on final main allocation (for example wrapped text), stack measure/layout performs at most one feedback remeasure pass (max two total passes) in both wrap and non-wrap paths.

### Flex distribution rules

- Only children with `flex > 0` participate in flex allocation.
- Fixed-size and non-flex children consume space before flex allocation.
- Remaining space is distributed proportionally to flex weights, using integer cells: floor base shares first, then remainder cells by largest fractional share (ties by lower child index).
- Per-child max constraints are enforced during distribution; leftover space is redistributed iteratively to still-active flex items.
- `flexShrink` participates only when content overflows; `flexShrink: 0` keeps current size.
- When `flexShrink > 0` and no explicit `minWidth`/`minHeight` is set, shrink floors default to intrinsic min-content size.
- `flexBasis: "auto"` uses intrinsic max-content size as the initial basis.
- Legacy planning behavior is preserved when advanced props (`flexShrink`/`flexBasis`) are not used.

### Percentage resolution, flooring, and clamping

- Percentage constraints resolve with flooring: `floor(parentSize * percent / 100)`.
- Percentages resolve against the parent size provided to constraint resolution for that axis (stack content bounds in stacks; box content bounds for boxed children).
- Resolved percent values are then clamped by min/max constraints and by the currently available space.
- Main-axis percentages in stacks trigger the constraint-pass path before final placement.
- Shared deterministic integer distribution is used for weighted remainder handling across layout splits (including stack percentage rebalancing and grid/split-pane weighted allocation): extra cells are assigned by fractional remainder, ties by lower index.

### Margin behavior and interactions

- Margin precedence is side -> axis -> all: `ml/mr/mt/mb` overrides `mx/my`, which overrides `m`.
- Margins are outside the widget rect and affect both measured outer size and positioned offset.
- Positive margins reserve outer space.
- Negative margins are allowed (signed int32): they can move `x/y` negative and can expand computed rect size after subtraction.
- Padding and borders are applied inside the margin-adjusted rect.

### Aspect ratio resolution order

- `width`/`height` are resolved first (number or percent; `"auto"` behaves as unspecified here).
- If `aspectRatio > 0` and exactly one axis is resolved, the other is derived with flooring:
  - `height = floor(width / aspectRatio)`
  - `width = floor(height * aspectRatio)`
- If both `width` and `height` are already resolved, `aspectRatio` does not override them.
- After derivation, min/max constraints clamp the chosen size, then final size is capped by available bounds and non-negative clamping.

## Layout Stability & Caching

### Stability signatures (commit-time relayout checks)

- On commit turns with `checkLayoutStability: true`, the renderer compares per-instance layout signatures against the previous committed tree.
- Signature coverage includes: `text`, `button`, `input`, `spacer`, `divider`, `row`, `column`, `box`, `grid`, `table`, `tabs`, `accordion`, `modal`, `virtualList`, `splitPane`, `breadcrumb`, `pagination`, `focusZone`, and `focusTrap`.
- `row`/`column` signatures include layout constraints, spacing, `pad`, `gap`, `align`, `justify`, `items`, and child order (child instance ID sequence).
- `box` signatures include layout constraints, spacing, border/title props, and child order.
- `text`/`button`/`input` signatures track intrinsic width inputs (`text` + `maxWidth`, button `label` + `px`, input `value`).

Intentionally excluded:

- Render-only/style props are excluded from signature checks.
- Routing/identity-only props that do not affect geometry (for example `button` `id`) are excluded.
- Text is tracked by width impact, not full content identity; equal-width edits do not force relayout.

Conservative fallback:

- Unsupported widget kinds or unhashable tracked prop values force relayout for that turn.
- On fallback, cached signature maps are cleared before continuing.

### Measure cache design

- `layout(...)` accepts an optional shared measure cache: `WeakMap<VNode, unknown>`.
- Cache identity key is the VNode object; lookups are then bucketed by `(axis, maxW, maxH)`.
- Internally this is: `VNode -> (row|column) -> maxW -> maxH -> LayoutResult<Size>`.
- Same VNode identity + same axis + same constraints hits; changing any of those misses.
- Structurally equal but distinct VNode objects do not share entries.
- On commit+layout turns, the renderer resets its shared WeakMap to avoid stale cross-identity reuse.

### Performance characteristics

- Full layout computation is O(N) in visited nodes.
- Signature comparison is O(N) when enabled.
- When signatures are stable, the expensive `layout(...)` pass is skipped; the skip decision and reuse of the prior layout tree are O(1).
- After a commit with skipped layout, damage-rect indexes are refreshed by walking runtime nodes.

### Runtime dirty flags and clean-subtree skipping

- Runtime nodes carry a per-node `dirty` flag used by incremental rendering.
- Commit marks nodes dirty when props change, when child composition/order changes, and when any child is dirty (propagates to root).
- Layout indexing marks nodes dirty when their layout rect changes versus the previous rendered frame.
- Incremental `renderTree(...)` skips clean subtrees during DFS, but preserves clip stack correctness for dirty ancestors (balanced `pushClip`/`popClip`).
- After a successful frame build, dirty flags are cleared for the committed runtime tree.

### Clarified invariants and edge cases

- The first signature pass against an empty previous map reports changed (bootstrap relayout).
- Child add/remove/reorder in `row`/`column`/`box` is always detected as layout-relevant.
- Style-only changes on `text`/`row`/`box` do not trigger relayout.
- `button` `id`-only changes do not trigger relayout; label/padding changes do.
- If any committed node is outside signature coverage, relayout is forced conservatively.

## ZRDL Binary Format Invariants

These invariants describe current builder + engine behavior for ZRDL bytes.

### 4-byte alignment rules

- Header size is fixed at 64 bytes; when `cmdCount > 0`, `cmdOffset` is 64.
- `totalSize`, `cmdBytes`, `stringsBytesLen`, and `blobsBytesLen` are 4-byte aligned.
- Section offsets (`cmdOffset`, `stringsSpanOffset`, `stringsBytesOffset`, `blobsSpanOffset`, `blobsBytesOffset`) are 4-byte aligned.
- Command records start on 4-byte boundaries. Command `size` must be 4-byte aligned; any command padding bytes are zeroed.
- `addBlob(...)` requires `bytes.byteLength % 4 === 0`. String entries are not individually aligned; the strings section as a whole is padded to 4-byte alignment.

### String interning guarantees

- Interning is by exact string value within one builder epoch (from construction/reset to the next `reset()`).
- Repeated equal strings across `drawText(...)` and `addTextRunBlob(...)` reuse one `string_index` and one string-table entry.
- New string indices are assigned in first-seen order.
- `reset()` clears interning state (and command/blob/string sections), so indices are rebuilt on the next frame.

### Limit and overflow behavior

- Builder caps (`maxDrawlistBytes`, `maxCmdCount`, `maxStrings`, `maxStringBytes`, `maxBlobs`, `maxBlobBytes`) fail with `ZRDL_TOO_LARGE` when exceeded.
- Builder failures are sticky: first error is retained and later commands no-op until `reset()`.
- Engine validation enforces runtime limits (`dl_max_total_bytes`, `dl_max_cmds`, `dl_max_strings`, `dl_max_blobs`, `dl_max_clip_depth`, `dl_max_text_run_segments`) and returns `ZR_ERR_LIMIT` when exceeded.
- Offset/length arithmetic that overflows during validation is treated as invalid format (`ZR_ERR_FORMAT`), not wraparound.

### Encoded string cache semantics (including reset)

- Encoded string caching is optional: `encodedStringCacheCap = 0` disables it.
- On a cache miss with caching enabled, if cache size is already `>= cap`, the cache is cleared, then the new entry is inserted.
- `reset()` does not clear the encoded-string cache. It clears per-drawlist state only, so cached encodings can persist across frames while the same builder instance is reused.
- v1 caches only strings with `text.length <= 96`; v2 has no length filter for cache eligibility.

### v1 vs v2 differences (cursor command)

- v1 and v2 share the same header shape and opcodes `1..6`.
- v2 sets header `version = 2` and adds `OP_SET_CURSOR` (opcode `7`), encoded as a 20-byte command (`8` byte header + `12` byte payload).
- `SET_CURSOR` payload fields are `x:int32`, `y:int32`, `shape:u8`, `visible:u8`, `blink:u8`, `reserved0:u8`. `x` and `y` allow `-1` (leave unchanged).
- v1 command validation/execution does not allow `OP_SET_CURSOR`; it is rejected as unsupported.

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

## Overflow and scroll

For `row`, `column`, and `box`, `overflow` supports:

- `"visible"` (default)
- `"hidden"`
- `"scroll"`

Layout overflow metadata uses these fields (all non-negative cells):

- `scrollX`, `scrollY` - active scroll offset (clamped to available range)
- `contentWidth`, `contentHeight` - measured content footprint
- `viewportWidth`, `viewportHeight` - scrollable viewport size

Clipping semantics (current behavior):

- Rendering clips children to the container content rect (after border/padding).
- `"scroll"` additionally clips to a reduced scroll viewport and applies `scrollX`/`scrollY` offsets.
- Hit-testing keeps legacy `"visible"` overlap behavior (container layout-rect clip), while `"hidden"` and `"scroll"` use stricter content/viewport clipping.

Scrollbar occupancy in `"scroll"` mode:

- Vertical scrollbar consumes 1 column on the right.
- Horizontal scrollbar consumes 1 row at the bottom.
- When both are shown, they share the bottom-right corner cell.

Collection migration behavior (current):

- `VirtualList`, `Table`, and `Tree` still maintain runtime scroll state.
- Their effective runtime scroll values are mirrored into layout metadata (`scrollX`, `scrollY`, `contentWidth`, `contentHeight`, `viewportWidth`, `viewportHeight`) during rendering.

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
