# Drawlists (ZRDL)

Rezi emits rendering commands as a **ZRDL drawlist** -- a self-contained binary buffer built in TypeScript and executed by the Zireael C engine. Each frame, the widget renderer produces exactly one drawlist that contains all the drawing commands, string data, and blob payloads needed to render the UI.

## Command writer source of truth (v3/v4/v5)

For drawlist v3/v4/v5 command encoding, command byte layout is defined in:

- `scripts/drawlist-spec.ts` (source of truth)

Writer functions are generated from that spec into:

- `packages/core/src/drawlist/writers.gen.ts`

Regenerate and validate with:

```bash
npm run codegen
npm run codegen:check
```

Do not hand-edit `writers.gen.ts`; update the spec and regenerate.

## Header structure

Every ZRDL buffer begins with a **64-byte header**. All fields are little-endian `u32`.

| Offset | Size | Field | Description |
|--------|------|-------|-------------|
| 0 | 4 | `magic` | `0x4C44525A` (ASCII `ZRDL` as LE u32) |
| 4 | 4 | `version` | Format version (`1` for v1, `2` for v2) |
| 8 | 4 | `header_size` | Always `64` |
| 12 | 4 | `total_size` | Total byte length of the entire buffer |
| 16 | 4 | `cmd_offset` | Byte offset to command stream (or `0` if no commands) |
| 20 | 4 | `cmd_bytes` | Byte length of command stream |
| 24 | 4 | `cmd_count` | Number of commands |
| 28 | 4 | `strings_span_offset` | Byte offset to string span table |
| 32 | 4 | `strings_count` | Number of interned strings |
| 36 | 4 | `strings_bytes_offset` | Byte offset to string byte pool |
| 40 | 4 | `strings_bytes_len` | Byte length of string byte pool (4-byte aligned) |
| 44 | 4 | `blobs_span_offset` | Byte offset to blob span table |
| 48 | 4 | `blobs_count` | Number of blob entries |
| 52 | 4 | `blobs_bytes_offset` | Byte offset to blob byte pool |
| 56 | 4 | `blobs_bytes_len` | Byte length of blob byte pool (4-byte aligned) |
| 60 | 4 | `reserved0` | Must be `0` |

### Buffer layout

After the header, sections are laid out contiguously:

```
[Header: 64 bytes]
[Command stream: cmd_bytes]
[String span table: strings_count * 8 bytes]
[String byte pool: strings_bytes_len]
[Blob span table: blobs_count * 8 bytes]
[Blob byte pool: blobs_bytes_len]
```

When a section is empty (count = 0), its offset and length fields are all `0`.

## Command types

Each command has an **8-byte header** followed by a variable-length payload. The command header format is:

| Offset | Size | Type | Field |
|--------|------|------|-------|
| 0 | 2 | `u16` | `opcode` |
| 2 | 2 | `u16` | `flags` (reserved, must be `0`) |
| 4 | 4 | `u32` | `size` (total bytes including this header) |

### OP_CLEAR (opcode 1)

Clears the framebuffer. Header-only, no payload.

- **Total size:** 8 bytes

### OP_FILL_RECT (opcode 2)

Fills a rectangular region with a style (background color and attributes).

- **Total size:** 40 bytes (8 header + 32 payload)

