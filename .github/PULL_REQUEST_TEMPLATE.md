## Summary

<!-- What does this change do, and why? -->

## Checklist

- [ ] `npm run lint` passes
- [ ] `npm run typecheck` passes
- [ ] `npm test` passes (or change is docs/CI-only)
- [ ] Behavior-first test review done:
  contract source is named, observable outcome is asserted, test fidelity matches user-visible behavior, failure/degraded-path expectation is covered, and the test still makes sense after a refactor
- [ ] Docs updated (`README.md` and/or `docs/`)
- [ ] `npm run docs:build` passes (docs changes)
- [ ] Module boundaries preserved (`packages/core` has no Node APIs)
- [ ] Binary safety rules followed (bounds checks, caps, determinism)
