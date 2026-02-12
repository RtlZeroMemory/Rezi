/**
 * packages/core/src/widgets/commandPalette.ts — CommandPalette core algorithms.
 *
 * Why: Implements filtering, fuzzy matching, and keyboard navigation for the
 * command palette widget. The palette provides quick-access command execution,
 * model switching, file opening, and symbol navigation.
 *
 * @see docs/widgets/command-palette.md
 */

import type { CommandItem, CommandSource } from "./types.js";

/** Default maximum visible items in the palette. */
export const DEFAULT_MAX_VISIBLE = 10;

/** Default palette width in cells. */
export const PALETTE_WIDTH = 60;

/** Visible window for rendering a slice of the results list. */
export type CommandPaletteWindow = Readonly<{ start: number; count: number }>;

/**
 * Compute the visible window for the results list so the selected item stays visible.
 *
 * @param selectedIndex - Current selection index
 * @param itemCount - Total number of items
 * @param visibleCount - Number of rows available for items
 */
export function computeCommandPaletteWindow(
  selectedIndex: number,
  itemCount: number,
  visibleCount: number,
): CommandPaletteWindow {
  const count = Math.max(0, Math.min(itemCount, visibleCount));
  if (count === 0) return Object.freeze({ start: 0, count: 0 });
  if (itemCount <= count) return Object.freeze({ start: 0, count });

  const sel = Math.max(0, Math.min(itemCount - 1, selectedIndex));
  const maxStart = itemCount - count;
  let start = sel - Math.floor(count / 2);
  if (start < 0) start = 0;
  if (start > maxStart) start = maxStart;

  return Object.freeze({ start, count });
}

/**
 * Filter items from a source based on query string.
 * Uses case-insensitive substring matching.
 *
 * @param items - Items to filter
 * @param query - Search query
 * @returns Filtered items
 */
export function filterItems(items: readonly CommandItem[], query: string): readonly CommandItem[] {
  if (!query) return items;

  const lowerQuery = query.toLowerCase();
  return Object.freeze(
    items.filter((item) => {
      // Match against label
      if (item.label.toLowerCase().includes(lowerQuery)) return true;
      // Match against description
      if (item.description?.toLowerCase().includes(lowerQuery)) return true;
      // Match against shortcut
      if (item.shortcut?.toLowerCase().includes(lowerQuery)) return true;
      return false;
    }),
  );
}

/**
 * Compute fuzzy match score for an item against a query.
 * Higher score = better match.
 *
 * @param item - Item to score
 * @param query - Search query
 * @returns Match score (0 = no match)
 */
export function fuzzyScore(item: CommandItem, query: string): number {
  if (!query) return 1; // All items match empty query equally

  const lowerQuery = query.toLowerCase();
  const lowerLabel = item.label.toLowerCase();

  // Exact prefix match: highest score
  if (lowerLabel.startsWith(lowerQuery)) {
    return 100 + 1 / item.label.length;
  }

  // Word boundary match: high score
  const words = lowerLabel.split(/\s+/);
  for (const word of words) {
    if (word.startsWith(lowerQuery)) {
      return 80 + 1 / item.label.length;
    }
  }

  // Substring match: medium score
  if (lowerLabel.includes(lowerQuery)) {
    return 50 + 1 / item.label.length;
  }

  // Fuzzy character sequence match
  let queryIdx = 0;
  let consecutiveBonus = 0;
  let lastMatchIdx = -2;

  for (let i = 0; i < lowerLabel.length && queryIdx < lowerQuery.length; i++) {
    if (lowerLabel[i] === lowerQuery[queryIdx]) {
      if (i === lastMatchIdx + 1) {
        consecutiveBonus += 5;
      }
      lastMatchIdx = i;
      queryIdx++;
    }
  }

  if (queryIdx === lowerQuery.length) {
    return 20 + consecutiveBonus + 1 / item.label.length;
  }

  return 0; // No match
}

/**
 * Sort items by fuzzy match score (descending).
 *
 * @param items - Items to sort
 * @param query - Search query
 * @returns Sorted items
 */
