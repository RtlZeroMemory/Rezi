# Rezi AI Development Guide

## Project Overview

Rezi is a high-performance TypeScript TUI framework with a native C rendering engine (Zireael).
This repo uses npm workspaces.

Main packages:
- `@rezi-ui/core`: runtime-agnostic framework APIs and internals
- `@rezi-ui/node`: Node backend runtime
- `@rezi-ui/jsx`: JSX runtime and components
- `create-rezi`: scaffolding templates

## Quick Commands

```bash
npm install
npm run build
node scripts/run-tests.mjs
npx tsx examples/gallery/src/index.ts
REZI_PERF=1 REZI_PERF_DETAIL=1 node scripts/run-tests.mjs
```

## Mandatory Code Standards

All code changes must follow `docs/dev/code-standards.md`.
Use that file as the merge gate for TypeScript rigor, reconciliation safety, callback safety, and runtime invariants.

## Project Map

```text
packages/core/src/
  app/
    createApp.ts              # App factory + lifecycle
    widgetRenderer.ts         # Render orchestration
  widgets/
    ui.ts                     # Canonical ui.* widget factory API
    types.ts                  # VNode props definitions
    composition.ts            # defineWidget + WidgetContext hooks
    conditionals.ts           # show/when/match/maybe
    collections.ts            # each/eachInline
    hooks/
      animation.ts            # useTransition/useSpring/useSequence/useStagger/useAnimatedValue/useParallel/useChain
      utility.ts              # useDebounce/usePrevious
      data.ts                 # useAsync/useStream/useInterval/useEventSource/useWebSocket/useTail
    useTable.ts               # useTable domain hook
    useModalStack.ts          # useModalStack domain hook
  runtime/
    commit.ts                 # VNode -> RuntimeInstance
    reconcile.ts              # keyed/unkeyed tree diffing
    focus.ts                  # Focus management
  layout/
    engine/layoutEngine.ts    # Constraint-driven layout engine
    kinds/                    # Per-widget layout logic
  renderer/
    renderToDrawlist.ts       # Drawlist render entry
    renderToDrawlist/
      renderTree.ts           # DFS render traversal
  drawlist/
    builder.ts                # ZRDL builder facade
    builderBase.ts            # Base writer
    writers.gen.ts            # Generated command writers
  forms/
    useForm.ts                # Form domain hook
    validation.ts             # Validation helpers
  router/
    router.ts                 # Routing and nested outlets
    helpers.ts                # routerBreadcrumb/routerTabs helpers
  testing/
    renderer.ts               # createTestRenderer
    events.ts                 # Test event builders
    snapshot.ts               # Snapshot helpers

packages/node/src/
  backend/
    nodeBackend.ts            # Worker-mode backend
    nodeBackendInline.ts      # Inline backend

packages/create-rezi/templates/
  minimal/
  cli-tool/
  dashboard/
  stress-test/
  animation-lab/
```

## Architecture — Render Pipeline

```text
State
  -> view(state)
  -> VNode tree
  -> commitVNodeTree
  -> layout
  -> metadata collect (focus + hit-testing)
  -> renderToDrawlist
  -> builder.build()
  -> backend.requestFrame()
```

Pipeline references:
- `packages/core/src/app/widgetRenderer.ts`
- `packages/core/src/runtime/commit.ts`
- `packages/core/src/runtime/reconcile.ts`
- `packages/core/src/renderer/renderToDrawlist/renderTree.ts`
- `packages/core/src/drawlist/builder.ts`

## Layout Engine Baseline

Current behavior that docs and code generation must preserve:
- Intrinsic sizing protocol for container and leaf widgets (`measureMinContent` / `measureMaxContent`).
- Stack flex model supports `flex`, `flexShrink`, `flexBasis`, and `alignSelf`.
- Wrap and non-wrap stack logic uses bounded cross-axis feedback.
- Text supports wrapping with grapheme-safe breaks and `textOverflow` (`clip`, `ellipsis`, `middle`, `start`).
- `box` supports synthetic inner-column layout with `gap` and out-of-flow absolute children.
- Absolute positioning is supported for stack/box children (`position: "absolute"` + offsets).
- Grid supports explicit placement and spans (`gridColumn`, `gridRow`, `colSpan`, `rowSpan`).
- Overlay widgets use constraint-driven sizing (`modal`, `commandPalette`, `toolApprovalDialog`, `toastContainer`).
- Deterministic integer distribution is shared across split and grid sizing paths.
- Stability signatures are active for common leaf/container/widget kinds.

### Container vs Leaf Taxonomy

Every widget is either a container (lays out children) or a leaf (measures and renders content).

