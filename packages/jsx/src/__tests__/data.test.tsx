/** @jsxImportSource @rezi-ui/jsx */

import { ui } from "@rezi-ui/core";
import { assert, describe, test } from "@rezi-ui/testkit";
import {
  BarChart,
  Canvas,
  Gauge,
  Image,
  LineChart,
  Link,
  MiniChart,
  Progress,
  Skeleton,
  Sparkline,
  Spinner,
} from "../index.js";

describe("data visualization widgets", () => {
  test("Progress and Gauge map to matching VNodes", () => {
    assert.deepEqual(
      <Progress value={0.5} variant="blocks" showPercent label="Download" width={30} />,
      ui.progress(0.5, { variant: "blocks", showPercent: true, label: "Download", width: 30 }),
    );

    assert.deepEqual(<Gauge value={0.42} label="CPU" />, ui.gauge(0.42, { label: "CPU" }));
  });

  test("Sparkline, BarChart, MiniChart map to matching VNodes", () => {
    assert.deepEqual(<Sparkline data={[1, 2, 3, 4, 5]} />, ui.sparkline([1, 2, 3, 4, 5]));

    const bars = [
      { label: "A", value: 10 },
      { label: "B", value: 20, variant: "success" as const },
    ];
    assert.deepEqual(
      <BarChart data={bars} orientation="vertical" showValues />,
      ui.barChart(bars, { orientation: "vertical", showValues: true }),
    );

    const values = [
      { label: "CPU", value: 40, max: 100 },
      { label: "MEM", value: 70, max: 100 },
    ];
    assert.deepEqual(<MiniChart values={values} />, ui.miniChart(values));
  });

  test("Link, Canvas, Image, LineChart map to matching VNodes", () => {
    const draw = () => undefined;
    const src = new Uint8Array([0, 0, 0, 0]);
    const series = [{ data: [1, 2, 3], color: "#4ecdc4", label: "CPU" }] as const;

    assert.deepEqual(
      <Link url="https://example.com/docs" label="Docs" />,
      ui.link("https://example.com/docs", "Docs"),
    );
    assert.deepEqual(
      <Canvas width={12} height={4} draw={draw} />,
      ui.canvas({ width: 12, height: 4, draw }),
    );
    assert.deepEqual(
      <Image src={src} width={8} height={3} fit="contain" />,
      ui.image({ src, width: 8, height: 3, fit: "contain" }),
    );
    assert.deepEqual(
      <LineChart width={20} height={6} series={series} />,
      ui.lineChart({ width: 20, height: 6, series }),
    );
  });

  test("Skeleton and Spinner map to matching VNodes", () => {
    assert.deepEqual(<Skeleton width={20} />, ui.skeleton(20));
    assert.deepEqual(
      <Skeleton width={10} height={3} variant="rect" />,
      ui.skeleton(10, { height: 3, variant: "rect" }),
    );
    assert.deepEqual(
      <Spinner variant="dots" label="Loading" />,
      ui.spinner({ variant: "dots", label: "Loading" }),
    );
  });
});
