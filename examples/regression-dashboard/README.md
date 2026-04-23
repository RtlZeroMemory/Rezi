# Regression Dashboard Validation Surface

Dashboard-based validation surface for manually checking rendering, focus, routing, and live-update behavior after core refactors.

This app is not intended as a beginner example or starter architecture guide. Use `npm create rezi`, `examples/hello-counter`, or `examples/gallery` to learn the framework; use `examples/regression-dashboard` when you need a repeatable regression target.

## Run (from repo root)

```bash
npm --prefix examples/regression-dashboard run start
```

Interactive mode requires a real TTY terminal.

## Run with HSR

```bash
npm --prefix examples/regression-dashboard run dev
```

## Headless Preview (non-TTY safe)

```bash
npm --prefix examples/regression-dashboard run preview
```

## Build / Typecheck / Test

```bash
npm --prefix examples/regression-dashboard run build
npm --prefix examples/regression-dashboard run typecheck
npm --prefix examples/regression-dashboard run test
```

## Validation checklist

- Scroll service lanes with wheel/keys and verify no visual tearing.
- Change filters/theme while telemetry ticks are active.
- Open/close help modal repeatedly.
- Verify focus/selection remains stable during rapid updates.

## Controls

- `up` / `down` or `j` / `k`: Move selection
- `f`: Cycle fleet filter
- `t`: Cycle theme
- `p` or `space`: Pause/resume telemetry stream
- `h` or `?`: Toggle help modal
- `q` or `ctrl+c`: Quit
