import { assert, assertBytesEqual, describe, readFixture, test } from "@rezi-ui/testkit";
import { type VNode, createDrawlistBuilderV1 } from "../../index.js";
import { layout } from "../../layout/layout.js";
import { commitVNodeTree } from "../../runtime/commit.js";
import type { FocusState } from "../../runtime/focus.js";
import { createInstanceIdAllocator } from "../../runtime/instance.js";
import { renderToDrawlist } from "../renderToDrawlist.js";

function u16(bytes: Uint8Array, off: number): number {
  const dv = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  return dv.getUint16(off, true);
}

function u32(bytes: Uint8Array, off: number): number {
  const dv = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  return dv.getUint32(off, true);
}

function bytesEqual(a: Uint8Array, b: Uint8Array): boolean {
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i++) {
    if (a[i] !== b[i]) return false;
  }
  return true;
}

function splitDrawlists(bundle: Uint8Array): readonly Uint8Array[] {
  const out: Uint8Array[] = [];
  let off = 0;
  while (off < bundle.length) {
    if (off + 16 > bundle.length) {
      throw new Error("splitDrawlists: truncated header");
    }
    const totalSize = u32(bundle, off + 12);
    if (totalSize <= 0 || off + totalSize > bundle.length) {
      throw new Error("splitDrawlists: invalid total_size");
    }
    out.push(bundle.subarray(off, off + totalSize));
    off += totalSize;
  }
  return Object.freeze(out);
}

function parseOpcodes(bytes: Uint8Array): readonly number[] {
  const cmdOffset = u32(bytes, 16);
  const cmdBytes = u32(bytes, 20);
  const cmdCount = u32(bytes, 24);

  const end = cmdOffset + cmdBytes;
  let off = cmdOffset;

  const out: number[] = [];
  while (off < end) {
    const opcode = u16(bytes, off);
    const size = u32(bytes, off + 4);
    out.push(opcode);
    off += size;
  }

  assert.equal(out.length, cmdCount, "cmdCount");
  return Object.freeze(out);
}

function parseInternedStrings(bytes: Uint8Array): readonly string[] {
  const spanOffset = u32(bytes, 28);
  const count = u32(bytes, 32);
  const bytesOffset = u32(bytes, 36);
  const bytesLen = u32(bytes, 40);

  if (count === 0) return Object.freeze([]);

  const tableEnd = bytesOffset + bytesLen;
  assert.ok(tableEnd <= bytes.byteLength, "string table must be in-bounds");

  const out: string[] = [];
  const decoder = new TextDecoder();

  for (let i = 0; i < count; i++) {
    const span = spanOffset + i * 8;
    const off = u32(bytes, span);
    const len = u32(bytes, span + 4);

    const start = bytesOffset + off;
    const end = start + len;
    assert.ok(end <= tableEnd, "string span must be in-bounds");
    out.push(decoder.decode(bytes.subarray(start, end)));
  }

  return Object.freeze(out);
}

function commitTree(vnode: VNode) {
  const allocator = createInstanceIdAllocator(1);
  const res = commitVNodeTree(null, vnode, { allocator });
  if (!res.ok) {
    assert.fail(`commit failed: ${res.fatal.code}: ${res.fatal.detail}`);
  }
  return res.value.root;
}

function layoutTree(vnode: VNode) {
  const res = layout(vnode, 0, 0, 80, 25, "column");
  if (!res.ok) {
    assert.fail(`layout failed: ${res.fatal.code}: ${res.fatal.detail}`);
  }
  return res.value;
}

function renderBytes(vnode: VNode, focusState: FocusState): Uint8Array {
  const committed = commitTree(vnode);
  const lt = layoutTree(committed.vnode);

  const b = createDrawlistBuilderV1();
  renderToDrawlist({
    tree: committed,
    layout: lt,
    viewport: { cols: 80, rows: 25 },
    focusState,
    builder: b,
  });
  const built = b.build();
  assert.equal(built.ok, true);
  if (!built.ok) return new Uint8Array();
  return built.bytes;
}

