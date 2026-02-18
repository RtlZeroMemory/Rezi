import { assert, describe, test } from "@rezi-ui/testkit";
import { type VNode, createDrawlistBuilderV1 } from "../../index.js";
import { layout } from "../../layout/layout.js";
import { commitVNodeTree } from "../../runtime/commit.js";
import { createInstanceIdAllocator } from "../../runtime/instance.js";
import { renderToDrawlist } from "../renderToDrawlist.js";

const OP_DRAW_TEXT = 3;
const OP_PUSH_CLIP = 4;
const OP_POP_CLIP = 5;
const OP_DRAW_TEXT_RUN = 6;

const decoder = new TextDecoder();

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

type Header = Readonly<{
  cmdOffset: number;
  cmdBytes: number;
  stringsSpanOffset: number;
  stringsCount: number;
  stringsBytesOffset: number;
  stringsBytesLen: number;
  blobsSpanOffset: number;
  blobsCount: number;
  blobsBytesOffset: number;
  blobsBytesLen: number;
}>;

type DrawTextCommand = Readonly<{
  x: number;
  y: number;
  stringIndex: number;
  byteOff: number;
  byteLen: number;
  text: string;
  fg: number;
  bg: number;
  attrs: number;
}>;

type DrawTextRunCommand = Readonly<{
  x: number;
  y: number;
  blobIndex: number;
}>;

type PushClipCommand = Readonly<{
  x: number;
  y: number;
  w: number;
  h: number;
}>;

type TextRunSegment = Readonly<{
  fg: number;
  bg: number;
  attrs: number;
  stringIndex: number;
  byteOff: number;
  byteLen: number;
  text: string;
}>;

type TextRunBlob = Readonly<{
  segments: readonly TextRunSegment[];
}>;

type ParsedFrame = Readonly<{
  strings: readonly string[];
  drawTexts: readonly DrawTextCommand[];
  drawTextRuns: readonly DrawTextRunCommand[];
  pushClips: readonly PushClipCommand[];
  popClipCount: number;
  textRunBlobs: readonly TextRunBlob[];
}>;

function readHeader(bytes: Uint8Array): Header {
  return {
    cmdOffset: u32(bytes, 16),
    cmdBytes: u32(bytes, 20),
    stringsSpanOffset: u32(bytes, 28),
    stringsCount: u32(bytes, 32),
    stringsBytesOffset: u32(bytes, 36),
    stringsBytesLen: u32(bytes, 40),
    blobsSpanOffset: u32(bytes, 44),
    blobsCount: u32(bytes, 48),
    blobsBytesOffset: u32(bytes, 52),
    blobsBytesLen: u32(bytes, 56),
  };
}

function parseInternedStrings(bytes: Uint8Array, header: Header): readonly string[] {
  if (header.stringsCount === 0) return Object.freeze([]);

  const tableEnd = header.stringsBytesOffset + header.stringsBytesLen;
  assert.ok(tableEnd <= bytes.byteLength, "string table must be in-bounds");

  const out: string[] = [];
  for (let i = 0; i < header.stringsCount; i++) {
    const span = header.stringsSpanOffset + i * 8;
    const off = u32(bytes, span);
    const len = u32(bytes, span + 4);

    const start = header.stringsBytesOffset + off;
    const end = start + len;
    assert.ok(end <= tableEnd, "string span must be in-bounds");
    out.push(decoder.decode(bytes.subarray(start, end)));
  }

  return Object.freeze(out);
}

function decodeStringSlice(
  bytes: Uint8Array,
  header: Header,
  stringIndex: number,
  byteOff: number,
  byteLen: number,
): string {
  assert.ok(stringIndex >= 0 && stringIndex < header.stringsCount, "string index in bounds");

  const span = header.stringsSpanOffset + stringIndex * 8;
  const strOff = u32(bytes, span);
  const strLen = u32(bytes, span + 4);
  assert.ok(byteOff + byteLen <= strLen, "string slice must be in-bounds");

  const start = header.stringsBytesOffset + strOff + byteOff;
  const end = start + byteLen;
  return decoder.decode(bytes.subarray(start, end));
}

