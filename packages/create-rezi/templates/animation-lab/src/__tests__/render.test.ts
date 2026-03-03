import assert from "node:assert/strict";
import test from "node:test";
import { createTestRenderer } from "@rezi-ui/core/testing";
import { createInitialState, reduceAnimationLabState } from "../helpers/state.js";
import { renderReactorLab } from "../screens/reactor-lab.js";

test("animation lab screen renders core sections", () => {
  const state = createInitialState({ cols: 140, rows: 48 });
  const renderer = createTestRenderer({ viewport: { cols: 140, rows: 48 } });
  const output = renderer.render(renderReactorLab(state)).toText();

  assert.match(output, /__APP_NAME__/);
  assert.match(output, /Animation Lab/);
  assert.match(output, /controls: space\/p autoplay/);
});

test("animation lab screen renders after compact viewport resize", () => {
  const initial = createInitialState({ cols: 140, rows: 48 });
  const compact = reduceAnimationLabState(initial, {
    type: "apply-viewport",
    cols: 68,
    rows: 20,
  });
  const renderer = createTestRenderer({ viewport: { cols: 68, rows: 20 } });
  const output = renderer.render(renderReactorLab(compact)).toText();

  assert.match(output, /Animation Lab/);
  assert.match(output, /controls: space\/p autoplay/);
});
