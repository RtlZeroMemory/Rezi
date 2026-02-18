import { assert, describe, test } from "@rezi-ui/testkit";
import {
  computePanelCellSizes,
  handleDividerDrag,
  hitTestDivider,
  sizesToPercentages,
} from "../../widgets/splitPane.js";

describe("mouse drag (split pane, deterministic pinned math)", () => {
  test("pinned: split pane start sizes are computed deterministically", () => {
    const res = computePanelCellSizes(2, Object.freeze([50, 50]), 21, "percent", 1);
    assert.deepEqual(res.sizes, [10, 10]);
    assert.deepEqual(res.dividerPositions, [10]);
  });

  test("pinned threshold behavior: zero delta is a no-op on sizes", () => {
    const start = Object.freeze([10, 10]);
    const next = handleDividerDrag(start, 0, 0);
    assert.deepEqual(next, [10, 10]);
  });

  test("drag right increases left panel and decreases right panel", () => {
    const next = handleDividerDrag(Object.freeze([10, 10]), 0, 3);
    assert.deepEqual(next, [13, 7]);
  });

  test("drag left decreases left panel and increases right panel", () => {
    const next = handleDividerDrag(Object.freeze([10, 10]), 0, -4);
    assert.deepEqual(next, [6, 14]);
  });

  test("lifecycle pin: repeated move events use drag-start baseline (no drift)", () => {
    const start = Object.freeze([10, 10]);
    const move1 = handleDividerDrag(start, 0, 1);
    const move2 = handleDividerDrag(start, 0, 2);
    assert.deepEqual(move1, [11, 9]);
    assert.deepEqual(move2, [12, 8]);
  });

  test("repeated drags across sessions compose deterministically", () => {
    const firstDrag = handleDividerDrag(Object.freeze([10, 10]), 0, 3);
    const secondDrag = handleDividerDrag(firstDrag, 0, -2);
    assert.deepEqual(firstDrag, [13, 7]);
    assert.deepEqual(secondDrag, [11, 9]);
  });

  test("min clamp prevents left panel from shrinking below min", () => {
    const next = handleDividerDrag(Object.freeze([8, 12]), 0, -10, Object.freeze([5, 0]));
    assert.deepEqual(next, [5, 15]);
  });

  test("min clamp prevents right panel from shrinking below min", () => {
    const next = handleDividerDrag(Object.freeze([8, 12]), 0, 10, Object.freeze([0, 4]));
    assert.deepEqual(next, [16, 4]);
  });

  test("max clamp prevents left panel from growing beyond max", () => {
    const next = handleDividerDrag(
      Object.freeze([8, 12]),
      0,
      10,
      undefined,
      Object.freeze([10, 100]),
    );
    assert.deepEqual(next, [10, 10]);
  });

  test("max clamp prevents right panel from growing beyond max on negative delta", () => {
    const next = handleDividerDrag(
      Object.freeze([8, 12]),
      0,
      -10,
      undefined,
      Object.freeze([100, 13]),
    );
    assert.deepEqual(next, [7, 13]);
  });

  test("out-of-bounds divider index (negative) is non-draggable and returns original", () => {
    const start = Object.freeze([10, 10]);
    const next = handleDividerDrag(start, -1, 4);
    assert.equal(next, start);
  });

  test("out-of-bounds divider index (too large) is non-draggable and returns original", () => {
    const start = Object.freeze([10, 10]);
    const next = handleDividerDrag(start, 1, 4);
    assert.equal(next, start);
  });

  test("single-panel split path is non-draggable", () => {
    const start = Object.freeze([20]);
    const next = handleDividerDrag(start, 0, 5);
    assert.equal(next, start);
  });

  test("divider hit test returns divider index inside expanded hit area", () => {
    // divider at x=10 with dividerSize=1 and expand=1 => hit range [9, 12)
    const hit = hitTestDivider(9, Object.freeze([10]), 1);
    assert.equal(hit, 0);
  });

  test("divider hit test returns null outside hit area", () => {
    const hit = hitTestDivider(12, Object.freeze([10]), 1);
    assert.equal(hit, null);
  });

  test("percent-mode resize pin: cell deltas convert to stable percentages", () => {
    const startCells = computePanelCellSizes(2, Object.freeze([50, 50]), 21, "percent", 1).sizes;
    const draggedCells = handleDividerDrag(startCells, 0, 3);
    const nextPercentages = sizesToPercentages(draggedCells);
    assert.deepEqual(nextPercentages, [65, 35]);
  });
});
