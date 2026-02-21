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
| `align` | `"start" \| "center" \| "end" \| "stretch"` | `"start"` | Cross-axis alignment |
| `justify` | `"start" \| "end" \| "center" \| "between" \| "around" \| "evenly"` (also CSS aliases: `"space-between"`, `"space-around"`, `"space-evenly"`) | `"start"` | Main-axis distribution |
| `p`, `px`, `py`, `pt`, `pr`, `pb`, `pl` | `SpacingValue` | - | Padding props |
| `m`, `mx`, `my` | `SpacingValue` | - | Margin props |
| `width`, `height` | `number \| \"auto\" \| \"full\" \| \"${number}%\"` | - | Size constraints |
| `minWidth`, `maxWidth`, `minHeight`, `maxHeight` | `number` | - | Size bounds (cells) |
| `flex` | `number` | - | Main-axis flex in parent stack |
| `aspectRatio` | `number` | - | Enforce width/height ratio |
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

## Helpers

Rezi also includes:

- `ui.hstack(...)` — shorthand row with default `gap: 1`
- `ui.vstack(...)` — shorthand column with default `gap: 1`
- `ui.spacedHStack(...)` — shorthand row with default `gap: 1` (alias)
- `ui.spacedVStack(...)` — shorthand column with default `gap: 1` (alias)

## Related

- [Spacer](spacer.md) - Flexible/fixed spacing
- [Layout](../guide/layout.md) - Alignment, constraints, nesting
