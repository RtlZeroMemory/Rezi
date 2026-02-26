import { assert, describe, test } from "@rezi-ui/testkit";
import { createDrawlistBuilder } from "../../index.js";

const OP_CLEAR = 1;
const OP_DRAW_TEXT = 3;
const OP_DRAW_TEXT_RUN = 6;
const TEXT_RUN_SEGMENT_SIZE = 40;

type Op =
  | Readonly<{ kind: "drawText"; x: number; y: number; text: string }>
  | Readonly<{ kind: "drawTextRun"; x: number; y: number; segments: readonly string[] }>;

type Header = Readonly<{
  cmdOffset: number;
  cmdBytes: number;
  cmdCount: number;
  stringsSpanOffset: number;
  stringsCount: number;
  stringsBytesOffset: number;
  stringsBytesLen: number;
  blobsSpanOffset: number;
  blobsCount: number;
  blobsBytesOffset: number;
  blobsBytesLen: number;
}>;

function u16(bytes: Uint8Array, off: number): number {
  const dv = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  return dv.getUint16(off, true);
}

function u32(bytes: Uint8Array, off: number): number {
  const dv = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  return dv.getUint32(off, true);
}

function i32(bytes: Uint8Array, off: number): number {
  const dv = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  return dv.getInt32(off, true);
}

function readHeader(bytes: Uint8Array): Header {
  return Object.freeze({
    cmdOffset: u32(bytes, 16),
    cmdBytes: u32(bytes, 20),
    cmdCount: u32(bytes, 24),
    stringsSpanOffset: u32(bytes, 28),
    stringsCount: u32(bytes, 32),
    stringsBytesOffset: u32(bytes, 36),
    stringsBytesLen: u32(bytes, 40),
    blobsSpanOffset: u32(bytes, 44),
    blobsCount: u32(bytes, 48),
    blobsBytesOffset: u32(bytes, 52),
    blobsBytesLen: u32(bytes, 56),
  });
}

function createGrid(width: number, height: number): string[][] {
  const rows: string[][] = [];
  for (let y = 0; y < height; y++) {
    const row: string[] = [];
    for (let x = 0; x < width; x++) row.push(" ");
    rows.push(row);
  }
  return rows;
}

function clearGrid(grid: string[][]): void {
  for (let y = 0; y < grid.length; y++) {
    const row = grid[y];
    if (!row) continue;
    for (let x = 0; x < row.length; x++) row[x] = " ";
  }
}

function writeText(grid: string[][], x: number, y: number, text: string): number {
  const row = grid[y];
  let cursor = x;
  for (const ch of text) {
    if (row && cursor >= 0 && cursor < row.length) row[cursor] = ch;
    cursor += 1;
  }
  return cursor;
}

function gridToLines(grid: string[][]): readonly string[] {
  return Object.freeze(grid.map((row) => row.join("")));
}

function decodeTextSlice(
  bytes: Uint8Array,
  h: Header,
  stringIndex: number,
  byteOff: number,
  byteLen: number,
): string {
  if (byteLen === 0) return "";
  assert.equal(stringIndex >= 0 && stringIndex < h.stringsCount, true, "string index in bounds");

  const span = h.stringsSpanOffset + stringIndex * 8;
  const spanOff = u32(bytes, span);
  const spanLen = u32(bytes, span + 4);
  assert.equal(byteOff + byteLen <= spanLen, true, "string slice in bounds");

  const start = h.stringsBytesOffset + spanOff + byteOff;
  const end = start + byteLen;
  return new TextDecoder().decode(bytes.subarray(start, end));
}

