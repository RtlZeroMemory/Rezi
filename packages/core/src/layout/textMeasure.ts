/**
 * packages/core/src/layout/textMeasure.ts — Deterministic text measurement.
 *
 * Why: Computes the display width of text strings in terminal cell units.
 * Uses pinned Unicode data tables to ensure measurements are deterministic
 * across all environments and match the C engine's width calculations.
 *
 * Unicode pins:
 *   - Unicode version: 15.1.0
 *   - Grapheme segmentation: UAX #29 (core rules)
 *   - East Asian Width: based on EAW property
 *   - Emoji width: wide (2 cells) for Extended_Pictographic sequences
 *
 * Width rules:
 *   - ASCII printable: 1 cell
 *   - ASCII control: 0 cells
 *   - CJK and wide characters: 2 cells
 *   - Combining marks: 0 cells (merge with base)
 *   - Emoji sequences: 2 cells total
 *   - Invalid UTF-16 surrogates: replaced with U+FFFD (1 cell)
 *
 * @see docs/guide/layout.md
 */

import { GCB, gcbClass, isEawWide, isEmoji, isExtendedPictographic } from "./unicode/props.js";

/** Version pin for text measurement algorithm. Increment on any change. */
export const ZRUI_TEXT_MEASURE_VERSION = 1 as const;

/**
 * Emoji width policy used by text measurement.
 *
 * - "wide": emoji grapheme clusters occupy at least 2 cells.
 * - "narrow": emoji grapheme clusters occupy at least 1 cell.
 */
export type TextMeasureEmojiPolicy = "wide" | "narrow";

let textMeasureEmojiPolicy: TextMeasureEmojiPolicy = "wide";

/**
 * Set emoji width policy used by measureTextCells().
 *
 * Clearing the cache is required because previous widths may have been computed
 * under a different policy.
 */
export function setTextMeasureEmojiPolicy(policy: TextMeasureEmojiPolicy): void {
  if (policy === textMeasureEmojiPolicy) return;
  textMeasureEmojiPolicy = policy;
  clearTextMeasureCache();
}

/** Get current emoji width policy used by measureTextCells(). */
export function getTextMeasureEmojiPolicy(): TextMeasureEmojiPolicy {
  return textMeasureEmojiPolicy;
}

/* ========== Text Measurement Cache ========== */

/** Maximum number of cached text measurements before eviction. */
const TEXT_CACHE_MAX_SIZE = 10000;
/**
 * Maximum string length (UTF-16 code units) eligible for caching.
 *
 * Why: Large, frequently-changing lines (e.g. heatmaps, logs) can rapidly fill
 * the cache with low hit rate, causing eviction churn and memory growth.
 */
const TEXT_CACHE_MAX_KEY_LENGTH = 96;

/** Cache for text width measurements. */
const textWidthCache = new Map<string, number>();

function evictOldestTextWidthCacheEntry(): void {
  const oldest = textWidthCache.keys().next();
  if (oldest.done === true) return;
  textWidthCache.delete(oldest.value);
}

/**
 * Clear the text measurement cache.
 * Useful for testing or when memory pressure is detected.
 */
export function clearTextMeasureCache(): void {
  textWidthCache.clear();
}

/**
 * Get current cache size (for debugging/monitoring).
 */
export function getTextMeasureCacheSize(): number {
  return textWidthCache.size;
}

/** Result of decoding one Unicode scalar from UTF-16. */
type DecodeOne = Readonly<{ scalar: number; size: 1 | 2 }>;

/**
 * Decode one Unicode scalar value from UTF-16 string at offset.
 * Handles surrogate pairs; unpaired surrogates become U+FFFD.
 */
