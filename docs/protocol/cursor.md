# Cursor Protocol

Rezi uses the **SET_CURSOR** command to control the terminal cursor position,
visibility, shape, and blink state from the TypeScript renderer.

## SET_CURSOR command

**Opcode:** 7 (`OP_SET_CURSOR`)

**Total size:** 20 bytes (8-byte command header + 12-byte payload)

### Payload layout

| Offset | Size | Type | Field | Description |
|--------|------|------|-------|-------------|
| 8 | 4 | `i32` | `x` | 0-based cell column; `-1` = leave unchanged |
| 12 | 4 | `i32` | `y` | 0-based cell row; `-1` = leave unchanged |
| 16 | 1 | `u8` | `shape` | Cursor shape constant |
| 17 | 1 | `u8` | `visible` | `1` = show, `0` = hide |
| 18 | 1 | `u8` | `blink` | `1` = blinking, `0` = steady |
| 19 | 1 | `u8` | `reserved0` | Must be `0` |

The command is 20 bytes total, which is 4-byte aligned (no padding needed).

### Special values

- **x = -1 or y = -1:** The engine leaves that coordinate unchanged from the previous frame.
- **visible = 0:** Hides the cursor until a later command sets `visible = 1`.

## Cursor shape constants

The `shape` field accepts the following values, defined in `packages/core/src/abi.ts`:

| Constant | Value | Description |
|----------|-------|-------------|
| `ZR_CURSOR_SHAPE_BLOCK` | `0` | Block cursor (full cell) |
| `ZR_CURSOR_SHAPE_UNDERLINE` | `1` | Underline cursor (bottom of cell) |
| `ZR_CURSOR_SHAPE_BAR` | `2` | Bar cursor (left edge of cell) |

The TypeScript type is:

```typescript
export type CursorShape = 0 | 1 | 2;
```

!!! note
    If the terminal does not support cursor shaping, the engine ignores `shape`
    and uses the terminal default cursor appearance.

## Runtime behavior

- The widget renderer resolves cursor targets from focused inputs/editors and
  emits `SET_CURSOR` when visible.
- If no widget requests a cursor, the renderer emits a hide cursor command.
- Node/Bun defaults to drawlist v5, so cursor protocol support is available by
  default.

## Default cursor shapes

The framework provides context-specific defaults in `CURSOR_DEFAULTS`:

| Context | Shape | Blink | Use case |
|---------|-------|-------|----------|
| `input` | `2` (BAR) | `true` | Text input fields |
| `selection` | `0` (BLOCK) | `true` | Selection-mode cursors |
| `staticUnderline` | `1` (UNDERLINE) | `false` | Non-blinking indicator |

```typescript
import { CURSOR_DEFAULTS } from "@rezi-ui/core";

// CURSOR_DEFAULTS.input       => { shape: 2, blink: true }
// CURSOR_DEFAULTS.selection   => { shape: 0, blink: true }
// CURSOR_DEFAULTS.staticUnderline => { shape: 1, blink: false }
```

## See also

- [Drawlists (ZRDL)](zrdl.md) -- full ZRDL format reference
- [Versioning](versioning.md) -- protocol and ABI version table
