import { assert, describe, test } from "@rezi-ui/testkit";
import { getLegendLabels, getLineChartRange, mapSeriesToPoints } from "../lineChart.js";

describe("lineChart helpers", () => {
  test("autoscale range uses finite series values and partial axis overrides", () => {
    const range = getLineChartRange(
      [
        { data: [Number.NaN, 4, 8], color: "#4ecdc4" },
        { data: [Number.POSITIVE_INFINITY, -2, 6], color: "#ff6b6b" },
      ],
      { min: -5 },
    );
    assert.deepEqual(range, { min: -5, max: 8 });
  });

  test("invalid explicit bounds fall back to autoscale range", () => {
    const range = getLineChartRange([{ data: [1, 3, 5], color: "#ffffff" }], { min: 10, max: 0 });
    assert.deepEqual(range, { min: 1, max: 5 });
  });

  test("point mapping clamps values outside axis range to plot bounds", () => {
    const points = mapSeriesToPoints([-10, 5, 20], 5, 5, { min: 0, max: 10 });
    assert.deepEqual(points, [
      { x: 0, y: 4 },
      { x: 2, y: 2 },
      { x: 4, y: 0 },
    ]);
  });

  test("legend labels fall back for empty labels", () => {
    const labels = getLegendLabels([
      { data: [1], color: "#fff", label: "CPU" },
      { data: [2], color: "#0ff", label: "" },
      { data: [3], color: "#f0f", label: "  " },
      { data: [4], color: "#ff0" },
    ]);
    assert.deepEqual(labels, ["CPU", "Series 2", "Series 3", "Series 4"]);
  });
});
