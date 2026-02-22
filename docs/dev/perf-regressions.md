# Perf Regressions

The CI performance gate protects the terminal rendering differentiators from silent regressions.

CI workflow: `.github/workflows/ci.yml`  
Job name: `perf regression gate`

## PR Gate Scope

The gate runs a reduced, deterministic benchmark profile:

- suite: `terminal`
- framework: `rezi-native`
- io mode: `stub` (default for CI determinism)
- required scenarios:
  - `terminal-rerender`
  - `terminal-frame-fill` (`dirtyLines=1` and `dirtyLines=40`)
  - `terminal-full-ui`
  - `terminal-strict-ui`
  - `terminal-virtual-list`
  - `terminal-table`

Profile source: `packages/bench/profiles/ci.json`

Coverage guardrail:
- `scripts/run-bench-ci.mjs` now validates terminal scenario manifest coverage.
- Every `terminal-*` scenario in the registry must be either:
  - listed in `requiredScenarios`, or
  - listed in `explicitExclusions` with a reason.

## Local Commands

Build first (bench runner lives in `packages/bench/dist`):

```bash
npm ci
npm run build
```

Run the reduced profile:

```bash
npm run bench:ci -- --output-dir .artifacts/bench/ci-local
```

Compare to baseline:

```bash
npm run bench:ci:compare -- \
  --baseline benchmarks/ci-baseline/results.json \
  --current .artifacts/bench/ci-local/results.json \
  --config benchmarks/ci-baseline/config.json \
  --report-json .artifacts/bench/ci-local/compare.json \
  --report-md .artifacts/bench/ci-local/compare.md
```

## Threshold Model

Threshold config: `benchmarks/ci-baseline/config.json`

Rules are `max(relative_regression * baseline, absolute_regression)` per metric:

- `timing.mean` is a **hard gate** (fails CI when exceeded).
- `timing.p95` is **advisory** by default (recorded in report, non-fatal).

This dual threshold prevents false failures from tiny absolute timing shifts on very fast scenarios, while still failing meaningful slowdowns.

## Artifacts

The CI job uploads artifacts on both success and failure:

- `.artifacts/bench/ci/results.json`
- `.artifacts/bench/ci/results.md`
- `.artifacts/bench/ci/compare.json`
- `.artifacts/bench/ci/compare.md`
- `.artifacts/bench/ci/manifest.json`
- `.artifacts/bench/ci/profile.json`

`compare.json` and `compare.md` include actionable rows with scenario, metric, baseline, current, delta, and threshold.

## Intentional Baseline Updates

Baseline path:

- `benchmarks/ci-baseline/results.json`
- `benchmarks/ci-baseline/results.md`

Update process:

1. Prefer CI-host refresh: download `perf-regression-artifacts` from the PR/job run and copy `results.json`/`results.md` into `benchmarks/ci-baseline/`.
2. Re-run compare against the updated baseline to verify zero hard regressions.
3. Keep threshold changes (`benchmarks/ci-baseline/config.json`) explicit in the same PR only when justified.
4. In PR description, include why baseline movement is intentional (feature/perf tradeoff, infra change, or expected engine shift).