| Type | Role | Typical Widgets |
|------|------|-----------------|
| Container | Defines layout shape and child distribution | `box`, `row`, `column`, `grid`, `tabs`, `accordion`, `splitPane`, `panelGroup`, `focusZone`, `focusTrap`, `layers` |
| Leaf | Renders intrinsic content | `text`, `button`, `input`, `select`, `table`, `virtualList`, `codeEditor`, `image`, `canvas` |

Rules:
- Containers define structure.
- Leaves fill structure.
- Avoid redundant container chains with no layout contribution.

## Design System

Rezi ships semantic design tokens, recipes, and capability tiers.
Primary reference: `docs/design-system.md`.

### Key Concepts

- Tokens: semantic slots (`bg.base`, `fg.primary`, `accent.primary`, `surface.*`).
- Recipes: deterministic style composition for widget families.
- Capability tiers: A (256-color), B (truecolor), C (enhanced/image).
- Snapshot-based visual validation with `captureSnapshot` and `rezi-snap`.

### Beautiful Defaults (Design System by Default)

When semantic tokens are available, these widgets are recipe-styled by default:
`ui.button`, `ui.input`, `ui.checkbox`, `ui.select`, `ui.table`, `ui.progress`, `ui.badge`, `ui.callout`, `ui.scrollbar`, `ui.modal`, `ui.divider`, `ui.surface`, `ui.text`.

Notes:
- Manual overrides are merged on top of recipe results.
- Input/select framed borders need at least 3 rows of height.

### Button Styling

Use `intent` for all button styling decisions.

| Intent | Meaning | Typical Action |
|--------|---------|----------------|
| `"primary"` | Highest emphasis CTA | Save, Confirm, Continue |
| `"secondary"` | Default secondary action | Cancel, Back |
| `"danger"` | Destructive action | Delete, Remove |
| `"success"` | Positive confirmation action | Approve, Mark complete |
| `"warning"` | Cautionary action | Retry risky step |
| `"link"` | Minimal text-like action | Learn more, Open docs |

Examples:

```ts
ui.button({ id: "save", label: "Save", intent: "primary" })
ui.button({ id: "cancel", label: "Cancel", intent: "secondary" })
ui.button({ id: "delete", label: "Delete", intent: "danger" })
ui.button({ id: "approve", label: "Approve", intent: "success" })
ui.button({ id: "review", label: "Review", intent: "warning" })
ui.button({ id: "docs", label: "Docs", intent: "link" })
```

Internals note: `intent` resolves into recipe-level `dsVariant` and `dsTone`; those fields are internal recipe levers, not the documented app-facing API.

### Elevation Model

| Elevation | Token Family | Typical Use |
|-----------|--------------|-------------|
| 0 | `surface0` / base | Page background |
| 1 | `surface1` / card | Panels, cards, sidebars |
| 2 | `surface2` / dropdown | Menus, popovers |
| 3 | `surface3` / modal | Modals, dialogs, command palette |

Use adjacent elevation levels for nearby layers.

### Theme Switching

UIs must render correctly in all built-in themes without code changes:
- Dark
- Light
- Dimmed
- High-contrast
- Nord
- Dracula

## API Layers (Safest to Lowest-Level)

### Layer 1 — Widget API (Preferred)

```ts
import { createApp, ui } from "@rezi-ui/core";

const view = (state: AppState) =>
  ui.page({
    p: 1,
    gap: 1,
    body: ui.panel("Counter", [
      ui.row({ gap: 1, items: "center" }, [
        ui.text(`Count: ${state.count}`, { variant: "heading" }),
        ui.spacer({ flex: 1 }),
        ui.button({
          id: "inc",
          label: "+1",
          intent: "primary",
          onPress: () => app.update((s) => ({ ...s, count: s.count + 1 })),
        }),
      ]),
    ]),
  });
```

### Layer 2 — Composition API

```ts
import { defineWidget, ui } from "@rezi-ui/core";

const Counter = defineWidget<{ initial: number; key?: string }>((props, ctx) => {
  const [count, setCount] = ctx.useState(props.initial);
  return ui.card("Counter", [
    ui.row({ gap: 1, items: "center" }, [
      ui.text(`Count: ${count}`),
      ui.spacer({ flex: 1 }),
      ui.button({
        id: ctx.id("inc"),
        label: "+1",
        intent: "primary",
        onPress: () => setCount((c) => c + 1),
      }),
    ]),
  ]);
});
```

### Layer 3 — Domain Hooks

```ts
import { useForm, useModalStack, useTable } from "@rezi-ui/core";
```

### Layer 4 — Raw VNode Objects

Use only when authoring low-level internals.

```ts
const node: VNode = { kind: "text", text: "hello", props: {} };
```

