import { assert, describe, test } from "@rezi-ui/testkit";
import { createDrawlistBuilderV6 } from "../../index.js";

const OP_CLEAR = 1;
const OP_DRAW_TEXT = 3;
const OP_DRAW_TEXT_RUN = 6;
const OP_DRAW_CANVAS = 8;
const OP_DEF_STRING = 10;
const OP_FREE_STRING = 11;
const OP_DEF_BLOB = 12;

type ParsedCommand = Readonly<{ off: number; opcode: number; size: number }>;

function u32(bytes: Uint8Array, off: number): number {
  return new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength).getUint32(off, true);
}

function parseCommands(bytes: Uint8Array): readonly ParsedCommand[] {
  const cmdOffset = u32(bytes, 16);
  const cmdBytes = u32(bytes, 20);
  const cmdCount = u32(bytes, 24);
  if (cmdCount === 0) return Object.freeze([]);

  const out: ParsedCommand[] = [];
  let off = cmdOffset;
  for (let i = 0; i < cmdCount; i++) {
    const size = u32(bytes, off + 4);
    out.push(Object.freeze({ off, opcode: bytes[off] ?? 0, size }));
    off += size;
  }
  assert.equal(off, cmdOffset + cmdBytes);
  return Object.freeze(out);
}

function expectOk(result: ReturnType<ReturnType<typeof createDrawlistBuilderV6>["build"]>): Uint8Array {
  assert.equal(result.ok, true);
  if (!result.ok) throw new Error("drawlist build failed");
  return result.bytes;
}

describe("DrawlistBuilderV6 resource caching", () => {
  test("cross-frame repeat emits no DEF_* for unchanged text/blob resources", () => {
    const b = createDrawlistBuilderV6();

    const blobId0 = b.addBlob(new Uint8Array([1, 2, 3, 4]), "canvas:stable");
    assert.equal(blobId0, 1);
    if (blobId0 === null) throw new Error("blob id missing");

    b.clear();
    b.drawText(0, 0, "Hello");
    b.drawCanvas(0, 1, 1, 1, blobId0, "ascii", 1, 1);
    const frame1 = expectOk(b.build());

    const ops1 = parseCommands(frame1).map((cmd) => cmd.opcode);
    assert.equal(ops1.includes(OP_DEF_STRING), true);
    assert.equal(ops1.includes(OP_DEF_BLOB), true);
    assert.deepEqual(
      ops1.filter((op) => op === OP_DRAW_TEXT || op === OP_DRAW_CANVAS || op === OP_CLEAR),
      [OP_CLEAR, OP_DRAW_TEXT, OP_DRAW_CANVAS],
    );

    b.reset();

    const blobId1 = b.addBlob(new Uint8Array([1, 2, 3, 4]), "canvas:stable");
    assert.equal(blobId1, blobId0);
    b.clear();
    b.drawText(0, 0, "Hello");
    b.drawCanvas(0, 1, 1, 1, blobId1 ?? 0, "ascii", 1, 1);
    const frame2 = expectOk(b.build());

    const ops2 = parseCommands(frame2).map((cmd) => cmd.opcode);
    assert.equal(ops2.includes(OP_DEF_STRING), false);
    assert.equal(ops2.includes(OP_DEF_BLOB), false);
    assert.deepEqual(
      ops2.filter((op) => op === OP_DRAW_TEXT || op === OP_DRAW_CANVAS || op === OP_CLEAR),
      [OP_CLEAR, OP_DRAW_TEXT, OP_DRAW_CANVAS],
    );
  });

  test("LRU eviction emits FREE_STRING and reuses ids with redefine", () => {
    const b = createDrawlistBuilderV6({ maxStrings: 1, maxStringBytes: 64 });

    b.drawText(0, 0, "A");
    const frame1 = expectOk(b.build());
    const cmds1 = parseCommands(frame1);
    const def1 = cmds1.find((cmd) => cmd.opcode === OP_DEF_STRING);
    assert.equal(def1 !== undefined, true);
    if (!def1) throw new Error("missing DEF_STRING for frame1");
    const firstId = u32(frame1, def1.off + 8);

    b.reset();

    b.drawText(0, 0, "B");
    const frame2 = expectOk(b.build());
    const cmds2 = parseCommands(frame2);
    const free2 = cmds2.find((cmd) => cmd.opcode === OP_FREE_STRING);
    const def2 = cmds2.find((cmd) => cmd.opcode === OP_DEF_STRING);
    assert.equal(free2 !== undefined, true);
    assert.equal(def2 !== undefined, true);
    if (!free2 || !def2) throw new Error("missing FREE/DEF_STRING in frame2");

    const freeId = u32(frame2, free2.off + 8);
    const redefineId = u32(frame2, def2.off + 8);
    assert.equal(freeId, firstId);
    assert.equal(redefineId, firstId);
    assert.equal(free2.off < def2.off, true);
  });

  test("backend reset marker causes resource re-definition", () => {
    const b = createDrawlistBuilderV6();

    b.drawText(0, 0, "restart");
    const frame1 = expectOk(b.build());
    assert.equal(parseCommands(frame1).some((cmd) => cmd.opcode === OP_DEF_STRING), true);

    b.reset();

    b.drawText(0, 0, "restart");
    const frame2 = expectOk(b.build());
    assert.equal(parseCommands(frame2).some((cmd) => cmd.opcode === OP_DEF_STRING), false);

    b.reset();
    b.markEngineResourceStoreEmpty();

    b.drawText(0, 0, "restart");
    const frame3 = expectOk(b.build());
    assert.equal(parseCommands(frame3).some((cmd) => cmd.opcode === OP_DEF_STRING), true);
  });

  test("text-run blobs are persisted across frames", () => {
    const b = createDrawlistBuilderV6();

    const blob0 = b.addTextRunBlob([
      { text: "left", style: { bold: true } },
      { text: "right", style: { italic: true } },
    ]);
    assert.equal(blob0 !== null, true);
    if (blob0 === null) throw new Error("missing text-run blob");
    b.drawTextRun(0, 0, blob0);
    const frame1 = expectOk(b.build());
    const ops1 = parseCommands(frame1).map((cmd) => cmd.opcode);
    assert.equal(ops1.includes(OP_DEF_BLOB), true);
    assert.equal(ops1.includes(OP_DRAW_TEXT_RUN), true);

    b.reset();

    const blob1 = b.addTextRunBlob([
      { text: "left", style: { bold: true } },
      { text: "right", style: { italic: true } },
    ]);
    assert.equal(blob1, blob0);
    if (blob1 === null) throw new Error("missing text-run blob");
    b.drawTextRun(0, 0, blob1);
    const frame2 = expectOk(b.build());
    const ops2 = parseCommands(frame2).map((cmd) => cmd.opcode);
    assert.equal(ops2.includes(OP_DEF_BLOB), false);
    assert.equal(ops2.includes(OP_DRAW_TEXT_RUN), true);
  });
});
