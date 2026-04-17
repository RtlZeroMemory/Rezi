# Releasing

This document describes the tag-driven production release flow implemented in
`.github/workflows/release.yml`.

Releases cover:

- npm package publishing
- GitHub Releases (notes + artifacts)

The native addon release includes prebuilt `.node` binaries for the supported
platform matrix and packaging into `@rezi-ui/native`.

## Versioning

Rezi publishes:

- `@rezi-ui/core`
- `@rezi-ui/node`
- `@rezi-ui/native`
- `@rezi-ui/testkit`
- `@rezi-ui/jsx`
- `create-rezi`

The repo uses a single version across these publishable packages.

Update all workspace versions (including inter-package dependency pins):

```bash
node scripts/release-set-version.mjs 0.1.0-alpha.16
```

## Local Validation Before Tagging

The release workflow runs multiple jobs across Linux/macOS/Windows and Bun. The
smallest practical single-host parity check is to run the same blocking slices
that gate publish before you push the tag:

```bash
npm ci
npm run codegen:check
npm run lint
npm run typecheck
npm run build
npm test
npm run typecheck:ci
npm run typecheck:strict
npm run check:core-portability
npm run check:native-vendor
npm run check:unicode
npm run quality:guardrails
npm run quality:deps
npm run quality:api
npm run test:progress
npm run test:release-critical
npm run build:native
npm run test:release-critical:terminal
npm run smoke:create-rezi-templates
```

Notes:

- `npm run quality:deadcode` is advisory in the workflow. Run it when you want
  the same report locally, but it does not block publish.
- `npm run docs:build` is not part of the tag-driven release workflow. Docs are
  deployed separately by `docs.yml` on pushes to `main`.
- Cross-platform Node (`18`, `20`, `22`) and Bun coverage still comes from CI;
  the command block above is the local pre-tag gate.

## Native Pack Verification

The publish job does not use `npm pack --dry-run` for every package. Instead, it
assembles the native prebuild artifacts into `packages/native/` and then runs:

```bash
node scripts/verify-native-pack.mjs
```

That script is the canonical packaging check for `@rezi-ui/native`. It verifies:

1. the expected `.node` binaries are present on disk
2. `npm pack` includes the expected native files and no unexpected ones
3. the tarball installs cleanly and the addon loads in a temp project

For local host-only validation after building just your machine's native binary:

```bash
npm run build:native
node scripts/verify-native-pack.mjs --host-only
```

For full publish parity, copy the complete release binary set into
`packages/native/` first, then run the non-`--host-only` command above.

If you want an extra manual sanity pass for the other publishable packages, run
`npm pack --dry-run -w <workspace>`, but that is supplemental and not the
current release gate.

## Release Checklist

1. Sync versions with `node scripts/release-set-version.mjs <version>`.
2. Update `CHANGELOG.md`.
3. Run the local validation block above.
4. Verify native pack contents with the appropriate `verify-native-pack.mjs`
   mode for your local setup.
5. Tag the release and push the tag:

   ```bash
   git tag v0.1.0-alpha.16
   git push origin v0.1.0-alpha.16
   ```

6. Confirm the release workflow completes:
   - `quality-preflight`
   - `release-critical-suites`
   - `template-smoke`
   - `release-ci`
   - `bun`
   - native prebuild jobs
   - `publish (npm)`

## Publishing Requirements

- `NPM_TOKEN` available in repository secrets
- npm package access configured for the `@rezi-ui` scope
- GitHub workflow permissions allow package publish and release creation