function parseTextRunBlobs(bytes: Uint8Array, header: Header): readonly TextRunBlob[] {
  if (header.blobsCount === 0) return Object.freeze([]);

  const blobsEnd = header.blobsBytesOffset + header.blobsBytesLen;
  assert.ok(blobsEnd <= bytes.byteLength, "blob table must be in-bounds");

  const out: TextRunBlob[] = [];
  for (let i = 0; i < header.blobsCount; i++) {
    const span = header.blobsSpanOffset + i * 8;
    const blobOff = header.blobsBytesOffset + u32(bytes, span);
    const blobLen = u32(bytes, span + 4);
    const blobEnd = blobOff + blobLen;
    assert.ok(blobEnd <= blobsEnd, "blob span must be in-bounds");

    const segCount = u32(bytes, blobOff);
    const segments: TextRunSegment[] = [];

    let segOff = blobOff + 4;
    for (let seg = 0; seg < segCount; seg++) {
      assert.ok(segOff + 28 <= blobEnd, "text run segment must be in-bounds");
      const stringIndex = u32(bytes, segOff + 16);
      const byteOff = u32(bytes, segOff + 20);
      const byteLen = u32(bytes, segOff + 24);

      segments.push({
        fg: u32(bytes, segOff + 0),
        bg: u32(bytes, segOff + 4),
        attrs: u32(bytes, segOff + 8),
        stringIndex,
        byteOff,
        byteLen,
        text: decodeStringSlice(bytes, header, stringIndex, byteOff, byteLen),
      });

      segOff += 28;
    }

    out.push({ segments: Object.freeze(segments) });
  }

  return Object.freeze(out);
}

function parseFrame(bytes: Uint8Array): ParsedFrame {
  const header = readHeader(bytes);
  const strings = parseInternedStrings(bytes, header);
  const textRunBlobs = parseTextRunBlobs(bytes, header);

  const drawTexts: DrawTextCommand[] = [];
  const drawTextRuns: DrawTextRunCommand[] = [];
  const pushClips: PushClipCommand[] = [];
  let popClipCount = 0;

  const cmdEnd = header.cmdOffset + header.cmdBytes;
  let off = header.cmdOffset;

  while (off < cmdEnd) {
    const opcode = u16(bytes, off);
    const size = u32(bytes, off + 4);
    assert.ok(size >= 8, "command size must be >= 8");

    if (opcode === OP_DRAW_TEXT) {
      assert.ok(size >= 48, "DRAW_TEXT command size");
      const stringIndex = u32(bytes, off + 16);
      const byteOff = u32(bytes, off + 20);
      const byteLen = u32(bytes, off + 24);
      drawTexts.push({
        x: i32(bytes, off + 8),
        y: i32(bytes, off + 12),
        stringIndex,
        byteOff,
        byteLen,
        text: decodeStringSlice(bytes, header, stringIndex, byteOff, byteLen),
        fg: u32(bytes, off + 28),
        bg: u32(bytes, off + 32),
        attrs: u32(bytes, off + 36),
      });
    } else if (opcode === OP_DRAW_TEXT_RUN) {
      assert.ok(size >= 24, "DRAW_TEXT_RUN command size");
      drawTextRuns.push({
        x: i32(bytes, off + 8),
        y: i32(bytes, off + 12),
        blobIndex: u32(bytes, off + 16),
      });
    } else if (opcode === OP_PUSH_CLIP) {
      assert.ok(size >= 24, "PUSH_CLIP command size");
      pushClips.push({
        x: i32(bytes, off + 8),
        y: i32(bytes, off + 12),
        w: i32(bytes, off + 16),
        h: i32(bytes, off + 20),
      });
    } else if (opcode === OP_POP_CLIP) {
      popClipCount++;
    }

    off += size;
  }

  assert.equal(off, cmdEnd, "commands must parse exactly to cmd end");

  return {
    strings,
    drawTexts: Object.freeze(drawTexts),
    drawTextRuns: Object.freeze(drawTextRuns),
    pushClips: Object.freeze(pushClips),
    popClipCount,
    textRunBlobs,
  };
}

function commitTree(vnode: VNode) {
  const allocator = createInstanceIdAllocator(1);
  const committed = commitVNodeTree(null, vnode, { allocator });
  assert.equal(committed.ok, true, "commit should succeed");
  if (!committed.ok) {
    assert.fail("commit should succeed");
  }
  return committed.value.root;
}