function decodeUtf16One(text: string, off: number): DecodeOne {
  const a = text.charCodeAt(off);
  if (!Number.isFinite(a)) {
    // Unreachable under a well-typed caller, but keep total behavior deterministic.
    return { scalar: 0xfffd, size: 1 };
  }

  // High surrogate
  if (a >= 0xd800 && a <= 0xdbff) {
    const b = text.charCodeAt(off + 1);
    // Valid surrogate pair
    if (b >= 0xdc00 && b <= 0xdfff) {
      const hi = a - 0xd800;
      const lo = b - 0xdc00;
      return { scalar: 0x10000 + (hi << 10) + lo, size: 2 };
    }
    // Unpaired high surrogate -> U+FFFD
    return { scalar: 0xfffd, size: 1 };
  }

  // Unpaired low surrogate -> U+FFFD
  if (a >= 0xdc00 && a <= 0xdfff) {
    return { scalar: 0xfffd, size: 1 };
  }

  return { scalar: a, size: 1 };
}

function isAsciiControl(scalar: number): boolean {
  return scalar < 0x20 || scalar === 0x7f;
}

/**
 * Compute display width of a single codepoint.
 * Returns 0 for controls/combining, 1 for normal, 2 for wide.
 */
function widthCodepoint(scalar: number): 0 | 1 | 2 {
  if (isAsciiControl(scalar)) return 0;

  const gcb = gcbClass(scalar);
  if (gcb === GCB.CONTROL || gcb === GCB.CR || gcb === GCB.LF) return 0;
  if (gcb === GCB.EXTEND || gcb === GCB.ZWJ) return 0;

  if (isEawWide(scalar)) return 2;
  return 1;
}

/**
 * Determine if grapheme cluster boundary exists between prev and next codepoints.
 * Implements UAX #29 grapheme cluster break rules (GB3-GB13).
 */
function shouldBreak(
  prevClass: number,
  prevZwjAfterEp: boolean,
  riRun: number,
  nextClass: number,
  nextIsEp: boolean,
): boolean {
  // GB3: CR x LF
  if (prevClass === GCB.CR && nextClass === GCB.LF) return false;

  // GB4/5: break around controls
  if (prevClass === GCB.CONTROL || prevClass === GCB.CR || prevClass === GCB.LF) return true;
  if (nextClass === GCB.CONTROL || nextClass === GCB.CR || nextClass === GCB.LF) return true;

  // GB6: L x (L|V|LV|LVT)
  if (
    prevClass === GCB.L &&
    (nextClass === GCB.L || nextClass === GCB.V || nextClass === GCB.LV || nextClass === GCB.LVT)
  ) {
    return false;
  }

  // GB7: (LV|V) x (V|T)
  if (
    (prevClass === GCB.LV || prevClass === GCB.V) &&
    (nextClass === GCB.V || nextClass === GCB.T)
  ) {
    return false;
  }

  // GB8: (LVT|T) x T
  if ((prevClass === GCB.LVT || prevClass === GCB.T) && nextClass === GCB.T) {
    return false;
  }

  // GB9: x Extend
  if (nextClass === GCB.EXTEND) return false;

  // GB9a: x SpacingMark
  if (nextClass === GCB.SPACINGMARK) return false;

  // GB9b: Prepend x
  if (prevClass === GCB.PREPEND) return false;

  // GB9c: x ZWJ
  if (nextClass === GCB.ZWJ) return false;

  // GB11: ... ZWJ x EP when ZWJ is preceded by EP (ignoring Extend).
  if (prevClass === GCB.ZWJ && nextIsEp && prevZwjAfterEp) return false;

  // GB12/13: Pair regional indicators.
  if (prevClass === GCB.REGIONAL_INDICATOR && nextClass === GCB.REGIONAL_INDICATOR) {
    return riRun % 2 === 0;
  }

  return true;
}

/**
 * Pinned, deterministic text measurement in terminal cell units.
 *
 * - Unicode pins: 15.1.0
 * - Grapheme segmentation: UAX #29 core set
 * - Emoji width policy: wide (2 cells)
 * - Invalid UTF-16 surrogate sequences: replaced with U+FFFD
 * - Tabs are not treated specially (no expansion)
 *
 * This function is cached for performance. Repeated measurements of the
 * same text string return immediately from cache (O(1) vs O(n)).
 */