function executeDrawlistToGrid(
  bytes: Uint8Array,
  width: number,
  height: number,
): readonly string[] {
  const h = readHeader(bytes);
  const grid = createGrid(width, height);

  const cmdEnd = h.cmdOffset + h.cmdBytes;
  let off = h.cmdOffset;
  for (let i = 0; i < h.cmdCount; i++) {
    assert.equal(off < cmdEnd, true, "command cursor in bounds");
    const opcode = u16(bytes, off);
    const size = u32(bytes, off + 4);

    if (opcode === OP_CLEAR) {
      clearGrid(grid);
    } else if (opcode === OP_DRAW_TEXT) {
      const x = i32(bytes, off + 8);
      const y = i32(bytes, off + 12);
      const stringIndex = u32(bytes, off + 16);
      const byteOff = u32(bytes, off + 20);
      const byteLen = u32(bytes, off + 24);
      const text = decodeTextSlice(bytes, h, stringIndex, byteOff, byteLen);
      writeText(grid, x, y, text);
    } else if (opcode === OP_DRAW_TEXT_RUN) {
      const x = i32(bytes, off + 8);
      const y = i32(bytes, off + 12);
      const blobIndex = u32(bytes, off + 16);

      assert.equal(blobIndex < h.blobsCount, true, "blob index in bounds");
      const blobSpan = h.blobsSpanOffset + blobIndex * 8;
      const blobOff = h.blobsBytesOffset + u32(bytes, blobSpan);
      const blobLen = u32(bytes, blobSpan + 4);
      const blobEnd = blobOff + blobLen;
      const segCount = u32(bytes, blobOff);

      let cursor = x;
      for (let seg = 0; seg < segCount; seg++) {
        const segOff = blobOff + 4 + seg * TEXT_RUN_SEGMENT_SIZE;
        assert.equal(segOff + TEXT_RUN_SEGMENT_SIZE <= blobEnd, true, "segment in bounds");

        const stringIndex = u32(bytes, segOff + 28);
        const byteOff = u32(bytes, segOff + 32);
        const byteLen = u32(bytes, segOff + 36);
        const text = decodeTextSlice(bytes, h, stringIndex, byteOff, byteLen);
        cursor = writeText(grid, cursor, y, text);
      }
    }

    off += size;
  }

  assert.equal(off, cmdEnd, "command stream fully consumed");
  return gridToLines(grid);
}

function executeBaselineToGrid(
  ops: readonly Op[],
  width: number,
  height: number,
): readonly string[] {
  const grid = createGrid(width, height);
  clearGrid(grid);

  for (const op of ops) {
    if (op.kind === "drawText") {
      writeText(grid, op.x, op.y, op.text);
      continue;
    }

    let cursor = op.x;
    for (const segment of op.segments) {
      cursor = writeText(grid, cursor, op.y, segment);
    }
  }

  return gridToLines(grid);
}

function buildDrawlist(
  ops: readonly Op[],
  opts: Readonly<{ maxBlobBytes?: number; maxDrawlistBytes?: number }> = {},
): Uint8Array {
  const b = createDrawlistBuilder({
    ...(opts.maxBlobBytes !== undefined ? { maxBlobBytes: opts.maxBlobBytes } : {}),
    ...(opts.maxDrawlistBytes !== undefined ? { maxDrawlistBytes: opts.maxDrawlistBytes } : {}),
  });

  b.clear();
  for (const op of ops) {
    if (op.kind === "drawText") {
      b.drawText(op.x, op.y, op.text);
      continue;
    }

    const blobIndex = b.addTextRunBlob(op.segments.map((text) => Object.freeze({ text })));
    assert.equal(blobIndex !== null, true, "text-run blob should allocate");
    if (blobIndex === null) continue;
    b.drawTextRun(op.x, op.y, blobIndex);
  }

  const built = b.build();
  assert.equal(built.ok, true, "drawlist build should succeed");
  if (!built.ok) return new Uint8Array();
  return built.bytes;
}

function xorshift32(seed: number): () => number {
  let s = seed >>> 0;
  return () => {
    s ^= s << 13;
    s ^= s >>> 17;
    s ^= s << 5;
    return s >>> 0;
  };
}

function randomInt(next: () => number, min: number, max: number): number {
  const span = max - min + 1;
  return min + (next() % span);
}

function randomFrom<T>(next: () => number, items: readonly T[]): T {
  const idx = randomInt(next, 0, items.length - 1);
  return items[idx] as T;
}

function randomText(next: () => number, maxLen = 12): string {
  const glyphs = [
    "a",
    "b",
    "c",
    "x",
    "y",
    "z",
    "0",
    "1",
    "2",
    " ",
    "-",
    "_",
    ".",
    ":",
    "😀",
    "🚀",
    "漢",
    "字",
    "e\u0301",
  ] as const;

  const len = randomInt(next, 0, maxLen);
  let out = "";
  for (let i = 0; i < len; i++) out += randomFrom(next, glyphs);
  return out;
}

function randomSplit(next: () => number, text: string): readonly string[] {
  const cps = [...text];
  if (cps.length === 0) return Object.freeze([""]);

  const partCount = randomInt(next, 1, Math.min(4, cps.length));
  const parts: string[] = [];
  let off = 0;
  for (let i = 0; i < partCount; i++) {
    const remaining = cps.length - off;
    const len = i === partCount - 1 ? remaining : randomInt(next, 0, remaining);
    parts.push(cps.slice(off, off + len).join(""));
    off += len;
  }
  return Object.freeze(parts);
}

