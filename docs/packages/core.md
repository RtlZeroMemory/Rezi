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

### Code Editor Syntax Tokenization

`@rezi-ui/core` also exports reusable tokenizer helpers used by `ui.codeEditor(...)`.
These are deterministic, line-based lexical tokenizers that support common language presets:

- `typescript`, `javascript`, `json`
- `go`, `rust`
- `c`, `cpp`/`c++`, `csharp`/`c#`, `java`
- `python`, `bash`
- `plain` fallback

```typescript
import {
  tokenizeCodeEditorLine,
  tokenizeCodeEditorLineWithCustom,
  type CodeEditorTokenizeContext,
} from "@rezi-ui/core";

const builtIn = tokenizeCodeEditorLine('const n = 1;', {
  language: "typescript",
  lineNumber: 0,
  previousLineState: null,
});

const mixed = tokenizeCodeEditorLineWithCustom("SELECT * FROM users", {
  language: "plain",
  lineNumber: 0,
  previousLineState: null,
  customTokenizer: (line, ctx) => {
    if (line.startsWith("SELECT")) {
      return [{ start: 0, end: 6, kind: "keyword" }];
    }
    return tokenizeCodeEditorLine(line, ctx);
  },
});
```

### Layout Engine

Flexbox-like layout with:

- Row and column stacks
- Gap spacing between children
- Padding and margin
- Alignment and justification
- Fixed, flex, percentage, and `fluid(...)` responsive sizing
- Per-child `alignSelf`
- `flexShrink` + `flexBasis` (including intrinsic min/max content handling)
- Wrapped text measurement/render integration
- Absolute positioning (`position: "absolute"` + offsets)
- Grid explicit placement + spans (`gridColumn/gridRow/colSpan/rowSpan`)
- Deterministic integer remainder distribution for weighted splits
- Layout stability signature coverage for modern container widgets (grid/table/tabs/accordion/modal/virtualList/splitPane/breadcrumb/pagination)
- Constraint propagation

### Theme System

Semantic color token system with built-in presets:

```typescript
import { darkTheme, lightTheme, nordTheme, draculaTheme } from "@rezi-ui/core";

app.setTheme(nordTheme);
```

Create custom themes with `createThemeDefinition()`.

### Animation Primitives

Declarative animation hooks and container transitions:

```typescript
import { defineWidget, ui, useSpring, useTransition } from "@rezi-ui/core";

const AnimatedMeter = defineWidget<{ target: number; key?: string }>((props, ctx) => {
  const eased = useTransition(ctx, props.target, { duration: 160, easing: "easeOutCubic" });
  const spring = useSpring(ctx, props.target, { stiffness: 180, damping: 22 });

  return ui.box(
    {
      width: Math.round(16 + eased),
      opacity: Math.max(0.35, Math.min(1, spring / 100)),
      transition: { duration: 180, properties: ["size", "opacity"] },
    },
    [ui.text(`Target: ${props.target}`)],
  );
});
```

Hooks: `useTransition`, `useSpring`, `useSequence`, `useStagger`.

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
  "ctrl+s": { handler: () => save(), description: "Save document" },
  "ctrl+q": { handler: () => app.stop(), description: "Quit application" },
  "g g": { handler: () => scrollToTop(), description: "Scroll to top" }, // Chord: press g twice
});

app.modes({
  normal: {
    "i": { handler: () => app.setMode("insert"), description: "Enter insert mode" },
    "j": { handler: () => moveCursorDown(), description: "Move cursor down" },
  },
  insert: {
    "escape": { handler: () => app.setMode("normal"), description: "Exit insert mode" },
  },
});

const allBindings = app.getBindings();
const normalModeBindings = app.getBindings("normal");
const pending = app.pendingChord; // string | null
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

### Testing Utilities

High-level test helpers are exported from `@rezi-ui/core`:

```typescript
import { createTestRenderer, TestEventBuilder, ui } from "@rezi-ui/core";

const renderer = createTestRenderer({ viewport: { cols: 80, rows: 24 } });
const frame = renderer.render(
  ui.column({}, [
    ui.text("Hello"),
    ui.button({ id: "submit", label: "Submit" }),
  ]),
);

frame.findText("Hello");
frame.findById("submit");
frame.findAll("button");
frame.toText();

const events = new TestEventBuilder();
events.pressKey("Enter").type("hello@example.com").click(10, 5).resize(120, 40);
```

### Debug System

Performance instrumentation and frame inspection. For standard app entrypoints,
prefer `createNodeApp()`. `createNodeApp(...)` exposes the underlying backend
via `app.backend` when you need debug/perf instrumentation.

```typescript
import { createDebugController, categoriesToMask } from "@rezi-ui/core";
import { createNodeApp } from "@rezi-ui/node";

const app = createNodeApp({ initialState: {} });
const debug = createDebugController({
  backend: app.backend.debug,
  terminalCapsProvider: () => app.backend.getCaps(),
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
| `App.replaceView(fn)` | Runtime-safe view swap for widget-mode hot reload workflows |
| `App.replaceRoutes(routes)` | Runtime-safe route table swap for route-managed hot reload workflows |

### Widgets

| Export | Description |
|--------|-------------|
| `ui` | Widget factory namespace |
| `VNode` | Virtual node type |
| `*Props` | Widget prop types (TextProps, ButtonProps, etc.) |
| `tokenizeCodeEditorLine(...)` | Built-in lexical tokenizer for code-editor syntax highlighting |
| `tokenizeCodeEditorLineWithCustom(...)` | Built-in tokenizer wrapper that prefers custom token output when provided |
| `normalizeCodeEditorTokens(...)` | Clamps/sorts token ranges into a render-safe form |
| `CodeEditorSyntaxLanguage`, `CodeEditorSyntaxToken`, `CodeEditorTokenizeContext`, `CodeEditorLineTokenizer` | Tokenizer language and token types |

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
| `fluid(...)` | Fluid responsive interpolation helper for layout scalars |
| `FluidValue`, `FluidValueOptions` | `fluid(...)` value and options types |
| `ResponsiveValue`, `ViewportBreakpoint`, `ResponsiveViewportSnapshot` | Responsive value and breakpoint types |
| `Align`, `JustifyContent` | Alignment types |

### Forms

| Export | Description |
|--------|-------------|
| `useForm` | Form state hook |
| `form.bind(...)`, `form.field(...)` | One-line input/field wiring helpers on `useForm` return |
| `bind`, `bindChecked`, `bindSelect` | Standalone binding helpers for plain state objects |
| `FormState`, `UseFormReturn` | Form types |

### Animation

| Export | Description |
|--------|-------------|
| `useTransition`, `UseTransitionConfig` | Time-based numeric interpolation hook + config type |
| `useSpring`, `UseSpringConfig` | Spring-physics numeric animation hook + config type |
| `useSequence`, `UseSequenceConfig` | Keyframe timeline hook + config type |
| `useStagger`, `UseStaggerConfig` | Staggered per-item progress hook + config type |
| `TransitionSpec`, `TransitionProperty` | `ui.box` transition prop type + allowed properties |

### Testing

| Export | Description |
|--------|-------------|
| `createTestRenderer` | Runs commit/layout/render pipeline with query helpers (`findText`, `findById`, `findAll`, `toText`) |
| `TestEventBuilder` | Fluent builder for readable ZREV integration-test input sequences |
| `encodeZrevBatchV1` | Low-level deterministic ZREV v1 encoder for test events |
| `makeBackendBatch` | Helper to wrap encoded bytes as `BackendEventBatch` |

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
