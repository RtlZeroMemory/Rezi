import type {
  BarChartItem,
  BarChartProps,
  CanvasProps,
  HeatmapProps,
  ImageProps,
  LineChartProps,
  MiniChartProps,
  ScatterProps,
  SparklineProps,
  VNode,
} from "../types.js";

export function canvas(props: CanvasProps): VNode {
  return { kind: "canvas", props };
}

export function image(props: ImageProps): VNode {
  return { kind: "image", props };
}

export function lineChart(props: LineChartProps): VNode {
  return { kind: "lineChart", props };
}

export function scatter(props: ScatterProps): VNode {
  return { kind: "scatter", props };
}

export function heatmap(props: HeatmapProps): VNode {
  return { kind: "heatmap", props };
}

export function sparkline(
  data: readonly number[],
  props: Omit<SparklineProps, "data"> = {},
): VNode {
  return { kind: "sparkline", props: { data, ...props } };
}

export function barChart(
  data: readonly BarChartItem[],
  props: Omit<BarChartProps, "data"> = {},
): VNode {
  return { kind: "barChart", props: { data, ...props } };
}

export function miniChart(
  values: readonly { label: string; value: number; max?: number }[],
  props: Omit<MiniChartProps, "values"> = {},
): VNode {
  return { kind: "miniChart", props: { values, ...props } };
}
