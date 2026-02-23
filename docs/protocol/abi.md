# ABI

Rezi pins a small set of ABI constants that must match the Zireael engine. These values are exported from `@rezi-ui/core` so wrappers and tooling can validate compatibility.

## Version pins

| Constant | Value | Notes |
|---|---:|---|
| `ZR_ENGINE_ABI_MAJOR` | `1` | Engine ABI major version |
| `ZR_ENGINE_ABI_MINOR` | `1` | Engine ABI minor version |
| `ZR_ENGINE_ABI_PATCH` | `0` | Engine ABI patch version |
| `ZR_DRAWLIST_VERSION_V1` | `1` | ZRDL v1 drawlist format |
| `ZR_DRAWLIST_VERSION_V2` | `2` | ZRDL v2 drawlist format |
| `ZR_EVENT_BATCH_VERSION_V1` | `1` | ZREV v1 event batch format |
| `ZR_UNICODE_VERSION_MAJOR` | `15` | Unicode version (major) |
| `ZR_UNICODE_VERSION_MINOR` | `1` | Unicode version (minor) |
| `ZR_UNICODE_VERSION_PATCH` | `0` | Unicode version (patch) |

## Magic numbers

| Constant | Value | Meaning |
|---|---:|---|
| `ZRDL_MAGIC` | `0x4c44525a` | "ZRDL" as little-endian u32 |
| `ZREV_MAGIC` | `0x5645525a` | "ZREV" as little-endian u32 |

## Cursor shapes

| Constant | Value | Meaning |
|---|---:|---|
| `ZR_CURSOR_SHAPE_BLOCK` | `0` | Block cursor |
| `ZR_CURSOR_SHAPE_UNDERLINE` | `1` | Underline cursor |
| `ZR_CURSOR_SHAPE_BAR` | `2` | Bar cursor |

## Result codes

`ZrResult` values are returned by engine FFI calls.

| Name | Value | Meaning |
|---|---:|---|
| `OK` | `0` | Success |
| `ERR_INVALID_ARGUMENT` | `-1` | Invalid argument or impossible value |
| `ERR_OOM` | `-2` | Allocation failed |
| `ERR_LIMIT` | `-3` | Buffer too small or cap exceeded |
| `ERR_UNSUPPORTED` | `-4` | Unknown version/opcode/feature |
| `ERR_FORMAT` | `-5` | Malformed binary data |
| `ERR_PLATFORM` | `-6` | OS/terminal error |

## Key codes & modifiers

Key code and modifier constants are ABI-pinned and exported from `@rezi-ui/core`.

### Special keys

| Key | Code |
|---|---:|
| `ZR_KEY_UNKNOWN` | `0` |
| `ZR_KEY_ESCAPE` | `1` |
| `ZR_KEY_ENTER` | `2` |
| `ZR_KEY_TAB` | `3` |
| `ZR_KEY_BACKSPACE` | `4` |

### Navigation keys

| Key | Code |
|---|---:|
| `ZR_KEY_INSERT` | `10` |
| `ZR_KEY_DELETE` | `11` |
| `ZR_KEY_HOME` | `12` |
| `ZR_KEY_END` | `13` |
| `ZR_KEY_PAGE_UP` | `14` |
| `ZR_KEY_PAGE_DOWN` | `15` |

### Arrow keys

| Key | Code |
|---|---:|
| `ZR_KEY_UP` | `20` |
| `ZR_KEY_DOWN` | `21` |
| `ZR_KEY_LEFT` | `22` |
| `ZR_KEY_RIGHT` | `23` |

### Function keys

| Key | Code |
|---|---:|
| `ZR_KEY_F1` | `100` |
| `ZR_KEY_F2` | `101` |
| `ZR_KEY_F3` | `102` |
| `ZR_KEY_F4` | `103` |
| `ZR_KEY_F5` | `104` |
| `ZR_KEY_F6` | `105` |
| `ZR_KEY_F7` | `106` |
| `ZR_KEY_F8` | `107` |
| `ZR_KEY_F9` | `108` |
| `ZR_KEY_F10` | `109` |
| `ZR_KEY_F11` | `110` |
| `ZR_KEY_F12` | `111` |

### ASCII keys

Printable ASCII keys use their codepoints:

- `ZR_KEY_SPACE` is `32`
- Letters `A-Z` use `65-90`
- Digits `0-9` use `48-57`
- Common punctuation/symbols use `32-126`

### Modifiers (bitmask)

| Modifier | Bit |
|---|---:|
| `ZR_MOD_SHIFT` | `1 << 0` |
| `ZR_MOD_CTRL` | `1 << 1` |
| `ZR_MOD_ALT` | `1 << 2` |
| `ZR_MOD_META` | `1 << 3` |

When a ZREV key event is parsed, `mods` is the bitmask of these flags.

### Key name mapping

The parser accepts the following key names in keybinding strings:

- `escape`, `esc`
- `enter`, `return`
- `tab`, `backspace`, `space`
- `insert`, `delete`, `del`, `home`, `end`, `pageup`, `pagedown`
- `up`, `down`, `left`, `right`
- `f1` ... `f12`

Modifier names accepted in keybinding strings:

- `shift`
- `ctrl`, `control`
- `alt`
- `meta`, `cmd`, `command`, `win`, `super`

## ZREV record kinds

ZREV events use a numeric record kind in the binary format:

| Kind | Value | Meaning |
|---|---:|---|
| `key` | `1` | Key press/release/repeat |
| `text` | `2` | Unicode codepoint input |
| `paste` | `3` | Bracketed paste bytes |
| `mouse` | `4` | Mouse move/click/drag/scroll |
| `resize` | `5` | Terminal size change |
| `tick` | `6` | Frame timing delta |
| `user` | `7` | App-defined payload |

Mouse kinds:

| Mouse kind | Value |
|---|---:|
| `move` | `1` |
| `drag` | `2` |
| `down` | `3` |
| `up` | `4` |
| `wheel` | `5` |

## Related

- [Protocol overview](index.md)
- [Drawlists (ZRDL)](zrdl.md)
- [Event batches (ZREV)](zrev.md)
- [Versioning](versioning.md)
- [API reference](../api/reference/index.html)