### JSX Alternative

`@rezi-ui/jsx` mirrors `ui.*` with equivalent props.

```tsx
import { Button, Page, Panel, Text } from "@rezi-ui/jsx";

const view = (state: AppState) => (
  <Page
    p={1}
    gap={1}
    body={
      <Panel title="Counter">
        <Text variant="heading">Count: {state.count}</Text>
        <Button id="inc" label="+1" intent="primary" />
      </Panel>
    }
  />
);
```

Required TypeScript settings:
- `"jsx": "react-jsx"`
- `"jsxImportSource": "@rezi-ui/jsx"`

## Hooks Reference

All hook signatures below are sourced from:
- `packages/core/src/widgets/composition.ts`
- `packages/core/src/widgets/hooks/animation.ts`
- `packages/core/src/widgets/hooks/utility.ts`
- `packages/core/src/widgets/hooks/data.ts`
- `packages/core/src/widgets/useTable.ts`
- `packages/core/src/widgets/useModalStack.ts`
- `packages/core/src/forms/useForm.ts`

### State & Lifecycle (10)

| Hook | Signature | Returns |
|------|-----------|---------|
| `ctx.useState` | `<T>(initial: T \| (() => T))` | `[T, (v: T \| ((prev: T) => T)) => void]` |
| `ctx.useRef` | `<T>(initial: T)` | `{ current: T }` |
| `ctx.useMemo` | `<T>(factory: () => T, deps?: readonly unknown[])` | `T` |
| `ctx.useCallback` | `<T extends (...args: never[]) => unknown>(callback: T, deps?: readonly unknown[])` | `T` |
| `ctx.useEffect` | `(effect: () => void \| (() => void), deps?: readonly unknown[])` | `void` |
| `ctx.useAppState` | `<T>(selector: (s: State) => T)` | `T` |
| `ctx.useTheme` | `()` | `ColorTokens \| null` |
| `ctx.useViewport` | `?(): ResponsiveViewportSnapshot` | `ResponsiveViewportSnapshot` |
| `ctx.id` | `(suffix: string)` | `string` |
| `ctx.invalidate` | `()` | `void` |

### Animation (7)

| Hook | Signature | Returns |
|------|-----------|---------|
| `useTransition` | `(ctx, value: number, config?: UseTransitionConfig)` | `number` |
| `useSpring` | `(ctx, target: number, config?: UseSpringConfig)` | `number` |
| `useSequence` | `(ctx, keyframes: readonly SequenceKeyframe[], config?: UseSequenceConfig)` | `number` |
| `useStagger` | `<T>(ctx, items: readonly T[], config?: UseStaggerConfig)` | `readonly number[]` |
| `useAnimatedValue` | `(ctx, target: number, config?: UseAnimatedValueConfig)` | `AnimatedValue` |
| `useParallel` | `(ctx, animations: UseParallelConfig)` | `readonly ParallelAnimationEntry[]` |
| `useChain` | `(ctx, steps: UseChainConfig)` | `Readonly<{ value: number; currentStep: number; isComplete: boolean }>` |

### Utility (2)

| Hook | Signature | Returns |
|------|-----------|---------|
| `useDebounce` | `<T>(ctx, value: T, delayMs: number)` | `T` |
| `usePrevious` | `<T>(ctx, value: T)` | `T \| undefined` |

### Data & Streaming (6)

| Hook | Signature | Returns |
|------|-----------|---------|
| `useAsync` | `<T>(ctx, task: () => Promise<T>, deps: readonly unknown[])` | `UseAsyncState<T>` |
| `useStream` | `<T>(ctx, stream: AsyncIterable<T> \| undefined, deps?: readonly unknown[])` | `UseStreamState<T>` |
| `useInterval` | `(ctx, fn: () => void, ms: number)` | `void` |
| `useEventSource` | `<T = string>(ctx, url: string, options?: UseEventSourceOptions<T>)` | `UseEventSourceState<T>` |
| `useWebSocket` | `<T = string>(ctx, url: string, protocol?: string \| readonly string[], options?: UseWebSocketOptions<T>)` | `UseWebSocketState<T>` |
| `useTail` | `<T = string>(ctx, filePath: string, options?: UseTailOptions<T>)` | `UseTailState<T>` |

### Domain (3)

| Hook | Signature | Returns |
|------|-----------|---------|
| `useTable` | `<T, State = void>(ctx: WidgetContext<State>, options: UseTableOptions<T>)` | `UseTableResult<T>` |
| `useModalStack` | `<State = void>(ctx: WidgetContext<State>)` | `UseModalStack` |
| `useForm` | `<T extends Record<string, unknown>, State = void>(ctx: WidgetContext<State>, options: UseFormOptions<T>)` | `UseFormReturn<T>` |

