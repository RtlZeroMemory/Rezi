import assert from "node:assert/strict";
/**
 * Micro-benchmarks proving the identified bottlenecks in ink-compat.
 *
 * Run with: npx tsx --test packages/ink-compat/src/__tests__/perf/bottleneck-profile.test.ts
 */
import { describe, it } from "node:test";
import { type VNode, createTestRenderer } from "@rezi-ui/core";
import {
  type InkHostContainer,
  type InkHostNode,
  appendChild,
  createHostContainer,
  createHostNode,
  setNodeProps,
  setNodeTextContent,
} from "../../reconciler/types.js";
import {
  advanceLayoutGeneration,
  readCurrentLayout,
  writeCurrentLayout,
} from "../../runtime/layoutState.js";
import {
  __inkCompatTranslationTestHooks,
  translateDynamicTreeWithMetadata,
  translateTree,
} from "../../translation/propsToVNode.js";

// ─── Bottleneck 1: stylesEqual with JSON.stringify ───

interface CellStyle {
  fg?: { r: number; g: number; b: number };
  bg?: { r: number; g: number; b: number };
  bold?: boolean;
  dim?: boolean;
  italic?: boolean;
  underline?: boolean;
  strikethrough?: boolean;
  inverse?: boolean;
}

// Current implementation (from render.ts:1203)
function stylesEqual_CURRENT(a: CellStyle | undefined, b: CellStyle | undefined): boolean {
  if (a === b) return true;
  if (!a || !b) return false;

  const keysA = Object.keys(a).sort();
  const keysB = Object.keys(b).sort();
  if (keysA.length !== keysB.length) return false;

  for (let i = 0; i < keysA.length; i += 1) {
    const key = keysA[i]!;
    if (key !== keysB[i]) return false;
    if (
      JSON.stringify((a as Record<string, unknown>)[key]) !==
      JSON.stringify((b as Record<string, unknown>)[key])
    ) {
      return false;
    }
  }
  return true;
}

// Proposed fix: direct field comparison
function rgbEqual(
  a: { r: number; g: number; b: number } | undefined,
  b: { r: number; g: number; b: number } | undefined,
): boolean {
  if (a === b) return true;
  if (!a || !b) return false;
  return a.r === b.r && a.g === b.g && a.b === b.b;
}

function stylesEqual_FIXED(a: CellStyle | undefined, b: CellStyle | undefined): boolean {
  if (a === b) return true;
  if (!a || !b) return false;
  return (
    a.bold === b.bold &&
    a.dim === b.dim &&
    a.italic === b.italic &&
    a.underline === b.underline &&
    a.strikethrough === b.strikethrough &&
    a.inverse === b.inverse &&
    rgbEqual(a.fg, b.fg) &&
    rgbEqual(a.bg, b.bg)
  );
}

// ─── Bottleneck 2: stylesEqual in propsToVNode ───

interface TextStyleMap {
  fg?: { r: number; g: number; b: number };
  bg?: { r: number; g: number; b: number };
  bold?: boolean;
  italic?: boolean;
  underline?: boolean;
  strikethrough?: boolean;
  dim?: boolean;
  inverse?: boolean;
  [key: string]: unknown;
}

function textStylesEqual_CURRENT(a: TextStyleMap, b: TextStyleMap): boolean {
  const keysA = Object.keys(a).sort();
  const keysB = Object.keys(b).sort();
  if (keysA.length !== keysB.length) return false;
  for (let i = 0; i < keysA.length; i += 1) {
    const key = keysA[i]!;
    if (key !== keysB[i]) return false;
    if (JSON.stringify(a[key]) !== JSON.stringify(b[key])) return false;
  }
  return true;
}

function textStylesEqual_FIXED(a: TextStyleMap, b: TextStyleMap): boolean {
  if (a === b) return true;
  const keysA = Object.keys(a);
  const keysB = Object.keys(b);
  if (keysA.length !== keysB.length) return false;
  for (const key of keysA) {
    if (!(key in b)) return false;
  }
  return (
    a.bold === b.bold &&
    a.dim === b.dim &&
    a.italic === b.italic &&
    a.underline === b.underline &&
    a.strikethrough === b.strikethrough &&
    a.inverse === b.inverse &&
    rgbEqual(a.fg, b.fg) &&
    rgbEqual(a.bg, b.bg)
  );
}

// ─── Bottleneck 3: Grid allocation ───

interface StyledCell {
  char: string;
  style: CellStyle | undefined;
}

function allocateGrid_CURRENT(cols: number, rows: number): StyledCell[][] {
  const grid: StyledCell[][] = [];
  for (let y = 0; y < rows; y++) {
    const row: StyledCell[] = [];
    for (let x = 0; x < cols; x++) {
      row.push({ char: " ", style: undefined });
    }
    grid.push(row);
  }
  return grid;
}

let reusableGrid: StyledCell[][] = [];
let reusableCols = 0;
let reusableRows = 0;

