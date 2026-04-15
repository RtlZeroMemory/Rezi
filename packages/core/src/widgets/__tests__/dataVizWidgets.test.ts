import { assert, describe, test } from "@rezi-ui/testkit";
import { createTestRenderer } from "../../testing/index.js";
import { ui } from "../ui.js";

describe("data visualization widgets - edge cases", () => {
  test("sparkline renders a visible trend at the requested width", () => {
    const output = createTestRenderer({ viewport: { cols: 20, rows: 4 } })
      .render(ui.sparkline([1, 3, 2, 5], { width: 8 }))
      .toText()
      .trim();

    assert.equal(output.length, 8);
    assert.equal(/[▁▂▃▄▅▆▇█]/.test(output), true);
  });

  test("barChart renders horizontal and vertical text-mode output", () => {
    const renderer = createTestRenderer({ viewport: { cols: 40, rows: 12 } });
    const horizontal = renderer
      .render(
        ui.barChart(
          [
            { label: "A", value: 3 },
            { label: "B", value: 5 },
          ],
          { maxBarLength: 6, showValues: true },
        ),
      )
      .toText();
    const vertical = renderer
      .render(
        ui.barChart(
          [
            { label: "A", value: 3 },
            { label: "B", value: 5 },
          ],
          { orientation: "vertical", maxBarLength: 4, showLabels: true, showValues: true },
        ),
      )
      .toText();

    assert.equal(horizontal.includes("A"), true);
    assert.equal(horizontal.includes("B"), true);
    assert.equal(horizontal.includes("3"), true);
    assert.equal(horizontal.includes("5"), true);
    assert.equal(/[█▓░]/.test(horizontal), true);

    assert.equal(vertical.includes("AB"), true);
    assert.equal(vertical.includes("3 5"), true);
    assert.equal(/[█▓░]/.test(vertical), true);
  });

  test("miniChart renders bars and pills variants with visible percentages", () => {
    const renderer = createTestRenderer({ viewport: { cols: 40, rows: 6 } });
    const bars = renderer
      .render(
        ui.miniChart(
          [
            { label: "CPU", value: 42, max: 100 },
            { label: "MEM", value: 78, max: 100 },
          ],
          { variant: "bars" },
        ),
      )
      .toText();
    const pills = renderer
      .render(
        ui.miniChart(
          [
            { label: "CPU", value: 42, max: 100 },
            { label: "MEM", value: 78, max: 100 },
          ],
          { variant: "pills" },
        ),
      )
      .toText();

    assert.equal(bars.includes("CPU:"), true);
    assert.equal(bars.includes("MEM:"), true);
    assert.equal(bars.includes("42%"), true);
    assert.equal(bars.includes("78%"), true);
    assert.equal(bars.includes("▓"), true);

    assert.equal(pills.includes("CPU:"), true);
    assert.equal(pills.includes("MEM:"), true);
    assert.equal(pills.includes("42%"), true);
    assert.equal(pills.includes("78%"), true);
    assert.equal(pills.includes("●"), true);
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
