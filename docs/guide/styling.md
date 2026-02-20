# Styling

Rezi styling is designed to be:

- **explicit**: styles are passed as props
- **deterministic**: the same inputs produce the same frames
- **composable**: styles inherit through containers

## Text attributes

`TextStyle` supports these boolean text attributes:

- `bold`
- `dim`
- `italic`
- `underline`
- `inverse`
- `strikethrough`
- `overline`
- `blink`

Extended underline fields:

- `underlineStyle?: "none" | "straight" | "double" | "curly" | "dotted" | "dashed"`
- `underlineColor?: string | ThemeColor`

New attribute SGR target mappings:

- `strikethrough` -> SGR `9`
- `overline` -> SGR `53`
- `blink` -> SGR `5`

These codes are the terminal mapping used by the backend emitter. Drawlist encoding carries all three attrs, and backend emission now supports `strikethrough`, `overline`, and `blink` end-to-end (terminal rendering still depends on terminal support). Underline variants and underline color use extended style fields on compatible drawlist versions.

## Inline styles

Most visual widgets accept a `style` prop:

```typescript
import { ui, rgb } from "@rezi-ui/core";

ui.text("Warning", { style: { fg: rgb(255, 180, 0), bold: true } });
ui.box({ border: "rounded", p: 1, style: { bg: rgb(20, 20, 24) } }, [
  ui.text("Panel content"),
]);
```

When a container (`row`, `column`, `box`) has a `style`, that style is inherited by its children and can be overridden per-widget.

## Theme-based styling

Themes provide consistent defaults (background/foreground, widget chrome, etc.) and are applied at the app level:

```typescript
import { ui, darkTheme } from "@rezi-ui/core";
import { createNodeApp } from "@rezi-ui/node";

const app = createNodeApp({ initialState: {}, theme: darkTheme });
app.view(() => ui.text("Hello"));
await app.start();
```

Switching themes at runtime:

```typescript
app.setTheme(darkTheme);
```

Runtime guarantees for `setTheme`:

- it can be called before `start()` and while running
- it throws if called during render/commit
- it is a no-op when the effective theme identity is unchanged
- a theme change triggers a full redraw path

## Theme validation and extension

Theme hardening APIs are available from `@rezi-ui/core`:

- `validateTheme(theme)` for strict token validation
- `extendTheme(base, overrides)` for deep-merge inheritance + validation
- `contrastRatio(fg, bg)` for WCAG contrast calculations

Theme tokens include a diagnostic palette:

- `diagnostic.error`
- `diagnostic.warning`
- `diagnostic.info`
- `diagnostic.hint`

Example:

```typescript
import { darkTheme, extendTheme, validateTheme } from "@rezi-ui/core";

const brandTheme = extendTheme(darkTheme, {
  colors: { accent: { primary: { r: 255, g: 180, b: 84 } } },
});

validateTheme(brandTheme);
```

## Scoped theme overrides

`box`, `row`, and `column` accept a scoped `theme` override prop:

```typescript
import { ui } from "@rezi-ui/core";

ui.column({}, [
  ui.text("parent"),
  ui.box({ theme: { colors: { primary: { r: 90, g: 200, b: 140 } } } }, [ui.text("scoped")]),
  ui.text("parent restored"),
]);
```

Behavior:

- nested scopes compose (inner override wins)
- exiting a scoped subtree restores parent theme
- partial overrides inherit unspecified parent tokens

See: [Theme](../styling/theme.md).

## Decision guide

Use **inline styles** when:

- you need one-off emphasis (errors, highlights)
- a widget needs a custom color not tied to semantics

Use **themes** when:

- you want consistent styling across many widgets
- you support light/dark/high-contrast variants
- you want to centralize visual decisions

In practice, most apps use both: a theme for defaults + inline styles for local emphasis.

## Style inheritance

Style is merged from parent → child:

- containers pass their resolved style to children
- leaf widgets merge their own `style` on top
- boolean attrs use tri-state semantics: `undefined` inherits, `false` disables, `true` enables
- `box`/`row`/`column` can also apply scoped `theme` overrides to descendants
- when container `style.bg` is set, that container rect is filled

Example:

```typescript
import { ui, rgb } from "@rezi-ui/core";

ui.box({ p: 1, style: { fg: rgb(200, 200, 255) } }, [
  ui.text("Inherits fg"),
  ui.text("Overrides", { style: { fg: rgb(255, 200, 120), bold: true } }),
]);
```

## Dynamic styles

Compute styles from state, but keep `view(state)` pure (no timers, no I/O):

```typescript
import { ui, rgb } from "@rezi-ui/core";

ui.text(state.connected ? "Online" : "Offline", {
  style: { fg: state.connected ? rgb(80, 220, 120) : rgb(255, 100, 100) },
});
```

## Related

- [Style props](../styling/style-props.md) - `TextStyle`, spacing props, helpers
- [Theme](../styling/theme.md) - Theme structure and built-ins
- [Icons](../styling/icons.md) - Icon registry and fallback rules
- [Focus styles](../styling/focus-styles.md) - Focus and disabled visuals
- [Text style internals](text-style-internals.md) - Drawlist bit layout and merge/cache internals

Next: [Performance](performance.md).