function allocateGrid_REUSE(cols: number, rows: number): StyledCell[][] {
  if (cols === reusableCols && rows === reusableRows) {
    for (let y = 0; y < rows; y++) {
      const row = reusableGrid[y]!;
      for (let x = 0; x < cols; x++) {
        const cell = row[x]!;
        cell.char = " ";
        cell.style = undefined;
      }
    }
    return reusableGrid;
  }
  reusableGrid = [];
  for (let y = 0; y < rows; y++) {
    const row: StyledCell[] = [];
    for (let x = 0; x < cols; x++) {
      row.push({ char: " ", style: undefined });
    }
    reusableGrid.push(row);
  }
  reusableCols = cols;
  reusableRows = rows;
  return reusableGrid;
}

// ─── Bottleneck 7: mergeCellStyles ───

function mergeCellStyles_CURRENT(
  base: CellStyle | undefined,
  overlay: CellStyle | undefined,
): CellStyle | undefined {
  if (!overlay && !base) return undefined;
  if (!overlay) return base;
  if (!base) return overlay;

  const merged: CellStyle = {};
  const bg = overlay.bg ?? base.bg;
  const fg = overlay.fg ?? base.fg;
  if (bg) merged.bg = bg;
  if (fg) merged.fg = fg;
  if (overlay.bold ?? base.bold) merged.bold = true;
  if (overlay.dim ?? base.dim) merged.dim = true;
  if (overlay.italic ?? base.italic) merged.italic = true;
  if (overlay.underline ?? base.underline) merged.underline = true;
  if (overlay.strikethrough ?? base.strikethrough) merged.strikethrough = true;
  if (overlay.inverse ?? base.inverse) merged.inverse = true;
  return Object.keys(merged).length > 0 ? merged : undefined;
}

// ─── Benchmarking harness ───

const FIXED_WARMUP_ITERATIONS = 500;

function bench(name: string, fn: () => void, iterations: number): number {
  // Warmup
  for (let i = 0; i < Math.min(FIXED_WARMUP_ITERATIONS, iterations); i++) fn();

  const start = performance.now();
  for (let i = 0; i < iterations; i++) fn();
  const elapsed = performance.now() - start;
  const perOp = (elapsed / iterations) * 1_000_000; // nanoseconds
  return perOp;
}

