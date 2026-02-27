# Drawlists (ZRDL v1/v2)

Rezi builds a binary drawlist each frame and submits it to the engine.

## High-Level Model

ZRDL v1/v2 uses persistent engine resources.

- Frames do **not** carry per-frame string/blob tables.
- Frames can define/free resources with commands.
- Draw commands reference resource IDs.

## Header

ZRDL starts with a fixed 64-byte header (little-endian `u32` fields).

Required fields:

- `magic = ZRDL_MAGIC`
- `version = ZR_DRAWLIST_VERSION_V1` (`1`) or `ZR_DRAWLIST_VERSION_V2` (`2`)
- `header_size = 64`
- `total_size`, `cmd_offset`, `cmd_bytes`, `cmd_count` set consistently
- `strings_*` fields are all `0`
- `blobs_*` fields are all `0`
- `reserved0 = 0`

## Command Stream

Each command starts with an 8-byte command header:

- `opcode` (`u16`)
- `flags` (`u16`, must be `0`)
- `size` (`u32`, full command size)

Commands are 4-byte aligned.

## Opcodes

- `1` `CLEAR`
- `2` `FILL_RECT`
- `3` `DRAW_TEXT` (`stringId`, `byteOff`, `byteLen`)
- `4` `PUSH_CLIP`
- `5` `POP_CLIP`
- `6` `DRAW_TEXT_RUN` (`blobId`)
- `7` `SET_CURSOR`
- `8` `DRAW_CANVAS` (`blobId`)
- `9` `DRAW_IMAGE` (`blobId`)
- `10` `DEF_STRING` (`id`, `byteLen`, bytes, aligned padding)
- `11` `FREE_STRING` (`id`)
- `12` `DEF_BLOB` (`id`, `byteLen`, bytes, aligned padding)
- `13` `FREE_BLOB` (`id`)
- `14` `BLIT_RECT` (`srcX`, `srcY`, `w`, `h`, `dstX`, `dstY`) (v2+)

## Resource Lifecycle

- `DEF_*` defines or overwrites a resource ID.
- `FREE_*` invalidates that ID.
- Draw commands referencing unknown IDs fail.

## Style Payload Link References

Text-bearing commands carry style fields that include hyperlink references:

- `linkUriRef` (`u32`)
- `linkIdRef` (`u32`)

These fields use the same ID space as `DEF_STRING`/`FREE_STRING` and are
**1-based**:

- `0` means "no active link" (sentinel unset)
- `N > 0` maps to string resource ID `N`

Rezi encodes link references as `(internedIndex + 1)`, and Zireael resolves
them as direct string IDs. This is part of the v1/v2 wire contract and does
not introduce a new drawlist version.

## Codegen

Command layouts are defined in `scripts/drawlist-spec.ts`.
Generated writers live in `packages/core/src/drawlist/writers.gen.ts`.

Regenerate with:

```bash
npm run codegen
npm run codegen:check
```
