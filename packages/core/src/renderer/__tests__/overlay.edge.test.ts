import { assert, describe, test } from "@rezi-ui/testkit";
import { type VNode, createDrawlistBuilder } from "../../index.js";
import { layout } from "../../layout/layout.js";
import { commitVNodeTree } from "../../runtime/commit.js";
import { createInstanceIdAllocator } from "../../runtime/instance.js";
import { renderToDrawlist } from "../renderToDrawlist.js";

function u32(bytes: Uint8Array, off: number): number {
  const dv = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  return dv.getUint32(off, true);
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

function renderStrings(
  vnode: VNode,
  viewport: Readonly<{ cols: number; rows: number }>,
): readonly string[] {
  const allocator = createInstanceIdAllocator(1);
  const commitRes = commitVNodeTree(null, vnode, { allocator });
  assert.equal(commitRes.ok, true, "commit should succeed");
  if (!commitRes.ok) return Object.freeze([]);

  const layoutRes = layout(
    commitRes.value.root.vnode,
    0,
    0,
    viewport.cols,
    viewport.rows,
    "column",
  );
  assert.equal(layoutRes.ok, true, "layout should succeed");
  if (!layoutRes.ok) return Object.freeze([]);

  const builder = createDrawlistBuilder();
  renderToDrawlist({
    tree: commitRes.value.root,
    layout: layoutRes.value,
    viewport,
    focusState: Object.freeze({ focusedId: null }),
    builder,
  });
  const built = builder.build();
  assert.equal(built.ok, true, "drawlist build should succeed");
  if (!built.ok) return Object.freeze([]);

  return parseInternedStrings(built.bytes);
}

describe("overlay rendering edge cases", () => {
  test("command palette query uses cell-aware truncation", () => {
    const query = "漢字漢字漢字漢字漢字";
    const vnode = {
      kind: "commandPalette",
      props: {
        id: "cp",
        open: true,
        query,
        selectedIndex: 0,
        maxVisible: 5,
      },
    } as unknown as VNode;

    const strings = renderStrings(vnode, { cols: 16, rows: 8 });
    assert.equal(
      strings.includes(query),
      false,
      "full query should not be rendered when it overflows",
    );
    assert.equal(
      strings.some((s) => s.includes("…")),
      true,
      "truncated query should include an ellipsis",
    );
  });

  test("toast message truncation is deterministic for wide unicode", () => {
    const message = "🚀🚀🚀🚀🚀🚀🚀";
    const vnode = {
      kind: "toastContainer",
      props: {
        toasts: [{ id: "t0", type: "info", message }],
        position: "bottom-right",
        maxVisible: 1,
      },
    } as unknown as VNode;

    const strings = renderStrings(vnode, { cols: 12, rows: 4 });
    assert.equal(strings.includes(message), false, "full message should not overflow toast width");
    assert.equal(
      strings.some((s) => s.includes("…")),
      true,
      "overflowing toast message should be ellipsized",
    );
  });

  test("malformed toast props do not throw during render", () => {
    const malformed = {
      kind: "toastContainer",
      props: {
        toasts: "not-array",
        position: 42,
        maxVisible: 1,
      },
    } as unknown as VNode;

    const strings = renderStrings(malformed, { cols: 10, rows: 3 });
    assert.ok(Array.isArray(strings));
  });
});