describe("ink-compat bottleneck profiling", () => {
  it("Bottleneck 1: stylesEqual — JSON.stringify vs direct comparison", () => {
    const a: CellStyle = {
      fg: { r: 255, g: 0, b: 0 },
      bg: { r: 0, g: 0, b: 0 },
      bold: true,
    };
    const b: CellStyle = {
      fg: { r: 255, g: 0, b: 0 },
      bg: { r: 0, g: 0, b: 0 },
      bold: true,
    };
    const N = 100_000;

    const currentNs = bench("current", () => stylesEqual_CURRENT(a, b), N);
    const fixedNs = bench("fixed", () => stylesEqual_FIXED(a, b), N);
    const speedup = currentNs / fixedNs;

    console.log("  stylesEqual (render.ts):");
    console.log(`    CURRENT (JSON.stringify): ${currentNs.toFixed(0)} ns/op`);
    console.log(`    FIXED   (direct fields): ${fixedNs.toFixed(0)} ns/op`);
    console.log(`    Speedup: ${speedup.toFixed(1)}x`);
    console.log(
      `    Per-frame savings (1920 cells): ${(((currentNs - fixedNs) * 1920) / 1_000_000).toFixed(2)} ms`,
    );

    // The fixed version must produce the same result
    assert.equal(stylesEqual_CURRENT(a, b), stylesEqual_FIXED(a, b));
    assert.equal(stylesEqual_CURRENT(a, undefined), stylesEqual_FIXED(a, undefined));
    assert.equal(stylesEqual_CURRENT(undefined, b), stylesEqual_FIXED(undefined, b));
    assert.equal(
      stylesEqual_CURRENT(undefined, undefined),
      stylesEqual_FIXED(undefined, undefined),
    );

    const c: CellStyle = { fg: { r: 0, g: 255, b: 0 } };
    assert.equal(stylesEqual_CURRENT(a, c), stylesEqual_FIXED(a, c));

    assert.ok(speedup > 1.1, `Expected at least 1.1x speedup, got ${speedup.toFixed(1)}x`);
  });

  it("Bottleneck 1b: stylesEqual — undefined vs undefined (common case)", () => {
    const N = 100_000;

    const currentNs = bench("current", () => stylesEqual_CURRENT(undefined, undefined), N);
    const fixedNs = bench("fixed", () => stylesEqual_FIXED(undefined, undefined), N);
    const speedup = currentNs / fixedNs;

    console.log("  stylesEqual (undefined vs undefined):");
    console.log(`    CURRENT: ${currentNs.toFixed(0)} ns/op`);
    console.log(`    FIXED:   ${fixedNs.toFixed(0)} ns/op`);
    console.log(`    Speedup: ${speedup.toFixed(1)}x`);
  });

  it("Bottleneck 2: textStylesEqual — same pattern in translation", () => {
    const a: TextStyleMap = {
      fg: { r: 255, g: 128, b: 0 },
      bold: true,
      dim: false,
    };
    const b: TextStyleMap = {
      fg: { r: 255, g: 128, b: 0 },
      bold: true,
      dim: false,
    };
    const N = 100_000;

    const currentNs = bench("current", () => textStylesEqual_CURRENT(a, b), N);
    const fixedNs = bench("fixed", () => textStylesEqual_FIXED(a, b), N);
    const speedup = currentNs / fixedNs;

    console.log("  textStylesEqual (propsToVNode.ts):");
    console.log(`    CURRENT (JSON.stringify): ${currentNs.toFixed(0)} ns/op`);
    console.log(`    FIXED   (direct fields): ${fixedNs.toFixed(0)} ns/op`);
    console.log(`    Speedup: ${speedup.toFixed(1)}x`);

    assert.equal(textStylesEqual_CURRENT(a, b), textStylesEqual_FIXED(a, b));
    assert.ok(speedup > 1.1, `Expected at least 1.1x speedup, got ${speedup.toFixed(1)}x`);
  });

  it("Bottleneck 3: grid allocation — new objects vs reuse", () => {
    const cols = 120;
    const rows = 40;
    const N = 1_000;

    const currentNs = bench("current", () => allocateGrid_CURRENT(cols, rows), N);
    const fixedNs = bench("fixed", () => allocateGrid_REUSE(cols, rows), N);
    const speedup = currentNs / fixedNs;

    console.log(`  Grid allocation (${cols}x${rows} = ${cols * rows} cells):`);
    console.log(`    CURRENT (new objects): ${(currentNs / 1000).toFixed(0)} µs/frame`);
    console.log(`    FIXED   (reuse):       ${(fixedNs / 1000).toFixed(0)} µs/frame`);
    console.log(`    Speedup: ${speedup.toFixed(1)}x`);

    assert.ok(speedup > 1.1, `Expected at least 1.1x speedup, got ${speedup.toFixed(1)}x`);
  });

  it("Bottleneck 7: mergeCellStyles — fast path when base is undefined", () => {
    const overlay: CellStyle = { fg: { r: 255, g: 0, b: 0 }, bold: true };
    const N = 100_000;

    // Common case: drawing text on blank cell (base = undefined)
    const currentNs = bench("current", () => mergeCellStyles_CURRENT(undefined, overlay), N);

    // With the fast path, !base returns overlay directly
    const fastPathNs = bench(
      "fast-path",
      () => {
        // This is what the fix does:
        const base = undefined;
        if (!base) return overlay; // fast path
        return mergeCellStyles_CURRENT(base, overlay);
      },
      N,
    );

    console.log("  mergeCellStyles (base=undefined, common case):");
    console.log(`    CURRENT: ${currentNs.toFixed(0)} ns/op`);
    console.log(`    FAST:    ${fastPathNs.toFixed(0)} ns/op`);

    // When base IS present
    const base: CellStyle = { bg: { r: 0, g: 0, b: 40 } };
    const mergeNs = bench("merge", () => mergeCellStyles_CURRENT(base, overlay), N);
    console.log(`    MERGE (base+overlay): ${mergeNs.toFixed(0)} ns/op`);
  });

  it("Bottleneck 8: inClipStack per-cell vs pre-computed clip rect", () => {
    interface ClipRect {
      x: number;
      y: number;
      w: number;
      h: number;
    }

    function inClipStack_CURRENT(x: number, y: number, clipStack: readonly ClipRect[]): boolean {
      for (const clip of clipStack) {
        if (x < clip.x || x >= clip.x + clip.w || y < clip.y || y >= clip.y + clip.h) return false;
      }
      return true;
    }

    function computeEffectiveClip(clipStack: readonly ClipRect[]): ClipRect | null {
      if (clipStack.length === 0) return null;
      let x1 = clipStack[0]!.x;
      let y1 = clipStack[0]!.y;
      let x2 = x1 + clipStack[0]!.w;
      let y2 = y1 + clipStack[0]!.h;
      for (let i = 1; i < clipStack.length; i++) {
        const c = clipStack[i]!;
        x1 = Math.max(x1, c.x);
        y1 = Math.max(y1, c.y);
        x2 = Math.min(x2, c.x + c.w);
        y2 = Math.min(y2, c.y + c.h);
      }
      if (x1 >= x2 || y1 >= y2) return null;
      return { x: x1, y: y1, w: x2 - x1, h: y2 - y1 };
    }

    const clips: ClipRect[] = [
      { x: 0, y: 0, w: 120, h: 40 },
      { x: 5, y: 2, w: 100, h: 30 },
      { x: 10, y: 5, w: 80, h: 20 },
    ];
    const W = 80;
    const H = 20;
    const N = 500;

    const currentNs = bench(
      "current",
      () => {
        let count = 0;
        for (let y = 0; y < H; y++) {
          for (let x = 0; x < W; x++) {
            if (inClipStack_CURRENT(x + 10, y + 5, clips)) count++;
          }
        }
        return count;
      },
      N,
    );

    const fixedNs = bench(
      "fixed",
      () => {
        const eff = computeEffectiveClip(clips);
        if (!eff) return 0;
        let count = 0;
        for (let y = 0; y < H; y++) {
          for (let x = 0; x < W; x++) {
            const px = x + 10;
            const py = y + 5;
            if (px >= eff.x && px < eff.x + eff.w && py >= eff.y && py < eff.y + eff.h) count++;
          }
        }
        return count;
      },
      N,
    );

    const speedup = currentNs / fixedNs;
    console.log(`  inClipStack (${W}x${H} = ${W * H} cells, ${clips.length} clips):`);
    console.log(`    CURRENT (loop per cell):  ${(currentNs / 1000).toFixed(0)} µs/frame`);
    console.log(`    FIXED   (pre-computed):   ${(fixedNs / 1000).toFixed(0)} µs/frame`);
    console.log(`    Speedup: ${speedup.toFixed(1)}x`);
  });

  it("Bottleneck 9: styleToSgr — cached vs uncached", () => {
    type Rgb = { r: number; g: number; b: number };
    type ColorSupport = { level: 0 | 1 | 2 | 3; noColor: boolean };

    function clampByte(v: number): number {
      return Math.max(0, Math.min(255, Math.round(v)));
    }

    function styleToSgr_CURRENT(style: CellStyle | undefined, cs: ColorSupport): string {
      if (!style) return "\u001b[0m";
      const codes: string[] = [];
      if (style.bold) codes.push("1");
      if (style.dim) codes.push("2");
      if (style.italic) codes.push("3");
      if (style.underline) codes.push("4");
      if (style.inverse) codes.push("7");
      if (style.strikethrough) codes.push("9");
      if (cs.level > 0 && style.fg) {
        codes.push(
          `38;2;${clampByte(style.fg.r)};${clampByte(style.fg.g)};${clampByte(style.fg.b)}`,
        );
      }
      if (cs.level > 0 && style.bg) {
        codes.push(
          `48;2;${clampByte(style.bg.r)};${clampByte(style.bg.g)};${clampByte(style.bg.b)}`,
        );
      }
      if (codes.length === 0) return "\u001b[0m";
      return `\u001b[0;${codes.join(";")}m`;
    }

    // Identity cache by style object reference. This only helps when callers
    // reuse CellStyle objects; creating fresh style objects per cell will miss.
    // That tradeoff is acceptable for this benchmark's demonstration.
    const sgrCache = new Map<CellStyle, string>();
    function styleToSgr_CACHED(style: CellStyle | undefined, cs: ColorSupport): string {
      if (!style) return "\u001b[0m";
      const cached = sgrCache.get(style);
      if (cached !== undefined) return cached;
      const result = styleToSgr_CURRENT(style, cs);
      sgrCache.set(style, result);
      return result;
    }

    const cs: ColorSupport = { level: 3, noColor: false };
    const style: CellStyle = { fg: { r: 255, g: 0, b: 0 }, bold: true };
    const N = 100_000;

    const currentNs = bench("current", () => styleToSgr_CURRENT(style, cs), N);
    sgrCache.clear();
    const cachedNs = bench("cached", () => styleToSgr_CACHED(style, cs), N);
    const speedup = currentNs / cachedNs;

    console.log("  styleToSgr (truecolor, bold+fg):");
    console.log(`    CURRENT (rebuild):  ${currentNs.toFixed(0)} ns/op`);
    console.log(`    CACHED  (identity): ${cachedNs.toFixed(0)} ns/op`);
    console.log(`    Speedup: ${speedup.toFixed(1)}x`);
  });

  it("Combined: estimated per-frame savings (80x24 viewport)", () => {
    // Informational single-pass estimate (not a strict benchmark assertion).
    // Simulate a typical frame with 1920 cells
    const CELLS = 80 * 24;
    const style: CellStyle = { fg: { r: 255, g: 128, b: 0 }, bold: true };
    const style2: CellStyle = { fg: { r: 255, g: 128, b: 0 }, bold: true };

    // Current: stylesEqual with JSON.stringify for each cell
    const t1 = performance.now();
    for (let i = 0; i < CELLS; i++) {
      stylesEqual_CURRENT(style, style2);
    }
    const currentStyleMs = performance.now() - t1;

    // Fixed: direct comparison
    const t2 = performance.now();
    for (let i = 0; i < CELLS; i++) {
      stylesEqual_FIXED(style, style2);
    }
    const fixedStyleMs = performance.now() - t2;

    // Current: grid allocation
    const t3 = performance.now();
    allocateGrid_CURRENT(80, 24);
    const currentGridMs = performance.now() - t3;

    // Fixed: grid reuse
    reusableCols = 0; // force first allocation
    allocateGrid_REUSE(80, 24);
    const t4 = performance.now();
    allocateGrid_REUSE(80, 24); // second call — reuse
    const fixedGridMs = performance.now() - t4;

    console.log("\n  === Estimated per-frame savings (80x24) ===");
    console.log(
      `  stylesEqual:  ${currentStyleMs.toFixed(3)} ms → ${fixedStyleMs.toFixed(3)} ms  (saved ${(currentStyleMs - fixedStyleMs).toFixed(3)} ms)`,
    );
    console.log(
      `  grid alloc:   ${currentGridMs.toFixed(3)} ms → ${fixedGridMs.toFixed(3)} ms  (saved ${(currentGridMs - fixedGridMs).toFixed(3)} ms)`,
    );
    console.log(
      `  total saved:  ~${(currentStyleMs - fixedStyleMs + currentGridMs - fixedGridMs).toFixed(3)} ms/frame`,
    );
    console.log(
      `  at 30fps, that's ${((currentStyleMs - fixedStyleMs + currentGridMs - fixedGridMs) * 30).toFixed(1)} ms/sec overhead eliminated`,
    );
  });
});

