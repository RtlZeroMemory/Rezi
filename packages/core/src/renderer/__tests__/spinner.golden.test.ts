import { assert, assertBytesEqual, describe, readFixture, test } from "@rezi-ui/testkit";
import { type VNode, createDrawlistBuilder } from "../../index.js";
import { layout } from "../../layout/layout.js";
import { commitVNodeTree } from "../../runtime/commit.js";
import type { FocusState } from "../../runtime/focus.js";
import { createInstanceIdAllocator } from "../../runtime/instance.js";
import { renderToDrawlist } from "../renderToDrawlist.js";

function bytesEqual(a: Uint8Array, b: Uint8Array): boolean {
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i++) {
    if (a[i] !== b[i]) return false;
  }
  return true;
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

function renderBytes(vnode: VNode, focusState: FocusState, tick: number): Uint8Array {
  const committed = commitTree(vnode);
  const lt = layoutTree(committed.vnode);

  const b = createDrawlistBuilder();
  renderToDrawlist({
    tree: committed,
    layout: lt,
    viewport: { cols: 80, rows: 25 },
    focusState,
    builder: b,
    tick,
  });
  const built = b.build();
  assert.equal(built.ok, true);
  if (!built.ok) return new Uint8Array();
  return built.bytes;
}

async function load(rel: string): Promise<Uint8Array> {
  return readFixture(`zrdl-v1/widgets/${rel}`);
}

describe("renderer - spinner animation tick", () => {
  test("spinner_tick_0.bin + spinner_tick_1.bin", async () => {
    const expected0 = await load("spinner_tick_0.bin");
    const expected1 = await load("spinner_tick_1.bin");

    const vnode: VNode = {
      kind: "spinner",
      props: { variant: "dots", label: "Loading..." },
    };

    const actual0 = renderBytes(vnode, Object.freeze({ focusedId: null }), 0);
    const actual1 = renderBytes(vnode, Object.freeze({ focusedId: null }), 1);

    assertBytesEqual(actual0, expected0, "spinner_tick_0.bin");
    assertBytesEqual(actual1, expected1, "spinner_tick_1.bin");
    assert.equal(bytesEqual(actual0, actual1), false, "tick changes bytes");
  });
});
