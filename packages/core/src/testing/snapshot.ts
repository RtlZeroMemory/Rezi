/**
 * packages/core/src/testing/snapshot.ts — Golden frame snapshot system.
 *
 * Why: Provides deterministic, platform-stable visual snapshots for regression
 * testing. Captures the text output of createTestRenderer.toText() along with
 * metadata (theme, viewport, scene name) for meaningful diffs.
 *
 * Snapshot format:
 *   - Header line with metadata (theme, viewport, scene)
 *   - Text-based representation of the rendered frame
 *   - Deterministic across platforms (uses toText() which is platform-agnostic)
 *
 * @see docs/design-system.md
 */

import type { VNode } from "../widgets/types.js";
import { type TestRendererOptions, createTestRenderer } from "./renderer.js";

/**
 * Metadata stored alongside each snapshot.
 */
export type SnapshotMetadata = Readonly<{
  /** Scene identifier */
  scene: string;
  /** Theme name */
  theme: string;
  /** Viewport dimensions */
  viewport: { cols: number; rows: number };
  /** Timestamp of capture (ISO 8601) */
  capturedAt: string;
  /** Design system version */
  version: string;
}>;

/**
 * A captured snapshot.
 */
export type Snapshot = Readonly<{
  metadata: SnapshotMetadata;
  /** Rendered text content */
  content: string;
}>;

/**
 * Serialize a snapshot to a stable string format.
 */
export function serializeSnapshot(snapshot: Snapshot): string {
  const meta = snapshot.metadata;
  const header = [
    `# Snapshot: ${meta.scene}`,
    `# Theme: ${meta.theme}`,
    `# Viewport: ${meta.viewport.cols}x${meta.viewport.rows}`,
    `# Version: ${meta.version}`,
    `# Captured: ${meta.capturedAt}`,
    "---",
  ].join("\n");
  return `${header}\n${snapshot.content}\n`;
}

/**
 * Parse a serialized snapshot back into a Snapshot object.
 */
export function parseSnapshot(text: string): Snapshot | null {
  const lines = text.split("\n");
  let scene = "";
  let theme = "";
  let cols = 80;
  let rows = 24;
  let version = "";
  let capturedAt = "";
  let contentStart = -1;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (line === undefined) continue;
    if (line === "---") {
      contentStart = i + 1;
      break;
    }
    if (line.startsWith("# Snapshot: ")) scene = line.slice(12);
    else if (line.startsWith("# Theme: ")) theme = line.slice(9);
    else if (line.startsWith("# Viewport: ")) {
      const match = line.slice(12).match(/^(\d+)x(\d+)$/);
      if (match) {
        const colsText = match[1];
        const rowsText = match[2];
        if (colsText !== undefined && rowsText !== undefined) {
          cols = Number.parseInt(colsText, 10);
          rows = Number.parseInt(rowsText, 10);
        }
      }
    } else if (line.startsWith("# Version: ")) version = line.slice(11);
    else if (line.startsWith("# Captured: ")) capturedAt = line.slice(12);
  }

  if (contentStart === -1) return null;

  const content = lines.slice(contentStart).join("\n").trimEnd();

  return {
    metadata: {
      scene,
      theme,
      viewport: { cols, rows },
      capturedAt,
      version,
    },
    content,
  };
}

/**
 * Capture a snapshot of a VNode scene.
 *
 * @param scene - Scene name for identification
 * @param vnode - The VNode tree to render
 * @param options - Renderer options (viewport, theme)
 * @param themeName - Theme name for metadata
 * @returns Captured snapshot
 */
export function captureSnapshot(
  scene: string,
  vnode: VNode,
  options: TestRendererOptions,
  themeName: string,
): Snapshot {
  const renderer = createTestRenderer(options);
  const result = renderer.render(vnode);
  const content = result.toText();
  const viewport = options.viewport ?? { cols: 80, rows: 24 };

  return {
    metadata: {
      scene,
      theme: themeName,
      viewport: { cols: viewport.cols, rows: viewport.rows },
      capturedAt: new Date().toISOString(),
      version: "1.0.0",
    },
    content,
  };
}

/**
 * Compare two snapshots and return a diff result.
 */
export type SnapshotDiffResult = Readonly<{
  /** Whether the snapshots match */
  match: boolean;
  /** Lines that differ (0-indexed) */
  changedLines: readonly number[];
  /** Human-readable diff summary */
  summary: string;
}>;

export function diffSnapshots(expected: Snapshot, actual: Snapshot): SnapshotDiffResult {
  const expectedLines = expected.content.split("\n");
  const actualLines = actual.content.split("\n");
  const maxLines = Math.max(expectedLines.length, actualLines.length);
  const changedLines: number[] = [];

  for (let i = 0; i < maxLines; i++) {
    const e = expectedLines[i] ?? "";
    const a = actualLines[i] ?? "";
    if (e !== a) {
      changedLines.push(i);
    }
  }

  const match = changedLines.length === 0;

  let summary: string;
  if (match) {
    summary = `Snapshot "${expected.metadata.scene}" matches.`;
  } else {
    const lines = changedLines.slice(0, 10).map((i) => {
      const e = expectedLines[i] ?? "(missing)";
      const a = actualLines[i] ?? "(missing)";
      return `  Line ${i + 1}:\n    expected: ${JSON.stringify(e)}\n    actual:   ${JSON.stringify(a)}`;
    });
    const more = changedLines.length > 10 ? `\n  ... and ${changedLines.length - 10} more` : "";
    summary = `Snapshot "${expected.metadata.scene}" differs in ${changedLines.length} line(s):\n${lines.join("\n")}${more}`;
  }

  return { match, changedLines, summary };
}
