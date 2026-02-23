# Event Batches (ZREV)

The engine emits input as a ZREV event batch — a binary format containing one or more input events.

## Event Types

ZREV batches contain these event record types:

| Record | Description |
|--------|-------------|
| Key | Keyboard input with key code and modifiers |
| Mouse | Mouse events (move, drag, down, up, wheel) with position and button state |
| Resize | Terminal size change |
| Tick | Animation timer |

### Mouse Event Records

Mouse records include:

- `x`, `y` — cursor position in terminal cells
- `mouseKind` — event type: move (1), drag (2), down (3), up (4), wheel (5)
- `mods` — modifier keys held (shift, ctrl, alt, meta)
- `buttons` — button state bitmask
- `wheelX`, `wheelY` — scroll deltas

## Parsing

Rezi parses ZREV deterministically:

- no reads past buffer end
- no unbounded allocations from untrusted sizes
- explicit, structured errors (no exceptions)

See:

- [Safety rules](safety.md)
- [Versioning](versioning.md)
- [Mouse Support guide](../guide/mouse-support.md)
