import { assert, describe, test } from "@rezi-ui/testkit";
import {
  encodeZrevBatchV1,
  flushMicrotasks,
  makeBackendBatch,
} from "../../app/__tests__/helpers.js";
import { StubBackend } from "../../app/__tests__/stubBackend.js";
import { createApp } from "../../app/createApp.js";
import type { App } from "../../index.js";
import { ui } from "../../widgets/ui.js";

type EncodedEvent = NonNullable<Parameters<typeof encodeZrevBatchV1>[0]["events"]>[number];
type Viewport = Readonly<{ cols: number; rows: number }>;
type Rect = Readonly<{ x: number; y: number; w: number; h: number }>;

const OP_CLEAR = 1;
const OP_FILL_RECT = 2;
const OP_DRAW_TEXT = 3;
const OP_PUSH_CLIP = 4;

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

function parseOpcodes(bytes: Uint8Array): readonly number[] {
  const cmdOffset = u32(bytes, 16);
  const cmdBytes = u32(bytes, 20);
  const end = cmdOffset + cmdBytes;

  const out: number[] = [];
  let off = cmdOffset;
  while (off < end) {
    const opcode = u16(bytes, off);
    const size = u32(bytes, off + 4);
    assert.equal(size >= 8, true, "command size must be >= 8");
    out.push(opcode);
    off += size;
  }
  assert.equal(off, end, "commands must parse exactly to cmd end");
  return Object.freeze(out);
}

function parseInternedStrings(bytes: Uint8Array): readonly string[] {
  const spanOffset = u32(bytes, 28);
  const count = u32(bytes, 32);
  const bytesOffset = u32(bytes, 36);
  const bytesLen = u32(bytes, 40);
  if (count === 0) return Object.freeze([]);

  const tableEnd = bytesOffset + bytesLen;
  assert.equal(tableEnd <= bytes.byteLength, true, "string table must be in-bounds");
  const decoder = new TextDecoder();
  const out: string[] = [];

  for (let i = 0; i < count; i++) {
    const span = spanOffset + i * 8;
    const strOff = u32(bytes, span);
    const strLen = u32(bytes, span + 4);
    const start = bytesOffset + strOff;
    const end = start + strLen;
    assert.equal(end <= tableEnd, true, "string span must be in-bounds");
    out.push(decoder.decode(bytes.subarray(start, end)));
  }

  return Object.freeze(out);
}

function parseFillRects(bytes: Uint8Array): readonly Rect[] {
  const cmdOffset = u32(bytes, 16);
  const cmdBytes = u32(bytes, 20);
  const end = cmdOffset + cmdBytes;

  const out: Rect[] = [];
  let off = cmdOffset;
  while (off < end) {
    const opcode = u16(bytes, off);
    const size = u32(bytes, off + 4);
    assert.equal(size >= 8, true, "command size must be >= 8");
    if (opcode === OP_FILL_RECT && size >= 40) {
      out.push({
        x: i32(bytes, off + 8),
        y: i32(bytes, off + 12),
        w: i32(bytes, off + 16),
        h: i32(bytes, off + 20),
      });
    }
    off += size;
  }

  assert.equal(off, end, "commands must parse exactly to cmd end");
  return Object.freeze(out);
}

function parsePushClips(bytes: Uint8Array): readonly Rect[] {
  const cmdOffset = u32(bytes, 16);
  const cmdBytes = u32(bytes, 20);
  const end = cmdOffset + cmdBytes;

  const out: Rect[] = [];
  let off = cmdOffset;
  while (off < end) {
    const opcode = u16(bytes, off);
    const size = u32(bytes, off + 4);
    assert.equal(size >= 8, true, "command size must be >= 8");
    if (opcode === OP_PUSH_CLIP && size >= 24) {
      out.push({
        x: i32(bytes, off + 8),
        y: i32(bytes, off + 12),
        w: i32(bytes, off + 16),
        h: i32(bytes, off + 20),
      });
    }
    off += size;
  }

  assert.equal(off, end, "commands must parse exactly to cmd end");
  return Object.freeze(out);
}