export function measureTextCells(text: string): number {
  if (text.length === 0) return 0;

  const cacheable = text.length <= TEXT_CACHE_MAX_KEY_LENGTH;
  if (cacheable) {
    const cached = textWidthCache.get(text);
    if (cached !== undefined) return cached;
  }

  const asciiWidth = measureTextCellsAsciiOnly(text);
  const width = asciiWidth ?? measureTextCellsUncached(text);

  if (cacheable) {
    if (!textWidthCache.has(text) && textWidthCache.size >= TEXT_CACHE_MAX_SIZE) {
      evictOldestTextWidthCacheEntry();
    }
    textWidthCache.set(text, width);
  }

  return width;
}

/**
 * Uncached text measurement implementation.
 * @internal
 */
function measureTextCellsAsciiOnly(text: string): number | null {
  let total = 0;
  for (let i = 0; i < text.length; i++) {
    const code = text.charCodeAt(i);
    if (code >= 0x80) return null;
    if (code < 0x20 || code === 0x7f) continue;
    total++;
  }
  return total;
}

type GraphemeVisitor = (start: number, end: number, width: 0 | 1 | 2) => void;

function scanGraphemeClusters(text: string, onCluster?: GraphemeVisitor): number {
  let total = 0;
  let off = 0;

  while (off < text.length) {
    const start = off;

    const prevDec = decodeUtf16One(text, off);
    off += prevDec.size;

    let prevClass = gcbClass(prevDec.scalar);
    const prevIsEp = isExtendedPictographic(prevDec.scalar);

    let riRun = prevClass === GCB.REGIONAL_INDICATOR ? 1 : 0;

    // GB11 state tracking: ExtPict Extend* ZWJ x ExtPict
    let lastNonExtendIsEp = prevClass !== GCB.EXTEND ? prevIsEp : false;
    let prevZwjAfterEp = prevClass === GCB.ZWJ ? lastNonExtendIsEp : false;

    // Grapheme width tracking (engine policy: max codepoint width, then apply emoji override)
    let width = 0 as 0 | 1 | 2;
    let hasEmoji = false;

    const firstIsEmoji = isEmoji(prevDec.scalar);
    if (firstIsEmoji) hasEmoji = true;
    const firstW = firstIsEmoji ? 1 : widthCodepoint(prevDec.scalar);
    if (firstW > width) width = firstW;

    while (off < text.length) {
      const nextOff = off;
      const nextDec = decodeUtf16One(text, nextOff);
      const nextClass = gcbClass(nextDec.scalar);
      const nextIsEp = isExtendedPictographic(nextDec.scalar);

      if (shouldBreak(prevClass, prevZwjAfterEp, riRun, nextClass, nextIsEp)) {
        break;
      }

      off += nextDec.size;

      if (nextClass === GCB.REGIONAL_INDICATOR) riRun++;
      else riRun = 0;

      prevZwjAfterEp = false;
      if (nextClass === GCB.ZWJ) prevZwjAfterEp = lastNonExtendIsEp;
      if (nextClass !== GCB.EXTEND) lastNonExtendIsEp = nextIsEp;

      prevClass = nextClass;

      const nextIsEmoji = isEmoji(nextDec.scalar);
      if (nextIsEmoji) hasEmoji = true;
      const nextW = nextIsEmoji ? 1 : widthCodepoint(nextDec.scalar);
      if (nextW > width) width = nextW;
    }

    const emojiMinWidth: 1 | 2 = textMeasureEmojiPolicy === "wide" ? 2 : 1;
    if (hasEmoji && width < emojiMinWidth) width = emojiMinWidth;
    total += width;
    onCluster?.(start, off, width);

    // Defensive progress guard: if decode returned 0-sized, force progress deterministically.
    if (off === start) off++;
  }

  return total;
}

function measureTextCellsUncached(text: string): number {
  return scanGraphemeClusters(text);
}

type GraphemeSlices = Readonly<{
  starts: readonly number[];
  ends: readonly number[];
  prefixWidths: readonly number[];
}>;

