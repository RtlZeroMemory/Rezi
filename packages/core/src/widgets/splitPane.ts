/**
 * packages/core/src/widgets/splitPane.ts — SplitPane/PanelGroup core algorithms.
 *
 * Why: Implements divider drag logic, size distribution, and panel resizing
 * for the split pane and panel group widgets.
 *
 * @see docs/widgets/split-pane.md
 */

import { distributeInteger } from "../layout/engine/distributeInteger.js";
import type { SplitDirection } from "./types.js";

/** Default divider size in cells. */
export const DEFAULT_DIVIDER_SIZE = 1;

/** Divider hit area expansion for easier grabbing. */
export const DIVIDER_HIT_EXPAND = 1;

/** Result of computing panel sizes. */
export type PanelSizes = Readonly<{
  sizes: readonly number[];
  dividerPositions: readonly number[];
}>;

function normalizePanelCellSizes(
  sizes: number[],
  availableForPanels: number,
  minSizes?: readonly number[],
  maxSizes?: readonly number[],
): void {
  // Apply min/max constraints
  for (let i = 0; i < sizes.length; i++) {
    const minSize = minSizes?.[i] ?? 0;
    const maxSize = maxSizes?.[i] ?? availableForPanels;
    const size = sizes[i] ?? 0;
    sizes[i] = Math.max(minSize, Math.min(maxSize, size));
  }

  // Distribute remainder / shrink overshoot to fit available space
  const totalSize = sizes.reduce((a, b) => a + (b ?? 0), 0);
  const remainder = availableForPanels - totalSize;
  if (remainder > 0) {
    let r = remainder;
    while (r > 0) {
      let progressed = false;
      for (let i = 0; i < sizes.length && r > 0; i++) {
        const currentSize = sizes[i] ?? 0;
        const maxSize = maxSizes?.[i] ?? availableForPanels;
        if (currentSize < maxSize) {
          sizes[i] = currentSize + 1;
          r--;
          progressed = true;
        }
      }
      if (!progressed) break;
    }
  } else if (remainder < 0) {
    let overshoot = -remainder;

    // First pass: shrink but respect minSizes.
    for (let i = sizes.length - 1; i >= 0 && overshoot > 0; i--) {
      const currentSize = sizes[i] ?? 0;
      const minSize = minSizes?.[i] ?? 0;
      const canReduce = Math.max(0, currentSize - minSize);
      if (canReduce === 0) continue;
      const delta = Math.min(overshoot, canReduce);
      sizes[i] = currentSize - delta;
      overshoot -= delta;
    }

    // Second pass: if constraints are impossible (sum(minSizes) > available), shrink below mins down to 0.
    for (let i = sizes.length - 1; i >= 0 && overshoot > 0; i--) {
      const currentSize = sizes[i] ?? 0;
      const canReduce = Math.max(0, currentSize);
      if (canReduce === 0) continue;
      const delta = Math.min(overshoot, canReduce);
      sizes[i] = currentSize - delta;
      overshoot -= delta;
    }
  }
}

/**
 * Compute panel sizes from percentages and available space.
 *
 * @param percentages - Panel sizes as percentages (0-100)
 * @param available - Total available space in cells
 * @param dividerSize - Divider size in cells
 * @param minSizes - Minimum sizes per panel
 * @param maxSizes - Maximum sizes per panel
 * @returns Computed panel sizes and divider positions
 */
export function computePanelSizes(
  percentages: readonly number[],
  available: number,
  dividerSize: number = DEFAULT_DIVIDER_SIZE,
  minSizes?: readonly number[],
  maxSizes?: readonly number[],
): PanelSizes {
  const panelCount = percentages.length;
  if (panelCount === 0) {
    return Object.freeze({ sizes: Object.freeze([]), dividerPositions: Object.freeze([]) });
  }

  const totalDividerSpace = Math.max(0, panelCount - 1) * dividerSize;
  const availableForPanels = Math.max(0, available - totalDividerSpace);

  // First pass: compute ideal sizes with deterministic integer remainder handling.
  const weights = percentages.map((p) =>
    Number.isFinite(p) && (p as number) > 0 ? (p as number) : 0,
  );
  const sizes = distributeInteger(availableForPanels, weights);

  normalizePanelCellSizes(sizes, availableForPanels, minSizes, maxSizes);

  // Compute divider positions
  const dividerPositions: number[] = [];
  let position = 0;
  for (let j = 0; j < sizes.length - 1; j++) {
    position += sizes[j] ?? 0;
    dividerPositions.push(position);
    position += dividerSize;
  }

  return Object.freeze({
    sizes: Object.freeze(sizes),
    dividerPositions: Object.freeze(dividerPositions),
  });
}