function renderBytes(
  vnode: VNode,
  viewport: Readonly<{ cols: number; rows: number }> = { cols: 40, rows: 4 },
): Uint8Array {
  const committed = commitTree(vnode);
  const layoutRes = layout(committed.vnode, 0, 0, viewport.cols, viewport.rows, "column");
  assert.equal(layoutRes.ok, true, "layout should succeed");
  if (!layoutRes.ok) {
    assert.fail("layout should succeed");
  }

  const builder = createDrawlistBuilderV1();
  renderToDrawlist({
    tree: committed,
    layout: layoutRes.value,
    viewport,
    focusState: Object.freeze({ focusedId: null }),
    builder,
  });

  const built = builder.build();
  assert.equal(built.ok, true, "drawlist build should succeed");
  if (!built.ok) {
    assert.fail("drawlist build should succeed");
  }
  return built.bytes;
}

function textVNode(text: string, props: Readonly<Record<string, unknown>> = {}): VNode {
  return { kind: "text", text, props } as VNode;
}

function richTextVNode(
  spans: readonly Readonly<{ text: string; style?: Readonly<Record<string, unknown>> }>[],
): VNode {
  return {
    kind: "richText",
    props: { spans },
  } as VNode;
}

function expectSingleDrawText(frame: ParsedFrame): DrawTextCommand {
  assert.equal(frame.drawTexts.length, 1, "expected one DRAW_TEXT command");
  const cmd = frame.drawTexts[0];
  assert.ok(cmd !== undefined, "DRAW_TEXT command must exist");
  return cmd;
}

function expectSingleDrawTextRun(frame: ParsedFrame): DrawTextRunCommand {
  assert.equal(frame.drawTextRuns.length, 1, "expected one DRAW_TEXT_RUN command");
  const cmd = frame.drawTextRuns[0];
  assert.ok(cmd !== undefined, "DRAW_TEXT_RUN command must exist");
  return cmd;
}

function expectBlob(frame: ParsedFrame, blobIndex: number): TextRunBlob {
  const blob = frame.textRunBlobs[blobIndex];
  assert.ok(blob !== undefined, "text run blob must exist");
  return blob;
}

describe("renderer text - CJK cell width and positioning", () => {
  test("cjk text fits exactly at width boundary", () => {
    const frame = parseFrame(
      renderBytes(textVNode("漢字", { textOverflow: "ellipsis", maxWidth: 4 }), {
        cols: 20,
        rows: 1,
      }),
    );

    const draw = expectSingleDrawText(frame);
    assert.equal(draw.text, "漢字");
    assert.equal(frame.drawTextRuns.length, 0);
    assert.equal(frame.pushClips.length, 0);
  });

  test("cjk ellipsis boundary width=3 keeps one ideograph", () => {
    const frame = parseFrame(
      renderBytes(textVNode("漢字", { textOverflow: "ellipsis", maxWidth: 3 }), {
        cols: 20,
        rows: 1,
      }),
    );

    assert.equal(expectSingleDrawText(frame).text, "漢…");
  });

  test("cjk ellipsis boundary width=2 emits ellipsis only", () => {
    const frame = parseFrame(
      renderBytes(textVNode("漢字", { textOverflow: "ellipsis", maxWidth: 2 }), {
        cols: 20,
        rows: 1,
      }),
    );

    assert.equal(expectSingleDrawText(frame).text, "…");
  });

  test("cjk clip mode keeps full string and emits clip commands", () => {
    const frame = parseFrame(
      renderBytes(textVNode("漢字", { maxWidth: 3 }), { cols: 20, rows: 1 }),
    );

    assert.equal(expectSingleDrawText(frame).text, "漢字");
    assert.equal(frame.pushClips.length, 1);
    assert.equal(frame.popClipCount, 1);
    const clip = frame.pushClips[0];
    assert.ok(clip !== undefined);
    assert.equal(clip.w, 3);
  });

  test("richText cjk+ascii emits DRAW_TEXT_RUN when both spans fit", () => {
    const frame = parseFrame(
      renderBytes(
        richTextVNode([
          { text: "漢", style: { bold: true } },
          { text: "A", style: { underline: true } },
        ]),
        { cols: 3, rows: 1 },
      ),
    );

    assert.equal(frame.drawTexts.length, 0);
    const run = expectSingleDrawTextRun(frame);
    const blob = expectBlob(frame, run.blobIndex);

    assert.equal(blob.segments.length, 2);
    const s0 = blob.segments[0];
    const s1 = blob.segments[1];
    assert.ok(s0 !== undefined);
    assert.ok(s1 !== undefined);
    assert.equal(s0.text, "漢");
    assert.equal(s0.attrs, 1);
    assert.equal(s1.text, "A");
    assert.equal(s1.attrs, 1 << 2);
  });

  test("richText cjk boundary width=2 clips to first span and uses DRAW_TEXT", () => {
    const frame = parseFrame(
      renderBytes(
        richTextVNode([
          { text: "漢", style: { bold: true } },
          { text: "A", style: { underline: true } },
        ]),
        { cols: 2, rows: 1 },
      ),
    );

    assert.equal(frame.drawTextRuns.length, 0);
    const draw = expectSingleDrawText(frame);
    assert.equal(draw.text, "漢");
    assert.equal(draw.attrs, 1);
  });

  test("richText cjk boundary inside second span inserts ellipsis with second style", () => {
    const frame = parseFrame(
      renderBytes(
        richTextVNode([
          { text: "漢", style: { bold: true } },
          { text: "BC", style: { underline: true } },
        ]),
        { cols: 3, rows: 1 },
      ),
    );

    const run = expectSingleDrawTextRun(frame);
    const blob = expectBlob(frame, run.blobIndex);
    const s0 = blob.segments[0];
    const s1 = blob.segments[1];
    assert.ok(s0 !== undefined);
    assert.ok(s1 !== undefined);
    assert.equal(s0.text, "漢");
    assert.equal(s0.attrs, 1);
    assert.equal(s1.text, "…");
    assert.equal(s1.attrs, 1 << 2);
    assert.equal(frame.strings.includes("BC"), false);
  });
});

