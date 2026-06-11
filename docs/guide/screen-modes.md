# Screen Modes

Rezi apps can present in two terminal screen modes, selected at app creation:

| Mode | Surface | Fits |
| --- | --- | --- |
| `"alt"` (default) | Full-screen on the alternate screen buffer | Dashboards, editors, full-screen TUIs |
| `"inline"` | A bounded region on the primary screen | Status UIs, progress displays, REPLs, agent-style CLIs |

In **alt mode** the app owns the whole terminal and the prior screen is
restored on exit — the classic full-screen TUI experience.

In **inline mode** the app renders a region of `inlineRows` rows at the
current scroll position, the way tools like Ink-based CLIs present:

- Terminal **scrollback stays visible above the region** while the app runs.
- The region scrolls naturally with the session as it claims rows.
- On exit, the **final frame remains in scrollback** and the shell prompt is
  restored on a fresh line below it.
- Repaints use relative cursor motion only — the engine never clears the
  screen or addresses absolute rows, so content above the app is never
  touched.

## Enabling inline mode

```ts
import { createNodeApp } from "@rezi-ui/node";

const app = createNodeApp({
  initialState: {},
  config: {
    screen: { mode: "inline", inlineRows: 9 },
  },
});
```

`screen.inlineRows` (1..1024) is required in inline mode and rejected in alt
mode. The effective viewport is clamped to the live terminal height and
re-clamped on terminal resize.

See [`examples/inline-status`](https://github.com/RtlZeroMemory/Rezi/tree/main/examples/inline-status)
for a complete runnable app (spinner + progress bar + quit keys).

## Layout and sizing

The app's layout viewport in inline mode is `terminal columns x inlineRows`;
resize events report that viewport, so layout, wrapping, and responsive
breakpoints work unchanged.

Size `inlineRows` to your content's height. Remember that container chrome
consumes rows: `ui.panel(...)` adds two border rows plus padding, and stack
gaps add one row per gap. The `examples/inline-status` panel (one status row,
a progress bar, and a caption) needs 9 rows.

## Behavior notes

- **Capability fallback**: protocol images (kitty / sixel / iTerm2) require
  absolute screen coordinates, so inline mode renders `ui.image(...)` through
  the sub-cell blitter path instead. `ui.canvas(...)` blitters are unaffected.
  Backend capability snapshots reflect this (`supportsScrollRegion` and image
  protocol support read as unavailable).
- **Terminal resize**: the engine re-anchors and repaints the region. As with
  every inline-style CLI, the terminal's own reflow of *pre-resize scrollback*
  can leave artifacts above the region; the app's region itself repaints
  cleanly.
- **Exiting**: prefer the repo's standard pattern of `await app.run()`
  followed by `process.exit(0)` when the app holds timers or other live
  handles (see `examples/gallery`).

## Naming note: `screen.mode` vs `executionMode`

These are independent options that compose freely:

- `screen.mode: "alt" | "inline"` — what the app looks like in the terminal
  (this page).
- `executionMode: "auto" | "worker" | "inline"` — where the native engine
  runs (worker thread vs main thread); see
  [Worker model](../backend/worker-model.md).

An inline-screen app can run on the worker path, and a full-screen app can
run on the inline execution path.

## Under the hood

Inline mode is implemented by the Zireael engine (v1.4.0+, engine ABI 1.3.0)
as a first-class screen mode: relative-motion emission (CR/CUU/CUD/CHA), LF
row claims that scroll the region as one unit, and a scrollback-safe erase
baseline. The Node backend forwards `screen` as native config keys
(`plat.screenMode`, `inlineRows`); raw `nativeConfig` passthrough of those
keys is also accepted, with the high-level `screen` option taking precedence.
