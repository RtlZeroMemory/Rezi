import { assert, randomInt, runFuzz, test } from "@rezi-ui/testkit";
import { parseEventBatchV1 } from "../zrev_v1.js";

test("parseEventBatchV1 fuzz-lite (seeded, bounded): never throws", async () => {
  const maxLen = 4096;
  const exhaustiveShortLengths = 65;
  const randomIters = 10_000;

  function check(bytes: Uint8Array): void {
    let res: ReturnType<typeof parseEventBatchV1>;
    try {
      res = parseEventBatchV1(bytes);
    } catch (err: unknown) {
      assert.fail(`parseEventBatchV1 threw: ${String(err)}`);
      return;
    }

    assert.equal(typeof res.ok, "boolean");
    if (res.ok) {
      assert.equal(typeof res.value.flags, "number");
      assert.ok(Array.isArray(res.value.events));
    } else {
      assert.equal(typeof res.error.code, "string");
      assert.equal(typeof res.error.offset, "number");
      assert.equal(typeof res.error.detail, "string");
    }
  }

  await runFuzz(
    {
      seed: 0x5a52_4556, // 'ZREV'
      iterations: exhaustiveShortLengths + randomIters,
      label: "parseEventBatchV1",
    },
    (ctx) => {
      const len =
        ctx.iteration < exhaustiveShortLengths ? ctx.iteration : randomInt(ctx.rng, 0, maxLen);
      ctx.note(`len=${String(len)}`);
      check(ctx.rng.bytes(len));
    },
  );
});
