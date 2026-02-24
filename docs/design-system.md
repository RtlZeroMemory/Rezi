# Rezi Design System

A cohesive design system for building polished, consistent TUI applications with modern "web-app" aesthetics (Tailwind/shadcn-level polish) while maintaining TUI semantics: keyboard-first, low-latency, diff-friendly, capability-tiered.

## Philosophy

- **Consistency beats novelty.** No per-widget special-snowflake styling.
- **Surfaces and contrast over borders.** Prefer layered contrast like modern web UI, not heavy terminal box drawing.
- **Focus/selection must be obvious, not harsh.** No full-line inversion; use underline+bold, subtle bg shifts, and focus rings.
- **Graceful degradation.** Every widget must look clean at every capability tier.
- **Performance first.** Drawlist size and renderer diffs stay efficient. No per-frame allocations.

## Strategic Enforcement

Design system adoption is not optional for core widgets. The following rules are enforced in code review and CI:

- **Token-first styling:** Core widgets must use semantic `ColorTokens` and recipes, not ad-hoc RGB literals.
- **Recipe coverage:** New or updated visual primitives must include recipe tests in `packages/core/src/ui/__tests__/recipes.test.ts`.
- **Renderer compatibility:** Manual style overrides are merged on top of recipe results; recipe defaults should remain stable and deterministic.
- **Snapshot stability:** Gallery snapshots under `snapshots/` are the golden source for visual regressions.
- **Portability:** UI and snapshot helpers in `packages/core/src/ui/` and `packages/core/src/testing/snapshot.ts` must stay Node-agnostic.

### Required Validation Gates

Run these before merge:

```bash
node scripts/run-tests.mjs
node scripts/rezi-snap.mjs --verify
node scripts/check-core-portability.mjs
```

---

## Beautiful Defaults (No Hidden Styling)

Core widgets are wired to the design system so they look professional without manual styling.

### Default recipe styling

