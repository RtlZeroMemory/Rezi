import { assert, describe, test } from "@rezi-ui/testkit";
import { getScatterRange, mapScatterPointsToPixels } from "../scatter.js";

describe("scatter helpers", () => {
  test("autoscale range uses finite points and partial axis overrides", () => {
    const range = getScatterRange(
      [
        { x: -1, y: 2 },
        { x: 4, y: -3 },
        { x: Number.NaN, y: Number.POSITIVE_INFINITY },
      ],
      { x: { min: -5 } },
    );
    assert.deepEqual(range, { xMin: -5, xMax: 4, yMin: -3, yMax: 2 });
  });

  test("invalid explicit bounds fall back to autoscale range", () => {
    const range = getScatterRange(
      [
        { x: 2, y: 1 },
        { x: 8, y: 7 },
      ],
      { x: { min: 9, max: 1 }, y: { min: 20, max: 10 } },
    );
    assert.deepEqual(range, { xMin: 2, xMax: 8, yMin: 1, yMax: 7 });
  });

  test("pixel mapping clamps out-of-range points to viewport edges", () => {
    const points = mapScatterPointsToPixels(
      [
        { x: -5, y: -5 },
        { x: 5, y: 5, color: "#ff00ff" },
        { x: 20, y: 20 },
      ],
      5,
      5,
      { xMin: 0, xMax: 10, yMin: 0, yMax: 10 },
    );
    assert.deepEqual(points, [
      { x: 0, y: 4 },
      { x: 2, y: 2, color: "#ff00ff" },
      { x: 4, y: 0 },
    ]);
  });
});
