# Safety rules

Rezi treats all binary buffers as **untrusted input**. Whether a buffer was just built by the TypeScript core or received from the C engine, it is validated before any data is read from it. This page documents the safety patterns enforced throughout the binary protocol layer.

## Core safety principles

1. **Validate before read.** Every field is bounds-checked before access. No buffer read occurs without first confirming that sufficient bytes remain.
2. **Cap enforcement.** All resource pools (commands, strings, blobs, total bytes) have configurable upper bounds. The builder refuses to exceed them.
3. **Structured error returns.** Parsers and builders never throw exceptions into user code for format violations. Errors are returned as typed result objects.
4. **Alignment invariants.** All section offsets and sizes are 4-byte aligned. Padding bytes are explicitly zeroed, never left as garbage.
5. **Deterministic failure.** The same invalid input always produces the same error. No undefined behavior, no silent data corruption.

## Validate-before-read pattern

The `BinaryReader` class (defined in `packages/core/src/binary/reader.ts`) enforces bounds checking on every read operation:

```typescript
class BinaryReader {
  readU8(): number;    // Validates 1 byte available
  readU32(): number;   // Validates 4 bytes available
  readI32(): number;   // Validates 4 bytes available
  readBytes(len: number): Uint8Array;  // Validates len bytes available
  skip(len: number): void;  // Validates len bytes available

  ensureAligned4(offset?: number): void;  // Validates 4-byte alignment

  get offset(): number;     // Current cursor position
  get remaining(): number;  // Bytes left to read
}
```

If a read would exceed the buffer, the reader throws a `ZrBinaryError` with the exact byte offset and a description of how many bytes were needed vs. available. This makes binary debugging straightforward.

The `BinaryWriter` class (`packages/core/src/binary/writer.ts`) applies the same pattern on the write side:

```typescript
class BinaryWriter {
  writeU8(v: number): void;    // Validates 1 byte of capacity
  writeU32(v: number): void;   // Validates 4 bytes + alignment
  writeI32(v: number): void;   // Validates 4 bytes + alignment
  writeBytes(bytes: Uint8Array): void;  // Validates bytes.length capacity
  padTo4(): void;              // Pads with zeros to next 4-byte boundary

  finish(): Uint8Array;  // Returns the written portion
}
```

The writer additionally enforces that `writeU32` and `writeI32` are called only at 4-byte aligned offsets. Calling at a misaligned offset throws `ZR_MISALIGNED`.

## ZrBinaryError

All binary-layer violations produce a `ZrBinaryError`:

```typescript
class ZrBinaryError extends Error {
  readonly code: ZrBinaryErrorCode;
  readonly offset: number;
  readonly detail: string;
}
```

Error codes:

| Code | Meaning |
|------|---------|
| `ZR_TRUNCATED` | Attempted read beyond buffer bounds |
| `ZR_MISALIGNED` | Offset violates 4-byte alignment requirement |
| `ZR_LIMIT` | Operation exceeds configured capacity |

The `offset` field records the byte position where the violation occurred, enabling precise diagnosis in hex dumps.

## Cap enforcement

The drawlist builder enforces hard caps on all resource pools. If any cap is exceeded, the builder records a sticky error and all subsequent commands become no-ops.

### Builder caps

| Cap | Default | Description |
|-----|---------|-------------|
| `maxDrawlistBytes` | 2 MiB (2,097,152) | Maximum total ZRDL buffer size |
| `maxCmdCount` | 100,000 | Maximum number of commands per drawlist |
| `maxBlobBytes` | 512 KiB (524,288) | Maximum total blob byte pool |
| `maxBlobs` | 10,000 | Maximum number of blob entries |
| `maxStringBytes` | 512 KiB (524,288) | Maximum total string byte pool |
| `maxStrings` | 10,000 | Maximum number of interned strings |

Caps are configured at builder construction time:

```typescript
import { createDrawlistBuilderV1 } from "@rezi-ui/core";

const builder = createDrawlistBuilderV1({
  maxDrawlistBytes: 4 * 1024 * 1024,  // 4 MiB
  maxCmdCount: 200_000,
});
```

All cap values must be positive integers. The builder constructor validates this and records a sticky error for invalid values.

### Engine-side caps

The engine enforces its own independent limits when processing a submitted drawlist:

| Engine cap | Description |
|------------|-------------|
| `dl_max_total_bytes` | Maximum accepted drawlist buffer size |
| `dl_max_cmds` | Maximum command count |
| `dl_max_strings` | Maximum string table entries |
| `dl_max_blobs` | Maximum blob table entries |
| `dl_max_clip_depth` | Maximum nesting depth of PUSH_CLIP/POP_CLIP |
| `dl_max_text_run_segments` | Maximum segments in a single text run blob |

If the engine's caps are stricter than the builder's, the engine will reject a drawlist that the builder accepted. Align caps between builder and engine to avoid this.

