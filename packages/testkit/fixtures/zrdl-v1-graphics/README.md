# ZRDL v1 Graphics Fixtures

These fixtures are **byte-for-byte** golden buffers for the current ZRDL v1 drawlist
format.

Reference: [ZRDL drawlists](../../../../docs/protocol/zrdl.md)

Fixtures in `widgets/` are rendered through the widget pipeline using
`createDrawlistBuilderV1()` and are compared in tests via exact byte equality.

All integers are little-endian and all sections are 4-byte aligned. Any padding bytes
are `0x00`.
