# Native Addon

`@rezi-ui/native` provides the Node.js binding to the Zireael C engine. It is
built with [napi-rs](https://napi.rs/) and ships prebuilt binaries for all
supported platforms, so most users never need a C toolchain.

## What It Does

The native addon is the bridge between Rezi's TypeScript runtime and the Zireael
C rendering engine. It handles:

- **Engine lifecycle** -- creating and destroying engine instances.
- **Frame transport** -- submitting rendered drawlists to the engine and polling
  for input event batches.
- **Terminal I/O** -- the engine manages raw-mode terminal setup, signal
  handling, and alternate-screen management.
- **Thread-safety enforcement** -- ensuring the N-API boundary is crossed safely.

The addon exposes a minimal surface. All higher-level abstractions (widget trees,
layout, reconciliation) live in `@rezi-ui/core` and are runtime-agnostic
TypeScript.

## Prebuilt Binaries

Prebuilt `.node` binaries are published for the following platform/architecture
combinations:

| Platform      | Architecture | Binary name                            |
|---------------|-------------|----------------------------------------|
| Linux         | x64         | `rezi_ui_native.linux-x64-gnu.node`    |
| Linux         | arm64       | `rezi_ui_native.linux-arm64-gnu.node`  |
| macOS         | x64         | `rezi_ui_native.darwin-x64.node`       |
| macOS         | arm64       | `rezi_ui_native.darwin-arm64.node`     |
| Windows       | x64         | `rezi_ui_native.win32-x64-msvc.node`  |
| Windows       | arm64       | `rezi_ui_native.win32-arm64-msvc.node` |

When you install `@rezi-ui/native`, the correct prebuilt binary is selected
automatically based on `process.platform` and `process.arch`. No postinstall
scripts are required -- the binary is included directly in the published package.

Prebuilt binaries are produced by the `prebuild.yml` GitHub Actions workflow,
which cross-compiles on CI for all target triples.

## Engine Surface

The addon exposes a small set of functions at the N-API boundary:

### Create / Destroy

- `engineCreate(config?)` -- Allocates a new Zireael engine instance. Accepts
  an optional configuration object for terminal dimensions, drawlist version,
  and buffer sizes. Returns a positive numeric engine ID on success, or a
  negative `ZrResult` error code on failure.
- `engineDestroy(engineId)` -- Tears down the engine, restores terminal state,
  and frees all native resources for a valid owned ID. Repeated calls for the
  same ID are safe no-ops.

### Submit / Present

- `engineSubmitDrawlist(engineId, drawlist)` -- Submits a ZRDL-formatted
  drawlist frame (as `Uint8Array`) to the engine. The engine parses and
  executes the drawlist commands to update its internal framebuffer.
- `enginePresent(engineId)` -- Presents the current framebuffer to the
  terminal. Diffs against the previous frame and writes only changed cells.

### Poll Events

- `enginePollEvents(engineId, timeoutMs, out)` -- Polls the engine for pending
  input events. Waits up to `timeoutMs` milliseconds, then writes a
  ZREV-formatted event batch into the `out` buffer. Returns the number of
  bytes written. Returns 0 when no events are pending.

### Configuration / Metrics

- `engineSetConfig(engineId, cfg?)` -- Updates engine configuration at runtime.
- `engineGetMetrics(engineId)` -- Returns an `EngineMetrics` object with frame
  timing, byte counts, damage stats, and arena high-water marks.
- `engineGetCaps(engineId)` -- Returns a `TerminalCaps` object describing
  detected terminal capabilities (color mode, mouse, paste, cursor shape, etc.).

### User Events

- `enginePostUserEvent(engineId, tag, payload)` -- Posts a custom user event
  into the engine's event queue with a numeric tag and `Uint8Array` payload.

### Debug (7 functions)

- `engineDebugEnable(engineId, config?)` / `engineDebugDisable(engineId)` --
  Toggle debug instrumentation.
- `engineDebugQuery(engineId, query, outHeaders)` -- Query debug records.
- `engineDebugGetPayload(engineId, recordId, outPayload)` -- Read a specific
  debug record's payload.
- `engineDebugGetStats(engineId)` -- Returns debug ring buffer statistics.
- `engineDebugExport(engineId, outBuf)` -- Bulk-export debug records.
- `engineDebugReset(engineId)` -- Clear the debug ring buffer.

## Thread-Safety Invariants

The Zireael engine is single-threaded by design. The N-API binding enforces the
following invariants:

1. **Single-thread access.** All engine calls must occur on the same thread
   that called `engineCreate`. Wrong-thread calls are rejected with
   `ZR_ERR_INVALID_ARGUMENT`.

2. **No overlapping destroy/running calls.** The binding tracks active calls and
   synchronizes destroy with internal atomics + mutex/condvar so teardown waits
   for in-flight operations to finish.

3. **Idempotent destroy semantics.** Calling `engineDestroy` on an unknown,
   already-destroyed, or wrong-thread handle is a no-op. Calls made after
   destroy return `ZR_ERR_INVALID_ARGUMENT` rather than crashing.

The `@rezi-ui/node` backend package enforces these invariants at the TypeScript
level, so application code does not need to manage them directly.

## SharedArrayBuffer Interop

For zero-copy frame transport, the native addon can operate on `SharedArrayBuffer`
instances. When the Node backend creates its drawlist and event buffers as
`SharedArrayBuffer`, the engine reads and writes directly into shared memory
without copying data across the N-API boundary.

This is the default transport mode when `SharedArrayBuffer` is available in the
runtime environment. It significantly reduces per-frame overhead, especially for
large drawlists. The app runtime's buffer reuse setting
(`drawlistReuseOutputBuffer`) works in conjunction with this mechanism.

## Fallback: Building from Source

If no prebuilt binary is available for your platform (for example, musl-based
Linux distributions or uncommon architectures), the addon can be compiled from
source.

### Prerequisites

- **Node.js 18+** with npm
- **Rust toolchain** (for napi-rs compilation)
- **C toolchain** (gcc, clang, or MSVC) for the Zireael engine
- **Git submodules** initialized (`vendor/zireael` must be present)

### Build Command

```bash
# From the repository root:
npm run build:native

# Or directly in the native package:
npm -w @rezi-ui/native run build:native
```

The build script invokes napi-rs to compile the Rust glue code and the vendored
Zireael C source into a platform-specific `.node` binary. The compiled binary is
placed in the `packages/native/` directory.

### Smoke Test

After building, verify the addon loads correctly:

```bash
npm -w @rezi-ui/native run test:native:smoke
```

## See Also

- [Node backend](node.md)
- [Worker model](worker-model.md)
- [Engine configuration](engine-config.md)
- [Protocol overview](../protocol/index.md)
