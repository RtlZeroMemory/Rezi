# @rezi-ui/core

The runtime-agnostic TypeScript core package. Contains all widgets, layout, themes, forms, and keybindings with no Node.js-specific dependencies.

## Installation

```bash
npm install @rezi-ui/core @rezi-ui/node
```

The `@rezi-ui/node` package brings in `core` as a dependency. For custom backends, you can install `core` directly:

```bash
npm install @rezi-ui/core
```

## What This Package Contains

### Widgets

All widget constructors are exported through the `ui` namespace:

```typescript
import { ui } from "@rezi-ui/core";

ui.text("Hello")
ui.button({ id: "btn", label: "Click" })
ui.column({ gap: 1 }, [...])
ui.table({ id: "tbl", columns: [...], data: [...] })
```

See the [Widget Catalog](../widgets/index.md) for the complete list.

### Layout Engine

Flexbox-like layout with:

- Row and column stacks
- Gap spacing between children
- Padding and margin
- Alignment and justification
- Fixed, flex, and percentage sizing
- Constraint propagation

### Theme System

Semantic color token system with built-in presets:

```typescript
import { darkTheme, lightTheme, nordTheme, draculaTheme } from "@rezi-ui/core";

app.setTheme(nordTheme);
```

Create custom themes with `createThemeDefinition()`.

### Form Management

Form state management with validation:

```typescript
import { ui, useForm } from "@rezi-ui/core";

const form = useForm(ctx, {
  initialValues: { email: "", password: "" },
  validate: (values) => {
    const errors: Record<string, string> = {};
    if (!values.email) errors.email = "Required";
    return errors;
  },
  onSubmit: (values) => handleLogin(values),
});

const view = ui.vstack([
  form.field("email", { label: "Email", required: true }),
  form.field("password", { label: "Password", required: true }),
  ui.input(form.bind("email", { id: "email-inline" })),
]);
```

### Keybindings

Modal keybinding system with chord support:

```typescript
import { parseKeySequence } from "@rezi-ui/core";

app.keys({
  "ctrl+s": () => save(),
  "ctrl+q": () => app.stop(),
  "g g": () => scrollToTop(),  // Chord: press g twice
});

app.modes({
  normal: {
    "i": () => app.setMode("insert"),
    "j": () => moveCursorDown(),
  },
  insert: {
    "escape": () => app.setMode("normal"),
  },
});
```

### Focus Management

Automatic focus traversal with:

- Tab/Shift+Tab navigation
- Focus zones for grouping
- Focus traps for modals
- Focus restoration

### Binary Protocols

Builders and parsers for the Zireael engine binary formats:

- **ZRDL**: Drawlist builder for rendering commands
- **ZREV**: Event batch parser for input events

### Debug System

Performance instrumentation and frame inspection. For standard app entrypoints,
prefer `createNodeApp()`. `createNodeBackend()` is used here only for advanced
debug-controller wiring.

```typescript
import { createDebugController, categoriesToMask } from "@rezi-ui/core";
import { createNodeBackend } from "@rezi-ui/node";

const backend = createNodeBackend();
const debug = createDebugController({
  backend: backend.debug,
  terminalCapsProvider: () => backend.getCaps(),
  maxFrames: 1000,
});
await debug.enable({
  minSeverity: "info",
  categoryMask: categoriesToMask(["frame", "error", "perf"]),
});
```

## API Surface

### Application

| Export | Description |
|--------|-------------|
| `createApp` | Create application instance (low-level; for normal apps prefer `createNodeApp` from `@rezi-ui/node`) |
| `App` | Application interface type |
| `AppConfig` | Configuration options |

### Widgets

| Export | Description |
|--------|-------------|
| `ui` | Widget factory namespace |
| `VNode` | Virtual node type |
| `*Props` | Widget prop types (TextProps, ButtonProps, etc.) |

### Styling

| Export | Description |
|--------|-------------|
| `rgb` | RGB color helper |
| `Rgb` | RGB color type |
| `TextStyle` | Text style type |
| `darkTheme`, `lightTheme`, etc. | Built-in themes |
| `createThemeDefinition` | Custom theme creation |
| `ColorTokens` | Theme token types |

### Layout

| Export | Description |
|--------|-------------|
| `SpacingValue` | Spacing value type |
| `SpacingKey` | Named spacing keys |
| `SPACING_SCALE` | Spacing scale values |
| `Align`, `JustifyContent` | Alignment types |

### Forms

| Export | Description |
|--------|-------------|
| `useForm` | Form state hook |
| `form.bind(...)`, `form.field(...)` | One-line input/field wiring helpers on `useForm` return |
| `bind`, `bindChecked`, `bindSelect` | Standalone binding helpers for plain state objects |
| `FormState`, `UseFormReturn` | Form types |

### Keybindings

| Export | Description |
|--------|-------------|
| `parseKeySequence` | Parse key string |
| `KeyBinding`, `KeyContext` | Keybinding types |
| `CHORD_TIMEOUT_MS` | Chord timeout constant |

### Focus

| Export | Description |
|--------|-------------|
| `createLayerRegistry` | Layer management |
| `pushLayer`, `popLayer` | Layer stack operations |
| `hitTestLayers` | Layer hit testing |

### Protocol

| Export | Description |
|--------|-------------|
| `parseEventBatchV1` | Parse ZREV event batch |
| `createDrawlistBuilderV1` | Create ZRDL builder |
| `BinaryReader`, `BinaryWriter` | Binary utilities |

### Icons

| Export | Description |
|--------|-------------|
| `icons` | Icon registry |
| `resolveIcon`, `getIconChar` | Icon resolution |
| `FILE_ICONS`, `STATUS_ICONS`, etc. | Icon categories |

### Debug

| Export | Description |
|--------|-------------|
| `createDebugController` | Debug controller |
| `createFrameInspector` | Frame inspection |
| `createEventTrace` | Event tracing |
| `createErrorAggregator` | Error aggregation |

## Runtime Constraints

This package enforces strict runtime constraints:

**No Node.js APIs**
: The package must not import `Buffer`, `worker_threads`, `node:*` modules, or any Node-specific APIs.

**Deterministic Behavior**
: Same inputs must produce identical outputs. No random values, no time-dependent behavior in the core logic.

**Explicit results for binary APIs**
: Parsers and builders return result objects (`ParseResult`, `DrawlistBuildResult`) rather than throwing on malformed input.

## TypeScript Configuration

The package is compiled with strict TypeScript settings:

```json
{
  "strict": true,
  "noImplicitAny": true,
  "exactOptionalPropertyTypes": true,
  "noUncheckedIndexedAccess": true,
  "noPropertyAccessFromIndexSignature": true
}
```

## Related Packages

- [@rezi-ui/node](node.md) - Node.js/Bun backend
- [@rezi-ui/native](native.md) - Native addon
- [@rezi-ui/testkit](testkit.md) - Testing utilities
