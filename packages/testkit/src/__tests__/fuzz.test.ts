import {
  FuzzFailureError,
  chance,
  createFuzzFaultPlan,
  deriveFuzzCaseSeed,
  fuzzTest,
  hexSeed,
  pick,
  randomAsciiString,
  randomInt,
  runFuzz,
} from "../fuzz.js";
import { assert, test } from "../nodeTest.js";

test("deriveFuzzCaseSeed: stable non-zero per iteration", () => {
  assert.equal(hexSeed(0x7a11_c001), "0x7a11c001");
  assert.equal(deriveFuzzCaseSeed(0x7a11_c001, 0), deriveFuzzCaseSeed(0x7a11_c001, 0));
  assert.notEqual(deriveFuzzCaseSeed(0x7a11_c001, 0), deriveFuzzCaseSeed(0x7a11_c001, 1));
  assert.notEqual(deriveFuzzCaseSeed(0, 0), 0);
});

test("fuzz seeds reject values outside uint32 range", async () => {
  assert.throws(() => hexSeed(0x1_0000_0000), /seed must be <= 0xffffffff/u);
  assert.throws(() => deriveFuzzCaseSeed(0x1_0000_0000, 0), /seed must be <= 0xffffffff/u);
  await assert.rejects(
    runFuzz({ seed: 0x1_0000_0000, iterations: 1, label: "bad-seed" }, () => {}),
    /seed must be <= 0xffffffff/u,
  );
});

test("runFuzz: deterministic case rng is independent per iteration", async () => {
  const first: number[] = [];
  const second: number[] = [];

  await runFuzz({ seed: 0x1234, iterations: 8, label: "first" }, (ctx) => {
    first.push(ctx.rng.u32());
  });
  await runFuzz({ seed: 0x1234, iterations: 8, label: "second" }, (ctx) => {
    second.push(ctx.rng.u32());
  });

  assert.deepEqual(first, second);
});

test("runFuzz: failure includes reproducible seed and notes", async () => {
  await assert.rejects(
    runFuzz({ seed: 0xfeed, iterations: 4, label: "failure-shape" }, (ctx) => {
      ctx.note("generated=bad-input");
      if (ctx.iteration === 2) throw new Error("boom");
    }),
    (err: unknown) => {
      assert.ok(err instanceof FuzzFailureError);
      assert.equal(err.seed, 0xfeed);
      assert.equal(err.iteration, 2);
      assert.equal(err.notes.includes("generated=bad-input"), true);
      assert.match(err.message, /failure-shape seed=0x0000feed iteration=2/u);
      assert.match(err.message, /generated=bad-input/u);
      return true;
    },
  );
});

test("fuzz helpers validate ranges and use deterministic choices", async () => {
  await runFuzz({ seed: 0x2026, iterations: 4, label: "helper-shape" }, (ctx) => {
    assert.equal(randomInt(ctx.rng, 3, 3), 3);
    assert.equal(chance(ctx.rng, 100), true);
    assert.equal(chance(ctx.rng, 0), false);
    assert.ok(["a", "b", "c"].includes(pick(ctx.rng, ["a", "b", "c"] as const)));
    const text = randomAsciiString(ctx.rng, { minLength: 2, maxLength: 8, alphabet: "ab" });
    assert.equal(text.length >= 2 && text.length <= 8, true);
    assert.match(text, /^[ab]+$/u);
  });
});

test("createFuzzFaultPlan: deterministic bounded fault selection", async () => {
  const plans: string[] = [];
  await runFuzz({ seed: 0x9bad, iterations: 6, label: "faults" }, (ctx) => {
    const plan = createFuzzFaultPlan(ctx, ["poll", "frame", "stop"] as const, {
      minFailures: 1,
      maxFailures: 2,
    });
    assert.equal(plan.selected.length >= 1 && plan.selected.length <= 2, true);
    for (const point of plan.selected) assert.equal(plan.has(point), true);
    plans.push(plan.describe());
  });

  const replayed: string[] = [];
  await runFuzz({ seed: 0x9bad, iterations: 6, label: "faults-replay" }, (ctx) => {
    replayed.push(
      createFuzzFaultPlan(ctx, ["poll", "frame", "stop"] as const, {
        minFailures: 1,
        maxFailures: 2,
      }).describe(),
    );
  });
  assert.deepEqual(plans, replayed);
});

test("createFuzzFaultPlan: duplicate points fail before sampling", async () => {
  await runFuzz({ seed: 0x9bad, iterations: 1, label: "fault-duplicates" }, (ctx) => {
    assert.throws(
      () => createFuzzFaultPlan(ctx, ["poll", "poll"] as const, { minFailures: 2 }),
      /points must be unique/u,
    );
  });
});

fuzzTest("fuzzTest delegates to runFuzz", { seed: 0x55aa, iterations: 3 }, (ctx) => {
  assert.equal(typeof ctx.caseSeed, "number");
});
