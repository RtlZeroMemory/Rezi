# Releasing

This document describes the production release flow for Rezi.

Releases cover:

- npm package publishing
- GitHub Releases (notes + artifacts)

The native addon release includes prebuilt `.node` binaries for the supported platform matrix and packaging into `@rezi-ui/native`.

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

## Release checklist

1. Update versions and `CHANGELOG.md`.
2. Run local validation:

   ```bash
   npm ci
   npm run fmt
   npm run lint
   npm run typecheck
   npm run build
   npm test
   npm run build:native
   npm run test:native:smoke
   npm run check:unicode
   npm run docs:build
   ```

3. Verify publish contents:

   ```bash
   npm -w @rezi-ui/core pack --dry-run
   npm -w @rezi-ui/node pack --dry-run
   npm -w @rezi-ui/native pack --dry-run
   npm -w @rezi-ui/testkit pack --dry-run
   ```

4. Commit release metadata and tag:

   ```bash
   git tag v0.1.0-alpha.16
   git push origin v0.1.0-alpha.16
   ```

5. Confirm CI release workflow completes:
   - native prebuild matrix passes
   - npm publish steps pass
   - GitHub Release notes and assets are generated

Documentation deployment is handled separately by the docs workflow on pushes to
`main`, not by the npm release workflow.

## Publishing requirements

- `NPM_TOKEN` available in repository secrets
- npm package access configured for the `@rezi-ui` scope
- GitHub workflow permissions allow package publish and release creation
