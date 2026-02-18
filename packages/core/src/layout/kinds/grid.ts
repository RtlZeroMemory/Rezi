import type { VNode } from "../../index.js";
import { clampNonNegative } from "../engine/bounds.js";
import { type FlexItem, distributeFlex } from "../engine/flex.js";
import { releaseArray } from "../engine/pool.js";
import { ok } from "../engine/result.js";
import type { LayoutTree } from "../engine/types.js";
import type { Axis, Size } from "../types.js";
import type { LayoutResult } from "../validateProps.js";

type MeasureNodeFn = (vnode: VNode, maxW: number, maxH: number, axis: Axis) => LayoutResult<Size>;

type LayoutNodeFn = (
  vnode: VNode,
  x: number,
  y: number,
  maxW: number,
  maxH: number,
  axis: Axis,
  forcedW?: number | null,
  forcedH?: number | null,
) => LayoutResult<LayoutTree>;

type GridTrack =
  | Readonly<{ kind: "fixed"; size: number }>
  | Readonly<{ kind: "auto" }>
  | Readonly<{ kind: "count" }>
  | Readonly<{ kind: "fr"; flex: number }>;

type ParsedGridProps = Readonly<{
  columnTracks: readonly GridTrack[];
  rowTracks: readonly GridTrack[] | null;
  explicitRows: boolean;
  rowGap: number;
  columnGap: number;
}>;

type PlacedChild = Readonly<{ child: VNode; column: number; row: number }>;

type MeasuredPlacedChild = Readonly<{
  child: VNode;
  column: number;
  row: number;
  size: Size;
}>;

type PlacementPlan = Readonly<{
  placed: readonly PlacedChild[];
  rowCount: number;
}>;

type GridTrackNaturals = Readonly<{
  columns: readonly number[];
  rows: readonly number[];
}>;

const I32_MAX = 2147483647;

const AUTO_TRACK: GridTrack = Object.freeze({ kind: "auto" });

function invalid(detail: string): LayoutResult<never> {
  return { ok: false, fatal: { code: "ZRUI_INVALID_PROPS", detail } };
}

function parseI32FloorNonNegative(v: unknown): number | null {
  if (typeof v !== "number" || !Number.isFinite(v)) return null;
  const n = Math.floor(v);
  if (n < 0 || n > I32_MAX) return null;
  return n;
}

function parseGapProp(name: "gap" | "rowGap" | "columnGap", raw: unknown): LayoutResult<number> {
  const parsed = parseI32FloorNonNegative(raw);
  if (parsed === null) return invalid(`grid.${name} must be an int32 >= 0`);
  return { ok: true, value: parsed };
}

function parseTrackToken(propName: "columns" | "rows", token: string): LayoutResult<GridTrack> {
  const raw = token.trim().toLowerCase();
  if (raw.length === 0) {
    return invalid(`grid.${propName} contains an empty track token`);
  }

  if (raw === "auto") {
    return { ok: true, value: AUTO_TRACK };
  }

  if (raw.endsWith("fr")) {
    const flexRaw = raw.slice(0, -2);
    const flex = flexRaw.length === 0 ? 1 : Number.parseFloat(flexRaw);
    if (!Number.isFinite(flex) || flex <= 0) {
      return invalid(
        `grid.${propName} track token "${token}" must be "auto", "<n>", "<n>px", or "<n>fr"`,
      );
    }
    return { ok: true, value: { kind: "fr", flex } };
  }

  const fixedMatch = /^(\d+(?:\.\d+)?)(px)?$/.exec(raw);
  if (fixedMatch) {
    const n = Number.parseFloat(fixedMatch[1] ?? "");
    if (!Number.isFinite(n) || n < 0) {
      return invalid(
        `grid.${propName} track token "${token}" must be "auto", "<n>", "<n>px", or "<n>fr"`,
      );
    }
    const size = Math.floor(n);
    if (size > I32_MAX) {
      return invalid(`grid.${propName} track token "${token}" is out of int32 range`);
    }
    return { ok: true, value: { kind: "fixed", size } };
  }

  return invalid(
    `grid.${propName} track token "${token}" must be "auto", "<n>", "<n>px", or "<n>fr"`,
  );
}