| Offset | Size | Type | Field |
|--------|------|------|-------|
| 8 | 4 | `i32` | `x` |
| 12 | 4 | `i32` | `y` |
| 16 | 4 | `i32` | `w` (width, >= 0) |
| 20 | 4 | `i32` | `h` (height, >= 0) |
| 24 | 16 | `style` | Packed style (see [Style encoding](#style-encoding)) |

### OP_DRAW_TEXT (opcode 3)

Draws a single string at a position with a style.

- **Total size:** 48 bytes (8 header + 40 payload)

| Offset | Size | Type | Field |
|--------|------|------|-------|
| 8 | 4 | `i32` | `x` |
| 12 | 4 | `i32` | `y` |
| 16 | 4 | `u32` | `string_index` (index into string span table) |
| 20 | 4 | `u32` | `byte_off` (offset within string; locked to `0` in v1) |
| 24 | 4 | `u32` | `byte_len` (byte length of the string slice) |
| 28 | 16 | `style` | Packed style |
| 44 | 4 | `u32` | `reserved0` (must be `0`) |

### OP_PUSH_CLIP (opcode 4)

Pushes a clipping rectangle onto the clip stack.

- **Total size:** 24 bytes (8 header + 16 payload)

| Offset | Size | Type | Field |
|--------|------|------|-------|
| 8 | 4 | `i32` | `x` |
| 12 | 4 | `i32` | `y` |
| 16 | 4 | `i32` | `w` (width, >= 0) |
| 20 | 4 | `i32` | `h` (height, >= 0) |

### OP_POP_CLIP (opcode 5)

Pops the top clipping rectangle from the clip stack. Header-only, no payload.

- **Total size:** 8 bytes

### OP_DRAW_TEXT_RUN (opcode 6)

Draws a multi-segment text run from a pre-built blob.

- **Total size:** 24 bytes (8 header + 16 payload)

| Offset | Size | Type | Field |
|--------|------|------|-------|
| 8 | 4 | `i32` | `x` |
| 12 | 4 | `i32` | `y` |
| 16 | 4 | `u32` | `blob_index` (index into blob span table) |
| 20 | 4 | `u32` | `reserved0` (must be `0`) |

The referenced blob contains an array of styled text segments. Blob payload layout:

```
u32  seg_count
repeat seg_count:
  u32  fg            (packed 24-bit RGB)
  u32  bg            (packed 24-bit RGB)
  u32  attrs         (attribute flags)
  u32  reserved0     (must be 0)
  u32  string_index
  u32  byte_off      (locked to 0)
  u32  byte_len
```

Each segment is 28 bytes. The total blob size is `4 + seg_count * 28`.

### OP_SET_CURSOR (opcode 7, v2 only)

Sets the terminal cursor position and appearance. See [Cursor (v2)](cursor-v2.md) for details.

- **Total size:** 20 bytes (8 header + 12 payload)

## Style encoding

Styles are encoded as a 16-byte struct (`zr_dl_style_t`):

| Offset | Size | Type | Field |
|--------|------|------|-------|
| 0 | 4 | `u32` | `fg` -- packed foreground color (`0x00RRGGBB`) |
| 4 | 4 | `u32` | `bg` -- packed background color (`0x00RRGGBB`) |
| 8 | 4 | `u32` | `attrs` -- attribute bit flags |
| 12 | 4 | `u32` | `reserved0` (must be `0`) |

### Attribute flags

The `attrs` field is an 8-bit flags value stored in the low byte of a `u32`:

| Bit | Attribute |
|-----|-----------|
| 0 | bold |
| 1 | italic |
| 2 | underline |
| 3 | inverse |
| 4 | dim |
| 5 | strikethrough |
| 6 | overline |
| 7 | blink |

Color packing uses 24-bit RGB: the red channel in bits 16-23, green in bits 8-15, blue in bits 0-7. A value of `0x000000` represents default/unset.

## String table

Strings are stored in two parts:

1. **Span table** -- an array of `(offset: u32, length: u32)` pairs, 8 bytes per entry. The offset is relative to the start of the string byte pool.
2. **Byte pool** -- contiguous UTF-8 encoded string data. The total pool size is 4-byte aligned with zero padding.

Commands reference strings by their **index** into the span table (zero-based). The engine uses the span to locate the UTF-8 bytes within the pool.

### String interning

Within a single builder epoch (between `reset()` calls), strings are **interned by exact value**. If the same string is drawn twice, it occupies a single entry in the string table, and both commands reference the same index.

Interning uses a `Map<string, number>` keyed by the JavaScript string value. The map is cleared on `reset()`.

### Encoded string cache

The builder supports an optional **encoded string cache** that persists UTF-8 `Uint8Array` results across `reset()` calls. This avoids redundant `TextEncoder.encode()` work for strings that recur across frames.

Cache behavior:

- Disabled by default (`encodedStringCacheCap = 0`).
- When enabled, the cache stores encoded bytes keyed by the original string.
- **Not cleared on `reset()`** -- this is the point; it survives across frames.
- Cleared entirely if the cache size exceeds `encodedStringCacheCap` (cap-based eviction, not LRU).
- In v1 only, strings longer than `ENCODED_STRING_CACHE_MAX_KEY_LENGTH` (96 characters) are not cached. Long, high-churn strings (log lines, heatmap data) produce low hit rates and would thrash the cache.

## Validation rules

The builder enforces these constraints at build time:

- `magic` must be `0x4C44525A`.
- `version` must be `1` (v1) or `2` (v2).
- `total_size` must be 4-byte aligned and >= `HEADER_SIZE` (64).
- All section offsets must be 4-byte aligned.
- All section byte lengths must be 4-byte aligned.
- When `cmd_count` is 0, both `cmd_offset` and `cmd_bytes` must be 0.
- When `strings_count` is 0, all string-related offsets/lengths must be 0.
- When `blobs_count` is 0, all blob-related offsets/lengths must be 0.
- `cmd_offset` (when non-zero) must equal `HEADER_SIZE` (64).
- Every command's `size` field must match the expected size for its opcode.
- The command cursor must be 4-byte aligned at all times.

## Default caps

The builder enforces resource caps to prevent unbounded memory usage:

| Cap | Default | Description |
|-----|---------|-------------|
| `maxDrawlistBytes` | 2 MiB (2,097,152) | Maximum total buffer size |
| `maxCmdCount` | 100,000 | Maximum number of commands |
| `maxBlobBytes` | 512 KiB (524,288) | Maximum total blob byte pool size |
| `maxBlobs` | 10,000 | Maximum number of blob entries |
| `maxStringBytes` | 512 KiB (524,288) | Maximum total string byte pool size |
| `maxStrings` | 10,000 | Maximum number of interned strings |

All caps are configurable via `DrawlistBuilderV1Opts` or `DrawlistBuilderV2Opts`. See [Safety rules](safety.md) for the full enforcement model.

## See also

- [Cursor (v2)](cursor-v2.md) -- SET_CURSOR command added in drawlist v2
- [Versioning](versioning.md) -- format version semantics
- [Safety rules](safety.md) -- validation and error handling patterns