describe("renderer text - emoji multi-codepoint allocation", () => {
  const family = "👨‍👩‍👧‍👦";

  test("emoji grapheme fits exactly into width=2", () => {
    const frame = parseFrame(
      renderBytes(textVNode(family, { textOverflow: "ellipsis", maxWidth: 2 }), {
        cols: 20,
        rows: 1,
      }),
    );

    assert.equal(expectSingleDrawText(frame).text, family);
  });

  test("emoji grapheme plus ascii truncates to ellipsis at width=2", () => {
    const frame = parseFrame(
      renderBytes(textVNode(`${family}Z`, { textOverflow: "ellipsis", maxWidth: 2 }), {
        cols: 20,
        rows: 1,
      }),
    );

    assert.equal(expectSingleDrawText(frame).text, "…");
  });

  test("emoji grapheme plus ascii fits at width=3", () => {
    const frame = parseFrame(
      renderBytes(textVNode(`${family}Z`, { textOverflow: "ellipsis", maxWidth: 3 }), {
        cols: 20,
        rows: 1,
      }),
    );

    assert.equal(expectSingleDrawText(frame).text, `${family}Z`);
  });

  test("richText emoji+ascii width=2 collapses to one DRAW_TEXT segment", () => {
    const frame = parseFrame(
      renderBytes(
        richTextVNode([
          { text: family, style: { bold: true } },
          { text: "Z", style: { underline: true } },
        ]),
        { cols: 2, rows: 1 },
      ),
    );

    assert.equal(frame.drawTextRuns.length, 0);
    const draw = expectSingleDrawText(frame);
    assert.equal(draw.text, family);
    assert.equal(draw.attrs, 1);
    assert.equal(frame.strings.includes("Z"), false);
  });

  test("richText emoji+ascii width=3 uses DRAW_TEXT_RUN with two segments", () => {
    const frame = parseFrame(
      renderBytes(
        richTextVNode([
          { text: family, style: { bold: true } },
          { text: "Z", style: { underline: true } },
        ]),
        { cols: 3, rows: 1 },
      ),
    );

    const run = expectSingleDrawTextRun(frame);
    const blob = expectBlob(frame, run.blobIndex);
    assert.equal(blob.segments.length, 2);

    const s0 = blob.segments[0];
    const s1 = blob.segments[1];
    assert.ok(s0 !== undefined);
    assert.ok(s1 !== undefined);
    assert.equal(s0.text, family);
    assert.equal(s1.text, "Z");
    assert.equal(s0.attrs, 1);
    assert.equal(s1.attrs, 1 << 2);
  });

  test("emoji blob segment stores full multi-codepoint UTF-8 length", () => {
    const frame = parseFrame(
      renderBytes(
        richTextVNode([
          { text: family, style: { bold: true } },
          { text: "Z", style: { underline: true } },
        ]),
        { cols: 3, rows: 1 },
      ),
    );

    const run = expectSingleDrawTextRun(frame);
    const blob = expectBlob(frame, run.blobIndex);
    const s0 = blob.segments[0];
    const s1 = blob.segments[1];
    assert.ok(s0 !== undefined);
    assert.ok(s1 !== undefined);

    const expectedEmojiBytes = new TextEncoder().encode(family).length;
    assert.equal(s0.byteLen, expectedEmojiBytes);
    assert.equal(s0.byteLen > s1.byteLen, true);
    assert.equal(s1.byteLen, 1);
  });
});