function parseTrackString(
  propName: "columns" | "rows",
  raw: string,
): LayoutResult<readonly GridTrack[]> {
  const tokens = raw
    .split(/[\s,]+/)
    .map((t) => t.trim())
    .filter((t) => t.length > 0);
  if (tokens.length === 0) {
    return invalid(`grid.${propName} must be a non-empty track string`);
  }

  const tracks: GridTrack[] = [];
  for (let i = 0; i < tokens.length; i++) {
    const token = tokens[i];
    if (!token) continue;
    const trackRes = parseTrackToken(propName, token);
    if (!trackRes.ok) return trackRes;
    tracks.push(trackRes.value);
  }

  if (tracks.length === 0) {
    return invalid(`grid.${propName} must be a non-empty track string`);
  }

  return { ok: true, value: tracks };
}

function createCountTracks(count: number): readonly GridTrack[] {
  const out: GridTrack[] = [];
  for (let i = 0; i < count; i++) {
    out.push({ kind: "count" });
  }
  return out;
}

function createAutoTracks(count: number): readonly GridTrack[] {
  const out: GridTrack[] = [];
  for (let i = 0; i < count; i++) {
    out.push(AUTO_TRACK);
  }
  return out;
}

function parseColumns(raw: unknown): LayoutResult<readonly GridTrack[]> {
  if (typeof raw === "number") {
    const count = parseI32FloorNonNegative(raw);
    if (count === null || count <= 0) {
      return invalid("grid.columns must be a positive int32 or a non-empty track string");
    }
    return { ok: true, value: createCountTracks(count) };
  }

  if (typeof raw === "string") {
    return parseTrackString("columns", raw);
  }

  return invalid("grid.columns must be a positive int32 or a non-empty track string");
}

function parseRows(
  raw: unknown,
): LayoutResult<Readonly<{ tracks: readonly GridTrack[] | null; explicit: boolean }>> {
  if (raw === undefined) {
    return { ok: true, value: { tracks: null, explicit: false } };
  }

  if (typeof raw === "number") {
    const count = parseI32FloorNonNegative(raw);
    if (count === null) {
      return invalid("grid.rows must be an int32 >= 0 or a non-empty track string");
    }
    return { ok: true, value: { tracks: createAutoTracks(count), explicit: true } };
  }

  if (typeof raw === "string") {
    const parsed = parseTrackString("rows", raw);
    if (!parsed.ok) return parsed;
    return { ok: true, value: { tracks: parsed.value, explicit: true } };
  }

  return invalid("grid.rows must be an int32 >= 0 or a non-empty track string");
}

function parseGridProps(rawProps: unknown): LayoutResult<ParsedGridProps> {
  const props = (rawProps ?? {}) as {
    columns?: unknown;
    rows?: unknown;
    gap?: unknown;
    rowGap?: unknown;
    columnGap?: unknown;
  };

  const columnsRes = parseColumns(props.columns);
  if (!columnsRes.ok) return columnsRes;

  const rowsRes = parseRows(props.rows);
  if (!rowsRes.ok) return rowsRes;

  const gapRes = props.gap === undefined ? ok(0) : parseGapProp("gap", props.gap);
  if (!gapRes.ok) return gapRes;

  const rowGapRes =
    props.rowGap === undefined ? ok(gapRes.value) : parseGapProp("rowGap", props.rowGap);
  if (!rowGapRes.ok) return rowGapRes;

  const columnGapRes =
    props.columnGap === undefined ? ok(gapRes.value) : parseGapProp("columnGap", props.columnGap);
  if (!columnGapRes.ok) return columnGapRes;

  return {
    ok: true,
    value: {
      columnTracks: columnsRes.value,
      rowTracks: rowsRes.value.tracks,
      explicitRows: rowsRes.value.explicit,
      rowGap: rowGapRes.value,
      columnGap: columnGapRes.value,
    },
  };
}

function buildPlacementPlan(
  children: readonly (VNode | undefined)[],
  columnCount: number,
  explicitRows: boolean,
  explicitRowCount: number,
): PlacementPlan {
  const placed: PlacedChild[] = [];
  const capacity = explicitRows ? columnCount * explicitRowCount : Number.POSITIVE_INFINITY;

  let slot = 0;
  for (let i = 0; i < children.length; i++) {
    const child = children[i];
    if (!child) continue;
    if (slot >= capacity) break;
    placed.push({
      child,
      column: slot % columnCount,
      row: Math.floor(slot / columnCount),
    });
    slot++;
  }

  const rowCount = explicitRows ? explicitRowCount : Math.ceil(slot / columnCount);
  return { placed, rowCount };
}

