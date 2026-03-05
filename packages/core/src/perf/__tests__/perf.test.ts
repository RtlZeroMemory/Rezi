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
    assert.equal((snapshot.counters.test_counter ?? 0) >= 1, true);
  });
});