## Widget Quick Reference

Canonical signatures and callbacks below are sourced from `packages/core/src/widgets/types.ts`.

### Interactive Widgets

| Widget | Canonical Signature | Required Props | Primary Callback | DS Props |
|--------|---------------------|----------------|------------------|----------|
| `button` | `ui.button({ id, label, intent?, onPress? })` | `id`, `label` | `onPress?: () => void` | `intent`, `dsSize` (`dsVariant`/`dsTone` internal) |
| `input` | `ui.input({ id, value, onInput?, onBlur? })` | `id`, `value` | `onInput?: (value: string, cursor: number) => void` | `dsSize` |
| `textarea` | `ui.textarea({ id, value, onInput?, onBlur? })` | `id`, `value` | `onInput?: (value: string, cursor: number) => void` | — |
| `link` | `ui.link({ url, label?, onPress? })` | `url` | `onPress?: () => void` | — |
| `select` | `ui.select({ id, value, options, onChange? })` | `id`, `value`, `options` | `onChange?: (value: string) => void` | `dsVariant`, `dsTone`, `dsSize` |
| `slider` | `ui.slider({ id, value, onChange? })` | `id`, `value` | `onChange?: (value: number) => void` | — |
| `checkbox` | `ui.checkbox({ id, checked, onChange? })` | `id`, `checked` | `onChange?: (checked: boolean) => void` | `dsTone`, `dsSize` |
| `radioGroup` | `ui.radioGroup({ id, value, options, onChange? })` | `id`, `value`, `options` | `onChange?: (value: string) => void` | `dsTone`, `dsSize` |
| `tabs` | `ui.tabs({ id, tabs, activeTab, onChange })` | `id`, `tabs`, `activeTab`, `onChange` | `onChange: (key: string) => void` | `dsVariant`, `dsTone`, `dsSize` |
| `accordion` | `ui.accordion({ id, items, expanded, onChange })` | `id`, `items`, `expanded`, `onChange` | `onChange: (expanded: readonly string[]) => void` | `dsVariant`, `dsTone`, `dsSize` |
| `breadcrumb` | `ui.breadcrumb({ items, separator? })` | `items` | `items[].onPress?: () => void` | `dsVariant`, `dsTone`, `dsSize` |
| `pagination` | `ui.pagination({ id, page, totalPages, onChange })` | `id`, `page`, `totalPages`, `onChange` | `onChange: (page: number) => void` | `dsVariant`, `dsTone`, `dsSize` |
| `sidebar` | `ui.sidebar({ items, selected?, onSelect? })` | `items` | `onSelect?: (id: string) => void` | — |
| `table` | `ui.table<T>({ id, columns, data, getRowKey, ... })` | `id`, `columns`, `data`, `getRowKey` | `onSelectionChange?: (keys: readonly string[]) => void` | `dsSize`, `dsTone` |
| `tree` | `ui.tree<T>({ id, data, getKey, expanded, onChange, renderNode, ... })` | `id`, `data`, `getKey`, `expanded`, `onChange`, `renderNode` | `onChange: (node: T, expanded: boolean) => void` | `dsVariant`, `dsTone`, `dsSize` |
| `virtualList` | `ui.virtualList<T>({ id, items, renderItem, ... })` | `id`, `items`, `renderItem` | `onSelect?: (item: T, index: number) => void` | — |
| `dropdown` | `ui.dropdown({ id, anchorId, items, ... })` | `id`, `anchorId`, `items` | `onSelect?: (item: DropdownItem) => void` | `dsVariant`, `dsTone`, `dsSize` |
| `modal` | `ui.modal({ id, content, ... })` | `id`, `content` | `onClose?: () => void` | — |
| `dialog` | `ui.dialog({ id, message, actions, ... })` | `id`, `message`, `actions` | `actions[].onPress: () => void` | action `intent` |
| `commandPalette` | `ui.commandPalette({ id, open, query, sources, selectedIndex, onChange, onSelect, onClose, ... })` | `id`, `open`, `query`, `sources`, `selectedIndex`, `onChange`, `onSelect`, `onClose` | `onChange: (query: string) => void` | — |
| `filePicker` | `ui.filePicker({ id, rootPath, data, expandedPaths, onSelect, onChange, onPress, ... })` | `id`, `rootPath`, `data`, `expandedPaths`, `onSelect`, `onChange`, `onPress` | `onChange: (path: string, expanded: boolean) => void` | — |
| `fileTreeExplorer` | `ui.fileTreeExplorer({ id, data, expanded, onChange, onSelect, onPress, ... })` | `id`, `data`, `expanded`, `onChange`, `onSelect`, `onPress` | `onChange: (node: FileNode, expanded: boolean) => void` | — |
| `splitPane` | `ui.splitPane({ id, direction, sizes, onChange, ... }, children)` | `id`, `direction`, `sizes`, `onChange` | `onChange: (sizes: readonly number[]) => void` | — |
| `codeEditor` | `ui.codeEditor({ id, lines, cursor, selection, scrollTop, scrollLeft, onChange, onSelectionChange, onScroll, ... })` | `id`, `lines`, `cursor`, `selection`, `scrollTop`, `scrollLeft`, `onChange`, `onSelectionChange`, `onScroll` | `onChange: (lines: readonly string[], cursor: CursorPosition) => void` | — |
| `diffViewer` | `ui.diffViewer({ id, diff, mode, scrollTop, onScroll, ... })` | `id`, `diff`, `mode`, `scrollTop`, `onScroll` | `onScroll: (scrollTop: number) => void` | — |
| `toolApprovalDialog` | `ui.toolApprovalDialog({ id, request, open, onPress, onClose, ... })` | `id`, `request`, `open`, `onPress`, `onClose` | `onPress: (action: \"allow\" | \"deny\") => void` | — |
| `logsConsole` | `ui.logsConsole({ id, entries, scrollTop, onScroll, ... })` | `id`, `entries`, `scrollTop`, `onScroll` | `onChange?: (entryId: string, expanded: boolean) => void` | — |
| `toastContainer` | `ui.toastContainer({ toasts, onClose, ... })` | `toasts`, `onClose` | `onClose: (id: string) => void` | — |

