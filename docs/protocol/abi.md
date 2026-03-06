# ABI Pins

The following exported constants from `@rezi-ui/core` must stay aligned with the
engine pins.

## Version Pins

| Constant | Value | Notes |
|---|---:|---|
| `ZR_ENGINE_ABI_MAJOR` | `1` | Engine ABI major |
| `ZR_ENGINE_ABI_MINOR` | `2` | Engine ABI minor |
| `ZR_ENGINE_ABI_PATCH` | `0` | Engine ABI patch |
| `ZR_DRAWLIST_VERSION_V1` | `1` | ZRDL v1 |
| `ZR_EVENT_BATCH_VERSION_V1` | `1` | ZREV v1 |
| `ZR_UNICODE_VERSION_MAJOR` | `15` | Unicode major |
| `ZR_UNICODE_VERSION_MINOR` | `1` | Unicode minor |
| `ZR_UNICODE_VERSION_PATCH` | `0` | Unicode patch |

## Magic Values

| Constant | Value | Meaning |
|---|---:|---|
| `ZRDL_MAGIC` | `0x4c44525a` | `ZRDL` |
| `ZREV_MAGIC` | `0x5645525a` | `ZREV` |

## Drawlist Version Rule

Rezi currently exports and emits drawlist v1. The engine-side pins additionally
accept `ZR_DRAWLIST_VERSION_V2` for native validation.

## Result Codes

Engine calls return `ZrResult`:

- `OK = 0`
- `ERR_INVALID_ARGUMENT = -1`
- `ERR_OOM = -2`
- `ERR_LIMIT = -3`
- `ERR_UNSUPPORTED = -4`
- `ERR_FORMAT = -5`
- `ERR_PLATFORM = -6`
