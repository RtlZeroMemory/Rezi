# Versioning

Rezi uses explicit version pins at every binary boundary. All version constants are exported from `@rezi-ui/core` so that backends, tooling, and test harnesses can validate compatibility at startup rather than discovering mismatches at runtime.

## Engine ABI version

The engine ABI version tracks the C engine's public API surface (function signatures, struct layouts, enum values). It follows semver-style semantics:

| Constant | Value | Meaning |
|----------|-------|---------|
| `ZR_ENGINE_ABI_MAJOR` | `1` | Breaking changes to engine API |
| `ZR_ENGINE_ABI_MINOR` | `1` | Backwards-compatible additions |
| `ZR_ENGINE_ABI_PATCH` | `0` | Bug fixes with no API change |

**Current version:** `1.1.0`

### Compatibility rules

- **Major mismatch** -- the core and engine are incompatible. The engine must reject the connection.
- **Minor mismatch** -- if `core.minor > engine.minor`, the core may use features the engine does not support. The engine should reject unknown opcodes with `ERR_UNSUPPORTED`. If `core.minor <= engine.minor`, the core is compatible.
- **Patch mismatch** -- always compatible.

```typescript
import {
  ZR_ENGINE_ABI_MAJOR,
  ZR_ENGINE_ABI_MINOR,
  ZR_ENGINE_ABI_PATCH,
} from "@rezi-ui/core";
```

## Drawlist format versions

The drawlist format is versioned independently from the engine ABI. The version field is stored at byte offset 4 in every ZRDL header.

| Constant | Value | Description |
|----------|-------|-------------|
| `ZR_DRAWLIST_VERSION_V1` | `1` | Base format: CLEAR, FILL_RECT, DRAW_TEXT, PUSH_CLIP, POP_CLIP, DRAW_TEXT_RUN |
| `ZR_DRAWLIST_VERSION_V2` | `2` | Adds SET_CURSOR (opcode 7) for native cursor control |
| `ZR_DRAWLIST_VERSION_V3` | `3` | Extends style payloads (underline style/color + hyperlink refs) |
| `ZR_DRAWLIST_VERSION_V4` | `4` | v3 + DRAW_CANVAS (opcode 8) |
| `ZR_DRAWLIST_VERSION_V5` | `5` | v4 + DRAW_IMAGE (opcode 9) |

### What v2-v5 add

- **v2** is a strict superset of v1 and adds:

- **OP_SET_CURSOR (opcode 7)** -- 20-byte command that sets cursor position, shape, visibility, and blink state. See [Cursor](cursor.md).

- **v3** extends style payloads for underline style/color and hyperlink references.
- **v4** adds **OP_DRAW_CANVAS (opcode 8)**.
- **v5** adds **OP_DRAW_IMAGE (opcode 9)**.

Command writer code for v3-v5 is generated from `scripts/drawlist-spec.ts`; CI runs
`npm run codegen:check` to guarantee generated writers stay in sync.

The header layout, string table, and blob table remain compatible across versions.

```typescript
import {
  ZR_DRAWLIST_VERSION_V1,
  ZR_DRAWLIST_VERSION_V2,
  ZR_DRAWLIST_VERSION_V3,
  ZR_DRAWLIST_VERSION_V4,
  ZR_DRAWLIST_VERSION_V5,
} from "@rezi-ui/core";
```

## Event batch version

Event batches (ZREV format) are versioned separately.

| Constant | Value | Description |
|----------|-------|-------------|
| `ZR_EVENT_BATCH_VERSION_V1` | `1` | Keyboard, mouse, and resize events |

```typescript
import { ZR_EVENT_BATCH_VERSION_V1 } from "@rezi-ui/core";
```

## Unicode version pin

Rezi pins a specific Unicode version for deterministic text measurement. Character widths, grapheme cluster boundaries, and East Asian width properties all depend on Unicode table data. Pinning a version ensures that the same string produces the same measured width on every platform and every run.

| Constant | Value |
|----------|-------|
| `ZR_UNICODE_VERSION_MAJOR` | `15` |
| `ZR_UNICODE_VERSION_MINOR` | `1` |
| `ZR_UNICODE_VERSION_PATCH` | `0` |

**Pinned version:** Unicode 15.1.0

Both the TypeScript core and the C engine must use tables derived from this Unicode version. A version mismatch would cause layout drift -- widgets would measure strings differently than the engine renders them.

```typescript
import {
  ZR_UNICODE_VERSION_MAJOR,
  ZR_UNICODE_VERSION_MINOR,
  ZR_UNICODE_VERSION_PATCH,
} from "@rezi-ui/core";
```

## Magic bytes

Each binary format has a 4-byte magic value at offset 0, stored as a little-endian `u32`:

| Constant | Hex value | ASCII (LE) | Format |
|----------|-----------|------------|--------|
| `ZRDL_MAGIC` | `0x4C44525A` | `ZRDL` | Drawlist |
| `ZREV_MAGIC` | `0x5645525A` | `ZREV` | Event batch |

The engine reads the first 4 bytes of any submitted buffer and rejects it immediately if the magic does not match the expected format.

```typescript
import { ZRDL_MAGIC, ZREV_MAGIC } from "@rezi-ui/core";
```

## Version validation flow

Both the builder and the engine perform version checks:

**Builder side (TypeScript):**

1. The builder writes the correct magic and version into the header at build time.
2. The version is determined by the selected builder version.
3. `createApp()` validates the backend `drawlistVersion` and requires version `>= 2`.

**Engine side (C):**

1. Read magic at offset 0. Reject with `ERR_FORMAT` if it does not match `ZRDL_MAGIC`.
2. Read version at offset 4. Reject with `ERR_UNSUPPORTED` if the version is not recognized.
3. Validate header size at offset 8. Reject if it does not match expected header size.
4. Process commands. Reject unknown opcodes with `ERR_UNSUPPORTED`.

## Import paths

All version constants are exported from the package root:

```typescript
import {
  // Engine ABI
  ZR_ENGINE_ABI_MAJOR,
  ZR_ENGINE_ABI_MINOR,
  ZR_ENGINE_ABI_PATCH,

  // Drawlist format
  ZR_DRAWLIST_VERSION_V1,
  ZR_DRAWLIST_VERSION_V2,

  // Event batch format
  ZR_EVENT_BATCH_VERSION_V1,

  // Unicode
  ZR_UNICODE_VERSION_MAJOR,
  ZR_UNICODE_VERSION_MINOR,
  ZR_UNICODE_VERSION_PATCH,

  // Magic bytes
  ZRDL_MAGIC,
  ZREV_MAGIC,

  // Cursor shapes
  ZR_CURSOR_SHAPE_BLOCK,
  ZR_CURSOR_SHAPE_UNDERLINE,
  ZR_CURSOR_SHAPE_BAR,
} from "@rezi-ui/core";
```

The source definitions live in `packages/core/src/abi.ts`.

## See also

- [Drawlists (ZRDL)](zrdl.md) -- format reference for ZRDL
- [Cursor](cursor.md) -- SET_CURSOR command details
- [Safety rules](safety.md) -- validation and error handling
- [ABI pins](abi.md) -- quick-reference constant table
