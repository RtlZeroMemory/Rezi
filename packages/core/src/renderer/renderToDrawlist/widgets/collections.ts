import type { DrawlistBuilderV1 } from "../../../index.js";
import type { LayoutTree } from "../../../layout/layout.js";
import {
  measureTextCells,
  truncateMiddle,
  truncateWithEllipsis,
} from "../../../layout/textMeasure.js";
import type { Rect } from "../../../layout/types.js";
import type { RuntimeInstance } from "../../../runtime/commit.js";
import type { FocusState } from "../../../runtime/focus.js";
import type {
  TableLocalState,
  TableStateStore,
  TreeLocalState,
  TreeStateStore,
  VirtualListLocalState,
  VirtualListStateStore,
} from "../../../runtime/localState.js";
import type { Theme } from "../../../theme/theme.js";
import { tableRecipe } from "../../../ui/recipes.js";
import { distributeColumnWidths } from "../../../widgets/table.js";
import { type FlattenedNode, computeNodeState, flattenTree } from "../../../widgets/tree.js";
import type { TableProps, TreeProps, VirtualListProps } from "../../../widgets/types.js";
import {
  computeVisibleRange,
  getItemHeight,
  getItemOffset,
  getTotalHeight,
  resolveVirtualListItemHeightSpec,
} from "../../../widgets/virtualList.js";
import { asTextStyle } from "../../styles.js";
import { renderBoxBorder } from "../boxBorder.js";
import { isVisibleRect } from "../indices.js";
import { measureVNodeSimpleHeight, renderVNodeSimple } from "../simpleVNode.js";
import { clampNonNegative } from "../spacing.js";
import type { ResolvedTextStyle } from "../textStyle.js";
import { mergeTextStyle } from "../textStyle.js";
import { getColorTokens, readWidgetSize } from "../themeTokens.js";
import type { TableRenderCache } from "../types.js";
import { getExpandedSet, getTreePrefixes } from "./files.js";
import {
  focusIndicatorEnabled,
  readFocusConfig,
  readFocusIndicator,
  resolveFocusIndicatorStyle,
  resolveFocusedContentStyle,
} from "./focusConfig.js";

const EMPTY_STRING_ARRAY: readonly string[] = Object.freeze([]);
const SPACE_PAD_CACHE_MAX = 512;
const spacePadCache = new Map<number, string>();

function cachedSpaces(count: number): string {
  if (count <= 0) return "";
  if (count > SPACE_PAD_CACHE_MAX) return " ".repeat(count);
  const cached = spacePadCache.get(count);
  if (cached !== undefined) return cached;
  const value = " ".repeat(count);
  if (spacePadCache.size >= SPACE_PAD_CACHE_MAX) {
    const oldest = spacePadCache.keys().next();
    if (!oldest.done) spacePadCache.delete(oldest.value);
  }
  spacePadCache.set(count, value);
  return value;
}

type CellAlign = "left" | "center" | "right";
type CellOverflow = "clip" | "ellipsis" | "middle";
type TableBorderGlyph = "single" | "double" | "rounded" | "heavy" | "dashed" | "heavy-dashed";

function readCellAlign(raw: unknown): CellAlign {
  return raw === "center" || raw === "right" ? raw : "left";
}

function readCellOverflow(raw: unknown): CellOverflow {
  return raw === "clip" || raw === "middle" ? raw : "ellipsis";
}

function readTableBorderVariant(raw: unknown): TableBorderGlyph | undefined {
  switch (raw) {
    case "single":
    case "double":
    case "rounded":
    case "heavy":
    case "dashed":
    case "heavy-dashed":
      return raw;
    default:
      return undefined;
  }
}

type AlignedCellText = Readonly<{
  text: string;
  xOffset: number;
  clip: boolean;
}>;

