/**
 * packages/core/src/widgets/logsConsole.ts — LogsConsole core algorithms.
 *
 * Why: Implements log filtering, auto-scroll, and search functionality
 * for the logs console widget.
 *
 * @see docs/widgets/logs-console.md
 */

import { defaultTheme } from "../theme/defaultTheme.js";
import type { Rgb24 } from "./style.js";
import type { LogEntry, LogLevel } from "./types.js";

/** Default max log entries to keep. */
export const MAX_LOG_ENTRIES = 10000;

/**
 * Filter log entries by level.
 *
 * @param entries - All log entries
 * @param levels - Levels to include
 * @returns Filtered entries
 */
export function filterByLevel(
  entries: readonly LogEntry[],
  levels: readonly LogLevel[],
): readonly LogEntry[] {
  if (levels.length === 0) return entries;
  const levelSet = new Set(levels);
  return Object.freeze(entries.filter((e) => levelSet.has(e.level)));
}

/**
 * Filter log entries by source.
 *
 * @param entries - All log entries
 * @param sources - Sources to include
 * @returns Filtered entries
 */
export function filterBySource(
  entries: readonly LogEntry[],
  sources: readonly string[],
): readonly LogEntry[] {
  if (sources.length === 0) return entries;
  const sourceSet = new Set(sources);
  return Object.freeze(entries.filter((e) => sourceSet.has(e.source)));
}

/**
 * Search log entries by query.
 *
 * @param entries - All log entries
 * @param query - Search query
 * @returns Filtered entries matching query
 */
export function searchEntries(entries: readonly LogEntry[], query: string): readonly LogEntry[] {
  if (!query) return entries;
  const lowerQuery = query.toLowerCase();
  return Object.freeze(
    entries.filter(
      (e) =>
        e.message.toLowerCase().includes(lowerQuery) ||
        e.source.toLowerCase().includes(lowerQuery) ||
        e.details?.toLowerCase().includes(lowerQuery),
    ),
  );
}

/**
 * Apply all filters to log entries.
 *
 * @param entries - All log entries
 * @param levelFilter - Levels to include
 * @param sourceFilter - Sources to include
 * @param searchQuery - Search query
 * @returns Filtered entries
 */
export function applyFilters(
  entries: readonly LogEntry[],
  levelFilter?: readonly LogLevel[],
  sourceFilter?: readonly string[],
  searchQuery?: string,
): readonly LogEntry[] {
  let filtered = entries;
  if (levelFilter && levelFilter.length > 0) {
    filtered = filterByLevel(filtered, levelFilter);
  }
  if (sourceFilter && sourceFilter.length > 0) {
    filtered = filterBySource(filtered, sourceFilter);
  }
  if (searchQuery) {
    filtered = searchEntries(filtered, searchQuery);
  }
  return filtered;
}

/**
 * Compute scroll position for auto-scroll behavior.
 *
 * @param currentScrollTop - Current scroll position
 * @param entryCount - Total number of entries
 * @param viewportHeight - Visible viewport height
 * @param autoScroll - Whether auto-scroll is enabled
 * @returns New scroll position
 */
export function computeAutoScrollPosition(
  currentScrollTop: number,
  entryCount: number,
  viewportHeight: number,
  autoScroll: boolean,
): number {
  if (!autoScroll) return currentScrollTop;

  const maxScroll = Math.max(0, entryCount - viewportHeight);
  return maxScroll;
}

/**
 * Add a log entry, maintaining max entries limit.
 *
 * @param entries - Existing entries
 * @param entry - Entry to add
 * @param maxEntries - Maximum entries to keep
 * @returns Updated entries
 */
export function addEntry(
  entries: readonly LogEntry[],
  entry: LogEntry,
  maxEntries: number = MAX_LOG_ENTRIES,
): readonly LogEntry[] {
  const newEntries = [...entries, entry];
  if (newEntries.length > maxEntries) {
    return Object.freeze(newEntries.slice(newEntries.length - maxEntries));
  }
  return Object.freeze(newEntries);
}

/**
 * Format timestamp for display.
 *
 * @param timestamp - Unix timestamp in ms
 * @returns Formatted time string (HH:MM:SS)
 */
export function formatTimestamp(timestamp: number): string {
  if (!Number.isFinite(timestamp)) return "00:00:00";

  const totalSeconds = Math.floor(timestamp / 1000);
  // Deterministic HH:MM:SS (UTC-ish) without Date/timezone dependence.
  const secondsInDay = 24 * 60 * 60;
  const daySeconds = ((totalSeconds % secondsInDay) + secondsInDay) % secondsInDay;

  const h = Math.floor(daySeconds / 3600);
  const m = Math.floor((daySeconds % 3600) / 60);
  const s = daySeconds % 60;

  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
}

/**
 * Format duration for display.
 *
 * @param durationMs - Duration in milliseconds
 * @returns Formatted duration string
 */
export function formatDuration(durationMs: number): string {
  if (durationMs < 1000) {
    return `${durationMs}ms`;
  }
  if (durationMs < 60000) {
    return `${(durationMs / 1000).toFixed(1)}s`;
  }
  const minutes = Math.floor(durationMs / 60000);
  const seconds = Math.floor((durationMs % 60000) / 1000);
  return `${minutes}m${seconds}s`;
}

/**
 * Format token count for display.
 *
 * @param count - Token count
 * @returns Formatted string (e.g., "1,234")
 */
export function formatTokenCount(count: number): string {
  if (!Number.isFinite(count)) return "0";
  const n = Math.trunc(count);
  const sign = n < 0 ? "-" : "";
  const abs = Math.abs(n);
  const raw = String(abs);
  let out = "";
  for (let i = 0; i < raw.length; i++) {
    const idx = raw.length - 1 - i;
    const ch = raw[idx];
    if (!ch) continue;
    if (i > 0 && i % 3 === 0) out = `,${out}`;
    out = `${ch}${out}`;
  }
  return `${sign}${out}`;
}

/**
 * Format cost for display.
 *
 * @param costCents - Cost in cents
 * @returns Formatted string (e.g., "$0.02")
 */
export function formatCost(costCents: number): string {
  return `$${(costCents / 100).toFixed(2)}`;
}

/** Level color map (packed RGB24). */
const WIDGET_PALETTE = defaultTheme.colors;

export const LEVEL_COLORS: Record<LogLevel, Rgb24> = {
  trace: WIDGET_PALETTE["widget.logs.level.trace"] ?? WIDGET_PALETTE.muted,
  debug: WIDGET_PALETTE["widget.logs.level.debug"] ?? WIDGET_PALETTE.secondary,
  info: WIDGET_PALETTE["widget.logs.level.info"] ?? WIDGET_PALETTE.fg,
  warn: WIDGET_PALETTE["widget.logs.level.warn"] ?? WIDGET_PALETTE.warning,
  error: WIDGET_PALETTE["widget.logs.level.error"] ?? WIDGET_PALETTE.danger,
};

/** Level priority for filtering. */
export const LEVEL_PRIORITY: Record<LogLevel, number> = {
  trace: 0,
  debug: 1,
  info: 2,
  warn: 3,
  error: 4,
};