### Container Widgets

| Widget | Signature | Key Props |
|--------|-----------|-----------|
| `box` | `ui.box(props, children)` | `p/px/py`, `gap`, `border`, `style`, `overflow`, layout constraints |
| `row` | `ui.row(props, children)` | `gap`, `items`, `justify`, `wrap`, flex constraints |
| `column` | `ui.column(props, children)` | `gap`, `items`, `justify`, `wrap`, flex constraints |
| `grid` | `ui.grid(props, children)` | `columns`, `rows`, `gap`, `rowGap`, `columnGap` |
| `layers` | `ui.layers(children)` | overlay stack order via child order |
| `layer` | `ui.layer({ id, content, ... })` | `id`, `content`, `zIndex`, `modal`, `backdrop`, `onClose` |
| `panel` | `ui.panel(title, children, options?)` | titled bordered section wrapper |
| `form` | `ui.form(children, options?)` | canonical vertical form container |
| `actions` | `ui.actions(children, options?)` | canonical action-row container |
| `center` | `ui.center(child, options?)` | centering wrapper |
| `page` | `ui.page({ body, header?, footer?, p?, gap? })` | root page composition |
| `appShell` | `ui.appShell({ body, header?, sidebar?, footer?, p?, gap? })` | app chrome layout |
| `card` | `ui.card(title?, children, options?)` | elevated content block |
| `toolbar` | `ui.toolbar(children, options?)` | toolbar row composition |
| `statusBar` | `ui.statusBar({ left?, right?, style? })` | footer status composition |

### Display Widgets

| Widget | Signature | Key Props |
|--------|-----------|-----------|
| `text` | `ui.text(content, props?)` | `variant`, `wrap`, `textOverflow`, `style` |
| `spacer` | `ui.spacer({ size?, flex? })` | fixed gap or flex fill |
| `divider` | `ui.divider(props?)` | `direction`, `char`, `label` |
| `icon` | `ui.icon(icon, props?)` | icon id/path, optional fallback |
| `spinner` | `ui.spinner(props?)` | `variant`, `label` |
| `progress` | `ui.progress(value, props?)` | `value`, `width`, `variant`, `showPercent` |
| `skeleton` | `ui.skeleton({ width, height?, ... })` | loading placeholders |
| `richText` | `ui.richText(spans, props?)` | styled span sequences |
| `kbd` | `ui.kbd(keys, props?)` | shortcut rendering |
| `badge` | `ui.badge(text, props?)` | `variant`, semantic labels |
| `status` | `ui.status(status, props?)` | online/offline/away/busy states |
| `tag` | `ui.tag(text, props?)` | label chips, optional removable state |
| `gauge` | `ui.gauge(value, props?)` | compact thresholded value indicator |
| `callout` | `ui.callout(message, props?)` | semantic info/success/warning/error blocks |
| `empty` | `ui.empty({ title, description?, action? })` | empty-state rendering |

### Callback Quick Reference

