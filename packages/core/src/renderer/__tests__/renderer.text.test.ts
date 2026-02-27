import { assert, describe, test } from "@rezi-ui/testkit";
import {
  OP_DEF_BLOB,
  OP_DEF_STRING,
  OP_DRAW_TEXT,
  OP_DRAW_TEXT_RUN,
  OP_FREE_BLOB,
  OP_FREE_STRING,
  OP_POP_CLIP,
  OP_PUSH_CLIP,
  parseCommandHeaders,
  parseInternedStrings,
} from "../../__tests__/drawlistDecode.js";
import { type VNode, createDrawlistBuilder } from "../../index.js";
import { layout } from "../../layout/layout.js";
import { commitVNodeTree } from "../../runtime/commit.js";
import { createInstanceIdAllocator } from "../../runtime/instance.js";
import { renderToDrawlist } from "../renderToDrawlist.js";

const decoder = new TextDecoder();

function u32(bytes: Uint8Array, off: number): number {
  const dv = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  return dv.getUint32(off, true);
}

function i32(bytes: Uint8Array, off: number): number {
  const dv = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  return dv.getInt32(off, true);
}

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

type StringResources = ReadonlyMap<number, Uint8Array>;

function decodeStringSlice(
  strings: StringResources,
  stringId: number,
  byteOff: number,
  byteLen: number,
): string {
  const raw = strings.get(stringId);
  if (!raw) return "";
  const end = byteOff + byteLen;
  if (end > raw.byteLength) return "";
  return decoder.decode(raw.subarray(byteOff, end));
}

function decodeTextRunBlob(blob: Uint8Array, strings: StringResources): TextRunBlob {
  if (blob.byteLength < 4) return Object.freeze({ segments: Object.freeze([]) });
  const segCount = u32(blob, 0);
  const remaining = blob.byteLength - 4;
  const stride = segCount > 0 && remaining === segCount * 40 ? 40 : 28;
  const stringFieldOffset = stride === 40 ? 28 : 16;
  const byteOffFieldOffset = stride === 40 ? 32 : 20;
  const byteLenFieldOffset = stride === 40 ? 36 : 24;

  const segments: TextRunSegment[] = [];
  let segOff = 4;
  for (let i = 0; i < segCount; i++) {
    if (segOff + stride > blob.byteLength) break;
    const stringId = u32(blob, segOff + stringFieldOffset);
    const byteOff = u32(blob, segOff + byteOffFieldOffset);
    const byteLen = u32(blob, segOff + byteLenFieldOffset);
    segments.push(
      Object.freeze({
        fg: u32(blob, segOff + 0),
        bg: u32(blob, segOff + 4),
        attrs: u32(blob, segOff + 8),
        stringIndex: stringId > 0 ? stringId - 1 : -1,
        byteOff,
        byteLen,
        text: decodeStringSlice(strings, stringId, byteOff, byteLen),
      }),
    );
    segOff += stride;
  }

  return Object.freeze({ segments: Object.freeze(segments) });
}