function measurePlacedChildren(
  placed: readonly PlacedChild[],
  maxW: number,
  maxH: number,
  axis: Axis,
  measureNode: MeasureNodeFn,
): LayoutResult<readonly MeasuredPlacedChild[]> {
  const measured: MeasuredPlacedChild[] = [];
  for (let i = 0; i < placed.length; i++) {
    const p = placed[i];
    if (!p) continue;
    const sizeRes = measureNode(p.child, maxW, maxH, axis);
    if (!sizeRes.ok) return sizeRes;
    measured.push({ child: p.child, column: p.column, row: p.row, size: sizeRes.value });
  }
  return { ok: true, value: measured };
}

function resolveTrackNaturals(
  columnTracks: readonly GridTrack[],
  rowTracks: readonly GridTrack[],
  measured: readonly MeasuredPlacedChild[],
): GridTrackNaturals {
  const columnNaturals: number[] = new Array(columnTracks.length).fill(0);
  const rowNaturals: number[] = new Array(rowTracks.length).fill(0);

  for (let i = 0; i < columnTracks.length; i++) {
    const track = columnTracks[i];
    if (!track) continue;
    if (track.kind === "fixed") {
      columnNaturals[i] = track.size;
    }
  }

  for (let i = 0; i < rowTracks.length; i++) {
    const track = rowTracks[i];
    if (!track) continue;
    if (track.kind === "fixed") {
      rowNaturals[i] = track.size;
    }
  }

  for (let i = 0; i < measured.length; i++) {
    const item = measured[i];
    if (!item) continue;

    const colTrack = columnTracks[item.column];
    if (colTrack?.kind === "auto" || colTrack?.kind === "count") {
      const cur = columnNaturals[item.column] ?? 0;
      if (item.size.w > cur) {
        columnNaturals[item.column] = item.size.w;
      }
    }

    const rowTrack = rowTracks[item.row];
    if (rowTrack?.kind === "auto") {
      const cur = rowNaturals[item.row] ?? 0;
      if (item.size.h > cur) {
        rowNaturals[item.row] = item.size.h;
      }
    }
  }

  return { columns: columnNaturals, rows: rowNaturals };
}

function sumTracksWithGap(sizes: readonly number[], gap: number): number {
  let total = 0;
  for (let i = 0; i < sizes.length; i++) {
    total += sizes[i] ?? 0;
  }
  if (sizes.length > 1) {
    total += gap * (sizes.length - 1);
  }
  return total;
}

function resolveTrackSizes(
  tracks: readonly GridTrack[],
  autoNaturals: readonly number[],
  available: number,
  gap: number,
): number[] {
  const out = new Array<number>(tracks.length).fill(0);
  if (tracks.length === 0) return out;

  const gapTotal = tracks.length <= 1 ? 0 : gap * (tracks.length - 1);
  const availableForTracks = clampNonNegative(available - gapTotal);

  let remaining = availableForTracks;
  const flexItems: FlexItem[] = [];

  for (let i = 0; i < tracks.length; i++) {
    const track = tracks[i];
    if (!track) continue;

    if (track.kind === "fr" || track.kind === "count") {
      const flex = track.kind === "fr" ? track.flex : 1;
      flexItems.push({ index: i, flex, min: 0, max: availableForTracks });
      continue;
    }

    const requested = track.kind === "fixed" ? track.size : (autoNaturals[i] ?? 0);
    if (requested <= 0 || remaining <= 0) {
      out[i] = 0;
      continue;
    }

    const size = Math.min(requested, remaining);
    out[i] = size;
    remaining = clampNonNegative(remaining - size);
  }

  if (remaining > 0 && flexItems.length > 0) {
    const alloc = distributeFlex(remaining, flexItems);
    for (let i = 0; i < flexItems.length; i++) {
      const item = flexItems[i];
      if (!item) continue;
      out[item.index] = alloc[i] ?? 0;
    }
    releaseArray(alloc);
  }

  return out;
}