/**
 * Compute panel sizes in cells for both percent and absolute sizing modes.
 *
 * @param panelCount - Number of panels
 * @param sizes - Size specs (percentages or absolute cells based on sizeMode)
 * @param available - Total available space in cells (including divider space)
 * @param sizeMode - Whether sizes are percentages or absolute cells
 * @param dividerSize - Divider size in cells
 * @param minSizes - Minimum sizes per panel (cells)
 * @param maxSizes - Maximum sizes per panel (cells)
 */
export function computePanelCellSizes(
  panelCount: number,
  sizes: readonly number[],
  available: number,
  sizeMode: "percent" | "absolute",
  dividerSize: number = DEFAULT_DIVIDER_SIZE,
  minSizes?: readonly number[],
  maxSizes?: readonly number[],
): PanelSizes {
  if (panelCount <= 0) {
    return Object.freeze({ sizes: Object.freeze([]), dividerPositions: Object.freeze([]) });
  }

  const totalDividerSpace = Math.max(0, panelCount - 1) * dividerSize;
  const availableForPanels = Math.max(0, available - totalDividerSpace);

  const cellSizes = new Array<number>(panelCount);
  const percentWeights = new Array<number>(panelCount).fill(0);
  for (let i = 0; i < panelCount; i++) {
    const rawSizeSpec = sizes[i];
    const sizeSpec = Number.isFinite(rawSizeSpec)
      ? (rawSizeSpec as number)
      : sizeMode === "percent"
        ? 100 / panelCount
        : Math.floor(availableForPanels / panelCount);

    if (sizeMode === "percent") {
      percentWeights[i] = sizeSpec > 0 ? sizeSpec : 0;
    } else {
      cellSizes[i] = Math.max(0, Math.trunc(sizeSpec));
    }
  }

  if (sizeMode === "percent") {
    const distributed = distributeInteger(availableForPanels, percentWeights);
    for (let i = 0; i < panelCount; i++) {
      cellSizes[i] = distributed[i] ?? 0;
    }
  }

  normalizePanelCellSizes(cellSizes, availableForPanels, minSizes, maxSizes);

  const dividerPositions: number[] = [];
  let position = 0;
  for (let j = 0; j < cellSizes.length - 1; j++) {
    position += cellSizes[j] ?? 0;
    dividerPositions.push(position);
    position += dividerSize;
  }

  return Object.freeze({
    sizes: Object.freeze(cellSizes),
    dividerPositions: Object.freeze(dividerPositions),
  });
}

/**
 * Handle divider drag to resize panels.
 *
 * @param startSizes - Sizes at drag start
 * @param dividerIndex - Index of divider being dragged
 * @param delta - Drag delta in cells
 * @param minSizes - Minimum sizes per panel
 * @param maxSizes - Maximum sizes per panel
 * @returns Updated sizes
 */
export function handleDividerDrag(
  startSizes: readonly number[],
  dividerIndex: number,
  delta: number,
  minSizes?: readonly number[],
  maxSizes?: readonly number[],
): readonly number[] {
  if (dividerIndex < 0 || dividerIndex >= startSizes.length - 1) {
    return startSizes;
  }

  const newSizes = [...startSizes];
  const leftIndex = dividerIndex;
  const rightIndex = dividerIndex + 1;

  const leftSize = startSizes[leftIndex] ?? 0;
  const rightSize = startSizes[rightIndex] ?? 0;

  const leftMin = minSizes?.[leftIndex] ?? 0;
  const rightMin = minSizes?.[rightIndex] ?? 0;
  const leftMax = maxSizes?.[leftIndex] ?? leftSize + rightSize;
  const rightMax = maxSizes?.[rightIndex] ?? leftSize + rightSize;

  // Clamp delta to respect min/max
  let clampedDelta = delta;
  clampedDelta = Math.max(clampedDelta, leftMin - leftSize);
  clampedDelta = Math.min(clampedDelta, leftMax - leftSize);
  clampedDelta = Math.max(clampedDelta, -(rightMax - rightSize));
  clampedDelta = Math.min(clampedDelta, rightSize - rightMin);

  newSizes[leftIndex] = leftSize + clampedDelta;
  newSizes[rightIndex] = rightSize - clampedDelta;

  return Object.freeze(newSizes);
}

