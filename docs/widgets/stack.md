# Row / Column

Stacks children horizontally (`row`) or vertically (`column`).

## Usage

```typescript
import { ui } from "@rezi-ui/core";

ui.row({ gap: 2 }, [ui.text("A"), ui.text("B")]);
ui.column({ gap: 1, p: 1 }, [ui.text("A"), ui.text("B")]);
```

## Props

| Prop | Type | Default | Description |
|---|---|---|---|
| `id` | `string` | - | Optional identity (not focusable) |
| `key` | `string` | - | Reconciliation key |
| `gap` | `SpacingValue` | `1` | Spacing between children |
| `reverse` | `boolean` | `false` | Reverse child visual order |
| `wrap` | `boolean` | `false` | Enable multi-line wrapping (`row`) / multi-column wrapping (`column`) |
| `align` | `"start" \| "center" \| "end" \| "stretch"` | `"start"` | Cross-axis alignment |
| `justify` | `"start" \| "end" \| "center" \| "between" \| "around" \| "evenly"` (also CSS aliases: `"space-between"`, `"space-around"`, `"space-evenly"`) | `"start"` | Main-axis distribution |
| `p`, `px`, `py`, `pt`, `pr`, `pb`, `pl` | `SpacingValue` | - | Padding props |
| `m`, `mx`, `my` | `SpacingValue` | - | Margin props |
| `width`, `height` | `number \| \"auto\" \| \"full\" \| \"${number}%\"` | - | Size constraints |
| `minWidth`, `maxWidth`, `minHeight`, `maxHeight` | `number` | - | Size bounds (cells) |
| `flex` | `number` | - | Main-axis flex in parent stack |
| `flexShrink` | `number` | `0` | Overflow shrink factor |
| `flexBasis` | `number \| \"auto\" \| \"full\" \| \"${number}%\"` | - | Initial main-axis basis before grow/shrink (`\"auto\"` = intrinsic max-content) |
| `aspectRatio` | `number` | - | Enforce width/height ratio |
| `alignSelf` | `"auto" \| "start" \| "center" \| "end" \| "stretch"` | `"auto"` | Per-child cross-axis alignment override |
| `position` | `"static" \| "absolute"` | `"static"` | Absolute children are out-of-flow and positioned against parent content rect |
| `top`, `right`, `bottom`, `left` | `number` | - | Absolute offsets (cells) |
| `style` | `TextStyle` | - | Container style override; bg fills rect |
| `inheritStyle` | `TextStyle` | - | Descendant default style without fill |

## Examples

### 1) Spacer for “push to the right”

```typescript
import { ui } from "@rezi-ui/core";

ui.row({ gap: 1 }, [
  ui.text("Left"),
  ui.spacer({ flex: 1 }),
  ui.text("Right"),
]);
```

### 2) Align + justify

```typescript
import { ui } from "@rezi-ui/core";

ui.column({ height: 6, justify: "between" }, [
  ui.text("Top"),
  ui.row({ justify: "end" }, [ui.text("Bottom-right")]),
]);
```

### 3) `alignSelf` per child

```typescript
import { ui } from "@rezi-ui/core";

ui.row({ width: 20, height: 6, align: "start", gap: 1 }, [
  ui.box({ border: "none", width: 4, height: 2, alignSelf: "start" }, []),
  ui.box({ border: "none", width: 4, height: 2, alignSelf: "center" }, []),
  ui.box({ border: "none", width: 4, height: 2, alignSelf: "end" }, []),
]);
```

### 4) `flexShrink` + `flexBasis`

```typescript
import { ui } from "@rezi-ui/core";

ui.row({ width: 40, gap: 0 }, [
  ui.box({ border: "none", flex: 1, flexBasis: 20, flexShrink: 1 }, [ui.text("A")]),
  ui.box({ border: "none", flex: 1, flexBasis: 10, flexShrink: 1 }, [ui.text("B")]),
]);
```

## Notes

- Backward compatibility: when `flexShrink`/`flexBasis` are not used, stacks preserve legacy allocation behavior.
- `flexShrink: 0` means a child will not shrink during overflow.
- In wrap and non-wrap constraint paths, cross-axis feedback is bounded to at most two measurement passes per child to avoid loops while handling wrapped-content reflow.
- Absolute children (`position: "absolute"`) are laid out after in-flow children and do not consume stack main-axis space.

## Helpers

Rezi also includes:

- `ui.hstack(...)` — shorthand row with default `gap: 1`
- `ui.vstack(...)` — shorthand column with default `gap: 1`
- `ui.spacedHStack(...)` — shorthand row with default `gap: 1` (alias)
- `ui.spacedVStack(...)` — shorthand column with default `gap: 1` (alias)

## Related

- [Spacer](spacer.md) - Flexible/fixed spacing
- [Layout](../guide/layout.md) - Alignment, constraints, nesting