| Widget | Callback Name | Signature |
|--------|---------------|-----------|
| `button` | `onPress` | `() => void` |
| `input` | `onInput` | `(value: string, cursor: number) => void` |
| `textarea` | `onInput` | `(value: string, cursor: number) => void` |
| `select` | `onChange` | `(value: string) => void` |
| `slider` | `onChange` | `(value: number) => void` |
| `checkbox` | `onChange` | `(checked: boolean) => void` |
| `radioGroup` | `onChange` | `(value: string) => void` |
| `tabs` | `onChange` | `(key: string) => void` |
| `accordion` | `onChange` | `(expanded: readonly string[]) => void` |
| `pagination` | `onChange` | `(page: number) => void` |
| `table` | `onSelectionChange` | `(keys: readonly string[]) => void` |
| `table` | `onSort` | `(column: string, direction: \"asc\" | \"desc\") => void` |
| `tree` | `onChange` | `(node: T, expanded: boolean) => void` |
| `tree` | `onPress` | `(node: T) => void` |
| `commandPalette` | `onChange` | `(query: string) => void` |
| `filePicker` | `onChange` | `(path: string, expanded: boolean) => void` |
| `filePicker` | `onPress` | `(path: string) => void` |
| `fileTreeExplorer` | `onChange` | `(node: FileNode, expanded: boolean) => void` |
| `fileTreeExplorer` | `onPress` | `(node: FileNode) => void` |
| `splitPane` | `onChange` | `(sizes: readonly number[]) => void` |
| `toolApprovalDialog` | `onPress` | `(action: \"allow\" | \"deny\") => void` |
| `logsConsole` | `onChange` | `(entryId: string, expanded: boolean) => void` |
| `logsConsole` | `onPress` | `() => void` |
| `toastContainer` | `onClose` | `(id: string) => void` |

## Conditional and List Rendering

```ts
import { each, eachInline, match, maybe, show, when } from "@rezi-ui/core";

show(isVisible, ui.text("Shown"));
when(loading, () => ui.spinner({}), () => ui.text("Done"));
maybe(user, (u) => ui.text(u.name));

match(mode)
  .case("loading", () => ui.spinner({}))
  .case("ready", () => ui.text("Ready"))
  .default(() => ui.text("Unknown"));

each(items, (item) => ui.text(item.name), { key: (item) => item.id });
eachInline(tags, (tag) => ui.badge(tag));
```

## Code Standards and Guardrails

- Import from package exports only (`@rezi-ui/core`, `@rezi-ui/node`, `@rezi-ui/jsx`).
- Interactive widgets require unique `id` values.
- Hooks must run in consistent order (no conditional hooks).
- Prefer `ui.*` and composition API over direct VNode construction.
- Use `key` for stable list reconciliation.
- State updates during render are invalid.
- Duplicate IDs are fatal.
- Drawlist writers are generated; do not edit `packages/core/src/drawlist/writers.gen.ts` by hand.

## Event System

`UiEvent` action payloads include:
- `press`
- `input`
- `select`
- `rowPress`
- `toggle`
- `change`
- `activate`
- `scroll`

This supports app-level logging/middleware plus per-widget callbacks.

## Layout Measurement

`app.measureElement(id)` returns the computed rect (`{ x, y, w, h }`) for the latest layout pass, or `null` when the widget is not present.

## Drawlist Codegen Protocol (Must for ZRDL Changes)

When changing drawlist command bytes/opcodes/field layout:

1. Update `scripts/drawlist-spec.ts`.
2. Regenerate with `npm run codegen`.
3. Verify with `npm run codegen:check`.
4. Update `packages/core/src/drawlist/__tests__/writers.gen.test.ts`.
5. Update protocol docs:
   - `docs/protocol/zrdl.md`
   - `docs/protocol/versioning.md`

## Patterns

### Do

- Use `ui.*` factories for widget construction.
- Use `defineWidget` for reusable stateful components.
- Use `useTable`, `useModalStack`, `useForm` for domain logic.
- Use `show`, `when`, `maybe`, `match` for conditional rendering.
- Use `each`/`eachInline` for keyed list rendering.
- Use animation hooks instead of ad hoc timers in view code.
- Keep layout tokens and theme tokens semantic.

### Don’t

- Build custom status widgets from manually styled text.
- Nest containers that do not add layout or visual structure.
- Render large lists without `ui.virtualList`.
- Duplicate interactive IDs.
- Construct raw VNodes in feature code.
- Import from private/internal package paths.

## TUI Aesthetics Rulebook

### Layout Rules

- Root views use `ui.page(...)` or `ui.appShell(...)`.
- Keep a minimum outer padding of `p: 1`.
- Group sections with `ui.panel(...)` or `ui.card(...)`.
- Place action rows in `ui.actions(...)`.
- Prefer one clearly dominant CTA per section.