function alignCellContent(
  text: string,
  width: number,
  align: CellAlign,
  overflow: CellOverflow,
): AlignedCellText {
  if (width <= 0) return { text: "", xOffset: 0, clip: false };
  const textWidth = measureTextCells(text);
  if (overflow === "clip" && textWidth > width) {
    const xOffset =
      align === "right"
        ? width - textWidth
        : align === "center"
          ? Math.floor((width - textWidth) / 2)
          : 0;
    return { text, xOffset, clip: true };
  }
  const clipped =
    textWidth > width
      ? overflow === "middle"
        ? truncateMiddle(text, width)
        : truncateWithEllipsis(text, width)
      : text;
  const contentWidth = measureTextCells(clipped);
  const pad = Math.max(0, width - contentWidth);
  if (align === "right") {
    return { text: `${cachedSpaces(pad)}${clipped}`, xOffset: 0, clip: false };
  }
  if (align === "center") {
    const leftPad = Math.floor(pad / 2);
    const rightPad = pad - leftPad;
    return {
      text: `${cachedSpaces(leftPad)}${clipped}${cachedSpaces(rightPad)}`,
      xOffset: 0,
      clip: false,
    };
  }
  return { text: `${clipped}${cachedSpaces(pad)}`, xOffset: 0, clip: false };
}

function drawAlignedCellText(
  builder: DrawlistBuilderV1,
  x: number,
  y: number,
  w: number,
  h: number,
  cell: AlignedCellText,
  style: ResolvedTextStyle,
): void {
  if (cell.clip) {
    builder.pushClip(x, y, w, h);
    builder.drawText(x + cell.xOffset, y, cell.text, style);
    builder.popClip();
    return;
  }
  builder.drawText(x + cell.xOffset, y, cell.text, style);
}

function clampScrollTop(scrollTop: number, totalHeight: number, viewportHeight: number): number {
  const maxScrollTop = Math.max(0, totalHeight - viewportHeight);
  if (!Number.isFinite(scrollTop) || scrollTop <= 0) return 0;
  if (scrollTop >= maxScrollTop) return maxScrollTop;
  return scrollTop;
}

function clampIndexScrollTop(scrollTop: number, totalRows: number, viewportHeight: number): number {
  return Math.trunc(clampScrollTop(scrollTop, totalRows, viewportHeight));
}

function normalizeMeasuredItemHeight(height: number): number | undefined {
  if (!Number.isFinite(height) || height <= 0) return undefined;
  return Math.max(1, Math.trunc(height));
}

function setLayoutScrollMetadata(
  layoutNode: LayoutTree,
  patch: Readonly<{
    scrollX?: number;
    scrollY?: number;
    contentWidth?: number;
    contentHeight?: number;
    viewportWidth?: number;
    viewportHeight?: number;
  }>,
): void {
  const prev = layoutNode.meta as
    | {
        scrollX?: unknown;
        scrollY?: unknown;
        contentWidth?: unknown;
        contentHeight?: unknown;
        viewportWidth?: unknown;
        viewportHeight?: unknown;
      }
    | undefined;
  const next = Object.freeze({
    scrollX: patch.scrollX ?? (typeof prev?.scrollX === "number" ? prev.scrollX : 0),
    scrollY: patch.scrollY ?? (typeof prev?.scrollY === "number" ? prev.scrollY : 0),
    contentWidth:
      patch.contentWidth ?? (typeof prev?.contentWidth === "number" ? prev.contentWidth : 0),
    contentHeight:
      patch.contentHeight ?? (typeof prev?.contentHeight === "number" ? prev.contentHeight : 0),
    viewportWidth:
      patch.viewportWidth ?? (typeof prev?.viewportWidth === "number" ? prev.viewportWidth : 0),
    viewportHeight:
      patch.viewportHeight ?? (typeof prev?.viewportHeight === "number" ? prev.viewportHeight : 0),
  });
  (layoutNode as { meta?: unknown }).meta = next;
}

