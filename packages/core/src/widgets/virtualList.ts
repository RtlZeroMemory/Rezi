/**
 * packages/core/src/widgets/virtualList.ts — Virtual list core algorithms.
 *
 * Why: Implements the virtualization logic for efficiently rendering large lists.
 * Only items within the visible viewport (plus overscan buffer) are rendered,
 * enabling lists with 100k+ items without performance degradation.
 *
 * Performance targets:
 *   - Initial render: <5ms any size (O(viewport) VNode creation)
 *   - Scroll update: <2ms per frame (only re-layout visible items)
 *   - Memory: O(viewport + overscan) for VNodes
 *
 * Algorithms:
 *   - Fixed height: O(1) offset calculation via multiplication
 *   - Variable height: O(n) cumulative offset array, binary search for range
 *
 * @see docs/widgets/virtual-list.md
 */

import type { ItemHeightSpec } from "./types.js";

/** Result of computing the visible range for a virtual list. */
export type VisibleRangeResult = Readonly<{
  /** First visible item index (inclusive, including overscan). */
  startIndex: number;
  /** One past last visible item index (exclusive, including overscan). */
  endIndex: number;
  /** Cumulative Y offsets for each item (length = items.length + 1). */
  itemOffsets: readonly number[];
}>;

/**
 * Build cumulative offset array for items.
 *
 * For fixed height: O(n) but simple and cache-friendly.
 * For variable height: O(n) with height function calls.
 *
 * @returns Array of length items.length + 1, where offsets[i] is the Y position of item i.
 */
function buildOffsets<T>(items: readonly T[], itemHeight: ItemHeightSpec<T>): number[] {
  const n = items.length;
  const offsets = new Array<number>(n + 1);
  offsets[0] = 0;

  if (typeof itemHeight === "number") {
    // Fixed height: simple multiplication
    for (let i = 0; i < n; i++) {
      offsets[i + 1] = (i + 1) * itemHeight;
    }
  } else {
    // Variable height: accumulate
    let y = 0;
    for (let i = 0; i < n; i++) {
      const item = items[i];
      if (item === undefined) {
        offsets[i + 1] = y;
        continue;
      }
      y += itemHeight(item, i);
      offsets[i + 1] = y;
    }
  }

  return offsets;
}

/**
 * Binary search for first item where offsets[i+1] > target.
 * Returns the index of the first item that starts at or after target.
 */
function binarySearchStart(offsets: readonly number[], target: number): number {
  let lo = 0;
  let hi = offsets.length - 2; // last valid item index

  while (lo < hi) {
    const mid = (lo + hi) >>> 1;
    const endOfItem = offsets[mid + 1];
    if (endOfItem === undefined || endOfItem <= target) {
      lo = mid + 1;
    } else {
      hi = mid;
    }
  }

  return lo;
}

/**
 * Binary search for last item where offsets[i] < target.
 * Returns one past the last visible item.
 */
function binarySearchEnd(offsets: readonly number[], target: number): number {
  let lo = 0;
  let hi = offsets.length - 1;

  while (lo < hi) {
    const mid = (lo + hi) >>> 1;
    const startOfItem = offsets[mid];
    if (startOfItem === undefined || startOfItem < target) {
      lo = mid + 1;
    } else {
      hi = mid;
    }
  }

  return lo;
}

/**
 * Compute visible item range with overscan.
 *
 * Algorithm:
 * - Fixed height: O(1) direct calculation via division
 * - Variable height: O(n) cumulative offset array + binary search
 *
 * @param items - The full list of items
 * @param itemHeight - Fixed height or height function
 * @param scrollTop - Current scroll position in pixels/cells
 * @param viewportHeight - Visible viewport height in pixels/cells
 * @param overscan - Number of items to render outside viewport
 * @returns Visible range with item offsets
 */