async function load(rel: string): Promise<Uint8Array> {
  return readFixture(`zrdl-v1/widgets/${rel}`);
}

describe("renderer - widget tree to deterministic ZRDL bytes", () => {
  test("text_in_stack.bin", async () => {
    const expected = await load("text_in_stack.bin");

    const text: VNode = { kind: "text", text: "hello", props: {} };
    const row: VNode = { kind: "row", props: {}, children: Object.freeze([text]) };
    const vnode: VNode = {
      kind: "column",
      props: { p: 1 },
      children: Object.freeze([row]),
    };

    const actual = renderBytes(vnode, Object.freeze({ focusedId: null }));
    assertBytesEqual(actual, expected, "text_in_stack.bin");

    // Also assert clip commands are present and affect output bytes.
    const ops = parseOpcodes(actual);
    assert.ok(ops.includes(4), "includes PUSH_CLIP");
    assert.ok(ops.includes(5), "includes POP_CLIP");

    const noClip = (() => {
      const b = createDrawlistBuilderV1();
      b.drawText(1, 1, "hello");
      const built = b.build();
      assert.equal(built.ok, true);
      if (!built.ok) return new Uint8Array();
      return built.bytes;
    })();
    assert.equal(bytesEqual(actual, noClip), false, "clip changes bytes");
  });

  test("text_overflow_clip.bin", async () => {
    const expected = await load("text_overflow_clip.bin");

    const vnode: VNode = {
      kind: "box",
      props: { width: 12, border: "single", p: 1 },
      children: Object.freeze([
        { kind: "text", text: "abcdefghijklmnopqrstuvwxyz", props: { variant: "code" } },
      ]),
    };

    const actual = renderBytes(vnode, Object.freeze({ focusedId: null }));
    assertBytesEqual(actual, expected, "text_overflow_clip.bin");
  });

  test("text_overflow_ellipsis.bin", async () => {
    const expected = await load("text_overflow_ellipsis.bin");

    const vnode: VNode = {
      kind: "box",
      props: { width: 12, border: "single", p: 1 },
      children: Object.freeze([
        {
          kind: "text",
          text: "abcdefghijklmnopqrstuvwxyz",
          props: { variant: "heading", textOverflow: "ellipsis" },
        },
      ]),
    };

    const actual = renderBytes(vnode, Object.freeze({ focusedId: null }));
    assertBytesEqual(actual, expected, "text_overflow_ellipsis.bin");
  });

  test("text_overflow_middle.bin", async () => {
    const expected = await load("text_overflow_middle.bin");

    const vnode: VNode = {
      kind: "box",
      props: { width: 12, border: "single", p: 1 },
      children: Object.freeze([
        {
          kind: "text",
          text: "/home/user/documents/project/src/index.ts",
          props: { variant: "caption", textOverflow: "middle" },
        },
      ]),
    };

    const actual = renderBytes(vnode, Object.freeze({ focusedId: null }));
    assertBytesEqual(actual, expected, "text_overflow_middle.bin");
  });

  test("text_overflow_max_width.bin", async () => {
    const expected = await load("text_overflow_max_width.bin");

    const vnode: VNode = {
      kind: "box",
      props: { border: "single", p: 1 },
      children: Object.freeze([
        {
          kind: "text",
          text: "this is a long line that should be constrained",
          props: { textOverflow: "ellipsis", maxWidth: 10 },
        },
      ]),
    };

    const actual = renderBytes(vnode, Object.freeze({ focusedId: null }));
    assertBytesEqual(actual, expected, "text_overflow_max_width.bin");
  });

  test("box_with_title.bin", async () => {
    const expected = await load("box_with_title.bin");

    const child: VNode = { kind: "text", text: "inside", props: {} };
    const vnode: VNode = {
      kind: "box",
      props: { border: "single", p: 1, title: "Title" },
      children: Object.freeze([child]),
    };

    const actual = renderBytes(vnode, Object.freeze({ focusedId: null }));
    assertBytesEqual(actual, expected, "box_with_title.bin");
  });

  test("button_focus_states.bin", async () => {
    const expectedBundle = await load("button_focus_states.bin");
    const expected = splitDrawlists(expectedBundle);
    assert.equal(expected.length, 3, "expected 3 concatenated drawlists");

    const enabled: VNode = { kind: "button", props: { id: "b", label: "OK" } };
    const disabled: VNode = { kind: "button", props: { id: "b", label: "OK", disabled: true } };

    const actual0 = renderBytes(enabled, Object.freeze({ focusedId: null }));
    const actual1 = renderBytes(enabled, Object.freeze({ focusedId: "b" }));
    const actual2 = renderBytes(disabled, Object.freeze({ focusedId: "b" }));

    assertBytesEqual(
      actual0,
      expected[0] ?? new Uint8Array(),
      "button_focus_states.bin: unfocused",
    );
    assertBytesEqual(actual1, expected[1] ?? new Uint8Array(), "button_focus_states.bin: focused");
    assertBytesEqual(actual2, expected[2] ?? new Uint8Array(), "button_focus_states.bin: disabled");

    assert.equal(bytesEqual(actual0, actual1), false, "focused style changes bytes");
    assert.equal(bytesEqual(actual1, actual2), false, "disabled style changes bytes");
  });

  test("input_focus_states.bin (docs/18)", async () => {
    const expected0 = await load("input_basic.bin");
    const expected1 = await load("input_focused_inverse.bin");
    const expected2 = await load("input_disabled.bin");

    const enabled: VNode = { kind: "input", props: { id: "i", value: "Hello" } };
    const disabled: VNode = { kind: "input", props: { id: "i", value: "Hello", disabled: true } };

    const actual0 = renderBytes(enabled, Object.freeze({ focusedId: null }));
    const actual1 = renderBytes(enabled, Object.freeze({ focusedId: "i" }));
    const actual2 = renderBytes(disabled, Object.freeze({ focusedId: "i" }));

    assertBytesEqual(actual0, expected0, "input_basic.bin");
    assertBytesEqual(actual1, expected1, "input_focused_inverse.bin");
    assertBytesEqual(actual2, expected2, "input_disabled.bin");

    const ops = parseOpcodes(actual0);
    assert.ok(ops.includes(4), "includes PUSH_CLIP");
    assert.ok(ops.includes(5), "includes POP_CLIP");

    assert.equal(bytesEqual(actual0, actual1), false, "focused style changes bytes");
    assert.equal(bytesEqual(actual1, actual2), false, "disabled style changes bytes");
  });

  test("divider_horizontal.bin", async () => {
    const expected = await load("divider_horizontal.bin");
    const vnode: VNode = { kind: "divider", props: {} };
    const actual = renderBytes(vnode, Object.freeze({ focusedId: null }));
    assertBytesEqual(actual, expected, "divider_horizontal.bin");
  });

  test("divider_with_label.bin", async () => {
    const expected = await load("divider_with_label.bin");
    const vnode: VNode = { kind: "divider", props: { label: "OR" } };
    const actual = renderBytes(vnode, Object.freeze({ focusedId: null }));
    assertBytesEqual(actual, expected, "divider_with_label.bin");
  });

  test("button text is width-clamped in narrow layouts", () => {
    const vnode: VNode = { kind: "button", props: { id: "narrow", label: "ABCDEFGHI" } };
    const committed = commitTree(vnode);
    const l = layout(vnode, 0, 0, 4, 1, "column");
    assert.equal(l.ok, true);
    if (!l.ok) return;

    const b = createDrawlistBuilderV1();
    renderToDrawlist({
      tree: committed,
      layout: l.value,
      viewport: { cols: 4, rows: 1 },
      focusState: Object.freeze({ focusedId: null }),
      builder: b,
    });
    const built = b.build();
    assert.equal(built.ok, true);
    if (!built.ok) return;

    const strings = parseInternedStrings(built.bytes);
    assert.equal(strings.includes("ABCDEFGHI"), false, "full label should not overflow");
    assert.equal(
      strings.includes("A…"),
      true,
      "label should be truncated to fit (px*2 symmetric padding)",
    );
  });
});
