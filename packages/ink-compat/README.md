# @rezi-ui/ink-compat

`@rezi-ui/ink-compat` is an Ink API compatibility layer powered by Rezi.

It keeps the Ink component/hook model, but replaces Ink's renderer backend with
Rezi's deterministic layout + draw pipeline.

## Why use it

- Keep existing Ink app code and mental model.
- Migrate incrementally (explicit import swap or package aliasing).
- Get deterministic, env-gated diagnostics for parity and performance triage.

## Install

```bash
npm install @rezi-ui/ink-compat
```

If your app uses `ink-gradient` or `ink-spinner`, install matching shims:

```bash
npm install ink-gradient-shim ink-spinner-shim
```

## Migration options

### Option A: explicit import swap

```ts
// Before
import { render, Box, Text } from "ink";

// After
import { render, Box, Text } from "@rezi-ui/ink-compat";
```

### Option B: no-source-change package aliasing

Keep `import "ink"` in app code and alias dependencies:

```bash
npm install \
  ink@npm:@rezi-ui/ink-compat@latest \
  ink-gradient@npm:ink-gradient-shim@latest \
  ink-spinner@npm:ink-spinner-shim@latest
```

Equivalent with `pnpm`:

```bash
pnpm add \
  ink@npm:@rezi-ui/ink-compat@latest \
  ink-gradient@npm:ink-gradient-shim@latest \
  ink-spinner@npm:ink-spinner-shim@latest
```

Equivalent with `yarn`:

```bash
yarn add \
  ink@npm:@rezi-ui/ink-compat@latest \
  ink-gradient@npm:ink-gradient-shim@latest \
  ink-spinner@npm:ink-spinner-shim@latest
```

## Verify wiring (avoid silent fallback to real Ink)

Run this in the app root:

```bash
node -e "const p=require('ink/package.json'); if(p.name!=='@rezi-ui/ink-compat') throw new Error('ink resolves to '+p.name); console.log('ink-compat active:', p.version);"
```

And confirm resolved path:

```bash
node -e "const fs=require('node:fs'); const path=require('node:path'); const pkg=require.resolve('ink/package.json'); console.log(fs.realpathSync(path.dirname(pkg)));"
```

## How it works

At runtime, ink-compat runs this pipeline:

1. React reconciles to an `InkHostNode` tree (compat host config).
2. Translation maps Ink props/components to Rezi VNodes.
3. Rezi layout + render generate draw ops, then ANSI output is serialized to terminal streams.

Key behavior:

- `<Static>` is handled as a dedicated scrollback-oriented channel.
- Input/focus/cursor are bridged through compat context/hooks.
- Diagnostics and heavy instrumentation are env-gated.

For full architecture details, see `docs/architecture/ink-compat.md`.

## Supported API surface

### Components

- `Box`
- `Text`
- `Newline`
- `Spacer`
- `Static`
- `Transform`

### Hooks

- `useApp`
- `useInput`
- `useFocus`
- `useFocusManager`
- `useStdin`
- `useStdout`
- `useStderr`
- `useIsScreenReaderEnabled`
- `useCursor`

### Runtime APIs

- `render`
- `renderToString`
- `measureElement`
- `ResizeObserver`
- `getBoundingBox`
- `getInnerHeight`
- `getScrollHeight`

### Keyboard helpers

- `kittyFlags`
- `kittyModifiers`

### Testing entrypoint

- `@rezi-ui/ink-compat/testing`

## `render(element, options)` options

- `stdout`, `stdin`, `stderr`
- `exitOnCtrlC`
- `patchConsole`
- `debug`
- `maxFps`
- `concurrent` (compatibility flag; not an upstream-concurrency semantic toggle)
- `kittyKeyboard`
- `isScreenReaderEnabled`
- `onRender`
- `alternateBuffer`
- `incrementalRendering`

## Diagnostics

Trace output is env-gated:

- `INK_COMPAT_TRACE=1`
- `INK_COMPAT_TRACE_FILE=/path/log`
- `INK_COMPAT_TRACE_STDERR=1`
- `INK_COMPAT_TRACE_DETAIL=1`
- `INK_COMPAT_TRACE_DETAIL_FULL=1`
- `INK_COMPAT_TRACE_ALL_FRAMES=1`
- `INK_COMPAT_TRACE_IO=1`
- `INK_COMPAT_TRACE_RESIZE_VERBOSE=1`
- `INK_GRADIENT_TRACE=1`

Debugging runbook:

- `docs/dev/ink-compat-debugging.md`

## Known boundaries

- Minor visual differences can occur across terminal emulators / OS TTY behavior.
- App/version-specific messaging differences are expected and are not renderer bugs.
- Gradient interpolation can differ slightly while preserving overall behavior.

## Documentation

- Architecture and internals: `docs/architecture/ink-compat.md`
- Debugging and parity runbook: `docs/dev/ink-compat-debugging.md`
