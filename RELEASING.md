# Releasing

How to publish Rezi packages to npm.

## Prerequisites

- Push access to the repository
- `NPM_TOKEN` secret configured in the GitHub repo settings (Settings → Secrets → Actions)
  - Generate a token at https://www.npmjs.com/ → Access Tokens → Granular Access Token
  - The token needs publish access to the `@rezi-ui` scope and `create-rezi`

## Creating a release

Push a version tag. The CI handles everything else (version sync, native builds, publish):

```bash
git tag v0.1.0-alpha.1
git push origin v0.1.0-alpha.1
```

That's it. The `release` workflow will:

1. Create a GitHub Release with auto-generated notes
2. Build native prebuilds for 6 platforms (linux-x64, linux-arm64, darwin-x64, darwin-arm64, win32-x64, win32-arm64)
3. Run smoke tests on each platform
4. Sync all `package.json` versions to match the tag (via `scripts/release-set-version.mjs`)
5. Build TypeScript
6. Assemble native binaries and verify pack contents
7. Publish all 6 packages to npm in dependency order

## Packages published

In order:

1. `@rezi-ui/core` — no internal deps
2. `@rezi-ui/native` — no internal deps
3. `@rezi-ui/testkit` — no internal deps
4. `@rezi-ui/node` — depends on core + native
5. `@rezi-ui/jsx` — depends on core
6. `create-rezi` — CLI scaffolding tool

`@rezi-ui/bench` is private and never published.

## Version format

Tags must start with `v` followed by a valid semver version:

- `v0.1.0-alpha.1` — prerelease
- `v0.1.0` — stable
- `v1.0.0-beta.0` — prerelease

The `v` prefix is stripped automatically when setting package versions.

## Dry run (local)

To check what would be published without actually publishing:

```bash
npm run build
npm publish --dry-run -w @rezi-ui/core
npm publish --dry-run -w @rezi-ui/node
# etc.
```

For the native package, you need local `.node` binaries:

```bash
npm run build:native
node scripts/verify-native-pack.mjs --host-only
npm publish --dry-run -w @rezi-ui/native
```

## Recovery from partial failure

If the workflow fails partway through publishing (e.g. package #4 fails but #1-3 succeeded):

1. Fix the issue
2. Bump to the next version tag (you cannot re-publish the same version to npm)
3. Push the new tag

npm does not allow overwriting published versions. If a version is partially published, bump to a new version (e.g. `v0.1.0-alpha.1` → `v0.1.0-alpha.2`).

## Manual version sync

If you need to update versions locally without publishing:

```bash
node scripts/release-set-version.mjs 0.1.0-alpha.1
```

This updates `version` in all workspace `package.json` files and syncs `@rezi-ui/*` dependency references.
