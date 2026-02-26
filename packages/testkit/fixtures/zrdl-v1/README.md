# ZRDL v1 Golden Fixtures

These fixtures are **byte-for-byte** golden buffers for the current ZRDL v1 drawlist
format.

Reference: [ZRDL drawlists](../../../../docs/protocol/zrdl.md)

## Protocol assumptions

- Header is fixed at 64 bytes.
- `strings_count`, `strings_span_off`, `strings_bytes_off`, `strings_bytes_len` are `0`.
- `blobs_count`, `blobs_span_off`, `blobs_bytes_off`, `blobs_bytes_len` are `0`.
- The payload is command-stream only.
- Variable-size command payloads (for `DEF_STRING`/`DEF_BLOB`) are padded to 4-byte alignment.

## Fixture groups

- `golden/` contains focused command-level cases for parser/writer determinism.
- `widgets/` contains larger widget-pipeline outputs compared by exact byte equality.

All fixtures are produced deterministically by `@rezi-ui/core` and are updated manually
when protocol changes are intentional.
