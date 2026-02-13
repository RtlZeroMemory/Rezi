# Theme

Rezi provides a semantic color token system with built-in theme presets.

## Built-in Theme Presets

Six theme presets are available:

| Preset | Description |
|--------|-------------|
| `darkTheme` | Ayu-inspired dark theme (default) |
| `lightTheme` | Clean light theme |
| `dimmedTheme` | Reduced contrast dark theme |
| `highContrastTheme` | WCAG AAA compliant |
| `nordTheme` | Nord color palette |
| `draculaTheme` | Dracula color palette |

```typescript
import { darkTheme, lightTheme, nordTheme, draculaTheme } from "@rezi-ui/core";

app.setTheme(nordTheme);
```

## Using Theme Colors

Resolve theme tokens into RGB values for widget styling:

```typescript
import { darkTheme, resolveColorToken, ui } from "@rezi-ui/core";

const primaryFg = resolveColorToken(darkTheme, "fg.primary");
const accentColor = resolveColorToken(darkTheme, "accent.primary");

ui.text("Hello", { style: { fg: primaryFg } })
ui.button({
  id: "submit",
  label: "Submit",
  style: { fg: accentColor, bold: true },
})
```

## Color Token Paths

Theme definitions provide semantic color tokens:

| Token Path | Description |
|------------|-------------|
| `fg.primary` | Primary foreground text |
| `fg.secondary` | Secondary/dimmed text |
| `fg.muted` | Muted/disabled text |
| `fg.inverse` | Inverted foreground (for filled backgrounds) |
| `bg.base` | Base background |
| `bg.elevated` | Elevated surface background |
| `bg.overlay` | Overlay/popup background |
| `bg.subtle` | Subtle background variation |
| `accent.primary` | Primary accent color |
| `accent.secondary` | Secondary accent |
| `accent.tertiary` | Tertiary accent |
| `success` | Success/positive state |
| `warning` | Warning state |
| `error` | Error/negative state |
| `info` | Informational state |
| `focus.ring` | Focus indicator color |
| `focus.bg` | Focus background |
| `selected.bg` | Selected item background |
| `selected.fg` | Selected item foreground |
| `disabled.fg` | Disabled foreground |
| `disabled.bg` | Disabled background |
| `border.subtle` | Subtle border |
| `border.default` | Default border |
| `border.strong` | Strong/emphasized border |

## Runtime Theme (`Theme`)

The app runtime also uses a `Theme` object for:

- A spacing scale
- A small named color palette

You can provide it at app creation time:

```typescript
import { createTheme } from "@rezi-ui/core";
import { createNodeApp } from "@rezi-ui/node";

const app = createNodeApp({
    initialState: {},
  theme: createTheme({ colors: { bg: { r: 10, g: 14, b: 20 } } }),
});
```

Or change it at runtime:

```typescript
app.setTheme(createTheme({ colors: { primary: { r: 255, g: 180, b: 84 } } }));
```

## Creating Custom Themes

Create custom themes with `createThemeDefinition()`:

```typescript
import { createThemeDefinition, color } from "@rezi-ui/core";

const myTheme = createThemeDefinition("my-theme", {
  bg: {
    base: color(20, 20, 30),
    elevated: color(30, 30, 40),
    overlay: color(40, 40, 50),
    subtle: color(25, 25, 35),
  },
  fg: {
    primary: color(240, 240, 240),
    secondary: color(180, 180, 180),
    muted: color(100, 100, 100),
    inverse: color(20, 20, 30),
  },
  accent: {
    primary: color(100, 200, 255),
    secondary: color(200, 100, 255),
    tertiary: color(100, 255, 200),
  },
  success: color(100, 255, 100),
  warning: color(255, 200, 100),
  error: color(255, 100, 100),
  info: color(100, 200, 255),
  focus: {
    ring: color(100, 200, 255),
    bg: color(30, 40, 50),
  },
  selected: {
    bg: color(50, 60, 80),
    fg: color(240, 240, 240),
  },
  disabled: {
    fg: color(80, 80, 80),
    bg: color(25, 25, 35),
  },
  border: {
    subtle: color(40, 40, 50),
    default: color(60, 60, 70),
    strong: color(100, 100, 110),
  },
});
```

## Resolution Helpers

| Function | Description |
|----------|-------------|
| `resolveColorToken(theme, path)` | Resolve a token path to RGB |
| `tryResolveColorToken(theme, path)` | Resolve or return undefined |
| `resolveColorOrRgb(theme, colorOrPath)` | Accept RGB or token path |
| `isValidColorPath(path)` | Check if path is valid |

## Related

- [Style Props](style-props.md) - Styling widget props
- [Focus Styles](focus-styles.md) - Focus indicator configuration
- [Icons](icons.md) - Icon system
