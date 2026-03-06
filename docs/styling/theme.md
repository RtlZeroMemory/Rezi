# Theme

Rezi theming is semantic-only.

The public theme contract is `ThemeDefinition`. Applications pass a
`ThemeDefinition` to `createApp(...)`, `createNodeApp(...)`, and `app.setTheme(...)`.
There is no separate public legacy `Theme` shape anymore.

## Built-in presets

Rezi ships six built-in presets:

- `darkTheme`
- `lightTheme`
- `dimmedTheme`
- `highContrastTheme`
- `nordTheme`
- `draculaTheme`

```ts
import { darkTheme, nordTheme } from "@rezi-ui/core";

app.setTheme(darkTheme);
app.setTheme(nordTheme);
```

## ThemeDefinition shape

`ThemeDefinition` contains:

- `name`
- `colors`
- `spacing`
- `focusIndicator`
- `widget`

`colors` holds the semantic app palette (`bg.*`, `fg.*`, `accent.*`, `focus.*`,
`selected.*`, `disabled.*`, `diagnostic.*`, `border.*`, plus `success`,
`warning`, `error`, and `info`).

`widget` holds advanced surface palettes:

- `widget.syntax`
- `widget.diff`
- `widget.logs`
- `widget.toast`
- `widget.chart`

All color values are packed `Rgb24` integers. Use `rgb(...)` or `color(...)` to
author them.

## Creating a theme

`createThemeDefinition(name, colors, options?)` creates a complete frozen theme.
If `spacing`, `focusIndicator`, or `widget` are omitted, Rezi fills sensible
defaults.

```ts
import { createThemeDefinition, rgb } from "@rezi-ui/core";

export const brandTheme = createThemeDefinition(
  "brand",
  {
    bg: {
      base: rgb(10, 14, 20),
      elevated: rgb(15, 20, 28),
      overlay: rgb(24, 30, 40),
      subtle: rgb(20, 25, 34),
    },
    fg: {
      primary: rgb(231, 236, 242),
      secondary: rgb(142, 155, 170),
      muted: rgb(96, 107, 121),
      inverse: rgb(10, 14, 20),
    },
    accent: {
      primary: rgb(255, 180, 84),
      secondary: rgb(89, 194, 255),
      tertiary: rgb(149, 230, 203),
    },
    success: rgb(170, 217, 76),
    warning: rgb(255, 180, 84),
    error: rgb(240, 113, 120),
    info: rgb(89, 194, 255),
    focus: {
      ring: rgb(255, 180, 84),
      bg: rgb(26, 31, 38),
    },
    selected: {
      bg: rgb(39, 55, 71),
      fg: rgb(231, 236, 242),
    },
    disabled: {
      fg: rgb(96, 107, 121),
      bg: rgb(15, 20, 28),
    },
    diagnostic: {
      error: rgb(240, 113, 120),
      warning: rgb(255, 180, 84),
      info: rgb(89, 194, 255),
      hint: rgb(149, 230, 203),
    },
    border: {
      subtle: rgb(26, 31, 38),
      default: rgb(96, 107, 121),
      strong: rgb(142, 155, 170),
    },
  },
);
```

## Validation

Use `validateTheme(theme)` to enforce the hardened contract.

```ts
import { validateTheme } from "@rezi-ui/core";

validateTheme(brandTheme);
```

Validation checks:

- every required semantic color token
- every required widget palette token
- `spacing.xs`, `spacing.sm`, `spacing.md`, `spacing.lg`, `spacing.xl`, `spacing.2xl`
- `focusIndicator.bold` and `focusIndicator.underline`
- packed `Rgb24` color values

Validation errors are path-specific. For example:

- `Theme validation failed at colors.accent.primary: expected packed Rgb24 integer ...`
- `Theme validation failed: missing required token path(s): widget.chart.primary, spacing.md`

## Extending and scoped overrides

Use `extendTheme(base, overrides)` to derive a new full theme definition.

```ts
import { darkTheme, extendTheme, rgb } from "@rezi-ui/core";

const brandDark = extendTheme(darkTheme, {
  colors: {
    accent: {
      primary: rgb(255, 140, 90),
    },
  },
  focusIndicator: {
    bold: true,
    underline: false,
  },
});
```

Scoped subtree overrides use the same override shape:

```ts
ui.themed(
  {
    colors: { accent: { primary: rgb(255, 140, 90) } },
    spacing: { md: 3 },
  },
  [ui.text("Only this subtree changes")],
);
```

Scoped overrides inherit unspecified values from the parent theme and can
override `colors`, `spacing`, `focusIndicator`, and `widget` palettes.

## Runtime switching

`app.setTheme(nextTheme)` accepts a `ThemeDefinition`.

Behavior:

- allowed before `start()` and while running
- throws on re-entrant render/commit updates
- no-ops when the exact same theme object is passed again
- triggers a full redraw, with optional interpolation when
  `themeTransitionFrames > 0`

## Color helpers

```ts
import { resolveColorToken, tryResolveColorToken } from "@rezi-ui/core";

const fg = resolveColorToken(darkTheme, "fg.primary");
const accent = tryResolveColorToken(darkTheme, "accent.primary");
```

Related helpers:

- `resolveColorToken(theme, path)`
- `tryResolveColorToken(theme, path)`
- `resolveColorOrRgb(theme, colorOrPath, fallback)`
- `isValidColorPath(path)`
