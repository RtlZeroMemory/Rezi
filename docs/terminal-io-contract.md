# Terminal I/O Contract

This document defines Rezi's terminal input contract.

Contract path:

1. Raw bytes arrive from a real PTY/ConPTY session.
2. Zireael normalizes bytes into ZREV batches.
3. Rezi parses those batches with `parseEventBatchV1`.
4. App/runtime routing consumes parsed events.

All behavior in this document is covered by deterministic integration tests in:

- `packages/node/src/__e2e__/terminal_io_contract.e2e.test.ts`
- `packages/node/src/__e2e__/fixtures/terminal-io-contract-target.ts`

## Constants

- Key codes follow `@rezi-ui/core/keybindings` / `include/zr/zr_event.h`.
- Modifier bitmask:
  - `SHIFT=1`
  - `CTRL=2`
  - `ALT=4`
  - `META=8`

## Keyboard Contract

### Byte-to-event mapping

| Input bytes | Expected parsed event(s) |
| --- | --- |
| `ESC [ 1 ; 5 A` | `{ kind: "key", key: ZR_KEY_UP, mods: ZR_MOD_CTRL, action: "down" }` |
| `ESC [ Z` | `{ kind: "key", key: ZR_KEY_TAB, mods: ZR_MOD_SHIFT, action: "down" }` |
| `ESC [ 9 ; 5 u` | `{ kind: "key", key: ZR_KEY_TAB, mods: ZR_MOD_CTRL, action: "down" }` |
| `ESC [ 13 ; 5 u` | `{ kind: "key", key: ZR_KEY_ENTER, mods: ZR_MOD_CTRL, action: "down" }` |
| `ESC [ 127 ; 5 u` | `{ kind: "key", key: ZR_KEY_BACKSPACE, mods: ZR_MOD_CTRL, action: "down" }` |
| `ESC [ 97 ; 3 u` | Alt/Meta text policy fallback: `ESC` key prefix then payload (`'a'` text or equivalent Alt key payload event) |
| `ESC [ 98 ; 9 u` | Alt/Meta text policy fallback: `ESC` key prefix then payload (`'b'` text or equivalent Meta key payload event) |

### ESC ambiguity/incomplete policy

- Incomplete supported escape prefixes are buffered.
- If a sequence is completed in a later read, it resolves as the completed key event.
- If a supported prefix remains incomplete at flush, fallback is deterministic:
  - emit `ESC` key
  - emit remaining bytes as text scalars (example: `ESC [` -> `ESC` key then `'['` text)

## Bracketed Paste Contract

### Framing

- Begin marker: `ESC [ 200 ~`
- End marker: `ESC [ 201 ~`
- Payload between markers produces one `paste` event:
  - `{ kind:"paste", bytes:<exact payload bytes> }`

### Missing end marker

- Missing end marker must not wedge input.
- Engine may finalize and emit a best-effort `paste` event with captured bytes, or drop the incomplete paste.
- Subsequent key/text input must continue normally.

### Max paste size behavior

- Paste capture is bounded by engine paste buffer capacity.
- On overrun, the oversized paste is dropped (no truncated `paste` event is emitted).
- Input stream continues after paste end or idle flush.

## Focus Contract

### Focus in/out

| Input bytes | Expected parsed event |
| --- | --- |
| `ESC [ I` | `{ kind:"key", key:30 /*FOCUS_IN*/, mods:0, action:"down" }` |
| `ESC [ O` | `{ kind:"key", key:31 /*FOCUS_OUT*/, mods:0, action:"down" }` |

### Gating

- Focus events are emitted when terminal capabilities report focus support.
- Rezi integration coverage asserts capability-gated suppression (`ZIREAEL_CAP_FOCUS_EVENTS=0`).
- Native runtime config gating (`enableFocusEvents`) is implemented by Zireael platform config.

## Mouse Contract (SGR)

| Input bytes | Expected parsed event |
| --- | --- |
| `ESC [ < 0 ; 300 ; 400 M` | `{ kind:"mouse", mouseKind:3 /*down*/, x:299, y:399, buttons:1 }` |
| `ESC [ < 0 ; 300 ; 400 m` | `{ kind:"mouse", mouseKind:4 /*up*/, x:299, y:399, buttons:1 }` |
| `ESC [ < 64 ; 400 ; 500 M` | `{ kind:"mouse", mouseKind:5 /*wheel*/, x:399, y:499, wheelY:1 }` |

Notes:

- SGR coordinates are 1-based on wire and normalized to 0-based in events.
- High coordinates must remain stable (no 223-column legacy clipping).

## Resize Contract

- Engine emits an initial resize event at startup.
- Subsequent terminal size changes emit `resize` events with latest cols/rows.
- Ordering expectation:
  - initial resize appears before later explicit resize updates
  - observed size values match PTY resize requests

## Split Reads / Partial Sequences

Examples (explicitly tested):

1. Split complete sequence across reads:
   - read #1: `ESC [`
   - read #2: `A`
   - expected output: one `UP` key event, no premature `ESC` fallback before completion.
2. Split incomplete sequence flushed without completion:
   - read #1: `ESC [`
   - no completion bytes
   - expected output after flush: `ESC` key event, then `'['` text event.
3. Split paste begin/content without end marker:
   - read #1: `ESC [ 200 ~ xyz`
   - no end marker
   - expected output: input remains live (and may include a best-effort paste flush).

## Platform Coverage

- Linux/macOS: full contract suite runs through real PTY.
- Windows: ConPTY-guarded test covers at least arrows/modifiers + bracketed paste.
  - If ConPTY path is unavailable in environment, tests skip with explicit reason.

## Startup input safety note (emoji width probe)

- By default, Rezi does **not** perform startup CPR probing for emoji width.
- CPR probing is opt-in (`ZRUI_EMOJI_WIDTH_PROBE=1`) because probing temporarily
  reads stdin bytes and can race startup-time input streams.
- The default contract therefore keeps startup input handling deterministic and
  unaffected by width probing.
