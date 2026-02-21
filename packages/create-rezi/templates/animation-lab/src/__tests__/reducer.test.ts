import assert from "node:assert/strict";
import test from "node:test";
import { createInitialState, reduceAnimationLabState } from "../helpers/state.js";

test("animation lab reducer advances and keeps bounds", () => {
  const initial = createInitialState();
  const next = reduceAnimationLabState(initial, { type: "advance" });

  assert.equal(next.tick, 1);
  assert.ok(next.fluxTarget >= 0 && next.fluxTarget <= 1);
  assert.ok(next.orbitTarget >= 0 && next.orbitTarget <= 1);
  assert.ok(next.burstTarget >= 0 && next.burstTarget <= 1);
  assert.ok(next.driftTarget >= -1 && next.driftTarget <= 1);
});

test("animation lab reducer applies viewport", () => {
  const initial = createInitialState({ cols: 96, rows: 32 });
  const resized = reduceAnimationLabState(initial, {
    type: "apply-viewport",
    cols: 70,
    rows: 20,
  });

  assert.equal(resized.viewportCols, 70);
  assert.equal(resized.viewportRows, 20);
  assert.ok(resized.panelWidth <= 66);
  assert.ok(resized.panelHeight <= 18);
});

test("animation lab reducer supports nudge and phase cycle", () => {
  const initial = createInitialState();
  const nudged = reduceAnimationLabState(initial, {
    type: "nudge",
    payload: { driftDelta: 0.3, fluxDelta: 0.1, orbitDelta: 0.1 },
  });
  const cycled = reduceAnimationLabState(nudged, { type: "cycle-phase" });

  assert.equal(cycled.phase, 1);
  assert.ok(cycled.driftTarget > initial.driftTarget);
  assert.ok(cycled.fluxTarget > initial.fluxTarget);
});