describe("renderer text - truncation boundaries", () => {
  test("ellipsis exact boundary keeps full ascii text", () => {
    const frame = parseFrame(
      renderBytes(textVNode("abcd", { textOverflow: "ellipsis", maxWidth: 4 }), {
        cols: 20,
        rows: 1,
      }),
    );
    assert.equal(expectSingleDrawText(frame).text, "abcd");
  });

  test("ellipsis width=3 keeps two chars", () => {
    const frame = parseFrame(
      renderBytes(textVNode("abcd", { textOverflow: "ellipsis", maxWidth: 3 }), {
        cols: 20,
        rows: 1,
      }),
    );
    assert.equal(expectSingleDrawText(frame).text, "ab…");
  });

  test("ellipsis width=2 keeps one char", () => {
    const frame = parseFrame(
      renderBytes(textVNode("abcd", { textOverflow: "ellipsis", maxWidth: 2 }), {
        cols: 20,
        rows: 1,
      }),
    );
    assert.equal(expectSingleDrawText(frame).text, "a…");
  });

  test("ellipsis width=1 is only ellipsis", () => {
    const frame = parseFrame(
      renderBytes(textVNode("abcd", { textOverflow: "ellipsis", maxWidth: 1 }), {
        cols: 20,
        rows: 1,
      }),
    );
    assert.equal(expectSingleDrawText(frame).text, "…");
  });

  test("ellipsis width=0 produces no text command", () => {
    const frame = parseFrame(
      renderBytes(textVNode("abcd", { textOverflow: "ellipsis", maxWidth: 0 }), {
        cols: 20,
        rows: 1,
      }),
    );
    assert.equal(frame.drawTexts.length, 0);
    assert.equal(frame.drawTextRuns.length, 0);
    assert.equal(frame.strings.length, 0);
  });

  test("middle truncation width=5 keeps both edges", () => {
    const frame = parseFrame(
      renderBytes(textVNode("abcdef", { textOverflow: "middle", maxWidth: 5 }), {
        cols: 20,
        rows: 1,
      }),
    );
    assert.equal(expectSingleDrawText(frame).text, "ab…ef");
  });

  test("middle truncation width<=3 falls back to ellipsis policy", () => {
    const frame = parseFrame(
      renderBytes(textVNode("abcdef", { textOverflow: "middle", maxWidth: 3 }), {
        cols: 20,
        rows: 1,
      }),
    );
    assert.equal(expectSingleDrawText(frame).text, "ab…");
  });

  test("text longer than viewport width uses clip and keeps full source string", () => {
    const source = "0123456789";
    const frame = parseFrame(renderBytes(textVNode(source), { cols: 5, rows: 1 }));

    assert.equal(expectSingleDrawText(frame).text, source);
    assert.equal(frame.pushClips.length, 1);
    assert.equal(frame.popClipCount, 1);
    const clip = frame.pushClips[0];
    assert.ok(clip !== undefined);
    assert.equal(clip.w, 5);
  });
});