describe("drawlist text arena equivalence", () => {
  test("golden framebuffer equivalence for text-heavy scenarios", () => {
    const width = 80;
    const height = 24;

    const scenarios: Readonly<Record<string, readonly Op[]>> = Object.freeze({
      logViewer: Object.freeze(
        Array.from({ length: 24 }, (_, y) =>
          Object.freeze({
            kind: "drawTextRun",
            x: 0,
            y,
            segments: Object.freeze([
              `[${String(y).padStart(2, "0")}]`,
              " INFO ",
              `worker-${String(y % 7)} completed task-${String(1000 + y)}`,
            ]),
          }),
        ),
      ),
      mixedUnicode: Object.freeze([
        Object.freeze({ kind: "drawText", x: 2, y: 1, text: "status: ready ✅" }),
        Object.freeze({ kind: "drawText", x: 2, y: 2, text: "lang: 漢字 + emoji 😀" }),
        Object.freeze({
          kind: "drawTextRun",
          x: 2,
          y: 4,
          segments: Object.freeze(["cpu:", " 42%", " | mem:", " 71%", " | net:", " 8MB/s"]),
        }),
        Object.freeze({
          kind: "drawTextRun",
          x: 2,
          y: 6,
          segments: Object.freeze(["path:", " /srv/worker", "-", "é", "/logs"]),
        }),
      ]),
      manySmallRuns: Object.freeze(
        Array.from({ length: 120 }, (_, i) => {
          const y = i % 12;
          const x = (i * 3) % 40;
          return Object.freeze({
            kind: "drawTextRun",
            x,
            y,
            segments: Object.freeze([`[${String(i)}]`, ":", "ok"]),
          });
        }),
      ),
    });

    for (const [name, ops] of Object.entries(scenarios)) {
      const bytes = buildDrawlist(ops);
      const actual = executeDrawlistToGrid(bytes, width, height);
      const expected = executeBaselineToGrid(ops, width, height);
      assert.deepEqual(actual, expected, `${name}: framebuffer equivalence`);
    }
  });

  test("stress: 50k small text-run segments keep blob and arena bounds valid", () => {
    const segmentCount = 50_000;
    const segments = Array.from({ length: segmentCount }, (_, i) =>
      Object.freeze({ text: String.fromCharCode(97 + (i % 26)) }),
    );

    const b = createDrawlistBuilder({
      maxBlobBytes: 8 * 1024 * 1024,
      maxDrawlistBytes: 16 * 1024 * 1024,
    });
    const blobIndex = b.addTextRunBlob(segments);
    assert.equal(blobIndex, 0);
    if (blobIndex === null) return;
    b.drawTextRun(0, 0, blobIndex);

    const built = b.build();
    assert.equal(built.ok, true, "stress build should succeed");
    if (!built.ok) return;

    const counters = b.getTextPerfCounters?.();
    assert.ok(counters !== undefined, "counters should exist");
    if (!counters) return;
    assert.equal(counters.textSegments, segmentCount);

    const h = readHeader(built.bytes);
    assert.equal(h.stringsCount >= 1, true, "arena span present");
    const arenaLen = u32(built.bytes, h.stringsSpanOffset + 4);

    assert.equal(h.blobsCount, 1, "one blob");
    const blobOff = h.blobsBytesOffset + u32(built.bytes, h.blobsSpanOffset);
    const blobLen = u32(built.bytes, h.blobsSpanOffset + 4);
    const blobEnd = blobOff + blobLen;

    const segCount = u32(built.bytes, blobOff);
    assert.equal(segCount, segmentCount);
    for (let i = 0; i < segmentCount; i++) {
      const segOff = blobOff + 4 + i * TEXT_RUN_SEGMENT_SIZE;
      assert.equal(segOff + TEXT_RUN_SEGMENT_SIZE <= blobEnd, true, "segment bounds");
      const byteOff = u32(built.bytes, segOff + 32);
      const byteLen = u32(built.bytes, segOff + 36);
      assert.equal(byteOff + byteLen <= arenaLen, true, "arena slice bounds");
    }
  });

  test("property: random text + random slicing matches baseline framebuffer", () => {
    const width = 48;
    const height = 16;

    for (let seed = 1; seed <= 40; seed++) {
      const next = xorshift32(seed);
      const ops: Op[] = [];
      const opCount = 120;

      for (let i = 0; i < opCount; i++) {
        const x = randomInt(next, -2, width + 2);
        const y = randomInt(next, -1, height + 1);
        if ((next() & 1) === 0) {
          ops.push(Object.freeze({ kind: "drawText", x, y, text: randomText(next, 10) }));
          continue;
        }

        const full = randomText(next, 14);
        const segments = randomSplit(next, full);
        ops.push(Object.freeze({ kind: "drawTextRun", x, y, segments }));
      }

      const bytes = buildDrawlist(ops);
      const actual = executeDrawlistToGrid(bytes, width, height);
      const expected = executeBaselineToGrid(ops, width, height);
      assert.deepEqual(actual, expected, `seed=${String(seed)} framebuffer equality`);
    }
  });
});
