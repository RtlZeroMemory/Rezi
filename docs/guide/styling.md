# Styling

Rezi styling is:

- explicit
- deterministic
- theme-aware
- composable through inheritance and scoped overrides

## Inline styles

Use inline `style` props for one-off presentation.

```ts
import { darkTheme, resolveColorToken, ui } from "@rezi-ui/core";

ui.text("Warning", { style: { fg: resolveColorToken(darkTheme, "warning"), bold: true } });
ui.box({ border: "rounded", p: 1, style: { bg: resolveColorToken(darkTheme, "bg.elevated") } }, [
  ui.text("Panel content"),
]);
```

Container style inherits to descendants unless a child overrides it.

## Theme-based styling

Themes are semantic `ThemeDefinition` objects.

```ts
import { ui, darkTheme } from "@rezi-ui/core";
import { createNodeApp } from "@rezi-ui/node";

const app = createNodeApp({ initialState: {}, theme: darkTheme });
app.view(() => ui.text("Hello"));

await app.start();
```

Switching themes at runtime:

```ts
app.setTheme(darkTheme);
```

## Design-system defaults

Built-in semantic themes automatically enable recipe styling for core widgets.

- You do not need `dsVariant` or `dsTone` for baseline polished styling.
- Manual widget styles merge on top of recipe output.
- `app.setTheme(...)` and scoped overrides use the same semantic token model.

## Validation and extension

Theme hardening APIs:

- `validateTheme(theme)`
- `extendTheme(base, overrides)`
- `contrastRatio(fg, bg)`

```ts
import { darkTheme, extendTheme, rgb, validateTheme } from "@rezi-ui/core";

const brandTheme = extendTheme(darkTheme, {
  colors: {
    accent: {
      primary: rgb(255, 180, 84),
    },
  },
  focusIndicator: {
    bold: true,
    underline: false,
  },
});

validateTheme(brandTheme);
```

Theme colors use packed `Rgb24` values, so author them with `rgb(...)` or
`color(...)`, not `{ r, g, b }` objects.

## Scoped theme overrides

Use `ui.themed(...)` for subtree-specific theme changes:

```ts
import { rgb, ui } from "@rezi-ui/core";

ui.column({}, [
  ui.text("parent"),
  ui.themed(
    {
      colors: {
        accent: {
          primary: rgb(255, 140, 90),
        },
      },
    },
    [ui.text("scoped")],
  ),
  ui.text("parent restored"),
]);
```

Scoped overrides:

- compose predictably
- inherit unspecified values
- can override `colors`, `spacing`, `focusIndicator`, and `widget` palettes

`box`, `row`, `column`, and `grid` also accept a `theme` prop for scoped
overrides when that is more convenient than wrapping with `ui.themed(...)`.

## Dynamic styles

Compute styles from state, but keep `view(state)` pure.

```ts
import { darkTheme, resolveColorToken, ui } from "@rezi-ui/core";

ui.text(state.connected ? "Online" : "Offline", {
  style: {
    fg: resolveColorToken(darkTheme, state.connected ? "success" : "error"),
  },
});
```

## Related

- [Theme](../styling/theme.md)
- [Focus styles](../styling/focus-styles.md)
- [Style props](../styling/style-props.md)
- [Design system](../design-system.md)
