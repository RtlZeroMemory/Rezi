# Rezi Design System

The Rezi design system is the semantic styling layer on top of `ThemeDefinition`,
`ColorTokens`, and `recipe.*`.

Its goals are:

- consistent defaults across core widgets
- semantic token authoring instead of ad-hoc RGB literals
- predictable override behavior
- stable renderer output for tests and snapshots

## Architecture

The public model is:

1. `ThemeDefinition` provides semantic theme tokens.
2. Renderer/widget code reads those tokens through shared helpers.
3. `recipe.*` turns tokens into widget-level styles.
4. Widget-specific manual props merge on top of recipe output.

Advanced widget surfaces use dedicated widget token families:

- `widget.syntax`
- `widget.diff`
- `widget.logs`
- `widget.toast`
- `widget.chart`

## Renderer-backed defaults

Recipe styling is enabled by default for the core design-system-backed widgets,
including:

- buttons
- inputs and textareas
- checkboxes and radio groups
- selects
- sliders
- tables
- progress
- badges
- callouts
- tabs
- accordion
- breadcrumb
- pagination
- kbd
- dropdown
- tree
- modal

This does not mean every visual primitive has a standalone `ui.*` wrapper.

Important distinctions:

- `recipe.surface(...)` exists, but there is no standalone `ui.surface(...)`.
- `recipe.text(...)` exists, but plain `ui.text(...)` is not globally recipe-driven.
- `recipe.scrollbar(...)` exists, but overflow scrollbars are not universally
  rendered through that recipe path yet.
- `ui.divider(...)` is theme-aware, but it is not part of the same “full recipe
  widget coverage” story as buttons/inputs/selects.

## Overrides

Manual widget props do not disable the design system.

Common merge order:

1. resolve theme tokens
2. compute recipe defaults
3. merge widget-level manual overrides such as `style`, `pressedStyle`,
   `selectionStyle`, `trackStyle`, `px`, and similar props

This keeps defaults stable while still allowing targeted changes.

## Scoped theme overrides

Use `ui.themed(...)` or a container `theme` prop to override a subtree.

```ts
import { rgb, ui } from "@rezi-ui/core";

ui.row({ gap: 1 }, [
  ui.themed(
    {
      colors: {
        accent: {
          primary: rgb(255, 140, 90),
        },
      },
      spacing: {
        md: 3,
      },
    },
    [ui.box({ p: 1 }, [ui.text("Scoped subtree")])],
  ),
  ui.box({ flex: 1, p: 1 }, [ui.text("Parent theme")]),
]);
```

Scoped overrides:

- inherit unspecified values from the parent theme
- can override `colors`, `spacing`, `focusIndicator`, and `widget` palettes
- compose predictably when nested

## Focus system

Focus styling is token-driven:

- `colors.focus.ring` controls focus accent color
- `colors.focus.bg` provides subtle focused-surface tint where supported
- `focusIndicator.bold` and `focusIndicator.underline` define default text focus treatment

Widgets may also accept `focusConfig` to change or suppress their local focus
presentation without changing keyboard focus behavior.

## Spacing scale

Theme spacing is semantic and required:

| Token | Cells |
|---|---|
| `xs` | 1 |
| `sm` | 1 |
| `md` | 2 |
| `lg` | 3 |
| `xl` | 4 |
| `2xl` | 6 |

Recipe sizing maps directly to that scale:

- `sm` -> `{ px: spacing.sm, py: 0 }`
- `md` -> `{ px: spacing.md, py: 0 }`
- `lg` -> `{ px: spacing.lg, py: 1 }`

## Theme transitions

`AppConfig.themeTransitionFrames` controls theme interpolation during
`app.setTheme(...)`.

- `0`: instant swap
- `> 0`: interpolate colors across the configured number of frames

Spacing and focus-indicator structure are not tweened per cell; the transition is
primarily a color interpolation path.

## Direct recipe use

Use `recipe.*` when building custom widgets with `defineWidget(...)`.

```ts
import { defineWidget, recipe, ui } from "@rezi-ui/core";

const MetricTile = defineWidget<{ label: string; value: string; key?: string }>((props, ctx) => {
  const tokens = ctx.useTheme();
  const surface = recipe.surface(tokens, { elevation: 1 });
  const labelStyle = recipe.text(tokens, { role: "caption" });
  const valueStyle = recipe.text(tokens, { role: "title" });

  return ui.box({ border: surface.border, style: surface.bg, p: 1 }, [
    ui.text(props.label, { style: labelStyle }),
    ui.text(props.value, { style: valueStyle }),
  ]);
});
```

## Theme authoring

Use `createThemeDefinition(...)` for new themes and `extendTheme(...)` for
variants.

```ts
import { createThemeDefinition, rgb } from "@rezi-ui/core";

export const myTheme = createThemeDefinition(
  "my-theme",
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
    focus: { ring: rgb(255, 180, 84), bg: rgb(26, 31, 38) },
    selected: { bg: rgb(39, 55, 71), fg: rgb(231, 236, 242) },
    disabled: { fg: rgb(96, 107, 121), bg: rgb(15, 20, 28) },
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

`createThemeDefinition(...)` fills default `spacing`, `focusIndicator`, and
`widget` palettes when they are not provided explicitly.

## Verification

For design-system work, verify:

- recipe unit tests
- renderer integration tests
- golden fixture updates when renderer bytes change
- at least one live PTY spot-check in a built-in theme
