import { assert, describe, test } from "@rezi-ui/testkit";
import {
  colorForHeatmapValue,
  getHeatmapColorTable,
  getHeatmapRange,
  normalizeHeatmapScale,
} from "../heatmap.js";

describe("heatmap color scales", () => {
  test("all scales expose 256 entries", () => {
    const names = ["viridis", "plasma", "inferno", "magma", "turbo", "grayscale"] as const;
    for (const name of names) {
      const table = getHeatmapColorTable(name);
      assert.equal(table.length, 256);
    }
  });

  test("viridis key points are deterministic", () => {
    const range = { min: 0, max: 100 };
    const c0 = colorForHeatmapValue(0, range, "viridis");
    const c50 = colorForHeatmapValue(50, range, "viridis");
    const c100 = colorForHeatmapValue(100, range, "viridis");
    assert.deepEqual(c0, { r: 68, g: 1, b: 84 });
    assert.deepEqual(c50, { r: 33, g: 145, b: 140 });
    assert.deepEqual(c100, { r: 253, g: 231, b: 37 });
  });

  test("scale checkpoints remain deterministic across palettes", () => {
    const range = { min: 0, max: 100 };
    const checkpoints = Object.freeze([
      {
        scale: "viridis" as const,
        expected: Object.freeze({
          0: { r: 68, g: 1, b: 84 },
          25: { r: 59, g: 82, b: 139 },
          50: { r: 33, g: 145, b: 140 },
          75: { r: 94, g: 201, b: 98 },
          100: { r: 253, g: 231, b: 37 },
        }),
      },
      {
        scale: "plasma" as const,
        expected: Object.freeze({
          0: { r: 13, g: 8, b: 135 },
          25: { r: 126, g: 3, b: 168 },
          50: { r: 203, g: 71, b: 119 },
          75: { r: 248, g: 149, b: 64 },
          100: { r: 240, g: 249, b: 33 },
        }),
      },
      {
        scale: "inferno" as const,
        expected: Object.freeze({
          0: { r: 0, g: 0, b: 4 },
          25: { r: 87, g: 15, b: 109 },
          50: { r: 187, g: 55, b: 84 },
          75: { r: 249, g: 142, b: 8 },
          100: { r: 252, g: 255, b: 164 },
        }),
      },
      {
        scale: "magma" as const,
        expected: Object.freeze({
          0: { r: 0, g: 0, b: 4 },
          25: { r: 79, g: 18, b: 123 },
          50: { r: 182, g: 54, b: 121 },
          75: { r: 251, g: 140, b: 60 },
          100: { r: 252, g: 253, b: 191 },
        }),
      },
      {
        scale: "turbo" as const,
        expected: Object.freeze({
          0: { r: 48, g: 18, b: 59 },
          25: { r: 63, g: 128, b: 234 },
          50: { r: 34, g: 201, b: 169 },
          75: { r: 246, g: 189, b: 39 },
          100: { r: 122, g: 4, b: 3 },
        }),
      },
      {
        scale: "grayscale" as const,
        expected: Object.freeze({
          0: { r: 0, g: 0, b: 0 },
          25: { r: 64, g: 64, b: 64 },
          50: { r: 128, g: 128, b: 128 },
          75: { r: 191, g: 191, b: 191 },
          100: { r: 255, g: 255, b: 255 },
        }),
      },
    ]);

    for (const { scale, expected } of checkpoints) {
      assert.deepEqual(colorForHeatmapValue(0, range, scale), expected[0]);
      assert.deepEqual(colorForHeatmapValue(25, range, scale), expected[25]);
      assert.deepEqual(colorForHeatmapValue(50, range, scale), expected[50]);
      assert.deepEqual(colorForHeatmapValue(75, range, scale), expected[75]);
      assert.deepEqual(colorForHeatmapValue(100, range, scale), expected[100]);
    }
  });

  test("range autoscales and ignores invalid explicit bounds", () => {
    const auto = getHeatmapRange(
      [
        [Number.NaN, 2],
        [Number.POSITIVE_INFINITY, -1],
      ],
      undefined,
      undefined,
    );
    assert.deepEqual(auto, { min: -1, max: 2 });

    const overridden = getHeatmapRange([[1, 2, 3]], -5, undefined);
    assert.deepEqual(overridden, { min: -5, max: 3 });

    const invalidExplicit = getHeatmapRange([[1, 2, 3]], 10, 0);
    assert.deepEqual(invalidExplicit, { min: 1, max: 3 });
  });

  test("normalizeHeatmapScale falls back to viridis", () => {
    assert.equal(normalizeHeatmapScale(undefined), "viridis");
    assert.equal(normalizeHeatmapScale("turbo"), "turbo");
    assert.equal(normalizeHeatmapScale("invalid" as never), "viridis");
  });
});
