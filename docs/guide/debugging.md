# Debugging

Rezi includes a debug trace system for diagnosing rendering, events, and performance issues.

## Debug Controller

Create a debug controller to capture and analyze runtime behavior. For regular
apps, prefer `createNodeApp()`. `createNodeBackend()` is used here only to
access the backend debug interface.

```typescript
import { createDebugController, categoriesToMask, perfPhaseFromNum } from "@rezi-ui/core";
import { createNodeBackend } from "@rezi-ui/node";

const backend = createNodeBackend();
const debug = createDebugController({
  backend: backend.debug,
  terminalCapsProvider: () => backend.getCaps(),
  maxFrames: 1000,
});

// Enable tracing with specific categories
await debug.enable({
  minSeverity: "info",
  categoryMask: categoriesToMask(["frame", "error", "perf"]),
});

// Query recent records on demand
const records = await debug.query({ maxRecords: 200 });
for (const record of records) {
  if (record.header.category === "perf" && record.payload && "usElapsed" in record.payload) {
    const phase = perfPhaseFromNum(record.payload.phase) ?? `phase_${record.payload.phase}`;
    console.log(`${phase}: ${(record.payload.usElapsed / 1000).toFixed(2)}ms`);
  }
}
```

## Enable Inspector Overlay

Use `createAppWithInspectorOverlay` to auto-install the overlay and runtime toggle.
Default hotkey is `ctrl+shift+i`.

```typescript
import { createAppWithInspectorOverlay, createDebugController } from "@rezi-ui/core";
import { createNodeBackend } from "@rezi-ui/node";

const backend = createNodeBackend();

const debug = createDebugController({
  backend: backend.debug,
  terminalCapsProvider: () => backend.getCaps(),
});

await debug.enable({
  minSeverity: "info",
  captureRawEvents: false,
  captureDrawlistBytes: false,
});

const app = createAppWithInspectorOverlay({
  backend,
  initialState: { ready: true },
  inspector: {
    hotkey: "ctrl+shift+i",
    debug, // optional: used for frame timing rows when snapshots are available
  },
});
```

Overlay sections include:
- Focus summary (`focusedId`, active zone, active trap)
- Cursor target summary (position, shape, blink intent when cursor v2 is active)
- Damage + frame summary (`mode`, rect/cell counts, commit/layout/incremental state)
- Frame timing rows (`drawlistBytes`, `diffBytesEmitted`, `usDrawlist`, `usDiff`, `usWrite`)
- Event routing breadcrumbs (last event kind, keybindings vs widget routing path, last action)

## Quick Layout Overlay

For quick in-app layout diagnostics (without the full inspector), toggle:

```typescript
app.debugLayout(true);  // enable
app.debugLayout(false); // disable
```

When enabled, Rezi renders a live layout summary overlay with widget ids and
resolved rects.

## Export Debug Bundle

Exporting a debug bundle is deterministic for the same debug state and options.
The API never writes to disk; it returns either a JSON object or UTF-8 bytes.

```typescript
import { createDebugController } from "@rezi-ui/core/debug";
import { createNodeBackend } from "@rezi-ui/node";

const backend = createNodeBackend();
const debug = createDebugController({
  backend: backend.debug,
  terminalCapsProvider: () => backend.getCaps(),
});

await debug.enable({
  minSeverity: "info",
  captureRawEvents: false,
  captureDrawlistBytes: false,
});

const bundle = await debug.exportBundle({
  maxRecords: 2000,
  maxPayloadBytes: 4096,
  maxTotalPayloadBytes: 262_144,
  maxRecentFrames: 32,
});

console.log(bundle.schema); // "rezi-debug-bundle-v1"

// If you want raw bytes (for transport or persistence):
const bundleBytes = await debug.exportBundleBytes();
```

### Bundle Contents

- `schema`: Versioned identifier. Current value: `rezi-debug-bundle-v1`.
- `captureFlags`: Capture state used during export (`captureRawEvents`, `captureDrawlistBytes`).
- `bounds`: Export bounds (`maxRecords`, per-record payload cap, total payload cap, frame summary cap).
- `terminalCaps`: Terminal capability snapshot (or `null` if unavailable).
- `stats`: Debug stats snapshot (`totalRecords`, `totalDropped`, counts, ring usage/capacity).
- `queryWindow`: Trace query window metadata (`recordsReturned`, `recordsAvailable`, oldest/newest IDs).
- `trace`: Deterministically ordered trace records (`header` + bounded payload snapshot).
- `recentFrameSummaries`: Optional recent frame summaries when frame snapshots are available.

Notes:
- `u64` fields are serialized as decimal strings for JSON safety.
- Payload snapshots are hex-encoded and truncated by configured bounds.

### Privacy Note

Raw event payloads and raw drawlist byte payloads can contain sensitive data
(for example typed input or rendered text bytes).

By default, bundle export follows debug capture flags:
- Event payloads are omitted when `captureRawEvents` is `false`.
- Raw drawlist byte payloads are omitted when `captureDrawlistBytes` is `false`.

To minimize risk in production:
- Keep `captureRawEvents` and `captureDrawlistBytes` disabled unless needed.
- Share bundles only with trusted recipients.

## Debug Categories

| Category | Description |
|----------|-------------|
| `frame` | Frame lifecycle events (begin, end, metrics) |
| `event` | Input event flow and routing |
| `drawlist` | Drawlist building and rendering |
| `error` | Error events and failures |
| `state` | Application state changes |
| `perf` | Performance timing and phases |

Enable multiple categories:

```typescript
const mask = categoriesToMask(["frame", "event", "perf"]);
```

## Debug Severities