export function renderCollectionWidget(
  builder: DrawlistBuilderV1,
  focusState: FocusState,
  rect: Rect,
  theme: Theme,
  tick: number,
  parentStyle: ResolvedTextStyle,
  node: RuntimeInstance,
  layoutNode: LayoutTree,
  nodeStack: (RuntimeInstance | null)[],
  styleStack: ResolvedTextStyle[],
  virtualListStore: VirtualListStateStore | undefined,
  tableStore: TableStateStore | undefined,
  treeStore: TreeStateStore | undefined,
  loadedTreeChildrenById: ReadonlyMap<string, ReadonlyMap<string, readonly unknown[]>> | undefined,
  tableRenderCacheById: ReadonlyMap<string, TableRenderCache> | undefined,
): void {
  const vnode = node.vnode;

  switch (vnode.kind) {
    case "virtualList": {
      if (!isVisibleRect(rect)) break;

      const props = vnode.props as VirtualListProps<unknown>;
      const focusConfig = readFocusConfig(props.focusConfig);
      const showFocusIndicator = focusIndicatorEnabled(focusConfig);
      const selectionStyle = asTextStyle(props.selectionStyle, theme);
      const { items, overscan = 3, renderItem } = props;
      const itemHeight = resolveVirtualListItemHeightSpec(props);
      const estimateMode = props.estimateItemHeight !== undefined;

      // Get virtual list state (scrollTop, selectedIndex)
      const state: VirtualListLocalState = virtualListStore
        ? virtualListStore.get(props.id)
        : { scrollTop: 0, selectedIndex: 0, viewportHeight: rect.h, startIndex: 0, endIndex: 0 };

      const measuredHeights =
        estimateMode &&
        state.measuredHeights !== undefined &&
        state.measuredWidth === rect.w &&
        state.measuredItemCount === items.length
          ? state.measuredHeights
          : undefined;

      const totalHeight = getTotalHeight(items, itemHeight, measuredHeights);
      const effectiveScrollTop = clampScrollTop(state.scrollTop, totalHeight, rect.h);

      const fixedItemHeight =
        !estimateMode && measuredHeights === undefined && typeof itemHeight === "number"
          ? itemHeight > 0
            ? itemHeight
            : 1
          : null;

      let startIndex = 0;
      let endIndex = 0;
      let itemOffsets: readonly number[] = [];
      if (fixedItemHeight === null) {
        const computed = computeVisibleRange(
          items,
          itemHeight,
          effectiveScrollTop,
          rect.h,
          overscan,
          measuredHeights,
        );
        startIndex = computed.startIndex;
        endIndex = computed.endIndex;
        itemOffsets = computed.itemOffsets;
      } else {
        const safeOverscan = Math.max(0, overscan);
        const rawStart = Math.floor(effectiveScrollTop / fixedItemHeight);
        const rawEnd = Math.ceil((effectiveScrollTop + rect.h) / fixedItemHeight);
        startIndex = Math.max(0, rawStart - safeOverscan);
        endIndex = Math.min(items.length, rawEnd + safeOverscan);
      }

      let nextScrollTop = effectiveScrollTop;
      let nextMeasuredHeights: ReadonlyMap<number, number> | undefined;
      let changedMeasuredHeights = false;
      let deltaAboveViewport = 0;

      const updateMeasuredHeight = (index: number, value: number): void => {
        const normalized = normalizeMeasuredItemHeight(value);
        if (normalized === undefined) return;
        const current = normalizeMeasuredItemHeight(
          (nextMeasuredHeights ?? measuredHeights)?.get(index) ?? 0,
        );
        if (current === normalized) return;
        if (nextMeasuredHeights === undefined) {
          nextMeasuredHeights = new Map<number, number>(measuredHeights ?? []);
        }
        (nextMeasuredHeights as Map<number, number>).set(index, normalized);
        changedMeasuredHeights = true;
        const priorHeight = getItemHeight(items, itemHeight, index, measuredHeights);
        const itemBottom = itemOffsets[index + 1] ?? 0;
        if (itemBottom <= effectiveScrollTop) {
          deltaAboveViewport += normalized - priorHeight;
        }
      };

      // Apply clip rect for viewport
      builder.pushClip(rect.x, rect.y, rect.w, rect.h);
      nodeStack.push(null);

      // Render visible items only
      for (let i = startIndex; i < endIndex; i++) {
        const item = items[i];
        if (item === undefined) continue;

        const h = fixedItemHeight ?? getItemHeight(items, itemHeight, i, measuredHeights);
        const itemOffset =
          fixedItemHeight === null
            ? (itemOffsets[i] ?? getItemOffset(items, itemHeight, i, measuredHeights))
            : i * fixedItemHeight;
        const itemY = rect.y + itemOffset - effectiveScrollTop;
        const selected = i === state.selectedIndex;
        const focused = selected && showFocusIndicator;

        // Skip if item outside viewport (safety check)
        if (itemY + h < rect.y || itemY >= rect.y + rect.h) continue;

        let itemParentStyle = parentStyle;
        if (selected && selectionStyle) {
          itemParentStyle = mergeTextStyle(itemParentStyle, selectionStyle);
        }
        if (focused) {
          itemParentStyle = resolveFocusedContentStyle(itemParentStyle, theme, focusConfig);
          const focusIndicator = readFocusIndicator(focusConfig);
          if (focusIndicator === "background") {
            const indicatorStyle = resolveFocusIndicatorStyle(
              parentStyle,
              theme,
              focusConfig,
              mergeTextStyle(parentStyle, { bg: theme.colors.secondary }),
            );
            const rowBg = indicatorStyle.bg;
            if (rowBg !== undefined) {
              builder.fillRect(rect.x, itemY, rect.w, h, { bg: rowBg });
            }
          } else if (selectionStyle?.bg !== undefined) {
            builder.fillRect(rect.x, itemY, rect.w, h, { bg: selectionStyle.bg });
          }
        } else if (selected && selectionStyle?.bg !== undefined) {
          builder.fillRect(rect.x, itemY, rect.w, h, { bg: selectionStyle.bg });
        }

        // Render item to text
        const itemVNode = renderItem(item, i, focused);
        renderVNodeSimple(
          builder,
          itemVNode,
          rect.x,
          itemY,
          rect.w,
          h,
          focused,
          tick,
          theme,
          itemParentStyle,
        );

        if (estimateMode) {
          const measuredHeight =
            typeof props.measureItemHeight === "function"
              ? props.measureItemHeight(item, i, {
                  width: rect.w,
                  estimatedHeight: h,
                  vnode: itemVNode,
                })
              : measureVNodeSimpleHeight(itemVNode, rect.w);
          updateMeasuredHeight(i, measuredHeight);
        }
      }

      let finalMeasuredHeights = measuredHeights;
      let finalTotalHeight = totalHeight;
      if (changedMeasuredHeights && nextMeasuredHeights !== undefined) {
        finalMeasuredHeights = nextMeasuredHeights;
        finalTotalHeight = getTotalHeight(items, itemHeight, finalMeasuredHeights);
        nextScrollTop = clampScrollTop(
          effectiveScrollTop + deltaAboveViewport,
          finalTotalHeight,
          rect.h,
        );
        const recomputed = computeVisibleRange(
          items,
          itemHeight,
          nextScrollTop,
          rect.h,
          overscan,
          finalMeasuredHeights,
        );
        startIndex = recomputed.startIndex;
        endIndex = recomputed.endIndex;
      }

      setLayoutScrollMetadata(layoutNode, {
        scrollX: 0,
        scrollY: nextScrollTop,
        contentWidth: rect.w,
        contentHeight: finalTotalHeight,
        viewportWidth: rect.w,
        viewportHeight: rect.h,
      });

      // Update state with viewport dimensions if store is available
      if (virtualListStore) {
        const patch: {
          viewportHeight: number;
          startIndex: number;
          endIndex: number;
          scrollTop?: number;
          measuredHeights?: ReadonlyMap<number, number>;
          measuredWidth?: number;
          measuredItemCount?: number;
        } = {
          viewportHeight: rect.h,
          startIndex,
          endIndex,
        };
        if (nextScrollTop !== state.scrollTop) patch.scrollTop = nextScrollTop;
        if (estimateMode) {
          patch.measuredHeights = finalMeasuredHeights ?? new Map<number, number>();
          patch.measuredWidth = rect.w;
          patch.measuredItemCount = items.length;
        }
        virtualListStore.set(props.id, patch);
      }
      break;
    }
    case "table": {
      if (!isVisibleRect(rect)) break;
      const props = vnode.props as TableProps<unknown>;
      const focusConfig = readFocusConfig(props.focusConfig);
      const showFocusIndicator = focusIndicatorEnabled(focusConfig);
      const selectionStyle = asTextStyle(props.selectionStyle, theme);
      const colorTokens = getColorTokens(theme);
      const dsSize = readWidgetSize(props.dsSize) ?? "md";
      const headerRecipe =
        colorTokens !== null ? tableRecipe(colorTokens, { state: "header", size: dsSize }) : null;
      const rowRecipe =
        colorTokens !== null ? tableRecipe(colorTokens, { state: "row", size: dsSize }) : null;
      const stripeRecipe =
        colorTokens !== null ? tableRecipe(colorTokens, { state: "stripe", size: dsSize }) : null;
      const selectedRecipe =
        colorTokens !== null
          ? tableRecipe(colorTokens, { state: "selectedRow", size: dsSize })
          : null;
      const focusedRecipe =
        colorTokens !== null
          ? tableRecipe(colorTokens, { state: "focusedRow", size: dsSize })
          : null;
      const selectionBg =
        selectionStyle?.bg ??
        (colorTokens !== null ? selectedRecipe?.bg.bg : theme.colors.secondary);

      const borderVariant = readTableBorderVariant(props.borderStyle?.variant);
      const border =
        props.border === "none" ? "none" : borderVariant === undefined ? "single" : borderVariant;
      if (border !== "none") {
        const borderStyle = props.borderStyle?.color
          ? mergeTextStyle(parentStyle, { fg: props.borderStyle.color })
          : parentStyle;
        renderBoxBorder(builder, rect, border, undefined, "left", borderStyle);
      }

      const headerHeight = props.showHeader === false ? 0 : (props.headerHeight ?? 1);
      const rowHeight = props.rowHeight ?? 1;
      const safeRowHeight = rowHeight > 0 ? rowHeight : 1;
      const overscan = props.overscan ?? 3;
      const selection = (props.selection ?? EMPTY_STRING_ARRAY) as readonly string[];
      const selectionMode = props.selectionMode ?? "none";
      const virtualized = props.virtualized !== false;
      const stripedRows = props.stripedRows === true || props.stripeStyle !== undefined;
      const stripeOddBg =
        props.stripeStyle?.odd ??
        (colorTokens !== null ? stripeRecipe?.bg.bg : theme.colors.border);
      const stripeEvenBg = props.stripeStyle?.even ?? rowRecipe?.bg.bg;
      const tableCache = tableRenderCacheById?.get(props.id);
      const cachedRowKeys = tableCache?.rowKeys;
      const cachedSelectionSet = tableCache?.selectionSet;
      const needsSelection = selectionMode !== "none" && selection.length > 0;

      const t = border === "none" ? 0 : 1;
      const innerX = rect.x + t;
      const innerY = rect.y + t;
      const innerW = clampNonNegative(rect.w - t * 2);
      const innerH = clampNonNegative(rect.h - t * 2);

      const bodyY = innerY + headerHeight;
      const bodyH = clampNonNegative(innerH - headerHeight);

      const tableState: TableLocalState = tableStore
        ? tableStore.get(props.id)
        : {
            scrollTop: 0,
            focusedRowIndex: 0,
            focusedColumnIndex: 0,
            lastClickedKey: null,
            viewportHeight: bodyH,
            startIndex: 0,
            endIndex: 0,
          };

      const { widths } = distributeColumnWidths(props.columns, innerW);

      // Header
      if (headerHeight > 0 && innerW > 0) {
        if (headerRecipe?.bg.bg) {
          builder.fillRect(
            innerX,
            innerY,
            innerW,
            headerHeight,
            mergeTextStyle(parentStyle, headerRecipe.bg),
          );
        }
        let xCursor = innerX;
        for (let i = 0; i < props.columns.length; i++) {
          const col = props.columns[i];
          const w = widths[i] ?? 0;
          if (!col || w <= 0) continue;
          const sortIndicator =
            col.sortable === true && props.sortColumn === col.key
              ? props.sortDirection === "desc"
                ? " ▼"
                : " ▲"
              : "";
          const headerText = `${col.header ?? ""}${sortIndicator}`;
          const headerAlign = readCellAlign(col.align);
          const overflow = readCellOverflow(col.overflow);
          const cell = alignCellContent(headerText, w, headerAlign, overflow);
          const headerStyle0 =
            colorTokens !== null
              ? mergeTextStyle(
                  mergeTextStyle(parentStyle, headerRecipe?.cell),
                  sortIndicator.length > 0 ? { underline: true } : undefined,
                )
              : sortIndicator.length > 0
                ? mergeTextStyle(parentStyle, { bold: true, fg: theme.colors.info })
                : mergeTextStyle(parentStyle, { bold: true });
          const isHeaderFocused =
            showFocusIndicator &&
            focusState.focusedId === props.id &&
            tableState.focusedRowIndex === -1 &&
            i === tableState.focusedColumnIndex;
          const headerStyle = isHeaderFocused
            ? resolveFocusedContentStyle(
                resolveFocusIndicatorStyle(
                  headerStyle0,
                  theme,
                  focusConfig,
                  mergeTextStyle(headerStyle0, { inverse: true }),
                ),
                theme,
                focusConfig,
              )
            : headerStyle0;
          drawAlignedCellText(builder, xCursor, innerY, w, headerHeight, cell, headerStyle);
          xCursor += w;
        }
      }

      // Visible rows
      const rowCount = props.data.length;
      const totalBodyHeight = rowCount * safeRowHeight;
      const effectiveScrollTop = virtualized
        ? clampScrollTop(tableState.scrollTop, totalBodyHeight, bodyH)
        : 0;
      setLayoutScrollMetadata(layoutNode, {
        scrollX: 0,
        scrollY: effectiveScrollTop,
        contentWidth: innerW,
        contentHeight: totalBodyHeight,
        viewportWidth: innerW,
        viewportHeight: bodyH,
      });
      const startIndex = virtualized
        ? Math.max(0, Math.floor(effectiveScrollTop / safeRowHeight))
        : 0;
      const visibleRows = Math.ceil(bodyH / safeRowHeight);
      const endIndex = virtualized
        ? Math.min(rowCount, startIndex + visibleRows + overscan)
        : rowCount;

      if (tableStore) {
        tableStore.set(props.id, { viewportHeight: bodyH, startIndex, endIndex });
      }

      builder.pushClip(innerX, bodyY, innerW, bodyH);
      nodeStack.push(null);

      for (let i = startIndex; i < endIndex; i++) {
        const row = props.data[i];
        if (row === undefined) continue;
        let isSelected = false;
        if (needsSelection) {
          const rowKey = cachedRowKeys ? cachedRowKeys[i] : props.getRowKey(row, i);
          if (rowKey !== undefined) {
            isSelected = cachedSelectionSet
              ? cachedSelectionSet.has(rowKey)
              : selection.includes(rowKey);
          }
        }
        const isFocusedRow = focusState.focusedId === props.id && i === tableState.focusedRowIndex;
        const suppressFocusedStyle =
          selectionMode === "single" && needsSelection && isFocusedRow && !isSelected;
        const showFocusedStyle = showFocusIndicator && isFocusedRow && !suppressFocusedStyle;

        const yRow = bodyY + i * safeRowHeight - effectiveScrollTop;
        if (yRow >= bodyY + bodyH) break;
        if (yRow + safeRowHeight <= bodyY) continue;

        let focusedRowStyle = parentStyle;
        if (showFocusedStyle) {
          focusedRowStyle =
            colorTokens !== null
              ? mergeTextStyle(parentStyle, focusedRecipe?.cell)
              : resolveFocusedContentStyle(
                  resolveFocusIndicatorStyle(
                    parentStyle,
                    theme,
                    focusConfig,
                    mergeTextStyle(parentStyle, { inverse: true }),
                  ),
                  theme,
                  focusConfig,
                );
        }
        const focusedRowBg = colorTokens !== null ? focusedRecipe?.bg.bg : focusedRowStyle.bg;
        const rowStripeBg = stripedRows ? ((i & 1) === 1 ? stripeOddBg : stripeEvenBg) : undefined;
        const rowBg = showFocusedStyle
          ? focusedRowBg
          : isSelected
            ? selectionBg
            : (rowStripeBg ?? (colorTokens !== null ? rowRecipe?.bg.bg : undefined));
        if (rowBg) {
          builder.fillRect(innerX, yRow, innerW, safeRowHeight, { bg: rowBg });
        }
        if (showFocusedStyle && rowBg) {
          focusedRowStyle = mergeTextStyle(focusedRowStyle, { bg: rowBg });
        }

        let xCursor = innerX;
        for (let c = 0; c < props.columns.length; c++) {
          const col = props.columns[c];
          const w = widths[c] ?? 0;
          if (!col || w <= 0) continue;
          const rawValue = (row as Record<string, unknown>)[col.key];
          const cellText =
            col.render !== undefined
              ? null
              : rawValue === undefined
                ? ""
                : typeof rawValue === "string"
                  ? rawValue
                  : String(rawValue);

          const rowSelectedStyle =
            !showFocusedStyle && isSelected && selectionStyle
              ? mergeTextStyle(parentStyle, selectionStyle)
              : colorTokens !== null
                ? mergeTextStyle(
                    mergeTextStyle(
                      parentStyle,
                      isSelected
                        ? selectedRecipe?.cell
                        : rowStripeBg
                          ? stripeRecipe?.cell
                          : rowRecipe?.cell,
                    ),
                    rowBg ? { bg: rowBg } : undefined,
                  )
                : rowBg
                  ? mergeTextStyle(parentStyle, { bg: rowBg })
                  : parentStyle;
          const cellStyle = showFocusedStyle ? focusedRowStyle : rowSelectedStyle;

          if (col.render) {
            const cellVNode = col.render(rawValue, row, i);
            renderVNodeSimple(
              builder,
              cellVNode,
              xCursor,
              yRow,
              w,
              safeRowHeight,
              isFocusedRow,
              tick,
              theme,
              cellStyle,
            );
          } else {
            const t0 = cellText ?? "";
            const align = readCellAlign(col.align);
            const overflow = readCellOverflow(col.overflow);
            const cell = alignCellContent(t0, w, align, overflow);
            drawAlignedCellText(builder, xCursor, yRow, w, safeRowHeight, cell, cellStyle);
          }

          xCursor += w;
        }
      }
      break;
    }
    case "tree": {
      if (!isVisibleRect(rect)) break;
      const props = vnode.props as TreeProps<unknown>;

      const state: TreeLocalState = treeStore
        ? treeStore.get(props.id)
        : {
            focusedKey: null,
            loadingKeys: new Set<string>(),
            scrollTop: 0,
            viewportHeight: rect.h,
            flatCache: null,
            expandedSetRef: undefined,
            expandedSet: undefined,
            prefixCache: null,
          };

      const expandedSet = getExpandedSet(treeStore, props.id, state, props.expanded);
      const loaded = loadedTreeChildrenById?.get(props.id);
      const getKey = props.getKey as (n: unknown) => string;
      const getChildrenRaw = props.getChildren as
        | ((n: unknown) => readonly unknown[] | undefined)
        | undefined;
      const getChildren = loaded
        ? (n: unknown) => {
            const k = getKey(n);
            const cached = loaded.get(k);
            return cached ?? getChildrenRaw?.(n);
          }
        : getChildrenRaw;

      const cached = state.flatCache;
      const canReuseFlatCache =
        cached &&
        cached.kind === "tree" &&
        cached.dataRef === props.data &&
        cached.expandedRef === props.expanded &&
        cached.getKeyRef === props.getKey &&
        cached.getChildrenRef === props.getChildren &&
        cached.hasChildrenRef === props.hasChildren &&
        cached.loadedRef === loaded;
      const flatNodes: readonly FlattenedNode<unknown>[] = canReuseFlatCache
        ? (cached.flatNodes as readonly FlattenedNode<unknown>[])
        : flattenTree(
            props.data,
            getKey,
            getChildren,
            props.hasChildren as ((n: unknown) => boolean) | undefined,
            props.expanded,
            expandedSet,
          );

      if (treeStore) {
        treeStore.set(
          props.id,
          canReuseFlatCache
            ? { viewportHeight: rect.h }
            : {
                viewportHeight: rect.h,
                flatCache: Object.freeze({
                  kind: "tree",
                  dataRef: props.data,
                  expandedRef: props.expanded,
                  loadedRef: loaded,
                  getKeyRef: props.getKey,
                  getChildrenRef: props.getChildren,
                  hasChildrenRef: props.hasChildren,
                  flatNodes: flatNodes as readonly unknown[],
                }),
              },
        );
      }

      const effectiveScrollTop = clampIndexScrollTop(state.scrollTop, flatNodes.length, rect.h);
      const startIndex = Math.max(0, effectiveScrollTop);
      const endIndex = Math.min(flatNodes.length, startIndex + rect.h);
      setLayoutScrollMetadata(layoutNode, {
        scrollX: 0,
        scrollY: effectiveScrollTop,
        contentWidth: rect.w,
        contentHeight: flatNodes.length,
        viewportWidth: rect.w,
        viewportHeight: rect.h,
      });

      builder.pushClip(rect.x, rect.y, rect.w, rect.h);
      nodeStack.push(null);

      const focusedTree = focusState.focusedId === props.id;
      const showLines = props.showLines !== false;
      const indentSize = props.indentSize ?? 2;
      const prefixes = getTreePrefixes(
        treeStore,
        props.id,
        state,
        flatNodes as readonly FlattenedNode<unknown>[],
        showLines,
        indentSize,
      );

      for (let i = startIndex; i < endIndex; i++) {
        const fn = flatNodes[i];
        if (!fn) continue;
        const ns = computeNodeState(
          fn,
          props.expanded,
          props.selected,
          focusedTree ? (state.focusedKey ?? props.selected) : undefined,
          state.loadingKeys,
          expandedSet,
        );

        const yRow = rect.y + (i - effectiveScrollTop);
        const prefix = prefixes[i] ?? "";
        const prefixW = measureTextCells(prefix);
        builder.drawText(
          rect.x,
          yRow,
          prefix,
          mergeTextStyle(parentStyle, { fg: theme.colors.muted }),
        );
        const nodeVNode = props.renderNode(fn.node as unknown, fn.depth, ns);
        renderVNodeSimple(
          builder,
          nodeVNode,
          rect.x + prefixW,
          yRow,
          rect.w - prefixW,
          1,
          ns.focused,
          tick,
          theme,
          parentStyle,
        );
      }

      break;
    }
    default:
      break;
  }
}
