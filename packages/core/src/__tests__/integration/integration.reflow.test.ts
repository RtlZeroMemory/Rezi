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
type DrawTextCommand = Readonly<{ x: number; y: number; text: string }>;
type StringHeader = Readonly<{
  spanOffset: number;
  count: number;
  bytesOffset: number;
  bytesLen: number;
}>;

type TableRow = Readonly<{ id: string; name: string; score: number }>;
type TreeNode = Readonly<{ id: string; children: readonly TreeNode[] }>;

const OP_CLEAR = 1;
const OP_FILL_RECT = 2;
const OP_DRAW_TEXT = 3;
const OP_PUSH_CLIP = 4;

const DECODER = new TextDecoder();

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

  const out: string[] = [];
  for (let i = 0; i < count; i++) {
    const span = spanOffset + i * 8;
    const strOff = u32(bytes, span);
    const strLen = u32(bytes, span + 4);
    const start = bytesOffset + strOff;
    const end = start + strLen;
    assert.equal(end <= tableEnd, true, "string span must be in-bounds");
    out.push(DECODER.decode(bytes.subarray(start, end)));
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

function readStringHeader(bytes: Uint8Array): StringHeader {
  return {
    spanOffset: u32(bytes, 28),
    count: u32(bytes, 32),
    bytesOffset: u32(bytes, 36),
    bytesLen: u32(bytes, 40),
  };
}

function decodeStringSlice(
  bytes: Uint8Array,
  header: StringHeader,
  stringIndex: number,
  byteOff: number,
  byteLen: number,
): string {
  assert.equal(
    stringIndex >= 0 && stringIndex < header.count,
    true,
    "string index must be in-bounds",
  );
  const span = header.spanOffset + stringIndex * 8;
  const strOff = u32(bytes, span);
  const strLen = u32(bytes, span + 4);
  assert.equal(byteOff + byteLen <= strLen, true, "string slice must be in-bounds");
  const start = header.bytesOffset + strOff + byteOff;
  const end = start + byteLen;
  return DECODER.decode(bytes.subarray(start, end));
}

function parseDrawTexts(bytes: Uint8Array): readonly DrawTextCommand[] {
  const header = readStringHeader(bytes);
  const cmdOffset = u32(bytes, 16);
  const cmdBytes = u32(bytes, 20);
  const cmdEnd = cmdOffset + cmdBytes;

  const out: DrawTextCommand[] = [];
  let off = cmdOffset;
  while (off < cmdEnd) {
    const opcode = u16(bytes, off);
    const size = u32(bytes, off + 4);
    assert.equal(size >= 8, true, "command size must be >= 8");
    if (opcode === OP_DRAW_TEXT && size >= 48) {
      const stringIndex = u32(bytes, off + 16);
      const byteOff = u32(bytes, off + 20);
      const byteLen = u32(bytes, off + 24);
      out.push({
        x: i32(bytes, off + 8),
        y: i32(bytes, off + 12),
        text: decodeStringSlice(bytes, header, stringIndex, byteOff, byteLen),
      });
    }
    off += size;
  }
  assert.equal(off, cmdEnd, "commands must parse exactly to cmd end");
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

function firstTextPositionContaining(
  commands: readonly DrawTextCommand[],
  fragment: string,
): Readonly<{ x: number; y: number }> | null {
  for (const command of commands) {
    if (command.text.includes(fragment)) return { x: command.x, y: command.y };
  }
  return null;
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

function assertTextCommandsInViewport(
  commands: readonly DrawTextCommand[],
  viewport: Viewport,
  label: string,
): void {
  let index = 0;
  for (const command of commands) {
    assert.equal(command.x >= 0, true, `${label}[${String(index)}] x >= 0`);
    assert.equal(command.y >= 0, true, `${label}[${String(index)}] y >= 0`);
    assert.equal(command.x < viewport.cols, true, `${label}[${String(index)}] x < cols`);
    assert.equal(command.y < viewport.rows, true, `${label}[${String(index)}] y < rows`);
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

async function pushEvents(backend: StubBackend, events: readonly EncodedEvent[]): Promise<void> {
  backend.pushBatch(
    makeBackendBatch({
      bytes: encodeZrevBatchV1({ events }),
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

describe("integration reflow behavior", () => {
  test("table sort relayout flips sort indicator from asc to desc", async () => {
    const backend = new StubBackend();
    const rows: readonly TableRow[] = [
      { id: "r1", name: "Alpha", score: 7 },
      { id: "r2", name: "Bravo", score: 2 },
    ];
    const app = createApp({
      backend,
      initialState: { direction: "asc" as "asc" | "desc" },
    });

    app.view((state) =>
      ui.table({
        id: "tbl-sort-direction",
        columns: [
          { key: "name", header: "Name", width: 14, sortable: true },
          { key: "score", header: "Score", width: 8, sortable: true, align: "right" },
        ],
        data: rows,
        getRowKey: (row: TableRow) => row.id,
        sortColumn: "name",
        sortDirection: state.direction,
        border: "single",
      }),
    );

    await startAndResize(app, backend, 72, 18, 1);
    const firstFrame = latestFrame(backend).slice();
    const firstStrings = parseInternedStrings(firstFrame);
    assert.equal(
      firstStrings.some((s) => s.includes("Name")),
      true,
    );
    assert.equal(countOpcode(parseOpcodes(firstFrame), OP_DRAW_TEXT) > 0, true);

    await settleNextFrame(backend);
    app.update((prev) => ({ direction: prev.direction === "asc" ? "desc" : "asc" }));
    await flushMicrotasks(20);

    assert.equal(backend.requestedFrames.length, 2);
    const secondFrame = latestFrame(backend).slice();
    assert.equal(parseInternedStrings(secondFrame).length > 0, true);
    assert.equal(bytesEqual(firstFrame, secondFrame), false);
  });

  test("table sort relayout moves indicator when sorted column changes", async () => {
    const backend = new StubBackend();
    const rows: readonly TableRow[] = [
      { id: "r1", name: "Alpha", score: 7 },
      { id: "r2", name: "Bravo", score: 2 },
    ];
    const app = createApp({
      backend,
      initialState: { sortColumn: "name" as "name" | "score" },
    });

    app.view((state) =>
      ui.table({
        id: "tbl-sort-column",
        columns: [
          { key: "name", header: "Name", width: 14, sortable: true },
          { key: "score", header: "Score", width: 8, sortable: true, align: "right" },
        ],
        data: rows,
        getRowKey: (row: TableRow) => row.id,
        sortColumn: state.sortColumn,
        sortDirection: "asc",
        border: "single",
      }),
    );

    await startAndResize(app, backend, 72, 18, 1);
    const firstFrame = latestFrame(backend).slice();
    const firstArrowPos = firstTextPositionContaining(parseDrawTexts(firstFrame), "▲");
    assert.ok(firstArrowPos, "first sort indicator position should exist");

    await settleNextFrame(backend);
    app.update((prev) => ({ sortColumn: prev.sortColumn === "name" ? "score" : "name" }));
    await flushMicrotasks(20);

    assert.equal(backend.requestedFrames.length, 2);
    const secondFrame = latestFrame(backend).slice();
    const secondArrowPos = firstTextPositionContaining(parseDrawTexts(secondFrame), "▲");
    assert.ok(secondArrowPos, "second sort indicator position should exist");
    assert.equal(bytesEqual(firstFrame, secondFrame), false);
    assert.equal(
      firstArrowPos?.x === secondArrowPos?.x && firstArrowPos?.y === secondArrowPos?.y,
      false,
    );
  });

  test("tree expand relayout reveals child nodes and increases text draw calls", async () => {
    const backend = new StubBackend();
    const data: TreeNode = {
      id: "root",
      children: [
        { id: "child-a", children: [] },
        { id: "child-b", children: [] },
      ],
    };
    const app = createApp({
      backend,
      initialState: { expanded: [] as readonly string[] },
    });

    app.view((state) =>
      ui.tree({
        id: "tree-expand",
        data,
        getKey: (node: TreeNode) => node.id,
        getChildren: (node: TreeNode) => node.children,
        expanded: state.expanded,
        onToggle: (_node: TreeNode, _expanded: boolean) => {},
        renderNode: (node: TreeNode) => ui.text(node.id),
      }),
    );

    await startAndResize(app, backend, 60, 16, 1);
    const firstFrame = latestFrame(backend).slice();
    const firstStrings = parseInternedStrings(firstFrame);
    const firstDrawTextCount = countOpcode(parseOpcodes(firstFrame), OP_DRAW_TEXT);
    assert.equal(firstStrings.includes("child-a"), false);

    await settleNextFrame(backend);
    app.update(() => ({ expanded: ["root"] }));
    await flushMicrotasks(20);

    assert.equal(backend.requestedFrames.length, 2);
    const secondFrame = latestFrame(backend).slice();
    const secondStrings = parseInternedStrings(secondFrame);
    const secondDrawTextCount = countOpcode(parseOpcodes(secondFrame), OP_DRAW_TEXT);

    assert.equal(secondStrings.includes("child-a"), true);
    assert.equal(secondStrings.includes("child-b"), true);
    assert.equal(secondDrawTextCount > firstDrawTextCount, true);
  });

  test("tree collapse relayout removes child nodes from rendered strings", async () => {
    const backend = new StubBackend();
    const data: TreeNode = {
      id: "root",
      children: [
        { id: "child-a", children: [] },
        { id: "child-b", children: [] },
      ],
    };
    const app = createApp({
      backend,
      initialState: { expanded: ["root"] as readonly string[] },
    });

    app.view((state) =>
      ui.tree({
        id: "tree-collapse",
        data,
        getKey: (node: TreeNode) => node.id,
        getChildren: (node: TreeNode) => node.children,
        expanded: state.expanded,
        onToggle: (_node: TreeNode, _expanded: boolean) => {},
        renderNode: (node: TreeNode) => ui.text(node.id),
      }),
    );

    await startAndResize(app, backend, 60, 16, 1);
    const firstStrings = parseInternedStrings(latestFrame(backend));
    assert.equal(firstStrings.includes("child-a"), true);

    await settleNextFrame(backend);
    app.update(() => ({ expanded: [] }));
    await flushMicrotasks(20);

    assert.equal(backend.requestedFrames.length, 2);
    const secondStrings = parseInternedStrings(latestFrame(backend));
    assert.equal(secondStrings.includes("child-a"), false);
    assert.equal(secondStrings.includes("child-b"), false);
  });

  test("modal overlay placement stays inside viewport at 80x24", async () => {
    const backend = new StubBackend();
    const app = createApp({ backend, initialState: 0 });

    app.view(() =>
      ui.layers({}, [
        ui.text("base"),
        ui.modal({
          id: "confirm-modal",
          title: "Confirm",
          content: ui.text("Proceed?"),
          actions: [ui.button({ id: "ok", label: "OK" })],
          width: 30,
        }),
      ]),
    );

    const viewport = { cols: 80, rows: 24 } as const;
    await startAndResize(app, backend, viewport.cols, viewport.rows, 1);

    const frame = latestFrame(backend);
    const fillRects = parseFillRects(frame);
    const clips = parsePushClips(frame);
    const texts = parseDrawTexts(frame);
    const strings = parseInternedStrings(frame);

    assert.equal(backend.requestedFrames.length, 1);
    assert.equal(parseOpcodes(frame).includes(OP_FILL_RECT), true);
    assert.equal(strings.includes("Confirm"), true);
    assert.equal(strings.includes("Proceed?"), true);
    assertRectsInViewport(fillRects, viewport, "fillRect");
    assertRectsInViewport(clips, viewport, "clipRect");
    assertTextCommandsInViewport(texts, viewport, "drawText");
  });

  test("modal overlay reflows on resize and title position changes", async () => {
    const backend = new StubBackend();
    const app = createApp({ backend, initialState: 0 });

    app.view(() =>
      ui.layers({}, [
        ui.text("base"),
        ui.modal({
          id: "confirm-modal-resize",
          title: "Confirm",
          content: ui.text("Proceed?"),
          actions: [ui.button({ id: "ok2", label: "OK" })],
          width: 32,
        }),
      ]),
    );

    await startAndResize(app, backend, 80, 24, 1);
    const firstFrame = latestFrame(backend).slice();
    const firstTitlePos = firstTextPositionContaining(parseDrawTexts(firstFrame), "Confirm");
    assert.ok(firstTitlePos, "first title position should exist");

    await settleNextFrame(backend);
    await pushEvents(backend, [{ kind: "resize", timeMs: 2, cols: 40, rows: 12 }]);

    assert.equal(backend.requestedFrames.length, 2);
    const secondFrame = latestFrame(backend).slice();
    const secondTitlePos = firstTextPositionContaining(parseDrawTexts(secondFrame), "Confirm");
    assert.ok(secondTitlePos, "second title position should exist");
    assert.equal(hasViewportClear(secondFrame, { cols: 40, rows: 12 }), true);
    assertRectsInViewport(parseFillRects(secondFrame), { cols: 40, rows: 12 }, "fillRect");
    assertRectsInViewport(parsePushClips(secondFrame), { cols: 40, rows: 12 }, "clipRect");
    assert.equal(
      firstTitlePos?.x === secondTitlePos?.x && firstTitlePos?.y === secondTitlePos?.y,
      false,
    );
  });

  test("toast viewport non-overflow holds at bottom-right in small viewport", async () => {
    const backend = new StubBackend();
    const app = createApp({ backend, initialState: 0 });

    app.view(() =>
      ui.toastContainer({
        toasts: [
          {
            id: "toast-a",
            message: "toast-A-very-long-message-for-viewport",
            type: "warning",
            action: { label: "Fix", onAction: () => {} },
          },
        ],
        position: "bottom-right",
        maxVisible: 1,
        onDismiss: (_id: string) => {},
      }),
    );

    const viewport = { cols: 40, rows: 10 } as const;
    await startAndResize(app, backend, viewport.cols, viewport.rows, 1);

    const frame = latestFrame(backend);
    const strings = parseInternedStrings(frame);
    assert.equal(backend.requestedFrames.length, 1);
    assert.equal(
      strings.some((s) => s.includes("toast-A")),
      true,
    );
    assertRectsInViewport(parseFillRects(frame), viewport, "fillRect");
    assertRectsInViewport(parsePushClips(frame), viewport, "clipRect");
    assertTextCommandsInViewport(parseDrawTexts(frame), viewport, "drawText");
  });

  test("toast reflow after resize keeps text and rect commands in bounds", async () => {
    const backend = new StubBackend();
    const app = createApp({ backend, initialState: 0 });

    app.view(() =>
      ui.toastContainer({
        toasts: [
          { id: "toast-b", message: "toast-B", type: "info" },
          { id: "toast-c", message: "toast-C", type: "success" },
        ],
        position: "top-left",
        maxVisible: 2,
        onDismiss: (_id: string) => {},
      }),
    );

    await startAndResize(app, backend, 70, 20, 1);
    await settleNextFrame(backend);
    await pushEvents(backend, [{ kind: "resize", timeMs: 2, cols: 28, rows: 8 }]);

    assert.equal(backend.requestedFrames.length, 2);
    const frame = latestFrame(backend);
    const strings = parseInternedStrings(frame);

    assert.equal(hasViewportClear(frame, { cols: 28, rows: 8 }), true);
    assert.equal(strings.includes("toast-B"), true);
    assertRectsInViewport(parseFillRects(frame), { cols: 28, rows: 8 }, "fillRect");
    assertRectsInViewport(parsePushClips(frame), { cols: 28, rows: 8 }, "clipRect");
    assertTextCommandsInViewport(parseDrawTexts(frame), { cols: 28, rows: 8 }, "drawText");
  });

  test("toast maxVisible limits rendered messages deterministically", async () => {
    const backend = new StubBackend();
    const app = createApp({ backend, initialState: 0 });

    app.view(() =>
      ui.toastContainer({
        toasts: [
          { id: "t0", message: "first-visible", type: "info" },
          { id: "t1", message: "second-visible", type: "success" },
          { id: "t2", message: "third-hidden", type: "warning" },
        ],
        position: "top-left",
        maxVisible: 2,
        onDismiss: (_id: string) => {},
      }),
    );

    await startAndResize(app, backend, 50, 15, 1);

    const frame = latestFrame(backend);
    const strings = parseInternedStrings(frame);
    assert.equal(backend.requestedFrames.length, 1);
    assert.equal(strings.includes("first-visible"), true);
    assert.equal(strings.includes("second-visible"), true);
    assert.equal(strings.includes("third-hidden"), false);
    assert.equal(countOpcode(parseOpcodes(frame), OP_FILL_RECT) > 0, true);
  });

  test("dynamic content growth reflow increases draw text command count", async () => {
    const backend = new StubBackend();
    const app = createApp({
      backend,
      initialState: { lines: 2 },
    });

    app.view((state) =>
      ui.column(
        {},
        Array.from({ length: state.lines }, (_unused, index) => ui.text(`line-${String(index)}`)),
      ),
    );

    await startAndResize(app, backend, 40, 20, 1);
    const firstFrame = latestFrame(backend).slice();
    const firstDrawTextCount = countOpcode(parseOpcodes(firstFrame), OP_DRAW_TEXT);

    await settleNextFrame(backend);
    app.update(() => ({ lines: 7 }));
    await flushMicrotasks(20);

    assert.equal(backend.requestedFrames.length, 2);
    const secondFrame = latestFrame(backend).slice();
    const secondDrawTextCount = countOpcode(parseOpcodes(secondFrame), OP_DRAW_TEXT);
    const secondStrings = parseInternedStrings(secondFrame);

    assert.equal(secondDrawTextCount > firstDrawTextCount, true);
    assert.equal(secondStrings.includes("line-6"), true);
  });

  test("dynamic content shrink reflow decreases draw text command count", async () => {
    const backend = new StubBackend();
    const app = createApp({
      backend,
      initialState: { lines: 8 },
    });

    app.view((state) =>
      ui.column(
        {},
        Array.from({ length: state.lines }, (_unused, index) => ui.text(`line-${String(index)}`)),
      ),
    );

    await startAndResize(app, backend, 40, 20, 1);
    const firstFrame = latestFrame(backend).slice();
    const firstDrawTextCount = countOpcode(parseOpcodes(firstFrame), OP_DRAW_TEXT);

    await settleNextFrame(backend);
    app.update(() => ({ lines: 3 }));
    await flushMicrotasks(20);

    assert.equal(backend.requestedFrames.length, 2);
    const secondFrame = latestFrame(backend).slice();
    const secondDrawTextCount = countOpcode(parseOpcodes(secondFrame), OP_DRAW_TEXT);
    const secondStrings = parseInternedStrings(secondFrame);

    assert.equal(secondDrawTextCount < firstDrawTextCount, true);
    assert.equal(secondStrings.includes("line-2"), true);
    assert.equal(secondStrings.includes("line-7"), false);
  });
});
