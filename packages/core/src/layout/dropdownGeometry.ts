import type { DropdownProps } from "../widgets/types.js";
import { calculateAnchorPosition } from "./positioning.js";
import { measureTextCells } from "./textMeasure.js";
import type { Rect } from "./types.js";

export type DropdownWindow = Readonly<{
  startIndex: number;
  endIndex: number;
  visibleRows: number;
  selectedIndex: number;
  overflow: boolean;
}>;

function clampIndex(value: number, min: number, max: number): number {
  if (!Number.isFinite(value)) return min;
  const truncated = Math.trunc(value);
  if (truncated <= min) return min;
  if (truncated >= max) return max;
  return truncated;
}

export function computeDropdownWindow(
  itemCount: number,
  selectedIndex: number,
  maxVisibleRows: number,
  previousStartIndex = 0,
): DropdownWindow {
  if (itemCount <= 0 || maxVisibleRows <= 0) {
    return Object.freeze({
      startIndex: 0,
      endIndex: 0,
      visibleRows: 0,
      selectedIndex: 0,
      overflow: false,
    });
  }

  const visibleRows = Math.min(itemCount, Math.max(0, Math.trunc(maxVisibleRows)));
  const normalizedSelectedIndex = clampIndex(selectedIndex, 0, itemCount - 1);
  const maxStartIndex = Math.max(0, itemCount - visibleRows);
  let startIndex = clampIndex(previousStartIndex, 0, maxStartIndex);

  if (normalizedSelectedIndex < startIndex) {
    startIndex = normalizedSelectedIndex;
  } else if (normalizedSelectedIndex >= startIndex + visibleRows) {
    startIndex = normalizedSelectedIndex - visibleRows + 1;
  }

  if (startIndex > maxStartIndex) startIndex = maxStartIndex;

  return Object.freeze({
    startIndex,
    endIndex: startIndex + visibleRows,
    visibleRows,
    selectedIndex: normalizedSelectedIndex,
    overflow: itemCount > visibleRows,
  });
}

export function computeDropdownGeometry(
  props: DropdownProps,
  anchorRect: Rect | null,
  viewport: Readonly<{ cols: number; rows: number }>,
): Rect | null {
  if (!anchorRect || viewport.cols <= 0 || viewport.rows <= 0) return null;

  const items = Array.isArray(props.items) ? props.items : [];
  let maxLabelW = 0;
  let maxShortcutW = 0;
  for (const item of items) {
    if (!item || item.divider) continue;
    const labelW = measureTextCells(item.label);
    if (labelW > maxLabelW) maxLabelW = labelW;
    const shortcut = item.shortcut;
    if (shortcut && shortcut.length > 0) {
      const shortcutW = measureTextCells(shortcut);
      if (shortcutW > maxShortcutW) maxShortcutW = shortcutW;
    }
  }

  const gapW = maxShortcutW > 0 ? 1 : 0;
  const contentW = Math.max(1, maxLabelW + gapW + maxShortcutW);
  const totalW = Math.max(2, contentW + 2);
  const totalH = Math.max(2, items.length + 2);
  const needsScroll = totalH > viewport.rows;
  const clampedH = needsScroll ? Math.max(2, viewport.rows) : totalH;
  const finalW = needsScroll ? Math.max(2, Math.min(viewport.cols, totalW + 1)) : totalW;

  const pos = calculateAnchorPosition({
    anchor: anchorRect,
    overlaySize: { w: finalW, h: clampedH },
    position: props.position ?? "below-start",
    viewport: { x: 0, y: 0, width: viewport.cols, height: viewport.rows },
    gap: 0,
    flip: true,
  });
  return pos.rect;
}
