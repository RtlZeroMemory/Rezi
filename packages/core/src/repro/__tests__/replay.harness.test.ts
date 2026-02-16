import { assert, describe, readFixture, test } from "@rezi-ui/testkit";
import { ui } from "../../index.js";
import { createReproReplayDriver, parseReproBundleBytes, runReproReplayHarness } from "../index.js";
import type { ReproBundle } from "../types.js";

async function loadFixtureBundle(): Promise<ReproBundle> {
  const bytes = await readFixture("repro/replay_resize_tab_text.json");
  const parsed = parseReproBundleBytes(bytes);
  if (!parsed.ok) {
    throw new Error(`fixture parse failed: ${parsed.error.code}: ${parsed.error.detail}`);
  }
  return parsed.value;
}

function replayView() {
  return ui.column({}, [
    ui.input({ id: "name", value: "" }),
    ui.button({ id: "save", label: "Save" }),
  ]);
}

describe("repro replay harness", () => {
  test("driver replays deterministic step order without wall-clock dependency", async () => {
    const bundle = await loadFixtureBundle();
    const driver = createReproReplayDriver({
      bundle,
      view: replayView,
    });

    const s0 = driver.getState();
    assert.equal(s0.totalSteps, 3);
    assert.equal(s0.nextStep, 0);
    assert.equal(s0.done, false);
    assert.equal(s0.recordedElapsedMs, 0);

    const step0 = driver.step();
    assert.equal(step0.kind, "batch");
    if (step0.kind === "batch") {
      assert.equal(step0.step, 0);
      assert.equal(step0.deltaMs, 0);
      assert.equal(step0.done, false);
      assert.equal(step0.actions.length, 0);
    }

    const step1 = driver.step();
    assert.equal(step1.kind, "batch");
    if (step1.kind === "batch") {
      assert.equal(step1.step, 1);
      assert.equal(step1.deltaMs, 16);
      assert.equal(step1.done, false);
      assert.equal(step1.actions.length, 0);
    }

    const step2 = driver.step();
    assert.equal(step2.kind, "batch");
    if (step2.kind === "batch") {
      assert.equal(step2.step, 2);
      assert.equal(step2.deltaMs, 16);
      assert.equal(step2.done, true);
      assert.equal(step2.actions.length, 1);
      assert.deepEqual(step2.actions[0], {
        step: 2,
        eventIndex: 0,
        id: "name",
        action: "input",
        value: "A",
        cursor: 1,
      });
    }

    const done = driver.step();
    assert.deepEqual(done, {
      kind: "done",
      recordedElapsedMs: 32,
      done: true,
    });
  });

  test("harness PASS: expected action sequence + no-fatal/no-overrun invariants", async () => {
    const bundle = await loadFixtureBundle();
    const res = await runReproReplayHarness({
      bundle,
      view: replayView,
      expectedActions: [{ id: "name", action: "input", value: "A", cursor: 1 }],
      invariants: {
        noFatal: true,
        noOverrun: true,
      },
    });

    assert.equal(res.pass, true);
    assert.equal(res.status, "PASS");
    assert.deepEqual(res.mismatches, []);
    assert.equal(res.replay.fatal, null);
    assert.equal(res.replay.overruns.length, 0);
    assert.equal(res.replay.recordedElapsedMs, 32);
    assert.deepEqual(res.replay.actions, [
      { step: 2, eventIndex: 1, id: "name", action: "input", value: "A", cursor: 1 },
    ]);
  });

  test("harness FAIL includes action mismatch diff path/detail", async () => {
    const bundle = await loadFixtureBundle();
    const res = await runReproReplayHarness({
      bundle,
      view: replayView,
      expectedActions: [{ id: "name", action: "input", value: "B", cursor: 1 }],
      invariants: { noFatal: true, noOverrun: true },
    });

    assert.equal(res.pass, false);
    assert.equal(res.status, "FAIL");
    assert.ok(res.mismatches.length >= 1);

    const mismatch = res.mismatches.find((m) => m.code === "ZR_REPLAY_ACTION_MISMATCH");
    assert.notEqual(mismatch, undefined);
    if (!mismatch) return;
    assert.equal(mismatch.path, "$.actions[0]");
    assert.equal(
      mismatch.detail,
      'expected name:input(value="B",cursor=1); got name:input(value="A",cursor=1)',
    );
  });

  test("harness FAIL includes invariant path when overrun is present", async () => {
    const bundle = await loadFixtureBundle();
    const overrunBundle: ReproBundle = {
      ...bundle,
      eventCapture: {
        ...bundle.eventCapture,
        totals: {
          ...bundle.eventCapture.totals,
          runtimeDroppedBatches: 1,
        },
        batches: bundle.eventCapture.batches.map((b, i) =>
          i === 1 ? { ...b, droppedBatches: 1 } : b,
        ),
      },
    };

    const res = await runReproReplayHarness({
      bundle: overrunBundle,
      view: replayView,
      expectedActions: [{ id: "name", action: "input", value: "A", cursor: 1 }],
      invariants: { noOverrun: true },
    });

    assert.equal(res.pass, false);
    const mismatch = res.mismatches.find((m) => m.code === "ZR_REPLAY_INVARIANT_OVERRUN");
    assert.notEqual(mismatch, undefined);
    if (!mismatch) return;
    assert.equal(mismatch.path, "$.invariants.noOverrun");
    assert.equal(mismatch.detail, "replay observed 1 overrun batch(es)");
  });

  test("replay routes actions even when fixture has no resize events", async () => {
    const bundle = await loadFixtureBundle();
    const noResizeBundle: ReproBundle = {
      ...bundle,
      eventCapture: {
        ...bundle.eventCapture,
        totals: {
          ...bundle.eventCapture.totals,
          capturedBatches: 2,
          capturedEvents: 2,
          capturedBytes: 104,
        },
        batches: bundle.eventCapture.batches
          .filter((batch) => batch.resizeEvents.length === 0)
          .map((batch, idx) =>
            idx === 0 ? { ...batch, step: 0, deltaMs: 0 } : { ...batch, step: 1, deltaMs: 16 },
          ),
      },
    };

    const res = await runReproReplayHarness({
      bundle: noResizeBundle,
      view: replayView,
      expectedActions: [{ id: "name", action: "input", value: "A", cursor: 1 }],
      invariants: { noFatal: true, noOverrun: true },
    });

    assert.equal(res.pass, true);
    assert.deepEqual(res.replay.actions, [
      { step: 1, eventIndex: 1, id: "name", action: "input", value: "A", cursor: 1 },
    ]);
  });
});
