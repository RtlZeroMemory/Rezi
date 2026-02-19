# Cursor (drawlist v2)

Drawlist v2 introduces the **SET_CURSOR** command, which gives the TypeScript core explicit control over the terminal cursor's position, visibility, shape, and blink state. In v1, input widgets had to render "fake cursor" glyphs; v2 delegates cursor display to the engine, which drives the terminal's native cursor.

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

- **x = -1 or y = -1:** The engine leaves that coordinate unchanged from the previous frame. This allows updating visibility or shape without repositioning.
- **visible = 0:** Hides the cursor regardless of position. The engine will not display a cursor until a subsequent SET_CURSOR with `visible = 1`.

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
    If the terminal does not support cursor shaping (e.g., some minimal terminal emulators), the engine will ignore the `shape` field and use the terminal's default cursor appearance.

## Framework-level cursor state

The cursor protocol is driven by a **CursorStateCollector** that accumulates cursor requests from widgets during each render frame.

### CursorStateCollector interface

```typescript
interface CursorStateCollector {
  /** Widget requests cursor at a position with given appearance. */
  request(req: CursorRequest): void;

  /** Resolve the final cursor state after all widgets have rendered. */
  resolve(): CursorState | null;

  /** Reset for the next frame. */
  reset(): void;
}
```

### CursorRequest type

Widgets emit one of two request kinds:

```typescript
type CursorRequest =
  | Readonly<{ kind: "show"; x: number; y: number; shape: CursorShape; blink: boolean }>
  | Readonly<{ kind: "hide" }>;
```

### Resolution policy: last writer wins

Multiple widgets may request cursor state during a single frame. The resolution policy is **last writer wins**: the final `request()` call before `resolve()` determines the cursor state for that frame.

This means:

1. Widgets rendered later in the tree override earlier requests.
2. A focused input widget near the end of the render pass will naturally "win" the cursor.
3. An explicit `{ kind: "hide" }` request clears the cursor regardless of prior show requests.
4. If no widget requests a cursor, `resolve()` returns `null` and no SET_CURSOR command is emitted.

### CursorState output

The resolved state is passed to the v2 builder's `setCursor()` method:

```typescript
type CursorState = Readonly<{
  x: number;       // 0-based cell column; -1 = leave unchanged
  y: number;       // 0-based cell row; -1 = leave unchanged
  shape: CursorShape;
  visible: boolean;
  blink: boolean;
}>;
```

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

## Input widget cursor positioning

The `computeInputCursorPosition()` helper calculates screen coordinates for a text input cursor:

```typescript
function computeInputCursorPosition(
  inputX: number,    // X position of the input field
  inputY: number,    // Y position of the input field
  cursorOffset: number, // Character offset within the input value
  prefix = 0,        // Width of prefix before editable area (e.g., label)
): Readonly<{ x: number; y: number }>;
```

The returned position accounts for the input's screen origin, any label prefix, and the cursor's character offset within the input value.

## Enabling v2

Drawlist v2 is opt-in. To enable it, set `useV2Cursor: true` in the app configuration:

```typescript
import { createApp } from "@rezi-ui/core";

const app = createApp({
  backend: myBackend,
  initialState: myInitialState,
  config: {
    useV2Cursor: true,
  },
});

app.view(myView);
```

!!! warning
    The backend must also support v2. If the app config enables v2 but the backend does not (or vice versa), `createApp` will throw a `ZRUI_INVALID_PROPS` error with a diagnostic message explaining the mismatch.

When v2 is disabled (the default), the builder is a v1 instance and SET_CURSOR is not available. Widgets must render cursor glyphs manually.

When v2 is enabled:

- The builder writes `version = 2` in the ZRDL header.
- The `setCursor()` and `hideCursor()` methods become available.
- The widget renderer automatically resolves cursor state via `CursorStateCollector` and appends a SET_CURSOR command if any widget requested a cursor.

## See also

- [Drawlists (ZRDL)](zrdl.md) -- full ZRDL format reference
- [Versioning](versioning.md) -- v1 vs v2 version semantics