## Structured error returns

### DrawlistBuildResult

The builder's `build()` method returns a discriminated union, never throws:

```typescript
type DrawlistBuildResult =
  | Readonly<{ ok: true; bytes: Uint8Array }>
  | Readonly<{ ok: false; error: DrawlistBuildError }>;

type DrawlistBuildError = Readonly<{
  code: DrawlistBuildErrorCode;
  detail: string;
}>;
```

Error codes from the builder:

| Code | Meaning |
|------|---------|
| `ZRDL_TOO_LARGE` | Output exceeds a configured cap |
| `ZRDL_BAD_PARAMS` | Invalid parameters passed to a drawing command |
| `ZRDL_FORMAT` | Internal format constraint violated (alignment, size mismatch) |
| `ZRDL_INTERNAL` | Implementation bug; should never occur in normal operation |

### ZrResult enum

Engine FFI functions return `ZrResult` (an `int32`):

```typescript
enum ZrResult {
  OK                  =  0,  // Success
  ERR_INVALID_ARGUMENT = -1,  // NULL pointer, invalid enum, impossible value
  ERR_OOM             = -2,  // Allocation failed
  ERR_LIMIT           = -3,  // Buffer too small, cap exceeded
  ERR_UNSUPPORTED     = -4,  // Unknown version, opcode, or feature
  ERR_FORMAT          = -5,  // Malformed binary data
  ERR_PLATFORM        = -6,  // OS/terminal call failed
}
```

All negative values are errors. The core checks `ZrResult` after every engine call and converts failures to `ZrUiError` instances.

### ZrUiError class

Runtime violations in the UI layer produce `ZrUiError`:

```typescript
class ZrUiError extends Error {
  readonly name = "ZrUiError";
  readonly code: ZrUiErrorCode;

  constructor(code: ZrUiErrorCode, message?: string);
}
```

Error codes:

| Code | Meaning |
|------|---------|
| `ZRUI_INVALID_STATE` | Operation called in wrong lifecycle phase |
| `ZRUI_MODE_CONFLICT` | Incompatible render mode combination |
| `ZRUI_NO_RENDER_MODE` | Render attempted without a configured mode |
| `ZRUI_REENTRANT_CALL` | Recursive call into render/update |
| `ZRUI_UPDATE_DURING_RENDER` | State mutation during render phase |
| `ZRUI_DUPLICATE_KEY` | Two siblings share the same key |
| `ZRUI_DUPLICATE_ID` | Two widgets share the same ID |
| `ZRUI_INVALID_PROPS` | Configuration/props validation failure |
| `ZRUI_PROTOCOL_ERROR` | Binary protocol violation from engine |
| `ZRUI_DRAWLIST_BUILD_ERROR` | Builder returned an error result |
| `ZRUI_BACKEND_ERROR` | Backend operation failed |
| `ZRUI_USER_CODE_THROW` | User-provided view/event handler threw |

## Sticky error semantics

The drawlist builder uses a **sticky error** pattern:

1. The first error encountered during command emission is recorded in the builder's internal `error` field.
2. All subsequent command calls (`clear()`, `drawText()`, etc.) check for a sticky error and return immediately if one exists. They become no-ops.
3. `build()` returns the sticky error as `{ ok: false, error }`.
4. `reset()` clears the sticky error, allowing the builder to be reused for the next frame.

This design eliminates the need for per-call error checking. Callers can emit an entire frame's worth of commands and check for errors once at `build()` time:

```typescript
builder.clear();
builder.fillRect(0, 0, 80, 24, style);
builder.drawText(5, 5, "Hello", textStyle);
// ... many more commands ...

const result = builder.build();
if (!result.ok) {
  // Handle the first error that occurred
  console.error(result.error.code, result.error.detail);
}
builder.reset();
```

!!! warning
    After a sticky error, the builder's internal state is partially written. Only `build()` and `reset()` should be called. Do not attempt to "recover" by continuing to emit commands -- they will all be silently dropped.

## Builder parameter validation

The builder supports a `validateParams` option (default: `true`) that controls per-command parameter validation:

- **When `true`:** Every command validates its parameters (coordinates are `i32`, dimensions are non-negative, etc.). Invalid parameters produce a sticky error.
- **When `false`:** Most parameter validation is skipped for performance. The builder still enforces cap limits and internal format constraints. Invalid values may produce engine-side validation failures instead.

!!! note
    Disabling `validateParams` does not disable safety. The engine always validates the submitted drawlist independently. The flag only controls whether the TypeScript builder duplicates those checks.

In the widget renderer, `validateParams` defaults to `false` as a performance optimization. The engine's C-side validation catches any issues.

## See also

- [Drawlists (ZRDL)](zrdl.md) -- format reference and validation rules
- [Versioning](versioning.md) -- version validation flow
- [Event batches (ZREV)](zrev.md) -- event parsing safety