function collectGraphemeSlices(text: string): GraphemeSlices {
  const starts: number[] = [];
  const ends: number[] = [];
  const prefixWidths: number[] = [0];

  scanGraphemeClusters(text, (start, end, width) => {
    starts.push(start);
    ends.push(end);
    const prev = prefixWidths[prefixWidths.length - 1] ?? 0;
    prefixWidths.push(prev + width);
  });

  return { starts, ends, prefixWidths };
}

function maxPrefixClustersWithinWidth(prefixWidths: readonly number[], maxWidth: number): number {
  let low = 0;
  let high = prefixWidths.length - 1;
  let best = 0;

  while (low <= high) {
    const mid = Math.floor((low + high) / 2);
    const width = prefixWidths[mid] ?? Number.POSITIVE_INFINITY;
    if (width <= maxWidth) {
      best = mid;
      low = mid + 1;
    } else {
      high = mid - 1;
    }
  }

  return best;
}

function maxSuffixClustersWithinWidth(prefixWidths: readonly number[], maxWidth: number): number {
  const clusterCount = prefixWidths.length - 1;
  const totalWidth = prefixWidths[clusterCount] ?? 0;

  let low = 0;
  let high = clusterCount;
  let best = 0;

  while (low <= high) {
    const mid = Math.floor((low + high) / 2);
    const left = prefixWidths[clusterCount - mid] ?? 0;
    const width = totalWidth - left;
    if (width <= maxWidth) {
      best = mid;
      low = mid + 1;
    } else {
      high = mid - 1;
    }
  }

  return best;
}

/**
 * Truncate text to fit within maxWidth cells, appending ellipsis if needed.
 * Returns original text if it fits.
 *
 * @param text - The text to truncate
 * @param maxWidth - Maximum width in terminal cells
 * @returns Truncated text with ellipsis, or original if it fits
 */
export function truncateWithEllipsis(text: string, maxWidth: number): string {
  const fullWidth = measureTextCells(text);
  if (fullWidth <= maxWidth) return text;
  if (maxWidth <= 0) return "";
  if (maxWidth === 1) return "…";

  // Account for ellipsis width (1 cell)
  const targetWidth = maxWidth - 1;
  if (targetWidth <= 0) return "…";

  const { ends, prefixWidths } = collectGraphemeSlices(text);
  const bestClusters = maxPrefixClustersWithinWidth(prefixWidths, targetWidth);
  if (bestClusters === 0) return "…";
  const bestEnd = ends[bestClusters - 1] ?? 0;
  return `${text.slice(0, bestEnd)}…`;
}

/**
 * Truncate text in the middle, preserving start and end.
 * Useful for file paths: /home/user/.../config.json
 *
 * @param text - The text to truncate
 * @param maxWidth - Maximum width in terminal cells
 * @returns Truncated text with ellipsis in middle, or original if it fits
 *
 * @example
 * ```typescript
 * truncateMiddle("/home/user/documents/project/src/index.ts", 25)
 * // "/home/user/…/src/index.ts"
 * ```
 */
export function truncateMiddle(text: string, maxWidth: number): string {
  const fullWidth = measureTextCells(text);
  if (fullWidth <= maxWidth) return text;
  if (maxWidth <= 0) return "";
  if (maxWidth <= 3) return truncateWithEllipsis(text, maxWidth);

  // Reserve 1 cell for ellipsis
  const available = maxWidth - 1;
  const startLen = Math.ceil(available / 2);
  const endLen = Math.floor(available / 2);

  const { starts, ends, prefixWidths } = collectGraphemeSlices(text);
  const clusterCount = starts.length;
  const startClusters = maxPrefixClustersWithinWidth(prefixWidths, startLen);
  const endClusters = maxSuffixClustersWithinWidth(prefixWidths, endLen);
  const endStartCluster = clusterCount - endClusters;

  // Ensure we don't overlap
  if (startClusters >= endStartCluster) {
    return truncateWithEllipsis(text, maxWidth);
  }

  const startEnd = startClusters === 0 ? 0 : (ends[startClusters - 1] ?? 0);
  const endStart = endClusters === 0 ? text.length : (starts[endStartCluster] ?? text.length);
  return `${text.slice(0, startEnd)}…${text.slice(endStart)}`;
}
