# Theme

Rezi supports two related theme shapes:

- `ThemeDefinition`: semantic tokens (`bg.base`, `fg.primary`, `accent.primary`, etc.)
- `Theme`: runtime flat palette used by the renderer

`app.setTheme(...)` accepts either shape.

## Built-in presets

Rezi ships six semantic presets:

- `darkTheme`
- `lightTheme`
- `dimmedTheme`
- `highContrastTheme`
- `nordTheme`
- `draculaTheme`

```typescript
import { darkTheme, nordTheme } from "@rezi-ui/core";

app.setTheme(darkTheme);
app.setTheme(nordTheme);
```

## Validation

Use `validateTheme(theme)` to enforce required theme structure before use:

```typescript
import { validateTheme } from "@rezi-ui/core";

validateTheme(myTheme);
```

Validation checks:

- All required semantic color tokens exist
- Every color token is valid RGB (`r/g/b` integer in `0..255`)
- Required spacing entries exist: `xs`, `sm`, `md`, `lg`, `xl`, `2xl`
- Focus indicator style tokens are present and valid

Error messages are path-specific, for example:

- `Theme validation failed at colors.accent.primary.r: ...`
- `Theme validation failed: missing required token path(s): colors.error, spacing.md`

## Extension / inheritance

Use `extendTheme(base, overrides)` to derive variants without cloning full objects:

```typescript
import { darkTheme, extendTheme } from "@rezi-ui/core";

const brandDark = extendTheme(darkTheme, {
  colors: {
    accent: {
      primary: { r: 255, g: 180, b: 84 },
    },
  },
});
```

Guarantees:

- deep merge (override wins, other tokens inherited)
- returns a new theme object
- does not mutate `base`
- validates merged output

## Contrast utility and WCAG checks

Use `contrastRatio(fg, bg)` for WCAG 2.1 contrast calculations:

```typescript
import { contrastRatio } from "@rezi-ui/core";

const ratio = contrastRatio({ r: 0, g: 0, b: 0 }, { r: 255, g: 255, b: 255 }); // 21
```

Built-in preset verification in tests:

- all six presets pass WCAG AA (`>= 4.5:1`) for primary `fg/bg`
- `highContrastTheme` passes WCAG AAA (`>= 7:1`) for primary `fg/bg`

## Runtime switching guarantees

`app.setTheme(nextTheme)` behavior:

- allowed before `start()` and while running
- throws on re-entrant render/commit calls (`ZRUI_UPDATE_DURING_RENDER`, `ZRUI_REENTRANT_CALL`)
- no-op when effective theme identity is unchanged
- theme changes trigger a full redraw (incremental reuse is bypassed on theme ref change)

## Component-level scoped overrides

`box`, `row`, and `column` support a scoped `theme` prop:

```typescript
import { ui } from "@rezi-ui/core";

ui.column({}, [
  ui.text("parent"),
  ui.box({ theme: { colors: { primary: { r: 80, g: 200, b: 120 } } } }, [
    ui.text("scoped"),
  ]),
  ui.text("parent again"),
]);
```

Rules:

- scope applies to container subtree
- nested overrides compose (inner scope wins)
- leaving a scoped container restores parent theme
- partial overrides inherit unspecified parent tokens

## Color token helpers

```typescript
import { darkTheme, resolveColorToken, tryResolveColorToken } from "@rezi-ui/core";

const fg = resolveColorToken(darkTheme, "fg.primary");
const result = tryResolveColorToken(darkTheme, "accent.primary");
```

Related helpers:

- `resolveColorToken(theme, path)`
- `tryResolveColorToken(theme, path)`
- `resolveColorOrRgb(theme, colorOrPath, fallback)`
- `isValidColorPath(path)`

