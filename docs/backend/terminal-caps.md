# Terminal Capabilities

The Zireael engine detects terminal capabilities at startup and surfaces them to the framework via the `TerminalCaps` type.

## Detected Capabilities

| Capability | Type | Description |
|------------|------|-------------|
| `colorMode` | `ColorMode` | Color depth (none, 16, 256, truecolor) |
| `supportsMouse` | `boolean` | Whether the terminal supports mouse tracking |
| `supportsBracketedPaste` | `boolean` | Whether bracketed paste mode is available |
| `supportsFocusEvents` | `boolean` | Whether terminal focus/blur events are reported |

## Mouse Support Detection

`supportsMouse` indicates whether the terminal can report mouse events (clicks, scroll wheel, movement, drag). When `true`, Rezi automatically enables mouse tracking and routes mouse events to widgets.

Most modern terminals support mouse tracking, including iTerm2, Alacritty, kitty, WezTerm, Windows Terminal, GNOME Terminal, and Konsole. Some older terminals or minimal configurations may not.

When `supportsMouse` is `false`, Rezi operates in keyboard-only mode. No special handling is needed — all interactive widgets work with keyboard navigation.

## Usage

Rezi uses these capabilities to:

- decide rendering strategies (color depth, optimized scroll sequences)
- enable or disable mouse tracking
- select feature fallbacks for unsupported capabilities

See also:

- `terminalCaps` export in `@rezi-ui/core`
- [Mouse Support guide](../guide/mouse-support.md)
