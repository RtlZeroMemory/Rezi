# Releasing

This document describes the production release flow for Rezi.

Releases cover:

- npm package publishing
- GitHub Releases (notes + artifacts)
- documentation deployment

The native addon release includes prebuilt `.node` binaries for the supported platform matrix and packaging into `@rezi-ui/native`.

## Versioning

Rezi publishes:

- `@rezi-ui/core`
- `@rezi-ui/node`
- `@rezi-ui/native`
- `@rezi-ui/testkit`

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

## Publishing requirements

- `NPM_TOKEN` available in repository secrets
- npm package access configured for the `@rezi-ui` scope
- GitHub workflow permissions allow package publish and release creation

## One-commit repository export (new OSS repository)

If you need to move Rezi into a brand-new repository with a clean single-commit history:

```bash
# from current repository root
tmp_dir=$(mktemp -d)
git archive --format=tar HEAD | (cd "$tmp_dir" && tar -xf -)
cd "$tmp_dir"
git init
git add .
git commit -m "Initial public import of Rezi"
git branch -M main
git remote add origin <NEW_REPOSITORY_URL>
git push -u origin main --force
```

This preserves current source/docs state while intentionally resetting commit history to one initial commit.
