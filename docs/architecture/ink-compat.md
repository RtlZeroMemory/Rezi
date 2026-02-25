# Ink Compatibility Layer — Architecture Document

> **Package:** `@rezi-ui/ink-compat`
> **Goal:** Drop-in replacement for `ink` — existing Ink programs run on Rezi's rendering engine with zero code changes (only import path changes).

---

## Table of Contents

1. [Executive Summary](#1-executive-summary)
2. [Scope & Constraints](#2-scope--constraints)
3. [Architecture Overview](#3-architecture-overview)
4. [Component Mapping](#4-component-mapping)
5. [Hook Mapping](#5-hook-mapping)
6. [Layout Translation](#6-layout-translation)
7. [Styling Translation](#7-styling-translation)
8. [Lifecycle & Render Entry Point](#8-lifecycle--render-entry-point)
9. [Testing Compatibility](#9-testing-compatibility)
10. [Third-Party Component Support](#10-third-party-component-support)
11. [Epic Breakdown](#11-epic-breakdown)
12. [Risk Assessment](#12-risk-assessment)
13. [Open Questions](#13-open-questions)

---

## 1. Executive Summary

### What

A new package (`@rezi-ui/ink-compat`) that re-exports the **exact same public API surface as Ink v5/v6** — components (`Box`, `Text`, `Spacer`, `Static`, `Transform`, `Newline`), hooks (`useInput`, `useApp`, `useFocus`, `useFocusManager`, `useStdin`, `useStdout`, `useStderr`), and the `render()` entry point — but internally delegates all rendering to Rezi's high-performance pipeline (constraint-based layout → drawlist → Zireael native backend).

### Why

- **Performance:** Rezi's native C renderer (Zireael) + binary drawlist protocol outperforms Ink's ANSI string-based renderer.
- **Ecosystem bridge:** Lets existing Ink apps and third-party Ink components run on Rezi without rewrites.
- **Migration path:** Users can adopt Rezi incrementally — start with ink-compat, then gradually migrate to native `ui.*` API for full power.

### How (High Level)

```
User's React+Ink Code                 (unchanged)
        ↓
@rezi-ui/ink-compat                   (this package)
  ├── React reconciler (react-reconciler)
  │   Creates InkHostNode tree
  ├── VNode translator
  │   InkHostNode tree → Rezi VNode tree
  └── Rezi runtime bridge
      VNode tree → createApp() → render pipeline → Zireael
```

---

## 2. Scope & Constraints

### In Scope (v1.0)

| Area | Coverage |
|------|----------|
| **Core components** | `<Box>`, `<Text>`, `<Newline>`, `<Spacer>`, `<Static>`, `<Transform>` |
| **Core hooks** | `useInput`, `useApp`, `useFocus`, `useFocusManager`, `useStdin`, `useStdout`, `useStderr` |
| **Entry points** | `render()`, `renderToString()`, `measureElement()` |
| **Layout** | Full Yoga-compatible flexbox prop set on `<Box>` |
| **Styling** | Named colors, hex, `rgb()`, bold/italic/underline/strikethrough/dim/inverse |
| **Testing** | `ink-testing-library`-compatible `render()` for tests |
| **React features** | Hooks, Context, Suspense, Error Boundaries, Refs |

### In Scope (v1.1 — Third-Party)

| Area | Coverage |
|------|----------|
| **`@inkjs/ui`** | `TextInput`, `Select`, `MultiSelect`, `Spinner`, `ProgressBar`, `Badge`, `StatusMessage`, `ConfirmInput`, `Alert`, `OrderedList`, `UnorderedList` |
| **Standalone** | `ink-text-input`, `ink-select-input`, `ink-spinner`, `ink-table`, `ink-link` |

### Out of Scope

- Ink's internal reconciler implementation details (we replace it entirely)
- `ink-gradient`, `ink-big-text` (require custom terminal escape sequences)
- Pastel framework (file-system routing — orthogonal concern)
- Kitty keyboard protocol (v6.7+ — defer to v1.2)
- `useCursor()` hook (v6.7+ — defer)
- ARIA/screen reader props (defer — Rezi has its own accessibility story)
- `concurrent` mode flag (Rezi handles scheduling differently)
- `patchConsole` (Rezi has its own console management)

---

## 3. Architecture Overview

### 3.1 Package Structure

```
packages/ink-compat/
├── package.json              # "@rezi-ui/ink-compat"
├── tsconfig.json
├── src/
│   ├── index.ts              # Public API (mirrors ink's exports)
│   │
│   ├── reconciler/
│   │   ├── hostConfig.ts     # react-reconciler host config
│   │   ├── reconciler.ts     # Reconciler instance creation
│   │   └── types.ts          # InkHostNode, InkHostContainer
│   │
│   ├── components/
│   │   ├── Box.ts            # <Box> → ui.box() / ui.row() / ui.column()
│   │   ├── Text.ts           # <Text> → ui.text() / ui.richText()
│   │   ├── Spacer.ts         # <Spacer> → ui.spacer({ flex: 1 })
│   │   ├── Static.ts         # <Static> → scrollback buffer emulation
│   │   ├── Transform.ts      # <Transform> → text post-processor
│   │   └── Newline.ts        # <Newline> → "\n" in text
│   │
│   ├── hooks/
│   │   ├── useInput.ts       # Key event listener
│   │   ├── useApp.ts         # App exit control
│   │   ├── useFocus.ts       # Focus state for a component
│   │   ├── useFocusManager.ts # Global focus management
│   │   ├── useStdin.ts       # stdin access + raw mode
│   │   ├── useStdout.ts      # stdout access + write
│   │   └── useStderr.ts      # stderr access + write
│   │
│   ├── translation/
│   │   ├── propsToVNode.ts   # InkHostNode tree → Rezi VNode tree
│   │   ├── colorMap.ts       # Named color → Rgb conversion
│   │   ├── layoutMap.ts      # Ink flex props → Rezi constraint props
│   │   └── borderMap.ts      # Ink border styles → Rezi border values
│   │
│   ├── runtime/
│   │   ├── render.ts         # render() — main entry point
│   │   ├── renderToString.ts # renderToString() — headless
│   │   ├── measureElement.ts # measureElement() bridge
│   │   ├── bridge.ts         # React reconciler ↔ Rezi app bridge
│   │   └── context.ts        # InkContext (app, stdin, stdout, stderr, focus)
│   │
│   └── testing/
│       ├── render.ts         # ink-testing-library compatible render()
│       └── types.ts          # Test result types
│
└── __tests__/
    ├── components/           # Per-component tests
    ├── hooks/                # Per-hook tests
    ├── layout/               # Layout equivalence tests
    ├── integration/          # Full app scenario tests
    └── ink-parity/           # Tests ported from Ink's own test suite
```

### 3.2 Data Flow

```
┌─────────────────────────────────────────────────────────────────┐
│                     User's Ink Application                      │
│                                                                 │
│  const App = () => (                                           │
│    <Box flexDirection="row" padding={1} borderStyle="round">   │
│      <Text color="green" bold>Hello</Text>                     │
│      <Spacer />                                                │
│      <Text>World</Text>                                        │
│    </Box>                                                      │
│  );                                                            │
│  render(<App />);                                              │
└────────────────────────────┬────────────────────────────────────┘
                             │
                    ┌────────▼────────┐
                    │  React Fiber    │  Standard React reconciliation
                    │  Reconciler     │  (createElement, hooks, context,
                    │                 │   suspense, error boundaries)
                    └────────┬────────┘
                             │
                    ┌────────▼────────┐
                    │  Host Config    │  Creates/updates InkHostNode instances
                    │  (hostConfig.ts)│  Maintains a mutable host tree
                    └────────┬────────┘
                             │  on commit (after React reconciliation)
                    ┌────────▼────────┐
                    │  VNode          │  Walks InkHostNode tree,
                    │  Translator     │  emits Rezi VNode tree
                    │  (propsToVNode) │  (pure translation, no side effects)
                    └────────┬────────┘
                             │
                    ┌────────▼────────┐
                    │  Rezi Runtime   │  commitVNodeTree → layout →
                    │  (createApp)    │  renderToDrawlist → builder →
                    │                 │  backend.requestFrame()
                    └────────┬────────┘
                             │
                    ┌────────▼────────┐
                    │  Zireael        │  Native C renderer
                    │  Backend        │  Terminal output
                    └─────────────────┘
```

### 3.3 Key Design Decision: React Reconciler Approach

**Why a React reconciler (not a JSX-only transform):**

1. **Full React compatibility** — Ink apps use `useState`, `useEffect`, `useContext`, `React.memo`, `Suspense`, `forwardRef`. These are React features, not Ink features. Only a real React reconciler supports them.
2. **Third-party hooks** — Ink components use standard React hooks plus Ink-specific ones. A reconciler lets both coexist.
3. **Ref forwarding** — `measureElement()` requires React refs, which need the reconciler's ref API.
4. **Drop-in fidelity** — The reconciler ensures that React's diffing, batching, and scheduling semantics are preserved exactly.

**How reconciler output feeds Rezi:**

The reconciler maintains a mutable `InkHostNode` tree (like Ink's own DOM). On each React commit, we:
1. Walk the InkHostNode tree
2. Translate each node + props → Rezi VNode
3. Feed the VNode tree to a Rezi app via `app.view(() => translatedTree)`
4. Rezi handles layout, rendering, and output

This avoids double-reconciliation (React's reconciler handles diffing; Rezi's `commitVNodeTree` receives a fresh VNode tree each frame and does its own efficient diff).

---

## 4. Component Mapping

### 4.1 `<Box>` → `ui.box()` / `ui.row()` / `ui.column()`

This is the most complex mapping. Ink's `<Box>` is a single component that behaves differently based on `flexDirection`. Rezi splits this into `box`, `row`, and `column`.

**Translation rules:**

```
flexDirection         →  Rezi widget kind
─────────────────────────────────────────
"column" (default)    →  ui.column(props, children)     — if no border
                      →  ui.box(props, children)        — if has border/bg
"column-reverse"      →  ui.column({ reverse: true }, children)
"row"                 →  ui.row(props, children)        — if no border
                      →  ui.box(props, children)        — if has border/bg
"row-reverse"         →  ui.row({ reverse: true }, children)
```

**When `<Box>` has a border or backgroundColor, ALWAYS use `ui.box()`** because `ui.box()` is the only Rezi widget that supports borders and background fills as a container. If flexDirection is "row", nest a `ui.row()` inside the `ui.box()`.

**Prop mapping:**

| Ink `<Box>` Prop | Rezi Equivalent | Notes |
|---|---|---|
| `flexDirection` | Widget kind selection | See table above |
| `flexGrow` | `flex` | Rezi uses `flex` for grow factor |
| `flexShrink` | `flexShrink` | Direct mapping |
| `flexBasis` | `flexBasis` | Direct mapping |
| `flexWrap` | `wrap: true` | Rezi uses boolean `wrap` on row/column |
| `alignItems` | `items` / `align` | Value translation: `"flex-start"→"start"`, `"flex-end"→"end"`, `"center"→"center"` |
| `alignSelf` | `alignSelf` | Value translation: `"flex-start"→"start"`, `"flex-end"→"end"`, `"auto"→"auto"` |
| `justifyContent` | `justify` | Value translation: `"flex-start"→"start"`, `"flex-end"→"end"`, `"space-between"→"between"`, `"space-around"→"around"`, `"space-evenly"→"evenly"` |
| `width` | `width` | Number direct; string % → `"N%"` |
| `height` | `height` | Number direct; string % → `"N%"` |
| `minWidth` | `minWidth` | Direct |
| `minHeight` | `minHeight` | Direct |
| `maxWidth` | `maxWidth` | Direct |
| `maxHeight` | `maxHeight` | Direct |
| `padding` | `p` | Direct |
| `paddingX` | `px` | Direct |
| `paddingY` | `py` | Direct |
| `paddingTop` | `pt` | Direct |
| `paddingBottom` | `pb` | Direct |
| `paddingLeft` | `pl` | Direct |
| `paddingRight` | `pr` | Direct |
| `margin` | `m` | Direct |
| `marginX` | `mx` | Direct |
| `marginY` | `my` | Direct |
| `marginTop` | `mt` | Direct |
| `marginBottom` | `mb` | Direct |
| `marginLeft` | `ml` | Direct |
| `marginRight` | `mr` | Direct |
| `gap` | `gap` | Direct |
| `columnGap` | `gap` (on row) | Approximate — Rezi has single `gap` |
| `rowGap` | `gap` (on column) | Approximate — Rezi has single `gap` |
| `borderStyle` | `border` | Name translation (see §4.1.1) |
| `borderColor` | `borderStyle: { fg: ... }` | Color translation (see §7) |
| `borderTop` | `borderTop` | Boolean direct |
| `borderRight` | `borderRight` | Boolean direct |
| `borderBottom` | `borderBottom` | Boolean direct |
| `borderLeft` | `borderLeft` | Boolean direct |
| `borderDimColor` | `borderStyle: { dim: true }` | Via TextStyle |
| `borderTopColor`, etc. | `borderStyle` | Rezi doesn't support per-side colors; use dominant color |
| `backgroundColor` | `style: { bg: ... }` | Color translation |
| `display` | Conditional rendering | `"none"` → return `null` from translator |
| `overflow` | `overflow` | `"visible"→"visible"`, `"hidden"→"hidden"` |
| `overflowX` / `overflowY` | `overflow` | Rezi has single overflow; use most restrictive |

#### 4.1.1 Border Style Translation

| Ink `borderStyle` | Rezi `border` |
|---|---|
| `"single"` | `"single"` |
| `"double"` | `"double"` |
| `"round"` | `"rounded"` |
| `"bold"` | `"heavy"` |
| `"singleDouble"` | `"single"` (approximate) |
| `"doubleSingle"` | `"double"` (approximate) |
| `"classic"` | `"single"` (approximate) |
| Custom object | Not supported — fallback to `"single"` |

### 4.2 `<Text>` → `ui.text()` / `ui.richText()`

**Simple case** — single `<Text>` with no children or only string children:
```
<Text color="green" bold>Hello</Text>
→ ui.text("Hello", { style: { fg: { r: 0, g: 128, b: 0 }, bold: true } })
```

**Nested case** — `<Text>` containing other `<Text>` children with different styles:
```
<Text>Hello <Text bold>World</Text></Text>
→ ui.richText({
    spans: [
      { text: "Hello ", style: {} },
      { text: "World", style: { bold: true } },
    ]
  })
```

**Prop mapping:**

| Ink `<Text>` Prop | Rezi Equivalent | Notes |
|---|---|---|
| `color` | `style.fg` | Named/hex/rgb → `Rgb` (see §7) |
| `backgroundColor` | `style.bg` | Named/hex/rgb → `Rgb` |
| `bold` | `style.bold` | Direct |
| `italic` | `style.italic` | Direct |
| `underline` | `style.underline` | Direct |
| `strikethrough` | `style.strikethrough` | Direct |
| `dimColor` | `style.dim` | Direct |
| `inverse` | `style.inverse` | Direct |
| `wrap` | `wrap` / `textOverflow` | `"wrap"→wrap:true`, `"truncate"/"truncate-end"→textOverflow:"ellipsis"`, `"truncate-start"→textOverflow:"clip"` (approx), `"truncate-middle"→textOverflow:"middle"` |

### 4.3 `<Spacer>` → `ui.spacer()`

Direct mapping:
```
<Spacer />  →  ui.spacer({ flex: 1 })
```

### 4.4 `<Newline>` → Text injection

```
<Newline />       →  "\n" injected into parent Text
<Newline count={3} /> →  "\n\n\n" injected into parent Text
```

Since `<Newline>` must be inside `<Text>`, the translator handles it during Text children flattening.

### 4.5 `<Static>` → Scrollback buffer emulation

`<Static>` in Ink renders items once above the dynamic area. They never re-render.

**Rezi translation strategy:**

1. Maintain a `staticBuffer: string[]` in the bridge.
2. When new items appear in `<Static>`, render them to text via Rezi's `renderToString` equivalent and append to `staticBuffer`.
3. Write `staticBuffer` content directly to stdout (above the Rezi rendering area).
4. Rezi's rendering area begins below the static content.

This requires coordination with the backend to offset the rendering viewport.

### 4.6 `<Transform>` → Post-processing wrapper

```
<Transform transform={(line) => line.toUpperCase()}>
  <Text>hello</Text>
</Transform>
```

**Strategy:** The translator renders children to text, applies the transform function line-by-line, and emits the result as `ui.text(transformedContent)`.

This is implemented as a special case in the VNode translator — when an InkHostNode of type "transform" is encountered, its children are rendered to a string first, then the transform function is applied.

---

## 5. Hook Mapping

### 5.1 `useInput(handler, options?)` → Rezi key event system

**Implementation:**

```typescript
function useInput(
  handler: (input: string, key: Key) => void,
  options?: { isActive?: boolean }
) {
  const ctx = useInkContext(); // Access the bridge

  useEffect(() => {
    if (options?.isActive === false) return;

    const unsubscribe = ctx.bridge.onKeyEvent((rawKey) => {
      const { input, key } = translateKeyEvent(rawKey);
      handler(input, key);
    });

    return unsubscribe;
  }, [handler, options?.isActive]);
}
```

**Key event translation:**

Rezi's backend delivers key events. The `translateKeyEvent` function maps them to Ink's `Key` object shape:

| Rezi Key Event | Ink Key Object |
|---|---|
| Arrow keys | `key.leftArrow`, `key.rightArrow`, `key.upArrow`, `key.downArrow` |
| Enter | `key.return = true` |
| Escape | `key.escape = true` |
| Tab | `key.tab = true` |
| Backspace | `key.backspace = true` |
| Delete | `key.delete = true` |
| Ctrl modifier | `key.ctrl = true` |
| Shift modifier | `key.shift = true` |
| Meta/Alt | `key.meta = true` |
| PageUp/PageDown | `key.pageUp`, `key.pageDown` |
| Home/End | `key.home`, `key.end` |
| Printable char | `input = "a"`, etc. |

### 5.2 `useApp()` → Bridge exit control

```typescript
function useApp() {
  const ctx = useInkContext();
  return {
    exit: (error?: Error) => ctx.bridge.exit(error),
  };
}
```

Internally calls `app.stop()` and resolves the `waitUntilExit()` promise.

### 5.3 `useFocus(options?)` → Rezi focus system

```typescript
function useFocus(options?: { autoFocus?: boolean; isActive?: boolean; id?: string }) {
  const nodeId = useInkNodeId(); // Get the host node's auto-generated ID
  const focusId = options?.id ?? nodeId;
  const ctx = useInkContext();

  useEffect(() => {
    if (options?.isActive === false) return;
    ctx.bridge.registerFocusable(focusId, { autoFocus: options?.autoFocus });
    return () => ctx.bridge.unregisterFocusable(focusId);
  }, [focusId, options?.isActive, options?.autoFocus]);

  const isFocused = ctx.bridge.getFocusedId() === focusId;
  return { isFocused };
}
```

Rezi already has a focus system. We register the Ink component's focus ID with Rezi's focus manager and read back focus state.

### 5.4 `useFocusManager()` → Rezi focus traversal

```typescript
function useFocusManager() {
  const ctx = useInkContext();
  return {
    enableFocus: () => ctx.bridge.setFocusEnabled(true),
    disableFocus: () => ctx.bridge.setFocusEnabled(false),
    focusNext: () => ctx.bridge.focusNext(),
    focusPrevious: () => ctx.bridge.focusPrevious(),
    focus: (id: string) => ctx.bridge.focusById(id),
    activeId: ctx.bridge.getFocusedId(),
  };
}
```

### 5.5 `useStdin()` / `useStdout()` / `useStderr()` → Stream access

These hooks provide direct access to Node.js streams. The bridge stores references to the streams passed to `render()`.

```typescript
function useStdin() {
  const ctx = useInkContext();
  return {
    stdin: ctx.stdin,
    isRawModeSupported: ctx.isRawModeSupported,
    setRawMode: (enabled: boolean) => ctx.setRawMode(enabled),
  };
}

function useStdout() {
  const ctx = useInkContext();
  return {
    stdout: ctx.stdout,
    write: (data: string) => ctx.stdout.write(data),
  };
}

function useStderr() {
  const ctx = useInkContext();
  return {
    stderr: ctx.stderr,
    write: (data: string) => ctx.stderr.write(data),
  };
}
```

---

## 6. Layout Translation

### 6.1 Flexbox Model Differences

| Concept | Ink (Yoga) | Rezi |
|---|---|---|
| **Direction** | `flexDirection` prop on `<Box>` | Implicit via `row` vs `column` kind |
| **Default direction** | `column` | N/A (explicit choice) |
| **Grow** | `flexGrow` (default 0) | `flex` (default 0) |
| **Shrink** | `flexShrink` (default 1) | `flexShrink` (default 0) |
| **Basis** | `flexBasis` | `flexBasis` |
| **Wrap** | `flexWrap: "wrap" \| "wrap-reverse"` | `wrap: boolean` (no wrap-reverse) |
| **Align items** | `alignItems: "flex-start" \| "center" \| "flex-end"` | `items: "start" \| "center" \| "end" \| "stretch"` |
| **Justify** | `justifyContent: "flex-start" \| "center" \| "flex-end" \| "space-between" \| "space-around" \| "space-evenly"` | `justify: "start" \| "end" \| "center" \| "between" \| "around" \| "evenly"` |
| **Gap** | `gap`, `columnGap`, `rowGap` | `gap` (single value) |
| **Size units** | Characters (int) or % string | Characters (int), `"N%"`, `"full"`, `"auto"` |
| **Position** | Flexbox only (no absolute) | `position: "absolute"` supported |

### 6.2 Critical Difference: `flexShrink` Default

- **Ink/Yoga default:** `flexShrink: 1` (children shrink to fit)
- **Rezi default:** `flexShrink: 0` (children don't shrink)

The translator MUST explicitly set `flexShrink: 1` on all Box children to match Ink behavior, unless the user explicitly sets `flexShrink`.

### 6.3 Percentage Sizes

Ink: `width="50%"` (string)
Rezi: `width: "50%"` (template literal type)

Direct pass-through works.

### 6.4 `wrap-reverse`

Rezi does not support `wrap-reverse`. The translator should:
1. Log a warning in development mode
2. Fall back to `wrap: true` (without reverse)

---

## 7. Styling Translation

### 7.1 Color Mapping

Ink supports named colors, hex, and `rgb()`. Rezi uses `Rgb` objects.

**Named color → Rgb lookup table:**

```typescript
const NAMED_COLORS: Record<string, Rgb> = {
  black:        { r: 0,   g: 0,   b: 0   },
  red:          { r: 205, g: 0,   b: 0   },
  green:        { r: 0,   g: 205, b: 0   },
  yellow:       { r: 205, g: 205, b: 0   },
  blue:         { r: 0,   g: 0,   b: 238  },
  magenta:      { r: 205, g: 0,   b: 205 },
  cyan:         { r: 0,   g: 205, b: 205 },
  white:        { r: 229, g: 229, b: 229 },
  gray:         { r: 127, g: 127, b: 127 },
  grey:         { r: 127, g: 127, b: 127 },
  redBright:    { r: 255, g: 0,   b: 0   },
  greenBright:  { r: 0,   g: 255, b: 0   },
  yellowBright: { r: 255, g: 255, b: 0   },
  blueBright:   { r: 92,  g: 92,  b: 255 },
  magentaBright:{ r: 255, g: 0,   b: 255 },
  cyanBright:   { r: 0,   g: 255, b: 255 },
  whiteBright:  { r: 255, g: 255, b: 255 },
};
```

**Hex parsing:** `"#ff6347"` → `{ r: 255, g: 99, b: 71 }`

**RGB parsing:** `"rgb(255, 99, 71)"` → `{ r: 255, g: 99, b: 71 }`

### 7.2 Style Composition

When `<Text>` components are nested, styles are inherited/merged. The translator composes styles from parent to child:

```typescript
function mergeTextStyle(parent: TextStyle, child: TextStyle): TextStyle {
  return {
    fg: child.fg ?? parent.fg,
    bg: child.bg ?? parent.bg,
    bold: child.bold ?? parent.bold,
    dim: child.dim ?? parent.dim,
    italic: child.italic ?? parent.italic,
    underline: child.underline ?? parent.underline,
    strikethrough: child.strikethrough ?? parent.strikethrough,
    inverse: child.inverse ?? parent.inverse,
  };
}
```

---

## 8. Lifecycle & Render Entry Point

### 8.1 `render(element, options?)` Implementation

```typescript
import { createNodeApp } from "@rezi-ui/node";
import { createReconciler } from "./reconciler/reconciler.js";

function render(element: React.ReactElement, options?: InkRenderOptions): InkInstance {
  const stdout = options?.stdout ?? process.stdout;
  const stdin = options?.stdin ?? process.stdin;
  const stderr = options?.stderr ?? process.stderr;

  // 1. Create Rezi app (with node backend)
  const app = createNodeApp({
    initialState: {},
    config: {
      fpsCap: options?.maxFps ?? 30,
    },
  });

  // 2. Create the bridge (links React reconciler → Rezi app)
  const bridge = createBridge(app, { stdout, stdin, stderr, ...options });

  // 3. Create React reconciler with our host config
  const reconciler = createReconciler();
  const container = reconciler.createContainer(bridge.rootNode, ...);

  // 4. Initial render
  reconciler.updateContainer(
    <InkContext.Provider value={bridge.context}>
      {element}
    </InkContext.Provider>,
    container,
    null,
    () => {}
  );

  // 5. Set up the view function — re-translates on each React commit
  app.view(() => bridge.translateToVNode());

  // 6. Start the Rezi app
  app.run();

  // 7. Return Ink-compatible instance
  return {
    rerender: (newElement) => {
      reconciler.updateContainer(
        <InkContext.Provider value={bridge.context}>
          {newElement}
        </InkContext.Provider>,
        container, null, () => {}
      );
    },
    unmount: () => {
      reconciler.updateContainer(null, container, null, () => {});
      app.stop();
    },
    waitUntilExit: () => bridge.exitPromise,
    clear: () => bridge.clearOutput(),
    cleanup: () => bridge.dispose(),
  };
}
```

### 8.2 `renderToString(element, options?)` Implementation

Uses Rezi's `createTestRenderer` for headless string rendering:

```typescript
function renderToString(element: React.ReactElement, options?: { columns?: number }): string {
  const cols = options?.columns ?? 80;
  const bridge = createHeadlessBridge(cols);
  const reconciler = createReconciler();
  const container = reconciler.createContainer(bridge.rootNode, ...);

  reconciler.updateContainer(element, container, null, () => {});
  reconciler.flushSync(() => {});

  const vnodeTree = bridge.translateToVNode();
  const renderer = createTestRenderer({ viewport: { cols, rows: 999 } });
  const result = renderer.render(vnodeTree);
  return result.toText();
}
```

### 8.3 Bridge Architecture

The bridge is the central coordinator:

```typescript
interface InkBridge {
  // Root of the InkHostNode tree (managed by React reconciler)
  rootNode: InkHostContainer;

  // Translate current host tree to Rezi VNode tree
  translateToVNode(): VNode;

  // Context for hooks
  context: InkContext;

  // Focus management
  registerFocusable(id: string, opts: FocusOpts): void;
  unregisterFocusable(id: string): void;
  getFocusedId(): string | undefined;
  focusNext(): void;
  focusPrevious(): void;
  focusById(id: string): void;
  setFocusEnabled(enabled: boolean): void;

  // Key event system
  onKeyEvent(handler: (key: RawKeyEvent) => void): () => void;

  // Lifecycle
  exit(error?: Error): void;
  exitPromise: Promise<void>;
  clearOutput(): void;
  dispose(): void;
}
```

---

## 9. Testing Compatibility

### 9.1 `ink-testing-library` Compatible API

```typescript
// @rezi-ui/ink-compat/testing
export function render(element: React.ReactElement): TestInstance {
  const bridge = createHeadlessBridge(80);
  const reconciler = createReconciler();
  const container = reconciler.createContainer(bridge.rootNode, ...);

  // Render tracking
  const frames: string[] = [];

  reconciler.updateContainer(element, container, null, () => {
    frames.push(renderFrame(bridge));
  });

  return {
    lastFrame: () => frames[frames.length - 1] ?? "",
    frames,
    rerender: (newElement) => {
      reconciler.updateContainer(newElement, container, null, () => {
        frames.push(renderFrame(bridge));
      });
    },
    unmount: () => {
      reconciler.updateContainer(null, container, null, () => {});
    },
    stdin: {
      write: (data: string) => bridge.simulateInput(data),
    },
  };
}
```

### 9.2 Parity Test Strategy

Port Ink's own test suite to verify behavioral equivalence:

1. **Layout tests:** Verify that identical `<Box>` configurations produce the same visual output
2. **Text styling tests:** Verify color/bold/italic rendering matches
3. **Focus tests:** Verify Tab/Shift+Tab traversal order matches
4. **Input tests:** Verify `useInput` receives correct key objects
5. **Static tests:** Verify scrollback buffer behavior
6. **Lifecycle tests:** Verify mount/unmount/rerender/waitUntilExit

---

## 10. Third-Party Component Support

### 10.1 Automatic Compatibility

Most third-party Ink components (like `ink-spinner`, `ink-link`, `ink-table`) use only `<Box>`, `<Text>`, and React hooks. They should work automatically without any special handling, as long as our `<Box>` and `<Text>` implementations are faithful.

### 10.2 `@inkjs/ui` Bridge (v1.1)

For components in `@inkjs/ui` that could benefit from native Rezi widgets:

| `@inkjs/ui` Component | Native Rezi Widget | Benefit |
|---|---|---|
| `TextInput` | `ui.input()` | Native cursor, selection, IME |
| `Select` | `ui.select()` | Native scroll, keyboard nav |
| `MultiSelect` | `ui.select()` + multi mode | Native selection UI |
| `Spinner` | `ui.spinner()` | Native animation |
| `ProgressBar` | `ui.progress()` | Recipe-styled, smooth |
| `Badge` | `ui.badge()` | Design system integration |
| `StatusMessage` | `ui.callout()` | Native styling |

This is an optional optimization — the components already work through the Box/Text translation layer. Native widget mapping would give better UX and performance.

---

## 11. Epic Breakdown

### EPIC 1: Foundation & Reconciler (Priority: P0)

**Goal:** React reconciler that creates/manages InkHostNode tree + bridge skeleton.

| Task | Description | Est. |
|------|-------------|------|
| E1.1 | Package scaffolding (`package.json`, `tsconfig.json`, workspace setup) | S |
| E1.2 | InkHostNode / InkHostContainer types and tree operations | M |
| E1.3 | `react-reconciler` host config implementation | L |
| E1.4 | Reconciler instance creation and container management | M |
| E1.5 | InkContext (React context for bridge access) | S |
| E1.6 | Bridge skeleton (rootNode, context, lifecycle) | M |
| E1.7 | Unit tests for host config (create, append, remove, update) | M |

**Acceptance:** React components render and update an InkHostNode tree. No visual output yet.

---

### EPIC 2: VNode Translation Layer (Priority: P0)

**Goal:** Translate InkHostNode tree → Rezi VNode tree.

| Task | Description | Est. |
|------|-------------|------|
| E2.1 | Color mapping module (named, hex, rgb → `Rgb`) | S |
| E2.2 | Border style mapping module | S |
| E2.3 | Layout prop mapping module (flex → Rezi constraints) | M |
| E2.4 | `<Box>` translator (→ `ui.box` / `ui.row` / `ui.column`) | L |
| E2.5 | `<Text>` translator (simple + nested → `ui.text` / `ui.richText`) | L |
| E2.6 | `<Spacer>` translator | S |
| E2.7 | `<Newline>` translator (text injection) | S |
| E2.8 | `<Transform>` translator (post-processing) | M |
| E2.9 | `<Static>` translator (scrollback buffer) | L |
| E2.10 | Full tree walker (`translateToVNode()`) | M |
| E2.11 | `display: "none"` → conditional elision | S |
| E2.12 | `flexShrink` default normalization (Ink default 1 → Rezi) | S |
| E2.13 | Layout equivalence test suite (golden tests: Ink layout → Rezi layout) | L |

**Acceptance:** A static Ink component tree produces the correct Rezi VNode tree. Visual output matches Ink's for common layouts.

---

### EPIC 3: Runtime Bridge & `render()` (Priority: P0)

**Goal:** Full `render()` entry point that starts a Rezi app and displays output.

| Task | Description | Est. |
|------|-------------|------|
| E3.1 | Bridge implementation (reconciler ↔ Rezi app coordination) | L |
| E3.2 | `render()` function (React → reconciler → bridge → Rezi app) | L |
| E3.3 | `rerender()` instance method | M |
| E3.4 | `unmount()` instance method | S |
| E3.5 | `waitUntilExit()` promise management | M |
| E3.6 | `clear()` instance method | S |
| E3.7 | `cleanup()` instance method | S |
| E3.8 | `renderToString()` (headless) | M |
| E3.9 | `measureElement()` bridge | M |
| E3.10 | `exitOnCtrlC` option handling | S |
| E3.11 | `maxFps` option → Rezi fpsCap | S |
| E3.12 | Integration test: full Ink app renders to terminal | L |

**Acceptance:** `render(<App />)` starts a Rezi-powered app. `waitUntilExit()` resolves on exit.

---

### EPIC 4: Hooks (Priority: P0)

**Goal:** All Ink hooks work correctly.

| Task | Description | Est. |
|------|-------------|------|
| E4.1 | Key event translation (Rezi raw keys → Ink Key object) | M |
| E4.2 | `useInput()` hook | M |
| E4.3 | `useApp()` hook | S |
| E4.4 | `useFocus()` hook + focus registration | M |
| E4.5 | `useFocusManager()` hook | M |
| E4.6 | `useStdin()` hook | S |
| E4.7 | `useStdout()` hook | S |
| E4.8 | `useStderr()` hook | S |
| E4.9 | Focus traversal (Tab/Shift+Tab) integration | M |
| E4.10 | Hook test suite | M |

**Acceptance:** All Ink hooks work identically to Ink's implementations.

---

### EPIC 5: Testing Library (Priority: P1)

**Goal:** `ink-testing-library` compatible API.

| Task | Description | Est. |
|------|-------------|------|
| E5.1 | Headless bridge (no terminal, captures frames) | M |
| E5.2 | `render()` for tests (returns `lastFrame`, `frames`, `stdin`, etc.) | M |
| E5.3 | `stdin.write()` simulation | M |
| E5.4 | `rerender()` + `unmount()` in test context | S |
| E5.5 | Port Ink's own test suite for parity verification | L |

**Acceptance:** Existing Ink test suites work with `import { render } from "@rezi-ui/ink-compat/testing"`.

---

### EPIC 6: Edge Cases & Polish (Priority: P1)

**Goal:** Handle edge cases, warnings, and behavioral parity.

| Task | Description | Est. |
|------|-------------|------|
| E6.1 | `wrap-reverse` warning + fallback | S |
| E6.2 | Per-side border color fallback | S |
| E6.3 | Custom border style object fallback | S |
| E6.4 | `columnGap` / `rowGap` normalization | S |
| E6.5 | Percentage height/width edge cases | M |
| E6.6 | Deeply nested `<Text>` style composition | M |
| E6.7 | `<Static>` viewport offset management | L |
| E6.8 | Console patching (match Ink's `patchConsole` behavior) | M |
| E6.9 | Development-mode warnings for unsupported props | M |
| E6.10 | Performance benchmarks (Ink vs ink-compat) | M |

---

### EPIC 7: Third-Party Component Compatibility (Priority: P2)

**Goal:** Verify and optimize popular Ink third-party components.

| Task | Description | Est. |
|------|-------------|------|
| E7.1 | `ink-spinner` compatibility verification | S |
| E7.2 | `ink-text-input` compatibility verification | M |
| E7.3 | `ink-select-input` compatibility verification | M |
| E7.4 | `ink-table` compatibility verification | M |
| E7.5 | `ink-link` compatibility verification | S |
| E7.6 | `@inkjs/ui` compatibility verification | L |
| E7.7 | Optional: Native widget mapping for `@inkjs/ui` components | XL |

---

### EPIC 8: Documentation & Migration Guide (Priority: P1)

**Goal:** Users know how to adopt ink-compat.

| Task | Description | Est. |
|------|-------------|------|
| E8.1 | README with quick start guide | M |
| E8.2 | Migration guide (Ink → ink-compat → native Rezi) | L |
| E8.3 | API reference (full export list with Ink parity notes) | M |
| E8.4 | Known limitations document | S |
| E8.5 | Example apps (ported from Ink examples) | L |

---

### Epic Dependency Graph

```
E1 (Reconciler) ──┐
                   ├──→ E2 (Translation) ──┐
                   │                        ├──→ E3 (Runtime) ──→ E6 (Polish)
                   │                        │         │
                   └────────────────────────┘         ├──→ E4 (Hooks)
                                                      │
                                                      ├──→ E5 (Testing)
                                                      │
                                                      └──→ E7 (Third-party)
                                                              │
                                                              └──→ E8 (Docs)
```

**Critical path:** E1 → E2 → E3 → E4 → E5

---

## 12. Risk Assessment

### High Risk

| Risk | Impact | Mitigation |
|------|--------|------------|
| **Yoga vs Rezi layout differences** | Visual differences between Ink and ink-compat output | Extensive golden-test suite comparing pixel-by-pixel output. Accept small differences and document them. |
| **`flexShrink` default mismatch** | Children overflow instead of shrinking | Always inject `flexShrink: 1` as Ink default. |
| **`<Static>` implementation complexity** | Scrollback buffer management is non-trivial | Start with simplified implementation (direct stdout write), iterate. |
| **React reconciler stability** | `react-reconciler` API changes between React versions | Pin to React 18/19 APIs. Follow Ink's own reconciler patterns. |

### Medium Risk

| Risk | Impact | Mitigation |
|------|--------|------------|
| **Nested `<Text>` complexity** | Style inheritance edge cases | Thorough test suite for nested text scenarios. |
| **Performance overhead** | React reconciler + translation + Rezi reconciler = double work | Profile early. The translation step is a pure tree walk (fast). Rezi's commit phase is optimized for fresh VNode trees. |
| **Third-party component breakage** | Components relying on Ink internals | Document as known limitation. Most components only use public API. |
| **`<Transform>` accuracy** | Transform functions may depend on exact character output | Document limitations. Most transforms are simple (uppercase, prefix). |

### Low Risk

| Risk | Impact | Mitigation |
|------|--------|------------|
| **Hook API surface** | Ink hooks are simple and well-documented | Direct implementation with Rezi's systems. |
| **Color mapping** | Named colors have standard values | Lookup table with fallback. |
| **Testing library** | Simple string-based API | Leverage Rezi's `createTestRenderer`. |

---

## 13. Open Questions

1. **React version support:** Should we support React 18 only, or also React 19? Ink v6 requires React 19, but v5 uses React 18. Supporting both increases maintenance burden.

2. **`patchConsole` behavior:** Ink intercepts `console.log` to render above the dynamic area. Should ink-compat replicate this? It adds complexity but is expected by some apps.

3. **`<Static>` fidelity:** How closely should we match Ink's scrollback buffer behavior? Options range from "write to stdout above render area" (simpler) to "full virtual terminal with scroll tracking" (complex).

4. **Performance target:** Should ink-compat be faster than Ink, or just compatible? If faster, we should optimize the translation layer aggressively and consider caching VNode subtrees.

5. **Error messages:** When a prop is unsupported (e.g., `wrap-reverse`), should we warn once, every render, or silently fallback?

6. **Package name:** `@rezi-ui/ink-compat` vs `rezi-ink` vs `ink-rezi`. The scoped name keeps it in the Rezi ecosystem; the short name is easier to remember.

7. **Mono-export or sub-paths?**
   - Mono: `import { render, Box, Text, useInput } from "@rezi-ui/ink-compat"`
   - Sub-path: `import { render } from "@rezi-ui/ink-compat"` + `import { render } from "@rezi-ui/ink-compat/testing"`
   - Recommendation: Match Ink's export structure exactly (mono-export for main, separate `testing` sub-path).

---

## Appendix A: Complete Ink → ink-compat Export Map

```typescript
// Main entry point: "@rezi-ui/ink-compat"
// Must match: import { ... } from "ink"

// Components
export { Box } from "./components/Box.js";
export { Text } from "./components/Text.js";
export { Spacer } from "./components/Spacer.js";
export { Newline } from "./components/Newline.js";
export { Static } from "./components/Static.js";
export { Transform } from "./components/Transform.js";

// Entry points
export { render } from "./runtime/render.js";
export { renderToString } from "./runtime/renderToString.js";
export { measureElement } from "./runtime/measureElement.js";

// Hooks
export { useInput } from "./hooks/useInput.js";
export { useApp } from "./hooks/useApp.js";
export { useFocus } from "./hooks/useFocus.js";
export { useFocusManager } from "./hooks/useFocusManager.js";
export { useStdin } from "./hooks/useStdin.js";
export { useStdout } from "./hooks/useStdout.js";
export { useStderr } from "./hooks/useStderr.js";

// Types
export type { Key } from "./hooks/useInput.js";
export type { Instance as InkInstance } from "./runtime/render.js";
export type { RenderOptions } from "./runtime/render.js";
export type { RenderToStringOptions } from "./runtime/renderToString.js";
export type { DOMElement } from "./reconciler/types.js";
```

```typescript
// Testing entry point: "@rezi-ui/ink-compat/testing"
// Must match: import { render } from "ink-testing-library"

export { render } from "./testing/render.js";
export type { RenderResult } from "./testing/types.js";
```

---

## Appendix B: Usage Example — Zero Code Changes

**Before (Ink):**
```typescript
import { render, Box, Text, useInput, useApp } from "ink";
import Spinner from "ink-spinner";

const App = () => {
  const { exit } = useApp();
  const [loading, setLoading] = useState(true);

  useInput((input, key) => {
    if (input === "q") exit();
  });

  useEffect(() => {
    setTimeout(() => setLoading(false), 2000);
  }, []);

  return (
    <Box flexDirection="column" padding={1} borderStyle="round" borderColor="green">
      <Text bold color="cyan">My CLI App</Text>
      {loading ? (
        <Box>
          <Text><Spinner type="dots" /> Loading...</Text>
        </Box>
      ) : (
        <Text color="green">Done! Press q to quit.</Text>
      )}
    </Box>
  );
};

render(<App />);
```

**After (ink-compat) — ONLY the import changes:**
```typescript
import { render, Box, Text, useInput, useApp } from "@rezi-ui/ink-compat";
import Spinner from "ink-spinner"; // Still works! Uses Box + Text internally

// ZERO changes below this line
const App = () => {
  const { exit } = useApp();
  const [loading, setLoading] = useState(true);

  useInput((input, key) => {
    if (input === "q") exit();
  });

  useEffect(() => {
    setTimeout(() => setLoading(false), 2000);
  }, []);

  return (
    <Box flexDirection="column" padding={1} borderStyle="round" borderColor="green">
      <Text bold color="cyan">My CLI App</Text>
      {loading ? (
        <Box>
          <Text><Spinner type="dots" /> Loading...</Text>
        </Box>
      ) : (
        <Text color="green">Done! Press q to quit.</Text>
      )}
    </Box>
  );
};

render(<App />);
```
