# `@rezi-ui/native`

Native addon:

- Rust + `napi-rs` binding
- vendored Zireael engine sources
- prebuilt `.node` binaries for supported targets
- static MSVC runtime linking for Windows prebuilds

## Install

You usually do not install this package directly.

When you install `@rezi-ui/node`, it pulls in `@rezi-ui/native` as a dependency:

```bash
npm i @rezi-ui/node
```

## Build from source (maintainers / fallback)

On a supported host with a working Rust toolchain:

```bash
npm run build:native
npm run test:native:smoke
```

## What this package owns

- The N-API bridge to the engine (Rust)
- Thread-safety boundaries and handle ownership
- Prebuilt binaries and packaging layout used by release automation

See also:

- [Native addon docs](../backend/native.md)
