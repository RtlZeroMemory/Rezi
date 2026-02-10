# Migrating from Ink

Rezi includes `@rezi-ui/ink-compat`, a drop-in compatibility layer that lets you run existing Ink applications on Rezi's native rendering engine with minimal code changes.

## Why migrate?

| | Ink | Rezi (via ink-compat) | Rezi (native) |
|---|---|---|---|
| Render speed | ~17ms/frame | ~0.06ms/frame | ~0.025ms/frame |
| Throughput | 60 ops/s | 17,000 ops/s | 38,900 ops/s |
| Memory (1000 items) | 360MB RSS | 251MB RSS | 188MB RSS |
| Architecture | React + Yoga + ANSI | React + Rezi VNodes | createApp → diff → drawlist |
| Bundle | ink + yoga-wasm | react + @rezi-ui/* | @rezi-ui/core + @rezi-ui/node |

## Quick start

1. Install:
   ```bash
   npm install @rezi-ui/ink-compat @rezi-ui/core @rezi-ui/node react
   ```

2. Change your imports:
   ```diff
   - import { render, Box, Text, useInput, useApp } from "ink";
   + import { render, Box, Text, useInput, useApp } from "@rezi-ui/ink-compat";
   ```

3. That's it. Your app now runs on Rezi.

## Supported components

All standard Ink components are supported:

| Component | Status | Notes |
|-----------|--------|-------|
| `<Box>` | Supported | All flex props, borders, padding, margin, gap |
| `<Text>` | Supported | All style props (bold, dim, italic, color, etc.) |
| `<Spacer>` | Supported | |
| `<Newline>` | Supported | Emulated via column layout |
| `<Transform>` | Supported | Text transformation |
| `<Static>` | Supported | Static output items |

## Supported hooks

| Hook | Status | Notes |
|------|--------|-------|
| `useInput()` | Supported | Full key mapping including arrows, modifiers, special keys |
| `useApp()` | Supported | `exit()` with optional error |
| `useFocus()` | Supported | `isFocused`, `focus()`, `autoFocus`, `id` |
| `useFocusManager()` | Supported | `focusNext()`, `focusPrevious()`, `focus()`, `enableFocus()`, `disableFocus()` |
| `useStdin()` | Supported | |
| `useStdout()` | Supported | |
| `useStderr()` | Supported | |

## render() options

```typescript
const instance = render(element, {
  stdout: process.stdout,
  stdin: process.stdin,
  stderr: process.stderr,
  exitOnCtrlC: true,       // default
  patchConsole: true,       // default — captures console.log into app view
  debug: false,             // default
});

instance.rerender(newElement);
instance.unmount();
instance.clear();
await instance.waitUntilExit();
```

## Known differences

- **Rendering engine**: Ink uses Yoga for layout + ANSI escape codes. Rezi uses its own layout engine + the Zireael C engine for terminal output. Visual output may differ slightly in edge cases.
- **`<Newline>`**: Emulated via column layout splitting (Ink uses literal `\n`).
- **Console patching**: Best-effort capture. In test environments (`--test` flag), console patching is automatically disabled.
- **Throttling**: Ink throttles renders at 32ms. Rezi renders on every state change (up to the FPS cap, default 60).

## Gradual migration to native API

Once your app is running on ink-compat, you can gradually migrate components to the native Rezi API for maximum performance:

```typescript
// Before (ink-compat React):
import { Box, Text } from "@rezi-ui/ink-compat";
const MyComponent = () => <Box><Text bold>Hello</Text></Box>;

// After (native Rezi):
import { ui } from "@rezi-ui/core";
const myWidget = ui.box({}, [ui.text("Hello", { style: { bold: true } })]);
```
