# Live PTY UI Testing and Frame Audit Runbook

This runbook documents how to validate Rezi UI behavior autonomously in a real
terminal (PTY), capture end-to-end frame telemetry, and pinpoint regressions
across core/node/native layers.

Use this before asking a human for screenshots.

## Why this exists

Headless/unit tests catch many issues, but rendering regressions often involve:

- terminal dimensions and capability negotiation
- worker transport boundaries (core -> node worker -> native)
- partial redraw/damage behavior across many frames

The PTY + frame-audit workflow gives deterministic evidence for all of those.

## Prerequisites

From repo root:

```bash
cd /home/k3nig/Rezi
npx tsc -b packages/core packages/node packages/create-rezi
```

## Canonical interactive run (Starship template)

This enables:

- app-level debug snapshots (`REZI_STARSHIP_DEBUG`)
- cross-layer frame audit (`REZI_FRAME_AUDIT`)
- worker execution path (`REZI_STARSHIP_EXECUTION_MODE=worker`)

```bash
cd /home/k3nig/Rezi
: > /tmp/rezi-frame-audit.ndjson
: > /tmp/starship.log

env -u NO_COLOR \
  REZI_STARSHIP_EXECUTION_MODE=worker \
  REZI_STARSHIP_DEBUG=1 \
  REZI_STARSHIP_DEBUG_LOG=/tmp/starship.log \
  REZI_FRAME_AUDIT=1 \
  REZI_FRAME_AUDIT_LOG=/tmp/rezi-frame-audit.ndjson \
  npx tsx packages/create-rezi/templates/starship/src/main.ts
```

Key controls in template:

- `1..6`: route switch (bridge/engineering/crew/comms/cargo/settings)
- `t`: cycle theme
- `q`: quit

## Deterministic viewport (important)

Many regressions are viewport-threshold dependent. Always test with a known
size before comparing runs.

For an interactive shell/PTY:

```bash
stty rows 68 cols 300
```

Then launch the app in that same PTY.

## Autonomous PTY execution (agent workflow)

When your agent runtime supports PTY stdin/stdout control:

1. Start app in PTY mode (with env above).
2. Send key sequences (`2`, `3`, `t`, `q`) through stdin.
3. Wait between keys to allow frames to settle.
4. Quit and analyze logs.

Do not rely only on static test snapshots for visual regressions.

## Frame audit analysis

Use the built-in analyzer:

```bash
node scripts/frame-audit-report.mjs /tmp/rezi-frame-audit.ndjson --latest-pid
```

What to look for:

- `backend_submitted`, `worker_payload`, `worker_accepted`, `worker_completed`
  should stay aligned in worker mode.
- `hash_mismatch_backend_vs_worker` should be `0`.
- `top_opcodes` should reflect expected widget workload.
- `route_summary` should show submissions for every exercised route.
- `native_summary_records`/`native_header_records` confirm native debug pull
  from worker path.

If a log contains multiple app runs, always use `--latest-pid` (or `--pid=<n>`)
to avoid mixed-session confusion.

## Useful grep patterns

```bash
rg "runtime.command|runtime.fatal|shell.layout|engineering.layout|engineering.render|crew.render" /tmp/starship.log
rg "\"stage\":\"table.layout\"|\"stage\":\"drawlist.built\"|\"stage\":\"frame.submitted\"|\"stage\":\"frame.completed\"" /tmp/rezi-frame-audit.ndjson
```

## Optional deep capture (drawlist bytes)

Capture raw drawlist payload snapshots for diffing:

```bash
env \
  REZI_FRAME_AUDIT=1 \
  REZI_FRAME_AUDIT_DUMP_DIR=/tmp/rezi-drawlist-dumps \
  REZI_FRAME_AUDIT_DUMP_MAX=20 \
  REZI_FRAME_AUDIT_DUMP_ROUTE=crew \
  npx tsx packages/create-rezi/templates/starship/src/main.ts
```

This writes paired `.bin` + `.json` files with hashes and metadata.

## Native trace through frame-audit

Native debug records are enabled by frame audit in worker mode. Controls:

- `REZI_FRAME_AUDIT_NATIVE=1|0` (default on when frame audit is enabled)
- `REZI_FRAME_AUDIT_NATIVE_RING=<bytes>` (ring size override)

Look for stages such as:

- `native.debug.header`
- `native.drawlist.summary`
- `native.frame.*`
- `native.perf.*`

## Triage playbook for common regressions

### 1) “Theme only updates animated region”

Check:

1. `runtime.command` contains `cycle-theme`.
2. `drawlist.built` hashes change after theme switch.
3. `frame.submitted`/`frame.completed` continue for that route.

If hashes do not change, bug is likely in view/theme resolution.
If hashes change but screen does not, investigate native diff/damage path.

### 2) “Table looks empty or only one row visible”

Check `table.layout` record:

- `bodyH`
- `visibleRows`
- `startIndex` / `endIndex`
- table rect height

If `bodyH` is too small, inspect parent layout/flex and sibling widgets
(pagination or controls often steal height).

### 3) “Worker mode renders differently from inline”

Run both modes with identical viewport and compare audit summaries:

- worker: `REZI_STARSHIP_EXECUTION_MODE=worker`
- inline: `REZI_STARSHIP_EXECUTION_MODE=inline`

If only worker diverges, focus on backend transport and worker audit stages.

## Guardrails

- Keep all instrumentation opt-in via env vars.
- Never print continuous debug spam to stdout during normal app usage.
- Write logs to files (`/tmp/...`) and inspect post-run.
- Prefer deterministic viewport + scripted route/theme steps when verifying fixes.