export function sortByScore(items: readonly CommandItem[], query: string): readonly CommandItem[] {
  if (!query) return items;

  const scored = items.map((item, index) => ({ item, score: fuzzyScore(item, query), index }));
  scored.sort((a, b) => {
    const byScore = b.score - a.score;
    if (byScore !== 0) return byScore;
    return a.index - b.index;
  });
  return Object.freeze(scored.filter((s) => s.score > 0).map((s) => s.item));
}

/**
 * Get items from sources, filtered and sorted by query.
 * Handles source prefix triggers (e.g., ">" for commands).
 *
 * @param sources - Command sources
 * @param query - Search query
 * @returns Promise of filtered items
 */
export async function getFilteredItems(
  sources: readonly CommandSource[],
  query: string,
): Promise<readonly CommandItem[]> {
  // Check for prefix trigger
  let activeSourceId: string | null = null;
  let effectiveQuery = query;

  for (const source of sources) {
    if (source.prefix && query.startsWith(source.prefix)) {
      activeSourceId = source.id;
      effectiveQuery = query.slice(source.prefix.length).trim();
      break;
    }
  }

  // Get items from relevant sources
  const itemPromises: Promise<readonly CommandItem[]>[] = [];

  for (const source of sources) {
    if (activeSourceId !== null && source.id !== activeSourceId) {
      continue;
    }

    const result = source.getItems(effectiveQuery);
    if (result instanceof Promise) {
      itemPromises.push(result);
    } else {
      itemPromises.push(Promise.resolve(result));
    }
  }

  const results = await Promise.all(itemPromises);
  const allItems = results.flat();

  // Sort and remove non-matches via fuzzy score to allow non-substring fuzzy hits.
  const sorted = sortByScore(allItems, effectiveQuery);

  return sorted;
}

/**
 * Compute next selected index for keyboard navigation.
 *
 * @param currentIndex - Current selection index
 * @param direction - Navigation direction
 * @param itemCount - Total number of items
 * @param wrapAround - Whether to wrap at boundaries
 * @returns New selection index
 */
export function computeNextIndex(
  currentIndex: number,
  direction: "up" | "down",
  itemCount: number,
  wrapAround = true,
): number {
  if (itemCount === 0) return 0;

  let nextIndex: number;
  if (direction === "up") {
    nextIndex = currentIndex - 1;
    if (nextIndex < 0) {
      nextIndex = wrapAround ? itemCount - 1 : 0;
    }
  } else {
    nextIndex = currentIndex + 1;
    if (nextIndex >= itemCount) {
      nextIndex = wrapAround ? 0 : itemCount - 1;
    }
  }

  return nextIndex;
}

/**
 * Clamp selection index to valid range.
 *
 * @param index - Current index
 * @param itemCount - Total number of items
 * @returns Clamped index
 */
export function clampIndex(index: number, itemCount: number): number {
  if (itemCount === 0) return 0;
  return Math.max(0, Math.min(index, itemCount - 1));
}

/**
 * Compute highlight ranges for displaying matched text.
 *
 * @param text - Text to highlight
 * @param query - Search query
 * @returns Array of [start, end] ranges to highlight
 */
export function computeHighlights(
  text: string,
  query: string,
): readonly (readonly [number, number])[] {
  if (!query) return Object.freeze([]);

  const highlights: [number, number][] = [];
  const lowerText = text.toLowerCase();
  const lowerQuery = query.toLowerCase();

  let searchStart = 0;
  let matchIdx = lowerText.indexOf(lowerQuery, searchStart);

  while (matchIdx !== -1) {
    highlights.push([matchIdx, matchIdx + query.length]);
    searchStart = matchIdx + 1;
    matchIdx = lowerText.indexOf(lowerQuery, searchStart);
  }

  return Object.freeze(highlights);
}

/** Palette color constants. */
export const PALETTE_COLORS = {
  background: { r: 30, g: 30, b: 30 },
  border: { r: 60, g: 60, b: 60 },
  selectedBg: { r: 0, g: 120, b: 215 },
  highlight: { r: 255, g: 210, b: 0 },
  placeholder: { r: 128, g: 128, b: 128 },
} as const;
