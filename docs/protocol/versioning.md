# Versioning

Rezi pins versions at every binary boundary.

## Status

Rezi is pre-alpha. Public APIs and ABI-facing behavior may change between
releases.

## Engine ABI

Pinned to match Zireael:

- `ZR_ENGINE_ABI_MAJOR = 1`
- `ZR_ENGINE_ABI_MINOR = 2`
- `ZR_ENGINE_ABI_PATCH = 0`

## Drawlist (ZRDL)

Pinned drawlist version:

- `ZR_DRAWLIST_VERSION_V1 = 1`
- `ZR_DRAWLIST_VERSION_V2 = 2`

Rezi currently emits ZRDL v1, and the engine accepts v1/v2.
ZRDL v2 adds opcode `14` (`BLIT_RECT`).
Style link reference fields (`linkUriRef`, `linkIdRef`) are stable across v1/v2:
`0` means unset and positive values are 1-based string resource IDs.

## Event Batch (ZREV)

Pinned event version:

- `ZR_EVENT_BATCH_VERSION_V1 = 1`

## Unicode

Pinned Unicode tables:

- `ZR_UNICODE_VERSION_MAJOR = 15`
- `ZR_UNICODE_VERSION_MINOR = 1`
- `ZR_UNICODE_VERSION_PATCH = 0`

## Magic Values

- `ZRDL_MAGIC = 0x4c44525a`
- `ZREV_MAGIC = 0x5645525a`

## Validation Flow

At startup, Rezi and backends enforce:

1. Engine ABI major/minor/patch must match pinned values.
2. Drawlist version marker must be `1` or `2` (Rezi emits `1` today).
3. Event batch parsing expects `ZR_EVENT_BATCH_VERSION_V1`.

Any mismatch is rejected before frame processing.