/**
 * Convert absolute sizes to percentages.
 *
 * @param sizes - Absolute sizes in cells
 * @returns Percentages (0-100)
 */
export function sizesToPercentages(sizes: readonly number[]): readonly number[] {
  const total = sizes.reduce((a, b) => a + (b ?? 0), 0);
  if (total === 0) {
    return Object.freeze(sizes.map(() => 100 / sizes.length));
  }
  return Object.freeze(sizes.map((s) => ((s ?? 0) / total) * 100));
}

/**
 * Collapse a panel to minimum size.
 *
 * @param sizes - Current sizes
 * @param index - Panel index to collapse
 * @param minSizes - Minimum sizes per panel
 * @returns Updated sizes with collapsed panel
 */
export function collapsePanel(
  sizes: readonly number[],
  index: number,
  minSizes?: readonly number[],
): readonly number[] {
  if (index < 0 || index >= sizes.length) {
    return sizes;
  }

  const newSizes = [...sizes];
  const currentSize = sizes[index] ?? 0;
  const minSize = minSizes?.[index] ?? 0;
  const delta = currentSize - minSize;

  if (delta <= 0) {
    return sizes;
  }

  newSizes[index] = minSize;

  // Distribute delta to adjacent panels
  if (index > 0) {
    newSizes[index - 1] = (newSizes[index - 1] ?? 0) + delta;
  } else if (index < sizes.length - 1) {
    newSizes[index + 1] = (newSizes[index + 1] ?? 0) + delta;
  }

  return Object.freeze(newSizes);
}

/**
 * Expand a collapsed panel.
 *
 * @param sizes - Current sizes
 * @param index - Panel index to expand
 * @param targetSize - Target size to expand to
 * @returns Updated sizes with expanded panel
 */
export function expandPanel(
  sizes: readonly number[],
  index: number,
  targetSize: number,
): readonly number[] {
  if (index < 0 || index >= sizes.length) {
    return sizes;
  }

  const newSizes = [...sizes];
  const currentSize = sizes[index] ?? 0;
  const delta = targetSize - currentSize;

  if (delta <= 0) {
    return sizes;
  }

  let taken = 0;

  // Take space from adjacent panels
  if (index > 0) {
    const neighborSize = newSizes[index - 1] ?? 0;
    const take = Math.min(delta - taken, neighborSize);
    newSizes[index - 1] = neighborSize - take;
    taken += take;
  } else if (index < sizes.length - 1) {
    const neighborSize = newSizes[index + 1] ?? 0;
    const take = Math.min(delta - taken, neighborSize);
    newSizes[index + 1] = neighborSize - take;
    taken += take;
  }

  if (taken <= 0) {
    return sizes;
  }

  newSizes[index] = currentSize + taken;
  return Object.freeze(newSizes);
}

/**
 * Hit test to determine if a point is on a divider.
 *
 * @param point - Point position (x for horizontal, y for vertical)
 * @param dividerPositions - Divider positions
 * @param dividerSize - Divider size in cells
 * @returns Divider index if hit, null otherwise
 */
export function hitTestDivider(
  point: number,
  dividerPositions: readonly number[],
  dividerSize: number = DEFAULT_DIVIDER_SIZE,
): number | null {
  const hitArea = dividerSize + DIVIDER_HIT_EXPAND * 2;

  for (let i = 0; i < dividerPositions.length; i++) {
    const pos = dividerPositions[i] ?? 0;
    const start = pos - DIVIDER_HIT_EXPAND;
    const end = start + hitArea;
    if (point >= start && point < end) {
      return i;
    }
  }

  return null;
}

/** Divider color constant. */
export const DIVIDER_COLOR = { r: 80, g: 80, b: 80 } as const;
