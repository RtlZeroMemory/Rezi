import type { DrawlistBuilderV1, DrawlistBuilderV3 } from "../../../index.js";
import { measureTextCells } from "../../../layout/textMeasure.js";
import type { Rect } from "../../../layout/types.js";
import type { RuntimeInstance } from "../../../runtime/commit.js";
import type { Theme } from "../../../theme/theme.js";
import { resolveColor } from "../../../theme/theme.js";
import { createCanvasDrawingSurface, resolveCanvasBlitter } from "../../../widgets/canvas.js";
import {
  colorForHeatmapValue,
  getHeatmapRange,
  normalizeHeatmapScale,
} from "../../../widgets/heatmap.js";
import {
  getLegendLabels,
  getLineChartRange,
  mapSeriesToPoints,
} from "../../../widgets/lineChart.js";
import { getScatterRange, mapScatterPointsToPixels } from "../../../widgets/scatter.js";
import { asTextStyle } from "../../styles.js";
import { isVisibleRect } from "../indices.js";
import { mergeTextStyle } from "../textStyle.js";
import type { ResolvedTextStyle } from "../textStyle.js";
import type { GraphicsBlitter } from "../../../widgets/types.js";
import {
  drawSegments,
  truncateToWidth,
  variantToThemeColor,
  type StyledSegment,
} from "./renderTextWidgets.js";
import { addBlobAligned, drawPlaceholderBox, rgbToHex } from "./renderCanvasWidgets.js";

type MaybeFillOwnBackground = (
  builder: DrawlistBuilderV1,
  rect: Rect,
  ownStyle: unknown,
  style: ResolvedTextStyle,
) => void;

const REPEAT_CACHE_MAX_ENTRIES = 2048;
const repeatCache = new Map<string, string>();

function repeatCached(glyph: string, count: number): string {
  if (count <= 0) return "";
  if (count === 1) return glyph;
  if (count > 256) return glyph.repeat(count);
  const key = `${glyph}\u0000${String(count)}`;
  const cached = repeatCache.get(key);
  if (cached !== undefined) return cached;
  const value = glyph.repeat(count);
  if (repeatCache.size >= REPEAT_CACHE_MAX_ENTRIES) {
    const oldest = repeatCache.keys().next();
    if (!oldest.done) repeatCache.delete(oldest.value);
  }
  repeatCache.set(key, value);
  return value;
}

const SPARKLINE_LEVELS = Object.freeze(["▁", "▂", "▃", "▄", "▅", "▆", "▇", "█"]);

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null;
}

function clamp01(value: number): number {
  if (!Number.isFinite(value)) return 0;
  if (value <= 0) return 0;
  if (value >= 1) return 1;
  return value;
}

function readNumber(v: unknown): number | undefined {
  if (typeof v !== "number" || !Number.isFinite(v)) return undefined;
  return v;
}

function readNonNegativeInt(v: unknown): number | undefined {
  const n = readNumber(v);
  if (n === undefined || n < 0) return undefined;
  return Math.trunc(n);
}

function readPositiveInt(v: unknown): number | undefined {
  const n = readNonNegativeInt(v);
  if (n === undefined || n <= 0) return undefined;
  return n;
}

function readString(v: unknown): string | undefined {
  return typeof v === "string" ? v : undefined;
}

function firstChar(text: string): string {
  if (text.length === 0) return "";
  const cp = text.codePointAt(0);
  return cp === undefined ? "" : String.fromCodePoint(cp);
}

function readGraphicsBlitter(v: unknown): GraphicsBlitter | undefined {
  switch (v) {
    case "auto":
    case "braille":
    case "sextant":
    case "quadrant":
    case "halfblock":
    case "ascii":
      return v;
    default:
      return undefined;
  }
}

function isV3Builder(builder: DrawlistBuilderV1): builder is DrawlistBuilderV3 {
  const maybe = builder as Partial<DrawlistBuilderV3>;
  return (
    typeof maybe.drawCanvas === "function" &&
    typeof maybe.drawImage === "function" &&
    typeof maybe.setLink === "function"
  );
}

