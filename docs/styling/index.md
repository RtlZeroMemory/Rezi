# Styling

Rezi provides a comprehensive styling system for terminal UIs, including direct style props, semantic themes, icons, and focus indicators.

## Overview

Rezi styling works at two levels:

**Direct Styles**
: Apply colors and text attributes directly to widgets using RGB values and style objects.

**Semantic Themes**
: Use predefined theme tokens for consistent colors across your application.

## Quick Example

```typescript
import { ui, rgb, darkTheme } from "@rezi-ui/core";
import { createNodeApp } from "@rezi-ui/node";

const app = createNodeApp({
    initialState: {},
});

app.view(() =>
  ui.column({ p: 1, gap: 1 }, [
    // Direct RGB styling
    ui.text("Error!", { style: { fg: rgb(255, 100, 100), bold: true } }),

    // Theme-aware styling
    ui.box({ title: "Panel", border: "rounded", p: 1 }, [
      ui.text("Content here"),
    ]),
  ])
);

// Apply a built-in theme
app.setTheme(darkTheme);

await app.start();
```

## Style Properties

Every widget that displays text supports a `style` prop:

```typescript
type TextStyle = {
  fg?: Rgb;              // Foreground (text) color
  bg?: Rgb;              // Background color
  bold?: boolean;        // Bold text
  dim?: boolean;         // Dim/faint text
  italic?: boolean;      // Italic text
  underline?: boolean;   // Underlined text
  inverse?: boolean;     // Swap fg/bg colors
};
```

### RGB Colors

Create colors with the `rgb()` helper:

```typescript
import { rgb } from "@rezi-ui/core";

const red = rgb(255, 0, 0);
const green = rgb(0, 255, 0);
const customBlue = rgb(100, 150, 255);

ui.text("Colored text", { style: { fg: red, bg: customBlue } });
```

### Text Attributes

```typescript
ui.text("Bold text", { style: { bold: true } });
ui.text("Italic text", { style: { italic: true } });
ui.text("Underlined", { style: { underline: true } });
ui.text("Dim text", { style: { dim: true } });
ui.text("Inverted", { style: { inverse: true } });
```

## Built-in Themes

Rezi includes six built-in themes:

| Theme | Description |
|-------|-------------|
| `darkTheme` | Ayu-inspired dark theme with orange accents |
| `lightTheme` | Clean light theme with blue accents |
| `dimmedTheme` | Reduced contrast dark theme |
| `highContrastTheme` | WCAG AAA compliant theme |
| `nordTheme` | Nord color palette |
| `draculaTheme` | Dracula color palette |

### Applying Themes

```typescript
import { darkTheme, lightTheme, nordTheme } from "@rezi-ui/core";

// Set theme at startup
const app = createNodeApp({
    initialState: {},
  theme: darkTheme,
});

// Or switch themes at runtime
app.setTheme(nordTheme);
```

## Semantic Color Tokens

Themes use semantic color tokens for consistent styling:

### Surface Colors (`bg.*`)
- `bg.base` - Main background
- `bg.elevated` - Raised surfaces (cards, modals)
- `bg.overlay` - Overlay surfaces (dropdowns, tooltips)
- `bg.subtle` - Subtle backgrounds (hover states)

### Foreground Colors (`fg.*`)
- `fg.primary` - Primary text
- `fg.secondary` - Secondary/less important text
- `fg.muted` - Muted text (disabled, placeholders)
- `fg.inverse` - Text on accent backgrounds

### Accent Colors (`accent.*`)
- `accent.primary` - Primary accent (actions, focus)
- `accent.secondary` - Secondary accent (links, highlights)
- `accent.tertiary` - Subtle accents

### Semantic Colors
- `success` - Success states
- `warning` - Warning states
- `error` - Error states
- `info` - Informational states

### State Colors
- `focus.ring` - Focus ring color
- `focus.bg` - Focus background
- `selected.bg` - Selected item background
- `selected.fg` - Selected item foreground
- `disabled.fg` - Disabled foreground
- `disabled.bg` - Disabled background

### Border Colors (`border.*`)
- `border.subtle` - Subtle borders (dividers)
- `border.default` - Default borders
- `border.strong` - Emphasized borders

## Border Styles

Box widgets support various border styles:

```typescript
ui.box({ border: "single" }, [...])   // Single line (default)
ui.box({ border: "double" }, [...])   // Double line
ui.box({ border: "rounded" }, [...])  // Rounded corners
ui.box({ border: "heavy" }, [...])    // Heavy/thick line
ui.box({ border: "dashed" }, [...])   // Dashed line
ui.box({ border: "none" }, [...])     // No border
```

## Shadow Effects

Add depth with box shadows:

```typescript
// Simple shadow
ui.box({ shadow: true }, [...])

// Custom shadow
ui.box({
  shadow: {
    offsetX: 2,
    offsetY: 1,
    density: "dense"  // "light" | "medium" | "dense"
  }
}, [...])
```

## Spacing

Use the spacing scale for consistent layouts:

| Key | Value | Use Case |
|-----|-------|----------|
| `"none"` | 0 | No spacing |
| `"xs"` | 1 | Tight spacing |
| `"sm"` | 1 | Compact elements |
| `"md"` | 2 | Default spacing |
| `"lg"` | 3 | Sections |
| `"xl"` | 4 | Major sections |
| `"2xl"` | 6 | Page margins |

```typescript
ui.box({ p: "md", gap: "sm" }, [...])
ui.column({ py: "lg", px: "xl" }, [...])
```

## Learn More

- [Style Props Reference](style-props.md) - Complete style property documentation
- [Theme Guide](theme.md) - Creating and customizing themes
- [Icons](icons.md) - Icon system and available icons
- [Focus Styles](focus-styles.md) - Focus ring and indicator customization