describe("renderer text - richText span style transitions", () => {
  test("three-span richText emits deterministic style attrs in order", () => {
    const frame = parseFrame(
      renderBytes(
        richTextVNode([
          { text: "A", style: { bold: true } },
          { text: "B", style: { underline: true } },
          { text: "C", style: { dim: true } },
        ]),
        { cols: 3, rows: 1 },
      ),
    );

    const run = expectSingleDrawTextRun(frame);
    const blob = expectBlob(frame, run.blobIndex);
    assert.equal(blob.segments.length, 3);

    const s0 = blob.segments[0];
    const s1 = blob.segments[1];
    const s2 = blob.segments[2];
    assert.ok(s0 !== undefined);
    assert.ok(s1 !== undefined);
    assert.ok(s2 !== undefined);

    assert.equal(s0.text, "A");
    assert.equal(s1.text, "B");
    assert.equal(s2.text, "C");
    assert.equal(s0.attrs, 1);
    assert.equal(s1.attrs, 1 << 2);
    assert.equal(s2.attrs, 1 << 4);
  });

  test("empty spans are skipped without creating style transitions", () => {
    const frame = parseFrame(
      renderBytes(
        richTextVNode([
          { text: "A", style: { bold: true } },
          { text: "", style: { underline: true } },
          { text: "C", style: { dim: true } },
        ]),
        { cols: 2, rows: 1 },
      ),
    );

    const run = expectSingleDrawTextRun(frame);
    const blob = expectBlob(frame, run.blobIndex);
    assert.equal(blob.segments.length, 2);

    const s0 = blob.segments[0];
    const s1 = blob.segments[1];
    assert.ok(s0 !== undefined);
    assert.ok(s1 !== undefined);

    assert.equal(s0.text, "A");
    assert.equal(s1.text, "C");
    assert.equal(s0.attrs, 1);
    assert.equal(s1.attrs, 1 << 4);
    assert.equal(frame.strings.includes(""), false);
  });

  test("boundary clip keeps first two style spans exactly at width=2", () => {
    const frame = parseFrame(
      renderBytes(
        richTextVNode([
          { text: "A", style: { bold: true } },
          { text: "B", style: { underline: true } },
          { text: "C", style: { dim: true } },
        ]),
        { cols: 2, rows: 1 },
      ),
    );

    const run = expectSingleDrawTextRun(frame);
    const blob = expectBlob(frame, run.blobIndex);
    assert.equal(blob.segments.length, 2);

    const s0 = blob.segments[0];
    const s1 = blob.segments[1];
    assert.ok(s0 !== undefined);
    assert.ok(s1 !== undefined);

    assert.equal(s0.text, "A");
    assert.equal(s1.text, "B");
    assert.equal(s0.attrs, 1);
    assert.equal(s1.attrs, 1 << 2);
    assert.equal(frame.strings.includes("C"), false);
  });

  test("boundary clip inside second span keeps inserted ellipsis in second style", () => {
    const frame = parseFrame(
      renderBytes(
        richTextVNode([
          { text: "A", style: { bold: true } },
          { text: "BC", style: { underline: true } },
        ]),
        { cols: 2, rows: 1 },
      ),
    );

    const run = expectSingleDrawTextRun(frame);
    const blob = expectBlob(frame, run.blobIndex);
    assert.equal(blob.segments.length, 2);

    const s0 = blob.segments[0];
    const s1 = blob.segments[1];
    assert.ok(s0 !== undefined);
    assert.ok(s1 !== undefined);

    assert.equal(s0.text, "A");
    assert.equal(s0.attrs, 1);
    assert.equal(s1.text, "…");
    assert.equal(s1.attrs, 1 << 2);
    assert.equal(frame.strings.includes("BC"), false);
  });
});

describe("renderer text - tabs and empty text", () => {
  test("tab is not expanded: A\\tB fits width=2 and keeps raw bytes", () => {
    const frame = parseFrame(
      renderBytes(textVNode("A\tB", { textOverflow: "ellipsis", maxWidth: 2 }), {
        cols: 20,
        rows: 1,
      }),
    );

    const draw = expectSingleDrawText(frame);
    assert.equal(draw.text, "A\tB");
    assert.equal(frame.pushClips.length, 0);
    assert.equal(frame.strings.includes("A\tB"), true);
  });

  test("tab has zero measured width contribution for truncation; width=1 becomes ellipsis", () => {
    const frame = parseFrame(
      renderBytes(textVNode("A\tB", { textOverflow: "ellipsis", maxWidth: 1 }), {
        cols: 20,
        rows: 1,
      }),
    );

    assert.equal(expectSingleDrawText(frame).text, "…");
  });

  test("empty string emits no text draw commands", () => {
    const frame = parseFrame(
      renderBytes(textVNode("", { textOverflow: "ellipsis", maxWidth: 10 }), { cols: 20, rows: 1 }),
    );

    assert.equal(frame.drawTexts.length, 0);
    assert.equal(frame.drawTextRuns.length, 0);
    assert.equal(frame.strings.length, 0);
  });
});
