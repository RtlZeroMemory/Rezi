/**
 * packages/core/src/widgets/diffViewer.ts — DiffViewer core algorithms.
 *
 * Why: Implements diff parsing, hunk navigation, and intra-line highlighting
 * for the diff viewer widget. Supports both unified and side-by-side modes.
 *
 * @see docs/widgets/diff-viewer.md
 */

import { defaultTheme } from "../theme/defaultTheme.js";
import type { DiffData, DiffHunk, DiffLine } from "./types.js";

/** Default number of context lines around changes. */
export const DEFAULT_CONTEXT_LINES = 3;

/**
 * Parse a unified diff string into structured DiffData.
 *
 * @param diffText - Raw unified diff text
 * @returns Parsed diff data
 */
export function parseUnifiedDiff(diffText: string): DiffData {
  const lines = diffText.split(/\r?\n/);
  let oldPath = "";
  let newPath = "";
  const hunks: DiffHunk[] = [];
  let currentHunk: DiffHunk | null = null;
  let currentLines: DiffLine[] = [];
  let status: DiffData["status"] = "modified";

  for (const line of lines) {
    // Parse file headers
    if (line.startsWith("--- ")) {
      oldPath = line.slice(4).replace(/^a\//, "");
      continue;
    }
    if (line.startsWith("+++ ")) {
      newPath = line.slice(4).replace(/^b\//, "");
      continue;
    }

    // Parse hunk header
    const hunkMatch = line.match(/^@@ -(\d+)(?:,(\d+))? \+(\d+)(?:,(\d+))? @@(.*)$/);
    if (hunkMatch) {
      // Save previous hunk
      if (currentHunk) {
        hunks.push({ ...currentHunk, lines: Object.freeze(currentLines) });
      }

      const headerText = hunkMatch[5]?.trim();
      currentHunk = {
        oldStart: Number.parseInt(hunkMatch[1] ?? "0", 10),
        oldCount: Number.parseInt(hunkMatch[2] ?? "1", 10),
        newStart: Number.parseInt(hunkMatch[3] ?? "0", 10),
        newCount: Number.parseInt(hunkMatch[4] ?? "1", 10),
        ...(headerText ? { header: headerText } : {}),
        lines: Object.freeze([]),
      };
      currentLines = [];
      continue;
    }

    // Parse diff lines
    if (currentHunk) {
      if (line.startsWith("+")) {
        currentLines.push({ type: "add", content: line.slice(1) });
      } else if (line.startsWith("-")) {
        currentLines.push({ type: "delete", content: line.slice(1) });
      } else if (line.startsWith(" ") || line === "") {
        currentLines.push({ type: "context", content: line.slice(1) || line });
      }
    }
  }

  // Save last hunk
  if (currentHunk) {
    hunks.push({ ...currentHunk, lines: Object.freeze(currentLines) });
  }

  // Determine status
  if (oldPath === "/dev/null") {
    status = "added";
  } else if (newPath === "/dev/null") {
    status = "deleted";
  } else if (oldPath !== newPath) {
    status = "renamed";
  }

  return Object.freeze({
    oldPath,
    newPath,
    hunks: Object.freeze(hunks),
    status,
  });
}

/**
 * Compute intra-line highlights for a pair of deleted/added lines.
 * Finds the specific characters that changed.
 *
 * @param deletedLine - Deleted line content
 * @param addedLine - Added line content
 * @returns Highlight ranges for both lines
 */
export function computeIntraLineHighlights(
  deletedLine: string,
  addedLine: string,
): {
  deleted: readonly (readonly [number, number])[];
  added: readonly (readonly [number, number])[];
} {
  // Find common prefix
  let prefixLen = 0;
  const minLen = Math.min(deletedLine.length, addedLine.length);
  while (prefixLen < minLen && deletedLine[prefixLen] === addedLine[prefixLen]) {
    prefixLen++;
  }

  // Find common suffix
  let suffixLen = 0;
  while (
    suffixLen < minLen - prefixLen &&
    deletedLine[deletedLine.length - 1 - suffixLen] === addedLine[addedLine.length - 1 - suffixLen]
  ) {
    suffixLen++;
  }

  const deletedHighlight: [number, number] = [prefixLen, deletedLine.length - suffixLen];
  const addedHighlight: [number, number] = [prefixLen, addedLine.length - suffixLen];

  return {
    deleted: Object.freeze([Object.freeze(deletedHighlight)]),
    added: Object.freeze([Object.freeze(addedHighlight)]),
  };
}

/**
 * Flatten hunks into a single list of lines for rendering.
 *
 * @param hunks - Diff hunks
 * @param contextLines - Number of context lines to show
 * @returns Flattened line list with line numbers
 */
export type FlattenedDiffLine = Readonly<{
  hunkIndex: number;
  lineIndex: number;
  line: DiffLine;
  oldLineNum: number | null;
  newLineNum: number | null;
}>;

export function flattenHunks(hunks: readonly DiffHunk[]): readonly FlattenedDiffLine[] {
  const result: FlattenedDiffLine[] = [];

  for (let hunkIndex = 0; hunkIndex < hunks.length; hunkIndex++) {
    const hunk = hunks[hunkIndex];
    if (!hunk) continue;

    let oldLine = hunk.oldStart;
    let newLine = hunk.newStart;

    for (let lineIndex = 0; lineIndex < hunk.lines.length; lineIndex++) {
      const line = hunk.lines[lineIndex];
      if (!line) continue;

      let oldLineNum: number | null = null;
      let newLineNum: number | null = null;

      if (line.type === "context") {
        oldLineNum = oldLine++;
        newLineNum = newLine++;
      } else if (line.type === "delete") {
        oldLineNum = oldLine++;
      } else if (line.type === "add") {
        newLineNum = newLine++;
      }

      result.push({
        hunkIndex,
        lineIndex,
        line,
        oldLineNum,
        newLineNum,
      });
    }
  }

  return Object.freeze(result);
}

/**
 * Navigate between hunks.
 *
 * @param currentHunk - Current hunk index
 * @param direction - Navigation direction
 * @param hunkCount - Total number of hunks
 * @returns New hunk index
 */
export function navigateHunk(
  currentHunk: number,
  direction: "next" | "prev",
  hunkCount: number,
): number {
  if (hunkCount === 0) return 0;

  if (direction === "next") {
    return Math.min(currentHunk + 1, hunkCount - 1);
  }
  return Math.max(currentHunk - 1, 0);
}

/**
 * Get scroll position to show a specific hunk.
 *
 * @param hunkIndex - Target hunk index
 * @param hunks - All hunks
 * @returns Scroll position (line offset)
 */
export function getHunkScrollPosition(hunkIndex: number, hunks: readonly DiffHunk[]): number {
  let offset = 0;
  for (let i = 0; i < hunkIndex && i < hunks.length; i++) {
    const hunk = hunks[i];
    if (hunk) {
      offset += hunk.lines.length + 1; // +1 for hunk header
    }
  }
  return offset;
}

/** Diff color constants. */
const WIDGET_PALETTE = defaultTheme.colors;

export const DIFF_COLORS = Object.freeze({
  addBg: WIDGET_PALETTE["widget.diff.add.bg"] ?? WIDGET_PALETTE.success,
  deleteBg: WIDGET_PALETTE["widget.diff.delete.bg"] ?? WIDGET_PALETTE.danger,
  addFg: WIDGET_PALETTE["widget.diff.add.fg"] ?? WIDGET_PALETTE.fg,
  deleteFg: WIDGET_PALETTE["widget.diff.delete.fg"] ?? WIDGET_PALETTE.fg,
  hunkHeader: WIDGET_PALETTE["widget.diff.hunkHeader"] ?? WIDGET_PALETTE.info,
  lineNumber: WIDGET_PALETTE["widget.diff.lineNumber"] ?? WIDGET_PALETTE.muted,
  border: WIDGET_PALETTE["widget.diff.border"] ?? WIDGET_PALETTE.border,
});