function countOpcode(opcodes: readonly number[], opcode: number): number {
  let count = 0;
  for (const op of opcodes) {
    if (op === opcode) count++;
  }
  return count;
}

function bytesEqual(a: Uint8Array, b: Uint8Array): boolean {
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i++) {
    const av = a[i];
    const bv = b[i];
    if (av === undefined || bv === undefined || av !== bv) return false;
  }
  return true;
}

function hasViewportClear(bytes: Uint8Array, viewport: Viewport): boolean {
  return parseFillRects(bytes).some(
    (rect) => rect.x === 0 && rect.y === 0 && rect.w === viewport.cols && rect.h === viewport.rows,
  );
}

function assertRectsInViewport(rects: readonly Rect[], viewport: Viewport, label: string): void {
  let index = 0;
  for (const rect of rects) {
    assert.equal(rect.x >= 0, true, `${label}[${String(index)}] x >= 0`);
    assert.equal(rect.y >= 0, true, `${label}[${String(index)}] y >= 0`);
    assert.equal(rect.w >= 0, true, `${label}[${String(index)}] w >= 0`);
    assert.equal(rect.h >= 0, true, `${label}[${String(index)}] h >= 0`);
    assert.equal(
      rect.x + rect.w <= viewport.cols,
      true,
      `${label}[${String(index)}] fits viewport width`,
    );
    assert.equal(
      rect.y + rect.h <= viewport.rows,
      true,
      `${label}[${String(index)}] fits viewport height`,
    );
    index++;
  }
}

function frameAt(backend: StubBackend, index: number): Uint8Array {
  const frame = backend.requestedFrames[index];
  assert.ok(frame, `frame ${String(index)} must exist`);
  return frame ?? new Uint8Array();
}

function latestFrame(backend: StubBackend): Uint8Array {
  const index = backend.requestedFrames.length - 1;
  assert.equal(index >= 0, true, "at least one frame should exist");
  return frameAt(backend, index);
}

function hasSpinnerLineGlyph(strings: readonly string[]): boolean {
  for (const s of strings) {
    if (s === "-" || s === "\\" || s === "|" || s === "/") return true;
  }
  return false;
}

async function pushEvents(
  backend: StubBackend,
  events: readonly EncodedEvent[],
  droppedBatches = 0,
): Promise<void> {
  backend.pushBatch(
    makeBackendBatch({
      bytes: encodeZrevBatchV1({ events }),
      droppedBatches,
    }),
  );
  await flushMicrotasks(20);
}

async function startAndResize<S>(
  app: App<S>,
  backend: StubBackend,
  cols: number,
  rows: number,
  timeMs = 1,
): Promise<void> {
  await app.start();
  await pushEvents(backend, [{ kind: "resize", timeMs, cols, rows }]);
  assert.equal(backend.requestedFrames.length, 1, "initial resize should submit one frame");
}

async function settleNextFrame(backend: StubBackend): Promise<void> {
  backend.resolveNextFrame();
  await flushMicrotasks(20);
}

