import { assert, describe, test } from "@rezi-ui/testkit";
import {
  PERF_ENABLED,
  PERF_PHASES,
  perfCount,
  perfMarkEnd,
  perfMarkStart,
  perfNow,
  perfRecord,
  perfReset,
  perfSnapshot,
} from "../perf.js";

describe("perf instrumentation", () => {
  test("defines the canonical phase list", () => {
    assert.ok(PERF_PHASES.includes("commit"));
    assert.ok(PERF_PHASES.includes("layout"));
    assert.ok(PERF_PHASES.includes("render"));
    assert.ok(PERF_PHASES.includes("frame_build"));
    assert.ok(PERF_PHASES.includes("worker_roundtrip"));
  });

  test("perfNow is stable and non-negative", () => {
    const t = perfNow();
    assert.equal(Number.isFinite(t), true);
    assert.ok(t >= 0);
  });

  test("recording APIs are safe in both enabled and disabled modes", () => {
    perfReset();
    const token = perfMarkStart("commit");
    perfMarkEnd("commit", token);
    perfRecord("layout", 1.25);
    perfCount("test_counter");

    const snapshot = perfSnapshot();
    if (!PERF_ENABLED) {
      assert.deepEqual(snapshot.phases, {});
      assert.deepEqual(snapshot.counters, {});
      return;
    }

    const commit = snapshot.phases.commit;
    const layout = snapshot.phases.layout;
    assert.ok(commit !== undefined);
    assert.ok(layout !== undefined);
    // biome-ignore lint/complexity/useLiteralKeys: TypeScript requires bracket access for index-signature properties.
    assert.equal((snapshot.counters["test_counter"] ?? 0) >= 1, true);
  });

  test("rolling snapshots recompute max from the retained sample window", () => {
    perfReset();
    if (!PERF_ENABLED) {
      assert.deepEqual(perfSnapshot().phases, {});
      return;
    }

    for (let i = 0; i < 1100; i++) {
      perfRecord("commit", 10);
    }
    for (let i = 0; i < 1100; i++) {
      perfRecord("commit", 5);
    }

    const commit = perfSnapshot().phases.commit;
    assert.ok(commit !== undefined);
    assert.equal(commit?.max, 5);
    assert.deepEqual(commit?.worst10, Object.freeze(new Array(10).fill(5)));
  });

  test("perfReset clears retained samples and counters", () => {
    perfReset();
    perfRecord("layout", 3);
    perfCount("before_reset");
    perfReset();

    const snapshot = perfSnapshot();
    if (!PERF_ENABLED) {
      assert.deepEqual(snapshot.phases, {});
      assert.deepEqual(snapshot.counters, {});
      return;
    }

    assert.equal(snapshot.phases.layout, undefined);
    // biome-ignore lint/complexity/useLiteralKeys: TypeScript requires bracket access for index-signature properties.
    assert.equal(snapshot.counters["before_reset"], undefined);
  });
});
