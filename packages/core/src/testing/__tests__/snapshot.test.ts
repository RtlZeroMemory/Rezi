import * as assert from "node:assert/strict";
import { describe, it } from "node:test";
import { coerceToLegacyTheme } from "../../theme/interop.js";
import { darkTheme } from "../../theme/presets.js";
import { ui } from "../../widgets/ui.js";
import {
  type Snapshot,
  captureSnapshot,
  diffSnapshots,
  parseSnapshot,
  serializeSnapshot,
} from "../snapshot.js";

describe("serializeSnapshot", () => {
  it("produces stable header format", () => {
    const snapshot: Snapshot = {
      metadata: {
        scene: "test-scene",
        theme: "dark",
        viewport: { cols: 80, rows: 24 },
        capturedAt: "2026-01-01T00:00:00.000Z",
        version: "1.0.0",
      },
      content: "Hello World",
    };

    const serialized = serializeSnapshot(snapshot);
    assert.ok(serialized.includes("# Snapshot: test-scene"));
    assert.ok(serialized.includes("# Theme: dark"));
    assert.ok(serialized.includes("# Viewport: 80x24"));
    assert.ok(serialized.includes("---"));
    assert.ok(serialized.includes("Hello World"));
  });
});

describe("parseSnapshot", () => {
  it("round-trips serialize -> parse", () => {
    const original: Snapshot = {
      metadata: {
        scene: "round-trip",
        theme: "light",
        viewport: { cols: 60, rows: 20 },
        capturedAt: "2026-02-22T12:00:00.000Z",
        version: "1.0.0",
      },
      content: "Line 1\nLine 2\nLine 3",
    };

    const serialized = serializeSnapshot(original);
    const parsed = parseSnapshot(serialized);
    assert.ok(parsed);
    assert.equal(parsed.metadata.scene, "round-trip");
    assert.equal(parsed.metadata.theme, "light");
    assert.equal(parsed.metadata.viewport.cols, 60);
    assert.equal(parsed.metadata.viewport.rows, 20);
    assert.equal(parsed.content, "Line 1\nLine 2\nLine 3");
  });

  it("returns null for invalid format", () => {
    const result = parseSnapshot("no header here");
    assert.equal(result, null);
  });
});

describe("diffSnapshots", () => {
  it("reports matching snapshots", () => {
    const snap: Snapshot = {
      metadata: {
        scene: "same",
        theme: "dark",
        viewport: { cols: 80, rows: 24 },
        capturedAt: "",
        version: "1.0.0",
      },
      content: "Same content",
    };

    const result = diffSnapshots(snap, snap);
    assert.equal(result.match, true);
    assert.equal(result.changedLines.length, 0);
  });

  it("reports differing lines", () => {
    const expected: Snapshot = {
      metadata: {
        scene: "diff",
        theme: "dark",
        viewport: { cols: 80, rows: 24 },
        capturedAt: "",
        version: "1.0.0",
      },
      content: "Line A\nLine B\nLine C",
    };

    const actual: Snapshot = {
      metadata: {
        scene: "diff",
        theme: "dark",
        viewport: { cols: 80, rows: 24 },
        capturedAt: "",
        version: "1.0.0",
      },
      content: "Line A\nLine X\nLine C",
    };

    const result = diffSnapshots(expected, actual);
    assert.equal(result.match, false);
    assert.deepEqual([...result.changedLines], [1]);
    assert.ok(result.summary.includes("Line X"));
  });
});

describe("captureSnapshot", () => {
  it("captures a simple text widget", () => {
    const theme = coerceToLegacyTheme(darkTheme);
    const snapshot = captureSnapshot(
      "simple-text",
      ui.text("Hello"),
      { viewport: { cols: 40, rows: 5 }, theme },
      "dark",
    );

    assert.equal(snapshot.metadata.scene, "simple-text");
    assert.equal(snapshot.metadata.theme, "dark");
    assert.ok(snapshot.content.includes("Hello"));
  });

  it("produces deterministic output for same input", () => {
    const theme = coerceToLegacyTheme(darkTheme);
    const vnode = ui.column({ gap: 1 }, [
      ui.text("Title", { style: { bold: true } }),
      ui.text("Body text"),
    ]);

    const snap1 = captureSnapshot("det", vnode, { viewport: { cols: 40, rows: 5 }, theme }, "dark");
    const snap2 = captureSnapshot("det", vnode, { viewport: { cols: 40, rows: 5 }, theme }, "dark");

    assert.equal(snap1.content, snap2.content);
  });
});
