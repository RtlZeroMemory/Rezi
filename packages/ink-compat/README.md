# @rezi-ui/ink-compat

`@rezi-ui/ink-compat` is an Ink API compatibility layer powered by Rezi.

It preserves the Ink component and hook model while rendering through Rezi's engine.

## Install

```bash
npm install @rezi-ui/ink-compat
```

## Use

Swap imports:

```ts
// Before
import { render, Box, Text } from "ink";

// After
import { render, Box, Text } from "@rezi-ui/ink-compat";
```

For ecosystems that pin `ink` directly, use package manager overrides/resolutions to redirect `ink` to `@rezi-ui/ink-compat` and companion shims (`ink-gradient`, `ink-spinner`).

## Supported surface

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
- `ResizeObserver`
- `getBoundingBox`
- `getInnerHeight`
- `getScrollHeight`

Keyboard utilities:

- `kittyFlags`
- `kittyModifiers`

Testing utilities:

- `@rezi-ui/ink-compat/testing`

## Render options

`render(element, options)` supports:

- `stdout`, `stdin`, `stderr`
- `exitOnCtrlC`
- `patchConsole`
- `debug`
- `maxFps`
- `concurrent`
- `kittyKeyboard`
- `isScreenReaderEnabled`
- `onRender`
- `alternateBuffer`
- `incrementalRendering`

## Diagnostics

Trace output is environment-gated:

- `INK_COMPAT_TRACE=1`
- `INK_COMPAT_TRACE_FILE=/path/log`
- `INK_COMPAT_TRACE_DETAIL=1`
- `INK_COMPAT_TRACE_DETAIL_FULL=1`
- `INK_GRADIENT_TRACE=1`

Reference docs:

- `docs/architecture/ink-compat.md`
- `docs/dev/ink-compat-debugging.md`

## Known boundaries

- Minor visual differences can occur across terminal emulators and OS TTY behavior.
- App-version and install-mode messaging differences are expected and not renderer bugs.
- Gradient interpolation can differ slightly from upstream while preserving overall behavior.
