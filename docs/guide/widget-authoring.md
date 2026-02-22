# Widget Authoring Guide

How to build consistent, design-system-compliant widgets in Rezi.

## Overview

Every Rezi widget should consume the design system rather than specifying raw colors. This ensures:

- **Consistency** across all widgets and themes
- **Automatic theming** when users switch themes
- **Capability tier adaptation** (16/256/truecolor)
- **Accessibility** via validated contrast ratios

## Design System Integration

### Using Recipes

Recipes are the primary API for computing widget styles. They take design tokens (from the theme) and return `TextStyle` objects.

```typescript
import { recipe, type ColorTokens } from "@rezi-ui/core";

function renderMyWidget(colors: ColorTokens, isFocused: boolean) {
  const style = recipe.button(colors, {
    variant: "solid",
    tone: "primary",
    state: isFocused ? "focus" : "default",
    size: "md",
  });

  // style.label: TextStyle for the button text
  // style.bg: TextStyle for the background fill
  // style.border: BorderVariant to use
  // style.px: horizontal padding
}
```

### Available Recipes

| Recipe | Use Case |
|---|---|
| `recipe.button` | Button-like interactive controls |
| `recipe.input` | Text input fields |
| `recipe.surface` | Panels, cards, containers |
| `recipe.select` | Dropdown selects |
| `recipe.table` | Data table cells and headers |
| `recipe.modal` | Modal dialogs |
| `recipe.badge` | Inline badges |
| `recipe.text` | Typography roles |
| `recipe.divider` | Divider lines |
| `recipe.checkbox` | Checkbox/radio indicators |
| `recipe.progress` | Progress bars |
| `recipe.callout` | Alert/info callout boxes |
| `recipe.scrollbar` | Scrollbar track/thumb |

### Using Design System Props

Interactive widgets support `ds*` props that automatically apply recipe-based styling:

```typescript
// Design system button — automatically styled by theme
ui.button({
  id: "save",
  label: "Save",
  dsVariant: "solid",      // "solid" | "soft" | "outline" | "ghost"
  dsTone: "primary",       // "default" | "primary" | "danger" | "success" | "warning"
  dsSize: "md",            // "sm" | "md" | "lg"
  onPress: handleSave,
});

// Legacy button — manual styling (still works)
ui.button({
  id: "save",
  label: "Save",
  style: { fg: rgb(255, 180, 84) },
  px: 2,
  onPress: handleSave,
});
```

When `ds*` props are present, the renderer uses the recipe system. When absent, the legacy styling path is used. Both work simultaneously.

## Building Custom Widgets

### Stateless Widget

```typescript
import { ui, type VNode } from "@rezi-ui/core";

function StatusCard(title: string, value: string, tone: "success" | "danger"): VNode {
  const badgeTone = tone === "success" ? "success" : "error";
  return ui.box({ border: "rounded", p: 1 }, [
    ui.text(title, { variant: "label" }),
    ui.text(value, { style: { bold: true } }),
    ui.badge(badgeTone),
  ]);
}
```

### Stateful Widget with defineWidget

```typescript
import { defineWidget, ui, type VNode } from "@rezi-ui/core";

const Counter = defineWidget<{ initial: number }>((props, ctx) => {
  const [count, setCount] = ctx.useState(props.initial);

  return ui.column({ gap: 1 }, [
    ui.text(`Count: ${count}`),
    ui.button({
      id: ctx.id("inc"),
      label: "+1",
      dsVariant: "solid",
      dsTone: "primary",
      dsSize: "sm",
      onPress: () => setCount((c) => c + 1),
    }),
    ui.button({
      id: ctx.id("dec"),
      label: "-1",
      dsVariant: "outline",
      dsTone: "danger",
      dsSize: "sm",
      onPress: () => setCount((c) => c - 1),
    }),
  ]);
});
```

## Design Rules

### DO

- Use `dsVariant` / `dsTone` / `dsSize` for interactive widgets
- Use `variant: "heading"` / `"caption"` / `"label"` for text roles
- Use `ui.box({ border: "rounded" })` for cards/panels
- Use semantic colors from theme tokens (not raw RGB)
- Ensure all interactive widgets have a unique `id`
- Test your widget across at least 2 themes

### DON'T

- Don't use raw `rgb()` for widget chrome (borders, backgrounds)
- Don't hardcode focus styles (the design system handles them)
- Don't mix ds-styled and manually-styled buttons in the same row
- Don't create custom color constants — use theme tokens
- Don't skip the `id` prop on interactive widgets

## Capability Tiers

Your widget automatically works across all terminal capability tiers:

| Tier | What Happens |
|---|---|
| A (256-color) | Colors mapped to nearest palette entry |
| B (truecolor) | Full RGB color support |
| C (enhanced) | Images, sub-cell rendering available |

You don't need to handle tier differences in most widgets — the theme and recipe system handles color mapping. Only use tier detection if your widget offers enhanced features (e.g., image rendering):

```typescript
import { getCapabilityTier, type TerminalCaps, ui, type VNode } from "@rezi-ui/core";

function MyImageWidget(caps: TerminalCaps): VNode {
  const tier = getCapabilityTier(caps);
  if (tier === "C") {
    return ui.text("Enhanced mode enabled (image/canvas features available)");
  }
  return ui.text("[Image placeholder]");
}
```

## Testing

Use `createTestRenderer` for deterministic testing:

```typescript
import { createTestRenderer, coerceToLegacyTheme, darkTheme, ui } from "@rezi-ui/core";

const theme = coerceToLegacyTheme(darkTheme);
const renderer = createTestRenderer({ viewport: { cols: 80, rows: 24 }, theme });

const result = renderer.render(MyWidget({ title: "Test" }));
assert.ok(result.findById("my-button"));
assert.ok(result.toText().includes("Test"));
```

For snapshot testing:

```typescript
import { captureSnapshot, serializeSnapshot } from "@rezi-ui/core";

const snapshot = captureSnapshot("my-widget", MyWidget(props), { viewport, theme }, "dark");
const serialized = serializeSnapshot(snapshot);
// Compare with stored snapshot
```
