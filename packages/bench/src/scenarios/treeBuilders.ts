/**
 * Shared tree builders for all scenarios.
 *
 * Each builder creates an equivalent visual tree at a given size N,
 * using either Rezi native, ink-compat (React), or Ink (React).
 *
 * The trees are semantically identical:
 *   Column(p=1, gap=1) [
 *     Text(bold) "Benchmark: {n} items"
 *     Row(gap=2) [ Text "Total: {n}", Spacer, Text "Page 1" ]
 *     for i in 0..n:
 *       Row(gap=1) [ Text(dim) "{i}.", Text "Item {i}", Text(italic) "details" ]
 *   ]
 */

import { type VNode, ui } from "@rezi-ui/core";
import type React from "react";

// ── Rezi Native ─────────────────────────────────────────────────────

export function buildReziTree(n: number, seed = 0): VNode {
  const rows: VNode[] = [];
  for (let i = 0; i < n; i++) {
    rows.push(
      ui.row({ gap: 1 }, [
        ui.text(`${i}.`, { style: { dim: true } }),
        ui.text(`Item ${i}`),
        ui.text("details", { style: { italic: true } }),
      ]),
    );
  }
  return ui.column({ p: 1, gap: 1 }, [
    ui.text(`Benchmark: ${n} items (#${seed})`, { style: { bold: true } }),
    ui.row({ gap: 2 }, [ui.text(`Total: ${n}`), ui.spacer({ flex: 1 }), ui.text("Page 1")]),
    ...rows,
  ]);
}

// ── React tree builders (used for both Ink and ink-compat) ──────────

// ── terminal-kit ────────────────────────────────────────────────────

/**
 * Build the equivalent tree by writing directly into a terminal-kit ScreenBuffer.
 * This is the idiomatic approach: terminal-kit is imperative, not declarative.
 */
export function buildTermkitTree(
  buffer: { put: (opts: Record<string, unknown>, str: string) => void; fill: () => void },
  n: number,
  seed = 0,
): void {
  buffer.fill();
  // Title row (bold)
  buffer.put({ x: 1, y: 0, attr: { bold: true } }, `Benchmark: ${n} items (#${seed})`);
  // Summary row
  buffer.put({ x: 1, y: 1 }, `Total: ${n}`);
  buffer.put({ x: 60, y: 1 }, "Page 1");
  // Item rows
  for (let i = 0; i < n; i++) {
    const y = 3 + i;
    buffer.put({ x: 1, y, attr: { dim: true } }, `${i}.`);
    buffer.put({ x: 7, y }, `Item ${i}`);
    buffer.put({ x: 20, y, attr: { italic: true } }, "details");
  }
}

// ── blessed ──────────────────────────────────────────────────────────

// biome-ignore lint/suspicious/noExplicitAny: blessed has no types
type BlessedModule = any;

/**
 * Build the equivalent tree as blessed widgets appended to a Screen.
 * Blessed is retained-mode: you create widget objects and append them.
 */
export function buildBlessedTree(
  blessed: BlessedModule,
  screen: { append: (el: unknown) => void },
  n: number,
  seed = 0,
): void {
  // Title
  screen.append(
    blessed.text({
      top: 0,
      left: 1,
      content: `Benchmark: ${n} items (#${seed})`,
      style: { bold: true },
      tags: false,
    }),
  );
  // Summary row
  screen.append(blessed.text({ top: 1, left: 1, content: `Total: ${n}`, tags: false }));
  screen.append(blessed.text({ top: 1, left: 60, content: "Page 1", tags: false }));
  // Item rows
  for (let i = 0; i < n; i++) {
    const y = 3 + i;
    screen.append(
      blessed.text({
        top: y,
        left: 1,
        content: `${i}.`,
        style: { fg: "grey" },
        tags: false,
      }),
    );
    screen.append(blessed.text({ top: y, left: 7, content: `Item ${i}`, tags: false }));
    screen.append(
      blessed.text({
        top: y,
        left: 20,
        content: "details",
        style: { italic: true },
        tags: false,
      }),
    );
  }
}

// ── React tree builders (used for both Ink and ink-compat) ──────────

/**
 * Build a React element tree using the given component set.
 * `C` must provide Box, Text, and Spacer (matching Ink's API).
 */
export function buildReactTree(
  ReactMod: { createElement: typeof import("react").createElement },
  C: {
    Box: unknown;
    Text: unknown;
    Spacer: unknown;
  },
  n: number,
  seed = 0,
): import("react").ReactNode {
  const h = ReactMod.createElement;
  const rows: React.ReactNode[] = [];
  for (let i = 0; i < n; i++) {
    rows.push(
      h(
        C.Box as string,
        { key: String(i), flexDirection: "row", gap: 1 },
        h(C.Text as string, { dimColor: true }, `${i}.`),
        h(C.Text as string, null, `Item ${i}`),
        h(C.Text as string, { italic: true }, "details"),
      ),
    );
  }
  return h(
    C.Box as string,
    { flexDirection: "column", paddingX: 1, gap: 1 },
    h(C.Text as string, { bold: true }, `Benchmark: ${n} items (#${seed})`),
    h(
      C.Box as string,
      { flexDirection: "row", gap: 2 },
      h(C.Text as string, null, `Total: ${n}`),
      h(C.Spacer as string, null),
      h(C.Text as string, null, "Page 1"),
    ),
    ...rows,
  );
}