function parseFrame(bytes: Uint8Array): ParsedFrame {
  const stringsById = new Map<number, Uint8Array>();
  const textRunBlobsByIndex: TextRunBlob[] = [];
  const drawTexts: DrawTextCommand[] = [];
  const drawTextRuns: DrawTextRunCommand[] = [];
  const pushClips: PushClipCommand[] = [];
  let popClipCount = 0;

  for (const cmd of parseCommandHeaders(bytes)) {
    const off = cmd.offset;
    if (cmd.opcode === OP_DEF_STRING) {
      if (cmd.size < 16) continue;
      const stringId = u32(bytes, off + 8);
      const byteLen = u32(bytes, off + 12);
      const dataStart = off + 16;
      const dataEnd = dataStart + byteLen;
      if (dataEnd <= off + cmd.size) {
        stringsById.set(stringId, Uint8Array.from(bytes.subarray(dataStart, dataEnd)));
      }
      continue;
    }
    if (cmd.opcode === OP_FREE_STRING) {
      if (cmd.size >= 12) stringsById.delete(u32(bytes, off + 8));
      continue;
    }
    if (cmd.opcode === OP_DEF_BLOB) {
      if (cmd.size < 16) continue;
      const blobId = u32(bytes, off + 8);
      const byteLen = u32(bytes, off + 12);
      const dataStart = off + 16;
      const dataEnd = dataStart + byteLen;
      if (blobId > 0 && dataEnd <= off + cmd.size) {
        const blob = Uint8Array.from(bytes.subarray(dataStart, dataEnd));
        textRunBlobsByIndex[blobId - 1] = decodeTextRunBlob(blob, stringsById);
      }
      continue;
    }
    if (cmd.opcode === OP_FREE_BLOB) {
      const blobId = u32(bytes, off + 8);
      if (blobId > 0) textRunBlobsByIndex[blobId - 1] = Object.freeze({ segments: Object.freeze([]) });
      continue;
    }

    if (cmd.opcode === OP_DRAW_TEXT) {
      assert.ok(cmd.size >= 48, "DRAW_TEXT command size");
      const stringId = u32(bytes, off + 16);
      const byteOff = u32(bytes, off + 20);
      const byteLen = u32(bytes, off + 24);
      drawTexts.push({
        x: i32(bytes, off + 8),
        y: i32(bytes, off + 12),
        stringIndex: stringId > 0 ? stringId - 1 : -1,
        byteOff,
        byteLen,
        text: decodeStringSlice(stringsById, stringId, byteOff, byteLen),
        fg: u32(bytes, off + 28),
        bg: u32(bytes, off + 32),
        attrs: u32(bytes, off + 36),
      });
      continue;
    }

    if (cmd.opcode === OP_DRAW_TEXT_RUN) {
      assert.ok(cmd.size >= 24, "DRAW_TEXT_RUN command size");
      const blobId = u32(bytes, off + 16);
      drawTextRuns.push({
        x: i32(bytes, off + 8),
        y: i32(bytes, off + 12),
        blobIndex: blobId > 0 ? blobId - 1 : -1,
      });
      continue;
    }

    if (cmd.opcode === OP_PUSH_CLIP) {
      assert.ok(cmd.size >= 24, "PUSH_CLIP command size");
      pushClips.push({
        x: i32(bytes, off + 8),
        y: i32(bytes, off + 12),
        w: i32(bytes, off + 16),
        h: i32(bytes, off + 20),
      });
      continue;
    }

    if (cmd.opcode === OP_POP_CLIP) {
      popClipCount++;
    }
  }

  return {
    strings: parseInternedStrings(bytes),
    drawTexts: Object.freeze(drawTexts),
    drawTextRuns: Object.freeze(drawTextRuns),
    pushClips: Object.freeze(pushClips),
    popClipCount,
    textRunBlobs: Object.freeze(textRunBlobsByIndex),
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

  const builder = createDrawlistBuilder();
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

  test("start truncation width=5 keeps tail", () => {
    const frame = parseFrame(
      renderBytes(textVNode("abcdef", { textOverflow: "start", maxWidth: 5 }), {
        cols: 20,
        rows: 1,
      }),
    );
    assert.equal(expectSingleDrawText(frame).text, "…cdef");
  });

  test("start truncation width=3 keeps two trailing chars", () => {
    const frame = parseFrame(
      renderBytes(textVNode("abcdef", { textOverflow: "start", maxWidth: 3 }), {
        cols: 20,
        rows: 1,
      }),
    );
    assert.equal(expectSingleDrawText(frame).text, "…ef");
  });

  test("start truncation width=1 is only ellipsis", () => {
    const frame = parseFrame(
      renderBytes(textVNode("abcdef", { textOverflow: "start", maxWidth: 1 }), {
        cols: 20,
        rows: 1,
      }),
    );
    assert.equal(expectSingleDrawText(frame).text, "…");
  });

  test("start truncation width=0 produces no text command", () => {
    const frame = parseFrame(
      renderBytes(textVNode("abcdef", { textOverflow: "start", maxWidth: 0 }), {
        cols: 20,
        rows: 1,
      }),
    );
    assert.equal(frame.drawTexts.length, 0);
    assert.equal(frame.drawTextRuns.length, 0);
    assert.equal(frame.strings.length, 0);
  });

  test("start truncation exact boundary keeps full text", () => {
    const frame = parseFrame(
      renderBytes(textVNode("abcd", { textOverflow: "start", maxWidth: 4 }), {
        cols: 20,
        rows: 1,
      }),
    );
    assert.equal(expectSingleDrawText(frame).text, "abcd");
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