interface LegacyTextSpan {
  text: string;
  style: Record<string, unknown>;
}

const LEGACY_ANSI_SGR_REGEX = /\u001b\[([0-9:;]*)m/g;

function sanitizeAnsiInputLegacy(input: string): string {
  const ESC = 0x1b;
  let output: string[] | null = null;
  let runStart = 0;
  let index = 0;

  while (index < input.length) {
    const code = input.charCodeAt(index);

    if (code === ESC) {
      const next = input[index + 1];
      if (next === "[") {
        const csiEnd = findCsiEndIndexLegacy(input, index + 2);
        if (csiEnd === -1) {
          if (!output) {
            output = [];
            if (index > 0) output.push(input.slice(0, index));
          } else if (runStart < index) {
            output.push(input.slice(runStart, index));
          }
          index = input.length;
          runStart = index;
          break;
        }

        const keep = input[csiEnd] === "m";
        if (output) {
          if (runStart < index) output.push(input.slice(runStart, index));
          if (keep) output.push(input.slice(index, csiEnd + 1));
        } else if (!keep) {
          output = [];
          if (index > 0) output.push(input.slice(0, index));
        }

        index = csiEnd + 1;
        runStart = index;
        continue;
      }

      if (next === "]") {
        const oscEnd = findOscEndIndexLegacy(input, index + 2);
        if (oscEnd === -1) {
          if (!output) {
            output = [];
            if (index > 0) output.push(input.slice(0, index));
          } else if (runStart < index) {
            output.push(input.slice(runStart, index));
          }
          index = input.length;
          runStart = index;
          break;
        }

        if (output) {
          if (runStart < index) output.push(input.slice(runStart, index));
          output.push(input.slice(index, oscEnd));
        }

        index = oscEnd;
        runStart = index;
        continue;
      }

      if (!output) {
        output = [];
        if (index > 0) output.push(input.slice(0, index));
      } else if (runStart < index) {
        output.push(input.slice(runStart, index));
      }
      index += next == null ? 1 : 2;
      runStart = index;
      continue;
    }

    if (code < 0x20 && code !== 0x09 && code !== 0x0a && code !== 0x0d) {
      if (!output) {
        output = [];
        if (index > 0) output.push(input.slice(0, index));
      } else if (runStart < index) {
        output.push(input.slice(runStart, index));
      }
      index += 1;
      runStart = index;
      continue;
    }

    index += 1;
  }

  if (!output) return input;
  if (runStart < input.length) output.push(input.slice(runStart));
  return output.join("");
}

function findCsiEndIndexLegacy(input: string, start: number): number {
  for (let index = start; index < input.length; index += 1) {
    const code = input.charCodeAt(index);
    if (code >= 0x40 && code <= 0x7e) {
      return index;
    }
  }
  return -1;
}

function findOscEndIndexLegacy(input: string, start: number): number {
  for (let index = start; index < input.length; index += 1) {
    const code = input.charCodeAt(index);
    if (code === 0x07) {
      return index + 1;
    }
    if (code === 0x1b && input[index + 1] === "\\") {
      return index + 2;
    }
  }
  return -1;
}

function appendStyledTextLegacy(
  spans: LegacyTextSpan[],
  text: string,
  style: Record<string, unknown>,
): void {
  if (text.length === 0) return;
  const previous = spans[spans.length - 1];
  if (previous && JSON.stringify(previous.style) === JSON.stringify(style)) {
    previous.text += text;
    return;
  }
  spans.push({ text, style: { ...style } });
}

function parseAnsiTextLegacy(
  text: string,
  baseStyle: Record<string, unknown>,
): {
  spans: LegacyTextSpan[];
  fullText: string;
} {
  if (text.length === 0) return { spans: [], fullText: "" };

  const sanitized = sanitizeAnsiInputLegacy(text);
  if (sanitized.length === 0) return { spans: [], fullText: "" };

  const spans: LegacyTextSpan[] = [];
  let fullText = "";
  let lastIndex = 0;
  let hadAnsiMatch = false;
  const activeStyle: Record<string, unknown> = { ...baseStyle };

  LEGACY_ANSI_SGR_REGEX.lastIndex = 0;
  for (const match of sanitized.matchAll(LEGACY_ANSI_SGR_REGEX)) {
    const index = match.index;
    if (index == null) continue;
    hadAnsiMatch = true;

    const plain = sanitized.slice(lastIndex, index);
    if (plain.length > 0) {
      appendStyledTextLegacy(spans, plain, activeStyle);
      fullText += plain;
    }

    // This perf baseline only targets the no-ANSI path, so code application is omitted.
    lastIndex = index + match[0].length;
  }

  const trailing = sanitized.slice(lastIndex);
  if (trailing.length > 0) {
    appendStyledTextLegacy(spans, trailing, activeStyle);
    fullText += trailing;
  }

  if (spans.length === 0 && !hadAnsiMatch) {
    appendStyledTextLegacy(spans, sanitized, baseStyle);
    fullText = sanitized;
  }

  return { spans, fullText };
}

function collectHostNodes(container: InkHostContainer): InkHostNode[] {
  const out: InkHostNode[] = [];
  const stack = [...container.children];
  while (stack.length > 0) {
    const node = stack.pop();
    if (!node) continue;
    out.push(node);
    for (let index = node.children.length - 1; index >= 0; index -= 1) {
      const child = node.children[index];
      if (child) stack.push(child);
    }
  }
  return out;
}

function buildLargeHostTree(
  rows: number,
  cols: number,
): {
  container: InkHostContainer;
  leaves: InkHostNode[];
} {
  const container = createHostContainer();
  const root = createHostNode("ink-box", { flexDirection: "column" });
  appendChild(container, root);

  const leaves: InkHostNode[] = [];
  for (let rowIndex = 0; rowIndex < rows; rowIndex += 1) {
    const row = createHostNode("ink-box", { flexDirection: "row" });
    appendChild(root, row);
    for (let colIndex = 0; colIndex < cols; colIndex += 1) {
      const textNode = createHostNode("ink-text", {});
      const leaf = createHostNode("ink-text", {});
      setNodeTextContent(leaf, `cell-${rowIndex}-${colIndex}`);
      appendChild(textNode, leaf);
      appendChild(row, textNode);
      leaves.push(leaf);
    }
  }

  return { container, leaves };
}

function legacyScanStaticAndAnsi(rootNode: InkHostContainer): {
  hasStaticNodes: boolean;
  hasAnsiSgr: boolean;
} {
  const ANSI_DETECT = /\u001b\[[0-9:;]*m/;
  let hasStaticNodes = false;
  let hasAnsiSgr = false;
  const stack = [...rootNode.children];
  while (stack.length > 0) {
    const node = stack.pop();
    if (!node) continue;
    if (!hasStaticNodes && node.type === "ink-box" && node.props["__inkStatic"] === true) {
      hasStaticNodes = true;
    }
    if (!hasAnsiSgr && typeof node.textContent === "string" && ANSI_DETECT.test(node.textContent)) {
      hasAnsiSgr = true;
    }
    if (hasStaticNodes && hasAnsiSgr) break;
    for (let index = node.children.length - 1; index >= 0; index -= 1) {
      const child = node.children[index];
      if (child) stack.push(child);
    }
  }
  return { hasStaticNodes, hasAnsiSgr };
}

function clearHostLayoutsLegacy(container: InkHostContainer): void {
  const stack = [...container.children];
  while (stack.length > 0) {
    const node = stack.pop();
    if (!node) continue;
    delete (node as InkHostNode & { __inkLayout?: unknown }).__inkLayout;
    delete (node as InkHostNode & { __inkLayoutGen?: unknown }).__inkLayoutGen;
    for (let index = node.children.length - 1; index >= 0; index -= 1) {
      const child = node.children[index];
      if (child) stack.push(child);
    }
  }
}

function fillRowLoop<T>(row: T[], start: number, end: number, value: T): void {
  for (let index = start; index < end; index += 1) {
    row[index] = value;
  }
}

describe("ink-compat bottleneck profiling (A-E)", () => {
  it("A: parseAnsiText fast-path avoids sanitize+matchAll overhead", () => {
    const baseStyle = { bold: true, dim: false };
    const text = "Simple plain text without any ANSI controls.";
    const N = 200_000;

    const fastNs = bench(
      "fast-path",
      () => {
        __inkCompatTranslationTestHooks.parseAnsiText(text, baseStyle);
      },
      N,
    );
    const legacyNs = bench(
      "legacy-path",
      () => {
        parseAnsiTextLegacy(text, baseStyle);
      },
      N,
    );
    const speedup = legacyNs / fastNs;

    const fastResult = __inkCompatTranslationTestHooks.parseAnsiText(text, baseStyle);
    const legacyResult = parseAnsiTextLegacy(text, baseStyle);
    assert.deepEqual(fastResult, legacyResult);

    console.log("  A) parseAnsiText no-ANSI fast-path:");
    console.log(`    Legacy sanitize+matchAll: ${legacyNs.toFixed(0)} ns/op`);
    console.log(`    Fast-path parseAnsiText:  ${fastNs.toFixed(0)} ns/op`);
    console.log(`    Speedup: ${speedup.toFixed(2)}x`);
  });

  it("B: incremental translation cache speeds small leaf mutations", () => {
    const rows = 80;
    const cols = 8;
    const iterations = 250;

    const cachedTree = buildLargeHostTree(rows, cols);
    const baselineTree = buildLargeHostTree(rows, cols);
    const cachedTarget = cachedTree.leaves[Math.floor(cachedTree.leaves.length / 2)]!;
    const baselineTarget = baselineTree.leaves[Math.floor(baselineTree.leaves.length / 2)]!;

    __inkCompatTranslationTestHooks.setCacheEnabled(true);
    __inkCompatTranslationTestHooks.clearCache();
    __inkCompatTranslationTestHooks.resetStats();
    translateTree(cachedTree.container);

    let cachedFlip = false;
    let cachedLast: unknown = null;
    const cachedNs = bench(
      "cached",
      () => {
        cachedFlip = !cachedFlip;
        setNodeTextContent(cachedTarget, cachedFlip ? "hot-A" : "hot-B");
        cachedLast = translateTree(cachedTree.container);
      },
      iterations,
    );
    const cachedStats = __inkCompatTranslationTestHooks.getStats();

    __inkCompatTranslationTestHooks.setCacheEnabled(false);
    __inkCompatTranslationTestHooks.clearCache();
    __inkCompatTranslationTestHooks.resetStats();
    translateTree(baselineTree.container);

    let baselineFlip = false;
    let baselineLast: unknown = null;
    const baselineNs = bench(
      "baseline",
      () => {
        baselineFlip = !baselineFlip;
        setNodeTextContent(baselineTarget, baselineFlip ? "hot-A" : "hot-B");
        baselineLast = translateTree(baselineTree.container);
      },
      iterations,
    );
    const baselineStats = __inkCompatTranslationTestHooks.getStats();

    const renderer = createTestRenderer({ viewport: { cols: 160, rows: 120 } });
    assert.equal(
      renderer.render(cachedLast as VNode).toText(),
      renderer.render(baselineLast as VNode).toText(),
    );
    assert.ok(cachedStats.cacheHits > 0);
    assert.ok(cachedStats.translatedNodes < baselineStats.translatedNodes);

    const speedup = baselineNs / cachedNs;
    console.log(
      `  B) incremental translation (${rows * cols} text leaves, 1 leaf mutation/frame):`,
    );
    console.log(`    Baseline (cache OFF): ${(baselineNs / 1000).toFixed(1)} µs/update`);
    console.log(`    Cached   (cache ON):  ${(cachedNs / 1000).toFixed(1)} µs/update`);
    console.log(`    Speedup: ${speedup.toFixed(2)}x`);
    console.log(
      `    Node translations: cache=${cachedStats.translatedNodes} baseline=${baselineStats.translatedNodes}`,
    );

    __inkCompatTranslationTestHooks.setCacheEnabled(true);
  });

  it("C: root static/ANSI marker detection is O(1) vs DFS scan", () => {
    const tree = buildLargeHostTree(160, 12);
    const root = tree.container.children[0]!;
    const targetLeaf = tree.leaves[tree.leaves.length - 1]!;
    setNodeTextContent(targetLeaf, "X\u001b[32mY\u001b[0m");
    setNodeProps(root, { ...root.props, __inkStatic: true });

    const legacyScan = legacyScanStaticAndAnsi(tree.container);
    const flaggedScan = {
      hasStaticNodes: tree.container.__inkSubtreeHasStatic,
      hasAnsiSgr: tree.container.__inkSubtreeHasAnsiSgr,
    };
    assert.deepEqual(flaggedScan, legacyScan);

    const N = 80_000;
    const legacyNs = bench(
      "legacy-dfs",
      () => {
        legacyScanStaticAndAnsi(tree.container);
      },
      N,
    );
    const fastNs = bench(
      "root-flags",
      () => {
        void tree.container.__inkSubtreeHasStatic;
        void tree.container.__inkSubtreeHasAnsiSgr;
      },
      N,
    );
    const speedup = legacyNs / fastNs;

    console.log("  C) root hasStatic/hasAnsi detection:");
    console.log(`    Legacy DFS scan: ${legacyNs.toFixed(0)} ns/op`);
    console.log(`    Root O(1) flags: ${fastNs.toFixed(0)} ns/op`);
    console.log(`    Speedup: ${speedup.toFixed(2)}x`);
  });

  it("D: layout generation avoids full clear traversal", () => {
    const treeLegacy = buildLargeHostTree(180, 8);
    const treeGeneration = buildLargeHostTree(180, 8);
    const legacyNodes = collectHostNodes(treeLegacy.container);
    const generationNodes = collectHostNodes(treeGeneration.container);
    const viewportWidth = 120;

    const legacyAssign = (): void => {
      for (let index = 0; index < legacyNodes.length; index += 1) {
        const node = legacyNodes[index]!;
        (
          node as InkHostNode & { __inkLayout?: { x: number; y: number; w: number; h: number } }
        ).__inkLayout = {
          x: 0,
          y: index,
          w: viewportWidth,
          h: 1,
        };
      }
    };

    const generationAssign = (): void => {
      const generation = advanceLayoutGeneration(treeGeneration.container);
      for (let index = 0; index < generationNodes.length; index += 1) {
        writeCurrentLayout(
          generationNodes[index]!,
          { x: 0, y: index, w: viewportWidth, h: 1 },
          generation,
        );
      }
    };

    legacyAssign();
    generationAssign();

    const staleProbe = generationNodes[generationNodes.length - 1]!;
    const generation = advanceLayoutGeneration(treeGeneration.container);
    writeCurrentLayout(generationNodes[0]!, { x: 0, y: 0, w: viewportWidth, h: 1 }, generation);
    assert.equal(readCurrentLayout(staleProbe), undefined);

    const iterations = 200;
    const legacyNs = bench(
      "legacy-clear+assign",
      () => {
        clearHostLayoutsLegacy(treeLegacy.container);
        legacyAssign();
      },
      iterations,
    );
    const generationNs = bench(
      "generation-assign",
      () => {
        generationAssign();
      },
      iterations,
    );
    const speedup = legacyNs / generationNs;

    console.log("  D) layout invalidation:");
    console.log(`    Legacy clearHostLayouts + assign: ${(legacyNs / 1000).toFixed(1)} µs/frame`);
    console.log(
      `    Generation assign only:           ${(generationNs / 1000).toFixed(1)} µs/frame`,
    );
    console.log(`    Speedup: ${speedup.toFixed(2)}x`);
  });

  it("E: adaptive fill threshold favors loop for small spans, fill for large", () => {
    const rowLength = 2048;
    const N = 300_000;
    const fillValue = { char: " ", style: undefined };

    const smallStart = 32;
    const smallEnd = 40;
    const largeStart = 256;
    const largeEnd = 1280;

    const rowForLoop = new Array<unknown>(rowLength).fill(null);
    const rowForFill = new Array<unknown>(rowLength).fill(null);
    fillRowLoop(rowForLoop, smallStart, smallEnd, fillValue);
    rowForFill.fill(fillValue, smallStart, smallEnd);
    assert.deepEqual(rowForLoop, rowForFill);

    const loopSmallNs = bench(
      "small-loop",
      () => {
        fillRowLoop(rowForLoop, smallStart, smallEnd, fillValue);
      },
      N,
    );
    const fillSmallNs = bench(
      "small-fill",
      () => {
        rowForFill.fill(fillValue, smallStart, smallEnd);
      },
      N,
    );
    const smallSpeedup = fillSmallNs / loopSmallNs;

    const rowForLoopLarge = new Array<unknown>(rowLength).fill(null);
    const rowForFillLarge = new Array<unknown>(rowLength).fill(null);
    fillRowLoop(rowForLoopLarge, largeStart, largeEnd, fillValue);
    rowForFillLarge.fill(fillValue, largeStart, largeEnd);
    assert.deepEqual(rowForLoopLarge, rowForFillLarge);

    const loopLargeNs = bench(
      "large-loop",
      () => {
        fillRowLoop(rowForLoopLarge, largeStart, largeEnd, fillValue);
      },
      N,
    );
    const fillLargeNs = bench(
      "large-fill",
      () => {
        rowForFillLarge.fill(fillValue, largeStart, largeEnd);
      },
      N,
    );
    const largeSpeedup = loopLargeNs / fillLargeNs;

    console.log("  E) adaptive fill strategy:");
    console.log(
      `    Small span (${smallEnd - smallStart} cells): loop=${loopSmallNs.toFixed(0)} ns fill=${fillSmallNs.toFixed(0)} ns`,
    );
    console.log(`      loop advantage: ${smallSpeedup.toFixed(2)}x`);
    console.log(
      `    Large span (${largeEnd - largeStart} cells): loop=${loopLargeNs.toFixed(0)} ns fill=${fillLargeNs.toFixed(0)} ns`,
    );
    console.log(`      fill advantage: ${largeSpeedup.toFixed(2)}x`);
  });

  it("B/C correctness: metadata and output equivalence remain stable", () => {
    const tree = buildLargeHostTree(20, 6);
    const staticNode = tree.container.children[0]!;
    setNodeProps(staticNode, { ...staticNode.props, __inkStatic: true });
    setNodeTextContent(tree.leaves[0]!, "Z\u001b[31mR\u001b[0m");

    __inkCompatTranslationTestHooks.setCacheEnabled(true);
    __inkCompatTranslationTestHooks.clearCache();
    const cached = translateTree(tree.container);
    const metaCached = translateDynamicTreeWithMetadata(tree.container).meta;

    __inkCompatTranslationTestHooks.setCacheEnabled(false);
    __inkCompatTranslationTestHooks.clearCache();
    const baseline = translateTree(tree.container);
    const metaBaseline = translateDynamicTreeWithMetadata(tree.container).meta;

    assert.deepEqual(cached, baseline);
    assert.deepEqual(metaCached, metaBaseline);
    assert.equal(metaCached.hasStaticNodes, true);
    assert.equal(metaCached.hasAnsiSgr, true);

    __inkCompatTranslationTestHooks.setCacheEnabled(true);
  });
});
