import { assert, describe, test } from "@rezi-ui/testkit";
import {
  computePanelCellSizes,
  computePanelSizes,
  hitTestDivider,
  sizesToPercentages,
} from "../splitPane.js";

describe("splitPane.edge - normalization and bounds", () => {
  test("computePanelSizes with zero panels returns empty arrays", () => {
    const result = computePanelSizes([], 100);
    assert.deepEqual(result.sizes, []);
    assert.deepEqual(result.dividerPositions, []);
  });

  test("computePanelCellSizes with non-positive panelCount returns empty arrays", () => {
    assert.deepEqual(computePanelCellSizes(0, [], 100, "percent").sizes, []);
    assert.deepEqual(computePanelCellSizes(-1, [], 100, "absolute").dividerPositions, []);
  });

  test("computePanelCellSizes percent mode tolerates NaN/Infinity size specs", () => {
    const result = computePanelCellSizes(
      3,
      [Number.NaN, Number.POSITIVE_INFINITY, 20],
      90,
      "percent",
      1,
    );
    assert.equal(result.sizes.length, 3);
    assert.equal(
      result.sizes.reduce((sum, value) => sum + value, 0),
      88,
    );
  });

  test("computePanelCellSizes absolute mode clamps negative specs to zero", () => {
    const result = computePanelCellSizes(3, [-10, 20, -5], 80, "absolute", 1);
    assert.deepEqual(result.sizes, [20, 39, 19]);
  });

  test("computePanelCellSizes shrinks below mins when constraints are impossible", () => {
    const result = computePanelCellSizes(2, [50, 50], 10, "percent", 1, [10, 10], [100, 100]);
    assert.equal(result.sizes[0], 9);
    assert.equal(result.sizes[1], 0);
  });

  test("computePanelSizes handles available space smaller than divider budget", () => {
    const result = computePanelSizes([50, 50, 0], 1, 2);
    assert.deepEqual(result.sizes, [0, 0, 0]);
    assert.deepEqual(result.dividerPositions, [0, 2]);
  });

  test("single-panel computePanelCellSizes has no divider positions", () => {
    const result = computePanelCellSizes(1, [100], 40, "percent", 1);
    assert.deepEqual(result.sizes, [40]);
    assert.deepEqual(result.dividerPositions, []);
  });

  test("percent mode distributes integer remainder across panels", () => {
    const result = computePanelCellSizes(3, [33, 33, 33], 100, "percent", 0);
    assert.deepEqual(result.sizes, [34, 33, 33]);
    assert.equal(
      result.sizes.reduce((sum, value) => sum + value, 0),
      100,
    );
  });

  test("maxSizes constraints are enforced during normalization", () => {
    const result = computePanelCellSizes(2, [90, 10], 100, "percent", 1, undefined, [30, 80]);
    assert.equal(result.sizes[0], 30);
    assert.equal(result.sizes[1], 69);
  });

  test("sizesToPercentages handles empty input", () => {
    assert.deepEqual(sizesToPercentages([]), []);
  });

  test("sizesToPercentages preserves deterministic order", () => {
    assert.deepEqual(sizesToPercentages([1, 3]), [25, 75]);
  });
});

describe("splitPane.edge - divider hit testing", () => {
  test("hitTestDivider detects divider at center point", () => {
    assert.equal(hitTestDivider(10, [10], 1), 0);
  });

  test("hitTestDivider includes expanded hit area before divider", () => {
    assert.equal(hitTestDivider(9, [10], 1), 0);
  });

  test("hitTestDivider excludes end boundary", () => {
    assert.equal(hitTestDivider(12, [10], 1), null);
  });

  test("hitTestDivider picks correct divider among many", () => {
    assert.equal(hitTestDivider(4, [2, 5, 9], 1), 1);
    assert.equal(hitTestDivider(8, [2, 5, 9], 1), 2);
  });

  test("hitTestDivider returns null when point misses all dividers", () => {
    assert.equal(hitTestDivider(-5, [2, 5, 9], 1), null);
    assert.equal(hitTestDivider(100, [2, 5, 9], 1), null);
  });
});
