# Ink Compatibility Layer

`@rezi-ui/ink-compat` is Rezi's Ink API compatibility package. It allows Ink applications to run on Rezi's renderer with minimal application changes (typically import/package overrides only).

## Goals

- Preserve Ink's developer surface for common CLI apps.
- Match Ink rendering behavior closely enough for real-world apps (including Gemini CLI startup and interaction flows).
- Provide deterministic diagnostics so parity issues can be debugged from traces, not guesswork.

## Non-goals

- Byte-for-byte reproduction of Ink internals.
- Support for every undocumented Ink edge case.
- Long-term dependency on app-specific behavior hacks.

## Package topology

```
packages/ink-compat/
  src/
    components/      // Ink-compatible component wrappers
    hooks/           // Ink-compatible hooks
    reconciler/      // React reconciler host config + host node tree
    runtime/         // render(), renderToString(), bridge, context
    translation/     // Ink props -> Rezi VNode props
    testing/         // ink-testing-library-compatible helpers
```

Related shims:

- `packages/ink-gradient-shim` (`ink-gradient` replacement)
- `packages/ink-spinner-shim` (`ink-spinner` replacement)

## Runtime architecture

Render flow:

1. React renders into the compat reconciler host tree (`InkHostNode`).
2. `translation/propsToVNode.ts` converts that host tree into Rezi VNodes.
3. `runtime/render.ts` renders VNodes through Rezi test renderer.
4. Render ops are converted to ANSI output and written to stdout/stderr.

This keeps React semantics (state/effects/context/suspense) while replacing Ink's rendering backend.

## Public compatibility surface

Current exports (from `src/index.ts`):

Components:

- `Box`
- `Text`
- `Newline`
- `Spacer`
- `Static`
- `Transform`

Hooks:

- `useApp`
- `useInput`
- `useFocus`
- `useFocusManager`
- `useStdin`
- `useStdout`
- `useStderr`
- `useIsScreenReaderEnabled`
- `useCursor`

Runtime APIs:

- `render`
- `renderToString`
- `measureElement`
- `ResizeObserver` (compat export)
- `getBoundingBox`
- `getInnerHeight`
- `getScrollHeight`

Keyboard utilities:

- `kittyFlags`
- `kittyModifiers`

Testing entrypoint:

- `@rezi-ui/ink-compat/testing`

## Key behavior mappings

### Layout and sizing

- Flex props are translated from Ink-style props into Rezi equivalents.
- Root viewport coercion keeps footer/input anchoring stable in non-alternate-buffer mode.
- Static output is rendered in a dedicated channel so scrollback behavior matches Ink expectations.
- Dynamic grid sizing uses computed layout bounds (`maxRectBottom`) to avoid overpainting blank rows.
- Percent-based dimensions use a resolved viewport pass, then a second render pass when required.

### Overflow and scroll behavior

- Host-tree and translated VNode overflow settings are tracked in traces.
- Root `overflow`/scroll context is preserved to avoid full-screen collapse/overflow drift.
- Render-op overflow snapshots can be emitted to detect writes outside the current viewport.

### Color and gradient behavior

- Color parsing supports named colors, hex, and RGB inputs.
- Truecolor ANSI is retained when pre-styled ANSI spans are present.
- `ink-gradient` is shimmed with deterministic multiline gradient ANSI output.
- Gradient shim traces can be enabled to verify shim selection and emitted ANSI.

### Input/focus/cursor

- `useInput` and bridge parsing support standard key sequences and kitty keyboard mode.
- `useFocus`/`useFocusManager` maintain focus semantics through compat context.
- `useCursor` forwards cursor position/visibility updates into runtime cursor control.

## Diagnostics and trace model

Compat tracing is explicitly environment-gated. Nothing writes to hardcoded temp files.

Core env flags:

- `INK_COMPAT_TRACE=1`: enable frame-level trace stream.
- `INK_COMPAT_TRACE_FILE=/path/file.log`: append traces to file.
- `INK_COMPAT_TRACE_STDERR=1`: also write traces to stderr.
- `INK_COMPAT_TRACE_DETAIL=1`: include node/op snapshots.
- `INK_COMPAT_TRACE_DETAIL_FULL=1`: include full VNode tree and grid snapshots.
- `INK_COMPAT_TRACE_ALL_FRAMES=1`: disable frame sampling.
- `INK_COMPAT_TRACE_IO=1`: include stdout write flow diagnostics.
- `INK_COMPAT_TRACE_RESIZE_VERBOSE=1`: include detailed resize event timeline.
- `INK_COMPAT_TRACE_POLL_EVERY=<n>`: frame poll interval for sampled traces.
- `INK_COMPAT_TRACE_JSON_MAX_DEPTH=<n>`: trace JSON truncation depth.
- `INK_COMPAT_TRACE_JSON_ARRAY_LIMIT=<n>`: max array size in JSON snapshots.
- `INK_COMPAT_TRACE_JSON_OBJECT_LIMIT=<n>`: max object keys in JSON snapshots.
- `INK_COMPAT_VIEWPORT_POLL_MS=<n>`: viewport polling cadence.
- `INK_COMPAT_IDLE_REPAINT_MS=<n>`: idle repaint cadence.
- `INK_GRADIENT_TRACE=1`: gradient shim trace output.

Primary frame signals include:

- `layoutViewport` vs `gridViewport`
- `staticRowsUsed/full/pending`
- `maxBottom`, `zeroH`, `hostRootOverflow`
- `opViewportOverflowCount`

These are sufficient to debug the two main parity classes seen during Gemini testing:

- vertical overflow/anchoring drift
- color/gradient shim mismatches

## Testing and verification

Primary package checks:

```bash
npm run -w packages/ink-compat build
npm run -w packages/ink-compat test
```

Recommended parity validation loop:

1. Run the target Ink app with compat enabled.
2. Capture a trace log with `INK_COMPAT_TRACE_FILE`.
3. Compare structure first (anchoring, viewport usage, static rows).
4. Compare color next (truecolor negotiation and gradient traces).

## Known compatibility boundaries

- Version-specific product messaging (for example update banners) can differ by app version or install mode and is not a renderer bug.
- Exact per-character color interpolation may differ slightly from upstream implementations while preserving overall gradient behavior.
- Terminal- or OS-specific TTY behavior can still produce small differences outside renderer control.

## Maintainer notes

When fixing parity issues, prefer this order:

1. Reproduce with trace flags enabled.
2. Confirm whether drift starts in translation, layout, or ANSI serialization.
3. Add focused regression tests in `packages/ink-compat/src/__tests__`.
4. Keep diagnostics env-gated and deterministic.
