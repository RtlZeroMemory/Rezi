# @rezi-ui/native

Rust + `napi-rs` Node-API addon that hosts the Zireael C engine and exposes a minimal, safe JS API for the Node backend.

This package is not used directly by most applications. Install and use `@rezi-ui/node`, which depends on this package.

## Local development

Build the native addon for your host platform:

```bash
npm -w @rezi-ui/native run build:native
```

Smoke test:

```bash
npm -w @rezi-ui/native run test:native:smoke
```

Vendoring integrity check:

```bash
npm run check:native-vendor
```

## Design and constraints

- Engine placement is controlled by `@rezi-ui/node` `executionMode` (`auto` | `worker` | `inline`).
- `executionMode: "auto"` selects inline when `fpsCap <= 30`, worker otherwise.
- All buffers across the boundary are caller-owned; binary formats are validated strictly.
- Native compilation reads `packages/native/vendor/zireael` (not `vendor/zireael`).
- `packages/native/vendor/VENDOR_COMMIT.txt` must match the `vendor/zireael` gitlink commit.

See:

- [Native addon docs](../../docs/backend/native.md)
- [Releasing](../../RELEASING.md)
