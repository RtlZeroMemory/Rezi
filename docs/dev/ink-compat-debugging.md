# Ink Compat Debugging Runbook

This runbook is for renderer parity investigations against upstream Ink apps (for example Gemini CLI).

## 1. Build before running

```bash
npm run -w packages/ink-compat build
```

## 2. Launch with full diagnostics

```bash
INK_COMPAT=1 \
INK_COMPAT_TRACE=1 \
INK_COMPAT_TRACE_DETAIL=1 \
INK_COMPAT_TRACE_DETAIL_FULL=1 \
INK_COMPAT_TRACE_ALL_FRAMES=1 \
INK_COMPAT_TRACE_FILE=/tmp/ink-compat.trace.log \
INK_COMPAT_TRACE_JSON_MAX_DEPTH=8 \
INK_COMPAT_TRACE_JSON_ARRAY_LIMIT=400 \
INK_COMPAT_TRACE_JSON_OBJECT_LIMIT=80 \
INK_GRADIENT_TRACE=1 \
FORCE_COLOR=3 \
NO_COLOR= \
GEMINI_CLI_NO_RELAUNCH=true \
node packages/cli/dist/index.js -y
```

Use a less verbose profile when needed:

```bash
INK_COMPAT=1 \
INK_COMPAT_TRACE=1 \
INK_COMPAT_TRACE_FILE=/tmp/ink-compat.trace.log \
node packages/cli/dist/index.js -y
```

## 3. Interpret key frame fields

Important fields in `frame#...` lines:

- `layoutViewport`: size used for layout pass.
- `gridViewport`: size used for ANSI cell grid serialization.
- `staticRowsUsed/full/pending`: static channel occupancy.
- `maxBottom`: computed content height from layout nodes.
- `hostRootOverflow`: translated root overflow mode.
- `opViewportOverflowCount`: render ops outside viewport bounds.

Quick triage logic:

1. If `opViewportOverflowCount > 0`, investigate render op clipping or viewport math first.
2. If footer/input drifts, compare `layoutViewport` and `gridViewport` plus `staticRows*`.
3. If color is wrong, inspect `colorSupport... hasAnsiSgr... effectiveLevel...` and gradient shim traces.

## 4. Gradient shim validation

Check which shim is active and what it emits:

```bash
INK_GRADIENT_TRACE=1 node --input-type=module -e "import g from './packages/cli/node_modules/ink-gradient/index.js'; g({colors:['red','blue'],children:'AB'})"
```

Expected trace includes:

- `module=.../ink-gradient/index.js`
- `parsedStops=<n>`
- `emittedAnsi=true` when enough gradient stops are present

## 5. What to capture in bug reports

Include all of:

- Terminal/OS details.
- Launch command.
- `INK_COMPAT_TRACE_FILE` output snippet around failing frame.
- Screenshot pair (upstream Ink vs compat render).
- Whether issue reproduces with alternate buffer on/off and `-y` mode.

## 6. Guardrails for instrumentation

- Keep diagnostics opt-in through env flags.
- Avoid hardcoded temp-file logging.
- Prefer structured trace fields over free-form log strings.
- Add/adjust tests with every parity fix.
