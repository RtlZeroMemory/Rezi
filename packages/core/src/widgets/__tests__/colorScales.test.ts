import { assert, describe, test } from "@rezi-ui/testkit";
import {
  colorForHeatmapValue,
  getHeatmapColorTable,
  getHeatmapRange,
  normalizeHeatmapScale,
} from "../heatmap.js";
import { rgb } from "../style.js";

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
    assert.equal(c0, rgb(68, 1, 84));
    assert.equal(c50, rgb(33, 145, 140));
    assert.equal(c100, rgb(253, 231, 37));
  });

  test("scale checkpoints remain deterministic across palettes", () => {
    const range = { min: 0, max: 100 };
    const checkpoints = Object.freeze([
      {
        scale: "viridis" as const,
        expected: Object.freeze({
          0: rgb(68, 1, 84),
          25: rgb(59, 82, 139),
          50: rgb(33, 145, 140),
          75: rgb(94, 201, 98),
          100: rgb(253, 231, 37),
        }),
      },
      {
        scale: "plasma" as const,
        expected: Object.freeze({
          0: rgb(13, 8, 135),
          25: rgb(126, 3, 168),
          50: rgb(203, 71, 119),
          75: rgb(248, 149, 64),
          100: rgb(240, 249, 33),
        }),
      },
      {
        scale: "inferno" as const,
        expected: Object.freeze({
          0: rgb(0, 0, 4),
          25: rgb(87, 15, 109),
          50: rgb(187, 55, 84),
          75: rgb(249, 142, 8),
          100: rgb(252, 255, 164),
        }),
      },
      {
        scale: "magma" as const,
        expected: Object.freeze({
          0: rgb(0, 0, 4),
          25: rgb(79, 18, 123),
          50: rgb(182, 54, 121),
          75: rgb(251, 140, 60),
          100: rgb(252, 253, 191),
        }),
      },
      {
        scale: "turbo" as const,
        expected: Object.freeze({
          0: rgb(48, 18, 59),
          25: rgb(63, 128, 234),
          50: rgb(34, 201, 169),
          75: rgb(246, 189, 39),
          100: rgb(122, 4, 3),
        }),
      },
      {
        scale: "grayscale" as const,
        expected: Object.freeze({
          0: rgb(0, 0, 0),
          25: rgb(64, 64, 64),
          50: rgb(128, 128, 128),
          75: rgb(191, 191, 191),
          100: rgb(255, 255, 255),
        }),
      },
    ]);

    for (const { scale, expected } of checkpoints) {
      assert.equal(colorForHeatmapValue(0, range, scale), expected[0]);
      assert.equal(colorForHeatmapValue(25, range, scale), expected[25]);
      assert.equal(colorForHeatmapValue(50, range, scale), expected[50]);
      assert.equal(colorForHeatmapValue(75, range, scale), expected[75]);
      assert.equal(colorForHeatmapValue(100, range, scale), expected[100]);
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
