# INK_COMPAT_PLAN

## Scope
Finish `@rezi-ui/ink-compat` toward near drop-in Ink parity for missing APIs/behaviors needed by downstream apps.

## Gaps Identified
1. Missing API exports: `getBoundingBox`, `getScrollHeight`, `ResizeObserver`.
2. `measureElement` used props fallback, not committed layout.
3. No layout-change observer plumbing across rerenders/unmount.
4. Render options parity gaps: `onRender`, `isScreenReaderEnabled`, `alternateBuffer`, `incrementalRendering`.
5. `useStdin` raw-mode semantics were always no-op/unsupported.
6. No explicit smoke coverage for `ink-spinner`/`ink-gradient` usage patterns.

## Design
1. Core->compat layout bridge (minimal internal plumbing)
- Add internal `createApp` callbacks:
  - `internal_onRender(metrics)` for per-frame render timing.
  - `internal_onLayout(snapshot)` for committed widget `id -> rect` map.
- Expose `WidgetRenderer.getRectByIdIndex()` to provide latest committed layout index.

2. Host measurement model in ink-compat
- Add stable internal IDs on host elements in reconciler.
- Propagate IDs into converted Rezi VNodes (on the outer measurable box node).
- Maintain per-element committed layout metadata (`internal_layout`, `internal_scrollState`, size cache).
- Replace props-only measurement path with committed-layout reads.

3. Resize observer semantics
- Add Ink-shaped `ResizeObserver`/`ResizeObserverEntry`.
- Support `observe`, `unobserve`, `disconnect`.
- Immediate callback on `observe()` when size is already known.
- Batch observer notifications after each committed layout snapshot.

4. Render/useStdin parity
- Extend render options surface with Ink-like fields.
- Wire `onRender` callback to render timing from core submit pipeline.
- Add best-effort alternate buffer enter/exit sequences.
- Add screen-reader context + `useIsScreenReaderEnabled` hook.
- Implement meaningful `isRawModeSupported` and ref-counted `setRawMode`.
- Respect backend ownership model (avoid toggling `process.stdin` raw mode when backend owns it).

## Sequence
1. Core internal callback plumbing.
2. Reconciler host metadata + ID propagation.
3. Measurement/scroll API implementation.
4. Resize observer implementation.
5. Render options + stdin raw-mode parity.
6. API/tests hardening (including spinner/gradient pattern smoke tests).
7. Document deviations and Gemini integration next step.

## Risks
1. Ink scroll semantics are richer than current Rezi layout clipping behavior.
2. Alternate buffer behavior is best-effort because node backend stdio routing is backend-owned.
3. Raw-mode parity is constrained by backend ownership and non-plumbed custom stdin event path.
4. Observer ordering is close to Ink but not Yoga-identical for all edge cases.