| Severity | Usage |
|----------|-------|
| `trace` | Verbose internal details |
| `info` | Normal operational events |
| `warn` | Potential issues |
| `error` | Failures and errors |

Filter by minimum severity:

```typescript
await debug.enable({ minSeverity: "warn" });
```

## Feeding Records (Optional)

`frameInspector`, `eventTrace`, `errors`, and `on("record")` are populated by `debug.processRecords(...)`.
`debug.query()` returns parsed records but does not update these helpers.

In Node/Bun you can pull headers/payloads from the backend and feed them into the controller:

```typescript
import { DEBUG_RECORD_HEADER_SIZE, parseRecordHeader } from "@rezi-ui/core/debug";

let nextRecordId: bigint | undefined;

async function pumpDebugRecords(): Promise<void> {
  const { headers, result } = await backend.debug.debugQuery({
    ...(nextRecordId !== undefined ? { minRecordId: nextRecordId } : {}),
    maxRecords: 512,
  });

  const payloads = new Map<bigint, Uint8Array>();

  for (let i = 0; i < result.recordsReturned; i++) {
    const offset = i * DEBUG_RECORD_HEADER_SIZE;
    const parsed = parseRecordHeader(headers, offset);
    if (!parsed.ok) continue;
    const h = parsed.value;

    if (h.payloadSize > 0) {
      const bytes = await backend.debug.debugGetPayload(h.recordId);
      if (bytes) payloads.set(h.recordId, bytes);
    }
  }

  if (result.recordsReturned > 0) {
    nextRecordId = result.newestRecordId + 1n;
  }

  debug.processRecords(headers, payloads);
}
```

## Frame Inspector

Analyze frame metrics and compare frames:

```typescript
const inspector = debug.frameInspector;

// Get recent frame snapshots
const frames = inspector.getSnapshots(10);
for (const frame of frames) {
  const totalUs = frame.usDrawlist + frame.usDiff + frame.usWrite;
  console.log(`Frame ${frame.frameId}: ${(totalUs / 1000).toFixed(2)}ms total, ${frame.drawlistCmds} commands`);
}

// Compare two frames for changes
const diff = inspector.compareFrames(frameA, frameB);
if (diff) {
  for (const change of diff.changed) {
    console.log(`${change.field}: ${change.before} -> ${change.after}`);
  }
}
```

Frame snapshots include:

- `frameId` and `timestamp`
- Terminal dimensions (`cols`, `rows`)
- Drawlist metrics (`drawlistBytes`, `drawlistCmds`)
- Diff/damage metrics (`diffBytesEmitted`, `dirtyLines`, `dirtyCells`, `damageRects`)
- Timing metrics in microseconds (`usDrawlist`, `usDiff`, `usWrite`)

## Event Trace

Track input events through the system:

```typescript
const trace = debug.eventTrace;

// Query recent events
const keyEvents = trace.query({
  eventTypes: ["key"],
  minFrameId: 100n,
});

for (const ev of keyEvents.slice(-100)) {
  console.log(`${ev.eventType}: ${ev.parseResult} at ${ev.timestamp}ms`);
}
```

## Error Aggregator

Collect and deduplicate errors:

```typescript
const errors = debug.errors;

// Get all unique errors
const all = errors.all();
for (const err of all) {
  console.log(`${err.code}: ${err.message} (${err.count} occurrences)`);
}

// Get error count
console.log(`Total error types: ${errors.size()}`);

// Clear errors
errors.clear();
```

## State Timeline

`StateTimeline` is a TypeScript-side helper and is not populated automatically.
If you want to use it, record changes from your own state management layer via
`debug.stateTimeline.recordChange(...)` (or use `createStateTimeline()` directly).

## Debug Panel Widget

Display debug information in your UI:

```typescript
import { debugPanel, errorBadge, fpsCounter } from "@rezi-ui/core";

app.view((state) =>
  ui.column({}, [
    // Your app content...

    // Debug panel in corner
    debugPanel({
      stats: state.debugStats,
      fps: state.fps,
      frameTimeMs: state.frameTimeMs,
      position: "bottom-right",
    }),

    // Or individual components
    fpsCounter(state.fps),
    errorBadge(state.errorCount),
  ])
);
```

## Performance Instrumentation

Perf instrumentation is opt-in via `REZI_PERF=1` (returns an empty snapshot when disabled):

```typescript
import { PERF_PHASES, perfSnapshot } from "@rezi-ui/core";

const snapshot = perfSnapshot();
for (const phase of PERF_PHASES) {
  const stats = snapshot.phases[phase];
  if (stats) {
    console.log(`${phase}: avg=${stats.avg.toFixed(2)}ms p95=${stats.p95.toFixed(2)}ms`);
  }
}
```

## Debug Configuration

Configure debug behavior at creation:

```typescript
const debug = createDebugController({
  maxFrames: 500,     // Frame history limit
  maxEvents: 1000,    // Event trace limit
  maxStateChanges: 500, // State timeline limit
});
```

## Debugging Tips

**Reproduce deterministically**
: Rezi's deterministic design means the same input sequence produces the same behavior. Capture and replay event sequences to reproduce issues.

**Start with minimal examples**
: The `examples/` directory contains minimal applications. Start there to isolate issues.

**Check error aggregation**
: Many issues surface through the error aggregator. Check `debug.errors.all()` first.

**Compare frames**
: For visual glitches, compare frame snapshots to find what changed.

**Profile render phases**
: Use the perf category to identify slow render phases.

## Related

- [Record and Replay](record-replay.md) - Repro bundle schema and deterministic export helpers
- [Performance](performance.md) - Optimization techniques
- [Node/Bun backend](../backend/node.md) - Runtime backend behavior
