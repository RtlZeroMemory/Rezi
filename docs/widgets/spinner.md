# Spinner

Animated loading indicator, driven by tick events from the runtime.

## Usage

```typescript
import { ui } from "@rezi-ui/core";

ui.spinner();
ui.spinner({ variant: "dots", label: "Loading..." });
```

## Props

| Prop | Type | Default | Description |
|---|---|---|---|
| `variant` | `"dots" \| "line" \| "circle" \| "bounce" \| "pulse" \| "arrows" \| "dots2"` | `"dots"` | Animation variant |
| `label` | `string` | - | Optional text after the spinner |
| `style` | `TextStyle` | - | Optional style override |
| `key` | `string` | - | Reconciliation key |

## Animation cadence

Spinner animation is tick-driven and intentionally bounded for stability.

- Repaint cadence is capped by `min(fpsCap, 8)` in widget mode.
- Effective minimum spinner interval is `floor(1000 / min(fpsCap, 8))` ms.
- Tick events only dirty render when an animated widget is present and the interval elapsed.

This prevents startup flicker and repaint storms while keeping input responsive under load.

## Examples

### 1) Loading header

```typescript
import { ui } from "@rezi-ui/core";

ui.row({ gap: 1 }, [ui.spinner({ label: "Fetching…" }), ui.text("Please wait")]);
```

### 2) Variant selection

```typescript
import { ui } from "@rezi-ui/core";

ui.column({ gap: 1 }, [
  ui.spinner({ variant: "line", label: "line" }),
  ui.spinner({ variant: "circle", label: "circle" }),
]);
```

## Related

- [Skeleton](skeleton.md) - Non-animated loading placeholders
- [Loading States recipe](../recipes/loading-states.md) - Patterns for async data
