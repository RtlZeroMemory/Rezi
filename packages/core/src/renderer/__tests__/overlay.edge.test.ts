import { assert, describe, test } from "@rezi-ui/testkit";
import { parseInternedStrings } from "../../__tests__/drawlistDecode.js";
import { type VNode, createDrawlistBuilder } from "../../index.js";
import { layout } from "../../layout/layout.js";
import { commitVNodeTree } from "../../runtime/commit.js";
import { createInstanceIdAllocator } from "../../runtime/instance.js";
import { renderToDrawlist } from "../renderToDrawlist.js";

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