When the active theme provides semantic color tokens (see [Color Semantic Slots](#color-semantic-slots)), these widgets use recipes by default:

- `ui.button(...)`
- `ui.input(...)`
- `ui.checkbox(...)`
- `ui.select(...)`
- `ui.table(...)`
- `ui.progress(...)`
- `ui.badge(...)`
- `ui.callout(...)`
- `ui.scrollbar(...)`
- `ui.modal(...)`
- `ui.divider(...)`
- `ui.surface(...)`
- `ui.text(...)`
- `ui.tabs(...)`
- `ui.accordion(...)`
- `ui.breadcrumb(...)`
- `ui.pagination(...)`
- `ui.kbd(...)`
- `ui.dropdown(...)`
- `ui.tree(...)`
- `recipe.sidebar(...)` (shell helper styling)
- `recipe.toolbar(...)` (shell helper styling)

This is the full “covered widgets” set for DS recipe integration.

### Manual overrides

Manual styling props do **not** disable recipe styling.

When semantic color tokens are available, recipe styles are always applied, and manual props like `style`, `pressedStyle`, `px`, and `trackStyle` are merged on top to override specific attributes (for example `fg`, `bold`, `underline`).

> Breaking (alpha): older builds treated some manual `style` props as an opt-out from recipe styling. That opt-out is removed to keep defaults consistent and avoid hidden behavior.

### Activation path + shared token extraction

Recipe styling activation follows a shared path:

1. Resolve theme to semantic color tokens via `getColorTokens(...)`.
2. If tokens are available, use widget recipes for baseline styles.
3. Merge widget-level manual overrides (`style`, `pressedStyle`, etc.) on top.

The shared `getColorTokens()` helper ensures all widgets map theme semantics
through one conversion path before recipe evaluation.

### Scoped theme overrides

Use `ui.themed(themeOverride, children)` to apply a partial theme override to a subtree without affecting siblings. This is the preferred pattern for mixed-theme layouts (for example, a lighter sidebar inside a dark app).

### Unified focus indicators

Focus visuals are token-driven across interactive widgets:

- `focus.ring` controls focus accent color.
- `focus.bg` provides subtle focus background tinting where supported.
- Focus treatment remains non-color-only (underline + bold) for accessibility.

### Height constraints for framed controls

Some recipe-styled widgets can draw a framed control (border + interior). A framed border requires at least **3 rows** of height; in a 1-row layout, widgets still use recipe text/background styling, but they render without a box border.

## Design Tokens

All widgets consume tokens from the design system — never raw RGB/ANSI values directly.

### Color Semantic Slots

Every theme must define these semantic color slots:

| Token Path | Purpose | Example (dark) |
|---|---|---|
| `bg.base` | Main app background | `#0a0e14` |
| `bg.elevated` | Cards, panels, modals (1 step up) | `#0f1419` |
| `bg.overlay` | Dropdowns, tooltips (2 steps up) | `#1a1f26` |
| `bg.subtle` | Hover/focus hint background | `#141920` |
| `fg.primary` | Primary text | `#e6e1cf` |
| `fg.secondary` | Secondary/label text | `#5c6773` |
| `fg.muted` | Placeholders, disabled text, hints | `#3e4b59` |
| `fg.inverse` | Text on accent backgrounds | `#0a0e14` |
| `accent.primary` | Primary actions, focus rings | `#ffb454` |
| `accent.secondary` | Links, secondary actions | `#59c2ff` |
| `accent.tertiary` | Subtle accents, decorations | `#95e6cb` |
| `success` | Success states | `#aad94c` |
| `warning` | Warning states | `#ffb454` |
| `error` | Error states | `#f07178` |
| `info` | Informational states | `#59c2ff` |
| `focus.ring` | Focus indicator color | `#ffb454` |
| `focus.bg` | Focus background hint | `#1a1f26` |
| `selected.bg` | Selected item background | `#273747` |
| `selected.fg` | Selected item foreground | `#e6e1cf` |
| `disabled.fg` | Disabled text | `#3e4b59` |
| `disabled.bg` | Disabled background | `#0f1419` |
| `border.subtle` | Dividers, faint separators | `#1a1f26` |
| `border.default` | Default borders | `#3e4b59` |
| `border.strong` | Emphasized borders | `#5c6773` |

These are already defined via `ColorTokens` in `packages/core/src/theme/tokens.ts` and resolved via `resolveColorToken()` in `packages/core/src/theme/resolve.ts`.

### Spacing Scale

Terminal spacing is measured in cells (1 cell = 1 character width/height).

| Name | Cells | Use |
|---|---|---|
| `none` | 0 | No spacing |
| `xs` | 1 | Tight internal padding (badges, tags) |
| `sm` | 1 | Standard internal padding (buttons, inputs) |
| `md` | 2 | Panel padding, form gaps |
| `lg` | 3 | Section spacing |
| `xl` | 4 | Large section spacing |
| `2xl` | 6 | Page-level spacing |

**Rules:**
- Use `xs`/`sm` for internal component padding
- Use `md` for gaps between related elements (form fields)
- Use `lg`/`xl` between sections
- Maintain consistent gap within a layout (don't mix `sm` and `lg` gaps in the same column)

### Spacing token consumption in recipes

Recipe sizing now accepts theme spacing tokens directly. `resolveSize(size, spacingTokens?)` maps:

- `sm` -> `{ px: spacing.xs, py: 0 }`
- `md` -> `{ px: spacing.sm, py: 0 }`
- `lg` -> `{ px: spacing.md, py: spacing.xs }`

When spacing tokens are omitted, recipes keep legacy fallback spacing values for backward compatibility.

### Typography Roles

TUI typography maps to text attributes (bold/dim) + color tokens:

| Role | Attributes | Color | Use |
|---|---|---|---|
| `title` | `bold` | `fg.primary` | Page/section titles |
| `subtitle` | `bold` | `fg.secondary` | Sub-headings |
| `body` | (none) | `fg.primary` | Body text |
| `caption` | `dim` | `fg.secondary` | Help text, descriptions |
| `code` | (none) | `accent.tertiary` | Code, monospace content |
| `label` | `bold` | `fg.primary` | Form labels, UI labels |
| `muted` | `dim` | `fg.muted` | Placeholders, disabled |

### Border Styles

| Name | Glyphs | Use |
|---|---|---|
| `single` | `┌─┐│└┘` | Default panels, cards |
| `rounded` | `╭─╮│╰╯` | Soft panels, buttons (web-like) |
| `double` | `╔═╗║╚╝` | Emphasis, active panels |
| `heavy` | `┏━┓┃┗┛` | Strong focus ring, headers |
| `dashed` | `┌╌┐╎└┘` | Draft/provisional elements |
| `none` | (no border) | Clean surface (preferred for modern look) |

**Rules:**
- Prefer `rounded` for cards and panels (modern feel)
- Use `single` as a neutral default
- Reserve `heavy` for focused/active panel chrome
- Use `none` with bg contrast for cleanest surfaces

### Radii (Border Corner Style)

In TUI, "border radius" maps to glyph choice:

| Name | Glyphs | Mapping |
|---|---|---|
| `square` | `┌┐└┘` | Single border |
| `soft` | `╭╮╰╯` | Rounded border (default for modern UI) |
| `round` | `╭╮╰╯` | Same as soft (TUI ceiling) |

### Elevation / Surfaces

TUI "depth" uses contrast layers, not drop shadows:

| Level | Background | Border | Shadow | Use |
|---|---|---|---|---|
| 0 (base) | `bg.base` | none | none | App background |
| 1 (card) | `bg.elevated` | `border.subtle` | none | Cards, panels |
| 2 (overlay) | `bg.overlay` | `border.default` | optional | Dropdowns, menus |
| 3 (modal) | `bg.overlay` | `border.strong` | yes | Modals, dialogs |

**Shadow effect:** 1-cell offset using shade characters (`░▒▓`) on bottom/right edges.

### Focus Ring Language

Focus indication across ALL interactive controls:

| Widget Type | Focus Treatment | Description |
|---|---|---|
| Button | `underline` + `bold` + `fg: accent.primary` | Text becomes underlined bold in accent |
| Input/Textarea | `border: heavy` + `borderStyle: accent.primary` | Border upgrades to heavy in accent |
| Select | `underline` + `bold` | Same as button |
| Checkbox/Radio | `bold` + `fg: accent.primary` | Label becomes bold accent |
| Table row | `bg: selected.bg` + `bold` | Row highlighted |
| Tree node | `bg: selected.bg` | Node highlighted |
| Modal | `border: heavy` + `shadow` | Frame emphasized |

---

## Variants

### Size

| Name | Padding | Height | Use |
|---|---|---|---|
| `sm` | `px: 1` | 1 row | Compact toolbars, dense lists |
| `md` | `px: 2` | 1 row | Default controls |
| `lg` | `px: 3` | 1 row (+ top/bottom padding for multi-line) | Hero actions, emphasis |

### Visual Variant

| Name | Background | Border | Text | Use |
|---|---|---|---|---|
| `solid` | `accent.primary` | none | `fg.inverse` | Primary CTA |
| `soft` | `bg.subtle` | none | `fg.primary` | Secondary actions |
| `outline` | `bg.base` | `border.default` | `fg.primary` | Tertiary actions |
| `ghost` | transparent | none | `fg.secondary` | Minimal UI (toolbars) |

### Tone

Tone modifies the accent color used by variants:

| Name | Accent Source | Use |
|---|---|---|
| `default` | `accent.primary` | Standard |
| `primary` | `accent.primary` | Explicit primary |
| `danger` | `error` | Destructive actions |
| `success` | `success` | Positive actions |
| `warning` | `warning` | Cautionary actions |

### Density

| Name | Gap | Padding | Use |
|---|---|---|---|
| `compact` | 0 | minimal | Dense data tables, toolbars |
| `comfortable` | 1 | standard | Default |

---

## Widget States

Every interactive widget supports these visual states:

| State | Visual Treatment | Details |
|---|---|---|
| `default` | Base styling | Normal resting state |
| `active-item` | `bg: bg.subtle` | Hover equivalent for keyboard nav |
| `focus` | Focus ring (see above) | Keyboard focus indicator |
| `pressed` | `dim` attribute + slight bg shift | Momentary press feedback |
| `disabled` | `fg: disabled.fg`, `bg: disabled.bg` | Non-interactive |
| `loading` | Skeleton/spinner replacement | Content loading |
| `error` | `fg: error`, border/underline color swap | Validation error |
| `selected` | `bg: selected.bg`, `fg: selected.fg` | Multi-select checked |

---

## Capability Tiers

The design system adapts to terminal capabilities:

### Tier A: Basic (16/256-color + Unicode box drawing)

- Colors mapped to nearest 256-color palette entry
- All unicode box-drawing characters assumed supported
- No image protocols
- Shadows use `░▒▓` shade characters
- Sparklines use `▁▂▃▄▅▆▇█` block characters
- Focus ring uses heavy border glyphs

### Tier B: Truecolor

- Full RGB color support (24-bit)
- All Tier A features
- Smooth gradients possible in charts
- Richer contrast layering for surfaces

### Tier C: Enhanced

- Truecolor + one or more of: Kitty graphics, Sixel, iTerm2 images
- Sub-cell canvas rendering via blitters (braille, sextant, quadrant)
- Smooth progress bars, sparklines
- Image rendering
- **NOT required for legibility** — Tier B must look complete

### Tier Detection

```typescript
import { getCapabilityTier } from "@rezi-ui/core";

const tier = getCapabilityTier(terminalCaps);
// tier: "A" | "B" | "C"
```

The tier is derived from:
- Color mode (16 → A, 256 → A, RGB → B/C)
- Image protocol support (any → C)
- Extended capabilities (underline styles, colored underlines)

### Tier Fallback Rules

1. Never rely on color alone — always pair with bold/dim/underline
2. Tier A must be fully usable (no missing information)
3. Tier C features are enhancements, never requirements
4. Test all themes at Tier A and Tier B minimum

---

## Recipe System

Recipes are pure style functions that return `TextStyle`-compatible objects based on semantic `ColorTokens` plus widget state/variant/tone/size inputs.

### Usage

```typescript
import { recipe, darkTheme } from "@rezi-ui/core";

const colors = darkTheme.colors;

// Button recipe
const buttonStyle = recipe.button(colors, {
  variant: "solid",
  tone: "primary",
  size: "md",
  state: "focus",
});

// Surface recipe
const surfaceStyle = recipe.surface(colors, {
  elevation: 1,
  focused: false,
});

// Input recipe
const inputStyle = recipe.input(colors, {
  state: "error",
  size: "md",
});
```

### Available Recipes

| Recipe | Parameters | Output |
|---|---|---|
| `recipe.button` | `variant`, `tone`, `size`, `state`, `density` | label/bg styles + border metadata + padding |
| `recipe.input` | `state`, `size`, `density` | text/placeholder/bg styles + border metadata + padding |
| `recipe.surface` | `elevation`, `focused` | surface bg style + border metadata + shadow flag |
| `recipe.select` | state, size | TextStyle + option styles |
| `recipe.table` | `state` (`header`/`row`/`selectedRow`/`focusedRow`/`stripe`) | cell/bg styles |
| `recipe.modal` | `focused` | frame/backdrop/title styles + border metadata + shadow flag |
| `recipe.badge` | `tone` (`WidgetTone` + `info`) | badge text style |
| `recipe.text` | `role` | typography style |
| `recipe.divider` | — | divider style |
| `recipe.checkbox` | `state`, `checked` | indicator/label styles |
| `recipe.progress` | `tone` | filled/track styles |
| `recipe.callout` | `tone` (`WidgetTone` + `info`) | text/border/bg styles |
| `recipe.scrollbar` | — | track/thumb styles |
| `recipe.tabs` | `variant`, `tone`, `size`, `state` | tab item/bg styles + border metadata + padding |
| `recipe.accordion` | `variant`, `tone`, `size`, `state` | header/content/bg styles + border metadata + padding |
| `recipe.breadcrumb` | `variant`, `tone`, `size`, `state` | item/separator/bg styles + padding |
| `recipe.pagination` | `variant`, `tone`, `size`, `state` | control/bg styles + border metadata + padding |
| `recipe.kbd` | `variant`, `tone`, `size`, `state` | keycap/bg styles + border metadata + padding |
| `recipe.dropdown` | `variant`, `tone`, `size`, `state` | item/shortcut/bg styles + border metadata + padding |
| `recipe.tree` | `variant`, `tone`, `size`, `state` | node/prefix/bg styles + border metadata + padding |
| `recipe.sidebar` | `variant`, `tone`, `size`, `state` | shell item/bg styles + border metadata + spacing |
| `recipe.toolbar` | `variant`, `tone`, `size`, `state` | shell item/bg styles + border metadata + spacing |

### Theme transitions

Set `AppConfig.themeTransitionFrames` to interpolate theme colors across multiple render frames when `app.setTheme(...)` is called.

- `0` (default): instant theme swap (legacy behavior)
- `> 0`: frame-by-frame interpolation from previous to next theme
- Re-targeting during an active transition starts from the current interpolated frame and converges to the latest target

---

## Rules & Guidelines

### Surfaces Over Borders

```
PREFER:                          AVOID:
┌──────────────────┐             ╔══════════════════╗
│ Clean card       │             ║ Heavy border     ║
│ with subtle      │             ║ everywhere       ║
│ border           │             ╚══════════════════╝
└──────────────────┘
```

Use `bg.elevated` with `border.subtle` for cards. Reserve heavy/double borders for active focus states.

### Muted Text & Whitespace Rhythm

- Use `fg.secondary` for labels, `fg.muted` for hints/placeholders
- Maintain 1-cell gap between label and value in forms
- Use 2-cell gap between form sections
- Empty areas should use `bg.base` (no fill characters)

### Alignment Rules (Terminal Grid)

- All elements align to the cell grid (no sub-cell positioning in layout)
- Horizontal padding in even numbers preferred (2, 4) for visual balance
- Vertical spacing: 0 for tight lists, 1 for comfortable, 2+ for sections

### Truncation & Ellipsis

- Text overflow defaults to `"ellipsis"` (adds `…` at end)
- Middle truncation (`"middle"`) for file paths: `src/comp…/index.ts`
- Clip (`"clip"`) only for code/monospace where ellipsis misleads
- Wide characters (CJK, emoji) handled safely — never split a wide char

### Handling Wide Characters / Emoji

- All text measurement uses `measureTextCells()` which accounts for grapheme clusters
- Emoji width follows the configured policy (`wide` = 2 cells, `narrow` = 1 cell)
- Truncation respects grapheme boundaries — never cuts mid-cluster
- Layout engine treats each cell as the atomic unit

---

## Theme Authoring

### Creating a Custom Theme

```typescript
import { createThemeDefinition, color } from "@rezi-ui/core";

export const myTheme = createThemeDefinition("my-theme", {
  bg: {
    base: color(25, 25, 30),
    elevated: color(35, 35, 42),
    overlay: color(45, 45, 55),
    subtle: color(30, 30, 36),
  },
  fg: {
    primary: color(220, 220, 230),
    secondary: color(140, 140, 160),
    muted: color(80, 80, 100),
    inverse: color(25, 25, 30),
  },
  accent: {
    primary: color(100, 180, 255),
    secondary: color(180, 130, 255),
    tertiary: color(100, 220, 180),
  },
  success: color(100, 200, 100),
  warning: color(255, 200, 80),
  error: color(255, 100, 100),
  info: color(100, 180, 255),
  focus: {
    ring: color(100, 180, 255),
    bg: color(35, 35, 42),
  },
  selected: {
    bg: color(50, 60, 80),
    fg: color(220, 220, 230),
  },
  disabled: {
    fg: color(80, 80, 100),
    bg: color(30, 30, 36),
  },
  diagnostic: {
    error: color(255, 100, 100),
    warning: color(255, 200, 80),
    info: color(100, 180, 255),
    hint: color(180, 130, 255),
  },
  border: {
    subtle: color(40, 40, 50),
    default: color(60, 60, 75),
    strong: color(100, 100, 120),
  },
});
```

### Contrast Requirements

- `fg.primary` on `bg.base`: minimum 7:1 contrast ratio (WCAG AAA)
- `fg.secondary` on `bg.base`: minimum 4.5:1 (WCAG AA)
- `accent.primary` on `bg.base`: minimum 4.5:1 (WCAG AA)
- Use `contrastRatio(fg, bg)` from `@rezi-ui/core` to validate

---

## Built-in Themes

| Theme | Style | Good For |
|---|---|---|
| `darkTheme` | Ayu-inspired, orange accent | General use, warm aesthetic |
| `lightTheme` | Clean white, blue accent | Bright environments |
| `dimmedTheme` | Low contrast dark | Extended sessions |
| `highContrastTheme` | WCAG AAA, cyan/yellow | Accessibility |
| `nordTheme` | Arctic cool, frost blue | Nord ecosystem |
| `draculaTheme` | Vibrant dark, purple accent | Dracula ecosystem |

All themes define the complete `ColorTokens` set and work at every capability tier.

---

## Implementation Files

| File | Purpose |
|---|---|
| `packages/core/src/theme/tokens.ts` | Token type definitions + helpers |
| `packages/core/src/theme/presets.ts` | 6 built-in theme definitions |
| `packages/core/src/theme/resolve.ts` | Token path → RGB resolution |
| `packages/core/src/theme/interop.ts` | ThemeDefinition ↔ runtime Theme conversion |
| `packages/core/src/ui/designTokens.ts` | Extended design tokens (typography, elevation) |
| `packages/core/src/ui/capabilities.ts` | Tier A/B/C detection and adaptation |
| `packages/core/src/ui/recipes.ts` | Style recipes for all widget families |

---

## Widget Gallery

The Widget Gallery (`examples/gallery/`) renders deterministic widget scenes for design and regression testing. It provides:

- Interactive browsing of all widgets
- State matrix view (variants × states)
- Theme switching (all 6 built-in themes)
- Headless mode for CI snapshot capture

Run interactively:
```bash
npx tsx examples/gallery/src/index.ts
```

Run headless for snapshots:
```bash
npx tsx examples/gallery/src/index.ts --headless --scene button-matrix
```

---

## Golden Snapshot Testing

Visual regression testing captures deterministic cell-grid snapshots:

```bash
# Update snapshots
node scripts/rezi-snap.mjs --update

# Verify against existing snapshots
node scripts/rezi-snap.mjs --verify

# Run specific scene
node scripts/rezi-snap.mjs --verify --scene button-matrix --theme dark
```

Snapshot format: metadata header (`scene`, `theme`, `viewport`, `version`, `capturedAt`) followed by rendered text content.

See [Developer Testing Guide](./dev/testing.md) for details.
