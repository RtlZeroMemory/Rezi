# Repro Replay

Repro replay fixtures validate deterministic headless record/replay behavior.

## Fixture Source

- replay fixtures: `packages/testkit/fixtures/repro/*.json`
- primary replay harness test: `packages/core/src/repro/__tests__/replay.harness.test.ts`

The fixture currently exercised by the harness is:

- `packages/testkit/fixtures/repro/replay_resize_tab_text.json`

## CI Gate

Every PR runs an explicit replay gate in `.github/workflows/ci.yml`:

- job: `node <version> / ubuntu-latest`
- step: `Repro replay fixtures (headless, explicit gate)`
- command:

```bash
CONCURRENCY=$(node -p "parseInt(process.versions.node)>=19?'--test-concurrency=1':''")
node --test $CONCURRENCY packages/core/dist/repro/__tests__/replay.harness.test.js
```

`npm run test` also covers this area, but this dedicated step keeps replay coverage visible as a standalone gate.

## Local Run

```bash
npm ci
npm run build
CONCURRENCY=$(node -p "parseInt(process.versions.node)>=19?'--test-concurrency=1':''")
node --test $CONCURRENCY packages/core/dist/repro/__tests__/replay.harness.test.js
```

Optional schema/version checks:

```bash
node --test $CONCURRENCY packages/core/dist/repro/__tests__/schema.versioning.test.js
```

## Updating Replay Fixtures

Follow the golden fixture policy in `packages/testkit/fixtures/README.md`:

1. Update fixture JSON intentionally (no auto-regeneration in committed tests).
2. Re-run replay harness and related tests.
3. Include fixture diff context and reasoning in the PR.