### Spacing Model

Use the shared spacing scale.

| Token | Cells | Use For |
|-------|-------|---------|
| `0` | 0 | Tight packing only |
| `"xs"` | 1 | Minimal internal spacing |
| `"sm"` | 1 | Default sibling gaps |
| `"md"` | 2 | Section separation |
| `"lg"` | 3 | Major section breaks |
| `"xl"` | 4 | Page-level margins |

Guidance:
- `row` and `column` default to `gap: 1`.
- Use `p: 1` for standard card/panel padding.
- Use `px: 1` for horizontal bar/header spacing.

### Visual Hierarchy

- Page titles: `ui.text("Title", { variant: "heading" })`
- Labels/meta text: `ui.text("Label", { variant: "caption" })`
- Code text: `ui.text("npm run build", { variant: "code" })`
- Default body copy: `ui.text("Body content")`

### Status & Indicators

| Need | Widget | Example |
|------|--------|---------|
| Inline status dot | `ui.status(...)` | `ui.status("online")` |
| Labeled status badge | `ui.badge(...)` | `ui.badge("Live", { variant: "success" })` |
| Categorization tag | `ui.tag(...)` | `ui.tag("backend", { variant: "info" })` |
| Inline alert | `ui.callout(...)` | `ui.callout("Disk usage high", { variant: "warning" })` |
| Loading indicator | `ui.spinner(...)` | `ui.spinner({ variant: "dots" })` |
| Progress indicator | `ui.progress(...)` | `ui.progress(0.72)` |

Use semantic widgets directly instead of custom text-based status constructs.

### Form Patterns

```ts
ui.form([
  ui.field({
    label: "Name",
    children: ui.input({
      id: "name",
      value: state.name,
      onInput: (value) => dispatch({ type: "name", value }),
    }),
  }),
  ui.field({
    label: "Email",
    children: ui.input({
      id: "email",
      value: state.email,
      onInput: (value) => dispatch({ type: "email", value }),
    }),
  }),
  ui.actions([
    ui.button({ id: "cancel", label: "Cancel", intent: "secondary" }),
    ui.button({ id: "submit", label: "Submit", intent: "primary" }),
  ]),
]);
```

Rules:
- Wrap inputs with `ui.field`.
- Group related fields with `ui.form`.
- Keep primary submit action visually explicit with `intent: "primary"`.

### Color Usage

- Do not hardcode RGB/hex literals in app widgets.
- Use semantic tokens and recipe-powered variants.
- Use `variant` and `intent` props for semantic coloring.
- Validate screens in all built-in themes.

### Common Layout Patterns

```ts
ui.page({
  p: 1,
  gap: 1,
  header: ui.row({ gap: 1, items: "center" }, [
    ui.text("My App", { variant: "heading" }),
    ui.badge("v1.0", { variant: "info" }),
    ui.spacer({ flex: 1 }),
    ui.button({ id: "settings", label: "Settings", intent: "link" }),
  ]),
  body: ui.column({ gap: 2 }, [
    ui.panel("Profile", [ui.text("Content")]),
    ui.panel("Contact", [
      ui.form([
        ui.field({
          label: "Email",
          children: ui.input({ id: "email", value: state.email, onInput: onEmailInput }),
        }),
      ]),
    ]),
  ]),
  footer: ui.actions([
    ui.button({ id: "cancel", label: "Cancel", intent: "secondary" }),
    ui.button({ id: "save", label: "Save", intent: "primary" }),
  ]),
});
```

```ts
ui.appShell({
  header: ui.row({ gap: 1, items: "center" }, [
    ui.text("Dashboard", { variant: "heading" }),
    ui.badge("Live", { variant: "success" }),
  ]),
  sidebar: {
    width: 22,
    content: ui.sidebar({
      items: [
        { id: "overview", label: "Overview" },
        { id: "users", label: "Users" },
        { id: "settings", label: "Settings" },
      ],
      selected: state.page,
      onSelect: (id) => dispatch({ type: "page", id }),
    }),
  },
  body: renderBody(state),
  footer: ui.statusBar({
    left: [ui.status("online"), ui.text("Connected")],
    right: [ui.text("v1.0.0")],
  }),
});
```

```ts
ui.box({ border: "rounded", p: 1, gap: 1 }, [
  ui.text("Users", { variant: "heading" }),
  ui.table({
    id: "users-table",
    columns: [
      { key: "name", header: "Name", flex: 2 },
      { key: "role", header: "Role", flex: 1 },
      { key: "status", header: "Status", width: 10 },
    ],
    data: state.users,
    getRowKey: (row) => row.id,
    onRowPress: (row) => openUser(row.id),
  }),
]);
```

