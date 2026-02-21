# __APP_NAME__

Scaffolded with `npm create rezi` using the **__TEMPLATE_LABEL__** template.

## What This Template Is

This is a **visual benchmark scene**, not a dashboard simulator.

The UI is split into:

- `DIAGNOSTICS / BENCHMARKS`: measured runtime metrics + deterministic sim metrics
- `DEMO`: three side-by-side visual stress lanes
- `EVENTS`: rolling benchmark telemetry log

## Demo Lanes

1. `Shapes / Geometry Lane`
Renders dense geometric fields (rings, waves, grids, glyph shading).

2. `Text / File Activity Lane`
Renders stream-like command typing, file churn, and smooth throughput bars.

3. `Matrix Lane`
Renders variable-speed matrix rain with fading tails and spark noise.

Lane resolution scales from terminal size so larger terminals render richer detail.

## Metric Integrity

`SIM` metrics are deterministic and repeatable:

- `sim-draw` ops/s
- color/text/motion churn scorecard

They are derived from phase intensity, lane resolution, current tick, turbo/write-flood state.

`REAL` metrics are measured from the running Node/Rezi process:

- process CPU (`cpu(proc)`)
- RSS / heap
- update/view/render timings
- event-loop lag
- backend `event_poll` p95
- sink write throughput
- memory ballast pressure

No random external input or external host telemetry is used.

## Phase Escalation

| Phase | Name      | Hz | Duration | Intensity |
|------|-----------|----|----------|-----------|
| 1    | Boot      | 2  | 10s      | 18%       |
| 2    | Build     | 4  | 12s      | 34%       |
| 3    | Load      | 8  | 16s      | 56%       |
| 4    | Surge     | 9  | 20s      | 78%       |
| 5    | Overdrive | 14 | 24s      | 100%      |

## Controls

- `p` or `space`: Pause/resume benchmark
- `+` / `-`: Manual phase advance/retreat
- `r`: Reset to phase 1
- `t`: Cycle theme preset
- `z`: Toggle turbo mode
- `w`: Toggle write-flood mode
- `h`: Open help modal
- `escape`: Close help modal
- `q`: Quit

## Safety Notes

- This template is a benchmark rig, not a normal starter app.
- `z` (`turbo`) and `w` (`write-flood`) increase CPU and I/O pressure on purpose.
- The real I/O sink targets the null device when available (`/dev/null` or `NUL`);
  if unavailable it falls back to a temp-file sink under the OS temp directory.
- Later phases raise update rate and memory ballast. Use `r` to reset back to phase 1.

## Quickstart

```bash
# npm
npm install
npm run start

# bun
bun install
bun run start
```
