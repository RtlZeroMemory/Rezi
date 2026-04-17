# Releasing

The canonical release runbook lives in [docs/dev/releasing.md](docs/dev/releasing.md).

Typical release flow:

1. Sync versions with `node scripts/release-set-version.mjs <version>`.
2. Update `CHANGELOG.md`.
3. Run the validation steps from `docs/dev/releasing.md`.
4. Tag `v<version>` and push the tag.

Use this root file as a pointer only; keep the detailed release procedure in `docs/dev/releasing.md`.