### Anti-Patterns

- Rooting screens at `ui.column` instead of `ui.page`/`ui.appShell`.
- Manually styling every control with explicit colors.
- Setting `gap: 0` globally.
- Sprinkling standalone buttons instead of `ui.actions` rows.
- Overusing nested bordered containers.
- Replacing semantic status widgets with custom text/color fragments.
- Rendering large data sets without virtualization.

## Accessibility

### Focus Order

- Every interactive widget must define `id`.
- Tab order follows tree order (depth-first preorder).
- Use `ui.focusZone` for custom local navigation.
- Use `ui.focusTrap` in modal contexts.

### Screen Reader Support

- Use `accessibleLabel` when visual labels are ambiguous.
- Use `ui.focusAnnouncer` for dynamic focus context.
- Prefer semantic variants/intents over manual style-only distinctions.

### Keyboard Navigation

- Every action must be keyboard reachable.
- Modal overlays must support close with Escape.
- Menus/dropdowns must support arrow navigation.
- Command discovery should be exposed through `ui.commandPalette` where applicable.

## Quick Decision Trees

### Layout

```text
Need to size a widget?
  ├─ Exact cells known? -> set width/height directly (e.g., width: 20)
  ├─ Share remaining space with siblings? -> use flex
  ├─ Two-dimensional arrangement? -> use ui.grid(...)
  └─ Long/large scrolling collection? -> use ui.virtualList(...)
```

### Visibility and Rendering Flow

```text
Need conditional content?
  ├─ Simple boolean branch -> show(...)
  ├─ if/else branch -> when(...)
  ├─ optional value branch -> maybe(...)
  └─ multi-state branch -> match(...)
```

### Spacing

```text
Need spacing?
  ├─ Between sibling items -> gap on row/column (default: 1)
  ├─ Inside a container -> padding (usually p: 1)
  └─ Between major sections -> gap: 2 or divider
```

## Testing

```ts
import { createTestRenderer } from "@rezi-ui/core";

const renderer = createTestRenderer({ viewport: { cols: 80, rows: 24 } });
const result = renderer.render(view(state));

result.findById("save");
result.findText("Settings");
result.findAll("button");
result.toText();
```

Run all tests:

```bash
node scripts/run-tests.mjs
```

For UI regressions, run live PTY validation and frame audit:
- `docs/dev/live-pty-debugging.md`

### What to Test

| Aspect | How |
|--------|-----|
| Visual output | Snapshot assertions via `toText()` / `toAnsi()` |
| Layout correctness | Assert `findById(...).rect` values |
| Interaction | Trigger key/mouse events and assert state/UI |
| Responsive behavior | Validate at multiple viewport sizes |
| Focus traversal | Assert focused ID movement across Tab/Shift+Tab |
| List performance | Verify `virtualList` behavior for large collections |

## Skills (Repeatable Recipes)

Project-level skills are mirrored for Claude and Codex.

| Skill | Claude Path | Codex Path |
|------|-------------|------------|
| Add Widget | `.claude/skills/rezi-add-widget/` | `.codex/skills/rezi-add-widget/` |
| Create Screen | `.claude/skills/rezi-create-screen/` | `.codex/skills/rezi-create-screen/` |
| Keybindings | `.claude/skills/rezi-keybindings/` | `.codex/skills/rezi-keybindings/` |
| Data Table | `.claude/skills/rezi-data-table/` | `.codex/skills/rezi-data-table/` |
| Modal Dialogs | `.claude/skills/rezi-modal-dialogs/` | `.codex/skills/rezi-modal-dialogs/` |
| Forms | `.claude/skills/rezi-forms/` | `.codex/skills/rezi-forms/` |
| Write Tests | `.claude/skills/rezi-write-tests/` | `.codex/skills/rezi-write-tests/` |
| Debug Rendering | `.claude/skills/rezi-debug-rendering/` | `.codex/skills/rezi-debug-rendering/` |
| Perf Profiling | `.claude/skills/rezi-perf-profiling/` | `.codex/skills/rezi-perf-profiling/` |
| Routing | `.claude/skills/rezi-routing/` | `.codex/skills/rezi-routing/` |

## Performance Notes

- Prefer `ui.virtualList` for collections above 50 items.
- Avoid rendering hundreds of static rows as plain `ui.text` nodes.
- Stability signatures skip relayout for unchanged subtrees.
- Preserve stable object identity for expensive static subtrees via memoization.
- Use `ctx.useMemo` and `ctx.useCallback` to reduce avoidable recompute/churn.
- Profile with `REZI_PERF=1 REZI_PERF_DETAIL=1`.