function sparklineForData(
  data: readonly number[],
  width: number,
  min: number,
  max: number,
): string {
  if (width <= 0 || data.length === 0) return "";

  const range = max - min;
  const out: string[] = [];
  for (let i = 0; i < width; i++) {
    const index = Math.min(data.length - 1, Math.floor((i * data.length) / width));
    const value = data[index] ?? min;
    const normalized = range <= 0 ? 0.5 : clamp01((value - min) / range);
    const levelIndex = Math.round(normalized * (SPARKLINE_LEVELS.length - 1));
    const glyph = SPARKLINE_LEVELS[levelIndex] ?? SPARKLINE_LEVELS[0] ?? "▁";
    out.push(glyph);
  }
  return out.join("");
}

export function renderChartWidgets(
  builder: DrawlistBuilderV1,
  rect: Rect,
  theme: Theme,
  parentStyle: ResolvedTextStyle,
  node: RuntimeInstance,
  maybeFillOwnBackground: MaybeFillOwnBackground,
): boolean {
  const vnode = node.vnode;

  switch (vnode.kind) {
    case "lineChart": {
      if (!isVisibleRect(rect)) break;
      const props = vnode.props as {
        series?: unknown;
        blitter?: unknown;
        axes?: unknown;
        showLegend?: unknown;
      };
      const rawSeries = Array.isArray(props.series) ? props.series : [];
      const series = rawSeries.filter(
        (entry): entry is { data?: unknown; color?: unknown; label?: unknown } => isRecord(entry),
      );
      if (series.length === 0) break;
      const showLegend = props.showLegend ?? series.length > 1;
      const legendRows = showLegend ? 1 : 0;
      const chartRows = Math.max(0, rect.h - legendRows);
      if (chartRows <= 0) break;
      const blitter = resolveCanvasBlitter(readGraphicsBlitter(props.blitter) ?? "braille", true);
      const surface = createCanvasDrawingSurface(rect.w, chartRows, blitter, (color) =>
        resolveColor(theme, color),
      );

      const normalizedSeries = series.map((entry) => ({
        data: Array.isArray(entry.data)
          ? entry.data
              .map((value) => readNumber(value) ?? 0)
              .filter((value) => Number.isFinite(value))
          : ([] as number[]),
        color: readString(entry.color) ?? rgbToHex(theme.colors.primary),
        label: readString(entry.label),
      }));
      const range = getLineChartRange(
        normalizedSeries.map((entry) => ({
          data: Object.freeze(entry.data),
          color: entry.color,
          ...(entry.label ? { label: entry.label } : {}),
        })),
        isRecord(props.axes) && isRecord((props.axes as { y?: unknown }).y)
          ? ((props.axes as { y?: unknown }).y as { label?: string; min?: number; max?: number })
          : undefined,
      );

      for (const entry of normalizedSeries) {
        const points = mapSeriesToPoints(entry.data, surface.widthPx, surface.heightPx, range);
        for (let index = 1; index < points.length; index++) {
          const prev = points[index - 1];
          const curr = points[index];
          if (!prev || !curr) continue;
          surface.ctx.line(prev.x, prev.y, curr.x, curr.y, entry.color);
        }
      }

      if (isV3Builder(builder)) {
        const blobIndex = addBlobAligned(builder, surface.rgba);
        if (blobIndex !== null) {
          builder.drawCanvas(rect.x, rect.y, rect.w, chartRows, blobIndex, surface.blitter);
        } else {
          drawPlaceholderBox(builder, rect, parentStyle, "Line Chart", "blob allocation failed");
        }
      } else {
        drawPlaceholderBox(builder, rect, parentStyle, "Line Chart", "graphics not supported");
      }

      if (showLegend && rect.h > chartRows) {
        const labels = getLegendLabels(
          normalizedSeries.map((entry) => ({
            data: Object.freeze(entry.data),
            color: entry.color,
            ...(entry.label ? { label: entry.label } : {}),
          })),
        );
        const legend = labels.join("  ");
        builder.drawText(rect.x, rect.y + chartRows, truncateToWidth(legend, rect.w), parentStyle);
      }
      break;
    }
    case "scatter": {
      if (!isVisibleRect(rect)) break;
      const props = vnode.props as {
        points?: unknown;
        axes?: unknown;
        color?: unknown;
        blitter?: unknown;
      };
      const rawPoints = Array.isArray(props.points) ? props.points : [];
      const points = rawPoints.filter(
        (entry): entry is { x?: unknown; y?: unknown; color?: unknown } => isRecord(entry),
      );
      if (points.length === 0 || rect.w <= 0 || rect.h <= 0) break;
      const blitter = resolveCanvasBlitter(readGraphicsBlitter(props.blitter), true);
      const surface = createCanvasDrawingSurface(rect.w, rect.h, blitter, (color) =>
        resolveColor(theme, color),
      );
      const normalized = points.map((entry) => {
        const pointColor = readString(entry.color);
        return {
          x: readNumber(entry.x) ?? 0,
          y: readNumber(entry.y) ?? 0,
          ...(pointColor === undefined ? {} : { color: pointColor }),
        };
      });
      const parseAxis = (
        axis: unknown,
      ): { label?: string; min?: number; max?: number } | undefined => {
        if (!isRecord(axis)) return undefined;
        const label = readString((axis as { label?: unknown }).label);
        const min = readNumber((axis as { min?: unknown }).min);
        const max = readNumber((axis as { max?: unknown }).max);
        return {
          ...(label === undefined ? {} : { label }),
          ...(min === undefined ? {} : { min }),
          ...(max === undefined ? {} : { max }),
        };
      };
      const axes = isRecord(props.axes) ? (props.axes as { x?: unknown; y?: unknown }) : undefined;
      const xAxis = parseAxis(axes?.x);
      const yAxis = parseAxis(axes?.y);
      const range = getScatterRange(
        normalized,
        axes === undefined
          ? undefined
          : {
              ...(xAxis === undefined ? {} : { x: xAxis }),
              ...(yAxis === undefined ? {} : { y: yAxis }),
            },
      );
      const mapped = mapScatterPointsToPixels(normalized, surface.widthPx, surface.heightPx, range);
      const fallbackColor = readString(props.color) ?? rgbToHex(theme.colors.primary);
      for (const point of mapped) {
        surface.ctx.setPixel(point.x, point.y, point.color ?? fallbackColor);
      }

      if (isV3Builder(builder)) {
        const blobIndex = addBlobAligned(builder, surface.rgba);
        if (blobIndex !== null) {
          builder.drawCanvas(rect.x, rect.y, rect.w, rect.h, blobIndex, surface.blitter);
        } else {
          drawPlaceholderBox(builder, rect, parentStyle, "Scatter", "blob allocation failed");
        }
      } else {
        drawPlaceholderBox(builder, rect, parentStyle, "Scatter", "graphics not supported");
      }
      break;
    }
    case "heatmap": {
      if (!isVisibleRect(rect)) break;
      const props = vnode.props as {
        data?: unknown;
        min?: unknown;
        max?: unknown;
        colorScale?: unknown;
      };
      const rows = Array.isArray(props.data) ? props.data : [];
      const matrix = rows.map((row) =>
        Array.isArray(row) ? row.map((value) => readNumber(value) ?? 0) : [],
      );
      if (matrix.length === 0 || rect.w <= 0 || rect.h <= 0) break;
      const columns = Math.max(0, ...matrix.map((row) => row.length));
      if (columns <= 0) break;
      const scale = normalizeHeatmapScale(
        (typeof props.colorScale === "string" ? props.colorScale : undefined) as
          | "viridis"
          | "plasma"
          | "inferno"
          | "magma"
          | "turbo"
          | "grayscale"
          | undefined,
      );
      const range = getHeatmapRange(matrix, readNumber(props.min), readNumber(props.max));
      const blitter = resolveCanvasBlitter("quadrant", true);
      const surface = createCanvasDrawingSurface(rect.w, rect.h, blitter, (color) =>
        resolveColor(theme, color),
      );

      for (let rowIndex = 0; rowIndex < matrix.length; rowIndex++) {
        const row = matrix[rowIndex] ?? [];
        for (let colIndex = 0; colIndex < columns; colIndex++) {
          const value = row[colIndex] ?? range.min;
          const rgb = colorForHeatmapValue(value, range, scale);
          const x0 = Math.floor((colIndex * surface.widthPx) / columns);
          const x1 = Math.floor(((colIndex + 1) * surface.widthPx) / columns);
          const y0 = Math.floor((rowIndex * surface.heightPx) / matrix.length);
          const y1 = Math.floor(((rowIndex + 1) * surface.heightPx) / matrix.length);
          const cellW = Math.max(1, x1 - x0);
          const cellH = Math.max(1, y1 - y0);
          surface.ctx.fillRect(x0, y0, cellW, cellH, rgbToHex(rgb));
        }
      }

      if (isV3Builder(builder)) {
        const blobIndex = addBlobAligned(builder, surface.rgba);
        if (blobIndex !== null) {
          builder.drawCanvas(rect.x, rect.y, rect.w, rect.h, blobIndex, surface.blitter);
        } else {
          drawPlaceholderBox(builder, rect, parentStyle, "Heatmap", "blob allocation failed");
        }
      } else {
        drawPlaceholderBox(builder, rect, parentStyle, "Heatmap", "graphics not supported");
      }
      break;
    }
    case "sparkline": {
      if (!isVisibleRect(rect)) break;
      const props = vnode.props as {
        data?: unknown;
        width?: unknown;
        min?: unknown;
        max?: unknown;
        highRes?: unknown;
        blitter?: unknown;
        style?: unknown;
      };
      const rawData = Array.isArray(props.data) ? props.data : [];
      const data: number[] = [];
      for (const value of rawData) {
        const n = readNumber(value);
        if (n !== undefined) data.push(n);
      }
      if (data.length === 0) break;

      const ownStyle = asTextStyle(props.style, theme);
      const style = mergeTextStyle(parentStyle, ownStyle);
      maybeFillOwnBackground(builder, rect, ownStyle, style);
      const sparkColor = ownStyle?.fg ?? theme.colors.info;

      const width = Math.max(1, Math.min(rect.w, readPositiveInt(props.width) ?? data.length));
      const autoMin = Math.min(...data);
      const autoMax = Math.max(...data);
      const min = readNumber(props.min) ?? autoMin;
      const max = readNumber(props.max) ?? autoMax;
      const sampledData: number[] = [];
      for (let index = 0; index < width; index++) {
        const sourceIndex = Math.min(data.length - 1, Math.floor((index * data.length) / width));
        sampledData.push(data[sourceIndex] ?? min);
      }
      const line = sparklineForData(data, width, min, max);

      const highRes = props.highRes === true;
      if (highRes && isV3Builder(builder) && rect.w > 0 && rect.h > 0) {
        const blitter = resolveCanvasBlitter(readGraphicsBlitter(props.blitter) ?? "braille", true);
        const surface = createCanvasDrawingSurface(rect.w, rect.h, blitter, (color) =>
          resolveColor(theme, color),
        );
        const range = max - min;
        const color = rgbToHex(sparkColor);
        if (sampledData.length <= 1) {
          const only = sampledData[0] ?? min;
          const y = Math.round(
            (1 - (range <= 0 ? 0.5 : clamp01((only - min) / range))) * (surface.heightPx - 1),
          );
          if (surface.widthPx > 1) {
            surface.ctx.line(0, y, surface.widthPx - 1, y, color);
          } else {
            surface.ctx.setPixel(0, y, color);
          }
        } else {
          for (let index = 1; index < sampledData.length; index++) {
            const prev = sampledData[index - 1] ?? min;
            const curr = sampledData[index] ?? min;
            const x0 = Math.round(
              ((index - 1) / Math.max(1, sampledData.length - 1)) * (surface.widthPx - 1),
            );
            const x1 = Math.round(
              (index / Math.max(1, sampledData.length - 1)) * (surface.widthPx - 1),
            );
            const y0 = Math.round(
              (1 - (range <= 0 ? 0.5 : clamp01((prev - min) / range))) * (surface.heightPx - 1),
            );
            const y1 = Math.round(
              (1 - (range <= 0 ? 0.5 : clamp01((curr - min) / range))) * (surface.heightPx - 1),
            );
            surface.ctx.line(x0, y0, x1, y1, color);
          }
        }
        const blobIndex = addBlobAligned(builder, surface.rgba);
        if (blobIndex !== null) {
          builder.drawCanvas(rect.x, rect.y, rect.w, rect.h, blobIndex, surface.blitter);
          break;
        }
      }

      builder.pushClip(rect.x, rect.y, rect.w, rect.h);
      builder.drawText(
        rect.x,
        rect.y,
        truncateToWidth(line, rect.w),
        mergeTextStyle(style, { fg: sparkColor }),
      );
      builder.popClip();
      break;
    }
    case "barChart": {
      if (!isVisibleRect(rect)) break;
      const props = vnode.props as {
        data?: unknown;
        orientation?: unknown;
        showValues?: unknown;
        showLabels?: unknown;
        maxBarLength?: unknown;
        highRes?: unknown;
        blitter?: unknown;
        style?: unknown;
      };
      const rawData = Array.isArray(props.data) ? props.data : [];
      const data = rawData.filter(
        (item): item is { label?: unknown; value?: unknown; variant?: unknown } => isRecord(item),
      );
      if (data.length === 0) break;

      const orientation = props.orientation === "vertical" ? "vertical" : "horizontal";
      const showValues = props.showValues !== false;
      const showLabels = props.showLabels !== false;
      const ownStyle = asTextStyle(props.style, theme);
      const style = mergeTextStyle(parentStyle, ownStyle);
      maybeFillOwnBackground(builder, rect, ownStyle, style);

      const values = data.map((item) => Math.max(0, readNumber(item.value) ?? 0));
      const maxValue = Math.max(1, ...values);

      if (props.highRes === true && isV3Builder(builder) && rect.w > 0 && rect.h > 0) {
        const blitter = resolveCanvasBlitter(readGraphicsBlitter(props.blitter), true);
        const surface = createCanvasDrawingSurface(rect.w, rect.h, blitter, (color) =>
          resolveColor(theme, color),
        );
        if (orientation === "horizontal") {
          const rowHeight = Math.max(1, Math.floor(surface.heightPx / Math.max(1, data.length)));
          for (let row = 0; row < data.length; row++) {
            const item = data[row];
            if (!item) continue;
            const value = Math.max(0, readNumber(item.value) ?? 0);
            const ratio = clamp01(value / maxValue);
            const fillW = Math.max(0, Math.round(ratio * surface.widthPx));
            const y = row * rowHeight;
            const color = variantToThemeColor(theme, item.variant, "primary");
            surface.ctx.fillRect(0, y, fillW, rowHeight, rgbToHex(color));
          }
        } else {
          const colWidth = Math.max(1, Math.floor(surface.widthPx / Math.max(1, data.length)));
          for (let col = 0; col < data.length; col++) {
            const item = data[col];
            if (!item) continue;
            const value = Math.max(0, readNumber(item.value) ?? 0);
            const ratio = clamp01(value / maxValue);
            const fillH = Math.max(0, Math.round(ratio * surface.heightPx));
            const x = col * colWidth;
            const y = Math.max(0, surface.heightPx - fillH);
            const color = variantToThemeColor(theme, item.variant, "primary");
            surface.ctx.fillRect(x, y, colWidth, fillH, rgbToHex(color));
          }
        }
        const blobIndex = addBlobAligned(builder, surface.rgba);
        if (blobIndex !== null) {
          builder.drawCanvas(rect.x, rect.y, rect.w, rect.h, blobIndex, surface.blitter);
          break;
        }
      }

      builder.pushClip(rect.x, rect.y, rect.w, rect.h);
      if (orientation === "horizontal") {
        const maxBarLength = readPositiveInt(props.maxBarLength);
        for (let row = 0; row < rect.h && row < data.length; row++) {
          const item = data[row];
          if (!item) continue;
          const label = showLabels ? (readString(item.label) ?? "") : "";
          const value = Math.max(0, readNumber(item.value) ?? 0);
          const valueText = showValues ? ` ${String(value)}` : "";
          const labelText = label.length > 0 ? `${label} ` : "";
          let barWidth = rect.w - measureTextCells(labelText) - measureTextCells(valueText);
          if (maxBarLength !== undefined) barWidth = Math.min(barWidth, maxBarLength);
          barWidth = Math.max(1, barWidth);

          const filled = Math.max(0, Math.min(barWidth, Math.round((value / maxValue) * barWidth)));
          const empty = Math.max(0, barWidth - filled);
          const barStyle = mergeTextStyle(style, {
            fg: variantToThemeColor(theme, item.variant, "primary"),
            bold: true,
          });
          const trackStyle = mergeTextStyle(style, { fg: theme.colors.muted });
          const segments: StyledSegment[] = [];
          if (labelText.length > 0) segments.push({ text: labelText, style });
          if (filled > 0) segments.push({ text: repeatCached("█", filled), style: barStyle });
          if (empty > 0) segments.push({ text: repeatCached("░", empty), style: trackStyle });
          if (valueText.length > 0) segments.push({ text: valueText, style });
          drawSegments(builder, rect.x, rect.y + row, rect.w, segments);
        }
      } else {
        const labelRows = showLabels ? 1 : 0;
        const valueRows = showValues ? 1 : 0;
        const maxBarLength = readPositiveInt(props.maxBarLength);
        const chartHeight = Math.max(
          0,
          Math.min(rect.h - labelRows - valueRows, maxBarLength ?? Number.POSITIVE_INFINITY),
        );
        const columns = Math.max(1, Math.min(rect.w, data.length));
        for (let col = 0; col < columns; col++) {
          const sourceIndex = Math.min(data.length - 1, Math.floor((col * data.length) / columns));
          const item = data[sourceIndex];
          if (!item) continue;
          const value = Math.max(0, readNumber(item.value) ?? 0);
          const filled =
            chartHeight <= 0
              ? 0
              : Math.max(0, Math.min(chartHeight, Math.round((value / maxValue) * chartHeight)));
          const barStyle = mergeTextStyle(style, {
            fg: variantToThemeColor(theme, item.variant, "primary"),
            bold: true,
          });
          const trackStyle = mergeTextStyle(style, { fg: theme.colors.muted });
          for (let y = 0; y < chartHeight; y++) {
            const cellY = rect.y + chartHeight - 1 - y;
            const filledCell = y < filled;
            builder.drawText(
              rect.x + col,
              cellY,
              filledCell ? "█" : "░",
              filledCell ? barStyle : trackStyle,
            );
          }
        }

        if (showLabels && chartHeight < rect.h) {
          let labels = "";
          for (let col = 0; col < columns; col++) {
            const sourceIndex = Math.min(
              data.length - 1,
              Math.floor((col * data.length) / columns),
            );
            const item = data[sourceIndex];
            const label = item ? (readString(item.label) ?? "") : "";
            labels += firstChar(label) || " ";
          }
          builder.drawText(rect.x, rect.y + chartHeight, truncateToWidth(labels, rect.w), style);
        }

        if (showValues && chartHeight + labelRows < rect.h) {
          const valueLine = data
            .map((item) => String(Math.max(0, readNumber(item.value) ?? 0)))
            .join(" ");
          const y = rect.y + chartHeight + labelRows;
          builder.drawText(
            rect.x,
            y,
            truncateToWidth(valueLine, rect.w),
            mergeTextStyle(style, { fg: theme.colors.muted }),
          );
        }
      }
      builder.popClip();
      break;
    }
    case "miniChart": {
      if (!isVisibleRect(rect)) break;
      const props = vnode.props as {
        values?: unknown;
        variant?: unknown;
        style?: unknown;
      };
      const rawValues = Array.isArray(props.values) ? props.values : [];
      const values = rawValues.filter(
        (item): item is { label?: unknown; value?: unknown; max?: unknown } => isRecord(item),
      );
      if (values.length === 0) break;

      const variant = props.variant === "pills" ? "pills" : "bars";
      const ownStyle = asTextStyle(props.style, theme);
      const style = mergeTextStyle(parentStyle, ownStyle);
      maybeFillOwnBackground(builder, rect, ownStyle, style);

      const fillGlyph = variant === "pills" ? "●" : "▓";
      const emptyGlyph = variant === "pills" ? "○" : "░";
      const fillStyle = mergeTextStyle(style, { fg: theme.colors.primary, bold: true });
      const trackStyle = mergeTextStyle(style, { fg: theme.colors.muted });
      const segments: StyledSegment[] = [];

      for (let i = 0; i < values.length; i++) {
        const item = values[i];
        if (!item) continue;
        if (i > 0) segments.push({ text: "  ", style });
        const label = readString(item.label) ?? "";
        const value = Math.max(0, readNumber(item.value) ?? 0);
        const max = Math.max(1, readNumber(item.max) ?? Math.max(value, 1));
        const ratio = clamp01(value / max);
        const cells = 5;
        const filled = Math.max(0, Math.min(cells, Math.round(cells * ratio)));
        const empty = Math.max(0, cells - filled);

        if (label.length > 0) segments.push({ text: `${label}:`, style });
        if (filled > 0) segments.push({ text: repeatCached(fillGlyph, filled), style: fillStyle });
        if (empty > 0) segments.push({ text: repeatCached(emptyGlyph, empty), style: trackStyle });
        segments.push({ text: ` ${Math.round(ratio * 100)}%`, style });
      }

      builder.pushClip(rect.x, rect.y, rect.w, rect.h);
      drawSegments(builder, rect.x, rect.y, rect.w, segments);
      builder.popClip();
      break;
    }
    default:
      return false;
  }

  return true;
}
