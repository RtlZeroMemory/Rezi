# ZRDL v3 Golden Fixtures

These fixtures are **byte-for-byte** golden buffers for the ZRDL v3 drawlist format.

Reference: [ZRDL drawlists](../../../../docs/protocol/zrdl.md)

Fixtures in `widgets/` are rendered through the widget pipeline using
`createDrawlistBuilderV3()` and are compared in tests via exact byte equality.

All integers are little-endian and all sections are 4-byte aligned. Any padding bytes
are `0x00`.