describe("integration resize behavior", () => {
  test("bootstrap resize 80x24 emits clear + text frame", async () => {
    const backend = new StubBackend();
    const app = createApp({ backend, initialState: 0 });

    app.view(() => ui.text("resize-bootstrap"));

    await startAndResize(app, backend, 80, 24, 1);

    const frame = latestFrame(backend);
    const opcodes = parseOpcodes(frame);
    const strings = parseInternedStrings(frame);

    assert.equal(opcodes.includes(OP_CLEAR), true);
    assert.equal(opcodes.includes(OP_DRAW_TEXT), true);
    assert.equal(hasViewportClear(frame, { cols: 80, rows: 24 }), true);
    assert.equal(strings.includes("resize-bootstrap"), true);
    assert.equal(backend.requestedFrames.length, 1);
  });

  test("resize 80x24 -> 40x12 submits a second frame at new dimensions", async () => {
    const backend = new StubBackend();
    const app = createApp({ backend, initialState: 0 });

    app.view(() => ui.text("resize-down"));

    await startAndResize(app, backend, 80, 24, 1);
    await settleNextFrame(backend);

    await pushEvents(backend, [{ kind: "resize", timeMs: 2, cols: 40, rows: 12 }]);

    assert.equal(backend.requestedFrames.length, 2);
    const second = latestFrame(backend);
    assert.equal(hasViewportClear(second, { cols: 40, rows: 12 }), true);
    assert.equal(parseInternedStrings(second).includes("resize-down"), true);
    assert.equal(countOpcode(parseOpcodes(second), OP_FILL_RECT) > 0, true);
  });

  test("resize 40x12 -> 120x40 submits a second frame at new dimensions", async () => {
    const backend = new StubBackend();
    const app = createApp({ backend, initialState: 0 });

    app.view(() => ui.text("resize-up"));

    await startAndResize(app, backend, 40, 12, 1);
    await settleNextFrame(backend);

    await pushEvents(backend, [{ kind: "resize", timeMs: 2, cols: 120, rows: 40 }]);

    assert.equal(backend.requestedFrames.length, 2);
    const second = latestFrame(backend);
    assert.equal(hasViewportClear(second, { cols: 120, rows: 40 }), true);
    assert.equal(parseInternedStrings(second).includes("resize-up"), true);
    assert.equal(countOpcode(parseOpcodes(second), OP_CLEAR), 1);
  });

  test("resize to 1x1 does not crash and still emits a valid drawlist", async () => {
    const backend = new StubBackend();
    const app = createApp({ backend, initialState: 0 });

    app.view(() => ui.text("x"));

    await startAndResize(app, backend, 10, 4, 1);
    await settleNextFrame(backend);

    await pushEvents(backend, [{ kind: "resize", timeMs: 2, cols: 1, rows: 1 }]);

    assert.equal(backend.requestedFrames.length, 2);
    const frame = latestFrame(backend);
    assert.equal(frame.byteLength > 0, true);
    assert.equal(hasViewportClear(frame, { cols: 1, rows: 1 }), true);
    assert.equal(parseOpcodes(frame).includes(OP_CLEAR), true);
  });

  test("same-size resize is ignored and does not submit another frame", async () => {
    const backend = new StubBackend();
    const app = createApp({ backend, initialState: 0 });

    app.view(() => ui.text("same-size"));

    await startAndResize(app, backend, 50, 18, 1);
    await settleNextFrame(backend);

    await pushEvents(backend, [{ kind: "resize", timeMs: 2, cols: 50, rows: 18 }]);

    assert.equal(backend.requestedFrames.length, 1);
  });

  test("width-only resize emits one additional frame", async () => {
    const backend = new StubBackend();
    const app = createApp({ backend, initialState: 0 });

    app.view(() => ui.text("width-only"));

    await startAndResize(app, backend, 50, 20, 1);
    await settleNextFrame(backend);

    await pushEvents(backend, [{ kind: "resize", timeMs: 2, cols: 77, rows: 20 }]);

    assert.equal(backend.requestedFrames.length, 2);
    assert.equal(hasViewportClear(latestFrame(backend), { cols: 77, rows: 20 }), true);
  });

  test("height-only resize emits one additional frame", async () => {
    const backend = new StubBackend();
    const app = createApp({ backend, initialState: 0 });

    app.view(() => ui.text("height-only"));

    await startAndResize(app, backend, 50, 20, 1);
    await settleNextFrame(backend);

    await pushEvents(backend, [{ kind: "resize", timeMs: 2, cols: 50, rows: 33 }]);

    assert.equal(backend.requestedFrames.length, 2);
    assert.equal(hasViewportClear(latestFrame(backend), { cols: 50, rows: 33 }), true);
  });

  test("tiny-to-large resize sequence keeps rendering stable", async () => {
    const backend = new StubBackend();
    const app = createApp({ backend, initialState: 0 });

    app.view(() => ui.text("ok"));

    await startAndResize(app, backend, 4, 2, 1);
    await settleNextFrame(backend);
    await pushEvents(backend, [{ kind: "resize", timeMs: 2, cols: 120, rows: 40 }]);

    assert.equal(backend.requestedFrames.length, 2);
    const frame = latestFrame(backend);
    assert.equal(hasViewportClear(frame, { cols: 120, rows: 40 }), true);
    assert.equal(parseInternedStrings(frame).includes("ok"), true);
  });

  test("multiple resize events while frame is in-flight coalesce to latest viewport", async () => {
    const backend = new StubBackend();
    const app = createApp({ backend, initialState: 0 });

    app.view(() => ui.text("coalesce"));

    await startAndResize(app, backend, 80, 24, 1);
    await pushEvents(backend, [{ kind: "resize", timeMs: 2, cols: 70, rows: 20 }]);
    await pushEvents(backend, [{ kind: "resize", timeMs: 3, cols: 40, rows: 10 }]);

    assert.equal(backend.requestedFrames.length, 1, "no extra frame before first ACK");

    await settleNextFrame(backend);

    assert.equal(backend.requestedFrames.length, 2, "one coalesced frame after ACK");
    assert.equal(hasViewportClear(latestFrame(backend), { cols: 40, rows: 10 }), true);
  });

  test("rapid 10-resize batch submits one frame at final dimensions", async () => {
    const backend = new StubBackend();
    const app = createApp({ backend, initialState: 0 });

    app.view(() => ui.text("rapid-batch"));

    await startAndResize(app, backend, 30, 10, 1);
    await settleNextFrame(backend);

    const events: EncodedEvent[] = [];
    for (let i = 0; i < 10; i++) {
      events.push({
        kind: "resize",
        timeMs: 2 + i,
        cols: 31 + i,
        rows: 11 + i,
      });
    }
    await pushEvents(backend, events);

    assert.equal(backend.requestedFrames.length, 2);
    assert.equal(hasViewportClear(latestFrame(backend), { cols: 40, rows: 20 }), true);
    assert.equal(countOpcode(parseOpcodes(latestFrame(backend)), OP_CLEAR), 1);
  });

  test("rapid 10-resize sequence with ACK per step submits 10 frames", async () => {
    const backend = new StubBackend();
    const app = createApp({ backend, initialState: 0 });

    app.view(() => ui.text("rapid-seq"));

    await startAndResize(app, backend, 20, 8, 1);
    await settleNextFrame(backend);

    for (let i = 0; i < 10; i++) {
      await pushEvents(backend, [
        {
          kind: "resize",
          timeMs: 2 + i,
          cols: 40 + i,
          rows: 12 + i,
        },
      ]);
      assert.equal(backend.requestedFrames.length, i + 2);
      await settleNextFrame(backend);
    }

    assert.equal(backend.requestedFrames.length, 11);
    assert.equal(hasViewportClear(latestFrame(backend), { cols: 49, rows: 21 }), true);
  });

  test("resize during spinner/tick stream keeps animation and applies latest viewport", async () => {
    const backend = new StubBackend();
    const app = createApp({ backend, initialState: 0 });

    app.view(() => ui.spinner({ variant: "line", label: "loading" }));

    await startAndResize(app, backend, 80, 24, 1);
    const first = latestFrame(backend).slice();
    await settleNextFrame(backend);

    await pushEvents(backend, [{ kind: "tick", timeMs: 2, dtMs: 16 }]);
    assert.equal(backend.requestedFrames.length, 2);
    const tickFrame = latestFrame(backend).slice();
    assert.equal(hasSpinnerLineGlyph(parseInternedStrings(tickFrame)), true);

    await pushEvents(backend, [
      { kind: "resize", timeMs: 3, cols: 40, rows: 12 },
      { kind: "tick", timeMs: 4, dtMs: 16 },
    ]);
    assert.equal(backend.requestedFrames.length, 2, "still blocked on in-flight frame");

    await settleNextFrame(backend);

    assert.equal(backend.requestedFrames.length, 3);
    const latest = latestFrame(backend).slice();
    assert.equal(hasViewportClear(latest, { cols: 40, rows: 12 }), true);
    assert.equal(hasSpinnerLineGlyph(parseInternedStrings(latest)), true);
    assert.equal(bytesEqual(first, tickFrame), false);
    assert.equal(bytesEqual(tickFrame, latest), false);
  });

  test("resize with dropped batch metadata still renders deterministically", async () => {
    const backend = new StubBackend();
    const app = createApp({ backend, initialState: 0 });

    app.view(() => ui.text("drop-safe"));

    await startAndResize(app, backend, 80, 24, 1);
    await settleNextFrame(backend);

    await pushEvents(backend, [{ kind: "resize", timeMs: 2, cols: 70, rows: 18 }], 3);

    assert.equal(backend.requestedFrames.length, 2);
    assert.equal(hasViewportClear(latestFrame(backend), { cols: 70, rows: 18 }), true);
    assert.equal(parseInternedStrings(latestFrame(backend)).includes("drop-safe"), true);
  });

  test("resize events can update app state and remain one-frame-per-resize", async () => {
    const backend = new StubBackend();
    const app = createApp({
      backend,
      initialState: { resizeCount: 0 },
    });

    app.onEvent((ev) => {
      if (ev.kind === "engine" && ev.event.kind === "resize") {
        app.update((prev) => ({ resizeCount: prev.resizeCount + 1 }));
      }
    });
    app.view((state) => ui.text(`resizes:${String(state.resizeCount)}`));

    await startAndResize(app, backend, 60, 20, 1);
    const firstStrings = parseInternedStrings(latestFrame(backend));
    assert.equal(firstStrings.includes("resizes:1"), true);
    await settleNextFrame(backend);

    await pushEvents(backend, [{ kind: "resize", timeMs: 2, cols: 70, rows: 20 }]);

    assert.equal(backend.requestedFrames.length, 2);
    assert.equal(hasViewportClear(latestFrame(backend), { cols: 70, rows: 20 }), true);
    const secondStrings = parseInternedStrings(latestFrame(backend));
    assert.equal(secondStrings.includes("resizes:2"), true);
  });

  test("very wide-short resize keeps fill and clip commands in viewport bounds", async () => {
    const backend = new StubBackend();
    const app = createApp({ backend, initialState: 0 });

    app.view(() =>
      ui.column({}, [ui.divider({ label: "wide" }), ui.text("row-a"), ui.text("row-b")]),
    );

    const viewport = { cols: 200, rows: 2 } as const;
    await startAndResize(app, backend, viewport.cols, viewport.rows, 1);

    const frame = latestFrame(backend);
    const fillRects = parseFillRects(frame);
    const clips = parsePushClips(frame);

    assert.equal(backend.requestedFrames.length, 1);
    assert.equal(parseOpcodes(frame).includes(OP_CLEAR), true);
    assert.equal(fillRects.length > 0, true);
    assertRectsInViewport(fillRects, viewport, "fillRect");
    assertRectsInViewport(clips, viewport, "clipRect");
  });

  test("tall-narrow resize keeps fill and clip commands in viewport bounds", async () => {
    const backend = new StubBackend();
    const app = createApp({ backend, initialState: 0 });

    app.view(() =>
      ui.column({}, [ui.text("narrow-layout"), ui.text("0123456789"), ui.text("abcdef")]),
    );

    const viewport = { cols: 6, rows: 40 } as const;
    await startAndResize(app, backend, viewport.cols, viewport.rows, 1);

    const frame = latestFrame(backend);
    const fillRects = parseFillRects(frame);
    const clips = parsePushClips(frame);
    const strings = parseInternedStrings(frame);

    assert.equal(backend.requestedFrames.length, 1);
    assert.equal(parseOpcodes(frame).includes(OP_CLEAR), true);
    assert.equal(fillRects.length > 0, true);
    assertRectsInViewport(fillRects, viewport, "fillRect");
    assertRectsInViewport(clips, viewport, "clipRect");
    assert.equal(
      strings.some((s) => s.includes("narrow-layout")),
      true,
    );
  });
});
