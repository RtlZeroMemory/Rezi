# Fuzzing

Rezi fuzz tests are deterministic, bounded `node:test` suites. They should use
`@rezi-ui/testkit` helpers so failures report:

- suite seed
- iteration
- derived case seed
- case notes such as input length, viewport, or injected fault points

Run all package fuzz suites after a build:

```bash
npm run test:fuzz
```

For a single built test file:

```bash
node --test packages/core/dist/protocol/__tests__/zrev_v1_fuzz_lite.test.js
```

## Coverage Targets

Keep fuzz targets behavior-first and contract-backed:

- parsers and binary protocols: never throw on malformed bytes; return
  structured errors
- binary readers/writers: preserve byte order, bounds checks, and failure
  atomicity
- layout/text/render paths: never throw on valid widget trees or malformed text
  data; outputs remain bounded and deterministic
- app runtime and backend integration: injected backend failures produce
  structured fatal events, stop safely, and dispose when the runtime faults

Do not add unbounded randomness or wall-clock-dependent fuzzing to CI. Increase
iteration counts through explicit seeds and focused profiles, not through
environment-dependent loops.
