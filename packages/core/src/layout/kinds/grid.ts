import type { VNode } from "../../widgets/types.js";
import { clampNonNegative } from "../engine/bounds.js";
import { distributeInteger } from "../engine/distributeInteger.js";
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

type PlacedChild = Readonly<{
  child: VNode;
  column: number;
  row: number;
  colSpan: number;
  rowSpan: number;
}>;

type MeasuredPlacedChild = Readonly<{
  child: VNode;
  column: number;
  row: number;
  colSpan: number;
  rowSpan: number;
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

type ChildGridPlacementProps = Readonly<{
  gridColumn: number | null;
  gridRow: number | null;
  colSpan: number;
  rowSpan: number;
}>;

function readPositiveInt(value: unknown): number | null {
  if (typeof value !== "number" || !Number.isFinite(value)) return null;
  const n = Math.floor(value);
  return n > 0 ? n : null;
}

function readChildGridPlacementProps(child: VNode): ChildGridPlacementProps {
  const props = (child.props ?? {}) as {
    gridColumn?: unknown;
    gridRow?: unknown;
    colSpan?: unknown;
    rowSpan?: unknown;
  };
  const gridColumnRaw = readPositiveInt(props.gridColumn);
  const gridRowRaw = readPositiveInt(props.gridRow);
  const colSpanRaw = readPositiveInt(props.colSpan);
  const rowSpanRaw = readPositiveInt(props.rowSpan);
  return {
    gridColumn: gridColumnRaw === null ? null : gridColumnRaw - 1,
    gridRow: gridRowRaw === null ? null : gridRowRaw - 1,
    colSpan: colSpanRaw ?? 1,
    rowSpan: rowSpanRaw ?? 1,
  };
}

function ensureRows(occupied: boolean[][], rowCount: number, columnCount: number): void {
  while (occupied.length < rowCount) {
    occupied.push(new Array<boolean>(columnCount).fill(false));
  }
}

function markOccupied(
  occupied: boolean[][],
  row: number,
  column: number,
  rowSpan: number,
  colSpan: number,
  rowCount: number,
  columnCount: number,
): void {
  for (let dr = 0; dr < rowSpan; dr++) {
    const r = row + dr;
    if (r < 0 || r >= rowCount) continue;
    for (let dc = 0; dc < colSpan; dc++) {
      const c = column + dc;
      if (c < 0 || c >= columnCount) continue;
      const occupiedRow = occupied[r];
      if (!occupiedRow) continue;
      occupiedRow[c] = true;
    }
  }
}

function fitsAt(
  occupied: boolean[][],
  row: number,
  column: number,
  rowSpan: number,
  colSpan: number,
  rowCount: number,
  columnCount: number,
): boolean {
  if (column < 0 || column + colSpan > columnCount) return false;
  if (row < 0 || row + rowSpan > rowCount) return false;
  for (let dr = 0; dr < rowSpan; dr++) {
    const r = row + dr;
    for (let dc = 0; dc < colSpan; dc++) {
      const c = column + dc;
      if (occupied[r]?.[c]) return false;
    }
  }
  return true;
}

function findNextFree(
  occupied: boolean[][],
  startRow: number,
  startColumn: number,
  rowSpan: number,
  colSpan: number,
  rowCount: number,
  columnCount: number,
): [number, number] {
  for (let row = startRow; row < rowCount; row++) {
    const cStart = row === startRow ? startColumn : 0;
    const cEnd = Math.max(cStart, columnCount - colSpan);
    for (let col = cStart; col <= cEnd; col++) {
      if (fitsAt(occupied, row, col, rowSpan, colSpan, rowCount, columnCount)) {
        return [row, col];
      }
    }
  }
  return [rowCount, 0];
}

function buildPlacementPlan(
  children: readonly (VNode | undefined)[],
  columnCount: number,
  explicitRows: boolean,
  explicitRowCount: number,
): PlacementPlan {
  const placements: Array<PlacedChild | null> = new Array(children.length).fill(null);
  const autoChildren: Array<Readonly<{ child: VNode; index: number }>> = [];
  const occupied: boolean[][] = [];

  let rowCount = explicitRows ? explicitRowCount : 0;
  if (!explicitRows) ensureRows(occupied, 1, columnCount);
  else ensureRows(occupied, explicitRowCount, columnCount);

  // Phase 1: explicit placements first.
  for (let i = 0; i < children.length; i++) {
    const child = children[i];
    if (!child) continue;
    const itemProps = readChildGridPlacementProps(child);
    const isExplicit = itemProps.gridColumn !== null || itemProps.gridRow !== null;
    if (!isExplicit) {
      autoChildren.push(Object.freeze({ child, index: i }));
      continue;
    }

    const startColumn = itemProps.gridColumn ?? 0;
    const startRow = itemProps.gridRow ?? 0;
    if (startColumn >= columnCount) continue;
    if (explicitRows && startRow >= rowCount) continue;

    const colSpan = Math.max(1, Math.min(itemProps.colSpan, columnCount - startColumn));
    let rowSpan = Math.max(1, itemProps.rowSpan);
    if (explicitRows) {
      rowSpan = Math.max(1, Math.min(rowSpan, rowCount - startRow));
      if (rowSpan <= 0) continue;
    } else {
      const neededRows = startRow + rowSpan;
      if (neededRows > rowCount) {
        rowCount = neededRows;
        ensureRows(occupied, rowCount, columnCount);
      }
    }

    let [row, col] = findNextFree(
      occupied,
      startRow,
      startColumn,
      rowSpan,
      colSpan,
      rowCount,
      columnCount,
    );
    if (row >= rowCount) {
      if (explicitRows) continue;
      row = rowCount;
      col = 0;
      rowCount = row + rowSpan;
      ensureRows(occupied, rowCount, columnCount);
    }

    markOccupied(occupied, row, col, rowSpan, colSpan, rowCount, columnCount);
    placements[i] = { child, column: col, row, colSpan, rowSpan };
  }

  // Phase 2: auto placements skip occupied cells.
  for (let i = 0; i < autoChildren.length; i++) {
    const auto = autoChildren[i];
    if (!auto) continue;
    const itemProps = readChildGridPlacementProps(auto.child);
    const colSpan = Math.max(1, Math.min(itemProps.colSpan, columnCount));
    let rowSpan = Math.max(1, itemProps.rowSpan);

    if (!explicitRows && rowCount === 0) {
      rowCount = 1;
      ensureRows(occupied, rowCount, columnCount);
    }

    if (explicitRows) {
      rowSpan = Math.max(1, Math.min(rowSpan, rowCount));
      if (rowSpan <= 0 || rowCount <= 0) continue;
    }

    let [row, col] = findNextFree(occupied, 0, 0, rowSpan, colSpan, rowCount, columnCount);
    if (row >= rowCount) {
      if (explicitRows) continue;
      row = rowCount;
      col = 0;
      rowCount = row + rowSpan;
      ensureRows(occupied, rowCount, columnCount);
    }

    markOccupied(occupied, row, col, rowSpan, colSpan, rowCount, columnCount);
    placements[auto.index] = { child: auto.child, column: col, row, colSpan, rowSpan };
  }

  const placed: PlacedChild[] = [];
  for (let i = 0; i < placements.length; i++) {
    const placement = placements[i];
    if (placement) placed.push(placement);
  }

  if (!explicitRows && placed.length === 0) {
    rowCount = 0;
  }
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
    measured.push({
      child: p.child,
      column: p.column,
      row: p.row,
      colSpan: p.colSpan,
      rowSpan: p.rowSpan,
      size: sizeRes.value,
    });
  }
  return { ok: true, value: measured };
}

