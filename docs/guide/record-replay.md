# Record and Replay

Repro bundles provide a stable schema for capturing deterministic replay inputs.
In `@rezi-ui/core`, the current schema is `rezi-repro-v1`.

Record/replay helpers now include:
- Versioned schema identifier
- Capture configuration snapshot
- Terminal capability snapshot
- Deterministic timing model metadata
- Deterministic event-capture batch payloads
- Headless replay driver + assertion harness APIs

No API in this layer writes files.

## Schema: `rezi-repro-v1`

Top-level required fields:

| Field | Type | Notes |
|---|---|---|
| `schema` | `"rezi-repro-v1"` | Versioned schema id |
| `captureConfig` | object | Capture flags and bounds |
| `capsSnapshot` | object | Terminal + backend caps captured with the run |
| `timingModel` | object | Deterministic replay timing metadata |
| `eventCapture` | object | Captured backend event batches (`bytesHex`) and truncation metadata |

### `captureConfig`

| Field | Type |
|---|---|
| `captureRawEvents` | `boolean` |
| `captureDrawlistBytes` | `boolean` |
| `maxEventBytes` | `number` (non-negative integer) |
| `maxDrawlistBytes` | `number` (non-negative integer) |
| `maxFrames` | `number` (non-negative integer) |
| `fpsCap` | `number` (positive integer) |
| `cursorProtocolVersion` | `2` |

### `capsSnapshot`

| Field | Type |
|---|---|
| `terminalCaps` | `TerminalCaps \| null` |
| `backendCaps.maxEventBytes` | `number` (non-negative integer) |
| `backendCaps.fpsCap` | `number` (positive integer) |
| `backendCaps.cursorProtocolVersion` | `2` |

### `timingModel`

| Field | Type | Fixed value in v1 |
|---|---|---|
| `kind` | `string` | `"deterministic"` |
| `clock` | `string` | `"monotonic-ms"` |
| `replayStrategy` | `string` | `"recorded-delta"` |
| `timeUnit` | `string` | `"ms"` |
| `baseTimeMs` | `number` | non-negative integer |

## Parse and Validate

Use the schema helpers before replay or transport:

```typescript
import { parseReproBundleBytes, validateReproBundle } from "@rezi-ui/core";

const parsedFromBytes = parseReproBundleBytes(bundleBytes);
if (!parsedFromBytes.ok) {
  throw new Error(`${parsedFromBytes.error.code} at ${parsedFromBytes.error.path}`);
}

const validated = validateReproBundle(parsedFromBytes.value);
if (!validated.ok) {
  throw new Error(`${validated.error.code} at ${validated.error.path}`);
}
```

Errors include:
- `code`: stable machine-readable code
- `path`: JSON path for the failing field
- `detail`: short deterministic message

## Deterministic Serialization

Stable export helpers guarantee deterministic bytes for equivalent bundle
content:

```typescript
import {
  exportReproBundleBytes,
  serializeReproBundleStable,
  validateReproBundle,
} from "@rezi-ui/core";

const parsed = validateReproBundle(candidateBundle);
if (!parsed.ok) throw new Error(parsed.error.code);

const stableJson = serializeReproBundleStable(parsed.value);
const stableBytes = exportReproBundleBytes(parsed.value);
```

Ordering rules:
- Object keys are serialized in lexicographic order.
- Array element order is preserved.
- `undefined` object fields are omitted.
- `undefined` array items serialize as `null`.

## Deterministic Headless Replay

Use the step-based replay driver to replay captured batches without a real terminal:

```typescript
import { createReproReplayDriver, parseReproBundleBytes, ui } from "@rezi-ui/core";

const parsed = parseReproBundleBytes(bundleBytes);
if (!parsed.ok) throw new Error(parsed.error.code);

const driver = createReproReplayDriver({
  bundle: parsed.value,
  view: () => ui.input({ id: "name", value: "" }),
});

for (;;) {
  const step = driver.step();
  if (step.kind === "done") break;
  if (step.fatal) throw new Error(`${step.fatal.code}: ${step.fatal.detail}`);
}

const replay = driver.runToEnd();
console.log(replay.actions);
```

Run replay + assertions in one call with mismatch diagnostics:

```typescript
import { runReproReplayHarness, ui } from "@rezi-ui/core";

const result = await runReproReplayHarness({
  bundle,
  view: () => ui.input({ id: "name", value: "" }),
  expectedActions: [{ id: "name", action: "input", value: "A", cursor: 1 }],
  invariants: { noFatal: true, noOverrun: true },
});

if (!result.pass) {
  for (const m of result.mismatches) {
    console.error(`${m.code} at ${m.path}: ${m.detail}`);
  }
}
```

Harness result fields:
- `status`: `"PASS"` or `"FAIL"`
- `replay`: actions, overruns, fatal (if any), and deterministic recorded elapsed time
- `mismatches`: stable codes + JSON paths + expected/actual payloads

## Versioning Behavior

- `rezi-repro-v1` is accepted by current helpers.
- `rezi-repro-vN` (where `N` is not `1`) fails with `ZR_REPRO_UNSUPPORTED_VERSION`.
- Unknown fields fail with `ZR_REPRO_UNKNOWN_FIELD` for strict schema handling.
