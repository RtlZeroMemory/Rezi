# INK_COMPAT_REPORT

## Implemented

### 1) Export/API surface parity (G1)
- Added and exported:
  - `getBoundingBox`
  - `getScrollHeight` (plus `getScrollWidth` helper)
  - `ResizeObserver`
  - `ResizeObserverEntry`
- Added `useIsScreenReaderEnabled` export to support Ink-like screen-reader option usage.

### 2) Real measurement pipeline (G2)
- Replaced props-only `measureElement` fallback with committed layout metadata.
- Added host-element internal layout state fed from current committed layout (`id -> rect`) after each frame.
- `measureElement` and `getBoundingBox` now read committed geometry.

### 3) Observer + layout notifications (G3)
- Implemented Ink-shaped resize observer behavior:
  - `observe`/`unobserve`/`disconnect`
  - immediate callback on `observe` when size exists
  - batched callbacks on committed size changes
  - stable behavior across rerenders/unmounted subtree removal

### 4) Render option parity (G4)
- Extended `RenderOptions` with Ink-like fields:
  - `onRender`
  - `isScreenReaderEnabled`
  - `alternateBuffer`
  - `alternateBufferAlreadyActive`
  - `incrementalRendering`
- Implemented behavior:
  - `onRender`: wired to core per-frame render timing callback.
  - `isScreenReaderEnabled`: plumbed via context + `useIsScreenReaderEnabled`.
  - `alternateBuffer`: best-effort ANSI enter/exit handling.
  - `incrementalRendering`: accepted and typed; currently no backend-level incremental diffing.

### 5) Stdin/raw-mode behavior (G5)
- `useStdin` now exposes meaningful `isRawModeSupported` (TTY + `setRawMode` capability).
- `setRawMode` now:
  - throws on unsupported stdin (Ink-like behavior)
  - reference-counts enable/disable calls
  - avoids toggling raw mode on `process.stdin` when backend ownership applies

### 6) ink-spinner / ink-gradient compatibility (G6)
- Verified against package surfaces (`ink-spinner@5.0.0`, `ink-gradient@3.0.0`) and added smoke coverage for their runtime patterns:
  - spinner-style interval state updates with `<Text>`
  - gradient-style `<Transform transform={...}>` text transformation
- No third-party package patches were required.

### 7) Testing hardening (G7)
Added tests for:
- API presence/types
- committed measurement + bounding box updates
- resize observer semantics
- scroll metric behavior from committed layout
- render option hooks/alternate buffer/onRender
- raw-mode support and behavior
- spinner/gradient usage-pattern smoke tests

## Core/runtime plumbing added
- `packages/core/src/index.ts`
  - added internal app callback types on `AppConfig` (`internal_onRender`, `internal_onLayout`)
- `packages/core/src/app/createApp.ts`
  - emits internal render metrics/layout snapshots
- `packages/core/src/app/widgetRenderer.ts`
  - exposes latest committed `id -> rect` map

## Remaining deviations from Ink
1. `incrementalRendering` is currently type/surface-compatible only (no true terminal diff pipeline).
2. `alternateBuffer` is best-effort and depends on backend/stdio ownership constraints.
3. Scroll metrics are based on current Rezi committed layout behavior; Yoga-specific scroll edge semantics may differ.
4. Raw-mode behavior intentionally preserves backend ownership for `process.stdin`, so exact Ink internals differ in that path.

## Validation
Executed successfully:
- `npm run build`
- `npm run typecheck`
- `npm run test`

## Recommended next step for Gemini integration
1. In Gemini, alias/import `ink` usage to `@rezi-ui/ink-compat` in one vertical slice (including one spinner/gradient view), then run its e2e rendering flow and catalog only remaining app-level incompatibilities.