function resolveTrackNaturals(
  columnTracks: readonly GridTrack[],
  rowTracks: readonly GridTrack[],
  measured: readonly MeasuredPlacedChild[],
  columnGap: number,
  rowGap: number,
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

    const colSpan = Math.max(1, item.colSpan);
    const rowSpan = Math.max(1, item.rowSpan);

    let currentSpanW = 0;
    for (let c = 0; c < colSpan; c++) {
      currentSpanW += columnNaturals[item.column + c] ?? 0;
    }
    if (colSpan > 1) currentSpanW += columnGap * (colSpan - 1);
    const neededW = Math.max(0, item.size.w - currentSpanW);
    if (neededW > 0) {
      const growableColumns: number[] = [];
      for (let c = 0; c < colSpan; c++) {
        const colIndex = item.column + c;
        const track = columnTracks[colIndex];
        if (!track) continue;
        if (track.kind === "auto" || track.kind === "count") {
          growableColumns.push(colIndex);
        }
      }
      if (growableColumns.length > 0) {
        const add = distributeInteger(neededW, new Array<number>(growableColumns.length).fill(1));
        for (let c = 0; c < growableColumns.length; c++) {
          const colIndex = growableColumns[c];
          if (colIndex === undefined) continue;
          columnNaturals[colIndex] = (columnNaturals[colIndex] ?? 0) + (add[c] ?? 0);
        }
      }
    }

    let currentSpanH = 0;
    for (let r = 0; r < rowSpan; r++) {
      currentSpanH += rowNaturals[item.row + r] ?? 0;
    }
    if (rowSpan > 1) currentSpanH += rowGap * (rowSpan - 1);
    const neededH = Math.max(0, item.size.h - currentSpanH);
    if (neededH > 0) {
      const growableRows: number[] = [];
      for (let r = 0; r < rowSpan; r++) {
        const rowIndex = item.row + r;
        const track = rowTracks[rowIndex];
        if (!track) continue;
        if (track.kind === "auto") {
          growableRows.push(rowIndex);
        }
      }
      if (growableRows.length > 0) {
        const add = distributeInteger(neededH, new Array<number>(growableRows.length).fill(1));
        for (let r = 0; r < growableRows.length; r++) {
          const rowIndex = growableRows[r];
          if (rowIndex === undefined) continue;
          rowNaturals[rowIndex] = (rowNaturals[rowIndex] ?? 0) + (add[r] ?? 0);
        }
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
      flexItems.push({ index: i, flex, shrink: 0, basis: 0, min: 0, max: availableForTracks });
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

      const naturals = resolveTrackNaturals(
        parsed.columnTracks,
        rowTracks,
        measuredRes.value,
        parsed.columnGap,
        parsed.rowGap,
      );

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

      const naturals = resolveTrackNaturals(
        parsed.columnTracks,
        rowTracks,
        measuredRes.value,
        parsed.columnGap,
        parsed.rowGap,
      );
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
        let childW = 0;
        for (let c = 0; c < placed.colSpan; c++) {
          childW += columnSizes[placed.column + c] ?? 0;
        }
        if (placed.colSpan > 1) childW += parsed.columnGap * (placed.colSpan - 1);

        let childH = 0;
        for (let r = 0; r < placed.rowSpan; r++) {
          childH += rowSizes[placed.row + r] ?? 0;
        }
        if (placed.rowSpan > 1) childH += parsed.rowGap * (placed.rowSpan - 1);

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
