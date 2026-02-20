import { assert, describe, test } from "@rezi-ui/testkit";
import { ui } from "../ui.js";

describe("data visualization widgets - edge cases", () => {
  test("sparkline preserves min/max and accepts empty data", () => {
    const populated = ui.sparkline([0, 1, Number.NaN, Number.POSITIVE_INFINITY], {
      width: 8,
      min: -1,
      max: 2,
      highRes: true,
      blitter: "braille",
    });
    assert.equal(populated.kind, "sparkline");
    assert.deepEqual(populated.props, {
      data: [0, 1, Number.NaN, Number.POSITIVE_INFINITY],
      width: 8,
      min: -1,
      max: 2,
      highRes: true,
      blitter: "braille",
    });

    const empty = ui.sparkline([]);
    assert.equal(empty.kind, "sparkline");
    assert.deepEqual(empty.props, { data: [] });
  });

  test("barChart preserves variants and supports empty arrays", () => {
    const vnode = ui.barChart(
      [
        { label: "A", value: 1, variant: "default" },
        { label: "B", value: 2, variant: "success" },
        { label: "C", value: 3, variant: "warning" },
        { label: "D", value: 4, variant: "error" },
        { label: "E", value: 5, variant: "info" },
      ],
      {
        orientation: "vertical",
        showValues: false,
        showLabels: true,
        maxBarLength: 1000,
        highRes: true,
        blitter: "quadrant",
      },
    );

    assert.equal(vnode.kind, "barChart");
    assert.equal(vnode.props.data.length, 5);
    assert.equal(vnode.props.orientation, "vertical");
    assert.equal(vnode.props.maxBarLength, 1000);
    assert.equal(vnode.props.highRes, true);
    assert.equal(vnode.props.blitter, "quadrant");

    const empty = ui.barChart([]);
    assert.equal(empty.kind, "barChart");
    assert.deepEqual(empty.props, { data: [] });
  });

  test("miniChart supports large arrays and optional max values", () => {
    const values = Array.from({ length: 50 }, (_, i) => ({
      label: `M${String(i)}`,
      value: i,
      max: 100,
    }));
    const vnode = ui.miniChart(values, { variant: "pills" });
    assert.equal(vnode.kind, "miniChart");
    assert.equal(vnode.props.values.length, 50);
    assert.equal(vnode.props.variant, "pills");

    const noMax = ui.miniChart([{ label: "CPU", value: 42 }]);
    assert.equal(noMax.kind, "miniChart");
    assert.deepEqual(noMax.props, { values: [{ label: "CPU", value: 42 }] });
  });

  test("lineChart, scatter, and heatmap preserve chart props", () => {
    const line = ui.lineChart({
      width: 24,
      height: 8,
      series: [
        { data: [1, 2, 3], color: "#4ecdc4", label: "CPU" },
        { data: [2, 3, 4], color: "#ff6b6b" },
      ],
      axes: { y: { min: 0, max: 5 } },
      showLegend: false,
      blitter: "braille",
    });
    assert.equal(line.kind, "lineChart");
    assert.equal(line.props.showLegend, false);
    assert.deepEqual(line.props.axes, { y: { min: 0, max: 5 } });

    const scatter = ui.scatter({
      width: 20,
      height: 6,
      points: [
        { x: -1, y: 2, color: "#fff" },
        { x: 3, y: 5 },
      ],
      axes: { x: { min: -2, max: 4 }, y: { min: 0, max: 6 } },
      color: "#4ecdc4",
      blitter: "quadrant",
    });
    assert.equal(scatter.kind, "scatter");
    assert.deepEqual(scatter.props.axes, { x: { min: -2, max: 4 }, y: { min: 0, max: 6 } });
    assert.equal(scatter.props.color, "#4ecdc4");

    const heatmap = ui.heatmap({
      width: 16,
      height: 6,
      data: [
        [0, 0.2, 0.4],
        [0.6, 0.8, 1],
      ],
      colorScale: "turbo",
      min: 0,
      max: 1,
    });
    assert.equal(heatmap.kind, "heatmap");
    assert.equal(heatmap.props.colorScale, "turbo");
    assert.equal(heatmap.props.min, 0);
    assert.equal(heatmap.props.max, 1);
  });
});
