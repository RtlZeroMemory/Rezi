# `@rezi-ui/testkit`

Test utilities and fixtures for Rezi applications and package-level tests.

## What it provides

- **Fixtures** for protocol and drawlist tests (golden byte blobs)
- **Golden helpers** (`assertBytesEqual`, `hexdump`) for stable diffs
- **Deterministic fuzz helpers** (`runFuzz`, `fuzzTest`, `createRng`) for
  seeded fuzz-lite and failure-injection tests
- **Snapshot helper** (`matchesSnapshot`) for text-frame regression tests
- Convenience re-exports of Node’s `node:test` and `node:assert` APIs (Node-only)

## Typical usage

```ts
import { assert, describe, matchesSnapshot, readFixture, test } from "@rezi-ui/testkit";

describe("zrev parser", () => {
  test("accepts valid v1 fixture", async () => {
    const bytes = await readFixture("zrev-v1/valid/key.bin");
    assert.ok(bytes.byteLength > 0);
  });
});

test("snapshot rendered frame text", () => {
  matchesSnapshot("hello\nworld", "example-frame");
});
```

Seeded fuzz tests should use `runFuzz()` or `fuzzTest()` so failures include
the suite seed, iteration, derived case seed, and any notes needed to reproduce
the generated input. Seeds must be unsigned 32-bit integers.

```ts
import { assert, randomInt, runFuzz, test } from "@rezi-ui/testkit";

test("parser fuzz-lite", async () => {
  await runFuzz({ seed: 0x5a524556, iterations: 1000, label: "parser" }, (ctx) => {
    const bytes = ctx.rng.bytes(randomInt(ctx.rng, 0, 256));
    ctx.note(`len=${bytes.byteLength}`);
    assert.equal(typeof bytes.byteLength, "number");
  });
});
```

Snapshot files are stored at `<test-dir>/__snapshots__/<name>.txt`. Set
`UPDATE_SNAPSHOTS=1` to regenerate snapshots intentionally.

If you are writing tests outside this repo, prefer installing a released version that matches your `@rezi-ui/core` version.