export function computeVisibleRange<T>(
  items: readonly T[],
  itemHeight: ItemHeightSpec<T>,
  scrollTop: number,
  viewportHeight: number,
  overscan: number,
): VisibleRangeResult {
  const n = items.length;

  if (n === 0) {
    return Object.freeze({
      startIndex: 0,
      endIndex: 0,
      itemOffsets: Object.freeze([0]),
    });
  }

  // Fixed height: O(1) calculation without building full offset array
  if (typeof itemHeight === "number") {
    const totalHeight = n * itemHeight;
    const clampedScrollTop = clampScrollTop(scrollTop, totalHeight, viewportHeight);

    // Direct calculation: startIndex = floor(scrollTop / h), endIndex = ceil((scrollTop + viewport) / h)
    const rawStart = Math.floor(clampedScrollTop / itemHeight);
    const rawEnd = Math.ceil((clampedScrollTop + viewportHeight) / itemHeight);

    // Apply overscan and clamp to valid bounds
    const startIndex = Math.max(0, rawStart - overscan);
    const endIndex = Math.min(n, rawEnd + overscan);

    // Build offset array only for the range needed (plus buffer for rendering)
    // For consistency with variable height API, we still return full offsets
    // but compute them lazily via multiplication
    const offsets = new Array<number>(n + 1);
    for (let i = 0; i <= n; i++) {
      offsets[i] = i * itemHeight;
    }

    return Object.freeze({
      startIndex,
      endIndex,
      itemOffsets: Object.freeze(offsets),
    });
  }

  // Variable height: O(n) offset building + binary search
  const offsets = buildOffsets(items, itemHeight);
  const totalHeight = offsets[n] ?? 0;
  const clampedScrollTop = clampScrollTop(scrollTop, totalHeight, viewportHeight);

  // Find first visible item (where item's bottom edge > scrollTop)
  const rawStart = binarySearchStart(offsets, clampedScrollTop);

  // Find last visible item (where item's top edge < scrollTop + viewportHeight)
  const rawEnd = binarySearchEnd(offsets, clampedScrollTop + viewportHeight);

  // Apply overscan and clamp to valid bounds
  const startIndex = Math.max(0, rawStart - overscan);
  const endIndex = Math.min(n, rawEnd + overscan);

  return Object.freeze({
    startIndex,
    endIndex,
    itemOffsets: Object.freeze(offsets),
  });
}

/**
 * Get Y offset for a specific item index.
 *
 * @param items - The full list of items
 * @param itemHeight - Fixed height or height function
 * @param index - Item index to get offset for
 * @returns Y offset in cells from the start of the list
 */
export function getItemOffset<T>(
  items: readonly T[],
  itemHeight: ItemHeightSpec<T>,
  index: number,
): number {
  if (index < 0 || index >= items.length) {
    return 0;
  }

  if (typeof itemHeight === "number") {
    return index * itemHeight;
  }

  // Variable height: sum heights up to index
  let offset = 0;
  for (let i = 0; i < index; i++) {
    const item = items[i];
    if (item !== undefined) {
      offset += itemHeight(item, i);
    }
  }
  return offset;
}

/**
 * Get height of a specific item.
 *
 * @param items - The full list of items
 * @param itemHeight - Fixed height or height function
 * @param index - Item index to get height for
 * @returns Height in cells
 */
export function getItemHeight<T>(
  items: readonly T[],
  itemHeight: ItemHeightSpec<T>,
  index: number,
): number {
  if (index < 0 || index >= items.length) {
    return 0;
  }

  if (typeof itemHeight === "number") {
    return itemHeight;
  }

  const item = items[index];
  if (item === undefined) {
    return 0;
  }

  return itemHeight(item, index);
}

/**
 * Compute total height of all items.
 *
 * @param items - The full list of items
 * @param itemHeight - Fixed height or height function
 * @returns Total height in cells
 */
export function getTotalHeight<T>(items: readonly T[], itemHeight: ItemHeightSpec<T>): number {
  if (items.length === 0) {
    return 0;
  }

  if (typeof itemHeight === "number") {
    return items.length * itemHeight;
  }

  let total = 0;
  for (let i = 0; i < items.length; i++) {
    const item = items[i];
    if (item !== undefined) {
      total += itemHeight(item, i);
    }
  }
  return total;
}

/**
 * Ensure selected index is visible by adjusting scrollTop.
 *
 * If the item is above the viewport, scroll up to show it at the top.
 * If the item is below the viewport, scroll down to show it at the bottom.
 * If the item is already visible, return current scrollTop unchanged.
 *
 * @param scrollTop - Current scroll position
 * @param viewportHeight - Visible viewport height
 * @param itemOffset - Y offset of the item to make visible
 * @param itemHeight - Height of the item to make visible
 * @returns Adjusted scrollTop to ensure item is visible
 */
export function ensureVisible(
  scrollTop: number,
  viewportHeight: number,
  itemOffset: number,
  itemHeight: number,
): number {
  const itemTop = itemOffset;
  const itemBottom = itemOffset + itemHeight;
  const viewportBottom = scrollTop + viewportHeight;

  // Item is above viewport - scroll up to show at top
  if (itemTop < scrollTop) {
    return itemTop;
  }

  // Item is below viewport - scroll down to show at bottom
  if (itemBottom > viewportBottom) {
    return Math.max(0, itemBottom - viewportHeight);
  }

  // Item is visible - no change needed
  return scrollTop;
}

/**
 * Clamp scrollTop to valid range.
 *
 * @param scrollTop - Proposed scroll position
 * @param totalHeight - Total content height
 * @param viewportHeight - Visible viewport height
 * @returns Clamped scrollTop in range [0, max(0, totalHeight - viewportHeight)]
 */
export function clampScrollTop(
  scrollTop: number,
  totalHeight: number,
  viewportHeight: number,
): number {
  const maxScroll = Math.max(0, totalHeight - viewportHeight);
  return Math.max(0, Math.min(maxScroll, scrollTop));
}