function computeTrackStarts(sizes: readonly number[], gap: number): number[] {
  const starts = new Array<number>(sizes.length).fill(0);
  let cursor = 0;
  for (let i = 0; i < sizes.length; i++) {
    starts[i] = cursor;
    const size = sizes[i] ?? 0;
    cursor += size + (i < sizes.length - 1 ? gap : 0);
  }
  return starts;
}

export function measureGridKinds(
  vnode: VNode,
  maxW: number,
  maxH: number,
  axis: Axis,
  measureNode: MeasureNodeFn,
): LayoutResult<Size> {
  switch (vnode.kind) {
    case "grid": {
      const parsedRes = parseGridProps(vnode.props);
      if (!parsedRes.ok) return parsedRes;
      const parsed = parsedRes.value;

      const explicitRowCount = parsed.rowTracks?.length ?? 0;
      const placement = buildPlacementPlan(
        vnode.children as readonly (VNode | undefined)[],
        parsed.columnTracks.length,
        parsed.explicitRows,
        explicitRowCount,
      );

      const rowTracks = parsed.rowTracks ?? createAutoTracks(placement.rowCount);
      const measuredRes = measurePlacedChildren(placement.placed, maxW, maxH, axis, measureNode);
      if (!measuredRes.ok) return measuredRes;

      const naturals = resolveTrackNaturals(parsed.columnTracks, rowTracks, measuredRes.value);

      const naturalW = sumTracksWithGap(naturals.columns, parsed.columnGap);
      const naturalH = sumTracksWithGap(naturals.rows, parsed.rowGap);

      return ok({
        w: clampNonNegative(Math.min(maxW, naturalW)),
        h: clampNonNegative(Math.min(maxH, naturalH)),
      });
    }
    default:
      return {
        ok: false,
        fatal: { code: "ZRUI_INVALID_PROPS", detail: "measureGridKinds: unexpected vnode kind" },
      };
  }
}

export function layoutGridKinds(
  vnode: VNode,
  x: number,
  y: number,
  rectW: number,
  rectH: number,
  axis: Axis,
  measureNode: MeasureNodeFn,
  layoutNode: LayoutNodeFn,
): LayoutResult<LayoutTree> {
  switch (vnode.kind) {
    case "grid": {
      const parsedRes = parseGridProps(vnode.props);
      if (!parsedRes.ok) return parsedRes;
      const parsed = parsedRes.value;

      const explicitRowCount = parsed.rowTracks?.length ?? 0;
      const placement = buildPlacementPlan(
        vnode.children as readonly (VNode | undefined)[],
        parsed.columnTracks.length,
        parsed.explicitRows,
        explicitRowCount,
      );

      const rowTracks = parsed.rowTracks ?? createAutoTracks(placement.rowCount);
      const measuredRes = measurePlacedChildren(placement.placed, rectW, rectH, axis, measureNode);
      if (!measuredRes.ok) return measuredRes;

      const naturals = resolveTrackNaturals(parsed.columnTracks, rowTracks, measuredRes.value);
      const columnSizes = resolveTrackSizes(
        parsed.columnTracks,
        naturals.columns,
        rectW,
        parsed.columnGap,
      );
      const rowSizes = resolveTrackSizes(rowTracks, naturals.rows, rectH, parsed.rowGap);
      const columnStarts = computeTrackStarts(columnSizes, parsed.columnGap);
      const rowStarts = computeTrackStarts(rowSizes, parsed.rowGap);

      const children: LayoutTree[] = [];
      for (let i = 0; i < placement.placed.length; i++) {
        const placed = placement.placed[i];
        if (!placed) continue;

        const childX = x + (columnStarts[placed.column] ?? 0);
        const childY = y + (rowStarts[placed.row] ?? 0);
        const childW = columnSizes[placed.column] ?? 0;
        const childH = rowSizes[placed.row] ?? 0;

        const childRes = layoutNode(
          placed.child,
          childX,
          childY,
          childW,
          childH,
          axis,
          childW,
          childH,
        );
        if (!childRes.ok) return childRes;
        children.push(childRes.value);
      }

      return ok({
        vnode,
        rect: { x, y, w: rectW, h: rectH },
        children: Object.freeze(children),
      });
    }
    default:
      return {
        ok: false,
        fatal: { code: "ZRUI_INVALID_PROPS", detail: "layoutGridKinds: unexpected vnode kind" },
      };
  }
}
